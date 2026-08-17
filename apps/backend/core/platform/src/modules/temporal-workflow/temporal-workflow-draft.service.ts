import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
import {
  buildAiDraftResolutionSampleInputs,
  projectHttpPreviewToStepOutput,
  repairCommonDraftPlanIssues,
  simulateAiStructuredTransformOutputSample,
  simulateFixedStructuredTransformOutputSample,
  validateAiWorkflowDraftPlan,
} from './temporal-workflow-draft-plan.helpers';
import { compileDraftValidationContract } from './temporal-workflow-draft-validation.compiler';
import type {
  ActivityDsl,
  AiWorkflowDraft,
  GenerateAiWorkflowDraftDTO,
  RefineAiWorkflowDraftDTO,
  WorkflowDsl,
  WorkflowInputParamDefinition,
  WorkflowOutputParamDefinition,
  WorkflowValidationContract,
  WorkflowStep,
} from './temporal-workflow.types';

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
  validation?: WorkflowValidationContract;
  outputParams?: Record<string, WorkflowOutputParamDefinition>;
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
  normalizeHttpRequestConfig(
    config: Record<string, any>,
    declaredInputKeys?: Set<string>
  ): Record<string, any>;
  optimizeHttpRequestConfig(
    stepConfig: Record<string, any>,
    inputParams?: Record<string, any>,
    userRequest?: string
  ): Promise<{
    success: boolean;
    optimizedConfig?: Record<string, any>;
    previewResponse?: Record<string, any>;
    explanation?: string;
    error?: string;
  }>;
  previewHttpRequestConfig(
    stepConfig: Record<string, any>,
    inputParams?: Record<string, any>
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
    existingConfig?: Record<string, any>
  ): Promise<{
    success: boolean;
    config?: Record<string, any>;
    explanation?: string;
    error?: string;
  }>;
  generateAiStructuredTransformDraftConfig(
    sourceSample: Record<string, any> | string,
    userRequest: string,
    existingConfig?: Record<string, any>
  ): Promise<{
    success: boolean;
    config?: Record<string, any>;
    sampleOutput?: unknown;
    explanation?: string;
    error?: string;
  }>;
  normalizeStructuredTransformConfig(
    config: Record<string, any>,
    placeholderKeys?: Set<string>
  ): Record<string, any>;
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
    activityDsl?: ActivityDsl
  ): Promise<WorkflowDsl>;
  normalizeDraftInputParams(
    inputParams?: Record<string, WorkflowInputParamDefinition>,
    steps?: WorkflowStep[],
    referenceUrl?: string
  ): WorkflowDsl['inputParams'];
  normalizeDraftOutputParams(
    outputParams?: Record<string, WorkflowOutputParamDefinition>
  ): WorkflowDsl['outputParams'];
  deriveV2OutputFromOutputParams(args: {
    outputParams?: Record<string, WorkflowOutputParamDefinition>;
    steps: WorkflowStep[];
  }): WorkflowDsl['v2Output'];
  normalizeAiDraftStepInput(
    rawInput: Record<string, any>,
    activityRef: string,
    stepName: string,
    workflowIntentText: string,
    previousActivityRef?: string
  ): Record<string, any>;
}

export interface AiDraftGenerationContext {
  readonly description: string;
  readonly referenceUrl: string;
  readonly referenceExcerpt: string;
  readonly skillFileContent?: string;
  readonly skillFileType?: string;
  readonly activityResources: AiDraftActivityResource[];
  readonly knownActivityRefs: Set<string>;
  readonly support: TemporalWorkflowAiDraftSupport;
}

@Injectable()
export class TemporalWorkflowAiDraftService {
  private readonly logger = new Logger(TemporalWorkflowAiDraftService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly builtinActivityRegistry: BuiltinActivityRegistry
  ) {}

  private getAiDraftTimeoutMs(): number {
    const configured = Number(
      process.env.TEMPORAL_WORKFLOW_AI_DRAFT_TIMEOUT_MS ||
        process.env.AI_ORCHESTRATOR_TIMEOUT_MS ||
        300000
    );
    return Number.isFinite(configured) && configured > 0 ? configured : 300000;
  }

  async generateWorkflowDraft(
    data: GenerateAiWorkflowDraftDTO,
    support: TemporalWorkflowAiDraftSupport
  ): Promise<AiWorkflowDraft> {
    const description = String(data?.description || '').trim();
    const referenceUrl = String(data?.referenceUrl || '').trim();
    const skillFileContent = String(data?.skillFileContent || '').trim() || undefined;
    const skillFileType = String(data?.skillFileType || '').trim() || undefined;

    if (!description && !referenceUrl && !skillFileContent) {
      throw new BadRequestException('请提供工作流说明、技能文件或参考 URL');
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
    const ctx: AiDraftGenerationContext = {
      description,
      referenceUrl,
      referenceExcerpt,
      skillFileContent,
      skillFileType,
      activityResources,
      knownActivityRefs: new Set(activityResources.map((item) => item.ref)),
      support,
    };
    const initialPlan = await this.analyzeAiWorkflowDraft(ctx);
    const resolvedPlan = await this.resolveAiWorkflowDraftPlan(ctx, initialPlan);
    const plan = await this.repairAiWorkflowDraftPlanIfNeeded(ctx, resolvedPlan);
    const draft = await this.materializeAiWorkflowDraft(ctx, plan);

    return {
      ...draft,
      warnings: [
        ...warnings,
        ...(plan.warnings || []).filter((item) => typeof item === 'string' && item.trim()),
      ],
      sourceContext: draft.workflowDsl.sourceContext,
    };
  }


  async refineWorkflowDraft(
    data: RefineAiWorkflowDraftDTO,
    support: TemporalWorkflowAiDraftSupport
  ): Promise<AiWorkflowDraft> {
    const userPrompt = String(data?.userPrompt || '').trim();
    if (!userPrompt) {
      throw new BadRequestException('请提供改进说明');
    }

    const activityResources = await this.getAiDraftActivityResources(support);
    const referenceUrl = data.currentWorkflowDsl.sourceContext?.referenceUrl || '';
    const ctx: AiDraftGenerationContext = {
      description: userPrompt,
      referenceUrl,
      referenceExcerpt: '',
      skillFileContent: undefined,
      skillFileType: undefined,
      activityResources,
      knownActivityRefs: new Set(activityResources.map((item) => item.ref)),
      support,
    };
    const initialPlan = await this.analyzeAiWorkflowRefinement(
      data.currentWorkflowDsl,
      data.currentActivityDsl,
      userPrompt,
      activityResources,
      support
    );
    const resolvedPlan = await this.resolveAiWorkflowDraftPlan(ctx, initialPlan);
    const plan = await this.repairAiWorkflowDraftPlanIfNeeded(ctx, resolvedPlan);
    const draft = await this.materializeAiWorkflowDraft(ctx, plan);

    return {
      ...draft,
      warnings: plan.warnings || [],
      sourceContext: {
        ...draft.workflowDsl.sourceContext,
        userDescription: `改进请求: ${userPrompt}\n原描述: ${data.currentWorkflowDsl.sourceContext?.userDescription || '无'}`,
      },
    };
  }

  validatePlan(plan: AiWorkflowDraftPlan, activityResources: AiDraftActivityResource[]): string[] {
    return validateAiWorkflowDraftPlan(plan, activityResources, {
      pickFirstNonEmptyString: (...values) => this.pickFirstNonEmptyString(...values),
      buildWorkflowSemanticHint: (...values) => this.buildWorkflowSemanticHint(...values),
    });
  }

  private async getAiDraftActivityResources(
    support: TemporalWorkflowAiDraftSupport
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

    const customActivities = await this.prisma.activity
      .findMany({
        where: { isActive: true },
        orderBy: { updatedAt: 'desc' },
        take: 40,
      })
      .catch(() => []);

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
        activity.config?.description
      ),
    }));

    return [...builtinActivities, ...normalizedCustomActivities];
  }

  private async analyzeAiWorkflowDraft(
    ctx: AiDraftGenerationContext
  ): Promise<AiWorkflowDraftPlan> {
    const { description, referenceUrl, referenceExcerpt, activityResources, support, skillFileContent, skillFileType } = ctx;
    const aiOrchestratorUrl = getAiOrchestratorUrl();
    const prompt = buildAnalyzeAiWorkflowDraftPrompt({
      description,
      referenceUrl,
      referenceExcerpt,
      activityResources,
      skillFileContent,
      skillFileType,
    });

    const response = await axios.post<{ result: string }>(
      `${aiOrchestratorUrl}/ai/model/call`,
      {
        modelId: 'default',
        prompt,
      },
      { timeout: this.getAiDraftTimeoutMs() }
    );

    return support.parseJsonFromAiContent(response.data?.result || '') as AiWorkflowDraftPlan;
  }


  private async resolveAiWorkflowDraftPlan(
    ctx: AiDraftGenerationContext,
    initialPlan: AiWorkflowDraftPlan
  ): Promise<AiWorkflowDraftPlan> {
    const { description, referenceUrl, knownActivityRefs, support } = ctx;
    const steps = Array.isArray(initialPlan.steps)
      ? initialPlan.steps.map((step) => ({
          ...step,
          input: support.sanitizeJsonValue(step?.input || {}) as Record<string, any>,
        }))
      : [];

    if (steps.length === 0) {
      return initialPlan;
    }

    let resolvedPlan: AiWorkflowDraftPlan = {
      ...initialPlan,
      steps,
      warnings: Array.isArray(initialPlan.warnings) ? [...initialPlan.warnings] : [],
    };
    const sampleInputs = buildAiDraftResolutionSampleInputs(
      resolvedPlan.inputParams,
      referenceUrl,
      steps,
      support,
      {
        pickFirstNonEmptyString: (...values) => this.pickFirstNonEmptyString(...values),
        buildWorkflowSemanticHint: (...values) => this.buildWorkflowSemanticHint(...values),
      }
    );
    const declaredInputKeys = new Set(Object.keys(sampleInputs));
    const stepOutputSamples = new Map<string, unknown>();

    for (let index = 0; index < steps.length; index += 1) {
      const currentStep = steps[index];
      const currentActivityRef = this.pickFirstNonEmptyString(currentStep?.activityRef);
      const currentStepKey = buildAiDraftStepSampleKey(
        currentStep,
        index,
        this.pickFirstNonEmptyString
      );
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
        currentActivityRef === 'builtin:httpRequest' &&
        (nextActivityRef === 'builtin:structuredTransform' ||
          nextActivityRef === 'builtin:aiStructuredTransform')
      ) {
        const currentInput =
          currentStep?.input &&
          typeof currentStep.input === 'object' &&
          !Array.isArray(currentStep.input)
            ? (currentStep.input as Record<string, any>)
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

        let normalizedHttpConfig = support.normalizeHttpRequestConfig(
          rawHttpConfig,
          declaredInputKeys
        );
        let previewResponse: Record<string, any> | undefined;

        try {
          const optimizedHttpResult = await support.optimizeHttpRequestConfig(
            normalizedHttpConfig,
            sampleInputs,
            userGoal
          );

          if (optimizedHttpResult.success && optimizedHttpResult.optimizedConfig) {
            normalizedHttpConfig = support.normalizeHttpRequestConfig(
              optimizedHttpResult.optimizedConfig,
              declaredInputKeys
            );
            previewResponse = optimizedHttpResult.previewResponse;
            currentStep.input = {
              ...currentInput,
              [HTTP_REQUEST_STEP_CONFIG_KEY]: normalizedHttpConfig,
            };
          } else {
            const previewResult = await support.previewHttpRequestConfig(
              normalizedHttpConfig,
              sampleInputs
            );
            if (!previewResult.success || !previewResult.previewResponse) {
              resolvedPlan = this.appendDraftWarning(
                resolvedPlan,
                `分步解析未能预览步骤「${currentStep.name || currentStep.id || currentStepKey}」: ${previewResult.error || optimizedHttpResult.error || '未知错误'}`
              );
              continue;
            }
            previewResponse = previewResult.previewResponse;
          }
        } catch (error: any) {
          resolvedPlan = this.appendDraftWarning(
            resolvedPlan,
            `分步解析未能处理步骤「${currentStep.name || currentStep.id || currentStepKey}」: ${error?.message || '未知错误'}`
          );
          continue;
        }

        stepOutputSamples.set(
          currentStepKey,
          projectHttpPreviewToStepOutput(previewResponse || {}, normalizedHttpConfig, support)
        );
        continue;
      }

      if (
        (currentActivityRef === 'builtin:structuredTransform' ||
          currentActivityRef === 'builtin:aiStructuredTransform') &&
        previousStepKey &&
        previousActivityRef &&
        stepOutputSamples.has(previousStepKey)
      ) {
        const sourceSample = stepOutputSamples.get(previousStepKey);
        const sourceInput =
          typeof sourceSample === 'string'
            ? sourceSample
            : sourceSample && typeof sourceSample === 'object'
              ? (sourceSample as Record<string, any>)
              : String(sourceSample ?? '');
        const currentInput =
          currentStep?.input &&
          typeof currentStep.input === 'object' &&
          !Array.isArray(currentStep.input)
            ? (currentStep.input as Record<string, any>)
            : {};
        const existingTransformConfig =
          currentInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] &&
          typeof currentInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] === 'object'
            ? (currentInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] as Record<string, any>)
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
              existingTransformConfig
            );
            if (!transformConfigResult.success || !transformConfigResult.config) {
              resolvedPlan = this.appendDraftWarning(
                resolvedPlan,
                `分步解析未能生成步骤「${currentStep.name || currentStep.id || currentStepKey}」的固定规则转换配置: ${transformConfigResult.error || '未知错误'}`
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
                transformConfigResult.config
              )
            );
            currentStep.input = {
              ...currentInput,
              [STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]: normalizedTransformConfig,
            };
            stepOutputSamples.set(
              currentStepKey,
              simulateFixedStructuredTransformOutputSample(
                sourceSample,
                normalizedTransformConfig,
                support
              )
            );
            resolvedPlan = this.appendDraftWarning(
              resolvedPlan,
              `已基于步骤「${previousStep?.name || previousStep?.id || previousStepKey}」的真实响应样本，补全「${currentStep.name || currentStep.id || currentStepKey}」固定规则配置。`
            );
            continue;
          }

          const aiTransformConfigResult = await support.generateAiStructuredTransformDraftConfig(
            sourceInput,
            userGoal,
            existingTransformConfig
          );
          if (!aiTransformConfigResult.success || !aiTransformConfigResult.config) {
            resolvedPlan = this.appendDraftWarning(
              resolvedPlan,
              `分步解析未能生成步骤「${currentStep.name || currentStep.id || currentStepKey}」的 AI 转换配置: ${aiTransformConfigResult.error || '未知错误'}`
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
              aiTransformConfigResult.config
            )
          );
          currentStep.input = {
            ...currentInput,
            [STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]: normalizedAiTransformConfig,
          };
          stepOutputSamples.set(
            currentStepKey,
            aiTransformConfigResult.sampleOutput ??
              simulateAiStructuredTransformOutputSample(
                sourceSample,
                normalizedAiTransformConfig,
                support
              )
          );
          resolvedPlan = this.appendDraftWarning(
            resolvedPlan,
            `已基于步骤「${previousStep?.name || previousStep?.id || previousStepKey}」的真实响应样本，补全「${currentStep.name || currentStep.id || currentStepKey}」AI 转换配置。`
          );
        } catch (error: any) {
          resolvedPlan = this.appendDraftWarning(
            resolvedPlan,
            `分步解析未能补全步骤「${currentStep.name || currentStep.id || currentStepKey}」: ${error?.message || '未知错误'}`
          );
        }
      }
    }

    return resolvedPlan;
  }

  private async repairAiWorkflowDraftPlanIfNeeded(
    ctx: AiDraftGenerationContext,
    initialPlan: AiWorkflowDraftPlan
  ): Promise<AiWorkflowDraftPlan> {
    const { activityResources } = ctx;
    let plan = repairCommonDraftPlanIssues(initialPlan, {
      pickFirstNonEmptyString: (...values) => this.pickFirstNonEmptyString(...values),
    });

    for (let round = 0; round < 2; round += 1) {
      const issues = this.validatePlan(plan, activityResources);
      if (issues.length === 0) {
        return plan;
      }
      plan = await this.repairAiWorkflowDraftPlan(ctx, plan, issues);
      plan = repairCommonDraftPlanIssues(plan, {
        pickFirstNonEmptyString: (...values) => this.pickFirstNonEmptyString(...values),
      });
    }

    plan = repairCommonDraftPlanIssues(plan, {
      pickFirstNonEmptyString: (...values) => this.pickFirstNonEmptyString(...values),
    });
    const finalIssues = this.validatePlan(plan, activityResources);
    if (finalIssues.length === 0) {
      return plan;
    }

    return {
      ...plan,
      warnings: [
        ...(Array.isArray(plan.warnings) ? plan.warnings : []),
        ...finalIssues.map((item) => {
          const hint = item.includes('activityRef')
            ? '→ 请在编辑器中手动选择正确的 Activity'
            : item.includes('__httpRequest')
              ? '→ 请在步骤配置中补充 HTTP 请求参数'
              : item.includes('__structuredTransform')
                ? '→ 请在步骤配置中补全结构化转换配置'
                : '→ 请在编辑器中手动检查';
          return `AI 草稿自动修复后仍需确认: ${item} ${hint}`;
        }),
      ],
    };
  }

  private async repairAiWorkflowDraftPlan(
    ctx: AiDraftGenerationContext,
    currentPlan: AiWorkflowDraftPlan,
    issues: string[]
  ): Promise<AiWorkflowDraftPlan> {
    try {
      const { description, referenceUrl, referenceExcerpt, activityResources, support } = ctx;
      const aiOrchestratorUrl = getAiOrchestratorUrl();
      const prompt = buildRepairAiWorkflowDraftPlanPrompt({
        currentPlan,
        issues,
        description,
        referenceUrl,
        referenceExcerpt,
        activityResources,
      });

      const response = await axios.post<{ result: string }>(
        `${aiOrchestratorUrl}/ai/model/call`,
        {
          modelId: 'default',
          prompt,
        },
        { timeout: this.getAiDraftTimeoutMs() }
      );

      return support.parseJsonFromAiContent(response.data?.result || '') as AiWorkflowDraftPlan;
    } catch (error: any) {
      this.logger.warn(
        `Failed to parse or repair AI workflow draft plan, falling back to current plan: ${error?.message || error}`
      );
      return currentPlan;
    }
  }

  private async analyzeAiWorkflowRefinement(
    currentWorkflowDsl: WorkflowDsl,
    currentActivityDsl: ActivityDsl,
    userPrompt: string,
    activityResources: AiDraftActivityResource[],
    support: TemporalWorkflowAiDraftSupport
  ): Promise<AiWorkflowDraftPlan> {
    const aiOrchestratorUrl = getAiOrchestratorUrl();
    const prompt = buildAnalyzeAiWorkflowRefinementPrompt({
      currentWorkflowDsl,
      userPrompt,
      activityResources,
    });

    const response = await axios.post<{ result: string }>(
      `${aiOrchestratorUrl}/ai/model/call`,
      {
        modelId: 'default',
        prompt,
      },
      { timeout: this.getAiDraftTimeoutMs() }
    );

    return support.parseJsonFromAiContent(response.data?.result || '') as AiWorkflowDraftPlan;
  }

  private async materializeAiWorkflowDraft(
    ctx: AiDraftGenerationContext,
    plan: AiWorkflowDraftPlan
  ): Promise<AiWorkflowDraft> {
    const { description, referenceUrl, activityResources, support } = ctx;
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
    ]
      .filter(Boolean)
      .join('\n');

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
        activityName:
          support.pickFirstNonEmptyString(step.activityName, activity.name) || activity.name,
        startToCloseTimeout: support.pickFirstNonEmptyString(
          step.startToCloseTimeout,
          activity.timeout
        ),
        input: support.normalizeAiDraftStepInput(
          support.sanitizeJsonValue(step.input || {}) as Record<string, any>,
          activityRef,
          support.pickFirstNonEmptyString(step.name, activity.name) || `步骤${index + 1}`,
          workflowIntentText,
          previousStep?.activityRef
        ),
      };
    });

    const rawActivities = Array.isArray(plan.activities) ? plan.activities : [];
    const referencedActivityRefs = Array.from(
      new Set(steps.map((step) => step.activityRef).filter(Boolean))
    ) as string[];
    const activityDsl: ActivityDsl = {
      activities: referencedActivityRefs.map((activityRef) => {
        const resource = activityResourceMap.get(activityRef)!;
        const activityPlan = rawActivities.find((item) => item?.activityRef === activityRef);
        return {
          name: support.pickFirstNonEmptyString(activityPlan?.name, resource.name) || resource.name,
          fn: resource.fn,
          timeout:
            support.pickFirstNonEmptyString(activityPlan?.timeout, resource.timeout) ||
            resource.timeout,
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
      plan.workflowName ||
        support.pickFirstNonEmptyString(description.split(/[。.!?\n]/)[0]) ||
        'AI 生成工作流'
    );
    const taskQueue = support.normalizeTaskQueue(plan.taskQueue || 'SKILL_TASK_QUEUE');
    // P1-C: derive the compiler-side v2Output (design doc §8.3) from the
    // AI-declared outputParams only — the AI never authors the Result Builder
    // mapping itself. Skipped entirely when the AI declared no outputParams
    // (the normalizeDraftOutputParams fallback keeps legacy behavior).
    const declaredOutputParams =
      plan.outputParams &&
      typeof plan.outputParams === 'object' &&
      !Array.isArray(plan.outputParams) &&
      Object.keys(plan.outputParams).length > 0
        ? (plan.outputParams as Record<string, WorkflowOutputParamDefinition>)
        : undefined;
    const derivedV2Output = declaredOutputParams
      ? support.deriveV2OutputFromOutputParams({
          outputParams: declaredOutputParams,
          steps,
        })
      : undefined;
    const compiledValidation = compileDraftValidationContract(plan.validation, derivedV2Output);
    if (compiledValidation.issues.length > 0) {
      throw new BadRequestException(
        `AI 草图输出与验证契约不一致: ${compiledValidation.issues.join('；')}`
      );
    }
    const workflowDsl = await support.normalizeWorkflowDsl(
      {
        name: workflowName,
        workflowClassName: support.normalizeWorkflowClassName(plan.workflowClassName, workflowName),
        workflowDefnName:
          support.pickFirstNonEmptyString(plan.workflowDefnName, workflowName) || workflowName,
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
        ...(compiledValidation.validation
          ? { validation: support.sanitizeJsonValue(compiledValidation.validation) }
          : {}),
        outputParams: support.normalizeDraftOutputParams(plan.outputParams),
        ...(derivedV2Output ? { v2Output: derivedV2Output } : {}),
        extraPrompt: [
          support.pickFirstNonEmptyString(plan.extraPrompt),
          referenceUrl ? `参考 URL: ${referenceUrl}` : '',
          description ? `用户目标: ${description}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        steps,
      } as WorkflowDsl,
      workflowName,
      taskQueue,
      activityDsl
    );

    return {
      name: workflowName,
      description:
        support.normalizeDescription(plan.workflowDescription) || `${workflowName}（AI 生成草稿）`,
      taskQueue,
      workflowDsl,
      activityDsl,
      warnings: [],
    };
  }

  private appendDraftWarning(
    plan: AiWorkflowDraftPlan,
    text: string
  ): AiWorkflowDraftPlan {
    return {
      ...plan,
      warnings: [
        ...(Array.isArray(plan.warnings) ? plan.warnings : []),
        text,
      ],
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

  private buildWorkflowSemanticHint(...values: unknown[]): string {
    return values
      .filter((value) => value !== undefined && value !== null)
      .map((value) =>
        String(value)
          .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
          .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, ' ')
          .trim()
          .toLowerCase()
      )
      .filter((value) => value.length > 0)
      .join(' ');
  }
}
