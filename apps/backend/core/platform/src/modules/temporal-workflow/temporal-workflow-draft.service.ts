import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import { getAiOrchestratorUrl } from '../../config/service-endpoints';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BuiltinActivityRegistry,
  HTTP_REQUEST_STEP_CONFIG_KEY,
  STRUCTURED_TRANSFORM_STEP_CONFIG_KEY,
} from './builtin-activity.registry';
import {
  buildAiDraftResolutionGoal,
  buildAiDraftStepSampleKey,
  buildAnalyzeAiWorkflowDraftPrompt,
  buildAnalyzeAiWorkflowRefinementPrompt,
  buildRepairAiWorkflowDraftPlanPrompt,
  buildStructuredTransformPlaceholderKeys,
} from './temporal-workflow-draft.helpers';
import type {
  ActivityDsl,
  AiWorkflowDraft,
  GenerateAiWorkflowDraftDTO,
  RefineAiWorkflowDraftDTO,
  WorkflowDsl,
  WorkflowInputParamDefinition,
  WorkflowStep,
} from './temporal-workflow.service';

export interface AiDraftActivityResource {
  ref: string;
  name: string;
  fn: string;
  timeout: string;
  retryPolicy?: { maxRetries?: number; backoffMs?: number };
  handler: 'api' | 'carbone' | 'browser' | 'script';
  config: Record<string, any>;
  generatedCode?: string;
  description?: string;
}

export interface AiWorkflowDraftPlan {
  workflowName?: string;
  workflowDescription?: string;
  workflowClassName?: string;
  workflowDefnName?: string;
  taskQueue?: string;
  inputParams?: Record<string, WorkflowInputParamDefinition>;
  outputParams?: Record<string, { description?: string; sourceStep?: string }>;
  extraPrompt?: string;
  warnings?: string[];
  steps?: Array<{
    id?: string;
    name?: string;
    type?: 'activity';
    activityRef?: string;
    activityName?: string;
    input?: Record<string, any>;
    startToCloseTimeout?: string;
  }>;
  activities?: Array<{
    activityRef?: string;
    name?: string;
    timeout?: string;
    retryPolicy?: { maxRetries?: number; backoffMs?: number };
    config?: Record<string, any>;
  }>;
}

export interface TemporalWorkflowAiDraftSupport {
  fetchReferenceUrlExcerpt(referenceUrl: string): Promise<string>;
  sanitizeJsonValue<T>(value: T): T;
  parseJsonFromAiContent(content: string): unknown;
  pickFirstNonEmptyString(...values: unknown[]): string | undefined;
  normalizeHttpRequestConfig(config: Record<string, any>, declaredInputKeys?: Set<string>): Record<string, any>;
  optimizeHttpRequestConfig(
    stepConfig: Record<string, any>,
    inputParams?: Record<string, any>,
    userRequest?: string,
  ): Promise<{
    success: boolean;
    optimizedConfig?: Record<string, any>;
    previewResponse?: Record<string, any>;
    explanation?: string;
    error?: string;
  }>;
  previewHttpRequestConfig(
    stepConfig: Record<string, any>,
    inputParams?: Record<string, any>,
  ): Promise<{
    success: boolean;
    baseConfig?: Record<string, any>;
    resolvedRequest?: Record<string, any>;
    previewResponse?: Record<string, any>;
    error?: string;
  }>;
  generateStructuredTransformConfig(
    sourceSample: Record<string, any> | string,
    userRequest: string,
    existingConfig?: Record<string, any>,
  ): Promise<{
    success: boolean;
    config?: Record<string, any>;
    explanation?: string;
    error?: string;
  }>;
  generateAiStructuredTransformDraftConfig(
    sourceSample: Record<string, any> | string,
    userRequest: string,
    existingConfig?: Record<string, any>,
  ): Promise<{
    success: boolean;
    config?: Record<string, any>;
    sampleOutput?: unknown;
    explanation?: string;
    error?: string;
  }>;
  normalizeStructuredTransformConfig(config: Record<string, any>, placeholderKeys?: Set<string>): Record<string, any>;
  collectTemplateVariables(value: unknown, target?: Set<string>): Set<string>;
  extractValueByPath(value: unknown, path: string): unknown;
  renderHttpTemplateValue(value: unknown, params: Record<string, any>): unknown;
  buildPlaceholderValueFromSchemaHint(schemaHint: unknown, fieldName: string): unknown;
  normalizeName(value?: string): string;
  normalizeDescription(value?: string | null): string | null;
  normalizeTaskQueue(value?: string): string;
  normalizeWorkflowClassName(candidate: string | undefined, workflowName: string): string;
  normalizeWorkflowDsl(
    workflowDsl: WorkflowDsl,
    workflowName?: string,
    taskQueue?: string,
    activityDsl?: ActivityDsl,
  ): Promise<WorkflowDsl>;
  normalizeDraftInputParams(
    inputParams?: Record<string, WorkflowInputParamDefinition>,
    steps?: WorkflowStep[],
    referenceUrl?: string,
  ): WorkflowDsl['inputParams'];
  normalizeDraftOutputParams(
    outputParams?: Record<string, { description?: string; sourceStep?: string }>,
  ): WorkflowDsl['outputParams'];
  normalizeAiDraftStepInput(
    rawInput: Record<string, any>,
    activityRef: string,
    stepName: string,
    workflowIntentText: string,
    previousActivityRef?: string,
  ): Record<string, any>;
}

@Injectable()
export class TemporalWorkflowAiDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly builtinActivityRegistry: BuiltinActivityRegistry,
  ) {}

  private getAiDraftTimeoutMs(): number {
    const configured = Number(
      process.env.TEMPORAL_WORKFLOW_AI_DRAFT_TIMEOUT_MS
      || process.env.AI_ORCHESTRATOR_TIMEOUT_MS
      || 300000,
    );
    return Number.isFinite(configured) && configured > 0 ? configured : 300000;
  }

  async generateWorkflowDraft(
    data: GenerateAiWorkflowDraftDTO,
    support: TemporalWorkflowAiDraftSupport,
  ): Promise<AiWorkflowDraft> {
    const description = String(data?.description || '').trim();
    const referenceUrl = String(data?.referenceUrl || '').trim();

    if (!description && !referenceUrl) {
      throw new BadRequestException('请提供工作流说明或参考 URL');
    }

    const warnings: string[] = [];
    let referenceExcerpt = '';
    if (referenceUrl) {
      try {
        referenceExcerpt = await support.fetchReferenceUrlExcerpt(referenceUrl);
      } catch (error: any) {
        warnings.push(`参考 URL 读取失败，已仅基于文字说明生成草稿: ${error.message}`);
      }
    }

    const activityResources = await this.getAiDraftActivityResources(support);
    const initialPlan = await this.analyzeAiWorkflowDraft(
      description,
      referenceUrl,
      referenceExcerpt,
      activityResources,
      support,
    );
    const resolvedPlan = await this.resolveAiWorkflowDraftPlan(
      initialPlan,
      description,
      referenceUrl,
      activityResources,
      support,
    );
    const plan = await this.repairAiWorkflowDraftPlanIfNeeded(
      resolvedPlan,
      description,
      referenceUrl,
      referenceExcerpt,
      activityResources,
      support,
    );
    const draft = await this.materializeAiWorkflowDraft(
      plan,
      activityResources,
      description,
      referenceUrl,
      support,
    );

    return {
      ...draft,
      warnings: [
        ...warnings,
        ...((plan.warnings || []).filter((item) => typeof item === 'string' && item.trim())),
      ],
      sourceContext: draft.workflowDsl.sourceContext,
    };
  }

  async refineWorkflowDraft(
    data: RefineAiWorkflowDraftDTO,
    support: TemporalWorkflowAiDraftSupport,
  ): Promise<AiWorkflowDraft> {
    const userPrompt = String(data?.userPrompt || '').trim();
    if (!userPrompt) {
      throw new BadRequestException('请提供改进说明');
    }

    const activityResources = await this.getAiDraftActivityResources(support);
    const initialPlan = await this.analyzeAiWorkflowRefinement(
      data.currentWorkflowDsl,
      data.currentActivityDsl,
      userPrompt,
      activityResources,
      support,
    );
    const resolvedPlan = await this.resolveAiWorkflowDraftPlan(
      initialPlan,
      userPrompt,
      data.currentWorkflowDsl.sourceContext?.referenceUrl || '',
      activityResources,
      support,
    );
    const plan = await this.repairAiWorkflowDraftPlanIfNeeded(
      resolvedPlan,
      userPrompt,
      data.currentWorkflowDsl.sourceContext?.referenceUrl || '',
      '',
      activityResources,
      support,
    );
    const draft = await this.materializeAiWorkflowDraft(
      plan,
      activityResources,
      userPrompt,
      data.currentWorkflowDsl.sourceContext?.referenceUrl || '',
      support,
    );

    return {
      ...draft,
      warnings: plan.warnings || [],
      sourceContext: {
        ...draft.workflowDsl.sourceContext,
        userDescription: `改进请求: ${userPrompt}\n原描述: ${data.currentWorkflowDsl.sourceContext?.userDescription || '无'}`,
      },
    };
  }

  validatePlan(
    plan: AiWorkflowDraftPlan,
    activityResources: AiDraftActivityResource[],
  ): string[] {
    const issues: string[] = [];
    const steps = Array.isArray(plan.steps) ? plan.steps : [];
    const knownActivityRefs = new Set(activityResources.map((item) => item.ref));

    if (steps.length === 0) {
      issues.push('必须至少生成一个步骤。');
      return issues;
    }

    steps.forEach((step, index) => {
      const stepName = this.pickFirstNonEmptyString(step?.name) || `步骤 ${index + 1}`;
      const activityRef = this.pickFirstNonEmptyString(step?.activityRef);
      const input = step?.input && typeof step.input === 'object' && !Array.isArray(step.input)
        ? step.input as Record<string, any>
        : {};

      if (!activityRef) {
        issues.push(`${stepName} 缺少 activityRef。`);
        return;
      }
      if (!knownActivityRefs.has(activityRef)) {
        issues.push(`${stepName} 使用了未注册的 activityRef: ${activityRef}。`);
        return;
      }

      if (activityRef === 'builtin:httpRequest') {
        const httpConfig = input[HTTP_REQUEST_STEP_CONFIG_KEY];
        const urlTemplate = String(httpConfig?.urlTemplate || '').trim();
        if (!httpConfig || typeof httpConfig !== 'object' || Array.isArray(httpConfig)) {
          issues.push(`${stepName} 缺少完整的 __httpRequest 配置。`);
        } else {
          if (!urlTemplate) {
            issues.push(`${stepName} 的 __httpRequest.urlTemplate 不能为空。`);
          }
          if (urlTemplate.includes('?')) {
            issues.push(`${stepName} 的 urlTemplate 不能直接带查询串，必须拆到 queryTemplate。`);
          }
        }
      }

      if (activityRef === 'builtin:structuredTransform' || activityRef === 'builtin:aiStructuredTransform') {
        const transformConfig = input[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY];
        const contentTemplate = String(transformConfig?.contentTemplate || '').trim();
        const instructionTemplate = String(transformConfig?.instructionTemplate || '').trim();
        const outputMode = String(transformConfig?.outputMode || '').trim().toLowerCase();
        const contentType = String(transformConfig?.contentType || '').trim().toLowerCase();
        const outputSchema = transformConfig?.outputSchema;
        const fieldMappings = transformConfig?.fieldMappings;
        const textTemplate = String(transformConfig?.textTemplate || '').trim();
        const isAiTransform = activityRef === 'builtin:aiStructuredTransform';
        if (!transformConfig || typeof transformConfig !== 'object' || Array.isArray(transformConfig)) {
          issues.push(`${stepName} 缺少完整的 __structuredTransform 配置。`);
        } else {
          if (!contentType) {
            issues.push(`${stepName} 的 __structuredTransform.contentType 不能为空。`);
          }
          if (!contentTemplate) {
            issues.push(`${stepName} 的 __structuredTransform.contentTemplate 不能为空，通常应为 {content}。`);
          }
          if (!outputMode) {
            issues.push(`${stepName} 的 __structuredTransform.outputMode 不能为空。`);
          }
          if (isAiTransform && !instructionTemplate) {
            issues.push(`${stepName} 的 AI 转换步骤必须提供 __structuredTransform.instructionTemplate。`);
          }
          if (
            outputMode === 'json'
            && (!outputSchema || typeof outputSchema !== 'object' || Array.isArray(outputSchema) || Object.keys(outputSchema).length === 0)
          ) {
            issues.push(`${stepName} 的 outputMode 为 json 时，必须提供非空 outputSchema。`);
          }
          if (!isAiTransform) {
            const blankFieldMappingKeys = this.collectBlankFieldMappingKeys(
              fieldMappings && typeof fieldMappings === 'object' && !Array.isArray(fieldMappings)
                ? fieldMappings as Record<string, any>
                : {},
            );
            if (blankFieldMappingKeys.length > 0) {
              issues.push(`${stepName} 的 fieldMappings 存在空映射: ${blankFieldMappingKeys.join('、')}。空字符串会导致运行时把整块 content 回填到该字段，请显式填写来源路径、别名或删除这些字段。`);
            }
          }
          if (!isAiTransform && outputMode === 'json') {
            const hasFieldMappings = Boolean(
              fieldMappings
              && typeof fieldMappings === 'object'
              && !Array.isArray(fieldMappings)
              && Object.keys(fieldMappings).length > 0,
            );
            const hasNestedOutputSchema = Boolean(
              outputSchema
              && typeof outputSchema === 'object'
              && !Array.isArray(outputSchema)
              && Object.values(outputSchema as Record<string, unknown>).some((value) => (
                Array.isArray(value) || (value && typeof value === 'object')
              )),
            );
            if (!hasFieldMappings && hasNestedOutputSchema) {
              issues.push(`${stepName} 的固定规则 JSON 转换存在嵌套 outputSchema，但未提供 fieldMappings。请显式提供 fieldMappings，或改用 builtin:aiStructuredTransform。`);
            }
          }
          if (
            !isAiTransform
            && outputMode === 'text'
            && !textTemplate
            && (!fieldMappings || typeof fieldMappings !== 'object' || Array.isArray(fieldMappings) || Object.keys(fieldMappings).length === 0)
          ) {
            issues.push(`${stepName} 的固定规则文本转换至少需要 textTemplate 或非空 fieldMappings。`);
          }
        }
      }
    });

    for (let index = 1; index < steps.length; index += 1) {
      const previousStep = steps[index - 1];
      const currentStep = steps[index];
      const currentStepName = this.pickFirstNonEmptyString(currentStep?.name) || `步骤 ${index + 1}`;
      const previousActivityRef = this.pickFirstNonEmptyString(previousStep?.activityRef);
      const currentActivityRef = this.pickFirstNonEmptyString(currentStep?.activityRef);
      if (previousActivityRef !== 'builtin:httpRequest' || currentActivityRef !== 'builtin:structuredTransform') {
        continue;
      }
      const previousInput = previousStep?.input && typeof previousStep.input === 'object' && !Array.isArray(previousStep.input)
        ? previousStep.input as Record<string, any>
        : {};
      const currentInput = currentStep?.input && typeof currentStep.input === 'object' && !Array.isArray(currentStep.input)
        ? currentStep.input as Record<string, any>
        : {};
      const httpConfig = previousInput[HTTP_REQUEST_STEP_CONFIG_KEY];
      const transformConfig = currentInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY];
      if (!httpConfig || !transformConfig || typeof httpConfig !== 'object' || typeof transformConfig !== 'object') {
        continue;
      }
      const responseMode = String(httpConfig?.responseMode || 'body').trim();
      const responseFieldMappings = httpConfig?.responseFieldMappings && typeof httpConfig.responseFieldMappings === 'object' && !Array.isArray(httpConfig.responseFieldMappings)
        ? httpConfig.responseFieldMappings as Record<string, any>
        : {};
      const availableAliases = new Set(Object.keys(responseFieldMappings).map((key) => String(key || '').trim()).filter(Boolean));
      const textTemplate = String(transformConfig?.textTemplate || '').trim();
      const fieldMappings = transformConfig?.fieldMappings && typeof transformConfig.fieldMappings === 'object' && !Array.isArray(transformConfig.fieldMappings)
        ? transformConfig.fieldMappings as Record<string, any>
        : {};

      if (responseMode === 'bodyMap' && availableAliases.size === 0) {
        issues.push(`${currentStepName} 的上游 httpRequest 使用了 bodyMap，但 responseFieldMappings 为空。请改用 body，或显式提供 responseFieldMappings。`);
      }

      if (responseMode === 'bodyMap' && textTemplate) {
        const placeholders = this.extractTemplatePlaceholders(textTemplate);
        const rawPathPlaceholders = placeholders.filter((item) => (
          item.includes('.')
          && !item.startsWith('context.')
          && !availableAliases.has(item)
        ));
        if (rawPathPlaceholders.length > 0) {
          issues.push(`${currentStepName} 的上游 httpRequest 为 bodyMap，但 textTemplate 仍引用原始路径占位符: ${rawPathPlaceholders.join('、')}。请改为使用 responseFieldMappings 的别名，或将上游改回 body。`);
        }
      }

      if (responseMode === 'bodyMap' && Object.keys(fieldMappings).length > 0) {
        const invalidFieldMappings = Object.entries(fieldMappings)
          .filter(([, value]) => typeof value === 'string')
          .map(([, value]) => String(value || '').trim())
          .filter((value) => value && value.includes('.') && !value.startsWith('context.') && !availableAliases.has(value));
        if (invalidFieldMappings.length > 0) {
          issues.push(`${currentStepName} 的 fieldMappings 与上游 bodyMap 输出不匹配，仍引用原始路径: ${invalidFieldMappings.join('、')}。请改为使用 bodyMap 的别名。`);
        }
      }

      const contextRefs = this.collectContextReferenceKeys(fieldMappings);
      const hasContextTemplate = this.hasUsableContextTemplate(transformConfig?.contextTemplate);
      if (contextRefs.size > 0 && !hasContextTemplate) {
        issues.push(`${currentStepName} 的 fieldMappings 引用了 context.*，但 contextTemplate 为空。请显式传入所需运行时上下文。`);
      }
    }

    return issues;
  }

  private repairCommonDraftPlanIssues(plan: AiWorkflowDraftPlan): AiWorkflowDraftPlan {
    const steps = Array.isArray(plan.steps)
      ? plan.steps.map((step) => ({
        ...step,
        input: step?.input && typeof step.input === 'object' && !Array.isArray(step.input)
          ? { ...(step.input as Record<string, any>) }
          : step?.input,
      }))
      : [];
    const warnings = Array.isArray(plan.warnings) ? [...plan.warnings] : [];
    const runtimeInputKeys = new Set(Object.keys(plan.inputParams || {}));

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const activityRef = this.pickFirstNonEmptyString(step?.activityRef);
      const input = step?.input && typeof step.input === 'object' && !Array.isArray(step.input)
        ? step.input as Record<string, any>
        : {};

      if (activityRef === 'builtin:httpRequest') {
        const httpConfig = input[HTTP_REQUEST_STEP_CONFIG_KEY];
        if (httpConfig && typeof httpConfig === 'object' && !Array.isArray(httpConfig)) {
          const responseMode = String(httpConfig.responseMode || 'body').trim();
          const responseFieldMappings = httpConfig.responseFieldMappings && typeof httpConfig.responseFieldMappings === 'object' && !Array.isArray(httpConfig.responseFieldMappings)
            ? httpConfig.responseFieldMappings as Record<string, any>
            : {};
          const responseBodyPath = String(httpConfig.responseBodyPath || '').trim();
          if (responseMode === 'bodyMap' && Object.keys(responseFieldMappings).length === 0) {
            httpConfig.responseMode = 'body';
            warnings.push(`已自动修正步骤「${step?.name || step?.id || `step_${index + 1}`}」: bodyMap 缺少 responseFieldMappings，已回退为 body。`);
          }
          if (responseMode === 'bodyPath' && !responseBodyPath) {
            httpConfig.responseMode = 'body';
            warnings.push(`已自动修正步骤「${step?.name || step?.id || `step_${index + 1}`}」: bodyPath 缺少 responseBodyPath，已回退为 body。`);
          }
        }
      }

      const previousStep = index > 0 ? steps[index - 1] : undefined;
      const previousActivityRef = this.pickFirstNonEmptyString(previousStep?.activityRef);
      if (activityRef !== 'builtin:structuredTransform' || previousActivityRef !== 'builtin:httpRequest') {
        continue;
      }
      const previousInput = previousStep?.input && typeof previousStep.input === 'object' && !Array.isArray(previousStep.input)
        ? previousStep.input as Record<string, any>
        : {};
      const httpConfig = previousInput[HTTP_REQUEST_STEP_CONFIG_KEY];
      const transformConfig = input[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY];
      if (
        !httpConfig || typeof httpConfig !== 'object' || Array.isArray(httpConfig)
        || !transformConfig || typeof transformConfig !== 'object' || Array.isArray(transformConfig)
      ) {
        continue;
      }

      const responseMode = String(httpConfig.responseMode || 'body').trim();
      if (responseMode !== 'bodyMap') {
        const contextRefs = this.collectContextReferenceKeys(
          transformConfig.fieldMappings && typeof transformConfig.fieldMappings === 'object' && !Array.isArray(transformConfig.fieldMappings)
            ? transformConfig.fieldMappings as Record<string, any>
            : {},
        );
        if (contextRefs.size > 0 && !this.hasUsableContextTemplate(transformConfig.contextTemplate)) {
          transformConfig.contextTemplate = Object.fromEntries(
            Array.from(contextRefs).map((key) => [key, `{${key}}`]),
          );
          warnings.push(`已自动补全步骤「${step?.name || step?.id || `step_${index + 1}`}」的 contextTemplate，用于传递运行时上下文。`);
        }
        continue;
      }

      const responseFieldMappings = httpConfig.responseFieldMappings && typeof httpConfig.responseFieldMappings === 'object' && !Array.isArray(httpConfig.responseFieldMappings)
        ? httpConfig.responseFieldMappings as Record<string, any>
        : {};
      const aliasByPath = new Map<string, string>();
      Object.entries(responseFieldMappings).forEach(([alias, path]) => {
        const normalizedAlias = String(alias || '').trim();
        const normalizedPath = String(path || '').trim();
        if (normalizedAlias && normalizedPath) {
          aliasByPath.set(normalizedPath, normalizedAlias);
        }
      });
      const availableAliases = new Set(Object.keys(responseFieldMappings).map((key) => String(key || '').trim()).filter(Boolean));
      const fieldMappings = transformConfig.fieldMappings && typeof transformConfig.fieldMappings === 'object' && !Array.isArray(transformConfig.fieldMappings)
        ? { ...(transformConfig.fieldMappings as Record<string, any>) }
        : {};
      const blankFieldMappingKeys = this.collectBlankFieldMappingKeys(fieldMappings);
      let repairedBlankFieldMappings = false;
      blankFieldMappingKeys.forEach((key) => {
        if (availableAliases.has(key) || runtimeInputKeys.has(key)) {
          fieldMappings[key] = key;
          repairedBlankFieldMappings = true;
          warnings.push(`已自动修正步骤「${step?.name || step?.id || `step_${index + 1}`}」的空 fieldMapping: ${key} -> ${key}。`);
        }
      });
      if (repairedBlankFieldMappings) {
        transformConfig.fieldMappings = fieldMappings;
      }
      let textTemplate = String(transformConfig.textTemplate || '').trim();
      let rewroteTemplate = false;
      for (const placeholder of this.extractTemplatePlaceholders(textTemplate)) {
        if (placeholder.startsWith('context.')) {
          continue;
        }
        const mappedAlias = aliasByPath.get(placeholder);
        if (mappedAlias && mappedAlias !== placeholder) {
          textTemplate = textTemplate.replaceAll(`{${placeholder}}`, `{${mappedAlias}}`);
          rewroteTemplate = true;
        }
      }
      if (rewroteTemplate) {
        transformConfig.textTemplate = textTemplate;
        warnings.push(`已自动修正步骤「${step?.name || step?.id || `step_${index + 1}`}」的 textTemplate，使其与上游 bodyMap 别名保持一致。`);
      }

      let rewroteFieldMappings = false;
      Object.entries(fieldMappings).forEach(([key, value]) => {
        if (typeof value !== 'string') {
          return;
        }
        const normalizedValue = String(value || '').trim();
        const mappedAlias = aliasByPath.get(normalizedValue);
        if (mappedAlias && mappedAlias !== normalizedValue) {
          fieldMappings[key] = mappedAlias;
          rewroteFieldMappings = true;
        }
      });

      let autoFilledFieldMappings = false;
      for (const placeholder of this.extractTemplatePlaceholders(textTemplate)) {
        if (!placeholder || placeholder.startsWith('context.')) {
          continue;
        }
        if (availableAliases.has(placeholder) && !fieldMappings[placeholder]) {
          fieldMappings[placeholder] = placeholder;
          autoFilledFieldMappings = true;
        }
      }
      if (rewroteFieldMappings || autoFilledFieldMappings) {
        transformConfig.fieldMappings = fieldMappings;
        warnings.push(`已自动补全步骤「${step?.name || step?.id || `step_${index + 1}`}」的 fieldMappings，使其与上游 bodyMap 输出契约一致。`);
      }

      const contextRefs = this.collectContextReferenceKeys(fieldMappings);
      if (contextRefs.size > 0 && !this.hasUsableContextTemplate(transformConfig.contextTemplate)) {
        const contextTemplate = Object.fromEntries(
          Array.from(contextRefs)
            .filter((key) => runtimeInputKeys.has(key) || key)
            .map((key) => [key, `{${key}}`]),
        );
        if (Object.keys(contextTemplate).length > 0) {
          transformConfig.contextTemplate = contextTemplate;
          warnings.push(`已自动补全步骤「${step?.name || step?.id || `step_${index + 1}`}」的 contextTemplate，用于传递运行时上下文。`);
        }
      }
    }

    return {
      ...plan,
      steps,
      warnings,
    };
  }

  private extractTemplatePlaceholders(template: string): string[] {
    return Array.from(String(template || '').matchAll(/\{([^{}]+)\}/g))
      .map((match) => String(match[1] || '').trim())
      .filter(Boolean);
  }

  private collectContextReferenceKeys(fieldMappings: Record<string, any>): Set<string> {
    const keys = new Set<string>();
    Object.values(fieldMappings || {}).forEach((value) => {
      if (typeof value !== 'string') {
        return;
      }
      const match = String(value || '').trim().match(/^context\.([^.\s]+)$/);
      if (match?.[1]) {
        keys.add(String(match[1]).trim());
      }
    });
    return keys;
  }

  private collectBlankFieldMappingKeys(fieldMappings: Record<string, any>): string[] {
    return Object.entries(fieldMappings || {})
      .map(([key, value]) => ({
        key: String(key || '').trim(),
        value: typeof value === 'string' ? value.trim() : String(value ?? '').trim(),
      }))
      .filter((item) => item.key && !item.value)
      .map((item) => item.key);
  }

  private hasUsableContextTemplate(value: unknown): boolean {
    if (typeof value === 'string') {
      return Boolean(value.trim());
    }
    if (value && typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>).length > 0;
    }
    return false;
  }

  private async getAiDraftActivityResources(
    support: TemporalWorkflowAiDraftSupport,
  ): Promise<AiDraftActivityResource[]> {
    const builtinActivities = this.builtinActivityRegistry.list().map((activity) => ({
      ref: activity.ref,
      name: activity.name,
      fn: activity.fn,
      timeout: activity.timeout,
      retryPolicy: activity.retryPolicy,
      handler: activity.handler,
      config: activity.config || {},
      generatedCode: activity.generatedCode,
      description: activity.description,
    }));

    const customActivities = await this.prisma.activity.findMany({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
      take: 40,
    }).catch(() => []);

    const normalizedCustomActivities = customActivities.map((activity: any) => ({
      ref: `custom:${activity.id}`,
      name: activity.name,
      fn: activity.fn,
      timeout: activity.timeout || '60s',
      retryPolicy: activity.retryPolicy || undefined,
      handler: activity.handler,
      config: activity.config || {},
      generatedCode: activity.generatedCode || undefined,
      description: support.pickFirstNonEmptyString(
        activity.description,
        activity.config?.description,
      ),
    }));

    return [...builtinActivities, ...normalizedCustomActivities];
  }

  private async analyzeAiWorkflowDraft(
    description: string,
    referenceUrl: string,
    referenceExcerpt: string,
    activityResources: AiDraftActivityResource[],
    support: TemporalWorkflowAiDraftSupport,
  ): Promise<AiWorkflowDraftPlan> {
    const aiOrchestratorUrl = getAiOrchestratorUrl();
    const prompt = buildAnalyzeAiWorkflowDraftPrompt({
      description,
      referenceUrl,
      referenceExcerpt,
      activityResources,
    });

    const response = await axios.post<{ result: string }>(`${aiOrchestratorUrl}/ai/model/call`, {
      modelId: 'default',
      prompt,
    }, { timeout: this.getAiDraftTimeoutMs() });

    return support.parseJsonFromAiContent(response.data?.result || '') as AiWorkflowDraftPlan;
  }

  private async resolveAiWorkflowDraftPlan(
    initialPlan: AiWorkflowDraftPlan,
    description: string,
    referenceUrl: string,
    activityResources: AiDraftActivityResource[],
    support: TemporalWorkflowAiDraftSupport,
  ): Promise<AiWorkflowDraftPlan> {
    const knownActivityRefs = new Set(activityResources.map((item) => item.ref));
    const steps = Array.isArray(initialPlan.steps)
      ? initialPlan.steps.map((step) => ({
        ...step,
        input: support.sanitizeJsonValue(step?.input || {}) as Record<string, any>,
      }))
      : [];

    if (steps.length === 0) {
      return initialPlan;
    }

    const resolvedPlan: AiWorkflowDraftPlan = {
      ...initialPlan,
      steps,
      warnings: Array.isArray(initialPlan.warnings) ? [...initialPlan.warnings] : [],
    };
    const sampleInputs = this.buildAiDraftResolutionSampleInputs(
      resolvedPlan.inputParams,
      referenceUrl,
      steps,
      support,
    );
    const declaredInputKeys = new Set(Object.keys(sampleInputs));
    const stepOutputSamples = new Map<string, unknown>();

    for (let index = 0; index < steps.length; index += 1) {
      const currentStep = steps[index];
      const currentActivityRef = this.pickFirstNonEmptyString(currentStep?.activityRef);
      const currentStepKey = buildAiDraftStepSampleKey(currentStep, index, this.pickFirstNonEmptyString);
      const previousStep = index > 0 ? steps[index - 1] : undefined;
      const previousStepKey = previousStep
        ? buildAiDraftStepSampleKey(previousStep, index - 1, this.pickFirstNonEmptyString)
        : undefined;
      const previousActivityRef = this.pickFirstNonEmptyString(previousStep?.activityRef);
      const nextStep = index + 1 < steps.length ? steps[index + 1] : undefined;
      const nextActivityRef = this.pickFirstNonEmptyString(nextStep?.activityRef);

      if (!currentActivityRef || !knownActivityRefs.has(currentActivityRef)) {
        continue;
      }

      if (
        currentActivityRef === 'builtin:httpRequest'
        && (nextActivityRef === 'builtin:structuredTransform' || nextActivityRef === 'builtin:aiStructuredTransform')
      ) {
        const currentInput = currentStep?.input && typeof currentStep.input === 'object' && !Array.isArray(currentStep.input)
          ? currentStep.input as Record<string, any>
          : {};
        const rawHttpConfig = currentInput[HTTP_REQUEST_STEP_CONFIG_KEY];
        if (!rawHttpConfig || typeof rawHttpConfig !== 'object' || Array.isArray(rawHttpConfig)) {
          continue;
        }

        const userGoal = buildAiDraftResolutionGoal({
          plan: resolvedPlan,
          currentStep: nextStep,
          previousStep: currentStep,
          description,
          pickFirstNonEmptyString: support.pickFirstNonEmptyString,
        });

        let normalizedHttpConfig = support.normalizeHttpRequestConfig(rawHttpConfig, declaredInputKeys);
        let previewResponse: Record<string, any> | undefined;

        try {
          const optimizedHttpResult = await support.optimizeHttpRequestConfig(
            normalizedHttpConfig,
            sampleInputs,
            userGoal,
          );

          if (optimizedHttpResult.success && optimizedHttpResult.optimizedConfig) {
            normalizedHttpConfig = support.normalizeHttpRequestConfig(
              optimizedHttpResult.optimizedConfig,
              declaredInputKeys,
            );
            previewResponse = optimizedHttpResult.previewResponse;
            currentStep.input = {
              ...currentInput,
              [HTTP_REQUEST_STEP_CONFIG_KEY]: normalizedHttpConfig,
            };
          } else {
            const previewResult = await support.previewHttpRequestConfig(normalizedHttpConfig, sampleInputs);
            if (!previewResult.success || !previewResult.previewResponse) {
              (resolvedPlan.warnings as string[]).push(
                `分步解析未能预览步骤「${currentStep.name || currentStep.id || currentStepKey}」: ${previewResult.error || optimizedHttpResult.error || '未知错误'}`,
              );
              continue;
            }
            previewResponse = previewResult.previewResponse;
          }
        } catch (error: any) {
          (resolvedPlan.warnings as string[]).push(
            `分步解析未能处理步骤「${currentStep.name || currentStep.id || currentStepKey}」: ${error?.message || '未知错误'}`,
          );
          continue;
        }

        stepOutputSamples.set(
          currentStepKey,
          this.projectHttpPreviewToStepOutput(previewResponse || {}, normalizedHttpConfig, support),
        );
        continue;
      }

      if (
        (currentActivityRef === 'builtin:structuredTransform' || currentActivityRef === 'builtin:aiStructuredTransform')
        && previousStepKey
        && previousActivityRef
        && stepOutputSamples.has(previousStepKey)
      ) {
        const sourceSample = stepOutputSamples.get(previousStepKey);
        const sourceInput = typeof sourceSample === 'string'
          ? sourceSample
          : (sourceSample && typeof sourceSample === 'object' ? sourceSample as Record<string, any> : String(sourceSample ?? ''));
        const currentInput = currentStep?.input && typeof currentStep.input === 'object' && !Array.isArray(currentStep.input)
          ? currentStep.input as Record<string, any>
          : {};
        const existingTransformConfig = currentInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]
          && typeof currentInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] === 'object'
          ? currentInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] as Record<string, any>
          : {};
        const userGoal = buildAiDraftResolutionGoal({
          plan: resolvedPlan,
          currentStep,
          previousStep,
          description,
          pickFirstNonEmptyString: support.pickFirstNonEmptyString,
        });

        try {
          if (currentActivityRef === 'builtin:structuredTransform') {
            const transformConfigResult = await support.generateStructuredTransformConfig(
              sourceInput,
              userGoal,
              existingTransformConfig,
            );
            if (!transformConfigResult.success || !transformConfigResult.config) {
              (resolvedPlan.warnings as string[]).push(
                `分步解析未能生成步骤「${currentStep.name || currentStep.id || currentStepKey}」的固定规则转换配置: ${transformConfigResult.error || '未知错误'}`,
              );
              continue;
            }

            const normalizedTransformConfig = support.normalizeStructuredTransformConfig(
              {
                ...existingTransformConfig,
                ...transformConfigResult.config,
              },
              buildStructuredTransformPlaceholderKeys(
                sampleInputs,
                existingTransformConfig,
                transformConfigResult.config,
              ),
            );
            currentStep.input = {
              ...currentInput,
              [STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]: normalizedTransformConfig,
            };
            stepOutputSamples.set(
              currentStepKey,
              this.simulateFixedStructuredTransformOutputSample(sourceSample, normalizedTransformConfig, support),
            );
            (resolvedPlan.warnings as string[]).push(
              `已基于步骤「${previousStep?.name || previousStep?.id || previousStepKey}」的真实响应样本，补全「${currentStep.name || currentStep.id || currentStepKey}」固定规则配置。`,
            );
            continue;
          }

          const aiTransformConfigResult = await support.generateAiStructuredTransformDraftConfig(
            sourceInput,
            userGoal,
            existingTransformConfig,
          );
          if (!aiTransformConfigResult.success || !aiTransformConfigResult.config) {
            (resolvedPlan.warnings as string[]).push(
              `分步解析未能生成步骤「${currentStep.name || currentStep.id || currentStepKey}」的 AI 转换配置: ${aiTransformConfigResult.error || '未知错误'}`,
            );
            continue;
          }

          const normalizedAiTransformConfig = support.normalizeStructuredTransformConfig(
            {
              ...existingTransformConfig,
              ...aiTransformConfigResult.config,
            },
              buildStructuredTransformPlaceholderKeys(
              sampleInputs,
              existingTransformConfig,
              aiTransformConfigResult.config,
            ),
          );
          currentStep.input = {
            ...currentInput,
            [STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]: normalizedAiTransformConfig,
          };
          stepOutputSamples.set(
            currentStepKey,
            aiTransformConfigResult.sampleOutput ?? this.simulateAiStructuredTransformOutputSample(
              sourceSample,
              normalizedAiTransformConfig,
              support,
            ),
          );
          (resolvedPlan.warnings as string[]).push(
            `已基于步骤「${previousStep?.name || previousStep?.id || previousStepKey}」的真实响应样本，补全「${currentStep.name || currentStep.id || currentStepKey}」AI 转换配置。`,
          );
        } catch (error: any) {
          (resolvedPlan.warnings as string[]).push(
            `分步解析未能补全步骤「${currentStep.name || currentStep.id || currentStepKey}」: ${error?.message || '未知错误'}`,
          );
        }
      }
    }

    return resolvedPlan;
  }

  private buildAiDraftResolutionSampleInputs(
    inputParams: AiWorkflowDraftPlan['inputParams'],
    referenceUrl: string,
    steps: NonNullable<AiWorkflowDraftPlan['steps']>,
    support: TemporalWorkflowAiDraftSupport,
  ): Record<string, any> {
    const result: Record<string, any> = {};
    const knownEntries = Object.entries(inputParams || {});
    const placeholderKeys = new Set<string>();
    const inferredReferenceSamples = this.extractAiDraftSampleValuesFromReferenceUrl(referenceUrl, steps);

    steps.forEach((step) => {
      support.collectTemplateVariables(step?.input || {}, placeholderKeys);
    });

    [...knownEntries.map(([key]) => key), ...Array.from(placeholderKeys)].forEach((rawKey) => {
      const key = String(rawKey || '').trim();
      if (!key || result[key] !== undefined) {
        return;
      }
      const config = inputParams?.[key];
      const defaultValue = support.pickFirstNonEmptyString(config?.defaultValue);
      if (defaultValue) {
        result[key] = defaultValue;
        return;
      }
      if (inferredReferenceSamples[key] !== undefined) {
        result[key] = inferredReferenceSamples[key];
        return;
      }
      result[key] = this.buildGenericAiDraftSampleValue(
        key,
        support.pickFirstNonEmptyString(config?.description),
        referenceUrl,
      );
    });

    return result;
  }

  private buildGenericAiDraftSampleValue(
    key: string,
    description: string | undefined,
    referenceUrl: string,
  ): string | number | boolean {
    const hint = `${key} ${description || ''}`.toLowerCase();
    const normalizedKey = String(key || '')
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'value';
    if (/(url|uri|link|网址|链接)/i.test(hint)) {
      return referenceUrl || `https://example.com/${normalizedKey}`;
    }
    if (/(bool|boolean|启用|是否)/i.test(hint)) {
      return true;
    }
    if (/(number|int|float|double|decimal|count|size|limit|page|offset|age|数量|页码|大小|编号)/i.test(hint)) {
      return 1;
    }
    if (/(date|day|time|datetime|时间|日期)/i.test(hint)) {
      return new Date().toISOString().slice(0, 10);
    }
    return `sample_${normalizedKey}`;
  }

  private extractAiDraftSampleValuesFromReferenceUrl(
    referenceUrl: string,
    steps: NonNullable<AiWorkflowDraftPlan['steps']>,
  ): Record<string, string> {
    const resolved: Record<string, string> = {};
    const targetUrl = String(referenceUrl || '').trim();
    if (!targetUrl) {
      return resolved;
    }

    let actualUrl: URL;
    try {
      actualUrl = new URL(targetUrl);
    } catch {
      return resolved;
    }

    for (const step of steps) {
      const activityRef = this.pickFirstNonEmptyString(step?.activityRef);
      if (activityRef !== 'builtin:httpRequest') {
        continue;
      }
      const stepInput = step?.input && typeof step.input === 'object' && !Array.isArray(step.input)
        ? step.input as Record<string, any>
        : {};
      const httpConfig = stepInput[HTTP_REQUEST_STEP_CONFIG_KEY];
      if (!httpConfig || typeof httpConfig !== 'object' || Array.isArray(httpConfig)) {
        continue;
      }

      const urlTemplate = String(httpConfig.urlTemplate || '').trim();
      try {
        const templateUrl = new URL(urlTemplate.replace(/\{[^{}]+\}/g, '__placeholder__'));
        if (templateUrl.origin === actualUrl.origin) {
          const templatePath = urlTemplate
            .replace(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\/[^/]+/, '')
            .split('?')[0] || '/';
          const templateSegments = templatePath.split('/').filter(Boolean).map((item) => {
            try {
              return decodeURIComponent(item);
            } catch {
              return item;
            }
          });
          const actualSegments = actualUrl.pathname.split('/').filter(Boolean);
          if (templateSegments.length === actualSegments.length) {
            templateSegments.forEach((segment, index) => {
              const tokenMatch = segment.match(/^\{([^{}]+)\}$/);
              if (!tokenMatch) {
                return;
              }
              const token = String(tokenMatch[1] || '').trim();
              const actualValue = actualSegments[index];
              if (token && actualValue) {
                resolved[token] = decodeURIComponent(actualValue);
              }
            });
          }
        }
      } catch {
        // ignore malformed template URL and continue with query inference only
      }

      const queryTemplate = httpConfig.queryTemplate && typeof httpConfig.queryTemplate === 'object' && !Array.isArray(httpConfig.queryTemplate)
        ? httpConfig.queryTemplate as Record<string, any>
        : {};
      Object.entries(queryTemplate).forEach(([queryKey, queryValue]) => {
        const tokenMatch = String(queryValue || '').trim().match(/^\{([^{}]+)\}$/);
        if (!tokenMatch) {
          return;
        }
        const token = String(tokenMatch[1] || '').trim();
        const actualValue = actualUrl.searchParams.get(String(queryKey || '').trim());
        if (token && actualValue) {
          resolved[token] = actualValue;
        }
      });
    }

    return resolved;
  }

  private projectHttpPreviewToStepOutput(
    previewResponse: Record<string, any>,
    httpConfig: Record<string, any>,
    support: TemporalWorkflowAiDraftSupport,
  ): unknown {
    const responseMode = String(httpConfig?.responseMode || 'body').trim();
    const body = previewResponse?.body ?? previewResponse;

    if (responseMode === 'full') {
      return previewResponse;
    }
    if (responseMode === 'bodyPath') {
      return support.extractValueByPath(body, String(httpConfig?.responseBodyPath || ''));
    }
    if (responseMode === 'bodyMap') {
      const mappings = httpConfig?.responseFieldMappings && typeof httpConfig.responseFieldMappings === 'object' && !Array.isArray(httpConfig.responseFieldMappings)
        ? httpConfig.responseFieldMappings as Record<string, any>
        : {};
      return Object.fromEntries(
        Object.entries(mappings).map(([key, path]) => [
          String(key || '').trim(),
          support.extractValueByPath(body, String(path || '').trim()),
        ]),
      );
    }
    return body;
  }

  private simulateFixedStructuredTransformOutputSample(
    sourceSample: unknown,
    transformConfig: Record<string, any>,
    support: TemporalWorkflowAiDraftSupport,
  ): unknown {
    const normalizedConfig = support.normalizeStructuredTransformConfig(
      transformConfig || {},
      buildStructuredTransformPlaceholderKeys({}, transformConfig),
    );
    const outputMode = String(normalizedConfig.outputMode || 'json').trim().toLowerCase();
    const sourceObject = sourceSample && typeof sourceSample === 'object' && !Array.isArray(sourceSample)
      ? sourceSample as Record<string, unknown>
      : {};
    const fieldMappings = normalizedConfig.fieldMappings && typeof normalizedConfig.fieldMappings === 'object' && !Array.isArray(normalizedConfig.fieldMappings)
      ? normalizedConfig.fieldMappings as Record<string, any>
      : {};
    const values: Record<string, unknown> = {
      ...sourceObject,
      content: typeof sourceSample === 'string' ? sourceSample : JSON.stringify(sourceSample ?? ''),
    };

    Object.entries(fieldMappings).forEach(([key, mapping]) => {
      const mappingPath = String(mapping || '').trim();
      if (!mappingPath) {
        return;
      }
      if (Object.prototype.hasOwnProperty.call(sourceObject, mappingPath)) {
        values[key] = sourceObject[mappingPath];
        return;
      }
      values[key] = support.extractValueByPath(sourceSample, mappingPath);
    });

    if (outputMode === 'text') {
      const rendered = support.renderHttpTemplateValue(
        String(normalizedConfig.textTemplate || '{content}'),
        values,
      );
      return String(rendered ?? '').trim();
    }

    const outputSchema = normalizedConfig.outputSchema && typeof normalizedConfig.outputSchema === 'object' && !Array.isArray(normalizedConfig.outputSchema)
      ? normalizedConfig.outputSchema as Record<string, any>
      : {};
    const resultKeys = Object.keys(fieldMappings).length > 0
      ? Object.keys(fieldMappings)
      : Object.keys(outputSchema);
    if (resultKeys.length === 0) {
      return sourceSample;
    }
    return Object.fromEntries(
      resultKeys.map((key) => [
        key,
        values[key] !== undefined ? values[key] : support.extractValueByPath(sourceSample, key),
      ]),
    );
  }

  private simulateAiStructuredTransformOutputSample(
    sourceSample: unknown,
    transformConfig: Record<string, any>,
    support: TemporalWorkflowAiDraftSupport,
  ): unknown {
    const normalizedConfig = support.normalizeStructuredTransformConfig(
      transformConfig || {},
      buildStructuredTransformPlaceholderKeys({}, transformConfig),
    );
    const outputMode = String(normalizedConfig.outputMode || 'json').trim().toLowerCase();
    if (outputMode === 'text') {
      if (typeof sourceSample === 'string') {
        return sourceSample;
      }
      return JSON.stringify(sourceSample ?? '').slice(0, 500);
    }

    const outputSchema = normalizedConfig.outputSchema && typeof normalizedConfig.outputSchema === 'object' && !Array.isArray(normalizedConfig.outputSchema)
      ? normalizedConfig.outputSchema as Record<string, any>
      : {};
    const sourceObject = sourceSample && typeof sourceSample === 'object' && !Array.isArray(sourceSample)
      ? sourceSample as Record<string, unknown>
      : {};
    const keys = Object.keys(outputSchema);
    if (keys.length === 0) {
      return sourceSample;
    }
    return Object.fromEntries(
      keys.map((key) => [
        key,
        sourceObject[key] !== undefined
          ? sourceObject[key]
          : support.buildPlaceholderValueFromSchemaHint(outputSchema[key], key),
      ]),
    );
  }

  private async repairAiWorkflowDraftPlanIfNeeded(
    initialPlan: AiWorkflowDraftPlan,
    description: string,
    referenceUrl: string,
    referenceExcerpt: string,
    activityResources: AiDraftActivityResource[],
    support: TemporalWorkflowAiDraftSupport,
  ): Promise<AiWorkflowDraftPlan> {
    let plan = this.repairCommonDraftPlanIssues(initialPlan);

    for (let round = 0; round < 2; round += 1) {
      const issues = this.validatePlan(plan, activityResources);
      if (issues.length === 0) {
        return plan;
      }
      plan = await this.repairAiWorkflowDraftPlan(
        plan,
        issues,
        description,
        referenceUrl,
        referenceExcerpt,
        activityResources,
        support,
      );
      plan = this.repairCommonDraftPlanIssues(plan);
    }

    plan = this.repairCommonDraftPlanIssues(plan);
    const finalIssues = this.validatePlan(plan, activityResources);
    if (finalIssues.length === 0) {
      return plan;
    }

    return {
      ...plan,
      warnings: [
        ...(Array.isArray(plan.warnings) ? plan.warnings : []),
        ...finalIssues.map((item) => `AI 草稿自动修复后仍需确认: ${item}`),
      ],
    };
  }

  private async repairAiWorkflowDraftPlan(
    currentPlan: AiWorkflowDraftPlan,
    issues: string[],
    description: string,
    referenceUrl: string,
    referenceExcerpt: string,
    activityResources: AiDraftActivityResource[],
    support: TemporalWorkflowAiDraftSupport,
  ): Promise<AiWorkflowDraftPlan> {
    const aiOrchestratorUrl = getAiOrchestratorUrl();
    const prompt = buildRepairAiWorkflowDraftPlanPrompt({
      currentPlan,
      issues,
      description,
      referenceUrl,
      referenceExcerpt,
      activityResources,
    });

    const response = await axios.post<{ result: string }>(`${aiOrchestratorUrl}/ai/model/call`, {
      modelId: 'default',
      prompt,
    }, { timeout: this.getAiDraftTimeoutMs() });

    return support.parseJsonFromAiContent(response.data?.result || '') as AiWorkflowDraftPlan;
  }

  private async analyzeAiWorkflowRefinement(
    currentWorkflowDsl: WorkflowDsl,
    currentActivityDsl: ActivityDsl,
    userPrompt: string,
    activityResources: AiDraftActivityResource[],
    support: TemporalWorkflowAiDraftSupport,
  ): Promise<AiWorkflowDraftPlan> {
    const aiOrchestratorUrl = getAiOrchestratorUrl();
    const prompt = buildAnalyzeAiWorkflowRefinementPrompt({
      currentWorkflowDsl,
      currentActivityDsl,
      userPrompt,
      activityResources,
    });

    const response = await axios.post<{ result: string }>(`${aiOrchestratorUrl}/ai/model/call`, {
      modelId: 'default',
      prompt,
    }, { timeout: this.getAiDraftTimeoutMs() });

    return support.parseJsonFromAiContent(response.data?.result || '') as AiWorkflowDraftPlan;
  }

  private async materializeAiWorkflowDraft(
    plan: AiWorkflowDraftPlan,
    activityResources: AiDraftActivityResource[],
    description: string,
    referenceUrl: string,
    support: TemporalWorkflowAiDraftSupport,
  ): Promise<AiWorkflowDraft> {
    const activityResourceMap = new Map(activityResources.map((item) => [item.ref, item]));
    const rawSteps = Array.isArray(plan.steps) ? plan.steps : [];

    if (rawSteps.length === 0) {
      throw new BadRequestException('AI 未生成任何工作流步骤');
    }

    const workflowIntentText = [
      plan.workflowName,
      plan.workflowDescription,
      description,
      plan.extraPrompt,
    ].filter(Boolean).join('\n');

    const steps: WorkflowStep[] = rawSteps.map((step, index) => {
      const activityRef = support.pickFirstNonEmptyString(step.activityRef);
      if (!activityRef || !activityResourceMap.has(activityRef)) {
        throw new BadRequestException(`AI 生成了未注册的 activityRef: ${activityRef || '空'}`);
      }
      const activity = activityResourceMap.get(activityRef)!;
      const previousStep = index > 0 ? rawSteps[index - 1] : undefined;
      return {
        id: support.pickFirstNonEmptyString(step.id) || `step_${index + 1}`,
        name: support.pickFirstNonEmptyString(step.name, activity.name) || `步骤${index + 1}`,
        type: 'activity',
        activityRef,
        activityName: support.pickFirstNonEmptyString(step.activityName, activity.name) || activity.name,
        startToCloseTimeout: support.pickFirstNonEmptyString(step.startToCloseTimeout, activity.timeout),
        input: support.normalizeAiDraftStepInput(
          support.sanitizeJsonValue(step.input || {}) as Record<string, any>,
          activityRef,
          support.pickFirstNonEmptyString(step.name, activity.name) || `步骤${index + 1}`,
          workflowIntentText,
          previousStep?.activityRef,
        ),
      };
    });

    const rawActivities = Array.isArray(plan.activities) ? plan.activities : [];
    const referencedActivityRefs = Array.from(new Set(steps.map((step) => step.activityRef).filter(Boolean))) as string[];
    const activityDsl: ActivityDsl = {
      activities: referencedActivityRefs.map((activityRef) => {
        const resource = activityResourceMap.get(activityRef)!;
        const activityPlan = rawActivities.find((item) => item?.activityRef === activityRef);
        return {
          name: support.pickFirstNonEmptyString(activityPlan?.name, resource.name) || resource.name,
          fn: resource.fn,
          timeout: support.pickFirstNonEmptyString(activityPlan?.timeout, resource.timeout) || resource.timeout,
          retryPolicy: activityPlan?.retryPolicy || resource.retryPolicy,
          handler: resource.handler,
          config: support.sanitizeJsonValue({
            ...(resource.config || {}),
            ...(activityPlan?.config || {}),
          }),
          generatedCode: resource.generatedCode,
        };
      }),
    };

    const workflowName = support.normalizeName(
      plan.workflowName
      || support.pickFirstNonEmptyString(description.split(/[。.!?\n]/)[0])
      || 'AI 生成工作流',
    );
    const taskQueue = support.normalizeTaskQueue(plan.taskQueue || 'SKILL_TASK_QUEUE');
    const workflowDsl = await support.normalizeWorkflowDsl({
      name: workflowName,
      workflowClassName: support.normalizeWorkflowClassName(plan.workflowClassName, workflowName),
      workflowDefnName: support.pickFirstNonEmptyString(plan.workflowDefnName, workflowName) || workflowName,
      taskQueue,
      conditionals: [],
      sourceContext: {
        sourceType: referenceUrl ? 'url' : 'text',
        referenceUrl: referenceUrl || undefined,
        userDescription: description || undefined,
        generatedAt: new Date().toISOString(),
        warnings: Array.isArray(plan.warnings)
          ? plan.warnings.filter((item) => typeof item === 'string' && item.trim())
          : [],
      },
      inputParams: support.normalizeDraftInputParams(plan.inputParams, steps, referenceUrl),
      outputParams: support.normalizeDraftOutputParams(plan.outputParams),
      extraPrompt: [
        support.pickFirstNonEmptyString(plan.extraPrompt),
        referenceUrl ? `参考 URL: ${referenceUrl}` : '',
        description ? `用户目标: ${description}` : '',
      ].filter(Boolean).join('\n'),
      steps,
    } as WorkflowDsl, workflowName, taskQueue, activityDsl);

    return {
      name: workflowName,
      description: support.normalizeDescription(plan.workflowDescription) || `${workflowName}（AI 生成草稿）`,
      taskQueue,
      workflowDsl,
      activityDsl,
      warnings: [],
    };
  }

  private pickFirstNonEmptyString(...values: unknown[]): string {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return '';
  }
}
