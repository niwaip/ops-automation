import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import {
  GeneratePlanDTO,
  PlanDraftDTO,
  PlanSkillMatchDTO,
  PlanStepDTO,
  RequiredInputDTO,
  LLMUsage,
} from '../../interfaces';
import { TRACE_ID_HEADER } from '../../common/trace.util';
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

const getAuthServiceUrl = () => {
  if (process.env.AUTH_SERVICE_URL) {
    return process.env.AUTH_SERVICE_URL;
  }
  if (process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production') {
    return process.env.PLATFORM_SERVICE_URL || 'http://platform:3001';
  }
  return 'http://localhost:3001';
};

@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);
  private readonly authServiceUrl = getAuthServiceUrl();

  constructor(private readonly recognizerService: RecognizerService) {}

  async generatePlan(input: {
    request: GeneratePlanDTO;
    userId?: string;
    authToken?: string;
    traceId?: string;
  }): Promise<PlanDraftDTO> {
    const objective = input.request.user_input.trim();
    const availableSkills = await this.loadAvailableSkills(input.authToken, input.traceId);
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

    const recognized = await this.recognizerService.recognizeParams({
      template_id: matchedSkill.skillId,
      user_input: objective,
      modelId: input.request.modelId,
      context: input.request.context,
      params_schema: {
        properties: Object.fromEntries(
          Object.entries(matchedSkill.paramsSchema?.properties || {}).map(([name, schema]) => [
            name,
            {
              type: schema.type,
              description: schema.description,
              extractionPrompt: (schema as any).extractionPrompt,
              default: schema.default as string | number | boolean | undefined,
            },
          ]),
        ),
        required: matchedSkill.paramsSchema?.required || [],
      },
    });

    // 累积消耗
    const totalUsage = this.sumUsage(matchedSkill.usage, recognized.usage);

    const requiredInputs = this.buildRequiredInputs(matchedSkill, recognized.params);
    const steps = this.buildPlanSteps(matchedSkill, requiredInputs);
    const missingInputs = requiredInputs.filter((item) => item.missing);
    // Missing required inputs should be handled by waiting_input, not approval.
    const requiresHumanReview = false;
    const summary = missingInputs.length > 0
      ? `已识别技能 ${matchedSkill.skillName}，但仍缺少 ${missingInputs.length} 个关键输入。`
      : `已识别技能 ${matchedSkill.skillName}，可以按计划进入执行。`;

    return {
      plan_id: uuidv4(),
      planner_mode: 'skill',
      objective,
      summary,
      skill_match: this.toPlanSkillMatch(matchedSkill),
      steps,
      required_inputs: requiredInputs,
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
        },
      },
    };
  }

  private async loadAvailableSkills(
    authToken?: string,
    traceId?: string,
  ): Promise<AvailableSkillDefinition[]> {
    try {
      const headers = {
        ...(authToken ? { Authorization: authToken } : {}),
        ...(traceId ? { [TRACE_ID_HEADER]: traceId } : {}),
      };
      const response = await axios.get<SkillListResponse>(`${this.authServiceUrl}/skills`, { headers });

      const rawSkills = Array.isArray(response.data.skills) ? response.data.skills : [];
      const mappedSkills = rawSkills
        .map((item) => {
          const apiEndpoints = (typeof item.apiEndpoints === 'object' && item.apiEndpoints)
            ? item.apiEndpoints as AvailableSkillDefinition['apiEndpoints']
            : undefined;
          const sourceTemplate = apiEndpoints?.runtimeMetadata?.sourceTemplate;
          const sourceType = apiEndpoints?.runtimeMetadata?.sourceType;
          const executionType: AvailableSkillDefinition['executionType'] =
            sourceType === 'document' || sourceType === 'execution_flow_template'
              ? 'document'
              : undefined;

          return {
            skillId: String(item.id || ''),
            skillName: String(item.name || ''),
            description: typeof item.description === 'string' ? item.description : undefined,
            triggerKeywords: Array.isArray(item.triggerKeywords) ? item.triggerKeywords.map(String) : [],
            paramsSchema: (item.paramsSchema as AvailableSkillDefinition['paramsSchema']) || { properties: {}, required: [] },
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
        })
        .filter((item) => item.skillId && item.skillName);

      return Promise.all(
        mappedSkills.map((skill) => this.enrichSkillParamsSchema(skill, headers)),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`Failed to load available skills for planner: ${message}`);
      return [];
    }
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
        try {
          const response = await axios.get<ExecutionFlowTemplateResponse>(
            `${this.authServiceUrl}/flows/${templateId}`,
            { headers },
          );
          return response.data.paramsSchema;
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

        const matchedSkill = response.data.match;
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
    recognizedParams: Record<string, unknown>,
  ): RequiredInputDTO[] {
    return Object.entries(matchedSkill.paramsSchema?.properties || {}).map(([name, schema]) => {
      const required = Boolean(schema.required || matchedSkill.paramsSchema.required?.includes(name));
      const hasValue = Object.prototype.hasOwnProperty.call(recognizedParams, name);
      const canUseDefault = !required && schema.default !== undefined;
      const value = hasValue ? recognizedParams[name] : canUseDefault ? schema.default : undefined;

      return {
        name,
        type: schema.type,
        description: schema.description,
        required,
        value,
        missing: required && (
          value === undefined ||
          value === null ||
          (typeof value === 'string' && value.trim() === '')
        ),
        source: hasValue ? 'user_input' : canUseDefault && value !== undefined ? 'default' : 'unresolved',
      };
    });
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
