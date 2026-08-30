import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  browserActionLabel,
  buildBrowserActivityStepsFromDraftCommands,
  buildBrowserActivityStepsFromTemplateSteps,
  buildBrowserInputParamsFromTemplateSource,
  buildBrowserWorkflowActivityPhases,
  extractBrowserActivityPlaceholders,
  extractScriptPlaceholders,
  parseBrowserScriptCommands,
} from './temporal-workflow-browser.helpers';
import { normalizeDraftInputParams } from '../temporal-workflow-draft.normalizers';
import { normalizeWorkflowInputRenderPath } from '../temporal-workflow-template.helpers';
import {
  DEFAULT_TEMPLATE_WORKFLOW_DSL,
  type BrowserLoopDraftLike,
  type BrowserPostProcessingStepLike,
  type BrowserWorkflowActivityStep,
  type BrowserWorkflowCompositionLike,
  type BrowserWorkflowDraft,
  type BrowserWorkflowLogicalPlan,
  type GenerateBrowserWorkflowDraftDTO,
  type WorkflowInputParamDefinition,
} from '../temporal-workflow.types';

export interface TemporalWorkflowBrowserDraftSupport {
  normalizeName(value?: string): string;
  normalizeDescription(value?: string | null): string | null;
  pickFirstNonEmptyString(...values: unknown[]): string | undefined;
  collectTemplateVariables(value: unknown, target?: Set<string>): Set<string>;
  buildWorkflowSemanticHint(...values: unknown[]): string;
}

const canonicalizeWorkflowIdentitySource = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeWorkflowIdentitySource(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalizeWorkflowIdentitySource(item)])
  );
};

const buildStableBrowserWorkflowSuffix = (input: {
  templateId?: string;
  name?: string;
  script?: string;
  templateSteps: unknown[];
  commands: unknown[];
}): string => {
  const identitySource = input.templateId
    ? { sourceType: 'browser_template', templateId: input.templateId }
    : {
        sourceType: 'browser_draft',
        name: input.name || '',
        script: input.script || '',
        templateSteps: input.templateSteps,
        commands: input.commands,
      };
  return createHash('sha256')
    .update(JSON.stringify(canonicalizeWorkflowIdentitySource(identitySource)))
    .digest('hex')
    .slice(0, 12);
};

@Injectable()
export class TemporalWorkflowBrowserDraftService {
  generateBrowserWorkflowDraft(
    data: GenerateBrowserWorkflowDraftDTO,
    support: TemporalWorkflowBrowserDraftSupport
  ): BrowserWorkflowDraft {
    const script = String(data?.script || '').trim();
    const templateId =
      typeof data?.templateId === 'string' && data.templateId.trim()
        ? data.templateId.trim()
        : undefined;
    const templateSteps = Array.isArray(data?.templateSteps)
      ? data.templateSteps.filter((step) => Boolean(step && typeof step === 'object'))
      : [];
    const loopDraft =
      data?.loopDraft && typeof data.loopDraft === 'object' && !Array.isArray(data.loopDraft)
        ? (data.loopDraft as BrowserLoopDraftLike)
        : undefined;
    const structuredCommands = Array.isArray(data?.commands)
      ? data.commands.filter((command) => Boolean(command && typeof command === 'object'))
      : [];
    const templateParamsSchema =
      data?.paramsSchema &&
      typeof data.paramsSchema === 'object' &&
      !Array.isArray(data.paramsSchema)
        ? data.paramsSchema
        : undefined;
    const workflowComposition = this.normalizeWorkflowComposition(data?.workflowComposition);

    let activitySteps: BrowserWorkflowActivityStep[] = [];
    let commandCount = 0;
    let placeholders: string[] = [];
    let generationWarning = '该草稿由浏览器脚本自动转换，请在发布前确认每个步骤的选择器与参数。';
    let generatedScript: string | undefined;
    let inferredInputParams: Record<string, WorkflowInputParamDefinition> | undefined;

    if (templateSteps.length > 0) {
      activitySteps = buildBrowserActivityStepsFromTemplateSteps(templateSteps);
      commandCount = templateSteps.length;
      placeholders = extractBrowserActivityPlaceholders(activitySteps);
      generationWarning =
        '该草稿直接复用浏览器模板原始步骤，只对步骤进行 activity 编排，不再重新解析脚本。';
      if (loopDraft?.eachIteration?.stepIds?.length) {
        generationWarning += ' 已保留 loopDraft，生成代码时应编译为 workflow 级循环骨架。';
      }
      inferredInputParams = buildBrowserInputParamsFromTemplateSource(
        templateSteps,
        templateParamsSchema
      );
    } else if (structuredCommands.length > 0) {
      activitySteps = buildBrowserActivityStepsFromDraftCommands(structuredCommands);
      commandCount = structuredCommands.length;
      placeholders = extractBrowserActivityPlaceholders(activitySteps);
      generationWarning =
        '该草稿直接复用结构化 executionPlan.commands，优先保留运行时稳定定位信息。';
      generatedScript = script || undefined;
    } else {
      if (!script) {
        throw new BadRequestException('浏览器模板脚本或结构化 commands 不能为空');
      }

      const commands = parseBrowserScriptCommands(script);
      if (commands.length === 0) {
        throw new BadRequestException('未识别到可执行浏览器指令，请检查脚本格式');
      }

      commandCount = commands.length;
      activitySteps = commands.map((command, index) => {
        const stepConfig: Record<string, unknown> = {
          action: command.action,
        };
        if (command.url) {
          stepConfig.url = command.url;
        }
        if (command.target) {
          stepConfig.target = command.target;
        }
        if (command.selector) {
          stepConfig.selector = command.selector;
        }
        if (command.locator) {
          stepConfig.locator = command.locator;
        }
        if (command.value !== undefined) {
          stepConfig.value = command.value;
        }
        if (command.timeoutMs !== undefined) {
          stepConfig.timeoutMs = command.timeoutMs;
        }
        return {
          name: `${index + 1}. ${browserActionLabel(command.action)}`,
          type: 'browser' as const,
          timeout: '30s',
          config: stepConfig,
          inputParams: {},
        };
      });
      placeholders = Array.from(
        new Set([
          ...extractScriptPlaceholders(script),
          ...extractBrowserActivityPlaceholders(activitySteps),
        ])
      );
      generatedScript = script;
    }

    const short = buildStableBrowserWorkflowSuffix({
      templateId,
      name: typeof data?.name === 'string' ? data.name.trim() : undefined,
      script,
      templateSteps,
      commands: structuredCommands,
    });
    const workflowName = support.normalizeName(
      String(data?.name || '').trim() || `浏览器模板-${short}-工作流`
    );
    const workflowDescription =
      support.normalizeDescription(
        String(data?.description || '').trim() || '基于浏览器脚本自动生成的执行工作流'
      ) || '基于浏览器脚本自动生成的执行工作流';
    const activityFnBase = `browserTemplateRun${short}`;
    const declaredInputParams = normalizeDraftInputParams({
      inputParams: {
        ...(inferredInputParams || {}),
        ...(data?.inputParams || {}),
      },
      pickFirstNonEmptyString: (...values) => support.pickFirstNonEmptyString(...values),
      collectTemplateVariables: (value, target) => support.collectTemplateVariables(value, target),
      normalizeWorkflowInputRenderPath,
      buildWorkflowSemanticHint: (...values) => support.buildWorkflowSemanticHint(...values),
    });
    const inputParams = placeholders.reduce<Record<string, WorkflowInputParamDefinition>>(
      (acc, key) => {
        acc[key] = {
          ...acc[key],
          required: true,
          defaultValue: acc[key]?.defaultValue ?? '',
          description: acc[key]?.description || `脚本变量 ${key}`,
          source: acc[key]?.source || 'inferred_from_template',
          type: acc[key]?.type || 'string',
          exampleValue: acc[key]?.exampleValue ?? `sample_${key}`,
        };
        return acc;
      },
      { ...declaredInputParams }
    );
    const browserPhases = this.buildBrowserWorkflowPhases({
      activitySteps,
      loopDraft,
    });
    const workflowSteps = browserPhases.map((phase, index) => {
      const phaseActivityFn = `${activityFnBase}_${String(index + 1).padStart(2, '0')}`;
      return {
        id: `step_${index + 1}`,
        name: phase.name,
        type: 'activity' as const,
        activityRef: `custom:${phaseActivityFn}`,
        activityName: phase.name,
        startToCloseTimeout: phase.timeout,
      };
    });
    const activityDefinitions = browserPhases.map((phase, index) => {
      const phaseActivityFn = `${activityFnBase}_${String(index + 1).padStart(2, '0')}`;
      return {
        id: phaseActivityFn,
        activityRef: `custom:${phaseActivityFn}`,
        name: phase.name,
        fn: phaseActivityFn,
        timeout: phase.timeout,
        retryPolicy: { maxRetries: 1, backoffMs: 1000 },
        handler: 'browser' as const,
        config: {
          description:
            templateSteps.length > 0
              ? '浏览器模板 Phase Activity（直接复用模板 DSL）'
              : structuredCommands.length > 0
                ? '浏览器命令 Phase Activity（由结构化执行计划自动生成）'
                : '浏览器脚本 Phase Activity（由模板工作流自动生成）',
          ...(templateId ? { templateId } : {}),
          ...(generatedScript ? { script: generatedScript } : {}),
          commandCount: phase.steps.length,
          phaseType: phase.phaseType,
          loopSegment:
            typeof phase.steps[0]?.config?.loopSegment === 'string'
              ? phase.steps[0].config.loopSegment
              : undefined,
          loopTemplate: Boolean(phase.steps[0]?.config?.loopTemplate),
          phaseIndex: index + 1,
          phaseCount: browserPhases.length,
          sessionLifecycle: {
            initializeSession: phase.initializeSession,
            cleanupSession: phase.cleanupSession,
          },
          steps: phase.steps,
        },
      };
    });
    const browserLogicalPlan = this.buildBrowserLogicalPlan({
      workflowSteps,
      browserPhases,
      workflowComposition,
    });
    if (browserLogicalPlan.postProcessingStepCount > 0) {
      generationWarning +=
        ` 已保留 ${browserLogicalPlan.postProcessingStepCount} 个模板后处理节点；` +
        '它们由控制面执行，不会伪装成 Temporal Activity。';
    }

    return {
      name: workflowName,
      description: workflowDescription,
      taskQueue: 'SKILL_TASK_QUEUE',
      workflowDsl: {
        ...DEFAULT_TEMPLATE_WORKFLOW_DSL,
        name: workflowName,
        workflowClassName: `BrowserTemplate${short}Workflow`,
        workflowDefnName: workflowName,
        taskQueue: 'SKILL_TASK_QUEUE',
        sourceContext: {
          sourceType: 'browser_template',
          generatedAt: new Date().toISOString(),
          userDescription: workflowDescription,
          ...(loopDraft ? { browserLoopDraft: loopDraft } : {}),
          ...(workflowComposition ? { browserWorkflowComposition: workflowComposition } : {}),
          browserLogicalPlan,
          ...(templateId
            ? {
                sourceTemplate: {
                  templateId,
                  variableCount: Object.keys(inputParams || {}).length,
                },
              }
            : {}),
          warnings: [generationWarning],
        },
        inputParams,
        outputParams: {
          result: {
            sourceStep: workflowSteps[workflowSteps.length - 1]?.id || 'step_1',
            description: '浏览器执行结果',
          },
        },
        extraPrompt: [
          '该工作流由浏览器脚本转换而来。',
          '请保持 Phase 顺序，按页面迁移、页面打开、页面处理等单位编排浏览器动作。',
          'wait 与 screenshot 需要附着在相邻的页面阶段中，不要单独拆成 Activity。',
          '优先将输入参数渲染到脚本占位符后执行，避免硬编码业务值。',
        ].join('\n'),
        steps: workflowSteps,
      },
      activityDsl: {
        activities: activityDefinitions,
      },
      browserTemplate: {
        commandCount,
        placeholderCount: placeholders.length,
        placeholders,
        browserStepCount: browserLogicalPlan.browserStepCount,
        postProcessingStepCount: browserLogicalPlan.postProcessingStepCount,
        totalStepCount: browserLogicalPlan.totalStepCount,
      },
    };
  }

  private normalizeWorkflowComposition(
    value: GenerateBrowserWorkflowDraftDTO['workflowComposition']
  ): BrowserWorkflowCompositionLike | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const posts = Array.isArray(value.postProcessingSteps) ? value.postProcessingSteps : [];
    const normalizedPosts = posts.map((post, index) => {
      if (!post || typeof post !== 'object' || Array.isArray(post)) {
        throw new BadRequestException(`浏览器模板后处理步骤 ${index + 1} 格式无效`);
      }
      const id = String(post.id || '').trim();
      const type = post.type;
      if (!id || (type !== 'llm_operation' && type !== 'workflow_skill')) {
        throw new BadRequestException(`浏览器模板后处理步骤 ${index + 1} 缺少合法的 id/type`);
      }
      if (type === 'llm_operation' && (!post.operationId || !post.operationVersion)) {
        throw new BadRequestException(`浏览器模板 LLM 后处理步骤“${id}”缺少 operationId/version`);
      }
      if (type === 'workflow_skill' && (!post.skillId || !post.releaseId)) {
        throw new BadRequestException(`浏览器模板工作流后处理步骤“${id}”缺少 skillId/releaseId`);
      }
      return {
        ...post,
        id,
        dependsOn: Array.isArray(post.dependsOn)
          ? post.dependsOn.map((item) => String(item || '').trim()).filter(Boolean)
          : undefined,
        sourceStepId: String(post.sourceStepId || '').trim() || undefined,
        sourceStepIds: Array.isArray(post.sourceStepIds)
          ? post.sourceStepIds.map((item) => String(item || '').trim()).filter(Boolean)
          : undefined,
      } as BrowserPostProcessingStepLike;
    });
    return {
      ...value,
      postProcessingSteps: normalizedPosts,
    };
  }

  private buildBrowserLogicalPlan(input: {
    workflowSteps: Array<{ id: string; name: string }>;
    browserPhases: Array<{ steps: BrowserWorkflowActivityStep[] }>;
    workflowComposition?: BrowserWorkflowCompositionLike;
  }): BrowserWorkflowLogicalPlan {
    const sourceStepToWorkflowStep = new Map<string, string>();
    input.browserPhases.forEach((phase, phaseIndex) => {
      const workflowStepId = input.workflowSteps[phaseIndex]?.id;
      if (!workflowStepId) return;
      phase.steps.forEach((step) => {
        const sourceStepId = String(step.config?.templateStepId || '').trim();
        if (sourceStepId) sourceStepToWorkflowStep.set(sourceStepId, workflowStepId);
      });
    });
    const browserSteps = input.workflowSteps.map((step) => ({
      id: step.id,
      name: step.name,
      type: 'browser_activity' as const,
      dependsOn: [],
      workflowStepId: step.id,
    }));
    const fallbackDependency = browserSteps[browserSteps.length - 1]?.id;
    const processingSteps = (input.workflowComposition?.postProcessingSteps || []).map(
      (post, index) => {
        const sourceStepIds = Array.from(
          new Set(
            [...(Array.isArray(post.sourceStepIds) ? post.sourceStepIds : []), post.sourceStepId]
              .map((item) => String(item || '').trim())
              .filter(Boolean)
          )
        );
        const explicitDependencies = Array.isArray(post.dependsOn)
          ? post.dependsOn
              .map((dependency) => dependency === 'browser_recording' ? fallbackDependency : dependency)
              .filter((item): item is string => Boolean(item))
          : [];
        const dependsOn = explicitDependencies.length > 0
          ? Array.from(new Set(explicitDependencies))
          : Array.from(
              new Set(
                sourceStepIds
                  .map((sourceStepId) => sourceStepToWorkflowStep.get(sourceStepId))
                  .filter((item): item is string => Boolean(item))
              )
            );
        if (dependsOn.length === 0 && fallbackDependency) dependsOn.push(fallbackDependency);
        if (
          post.type === 'workflow_skill' &&
          !post.inputBindings &&
          fallbackDependency &&
          !dependsOn.includes(fallbackDependency)
        ) {
          dependsOn.push(fallbackDependency);
        }
        const id = String(post.id || `post_process_${index + 1}`);
        return {
          id,
          name:
            post.type === 'workflow_skill'
              ? `工作流后处理：${post.skillId || id}`
              : post.processingMode === 'summary'
                ? 'LLM 总结'
                : `LLM 处理：${post.operationId || id}`,
          type: post.type || 'llm_operation',
          dependsOn,
          sourceStepId: sourceStepIds[0],
          sourceStepIds,
          operationId: post.operationId,
          operationVersion: post.operationVersion,
          skillId: post.skillId,
          releaseId: post.releaseId,
          runWhen: post.runWhen,
        };
      }
    );
    const steps = [...browserSteps, ...processingSteps];
    return {
      schemaVersion: 'browser-template-logical-plan/v1',
      browserStepCount: browserSteps.length,
      postProcessingStepCount: processingSteps.length,
      totalStepCount: steps.length,
      steps,
    };
  }

  private buildBrowserWorkflowPhases(input: {
    activitySteps: BrowserWorkflowActivityStep[];
    loopDraft?: BrowserLoopDraftLike;
  }) {
    const iterationStepIds = new Set(
      Array.isArray(input.loopDraft?.eachIteration?.stepIds)
        ? input.loopDraft?.eachIteration?.stepIds
            ?.map((item) => String(item || '').trim())
            .filter(Boolean)
        : []
    );
    if (!iterationStepIds.size) {
      return buildBrowserWorkflowActivityPhases(input.activitySteps);
    }

    const firstIterationIndex = input.activitySteps.findIndex((step) =>
      iterationStepIds.has(String(step.config?.templateStepId || '').trim())
    );
    if (firstIterationIndex < 0) {
      return buildBrowserWorkflowActivityPhases(input.activitySteps);
    }

    let lastIterationIndex = firstIterationIndex;
    for (let index = input.activitySteps.length - 1; index >= firstIterationIndex; index -= 1) {
      const step = input.activitySteps[index];
      if (iterationStepIds.has(String(step.config?.templateStepId || '').trim())) {
        lastIterationIndex = index;
        break;
      }
    }

    const segments = [
      {
        segment: 'pre_loop',
        steps: input.activitySteps.slice(0, firstIterationIndex),
      },
      {
        segment: 'iteration',
        steps: input.activitySteps.slice(firstIterationIndex, lastIterationIndex + 1),
      },
      {
        segment: 'post_loop',
        steps: input.activitySteps.slice(lastIterationIndex + 1),
      },
    ].filter((item) => item.steps.length > 0);

    const phases = segments.flatMap((segment) =>
      buildBrowserWorkflowActivityPhases(segment.steps).map((phase) => ({
        ...phase,
        steps: phase.steps.map((step: BrowserWorkflowActivityStep) => ({
          ...step,
          config: {
            ...step.config,
            loopSegment: segment.segment,
            loopTemplate: segment.segment === 'iteration',
          },
        })),
      }))
    );

    if (phases.length === 0) {
      return [];
    }

    return phases.map((phase, index) => ({
      ...phase,
      initializeSession: index === 0,
      cleanupSession: index === phases.length - 1,
    }));
  }
}
