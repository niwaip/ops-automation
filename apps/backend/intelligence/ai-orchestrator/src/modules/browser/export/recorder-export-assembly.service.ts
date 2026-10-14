import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ModelService } from '../../model/model.service';
import { BrowserCommand } from '../intent';
import {
  buildBrowserRecordingExecutionPlan,
  type BrowserRecordingExecutionPlanLike,
} from '@ops/browser-recorder';
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
  target?: string;
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

  async buildExportArtifacts(
    session: SessionLike,
    userGoal: string,
  ): Promise<ExportArtifactsLike> {
    const exportArtifactId = randomUUID();
    const enrichedCommands = this.enrichCommandsWithGrounding(
      session.executedCommands,
      session
    );
    const sanitizedCommands = this.recorderTemplateExportService.sanitizeRecordedCommandsForExport(
      enrichedCommands
    );
    // Commands and templateSteps must be two representations of the same
    // canonical recording. Build both from this single sequence so export does
    // not silently keep a navigation in one artifact while dropping it in the
    // other.
    session.executedCommands = sanitizedCommands;
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
    const baselineParameters = this.recorderParameterService.inferSkillParameters(
      sanitizedCommands,
      {
        includeStartUrl: this.recorderParameterService.shouldExposeStartUrlParameter(
          sanitizedCommands,
          templateSteps as any
        ),
        templateSteps: templateSteps as any,
      }
    ) as SkillParameterLike[];
    const outputs = this.recorderExportService.inferSkillOutputs(
      sanitizedCommands,
      session.lastObservation
    ) as SkillOutputLike[];
    const { parameters, metadata } = await this.synthesizeExportParametersAndMetadata(
      session,
      userGoal,
      templateSteps,
      baselineParameters,
      outputs,
      enrichedCommands
    );
    const parameterizedTemplateSteps = this.applyParameterPlaceholdersToTemplateSteps(
      templateSteps,
      parameters
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

  private async synthesizeExportParametersAndMetadata(
    session: SessionLike,
    userGoal: string,
    templateSteps: TemplateStepLike[] | undefined,
    baselineParameters: SkillParameterLike[],
    outputs: SkillOutputLike[],
    enrichedCommands: BrowserCommand[]
  ): Promise<{ parameters: SkillParameterLike[]; metadata: ExportMetadataLike }> {
    const fallbackMetadata = this.recorderExportService.buildFallbackExportMetadata(
      userGoal,
      this.recorderTemplateExportService.sanitizeRecordedCommandsForExport(enrichedCommands),
      baselineParameters
    );

    const preferredModel = this.modelService.getPreferredDefaultModel({
      mode: 'chat',
      userRoles: [],
    })?.id;

    if (!preferredModel) {
      return {
        parameters: baselineParameters,
        metadata: fallbackMetadata,
      };
    }

    const userTurns = session.history
      .filter((turn) => turn.role === 'user' && typeof turn.content === 'string' && turn.content.trim())
      .map((turn, index) => ({ turn: index + 1, content: turn.content.trim() }));

    const stepSummary = (templateSteps || []).map((step) => ({
      stepId: step.step_id,
      action: step.action,
      description: step.description,
      params: step.params,
      locator: step.locator,
    }));

    const prompt = [
      '你是专业浏览器录制与流程泛化助手（基于 Agent-PbD 编程示范与参数抽取设计）。',
      '请根据用户在多轮录制会话中的指令、录制步骤和基线参数，分析生成：',
      '1. 业务流程名称（name）与业务描述（description）',
      '2. 流程中需要参数化的变量列表（parameters）',
      '',
      '【核心原则】',
      '1. 多语言槽位抽取（Multilingual Slot Lifting）：用户在多轮对话中所输入的具体指令内容通常是动态参数（如：搜索关键词、打开第N项/序数、填入文本、过滤阈值等）。支持中文、英文、日文等自然语言（例如：“打开第二条记录”、“open the 2nd record”、“2番目の記事を開く” -> resultIndex=2）。',
      '2. 起始网址固定：默认起始网址是固定业务入口，不需要作为动态参数输出，除非用户的首要目标明确要求支持任意网址。',
      '3. 序号定位泛化：如果步骤中存在按序号/位置点击列表项、搜索结果或文章（如 click 或 click_result），应识别为 resultIndex 参数（数字，如 2），并关联到对应的步骤（如 targetStepId 为 "step_2" 或 source 为 "template.step_2.params.index"）。',
      '4. 命名规范：参数名称采用 camelCase（例如 searchQuery, resultIndex, typedText1 等），说明使用清晰中文。',
      '5. 业务名称与描述：name 用中文，简洁明确，不要带 browser_recording、URL、IP、端口、test、录制、脚本等技术噪音；description 1-2 句说明任务与所依赖的关键参数。',
      '',
      `用户总体目标: ${userGoal}`,
      `起始/当前页面: ${session.currentPageUrl || 'unknown'}`,
      `用户多轮对话指令: ${JSON.stringify(userTurns)}`,
      `录制步骤: ${JSON.stringify(stepSummary)}`,
      `规则已识别基线参数: ${JSON.stringify(baselineParameters)}`,
      `输出信息: ${JSON.stringify(outputs)}`,
      '',
      '严格只返回 JSON 格式，不要输出任何解释或 markdown：',
      '{"name":"...","description":"...","parameters":[{"name":"...","description":"...","required":false,"exampleValue":"...","targetStepId":"step_2","source":"template.step_2.params.index"}]}',
    ].join('\n');

    try {
      const response = await this.modelService.callModel(preferredModel, prompt);
      const parsed = this.parseJsonResult(response.content);

      if (!parsed || typeof parsed !== 'object') {
        const metadata = await this.generateExportMetadata(
          session,
          userGoal,
          baselineParameters,
          outputs,
          enrichedCommands
        );
        return {
          parameters: baselineParameters,
          metadata,
        };
      }

      const synthesizedParameters = this.mergeLlmParametersWithBaseline(
        parsed.parameters,
        baselineParameters,
        templateSteps
      );

      const name = typeof parsed.name === 'string' && parsed.name.trim()
        ? parsed.name.trim().slice(0, 255)
        : fallbackMetadata.name;

      const description = typeof parsed.description === 'string' && parsed.description.trim()
        ? parsed.description.trim().slice(0, 1000)
        : fallbackMetadata.description;

      return {
        parameters: synthesizedParameters,
        metadata: { name, description },
      };
    } catch (error) {
      this.logger.warn(
        `Failed to synthesize export parameters and metadata: ${error instanceof Error ? error.message : 'unknown error'}`
      );
      const metadata = await this.generateExportMetadata(
        session,
        userGoal,
        baselineParameters,
        outputs,
        enrichedCommands
      );
      return {
        parameters: baselineParameters,
        metadata,
      };
    }
  }

  private mergeLlmParametersWithBaseline(
    llmParams: unknown,
    baselineParameters: SkillParameterLike[],
    templateSteps?: TemplateStepLike[]
  ): SkillParameterLike[] {
    if (!Array.isArray(llmParams) || llmParams.length === 0) {
      return baselineParameters;
    }

    const merged: SkillParameterLike[] = [...baselineParameters];
    const shouldIncludeStartUrl = this.recorderParameterService.shouldExposeStartUrlParameter(
      [],
      templateSteps as any
    );

    for (const raw of llmParams) {
      if (!raw || typeof raw !== 'object') {
        continue;
      }
      let name = typeof raw.name === 'string' ? raw.name.trim() : '';
      if (!name) {
        continue;
      }

      // Canonicalize common parameter names
      if (/^(?:result_?index|ordinal_?index|序号|结果序号)$/i.test(name)) {
        name = 'resultIndex';
      } else if (/^(?:search_?query|query|关键词|搜索词)$/i.test(name)) {
        name = 'searchQuery';
      } else if (/^(?:start_?url|url|网址)$/i.test(name)) {
        name = 'startUrl';
      } else {
        name = name.replace(/[^a-zA-Z0-9_]/g, '');
      }

      if (name === 'startUrl' && !shouldIncludeStartUrl) {
        continue;
      }

      const description =
        typeof raw.description === 'string' && raw.description.trim()
          ? raw.description.trim()
          : name === 'resultIndex'
          ? '结果序号，从 1 开始'
          : name;

      const required = typeof raw.required === 'boolean' ? raw.required : false;
      const exampleValue =
        raw.exampleValue !== undefined && raw.exampleValue !== null
          ? String(raw.exampleValue).trim()
          : undefined;

      let source = typeof raw.source === 'string' && raw.source.trim() ? raw.source.trim() : undefined;
      const targetStepId =
        typeof raw.targetStepId === 'string' && raw.targetStepId.trim()
          ? raw.targetStepId.trim()
          : undefined;

      if (!source && targetStepId) {
        const step = templateSteps?.find((s) => s.step_id === targetStepId);
        if (step) {
          if (name === 'resultIndex') {
            source = `template.${step.step_id}.params.index`;
          } else if (name === 'searchQuery') {
            source = `template.${step.step_id}.params.query`;
          } else if (step.action === 'fill') {
            source = `template.${step.step_id}.params.value`;
          } else if (step.action === 'type_text') {
            source = `template.${step.step_id}.params.text`;
          }
        }
      }

      if (!source && name === 'resultIndex' && templateSteps?.length) {
        const matchingStep =
          templateSteps.find((s) => s.action === 'click_result') ||
          templateSteps.find(
            (s) =>
              s.action === 'click' &&
              (this.recorderParameterService.extractOrdinalIndexFromText(s.description) !== undefined ||
                s.step_id !== 'step_1')
          );
        if (matchingStep) {
          source = `template.${matchingStep.step_id}.params.index`;
        }
      }

      if (!source && name === 'searchQuery' && templateSteps?.length) {
        const searchStep = templateSteps.find(
          (s) => s.action === 'search' || s.action === 'smart_search'
        );
        if (searchStep) {
          source = `template.${searchStep.step_id}.params.query`;
        }
      }

      const existingIndex = merged.findIndex(
        (p) => p.name === name || (source && p.source === source)
      );
      const existing = existingIndex >= 0 ? merged[existingIndex] : undefined;
      if (existingIndex >= 0 && existing) {
        merged[existingIndex] = {
          ...existing,
          description: description || existing.description,
          exampleValue: exampleValue || existing.exampleValue,
          ...(source && !existing.source ? { source } : {}),
        };
      } else {
        merged.push({
          name,
          description,
          required,
          ...(exampleValue !== undefined ? { exampleValue } : {}),
          ...(source ? { source } : {}),
        });
      }
    }

    return merged;
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

    let cleaned = value.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    try {
      const parsed = JSON.parse(cleaned) as Record<string, any> | string;
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
      const placeholder = `\${${parameter.name}}`;
      if (parameter.name === 'startUrl') {
        const navStep = clonedSteps.find(
          (item) => item.action === 'navigate' || item.action === 'goto'
        );
        if (navStep) {
          if (navStep.params && typeof navStep.params.url === 'string' && navStep.params.url !== placeholder) {
            navStep.params.url = placeholder;
            changed = true;
          }
          if (navStep.target && typeof navStep.target === 'string' && navStep.target !== placeholder && /^https?:\/\//.test(navStep.target)) {
            navStep.target = placeholder;
            changed = true;
          }
        }
      }

      const source = parameter.source?.trim();
      if (!source) {
        return;
      }

      if (source.startsWith('template.')) {
        const sourceMatch = source.match(/^template\.([^.]+)\.(.+)$/);
        if (!sourceMatch) {
          return;
        }
        const [, stepId, relativePath] = sourceMatch;
        const step = clonedSteps.find((item) => item.step_id === stepId);
        if (!step) {
          return;
        }

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

        if (relativePath === 'params.query') {
          if (step.params?.query !== placeholder) {
            step.params = {
              ...(step.params || {}),
              query: placeholder,
            };
            changed = true;
          }
          return;
        }

        if (relativePath === 'params.index') {
          if (step.params?.index !== placeholder) {
            step.params = {
              ...(step.params || {}),
              index: placeholder,
            };
            changed = true;
          }
          if (step.action === 'click' || step.action === 'click_result') {
            step.action = 'click_result';
            delete step.locator;
            delete (step as any).selector;
            delete (step as any).target;
            step.description = '打开详细页';
            changed = true;
          }
          return;
        }

        if (relativePath === 'params.text') {
          if (step.params?.text !== placeholder) {
            step.params = {
              ...(step.params || {}),
              text: placeholder,
            };
            changed = true;
          }
          return;
        }

        if (relativePath === 'params.url') {
          if (step.params?.url !== placeholder) {
            step.params = {
              ...(step.params || {}),
              url: placeholder,
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
        return;
      }

      if (parameter.name === 'resultIndex' && !source) {
        const targetStep =
          clonedSteps.find(
            (item) =>
              item.action === 'click_result' &&
              (!item.params?.index || !String(item.params.index).includes('${'))
          ) ||
          clonedSteps.find(
            (item) =>
              item.action === 'click' &&
              (!item.params?.index || !String(item.params.index).includes('${')) &&
              Boolean(item.description && this.recorderParameterService.extractOrdinalIndexFromText(item.description))
          );
        if (targetStep) {
          if (targetStep.params?.index !== placeholder) {
            targetStep.params = {
              ...(targetStep.params || {}),
              index: placeholder,
            };
            changed = true;
          }
          if (targetStep.action === 'click') {
            targetStep.action = 'click_result';
            delete targetStep.locator;
            delete (targetStep as any).selector;
            delete (targetStep as any).target;
            changed = true;
          }
        }
        return;
      }

      if (source.startsWith('command.')) {
        const commandMatch = source.match(/^command\.(\d+)\.(.+)$/);
        if (!commandMatch) {
          return;
        }
        const [, , field] = commandMatch;

        if (field === 'query' || parameter.name === 'searchQuery') {
          const targetStep =
            clonedSteps.find(
              (item) =>
                (item.action === 'search' || item.action === 'smart_search') &&
                parameter.exampleValue !== undefined &&
                item.params?.query === parameter.exampleValue
            ) ||
            clonedSteps.find(
              (item) =>
                (item.action === 'search' || item.action === 'smart_search') &&
                (!item.params?.query || !String(item.params.query).includes('${'))
            );
          if (targetStep && targetStep.params?.query !== placeholder) {
            targetStep.params = {
              ...(targetStep.params || {}),
              query: placeholder,
            };
            changed = true;
          }
          return;
        }

        if (field === 'index' || parameter.name === 'resultIndex') {
          const targetStep =
            clonedSteps.find(
              (item) =>
                item.action === 'click_result' &&
                parameter.exampleValue !== undefined &&
                String(item.params?.index) === String(parameter.exampleValue)
            ) ||
            clonedSteps.find(
              (item) =>
                item.action === 'click_result' &&
                (!item.params?.index || !String(item.params.index).includes('${'))
            ) ||
            clonedSteps.find(
              (item) =>
                item.action === 'click' &&
                (!item.params?.index || !String(item.params.index).includes('${')) &&
                Boolean(item.description && this.recorderParameterService.extractOrdinalIndexFromText(item.description))
            );
          if (targetStep) {
            if (targetStep.params?.index !== placeholder) {
              targetStep.params = {
                ...(targetStep.params || {}),
                index: placeholder,
              };
              changed = true;
            }
            if (targetStep.action === 'click') {
              targetStep.action = 'click_result';
              delete targetStep.locator;
              delete (targetStep as any).selector;
              delete (targetStep as any).target;
              changed = true;
            }
          }
          return;
        }

        if (field === 'text' || parameter.name.startsWith('typedText')) {
          const targetStep =
            clonedSteps.find(
              (item) =>
                item.action === 'type_text' &&
                parameter.exampleValue !== undefined &&
                item.params?.text === parameter.exampleValue
            ) ||
            clonedSteps.find(
              (item) =>
                item.action === 'type_text' &&
                (!item.params?.text || !String(item.params.text).includes('${'))
            );
          if (targetStep && targetStep.params?.text !== placeholder) {
            targetStep.params = {
              ...(targetStep.params || {}),
              text: placeholder,
            };
            changed = true;
          }
          return;
        }

        if (field === 'value') {
          const targetStep =
            clonedSteps.find(
              (item) =>
                item.action === 'fill' &&
                parameter.exampleValue !== undefined &&
                item.params?.value === parameter.exampleValue
            ) ||
            clonedSteps.find(
              (item) =>
                item.action === 'fill' &&
                (!item.params?.value || !String(item.params.value).includes('${'))
            );
          if (targetStep && targetStep.params?.value !== placeholder) {
            targetStep.params = {
              ...(targetStep.params || {}),
              value: placeholder,
            };
            changed = true;
          }
          return;
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


}
