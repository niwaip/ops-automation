import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { getAuthServiceUrl } from '../../config/service-endpoints';
import {
  GeneratePlanDTO,
  PlanDraftDTO,
  PlanSemanticDTO,
  PlanSkillMatchDTO,
  PlanStepDTO,
  RecognizeParamsDTO,
  RequiredInputDTO,
  SemanticGroupedMissingDTO,
  LLMUsage,
  RecognizeParamsResponseDTO,
} from '../../interfaces';
import { TRACE_ID_HEADER } from '../../common/trace.util';
import { buildDocumentGuideContext } from '../../common/document-guide';
import { resolveFriendlyInputDisplayName } from '../../common/input-label';
import { isPlaceholderTextValue } from '../../common/placeholder-value';
import { RecognizerService } from '../recognizer/recognizer.service';
import { AvailableSkillDefinition, SkillMatchResult } from '../react-engine/interfaces';

type SkillListResponse = {
  skills?: Array<Record<string, unknown>>;
};

type ExecutionFlowTemplateResponse = {
  id?: string;
  paramsSchema?: {
    properties?: Record<string, unknown>;
    required?: string[];
  };
};

type SkillCacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const DOCUMENT_SEMANTIC_ENABLED = (process.env.DOCUMENT_SEMANTIC_SUBAGENT_ENABLED || 'true').toLowerCase() !== 'false';
const DOCUMENT_COMPLEX_PARAM_THRESHOLD = Number(process.env.DOCUMENT_SEMANTIC_PARAM_THRESHOLD || 8);
const DOCUMENT_COMPLEX_MISSING_THRESHOLD = Number(process.env.DOCUMENT_SEMANTIC_MISSING_THRESHOLD || 4);
const DOCUMENT_COMPLEX_ARRAY_GROUP_THRESHOLD = Number(process.env.DOCUMENT_SEMANTIC_ARRAY_GROUP_THRESHOLD || 2);
const RECOGNIZED_FIELD_LOW_CONFIDENCE_THRESHOLD = Number(process.env.PARAM_FIELD_LOW_CONFIDENCE_THRESHOLD || 0.7);
const RECOGNITION_RESULT_LOW_CONFIDENCE_THRESHOLD = Number(process.env.PARAM_RESULT_LOW_CONFIDENCE_THRESHOLD || 0.45);
const PLANNER_SKILL_CACHE_TTL_MS = Number(process.env.PLANNER_SKILL_CACHE_TTL_MS || 60_000);
const BUSINESS_GROUP_LABELS: Record<string, string> = {
  items: '标的清单',
  deliveryItems: '交付计划',
  paymentSchedule: '付款计划',
};

@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);
  private readonly authServiceUrl = getAuthServiceUrl();
  private readonly availableSkillsCache = new Map<string, SkillCacheEntry<AvailableSkillDefinition[]>>();
  private readonly skillByIdCache = new Map<string, SkillCacheEntry<AvailableSkillDefinition | null>>();
  private readonly flowSchemaCache = new Map<string, SkillCacheEntry<ExecutionFlowTemplateResponse['paramsSchema'] | undefined>>();

  constructor(private readonly recognizerService: RecognizerService) {}

  async generatePlan(input: {
    request: GeneratePlanDTO;
    userId?: string;
    authToken?: string;
    traceId?: string;
  }): Promise<PlanDraftDTO> {
    const objective = input.request.user_input.trim();
    const targetSkillId = typeof input.request.context?.target_skill_id === 'string'
      ? input.request.context.target_skill_id.trim()
      : '';
    const availableSkills = await this.loadAvailableSkills(input.authToken, input.traceId, targetSkillId || undefined);
    const matchedSkill = await this.matchSkill(
      objective,
      input.userId || input.request.user_id,
      input.authToken,
      input.traceId,
      availableSkills,
      input.request.context,
    );

    if (!matchedSkill) {
      return this.buildFallbackPlan(objective, availableSkills.length > 0);
    }

    const isDocumentSkill = this.isDocumentTask(matchedSkill);
    const recognized = await this.recognizerService.recognizeParams({
      template_id: matchedSkill.skillId,
      user_input: objective,
      modelId: input.request.modelId,
      context: input.request.context,
      guide_context: buildDocumentGuideContext({
        enabled: isDocumentSkill,
        skillName: matchedSkill.skillName,
        description: matchedSkill.matchReason || matchedSkill.skillName,
        goal: matchedSkill.goal,
        expectedResult: matchedSkill.expectedResult,
        outputParams: matchedSkill.outputParams,
        paramsSchema: matchedSkill.paramsSchema,
        runtimeMetadata: matchedSkill.apiEndpoints?.runtimeMetadata,
      }),
      params_schema: {
        properties: this.buildRecognizerParamsSchemaProperties(matchedSkill.paramsSchema?.properties || {}),
        required: matchedSkill.paramsSchema?.required || [],
      },
    });

    // 累积消耗
    const totalUsage = this.sumUsage(matchedSkill.usage, recognized.usage);

    const semanticContext = this.buildDocumentSemanticContext(
      matchedSkill,
      this.buildRequiredInputs(matchedSkill, recognized),
    );
    const requiredInputs = semanticContext.requiredInputs;
    const steps = this.buildPlanSteps(matchedSkill, requiredInputs);
    const missingInputs = requiredInputs.filter((item) => item.missing);
    // Missing required inputs should be handled by waiting_input, not approval.
    const requiresHumanReview = false;
    const baseSummary = missingInputs.length > 0
      ? `已识别技能 ${matchedSkill.skillName}，但仍缺少 ${missingInputs.length} 个关键输入。`
      : `已识别技能 ${matchedSkill.skillName}，可以按计划进入执行。`;
    const summary = semanticContext.semantic?.summary
      ? `${baseSummary} ${semanticContext.semantic.summary}`
      : baseSummary;

    return {
      plan_id: uuidv4(),
      planner_mode: 'skill',
      objective,
      summary,
      skill_match: this.toPlanSkillMatch(matchedSkill),
      steps,
      required_inputs: requiredInputs,
      semantic: semanticContext.semantic,
      usage: totalUsage,
      risk_summary: {
        level: missingInputs.length > 0 ? 'medium' : 'low',
        requires_human_review: requiresHumanReview,
        items: this.buildRiskItems(matchedSkill, missingInputs.length),
      },
      metadata: {
        confidence: matchedSkill.confidence,
        expected_result: matchedSkill.expectedResult,
        goal: matchedSkill.goal,
        debug: {
          llmCalls: [
            ...(matchedSkill.debug?.llmCalls || []),
            ...(recognized.debug?.llmCalls || []),
          ],
          notes: [
            ...(matchedSkill.debug?.notes || []),
            ...(recognized.debug?.notes || []),
          ],
          semanticDebug: semanticContext.debug,
        },
      },
    };
  }

  private async loadAvailableSkills(
    authToken?: string,
    traceId?: string,
    targetSkillId?: string,
  ): Promise<AvailableSkillDefinition[]> {
    if (targetSkillId) {
      const skill = await this.loadSkillById(targetSkillId, authToken, traceId);
      if (skill) {
        return [skill];
      }
      this.logger.warn(`Target skill ${targetSkillId} could not be loaded directly, falling back to full skill list`);
    }

    const cacheKey = this.buildAuthCacheKey(authToken);
    const cachedSkills = this.getCacheValue(this.availableSkillsCache, cacheKey);
    if (cachedSkills) {
      return cachedSkills;
    }

    try {
      const headers = this.buildRequestHeaders(authToken, traceId);
      const response = await axios.get<SkillListResponse>(`${this.authServiceUrl}/skills`, { headers });

      const rawSkills = Array.isArray(response.data.skills) ? response.data.skills : [];
      const mappedSkills = rawSkills
        .map((item) => this.mapRawSkillDefinition(item))
        .filter((item) => item.skillId && item.skillName);

      const enrichedSkills = await Promise.all(
        mappedSkills.map((skill) => this.enrichSkillParamsSchema(skill, headers)),
      );
      this.setCacheValue(this.availableSkillsCache, cacheKey, enrichedSkills);
      enrichedSkills.forEach((skill) => {
        this.setCacheValue(this.skillByIdCache, this.buildSkillCacheKey(cacheKey, skill.skillId), skill);
      });
      return enrichedSkills;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`Failed to load available skills for planner: ${message}`);
      return [];
    }
  }

  private async loadSkillById(
    skillId: string,
    authToken?: string,
    traceId?: string,
  ): Promise<AvailableSkillDefinition | null> {
    const trimmedSkillId = skillId.trim();
    if (!trimmedSkillId) {
      return null;
    }

    const authCacheKey = this.buildAuthCacheKey(authToken);
    const cachedSkill = this.getCacheValue(
      this.skillByIdCache,
      this.buildSkillCacheKey(authCacheKey, trimmedSkillId),
    );
    if (cachedSkill !== undefined) {
      return cachedSkill;
    }

    const headers = this.buildRequestHeaders(authToken, traceId);
    try {
      const response = await axios.get<Record<string, unknown>>(
        `${this.authServiceUrl}/skills/${trimmedSkillId}`,
        { headers },
      );
      const mappedSkill = this.mapRawSkillDefinition(response.data);
      if (!mappedSkill.skillId || !mappedSkill.skillName) {
        this.setCacheValue(
          this.skillByIdCache,
          this.buildSkillCacheKey(authCacheKey, trimmedSkillId),
          null,
        );
        return null;
      }

      const enrichedSkill = await this.enrichSkillParamsSchema(mappedSkill, headers);
      this.setCacheValue(
        this.skillByIdCache,
        this.buildSkillCacheKey(authCacheKey, trimmedSkillId),
        enrichedSkill,
      );
      return enrichedSkill;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`Failed to load planner target skill ${trimmedSkillId}: ${message}`);
      return null;
    }
  }

  private mapRawSkillDefinition(item: Record<string, unknown>): AvailableSkillDefinition {
    const apiEndpoints = (typeof item.apiEndpoints === 'object' && item.apiEndpoints)
      ? item.apiEndpoints as AvailableSkillDefinition['apiEndpoints']
      : undefined;
    const sourceTemplate = apiEndpoints?.runtimeMetadata?.sourceTemplate;
    const sourceType = apiEndpoints?.runtimeMetadata?.sourceType;
    const executionType = this.resolveExecutionType(
      typeof item.executionType === 'string' ? item.executionType : undefined,
      sourceType,
    );

    return {
      skillId: String(item.id || item.skillId || ''),
      skillName: String(item.name || item.skillName || ''),
      description: typeof item.description === 'string' ? item.description : undefined,
      triggerKeywords: Array.isArray(item.triggerKeywords) ? item.triggerKeywords.map(String) : [],
      paramsSchema: this.normalizeParamsSchema(
        (item.paramsSchema as AvailableSkillDefinition['paramsSchema']) || { properties: {}, required: [] },
      ),
      executionType,
      templateId:
        typeof item.templateId === 'string'
          ? item.templateId
          : typeof sourceTemplate?.templateId === 'string'
            ? sourceTemplate.templateId
            : undefined,
      carboneTemplateId:
        typeof item.carboneTemplateId === 'string'
          ? item.carboneTemplateId
          : typeof sourceTemplate?.templateId === 'string'
            ? sourceTemplate.templateId
            : undefined,
      carboneSkillId:
        typeof item.carboneSkillId === 'string'
          ? item.carboneSkillId
          : typeof sourceTemplate?.skillId === 'string'
            ? sourceTemplate.skillId
            : undefined,
      executionFlowTemplateIds: Array.isArray(item.executionFlowTemplateIds) ? item.executionFlowTemplateIds.map(String) : [],
      executionFlow: Array.isArray(item.executionFlow)
        ? item.executionFlow
            .map((step) => (step && typeof step === 'object'
              ? String((step as Record<string, unknown>).name || (step as Record<string, unknown>).type || '')
              : String(step || '')))
            .filter(Boolean)
        : [],
      apiEndpoints,
      goal: typeof item.goal === 'string' ? item.goal : undefined,
      expectedResult: typeof item.expectedResult === 'string' ? item.expectedResult : undefined,
      outputParams: typeof item.outputParams === 'object' && item.outputParams
        ? item.outputParams as Record<string, unknown>
        : undefined,
    };
  }

  private async enrichSkillParamsSchema(
    skill: AvailableSkillDefinition,
    headers: Record<string, string>,
  ): Promise<AvailableSkillDefinition> {
    const templateIds = Array.isArray(skill.executionFlowTemplateIds)
      ? skill.executionFlowTemplateIds.filter(Boolean)
      : [];

    if (templateIds.length === 0) {
      return {
        ...skill,
        paramsSchema: this.normalizeParamsSchema(skill.paramsSchema),
      };
    }

    const templateSchemas = await Promise.all(
      templateIds.map(async (templateId) => {
        const cachedSchema = this.getCacheValue(
          this.flowSchemaCache,
          this.buildFlowSchemaCacheKey(headers.Authorization, templateId),
        );
        if (cachedSchema !== undefined) {
          return cachedSchema;
        }

        try {
          const response = await axios.get<ExecutionFlowTemplateResponse>(
            `${this.authServiceUrl}/flows/${templateId}`,
            { headers },
          );
          const paramsSchema = response.data.paramsSchema;
          this.setCacheValue(
            this.flowSchemaCache,
            this.buildFlowSchemaCacheKey(headers.Authorization, templateId),
            paramsSchema,
          );
          return paramsSchema;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown';
          this.logger.warn(`Failed to load execution flow template ${templateId}: ${message}`);
          return undefined;
        }
      }),
    );

    return {
      ...skill,
      paramsSchema: this.mergeParamsSchemas(skill.paramsSchema, ...templateSchemas),
    };
  }

  private mergeParamsSchemas(
    ...schemas: Array<AvailableSkillDefinition['paramsSchema'] | ExecutionFlowTemplateResponse['paramsSchema'] | undefined>
  ): AvailableSkillDefinition['paramsSchema'] {
    const mergedProperties: AvailableSkillDefinition['paramsSchema']['properties'] = {};
    const mergedRequired = new Set<string>();

    schemas
      .filter((schema): schema is NonNullable<typeof schema> => Boolean(schema))
      .map((schema) => this.normalizeParamsSchema(schema as AvailableSkillDefinition['paramsSchema']))
      .forEach((schema) => {
        Object.entries(schema.properties || {}).forEach(([name, property]) => {
          const existing = mergedProperties[name];
          mergedProperties[name] = existing
            ? { ...property, ...existing }
            : property;
        });

        (schema.required || []).forEach((name) => mergedRequired.add(name));
      });

    Object.entries(mergedProperties).forEach(([name, property]) => {
      if (property.required) {
        mergedRequired.add(name);
      }
      mergedProperties[name] = {
        ...property,
        required: mergedRequired.has(name),
      };
    });

    return {
      properties: mergedProperties,
      required: Array.from(mergedRequired),
    };
  }

  private normalizeParamsSchema(
    schema?: Partial<AvailableSkillDefinition['paramsSchema']>,
  ): AvailableSkillDefinition['paramsSchema'] {
    const properties = Object.fromEntries(
      Object.entries(schema?.properties || {}).map(([name, value]) => {
        const property = value || {};
        return [
          name,
          {
            type: (property.type || 'string') as AvailableSkillDefinition['paramsSchema']['properties'][string]['type'],
            description: property.description || name,
            required: Boolean(property.required),
            ...(property.default !== undefined ? { default: property.default } : {}),
            ...(property.extractionPrompt !== undefined ? { extractionPrompt: property.extractionPrompt } : {}),
            ...(typeof property.semanticRole === 'string' ? { semanticRole: property.semanticRole } : {}),
            ...(Array.isArray(property.extractionHints) ? { extractionHints: property.extractionHints } : {}),
            ...(typeof property.displayName === 'string' ? { displayName: property.displayName } : {}),
            ...(typeof property.groupLabel === 'string' ? { groupLabel: property.groupLabel } : {}),
            ...(typeof property.previewBlocking === 'boolean' ? { previewBlocking: property.previewBlocking } : {}),
            ...(typeof property.confirmationThreshold === 'number'
              ? { confirmationThreshold: property.confirmationThreshold }
              : {}),
          },
        ];
      }),
    );

    const required = Array.isArray(schema?.required)
      ? schema.required.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [];

    required.forEach((name) => {
      if (properties[name]) {
        properties[name] = {
          ...properties[name],
          required: true,
        };
      }
    });

    return { properties, required };
  }

  private async matchSkill(
    userInput: string,
    userId: string | undefined,
    authToken: string | undefined,
    traceId: string | undefined,
    availableSkills: AvailableSkillDefinition[],
    context?: Record<string, unknown>,
  ): Promise<SkillMatchResult | null> {
    const targetSkillId = typeof context?.target_skill_id === 'string'
      ? context.target_skill_id.trim()
      : '';
    if (targetSkillId) {
      const targetedSkill = availableSkills.find((skill) => skill.skillId === targetSkillId);
      if (targetedSkill) {
        return {
          skillId: targetedSkill.skillId,
          skillName: targetedSkill.skillName,
          matchedKeywords: targetedSkill.triggerKeywords.filter((keyword) =>
            keyword && userInput.toLowerCase().includes(keyword.toLowerCase()),
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
              ? ['generate_parameters', 'document_render']
              : undefined,
          apiEndpoints: targetedSkill.apiEndpoints,
          matchReason: 'target_skill_context',
          goal: targetedSkill.goal,
          expectedResult: targetedSkill.expectedResult,
          outputParams: targetedSkill.outputParams,
        };
      }
    }

    if (userId) {
      try {
        const response = await axios.post<{ match: SkillMatchResult | null }>(
          `${this.authServiceUrl}/skills/match`,
          { userInput, userId, context },
          {
            headers: {
              ...(authToken ? { Authorization: authToken } : {}),
              ...(traceId ? { [TRACE_ID_HEADER]: traceId } : {}),
            },
          },
        );

        const matchedSkill = this.hydrateMatchedSkill(response.data.match, availableSkills);
        if (matchedSkill?.confidence && matchedSkill.confidence > 0) {
          if (matchedSkill.apiEndpoints?.runtimeMetadata?.sourceType === 'document' && (!matchedSkill.executionFlow || matchedSkill.executionFlow.length === 0)) {
            matchedSkill.executionFlow = ['generate_parameters', 'document_render'];
          }
          return matchedSkill;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        this.logger.warn(`Planner skill match API failed: ${message}`);
      }
    }

    return this.fallbackSkillMatch(userInput, availableSkills);
  }

  private fallbackSkillMatch(
    userInput: string,
    availableSkills: AvailableSkillDefinition[],
  ): SkillMatchResult | null {
    const normalizedInput = userInput.toLowerCase();
    let bestScore = 0;
    let bestSkill: AvailableSkillDefinition | undefined;

    for (const skill of availableSkills) {
      const keywordHits = skill.triggerKeywords.filter((keyword) =>
        keyword && normalizedInput.includes(keyword.toLowerCase()),
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
      matchedKeywords: bestSkill.triggerKeywords.filter((keyword) =>
        keyword && normalizedInput.includes(keyword.toLowerCase()),
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
          ? ['generate_parameters', 'document_render']
          : undefined,
      apiEndpoints: bestSkill.apiEndpoints,
      matchReason: 'keyword_fallback_match',
      goal: bestSkill.goal,
      expectedResult: bestSkill.expectedResult,
      outputParams: bestSkill.outputParams,
    };
  }

  private sumUsage(...usages: (LLMUsage | undefined)[]): LLMUsage | undefined {
    const validUsages = usages.filter((u): u is LLMUsage => !!u);
    if (validUsages.length === 0) return undefined;

    const result: LLMUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    for (const usage of validUsages) {
      result.prompt_tokens += usage.prompt_tokens;
      result.completion_tokens += usage.completion_tokens;
      result.total_tokens += usage.total_tokens;
      if (usage.completion_tokens_details?.reasoning_tokens) {
        if (!result.completion_tokens_details) {
          result.completion_tokens_details = { reasoning_tokens: 0 };
        }
        result.completion_tokens_details.reasoning_tokens = (result.completion_tokens_details.reasoning_tokens || 0) + usage.completion_tokens_details.reasoning_tokens;
      }
    }

    return result;
  }

  private buildFallbackPlan(objective: string, hasVisibleSkills: boolean): PlanDraftDTO {
    return {
      plan_id: uuidv4(),
      planner_mode: 'fallback',
      objective,
      summary: hasVisibleSkills
        ? '暂未匹配到明确技能，建议先补充任务目标或关键业务对象。'
        : '当前无法读取可用技能列表，建议先确认登录态或服务连通性。',
      steps: [
        {
          id: 'clarify-goal',
          title: 'Clarify request',
          description: '补充更明确的业务目标、对象和期望产出。',
          kind: 'human_input',
          status: 'planned',
        },
      ],
      required_inputs: [
        {
          name: 'user_input',
          type: 'string',
          description: '更明确的任务描述',
          required: true,
          missing: false,
          source: 'user_input',
          value: objective,
        },
      ],
      risk_summary: {
        level: 'medium',
        requires_human_review: true,
        items: [
          hasVisibleSkills ? 'no_skill_match' : 'skills_unavailable',
          'planner_needs_clarification',
        ],
      },
      metadata: {
        has_visible_skills: hasVisibleSkills,
        debug: {
          notes: ['当前为 fallback 规划结果，没有额外的上游 LLM request/response 可展示。'],
        },
      },
    };
  }

  private buildRequiredInputs(
    matchedSkill: SkillMatchResult,
    recognized: RecognizeParamsResponseDTO,
  ): RequiredInputDTO[] {
    const recognizedParams = recognized.params || {};
    const uncertainFields = new Set(recognized.uncertain_fields || []);
    const fieldConfidences = recognized.field_confidences || {};
    const overallLowConfidence = (recognized.confidence || 0) < RECOGNITION_RESULT_LOW_CONFIDENCE_THRESHOLD;
    const arrayGroupTargetCounts = this.buildArrayGroupTargetCounts(
      matchedSkill.paramsSchema?.properties || {},
      recognizedParams,
    );

    return Object.entries(matchedSkill.paramsSchema?.properties || {}).map(([name, schema]) => {
      const schemaMeta = schema as unknown as Record<string, unknown>;
      const required = Boolean(schema.required || matchedSkill.paramsSchema.required?.includes(name));
      const rawHasValue = Object.prototype.hasOwnProperty.call(recognizedParams, name);
      const rawValue = rawHasValue ? recognizedParams[name] : undefined;
      const normalizedRawValue = rawHasValue ? this.normalizeMeaningfulInputValue(rawValue) : undefined;
      const hasValue = this.hasMeaningfulRequiredInputValue(normalizedRawValue);
      const normalizedDefaultValue = !required
        ? this.normalizeOptionalDefaultValue(schema.default)
        : undefined;
      const canUseDefault = !required && !hasValue && normalizedDefaultValue !== undefined;
      const value = hasValue ? normalizedRawValue : canUseDefault ? normalizedDefaultValue : undefined;
      const arrayGroupKey = this.extractArrayGroupKey(name, schema.type);
      const groupTargetCount = arrayGroupKey ? (arrayGroupTargetCounts[arrayGroupKey] || 0) : 0;
      const valueItemCount = this.countMeaningfulRequiredInputItems(value);
      const hasPartialArrayGroupValue = Boolean(
        required
        && arrayGroupKey
        && groupTargetCount > 1
        && valueItemCount > 0
        && valueItemCount < groupTargetCount,
      );
      const fieldConfidence = typeof fieldConfidences[name] === 'number'
        ? Math.max(0, Math.min(1, fieldConfidences[name] as number))
        : undefined;
      const confirmationThreshold = typeof schemaMeta.confirmationThreshold === 'number'
        && Number.isFinite(schemaMeta.confirmationThreshold)
        ? Math.max(0, Math.min(1, schemaMeta.confirmationThreshold))
        : RECOGNIZED_FIELD_LOW_CONFIDENCE_THRESHOLD;
      const previewBlocking = typeof schemaMeta.previewBlocking === 'boolean'
        ? Boolean(schemaMeta.previewBlocking)
        : undefined;
      const shouldBlockOnConfirmation = required || previewBlocking === true;
      const needsConfirmation = hasValue && shouldBlockOnConfirmation && (
        uncertainFields.has(name)
        || (fieldConfidence !== undefined && fieldConfidence < confirmationThreshold)
        || (required && overallLowConfidence)
      );
      const isValueMissing = !this.hasMeaningfulRequiredInputValue(value) || hasPartialArrayGroupValue;
      const isBlockingMissing = (required && isValueMissing) || needsConfirmation;
      const missingReason = isBlockingMissing && needsConfirmation
        ? overallLowConfidence && (fieldConfidence === undefined || fieldConfidence >= RECOGNIZED_FIELD_LOW_CONFIDENCE_THRESHOLD)
          ? 'overall_low_confidence' as const
          : 'low_confidence' as const
        : isBlockingMissing && required && isValueMissing
          ? 'missing' as const
          : undefined;
      const description = this.decorateRequiredInputDescription(
        this.decorateArrayGroupCompletenessDescription(
          schema.description,
          valueItemCount,
          groupTargetCount,
          hasPartialArrayGroupValue,
        ),
        value,
        missingReason,
        fieldConfidence,
      );
      const displayName = this.resolveRequiredInputDisplayName(
        name,
        typeof schemaMeta.displayName === 'string' ? schemaMeta.displayName : undefined,
        schema.description,
      );

      return {
        name,
        type: schema.type,
        description,
        ...(displayName
          ? { display_name: displayName }
          : {}),
        ...(typeof schemaMeta.groupLabel === 'string'
          ? { group_label: String(schemaMeta.groupLabel) }
          : {}),
        required,
        value,
        missing: isBlockingMissing,
        source: hasValue ? 'user_input' : canUseDefault && value !== undefined ? 'default' : 'unresolved',
        confidence: fieldConfidence,
        needs_confirmation: needsConfirmation,
        confirmation_threshold: confirmationThreshold,
        ...(typeof previewBlocking === 'boolean'
          ? { preview_blocking: previewBlocking }
          : {}),
        ...(missingReason ? { missing_reason: missingReason } : {}),
      };
    });
  }

  private buildArrayGroupTargetCounts(
    properties: Record<string, { type: string }>,
    recognizedParams: Record<string, unknown>,
  ): Record<string, number> {
    return Object.entries(properties).reduce<Record<string, number>>((acc, [name, schema]) => {
      const groupKey = this.extractArrayGroupKey(name, schema.type);
      if (!groupKey) {
        return acc;
      }
      const count = this.countMeaningfulRequiredInputItems(recognizedParams[name]);
      if (count > 0) {
        acc[groupKey] = Math.max(acc[groupKey] || 0, count);
      }
      return acc;
    }, {});
  }

  private hasMeaningfulRequiredInputValue(value: unknown): boolean {
    if (value === undefined || value === null) {
      return false;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 && !isPlaceholderTextValue(trimmed);
    }
    if (Array.isArray(value)) {
      return value.some((item) => this.hasMeaningfulRequiredInputValue(item));
    }
    if (typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).some((item) => this.hasMeaningfulRequiredInputValue(item));
    }
    return true;
  }

  private normalizeMeaningfulInputValue(value: unknown): unknown {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 && !isPlaceholderTextValue(trimmed) ? trimmed : undefined;
    }
    if (Array.isArray(value)) {
      const normalized = value
        .map((item) => this.normalizeMeaningfulInputValue(item))
        .filter((item) => item !== undefined);
      return normalized.length > 0 ? normalized : undefined;
    }
    if (typeof value === 'object') {
      const normalizedEntries = Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, this.normalizeMeaningfulInputValue(item)] as const)
        .filter(([, item]) => item !== undefined);
      return normalizedEntries.length > 0 ? Object.fromEntries(normalizedEntries) : undefined;
    }
    return value;
  }

  private countMeaningfulRequiredInputItems(value: unknown): number {
    if (value === undefined || value === null) {
      return 0;
    }
    if (Array.isArray(value)) {
      return value.filter((item) => this.hasMeaningfulRequiredInputValue(item)).length;
    }
    return this.hasMeaningfulRequiredInputValue(value) ? 1 : 0;
  }

  private normalizeOptionalDefaultValue(value: unknown): unknown {
    return this.normalizeMeaningfulInputValue(value);
  }

  private decorateArrayGroupCompletenessDescription(
    description: string | undefined,
    currentCount: number,
    targetCount: number,
    incomplete: boolean,
  ): string | undefined {
    const base = String(description || '').trim();
    if (!incomplete) {
      return base || description;
    }
    const note = `当前仅识别 ${currentCount}/${targetCount} 条，请补齐同组其它行`;
    return base ? `${base}；${note}` : note;
  }

  private resolveRequiredInputDisplayName(
    name: string,
    displayName?: string,
    description?: string,
  ): string | undefined {
    const resolved = resolveFriendlyInputDisplayName({
      name,
      display_name: displayName,
      description,
    });
    return resolved || displayName || name;
  }

  private decorateRequiredInputDescription(
    description: string | undefined,
    value: unknown,
    missingReason: RequiredInputDTO['missing_reason'],
    confidence?: number,
  ): string | undefined {
    const base = String(description || '').trim();
    if (!missingReason || missingReason === 'missing') {
      return base || description;
    }

    const preview = this.summarizeInputValue(value);
    const confidenceText = typeof confidence === 'number'
      ? `，当前识别置信度 ${(confidence * 100).toFixed(0)}%`
      : '';
    const reason = missingReason === 'overall_low_confidence'
      ? `已识别候选值“${preview}”，但本轮整体识别置信度偏低${confidenceText}，请确认或改写`
      : `已识别候选值“${preview}”，但该字段置信度偏低${confidenceText}，请确认或改写`;
    return base ? `${base}；${reason}` : reason;
  }

  private summarizeInputValue(value: unknown): string {
    if (Array.isArray(value)) {
      const normalized = value
        .map((item) => String(item ?? '').trim())
        .filter(Boolean);
      if (normalized.length === 0) {
        return '空';
      }
      return normalized.length === 1 ? normalized[0]! : `${normalized[0]} 等 ${normalized.length} 项`;
    }

    const text = String(value ?? '').trim();
    if (!text) {
      return '空';
    }
    return text.length > 80 ? `${text.slice(0, 80)}...` : text;
  }

  private buildDocumentSemanticContext(
    matchedSkill: SkillMatchResult,
    requiredInputs: RequiredInputDTO[],
  ): {
    requiredInputs: RequiredInputDTO[];
    semantic?: PlanSemanticDTO;
    debug: Record<string, unknown>;
  } {
    const isDocumentTask = this.isDocumentTask(matchedSkill);
    if (!isDocumentTask) {
      return {
        requiredInputs,
        semantic: undefined,
        debug: {
          enabled: DOCUMENT_SEMANTIC_ENABLED,
          isDocumentTask: false,
        },
      };
    }

    const cleanedRequiredInputs = this.cleanRequiredInputs(requiredInputs);
    const complexity = this.analyzeDocumentComplexity(cleanedRequiredInputs);
    const shouldUseSemanticBypass = DOCUMENT_SEMANTIC_ENABLED && complexity.category === 'complex_document';
    const semantic = DOCUMENT_SEMANTIC_ENABLED
      ? this.buildPlanSemantic(cleanedRequiredInputs, complexity, shouldUseSemanticBypass)
      : undefined;

    return {
      requiredInputs: cleanedRequiredInputs,
      semantic,
      debug: {
        enabled: DOCUMENT_SEMANTIC_ENABLED,
        isDocumentTask,
        shouldUseSemanticBypass,
        complexity,
        originalFieldCount: requiredInputs.length,
        cleanedFieldCount: cleanedRequiredInputs.length,
      },
    };
  }

  private isDocumentTask(matchedSkill: SkillMatchResult): boolean {
    if (matchedSkill.executionType === 'document') {
      return true;
    }

    const schemaProperties = matchedSkill.paramsSchema?.properties || {};
    const hasTemplateLoopMarkers = Object.entries(schemaProperties).some(([name, schema]) => {
      const description = schema && typeof schema === 'object'
        ? String((schema as unknown as { description?: unknown }).description || '')
        : '';
      return [name, description].some((value) => /\{#.+\}|\{\/.+\}/.test(value));
    });

    return matchedSkill.apiEndpoints?.runtimeMetadata?.sourceType === 'document'
      || matchedSkill.executionFlow?.includes('generate_parameters')
      || matchedSkill.executionFlow?.includes('document_render')
      || Boolean(matchedSkill.carboneTemplateId)
      || Boolean(matchedSkill.executionFlowTemplateIds?.length)
      || hasTemplateLoopMarkers;
  }

  private analyzeDocumentComplexity(requiredInputs: RequiredInputDTO[]): PlanSemanticDTO['complexity'] {
    const requiredFields = requiredInputs.filter((item) => item.required).length;
    const missingFields = requiredInputs.filter((item) => item.required && item.missing).length;
    const arrayGroups = new Set(
      requiredInputs
        .map((item) => this.extractArrayGroupKey(item.name, item.type))
        .filter((item): item is string => Boolean(item)),
    ).size;
    const reasonCodes: string[] = [];

    if (requiredInputs.length >= DOCUMENT_COMPLEX_PARAM_THRESHOLD) {
      reasonCodes.push('param_count_threshold');
    }
    if (missingFields >= DOCUMENT_COMPLEX_MISSING_THRESHOLD) {
      reasonCodes.push('missing_input_threshold');
    }
    if (arrayGroups >= DOCUMENT_COMPLEX_ARRAY_GROUP_THRESHOLD) {
      reasonCodes.push('array_group_threshold');
    }

    return {
      category: reasonCodes.length > 0 ? 'complex_document' : 'simple',
      totalFields: requiredInputs.length,
      requiredFields,
      missingFields,
      arrayGroups,
      reasonCodes,
    };
  }

  private cleanRequiredInputs(requiredInputs: RequiredInputDTO[]): RequiredInputDTO[] {
    const seen = new Set<string>();

    return requiredInputs.reduce<RequiredInputDTO[]>((acc, item) => {
      if (this.isTemplateLoopMarker(item) || this.isTechnicalNoiseField(item)) {
        return acc;
      }

      if (seen.has(item.name)) {
        return acc;
      }
      seen.add(item.name);

      acc.push({
        ...item,
        type: this.normalizeRequiredInputType(item.name, item.type),
      });
      return acc;
    }, []);
  }

  private isTemplateLoopMarker(item: RequiredInputDTO): boolean {
    const values = [item.name, item.description || ''];
    return values.some((value) => /\{#.+\}|\{\/.+\}/.test(value));
  }

  private isTechnicalNoiseField(item: RequiredInputDTO): boolean {
    const normalizedName = item.name.toLowerCase();
    if (normalizedName.includes('__') || normalizedName.includes('loop') || normalizedName.includes('foreach')) {
      return true;
    }

    return /(^|\.)(index|idx|rowindex|colindex|length)$/.test(normalizedName);
  }

  private normalizeRequiredInputType(name: string, rawType: string): RequiredInputDTO['type'] {
    const normalizedType = String(rawType || 'string').toLowerCase();
    if (this.extractArrayGroupKey(name, normalizedType)) {
      return 'array';
    }
    if (normalizedType === 'int' || normalizedType === 'integer' || normalizedType === 'float') {
      return 'number';
    }
    if (normalizedType === 'bool') {
      return 'boolean';
    }
    if (normalizedType === 'json') {
      return 'object';
    }
    if (['string', 'number', 'boolean', 'object', 'array', 'date'].includes(normalizedType)) {
      return normalizedType;
    }
    return 'string';
  }

  private buildPlanSemantic(
    requiredInputs: RequiredInputDTO[],
    complexity: PlanSemanticDTO['complexity'],
    shouldUseSemanticBypass: boolean,
  ): PlanSemanticDTO {
    const groupedMissing = this.buildGroupedMissing(requiredInputs);
    const blockingGroups = groupedMissing.filter((item) => item.blocking);
    const previewReady = blockingGroups.length === 0;
    const finalReady = groupedMissing.length === 0;

    return {
      enabled: true,
      mode: shouldUseSemanticBypass ? 'complex_document' : 'field_level',
      previewReady,
      finalReady,
      fallbackToFieldLevel: !shouldUseSemanticBypass,
      summary: finalReady
        ? '文档参数已满足最终渲染要求。'
        : previewReady
          ? `文档可以先进入预览，但仍缺少 ${groupedMissing.length} 个业务组。`
          : `文档仍缺少 ${blockingGroups.length} 个关键业务组。`,
      groupedMissing,
      complexity,
    };
  }

  private buildGroupedMissing(requiredInputs: RequiredInputDTO[]): SemanticGroupedMissingDTO[] {
    const missingRequiredInputs = requiredInputs.filter((item) => item.required && item.missing);
    const groups = new Map<string, SemanticGroupedMissingDTO>();

    missingRequiredInputs.forEach((item) => {
      const arrayGroupKey = this.extractArrayGroupKey(item.name, item.type);
      const key = arrayGroupKey || item.name;
      const existing = groups.get(key);
      const kind = arrayGroupKey ? 'array_group' as const : 'field' as const;
      const label = arrayGroupKey
        ? this.resolveBusinessGroupLabel(arrayGroupKey, item)
        : item.display_name || item.description || item.name;
      const blocking = this.resolvePreviewBlocking(key, item);

      if (existing) {
        existing.fieldNames.push(item.name);
        existing.missingFieldNames.push(item.name);
        if (item.preview_blocking === true) {
          existing.blocking = true;
        }
        return;
      }

      groups.set(key, {
        key,
        label,
        kind,
        blocking,
        required: true,
        fieldNames: [item.name],
        missingFieldNames: [item.name],
        description: kind === 'array_group'
          ? `请按业务组补充 ${label}`
          : item.description || `请补充 ${label}`,
      });
    });

    return Array.from(groups.values());
  }

  private extractArrayGroupKey(name: string, type?: string): string | undefined {
    const arrayPathMatch = name.match(/^([a-zA-Z0-9_]+)\[\]/);
    if (arrayPathMatch?.[1]) {
      return arrayPathMatch[1];
    }

    if (String(type || '').toLowerCase() === 'array') {
      return name;
    }

    return undefined;
  }

  private hydrateMatchedSkill(
    matchedSkill: SkillMatchResult | null | undefined,
    availableSkills: AvailableSkillDefinition[],
  ): SkillMatchResult | null {
    if (!matchedSkill) {
      return null;
    }

    const sourceSkill = availableSkills.find((skill) => skill.skillId === matchedSkill.skillId);
    if (!sourceSkill) {
      return matchedSkill;
    }

    return {
      ...matchedSkill,
      paramsSchema: Object.keys(matchedSkill.paramsSchema?.properties || {}).length > 0
        ? this.normalizeParamsSchema(matchedSkill.paramsSchema)
        : sourceSkill.paramsSchema,
      templateId: matchedSkill.templateId || sourceSkill.templateId,
      carboneSkillId: matchedSkill.carboneSkillId || sourceSkill.carboneSkillId,
      carboneTemplateId: matchedSkill.carboneTemplateId || sourceSkill.carboneTemplateId,
      executionFlowTemplateIds: matchedSkill.executionFlowTemplateIds?.length
        ? matchedSkill.executionFlowTemplateIds
        : sourceSkill.executionFlowTemplateIds,
      executionType: matchedSkill.executionType || sourceSkill.executionType,
      executionFlow: matchedSkill.executionFlow?.length
        ? matchedSkill.executionFlow
        : sourceSkill.executionFlow,
      apiEndpoints: matchedSkill.apiEndpoints || sourceSkill.apiEndpoints,
      goal: matchedSkill.goal || sourceSkill.goal,
      expectedResult: matchedSkill.expectedResult || sourceSkill.expectedResult,
      outputParams: matchedSkill.outputParams || sourceSkill.outputParams,
    };
  }

  private resolveExecutionType(
    executionType?: string,
    sourceType?: string,
  ): AvailableSkillDefinition['executionType'] {
    if (executionType === 'document' || executionType === 'flow' || executionType === 'query') {
      return executionType;
    }
    if (sourceType === 'document' || sourceType === 'execution_flow_template') {
      return 'document';
    }
    return undefined;
  }

  private buildRecognizerParamsSchemaProperties(
    properties: NonNullable<AvailableSkillDefinition['paramsSchema']>['properties'],
  ): NonNullable<RecognizeParamsDTO['params_schema']>['properties'] {
    return Object.fromEntries(
      Object.entries(properties).map(([name, schema]) => {
        const { required: _required, default: schemaDefault, ...rest } = schema;
        const recognizerProperty: NonNullable<RecognizeParamsDTO['params_schema']>['properties'][string] = {
          ...rest,
          ...(typeof schemaDefault === 'string'
            || typeof schemaDefault === 'number'
            || typeof schemaDefault === 'boolean'
            ? { default: schemaDefault }
            : {}),
        };
        return [name, recognizerProperty];
      }),
    );
  }

  private buildRequestHeaders(authToken?: string, traceId?: string): Record<string, string> {
    return {
      ...(authToken ? { Authorization: authToken } : {}),
      ...(traceId ? { [TRACE_ID_HEADER]: traceId } : {}),
    };
  }

  private buildAuthCacheKey(authToken?: string): string {
    const normalized = (authToken || 'anonymous').trim();
    return createHash('sha1').update(normalized).digest('hex');
  }

  private buildSkillCacheKey(authCacheKey: string, skillId: string): string {
    return `${authCacheKey}:skill:${skillId}`;
  }

  private buildFlowSchemaCacheKey(authToken: string | undefined, templateId: string): string {
    return `${this.buildAuthCacheKey(authToken)}:flow:${templateId}`;
  }

  private getCacheValue<T>(
    cache: Map<string, SkillCacheEntry<T>>,
    key: string,
  ): T | undefined {
    const entry = cache.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private setCacheValue<T>(
    cache: Map<string, SkillCacheEntry<T>>,
    key: string,
    value: T,
  ): void {
    cache.set(key, {
      value,
      expiresAt: Date.now() + PLANNER_SKILL_CACHE_TTL_MS,
    });
  }

  private resolveBusinessGroupLabel(groupKey: string, item?: RequiredInputDTO): string {
    return item?.group_label || BUSINESS_GROUP_LABELS[groupKey] || groupKey;
  }

  private resolvePreviewBlocking(groupKey: string, item?: RequiredInputDTO): boolean {
    if (typeof item?.preview_blocking === 'boolean') {
      return item.preview_blocking;
    }
    return this.isPreviewBlockingGroup(groupKey);
  }

  private isPreviewBlockingGroup(groupKey: string): boolean {
    return !['paymentSchedule', 'supplementaryTerms', 'notes', 'remarks'].includes(groupKey);
  }

  private buildPlanSteps(
    matchedSkill: SkillMatchResult,
    requiredInputs: RequiredInputDTO[],
  ): PlanStepDTO[] {
    const steps: PlanStepDTO[] = [];
    const missingRequiredInputs = requiredInputs.filter((item) => item.missing);

    if (missingRequiredInputs.length > 0) {
      steps.push({
        id: 'collect-required-inputs',
        title: 'Collect required inputs',
        description: `补齐必填参数: ${missingRequiredInputs.map((item) => item.name).join(', ')}`,
        kind: 'human_input',
        status: 'planned',
      });
    }

    const executionFlow = matchedSkill.executionFlow?.length
      ? matchedSkill.executionFlow
      : matchedSkill.apiEndpoints?.runtimeMetadata?.sourceType === 'document'
        ? ['generate_parameters', 'document_render']
        : [];

    if (executionFlow.length === 0) {
      steps.push({
        id: 'execute-skill',
        title: 'Execute skill',
        description: `调用技能 ${matchedSkill.skillName} 进入执行。`,
        kind: 'skill',
        status: 'planned',
      });
      return steps;
    }

    executionFlow.forEach((toolName, index) => {
      steps.push({
        id: `step-${index + 1}`,
        title: this.toStepTitle(toolName),
        description: `执行 ${toolName} 步骤。`,
        kind: 'tool',
        tool_name: toolName,
        status: 'planned',
      });
    });

    return steps;
  }

  private buildRiskItems(matchedSkill: SkillMatchResult, missingInputCount: number): string[] {
    const items: string[] = [];

    if (missingInputCount > 0) {
      items.push('missing_required_inputs');
    }

    if (matchedSkill.executionFlow?.some((step) => step.includes('browser'))) {
      items.push('browser_runtime_may_require_takeover');
    }

    if (items.length === 0) {
      items.push('no_material_risk_detected');
    }

    return items;
  }

  private toPlanSkillMatch(matchedSkill: SkillMatchResult): PlanSkillMatchDTO {
    return {
      skill_id: matchedSkill.skillId,
      skill_name: matchedSkill.skillName,
      confidence: matchedSkill.confidence,
      match_reason: matchedSkill.matchReason,
    };
  }

  private toStepTitle(toolName: string): string {
    return toolName
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
