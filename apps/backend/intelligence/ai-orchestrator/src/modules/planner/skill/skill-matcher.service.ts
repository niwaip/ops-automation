import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { matchDeterministicRoutingCapability } from '@ops/backend-runtime-capability-contract';
import { getAuthServiceUrl } from '../../../config/service-endpoints';
import { TRACE_ID_HEADER } from '../../../common/trace.util';
import { AvailableSkillDefinition, SkillMatchResult } from '../../react-engine/interfaces';
import { SkillCacheService } from './skill-cache.service';
import { getSkillMatchMinConfidence, isAcceptedSkillMatch } from './skill-match-policy';

export type SkillMatchAttempt =
  | { status: 'matched'; match: SkillMatchResult }
  | { status: 'not_found'; match: null }
  | {
      status: 'unavailable';
      match: null;
      code: 'SKILL_MATCH_MODEL_UNAVAILABLE' | 'SKILL_MATCH_SERVICE_UNAVAILABLE';
      retryable: true;
      message: string;
    };

@Injectable()
export class SkillMatcherService {
  private readonly logger = new Logger(SkillMatcherService.name);
  private readonly authServiceUrl = getAuthServiceUrl();

  constructor(private readonly skillCacheService: SkillCacheService) {}

  async matchSkill(input: {
    userInput: string;
    userId?: string;
    authToken?: string;
    traceId?: string;
    availableSkills: AvailableSkillDefinition[];
    context?: Record<string, unknown>;
    modelId?: string;
  }): Promise<SkillMatchResult | null> {
    const attempt = await this.matchSkillAttempt(input);
    return attempt.match;
  }

  async matchSkillAttempt(input: {
    userInput: string;
    userId?: string;
    authToken?: string;
    traceId?: string;
    availableSkills: AvailableSkillDefinition[];
    context?: Record<string, unknown>;
    modelId?: string;
  }): Promise<SkillMatchAttempt> {
    const targetSkillId =
      typeof input.context?.target_skill_id === 'string'
        ? input.context.target_skill_id.trim()
        : '';
    if (targetSkillId) {
      const targetedSkill = input.availableSkills.find((skill) => skill.skillId === targetSkillId);
      if (targetedSkill) {
        return {
          status: 'matched',
          match: {
            skillId: targetedSkill.skillId,
            skillName: targetedSkill.skillName,
            matchedKeywords: targetedSkill.triggerKeywords.filter(
              (keyword) => keyword && input.userInput.toLowerCase().includes(keyword.toLowerCase())
            ),
            confidence: 1,
            collectedParams: {},
            missingParams: targetedSkill.paramsSchema.required || [],
            paramsSchema: targetedSkill.paramsSchema,
            templateId: targetedSkill.templateId,
            carboneSkillId: targetedSkill.carboneSkillId,
            carboneTemplateId: targetedSkill.carboneTemplateId,
            executionFlowTemplateId: targetedSkill.executionFlowTemplateIds?.[0],
            executionFlowTemplateIds: targetedSkill.executionFlowTemplateIds,
            executionFlow: targetedSkill.executionFlow?.length
              ? targetedSkill.executionFlow
              : targetedSkill.apiEndpoints?.runtimeMetadata?.sourceType === 'document'
                ? ['document_render']
                : undefined,
            apiEndpoints: targetedSkill.apiEndpoints,
            matchReason: 'target_skill_context',
            goal: targetedSkill.goal,
            expectedResult: targetedSkill.expectedResult,
            outputParams: targetedSkill.outputParams,
          },
        };
      }
    }

    // Contract-declared and safely-derived routing signals are resolved before
    // model routing. This is the normal fast path for reproducible requests.
    const explicitMatch = this.matchExplicitSkillName(input.userInput, input.availableSkills);
    if (explicitMatch) {
      return {
        status: 'matched',
        match: this.buildMatchResult(
          explicitMatch.skill,
          explicitMatch.matchedKeywords,
          0.99,
          'deterministic_routing_signal'
        ),
      };
    }

    if (input.userId) {
      try {
        const response = await axios.post<{ match: SkillMatchResult | null }>(
          `${this.authServiceUrl}/skills/match`,
          {
            userInput: input.userInput,
            userId: input.userId,
            context: input.context,
            modelId: input.modelId,
          },
          {
            headers: {
              ...(input.authToken ? { Authorization: input.authToken } : {}),
              ...(input.traceId ? { [TRACE_ID_HEADER]: input.traceId } : {}),
            },
          }
        );

        if (!response.data.match) {
          return this.toMatchAttempt(
            this.acceptFallbackMatch(input.userInput, input.availableSkills)
          );
        }

        const matchedSkill = this.hydrateMatchedSkill(response.data.match, input.availableSkills);
        if (matchedSkill && isAcceptedSkillMatch(matchedSkill.confidence)) {
          if (
            matchedSkill.apiEndpoints?.runtimeMetadata?.sourceType === 'document' &&
            (!matchedSkill.executionFlow || matchedSkill.executionFlow.length === 0)
          ) {
            matchedSkill.executionFlow = ['document_render'];
          }
          return { status: 'matched', match: matchedSkill };
        }
        this.logger.log(
          `Rejected low-confidence skill match '${matchedSkill?.skillName || 'unknown'}' (${matchedSkill?.confidence ?? 'missing'}); minimum is ${getSkillMatchMinConfidence()}`
        );
        return this.toMatchAttempt(
          this.acceptFallbackMatch(input.userInput, input.availableSkills)
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        this.logger.warn(`Planner skill match API failed: ${message}`);
        const deterministic = this.acceptFallbackMatch(input.userInput, input.availableSkills);
        const unavailableCode = this.resolveUnavailableCode(error);
        return deterministic
          ? { status: 'matched', match: deterministic }
          : {
              status: 'unavailable',
              match: null,
              code: unavailableCode,
              retryable: true,
              message:
                unavailableCode === 'SKILL_MATCH_MODEL_UNAVAILABLE'
                  ? '能力匹配模型暂时不可用，请稍后重试。'
                  : '能力匹配服务暂时不可用，请稍后重试。',
            };
      }
    }

    return { status: 'not_found', match: null };
  }

  fallbackSkillMatch(
    userInput: string,
    availableSkills: AvailableSkillDefinition[]
  ): SkillMatchResult | null {
    const normalizedInput = userInput.toLowerCase();
    let bestScore = 0;
    let bestSkill: AvailableSkillDefinition | undefined;

    for (const skill of availableSkills) {
      const keywordHits = skill.triggerKeywords.filter(
        (keyword) => keyword && normalizedInput.includes(keyword.toLowerCase())
      );
      const descriptionHit = skill.description
        ? normalizedInput.includes(skill.description.toLowerCase())
        : false;
      const score = keywordHits.length + (descriptionHit ? 0.5 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestSkill = skill;
      }
    }

    if (!bestSkill || bestScore <= 0) {
      return null;
    }

    return this.buildMatchResult(
      bestSkill,
      bestSkill.triggerKeywords.filter(
        (keyword) => keyword && normalizedInput.includes(keyword.toLowerCase())
      ),
      Math.min(0.95, 0.8 + bestScore * 0.1),
      'keyword_fallback_match'
    );
  }

  private matchExplicitSkillName(
    userInput: string,
    availableSkills: AvailableSkillDefinition[]
  ): { skill: AvailableSkillDefinition; matchedKeywords: string[] } | null {
    const match = matchDeterministicRoutingCapability(
      userInput,
      availableSkills.map((skill) => ({
        id: skill.skillId,
        name: skill.skillName,
        aliases: skill.apiEndpoints?.runtimeMetadata?.routingAliases,
        triggerKeywords: skill.triggerKeywords,
        skill,
      }))
    );
    return match ? { skill: match.capability.skill, matchedKeywords: match.matchedSignals } : null;
  }

  private buildMatchResult(
    skill: AvailableSkillDefinition,
    matchedKeywords: string[],
    confidence: number,
    matchReason: string
  ): SkillMatchResult {
    return {
      skillId: skill.skillId,
      skillName: skill.skillName,
      matchedKeywords,
      confidence,
      collectedParams: {},
      missingParams: skill.paramsSchema.required || [],
      paramsSchema: skill.paramsSchema,
      templateId: skill.templateId,
      carboneSkillId: skill.carboneSkillId,
      carboneTemplateId: skill.carboneTemplateId,
      executionFlowTemplateId: skill.executionFlowTemplateIds?.[0],
      executionFlowTemplateIds: skill.executionFlowTemplateIds,
      executionType: skill.executionType,
      executionFlow: skill.executionFlow?.length
        ? skill.executionFlow
        : skill.apiEndpoints?.runtimeMetadata?.sourceType === 'document'
          ? ['document_render']
          : undefined,
      apiEndpoints: skill.apiEndpoints,
      matchReason,
      goal: skill.goal,
      expectedResult: skill.expectedResult,
      outputParams: skill.outputParams,
    };
  }

  private acceptFallbackMatch(
    userInput: string,
    availableSkills: AvailableSkillDefinition[]
  ): SkillMatchResult | null {
    const fallback = this.fallbackSkillMatch(userInput, availableSkills);
    return fallback && isAcceptedSkillMatch(fallback.confidence) ? fallback : null;
  }

  private toMatchAttempt(match: SkillMatchResult | null): SkillMatchAttempt {
    return match ? { status: 'matched', match } : { status: 'not_found', match: null };
  }

  private resolveUnavailableCode(
    error: unknown
  ): 'SKILL_MATCH_MODEL_UNAVAILABLE' | 'SKILL_MATCH_SERVICE_UNAVAILABLE' {
    if (!axios.isAxiosError(error)) return 'SKILL_MATCH_SERVICE_UNAVAILABLE';
    const data = error.response?.data;
    return data &&
      typeof data === 'object' &&
      'code' in data &&
      data.code === 'SKILL_MATCH_MODEL_UNAVAILABLE'
      ? 'SKILL_MATCH_MODEL_UNAVAILABLE'
      : 'SKILL_MATCH_SERVICE_UNAVAILABLE';
  }

  hydrateMatchedSkill(
    matchedSkill: SkillMatchResult | null | undefined,
    availableSkills: AvailableSkillDefinition[]
  ): SkillMatchResult | null {
    if (!matchedSkill) {
      return null;
    }

    const sourceSkill = availableSkills.find((skill) => skill.skillId === matchedSkill.skillId);
    if (!sourceSkill) {
      return matchedSkill;
    }

    const resolvedApiEndpoints = matchedSkill.apiEndpoints || sourceSkill.apiEndpoints;
    const normalizedParamsSchema =
      Object.keys(matchedSkill.paramsSchema?.properties || {}).length > 0
        ? this.skillCacheService.normalizeParamsSchema(matchedSkill.paramsSchema)
        : sourceSkill.paramsSchema;

    return {
      ...matchedSkill,
      paramsSchema: this.skillCacheService.hydrateParamsSchemaRenderPaths(
        normalizedParamsSchema,
        (resolvedApiEndpoints?.runtimeMetadata || {}) as Record<string, unknown>
      ),
      templateId: matchedSkill.templateId || sourceSkill.templateId,
      carboneSkillId: matchedSkill.carboneSkillId || sourceSkill.carboneSkillId,
      carboneTemplateId: matchedSkill.carboneTemplateId || sourceSkill.carboneTemplateId,
      executionFlowTemplateIds: matchedSkill.executionFlowTemplateIds?.length
        ? matchedSkill.executionFlowTemplateIds
        : sourceSkill.executionFlowTemplateIds,
      executionType: matchedSkill.executionType || sourceSkill.executionType,
      executionFlow: this.skillCacheService.normalizeExecutionFlow(
        matchedSkill.executionFlow?.length ? matchedSkill.executionFlow : sourceSkill.executionFlow,
        matchedSkill.apiEndpoints?.runtimeMetadata?.sourceType ||
          sourceSkill.apiEndpoints?.runtimeMetadata?.sourceType
      ),
      apiEndpoints: resolvedApiEndpoints,
      goal: matchedSkill.goal || sourceSkill.goal,
      expectedResult: matchedSkill.expectedResult || sourceSkill.expectedResult,
      outputParams: matchedSkill.outputParams || sourceSkill.outputParams,
    };
  }
}
