import { Injectable, Logger } from '@nestjs/common';
import { ModelService } from '../model/model.service';
import type { BrowserCommand } from './browser-command.service';

export type ResumeStrategy =
  | 'replace_failed_step'
  | 'insert_patch_steps'
  | 'replan_from_current_state';

export interface FailedCommand extends BrowserCommand {
  errorMessage?: string;
  errorCode?: string;
}

export interface BrowserActionStep {
  id?: string;
  action: string;
  params?: Record<string, unknown>;
  locator?: {
    type?: 'selector' | 'role' | 'text' | 'label' | 'placeholder' | 'testid';
    strategy?: 'css' | 'role' | 'text' | 'label' | 'placeholder' | 'testid' | 'ref';
    value?: string;
    role?: string;
    name?: string;
  };
  source?: 'ai' | 'manual' | 'manual_takeover';
  backend?: 'cli' | 'chrome-devtools' | 'legacy';
  replayable?: boolean;
  scriptFragment?: string;
  createdAt?: string;
}

type BrowserActionLocatorType = NonNullable<BrowserActionStep['locator']>['type'];

export interface TakeoverObservation {
  currentPageUrl?: string;
  title?: string;
  text?: string;
  snapshotPath?: string;
  screenshotPath?: string;
  timestamp?: string;
}

export interface ReconcileAfterTakeoverRequest {
  sessionId: string;
  runtimeSessionId: string;
  backend?: 'cli' | 'chrome-devtools';
  failedStepId?: string;
  failedCommand?: FailedCommand;
  originalCommands: BrowserCommand[];
  patchSteps: BrowserActionStep[];
  observation: TakeoverObservation;
}

export interface ReconcileAfterTakeoverResponse {
  strategy: ResumeStrategy;
  explanation: string;
  confidence?: number;
  resumeCommands: BrowserCommand[];
}

interface HeuristicDecision {
  strategy: ResumeStrategy;
  explanation: string;
  confidence: number;
}

@Injectable()
export class ExecutionReconcileService {
  private readonly logger = new Logger(ExecutionReconcileService.name);

  constructor(private readonly modelService: ModelService) {}

  async reconcile(
    input: ReconcileAfterTakeoverRequest,
  ): Promise<ReconcileAfterTakeoverResponse> {
    const fallback = this.buildHeuristicResponse(input);
    const modelBacked = await this.tryModelDecision(input);
    if (!modelBacked) {
      return fallback;
    }

    const resumeCommands = this.buildResumeCommands(input, modelBacked.strategy);
    if (resumeCommands.length === 0) {
      return fallback;
    }

    return {
      strategy: modelBacked.strategy,
      explanation: modelBacked.explanation,
      confidence: modelBacked.confidence,
      resumeCommands,
    };
  }

  buildResumePrompt(input: ReconcileAfterTakeoverRequest): string {
    return [
      '你是浏览器自动化恢复策略助手。',
      '任务：根据失败命令、人工补录步骤和最新页面观察，判断人工接管后的恢复策略。',
      '只能输出 JSON，不要输出解释性文字。',
      '',
      '允许的 strategy:',
      '- replace_failed_step',
      '- insert_patch_steps',
      '- replan_from_current_state',
      '',
      '决策规则：',
      '- 如果人工操作已经让页面进入新阶段，输出 replan_from_current_state。',
      '- 如果人工补录本质上替代了失败动作，输出 replace_failed_step。',
      '- 如果人工补录只是补前置条件，仍需重试失败动作，输出 insert_patch_steps。',
      '',
      `runtimeSessionId: ${input.runtimeSessionId}`,
      `sessionId: ${input.sessionId}`,
      `backend: ${input.backend || 'cli'}`,
      `failedStepId: ${input.failedStepId || ''}`,
      `failedCommand: ${JSON.stringify(input.failedCommand || null)}`,
      `originalCommands: ${JSON.stringify(input.originalCommands || [])}`,
      `patchSteps: ${JSON.stringify(input.patchSteps || [])}`,
      `observation: ${JSON.stringify(input.observation || {})}`,
      '',
      '输出格式：',
      '{"strategy":"replace_failed_step","explanation":"...","confidence":0.8}',
    ].join('\n');
  }

  private async tryModelDecision(
    input: ReconcileAfterTakeoverRequest,
  ): Promise<HeuristicDecision | null> {
    const preferredModel = this.modelService.getPreferredDefaultModel({
      mode: 'task',
      userRoles: [],
    });
    if (!preferredModel) {
      return null;
    }

    try {
      const response = await this.modelService.callModel(
        preferredModel.id,
        this.buildResumePrompt(input),
      );
      const parsed = this.parseModelResponse(response.content);
      return parsed;
    } catch (error) {
      this.logger.warn(
        `Failed to reconcile takeover with model: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return null;
    }
  }

  private parseModelResponse(content?: string): HeuristicDecision | null {
    if (!content) {
      return null;
    }

    const match = content.match(/\{[\s\S]*\}/);
    const jsonText = (match ? match[0] : content).trim();

    try {
      const parsed = JSON.parse(jsonText) as Partial<HeuristicDecision>;
      if (!this.isValidStrategy(parsed.strategy)) {
        return null;
      }
      if (typeof parsed.explanation !== 'string' || !parsed.explanation.trim()) {
        return null;
      }
      return {
        strategy: parsed.strategy,
        explanation: parsed.explanation.trim(),
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.75,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to parse reconcile model response: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return null;
    }
  }

  private buildHeuristicResponse(
    input: ReconcileAfterTakeoverRequest,
  ): ReconcileAfterTakeoverResponse {
    const decision = this.decideStrategy(input);
    return {
      strategy: decision.strategy,
      explanation: decision.explanation,
      confidence: decision.confidence,
      resumeCommands: this.buildResumeCommands(input, decision.strategy),
    };
  }

  private decideStrategy(input: ReconcileAfterTakeoverRequest): HeuristicDecision {
    if (this.shouldReplanFromCurrentState(input)) {
      return {
        strategy: 'replan_from_current_state',
        explanation: '人工接管后页面状态已经明显变化，继续沿用原计划风险较高，建议基于当前页面重新规划后续命令。',
        confidence: 0.9,
      };
    }

    if (this.shouldReplaceFailedStep(input)) {
      return {
        strategy: 'replace_failed_step',
        explanation: '人工补录步骤与失败动作高度相关，适合直接替换失败步骤后继续执行后续命令。',
        confidence: 0.82,
      };
    }

    return {
      strategy: 'insert_patch_steps',
      explanation: '人工补录更像是在补充前置条件，建议先执行 patch steps，再重试失败命令并继续原计划。',
      confidence: 0.76,
    };
  }

  private shouldReplanFromCurrentState(input: ReconcileAfterTakeoverRequest): boolean {
    const observationSignals = [
      input.observation.currentPageUrl,
      input.observation.title,
      input.observation.text,
    ]
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .join(' ')
      .toLowerCase();

    const originalNavigateUrls = input.originalCommands
      .filter((command) => command.tool === 'navigate')
      .map((command) => command.params.url)
      .filter((url): url is string => typeof url === 'string' && url.trim().length > 0);

    const currentUrl = input.observation.currentPageUrl?.trim();
    const urlChanged = Boolean(
      currentUrl
      && originalNavigateUrls.length > 0
      && originalNavigateUrls.every((url) => url !== currentUrl),
    );

    const hasProgressSignals = /(dashboard|console|workspace|overview|home|欢迎|控制台|工作台|概览|首页)/i
      .test(observationSignals);
    const patchNavigated = input.patchSteps.some((step) => step.action === 'navigate');
    const loginContext = this.isLoginContext(input);

    return patchNavigated || hasProgressSignals || (loginContext && urlChanged);
  }

  private shouldReplaceFailedStep(input: ReconcileAfterTakeoverRequest): boolean {
    if (!input.failedCommand || input.patchSteps.length === 0 || input.patchSteps.length > 2) {
      return false;
    }

    return input.patchSteps.some((step) => this.areActionsEquivalent(step.action, input.failedCommand!.tool));
  }

  private buildResumeCommands(
    input: ReconcileAfterTakeoverRequest,
    strategy: ResumeStrategy,
  ): BrowserCommand[] {
    const patchCommands = input.patchSteps
      .map((step) => this.mapPatchStepToCommand(step))
      .filter((command): command is BrowserCommand => Boolean(command));
    const failedIndex = this.findFailedCommandIndex(input);
    const failedAndRemaining = failedIndex >= 0
      ? input.originalCommands.slice(failedIndex)
      : [...input.originalCommands];
    const remainingAfterFailed = failedIndex >= 0
      ? input.originalCommands.slice(failedIndex + 1)
      : [];

    switch (strategy) {
      case 'replace_failed_step':
        return this.deduplicateCommands([
          ...patchCommands,
          ...remainingAfterFailed,
        ]);
      case 'insert_patch_steps':
        return this.deduplicateCommands([
          ...patchCommands,
          ...failedAndRemaining,
        ]);
      case 'replan_from_current_state':
        return this.buildReplanCommands(input);
      default:
        return this.buildReplanCommands(input);
    }
  }

  private buildReplanCommands(input: ReconcileAfterTakeoverRequest): BrowserCommand[] {
    const commands: BrowserCommand[] = [
      {
        tool: 'snapshot',
        params: {},
        description: '获取当前页面结构',
      },
      {
        tool: 'get_text',
        params: {},
        description: '读取当前页面文本',
      },
    ];

    const observationText = input.observation.text?.trim() || '';
    if (/订单|order/i.test(observationText)) {
      commands.push({
        tool: 'search',
        params: { query: '订单' },
        description: '尝试定位订单相关入口',
      });
    }

    return commands;
  }

  private findFailedCommandIndex(input: ReconcileAfterTakeoverRequest): number {
    if (!input.failedCommand) {
      return -1;
    }

    return input.originalCommands.findIndex((command) => this.isSameCommand(command, input.failedCommand!));
  }

  private isSameCommand(left: BrowserCommand, right: BrowserCommand): boolean {
    if (left.tool !== right.tool) {
      return false;
    }

    if (left.description && right.description && left.description === right.description) {
      return true;
    }

    return JSON.stringify(left.params || {}) === JSON.stringify(right.params || {});
  }

  private mapPatchStepToCommand(step: BrowserActionStep): BrowserCommand | null {
    const params = step.params || {};
    const description = step.scriptFragment || `手动补录: ${step.action}`;

    switch (step.action) {
      case 'navigate':
        if (typeof params.url !== 'string') {
          return null;
        }
        return {
          tool: 'navigate',
          params: { url: params.url },
          description,
        };
      case 'click':
        return {
          tool: 'click',
          params: this.buildActionParams(step),
          description,
        };
      case 'hover':
        return {
          tool: 'hover',
          params: this.buildActionParams(step),
          description,
        };
      case 'fill':
        if (params.value === undefined) {
          return null;
        }
        return {
          tool: 'fill',
          params: {
            ...this.buildActionParams(step),
            value: params.value,
          },
          description,
        };
      case 'press':
      case 'press_key':
        if (typeof params.key !== 'string') {
          return null;
        }
        return {
          tool: 'press_key',
          params: { key: params.key },
          description,
        };
      case 'switch_latest_tab':
      case 'focus_latest_page':
        return {
          tool: 'switch_latest_tab',
          params: {},
          description,
        };
      case 'type_text':
        if (typeof params.text !== 'string') {
          return null;
        }
        return {
          tool: 'type_text',
          params: {
            text: params.text,
            ...(typeof params.submit_key === 'string' ? { submit_key: params.submit_key } : {}),
          },
          description,
        };
      default:
        return null;
    }
  }

  private buildActionParams(step: BrowserActionStep): Record<string, unknown> {
    const params = { ...(step.params || {}) };
    const locatorType = this.normalizeLocatorType(step.locator);

    if (typeof params.selector === 'string') {
      return params;
    }
    if (typeof params.text === 'string') {
      return params;
    }
    if (locatorType === 'role' && typeof step.locator?.role === 'string') {
      return {
        ...params,
        target: `${step.locator.role}[name="${step.locator.name || step.locator.value || ''}"]`,
      };
    }
    if (locatorType === 'text' && typeof step.locator?.value === 'string') {
      return {
        ...params,
        text: step.locator.value,
      };
    }
    if (locatorType === 'label' && typeof step.locator?.value === 'string') {
      return {
        ...params,
        target: `label=${step.locator.value}`,
      };
    }
    if (locatorType === 'placeholder' && typeof step.locator?.value === 'string') {
      return {
        ...params,
        target: `placeholder=${step.locator.value}`,
      };
    }
    if (locatorType === 'testid' && typeof step.locator?.value === 'string') {
      return {
        ...params,
        selector: `[data-testid="${step.locator.value.replace(/"/g, '\\"')}"]`,
      };
    }
    if (locatorType === 'selector' && typeof step.locator?.value === 'string') {
      return {
        ...params,
        selector: step.locator.value,
      };
    }

    return params;
  }

  private normalizeLocatorType(stepLocator?: BrowserActionStep['locator']): BrowserActionLocatorType | undefined {
    if (!stepLocator) {
      return undefined;
    }
    if (stepLocator.type) {
      return stepLocator.type;
    }
    if (stepLocator.strategy === 'css') {
      return 'selector';
    }
    if (stepLocator.strategy === 'role'
      || stepLocator.strategy === 'text'
      || stepLocator.strategy === 'label'
      || stepLocator.strategy === 'placeholder'
      || stepLocator.strategy === 'testid') {
      return stepLocator.strategy;
    }
    return undefined;
  }

  private deduplicateCommands(commands: BrowserCommand[]): BrowserCommand[] {
    const result: BrowserCommand[] = [];
    const seen = new Set<string>();

    for (const command of commands) {
      const key = JSON.stringify({
        tool: command.tool,
        params: command.params || {},
        description: command.description || '',
      });
      if (!seen.has(key)) {
        seen.add(key);
        result.push(command);
      }
    }

    return result;
  }

  private isLoginContext(input: ReconcileAfterTakeoverRequest): boolean {
    const allSignals = [
      input.failedCommand?.description,
      input.failedCommand?.params?.selector,
      input.failedCommand?.params?.text,
      ...input.originalCommands.map((command) => command.description),
      ...input.originalCommands.map((command) => command.params.selector),
      ...input.originalCommands.map((command) => command.params.text),
    ]
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .join(' ');

    return /(登录|signin|sign in|log in|log on|password|用户名|账号|密码)/i.test(allSignals);
  }

  private areActionsEquivalent(leftAction: string, rightTool: string): boolean {
    const left = leftAction.toLowerCase();
    const right = rightTool.toLowerCase();

    if (left === right) {
      return true;
    }

    return (left === 'press' && right === 'press_key')
      || (left === 'press_key' && right === 'press')
      || (left === 'type_text' && right === 'fill')
      || (left === 'fill' && right === 'type_text');
  }

  private isValidStrategy(value: unknown): value is ResumeStrategy {
    return value === 'replace_failed_step'
      || value === 'insert_patch_steps'
      || value === 'replan_from_current_state';
  }
}
