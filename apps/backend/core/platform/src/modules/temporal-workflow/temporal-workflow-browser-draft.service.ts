import { BadRequestException, Injectable } from '@nestjs/common';
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
import { normalizeDraftInputParams } from './temporal-workflow-draft.normalizers';
import { normalizeWorkflowInputRenderPath } from './temporal-workflow-template.helpers';
import {
  DEFAULT_TEMPLATE_WORKFLOW_DSL,
  type BrowserWorkflowActivityStep,
  type BrowserWorkflowDraft,
  type GenerateBrowserWorkflowDraftDTO,
  type WorkflowInputParamDefinition,
} from './temporal-workflow.types';

export interface TemporalWorkflowBrowserDraftSupport {
  normalizeName(value?: string): string;
  normalizeDescription(value?: string | null): string | null;
  pickFirstNonEmptyString(...values: unknown[]): string | undefined;
  collectTemplateVariables(value: unknown, target?: Set<string>): Set<string>;
  buildWorkflowSemanticHint(...values: unknown[]): string;
}

@Injectable()
export class TemporalWorkflowBrowserDraftService {
  generateBrowserWorkflowDraft(
    data: GenerateBrowserWorkflowDraftDTO,
    support: TemporalWorkflowBrowserDraftSupport,
  ): BrowserWorkflowDraft {
    const script = String(data?.script || '').trim();
    const templateId = typeof data?.templateId === 'string' && data.templateId.trim()
      ? data.templateId.trim()
      : undefined;
    const templateSteps = Array.isArray(data?.templateSteps)
      ? data.templateSteps.filter((step) => Boolean(step && typeof step === 'object'))
      : [];
    const structuredCommands = Array.isArray(data?.commands)
      ? data.commands.filter((command) => Boolean(command && typeof command === 'object'))
      : [];
    const templateParamsSchema = data?.paramsSchema && typeof data.paramsSchema === 'object' && !Array.isArray(data.paramsSchema)
      ? data.paramsSchema
      : undefined;

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
      generationWarning = '该草稿直接复用浏览器模板原始步骤，只对步骤进行 activity 编排，不再重新解析脚本。';
      inferredInputParams = buildBrowserInputParamsFromTemplateSource(
        templateSteps,
        templateParamsSchema,
      );
    } else if (structuredCommands.length > 0) {
      activitySteps = buildBrowserActivityStepsFromDraftCommands(structuredCommands);
      commandCount = structuredCommands.length;
      placeholders = extractBrowserActivityPlaceholders(activitySteps);
      generationWarning = '该草稿直接复用结构化 executionPlan.commands，优先保留运行时稳定定位信息。';
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
      placeholders = Array.from(new Set([
        ...extractScriptPlaceholders(script),
        ...extractBrowserActivityPlaceholders(activitySteps),
      ]));
      generatedScript = script;
    }

    const short = String(Date.now()).slice(-6);
    const workflowName = support.normalizeName(
      String(data?.name || '').trim() || `浏览器模板-${short}-工作流`,
    );
    const workflowDescription = support.normalizeDescription(
      String(data?.description || '').trim() || '基于浏览器脚本自动生成的执行工作流',
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
    const inputParams = placeholders.reduce<Record<string, WorkflowInputParamDefinition>>((acc, key) => {
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
    }, { ...declaredInputParams });
    const browserPhases = buildBrowserWorkflowActivityPhases(activitySteps);
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
          description: templateSteps.length > 0
            ? '浏览器模板 Phase Activity（直接复用模板 DSL）'
            : structuredCommands.length > 0
            ? '浏览器命令 Phase Activity（由结构化执行计划自动生成）'
            : '浏览器脚本 Phase Activity（由模板工作流自动生成）',
          ...(templateId ? { templateId } : {}),
          ...(generatedScript ? { script: generatedScript } : {}),
          commandCount: phase.steps.length,
          phaseType: phase.phaseType,
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
          ...(templateId
            ? {
                sourceTemplate: {
                  templateId,
                  variableCount: Object.keys(inputParams || {}).length,
                },
              }
            : {}),
          warnings: [
            generationWarning,
          ],
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
      },
    };
  }
}
