import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getAuthServiceUrl } from '../../../config/service-endpoints';
import { TRACE_ID_HEADER } from '../../../common/trace.util';
import { AvailableSkillDefinition, SkillMatchResult } from '../../react-engine/interfaces';
import { SkillCacheService } from './skill-cache.service';

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
      typeof input.context?.target_skill_id === 'string' ? input.context.target_skill_id.trim() : '';
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

        const matchedSkill = this.hydrateMatchedSkill(response.data.match, input.availableSkills);
        if (matchedSkill?.confidence && matchedSkill.confidence > 0) {
          if (
            matchedSkill.apiEndpoints?.runtimeMetadata?.sourceType === 'document' &&
            (!matchedSkill.executionFlow || matchedSkill.executionFlow.length === 0)
          ) {
            matchedSkill.executionFlow = ['document_render'];
          }
          return matchedSkill;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        this.logger.warn(`Planner skill match API failed: ${message}`);
      }
    }

    return this.fallbackSkillMatch(input.userInput, input.availableSkills);
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

    return {
      skillId: bestSkill.skillId,
      skillName: bestSkill.skillName,
      matchedKeywords: bestSkill.triggerKeywords.filter(
        (keyword) => keyword && normalizedInput.includes(keyword.toLowerCase())
      ),
      confidence: Math.min(0.9, 0.4 + bestScore * 0.1),
      collectedParams: {},
      missingParams: bestSkill.paramsSchema.required || [],
      paramsSchema: bestSkill.paramsSchema,
      templateId: bestSkill.templateId,
      carboneSkillId: bestSkill.carboneSkillId,
      carboneTemplateId: bestSkill.carboneTemplateId,
      executionFlowTemplateId: bestSkill.executionFlowTemplateIds?.[0],
      executionFlowTemplateIds: bestSkill.executionFlowTemplateIds,
      executionType: bestSkill.executionType,
      executionFlow: bestSkill.executionFlow?.length
        ? bestSkill.executionFlow
        : bestSkill.apiEndpoints?.runtimeMetadata?.sourceType === 'document'
          ? ['document_render']
          : undefined,
      apiEndpoints: bestSkill.apiEndpoints,
      matchReason: 'keyword_fallback_match',
      goal: bestSkill.goal,
      expectedResult: bestSkill.expectedResult,
      outputParams: bestSkill.outputParams,
    };
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
