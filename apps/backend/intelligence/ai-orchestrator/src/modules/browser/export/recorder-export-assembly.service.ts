import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ModelService } from '../../model/model.service';
import { BrowserCommand } from '../intent';
import { buildBrowserRecordingExecutionPlan } from './browser-recording-execution-plan';
import type { BrowserRecordingExecutionPlanLike } from './browser-recording-execution-plan';
import { RecorderExportService } from './recorder-export.service';
import {
  RecorderLoopDraftState,
  RecorderLoopService,
  RecorderManualInterventionRecord,
} from '../loop';
import { RecorderParameterService } from '../intent';
import { RecorderScriptExportService } from './recorder-script-export.service';
import { RecorderTemplateExportService } from './recorder-template-export.service';
import { RecorderDurableLocatorResolver } from './recorder-durable-locator-resolver.service';

type ExportBackendLike = 'cli' | 'chrome-devtools' | 'mcp';

interface DurableLocatorResolutionHistoryLike {
  execution?: {
    results?: Array<Record<string, unknown>>;
  };
}

interface ExportMetadataLike {
  name: string;
  description: string;
}

interface ObservationLike {
  currentPageUrl?: string;
  title?: string;
  text?: string;
  inputs: Array<Record<string, unknown>>;
  buttons: Array<Record<string, unknown>>;
  headings: string[];
  links: string[];
}

interface GroundedTargetLike {
  ref?: string;
  role?: string;
  name?: string;
  text?: string;
  contextLabel?: string;
  regionId?: string;
  locator?: {
    strategy?: string;
    value?: string;
  };
}

interface OutcomeLike {
  grounding?: {
    chosenTarget?: GroundedTargetLike;
  };
}

interface SessionLike {
  runtimeSessionId: string;
  backend: ExportBackendLike;
  currentPageUrl?: string;
  lastObservation?: ObservationLike;
  loopDraft?: RecorderLoopDraftState;
  manualInterventions?: RecorderManualInterventionRecord[];
  history: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    observation?: ObservationLike;
    commands?: BrowserCommand[];
    outcome?: OutcomeLike;
  }>;
  executedCommands: BrowserCommand[];
}

interface TemplateStepLike {
  step_id: string;
  action: string;
  locator?: {
    type: string;
    value: string;
  };
  params?: Record<string, string | number>;
  output_var?: string;
  branch?: {
    condition_fn: string;
    on_match: 'continue' | 'stop';
    on_mismatch: 'continue' | 'stop' | 'takeover';
    takeover_reason?: string;
    description?: string;
  };
  description?: string;
}

interface SkillParameterLike {
  name: string;
  description: string;
  required: boolean;
  exampleValue?: string;
  source?: string;
}

interface SkillOutputLike {
  name: string;
  description: string;
  location: string;
}

interface ExportArtifactsLike {
  script: string;
  guidance: string;
  templateSteps?: TemplateStepLike[];
  loopDraft?: Record<string, unknown>;
  loopPlanPreview?: Array<Record<string, unknown>>;
  scriptValidation?: {
    syntaxValid: boolean;
    warnings: string[];
  };
  skillDraft: {
    name: string;
    description: string;
    invocation: string;
    parameterOnly: true;
    parameters: SkillParameterLike[];
    outputs: SkillOutputLike[];
    usageNotes: string[];
    usageMarkdown: string;
    publishPayload: {
      name: string;
      description: string;
      triggerKeywords: string[];
      paramsSchema: {
        properties: Record<
          string,
          {
            type: 'string' | 'number' | 'date' | 'boolean';
            description: string;
            required?: boolean;
            default?: string | number | boolean;
            extractionPrompt?: string;
          }
        >;
        required: string[];
      };
      executionFlowTemplateIds: string[];
      executionFlow: Array<Record<string, unknown>>;
      loopPlanPreview?: Array<Record<string, unknown>>;
      tools: string[];
      apiEndpoints: {
        runtimeMetadata: Record<string, unknown>;
      };
    };
    executionPlan: BrowserRecordingExecutionPlanLike;
    commands: BrowserCommand[];
  };
}

@Injectable()
export class RecorderExportAssemblyService {
  private readonly logger = new Logger(RecorderExportAssemblyService.name);

  constructor(
    private readonly modelService: ModelService,
    private readonly recorderLoopService: RecorderLoopService,
    private readonly recorderExportService: RecorderExportService,
    private readonly recorderParameterService: RecorderParameterService,
    private readonly recorderScriptExportService: RecorderScriptExportService,
    private readonly recorderTemplateExportService: RecorderTemplateExportService,
    private readonly durableLocatorResolver: RecorderDurableLocatorResolver
  ) {}

  async buildExportArtifacts(session: SessionLike, userGoal: string): Promise<ExportArtifactsLike> {
    const exportArtifactId = randomUUID();
    const enrichedCommands = this.enrichCommandsWithGrounding(
      session.executedCommands,
      session
    );
    session.executedCommands = enrichedCommands;
    const sanitizedCommands = this.recorderTemplateExportService.sanitizeRecordedCommandsForExport(
      enrichedCommands
    );
    const rawTemplateSteps = (await this.recorderTemplateExportService.buildTemplateStepsForExport(
      session,
      userGoal
    )) as TemplateStepLike[] | undefined;
    const loopPendingKeyword = this.recorderLoopService.deriveLoopPendingKeyword(
      session,
      session.loopDraft
    );
    const templateSteps = this.recorderLoopService.optimizeTemplateStepsForLoopExport(
      rawTemplateSteps,
      session.loopDraft,
      loopPendingKeyword
    ) as TemplateStepLike[] | undefined;
    const exportLoopDraft = this.recorderLoopService.buildExportLoopDraft(
      session.loopDraft,
      templateSteps,
      loopPendingKeyword
    ) as Record<string, unknown> | undefined;
    const loopPlanPreview = this.recorderExportService.buildLoopPlanPreview(exportLoopDraft as any);
    const parameters = this.recorderParameterService.inferSkillParameters(
      sanitizedCommands,
      {
        includeStartUrl: this.recorderParameterService.shouldExposeStartUrlParameter(
          sanitizedCommands,
          templateSteps as any
        ),
        templateSteps: templateSteps as any,
      }
    ) as SkillParameterLike[];
    const parameterizedTemplateSteps = this.applyParameterPlaceholdersToTemplateSteps(
      templateSteps,
      parameters
    );
    const outputs = this.recorderExportService.inferSkillOutputs(
      sanitizedCommands,
      session.lastObservation
    ) as SkillOutputLike[];
    const metadata = await this.generateExportMetadata(
      session,
      userGoal,
      parameters,
      outputs,
      enrichedCommands
    );
    const publishPayload = this.recorderExportService.buildSkillPublishPayload({
      userGoal,
      backend: session.backend,
      runtimeSessionId: session.runtimeSessionId,
      commands: sanitizedCommands,
      templateSteps: parameterizedTemplateSteps as any,
      loopDraft: exportLoopDraft as any,
      loopPlanPreview,
      parameters,
      outputs,
      metadata,
      exportArtifactId,
    }) as ExportArtifactsLike['skillDraft']['publishPayload'];
    // #region debug-point A:template-export-payload
    this.reportTemplateExportDebug('A', 'assembled recorder export payload', {
      runtimeSessionId: session.runtimeSessionId,
      exportArtifactId,
      parameters,
      rawTemplateSteps: templateSteps,
      parameterizedTemplateSteps,
      publishExecutionPlanTemplateSteps:
        (
          (publishPayload?.apiEndpoints?.runtimeMetadata as Record<string, any> | undefined)
            ?.executionPlan as Record<string, any> | undefined
        )?.templateSteps ?? null,
      publishExecutionFlow:
        Array.isArray(publishPayload?.executionFlow) && publishPayload.executionFlow.length > 0
          ? publishPayload.executionFlow
          : null,
    });
    // #endregion
    const executionPlan = buildBrowserRecordingExecutionPlan({
      backend: session.backend,
      runtimeSessionId: session.runtimeSessionId,
      commands: sanitizedCommands as unknown as Record<string, unknown>[],
      templateSteps: parameterizedTemplateSteps as
        | Array<Record<string, unknown>>
        | undefined,
      loopDraft: exportLoopDraft as Record<string, unknown> | undefined,
      manualInterventions: session.manualInterventions?.map((item) => ({
        label: item.label,
        behavior: item.behavior,
        ...(typeof item.startCommandIndex === 'number'
          ? { startCommandIndex: item.startCommandIndex }
          : {}),
        ...(typeof item.endCommandIndex === 'number'
          ? { endCommandIndex: item.endCommandIndex }
          : {}),
        ...(item.signal ? { signal: item.signal } : {}),
      })),
      parameters,
      outputs,
      trace: {
        recorderSessionId: session.runtimeSessionId,
        exportArtifactId,
      },
    }) satisfies ExportArtifactsLike['skillDraft']['executionPlan'];
    const script = this.recorderScriptExportService.buildStableExecutionScript(
      executionPlan as any,
      parameters
    ) as string;
    const scriptValidation = this.recorderScriptExportService.validateGeneratedScript(
      script,
      parameterizedTemplateSteps as any
    );
    const usageNotes = [
      'AI 聊天窗口只负责识别参数并调用该 skill，不直接逐步重放浏览器操作。',
      'skill 内部通过固定 executionPlan 调用 browser worker，保证执行顺序稳定。',
      `默认 backend 为 ${session.backend}，默认 runtimeSessionId 为 ${session.runtimeSessionId}。`,
      ...(exportLoopDraft
        ? ['当前导出已附带循环草稿与循环结构预览，供后续模板/运行时显式消费。']
        : []),
      '如果页面结构变化较大，应重新录制并重新生成脚本与 skill 说明。',
      ...scriptValidation.warnings.map((warning) => `脚本导出说明: ${warning}`),
    ];
    const guidance = [
      `目标: ${userGoal}`,
      `模板名称: ${metadata.name}`,
      `模板描述: ${metadata.description}`,
      '脚本用途: 独立稳定执行录制得到的浏览器步骤',
      'skill 用途: 给 AI 聊天窗口作为内置能力使用，只收集参数并触发固定脚本',
      `默认 backend: ${session.backend}`,
      `默认 runtimeSessionId: ${session.runtimeSessionId}`,
      ...(exportLoopDraft && typeof exportLoopDraft.mode === 'string'
        ? [`循环模式: ${exportLoopDraft.mode}`]
        : []),
      `输出位置: ${outputs.map((item) => `${item.name} -> ${item.location}`).join('；')}`,
    ].join('\n');

    return {
      script,
      guidance,
      ...(parameterizedTemplateSteps ? { templateSteps: parameterizedTemplateSteps } : {}),
      ...(exportLoopDraft ? { loopDraft: exportLoopDraft } : {}),
      ...(loopPlanPreview ? { loopPlanPreview } : {}),
      scriptValidation,
      skillDraft: {
        name: metadata.name,
        description: metadata.description,
        invocation: '在 AI 聊天窗口中仅解析参数并调用该 skill，由 skill 内部执行稳定的浏览器步骤。',
        parameterOnly: true,
        parameters,
        outputs,
        usageNotes,
        usageMarkdown: this.recorderExportService.buildSkillUsageMarkdown({
          userGoal,
          backend: session.backend,
          runtimeSessionId: session.runtimeSessionId,
          parameters,
          outputs,
        }),
        publishPayload,
        executionPlan,
        commands: sanitizedCommands,
      },
    };
  }

  private enrichCommandsWithGrounding(
    commands: BrowserCommand[],
    session: SessionLike
  ): BrowserCommand[] {
    const groundingByCommand = new Map<BrowserCommand, GroundedTargetLike>();
    for (const turn of session.history) {
      const chosenTarget = turn.outcome?.grounding?.chosenTarget;
      const firstCommand = turn.commands?.[0];
      if (!chosenTarget || !firstCommand) {
        continue;
      }
      groundingByCommand.set(firstCommand, chosenTarget);
    }

    return commands.map((command) => {
      const target = groundingByCommand.get(command);
      const existingLocator = command.locator || {};
      const groundingEnrichedLocator = target
        ? {
            ...existingLocator,
            ...(target.ref ? { ref: target.ref } : {}),
            ...(target.role ? { role: target.role } : {}),
            ...(target.name ? { name: target.name } : {}),
            ...(target.contextLabel ? { contextLabel: target.contextLabel } : {}),
            ...(target.regionId ? { regionId: target.regionId } : {}),
          }
        : existingLocator;

      const resolved = this.durableLocatorResolver.resolve(
        { ...command, locator: groundingEnrichedLocator },
        { history: session.history as DurableLocatorResolutionHistoryLike[] },
        target
      );

      if (!resolved) {
        if (target) {
          return { ...command, locator: groundingEnrichedLocator };
        }
        return command;
      }

      return {
        ...command,
        locator: {
          ...groundingEnrichedLocator,
          ref: resolved.ref,
          strategy: resolved.strategy,
          value: resolved.value,
          ...(resolved.role ? { role: resolved.role } : {}),
          ...(resolved.name ? { name: resolved.name } : {}),
          ...(resolved.expression ? { expression: resolved.expression } : {}),
        },
      };
    });
  }

  private async generateExportMetadata(
    session: SessionLike,
    userGoal: string,
    parameters: SkillParameterLike[],
    outputs: SkillOutputLike[],
    enrichedCommands: BrowserCommand[]
  ): Promise<ExportMetadataLike> {
    const fallback = this.recorderExportService.buildFallbackExportMetadata(
      userGoal,
      this.recorderTemplateExportService.sanitizeRecordedCommandsForExport(enrichedCommands),
      parameters
    );
    const preferredModel = this.modelService.getPreferredDefaultModel({
      mode: 'chat',
      userRoles: [],
    })?.id;

    if (!preferredModel) {
      return fallback;
    }

    const commandSummary = this.recorderTemplateExportService
      .sanitizeRecordedCommandsForExport(enrichedCommands)
      .map((command, index) => ({
      step: index + 1,
      tool: command.tool,
      description: command.description,
      params: command.params,
      locator: command.locator,
    }));

    try {
      const response = await this.modelService.callModel(
        preferredModel,
        [
          '你是浏览器录制模板分析助手。',
          '请根据用户目标、录制步骤和参数，生成更像业务模板的名称与描述。',
          '要求：',
          '1. 只返回 JSON，不要输出解释。',
          '2. name 用中文，简洁明确，不要带 browser_recording、URL、IP、端口、test、test123、录制、模板、脚本 等技术噪音。',
          '3. description 用中文 1-2 句，说明它完成什么任务、依赖哪些关键参数。',
          '4. 如果存在登录类输入，描述中要体现用户名/密码等登录参数。',
          `用户目标: ${userGoal}`,
          `当前页面: ${session.currentPageUrl || 'unknown'}`,
          `参数: ${JSON.stringify(parameters)}`,
          `输出: ${JSON.stringify(outputs)}`,
          `录制步骤: ${JSON.stringify(commandSummary)}`,
          `兜底建议: ${JSON.stringify(fallback)}`,
          '返回格式: {"name":"...","description":"..."}',
        ].join('\n\n')
      );

      const parsed = this.parseJsonResult(response.content);
      const name = typeof parsed?.name === 'string' ? parsed.name.trim() : '';
      const description = typeof parsed?.description === 'string' ? parsed.description.trim() : '';

      if (!name || !description) {
        return fallback;
      }

      return {
        name: name.slice(0, 255),
        description: description.slice(0, 1000),
      };
    } catch (error) {
      this.logger.warn(
        `Failed to generate export metadata: ${error instanceof Error ? error.message : 'unknown error'}`
      );
      return fallback;
    }
  }

  private parseJsonResult(value: unknown): Record<string, any> | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    try {
      const parsed = JSON.parse(trimmed) as Record<string, any> | string;
      if (typeof parsed === 'string') {
        return JSON.parse(parsed) as Record<string, any>;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private applyParameterPlaceholdersToTemplateSteps(
    templateSteps: TemplateStepLike[] | undefined,
    parameters: SkillParameterLike[]
  ): TemplateStepLike[] | undefined {
    if (!templateSteps?.length || parameters.length === 0) {
      return templateSteps;
    }

    const clonedSteps = JSON.parse(JSON.stringify(templateSteps)) as TemplateStepLike[];
    let changed = false;

    parameters.forEach((parameter) => {
      const source = parameter.source?.trim();
      if (!source?.startsWith('template.')) {
        return;
      }
      const sourceMatch = source.match(/^template\.([^.]+)\.(.+)$/);
      if (!sourceMatch) {
        return;
      }
      const [, stepId, relativePath] = sourceMatch;
      const step = clonedSteps.find((item) => item.step_id === stepId);
      if (!step) {
        return;
      }

      const placeholder = `\${${parameter.name}}`;
      if (relativePath === 'params.value') {
        if (step.params?.value !== placeholder) {
          step.params = {
            ...(step.params || {}),
            value: placeholder,
          };
          changed = true;
        }
        return;
      }

      if (relativePath === 'branch.condition_fn' && step.branch?.condition_fn) {
        const nextConditionFn = this.parameterizeBranchConditionFn(
          step.branch.condition_fn,
          parameter.exampleValue,
          parameter.name
        );
        const nextTakeoverReason = step.branch?.takeover_reason
          ? this.parameterizeBranchTakeoverReason(
              step.branch.takeover_reason,
              parameter.exampleValue,
              parameter.name
            )
          : step.branch?.takeover_reason;
        if (nextConditionFn !== step.branch.condition_fn) {
          step.branch = {
            ...step.branch,
            condition_fn: nextConditionFn,
            ...(nextTakeoverReason !== undefined ? { takeover_reason: nextTakeoverReason } : {}),
          };
          changed = true;
        } else if (
          nextTakeoverReason !== undefined &&
          nextTakeoverReason !== step.branch.takeover_reason
        ) {
          step.branch = {
            ...step.branch,
            takeover_reason: nextTakeoverReason,
          };
          changed = true;
        }
      }
    });

    return changed ? clonedSteps : templateSteps;
  }

  private parameterizeBranchConditionFn(
    conditionFn: string,
    exampleValue: string | undefined,
    parameterName: string
  ): string {
    const runtimeValue = `Number(ctx.${parameterName})`;
    if (conditionFn.includes(runtimeValue)) {
      return conditionFn;
    }

    const trimmedExample = exampleValue?.trim();
    if (trimmedExample) {
      const escaped = trimmedExample.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const exactThresholdPattern = new RegExp(`([<>]=?\\s*)${escaped}(?![\\d.])`);
      if (exactThresholdPattern.test(conditionFn)) {
        return conditionFn.replace(exactThresholdPattern, `$1${runtimeValue}`);
      }
    }

    return conditionFn.replace(/([<>]=?\s*)(-?\d+(?:\.\d+)?)(?![\d.])/, `$1${runtimeValue}`);
  }

  private parameterizeBranchTakeoverReason(
    takeoverReason: string,
    exampleValue: string | undefined,
    parameterName: string
  ): string {
    const placeholder = `\${${parameterName}}`;
    if (!takeoverReason || takeoverReason.includes(placeholder)) {
      return takeoverReason;
    }

    const trimmedExample = exampleValue?.trim();
    if (trimmedExample) {
      const escaped = trimmedExample.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const exactPercentPattern = new RegExp(`(?<![\\d.])${escaped}(?:\\.0+)?(?=\\s*%)`, 'g');
      if (exactPercentPattern.test(takeoverReason)) {
        return takeoverReason.replace(exactPercentPattern, placeholder);
      }

      const exactNumberPattern = new RegExp(`(?<![\\d.])${escaped}(?![\\d.])`, 'g');
      if (exactNumberPattern.test(takeoverReason)) {
        return takeoverReason.replace(exactNumberPattern, placeholder);
      }
    }

    return takeoverReason.replace(/(?<![\d.])-?\d+(?:\.\d+)?(?=\s*%)/, placeholder);
  }

  // #region debug-point shared:template-export-debug
  private reportTemplateExportDebug(
    hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E',
    msg: string,
    data: Record<string, unknown>,
    runId = 'pre-fix'
  ): void {
    const localFs = require('fs') as typeof import('fs');
    let serverUrl = 'http://host.docker.internal:7777/event';
    let sessionId = 'template-export-params';
    for (const envPath of [
      '/app/.dbg/template-export-params.env',
      '/Users/chain/Documents/MyProject/ops-automation/.dbg/template-export-params.env',
    ]) {
      try {
        const envContent = localFs.readFileSync(envPath, 'utf8');
        const resolvedUrl = envContent.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim();
        const resolvedSessionId = envContent.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim();
        if (resolvedUrl) {
          serverUrl = resolvedUrl;
        }
        if (resolvedSessionId) {
          sessionId = resolvedSessionId;
        }
        break;
      } catch {}
    }
    void fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        runId,
        hypothesisId,
        location: 'recorder-export-assembly.service',
        msg: `[DEBUG] ${msg}`,
        data,
        ts: Date.now(),
      }),
    }).catch(() =>
      fetch('http://host.docker.internal:7777/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          runId,
          hypothesisId,
          location: 'recorder-export-assembly.service',
          msg: `[DEBUG] ${msg}`,
          data,
          ts: Date.now(),
        }),
      }).catch(() => undefined)
    );
  }
  // #endregion
}
