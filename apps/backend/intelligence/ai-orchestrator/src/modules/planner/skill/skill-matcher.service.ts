import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getAuthServiceUrl } from '../../../config/service-endpoints';
import { TRACE_ID_HEADER } from '../../../common/trace.util';
import { AvailableSkillDefinition, SkillMatchResult } from '../../react-engine/interfaces';
import { SkillCacheService } from './skill-cache.service';
import { getSkillMatchMinConfidence, isAcceptedSkillMatch } from './skill-match-policy';

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
  }): Promise<SkillMatchResult | null> {
    const targetSkillId =
      typeof input.context?.target_skill_id === 'string'
        ? input.context.target_skill_id.trim()
        : '';
    if (targetSkillId) {
      const targetedSkill = input.availableSkills.find((skill) => skill.skillId === targetSkillId);
      if (targetedSkill) {
        return {
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
        };
      }
    }

    // Explicit capability names and distinctive aliases are deterministic
    // routing signals. Resolve them before the platform LLM matcher so a
    // direct continuation such as "用 Bark 推送" does not pay model latency.
    const explicitMatch = this.matchExplicitSkillName(input.userInput, input.availableSkills);
    if (explicitMatch) {
      return this.buildMatchResult(
        explicitMatch.skill,
        explicitMatch.matchedKeywords,
        0.99,
        'deterministic_explicit_match'
      );
    }

    if (input.userId) {
      try {
        const response = await axios.post<{ match: SkillMatchResult | null }>(
          `${this.authServiceUrl}/skills/match`,
          {
            userInput: input.userInput,
            userId: input.userId,
            context: input.context,
          },
          {
            headers: {
              ...(input.authToken ? { Authorization: input.authToken } : {}),
              ...(input.traceId ? { [TRACE_ID_HEADER]: input.traceId } : {}),
            },
          }
        );

        if (!response.data.match) {
          return this.acceptFallbackMatch(input.userInput, input.availableSkills);
        }

        const matchedSkill = this.hydrateMatchedSkill(response.data.match, input.availableSkills);
        if (matchedSkill && isAcceptedSkillMatch(matchedSkill.confidence)) {
          if (
            matchedSkill.apiEndpoints?.runtimeMetadata?.sourceType === 'document' &&
            (!matchedSkill.executionFlow || matchedSkill.executionFlow.length === 0)
          ) {
            matchedSkill.executionFlow = ['document_render'];
          }
          return matchedSkill;
        }
        this.logger.log(
          `Rejected low-confidence skill match '${matchedSkill?.skillName || 'unknown'}' (${matchedSkill?.confidence ?? 'missing'}); minimum is ${getSkillMatchMinConfidence()}`
        );
        return this.acceptFallbackMatch(input.userInput, input.availableSkills);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        this.logger.warn(`Planner skill match API failed: ${message}`);
        return this.acceptFallbackMatch(input.userInput, input.availableSkills);
      }
    }

    return null;
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
    const normalizedInput = this.normalizeRouteText(userInput);
    if (!normalizedInput) return null;

    const ranked = availableSkills
      .map((skill) => {
        const normalizedName = this.normalizeRouteText(skill.skillName);
        const aliases = new Set([
          normalizedName,
          normalizedName.replace(/(?:工作流|服务|技能|workflow|skill)$/i, ''),
        ]);
        let score = 0;
        for (const alias of aliases) {
          if (!alias) continue;
          if (normalizedInput === alias) score = Math.max(score, 220 + alias.length);
          else if (alias.length >= 4 && normalizedInput.includes(alias)) {
            score = Math.max(score, 160 + alias.length);
          }
        }
        const matchedKeywords = skill.triggerKeywords.filter((keyword) => {
          const normalizedKeyword = this.normalizeRouteText(keyword);
          return normalizedKeyword.length >= 2 && normalizedInput.includes(normalizedKeyword);
        });
        for (const keyword of matchedKeywords) {
          const normalizedKeyword = this.normalizeRouteText(keyword);
          const distinctiveAscii =
            /^[a-z0-9]+$/.test(normalizedKeyword) && normalizedKeyword.length >= 3;
          if (distinctiveAscii) score = Math.max(score, 150 + normalizedKeyword.length);
        }
        return { skill, matchedKeywords, score };
      })
      .filter((candidate) => candidate.score >= 150)
      .sort((left, right) => right.score - left.score);

    const best = ranked[0];
    if (!best || (ranked[1] && best.score === ranked[1].score)) return null;
    return { skill: best.skill, matchedKeywords: best.matchedKeywords };
  }

  private normalizeRouteText(value: string): string {
    return value.toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '');
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
