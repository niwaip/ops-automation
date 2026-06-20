import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { getBrowserWorkerUrl } from '../../config/service-endpoints';

export interface TemplateStep {
  step_id: string;
  step_number?: number;
  action: string;
  params?: Record<string, unknown>;
  locator?: { type: string; value: string };
  wait?: { type: string; value?: string; timeout?: number };
  retry?: { max_attempts: number; delay_ms: number };
  on_fail?: string;
  selector?: string;
  target?: string;
  value?: string;
  url?: string;
  text?: string;
  key?: string;
  duration?: number;
  direction?: string;
  amount?: number;
  output_var?: string;
  description?: string;
  execution_policy?:
    | 'auto_execute'
    | 'require_confirmation'
    | 'require_takeover'
    | 'forbid_in_replay';
  branch?: {
    condition_fn: string;
    on_match: 'continue' | 'stop';
    on_mismatch: 'continue' | 'stop' | 'takeover';
    takeover_reason?: string;
    description?: string;
  };
}

export interface ExecutionResult {
  success: boolean;
  step_id: string;
  step?: number;
  action?: string;
  error?: string;
  message?: string;
  screenshot?: string;
  text?: string;
  html?: string;
  confirmation_required?: boolean;
  confirmation_reason?: string;
  takeover?: boolean;
  takeover_reason?: string;
  replay_forbidden?: boolean;
  replay_forbidden_reason?: string;
}

type LoopStopReadType = 'count' | 'text' | 'page_signal';

type LoopStopRead = {
  type: LoopStopReadType;
  key?: string;
  locator?: { type: string; value: string };
};

export interface TemplateLoopDraft {
  mode?: 'repeat_until';
  eachIteration?: {
    stepIds?: string[];
    capturedFromIndex?: number;
    capturedToIndex?: number;
    stepCount?: number;
  };
  stopWhen?: {
    read?: LoopStopRead;
    conditionFn?: string;
    description?: string;
  };
  maxIterations?: number;
  onNoProgress?: 'takeover' | 'stop';
}

export interface ExecuteStepsOptions {
  loopDraft?: TemplateLoopDraft;
}

type LoopStopReadPlan =
  | {
      type: 'count' | 'text';
      key?: string;
      step: TemplateStep;
    }
  | {
      type: 'page_signal';
      key: string;
      step: TemplateStep;
    };

type LoopPlan = {
  mode: 'repeat_until';
  stopWhen: {
    read: LoopStopReadPlan;
    conditionFn: string;
    description: string;
  };
  maxIterations: number;
  onNoProgress: 'takeover' | 'stop';
  preLoopSteps: TemplateStep[];
  iterationSteps: TemplateStep[];
  postLoopSteps: TemplateStep[];
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

@Injectable()
export class CdpExecutor implements OnModuleDestroy {
  private readonly logger = new Logger(CdpExecutor.name);
  private readonly browserWorkerUrl = getBrowserWorkerUrl();

  async onModuleDestroy() {
    // No persistent browser connection to close
    this.logger.log('CdpExecutor destroyed');
  }

  private async postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
    this.logger.log(`POST ${path} with body: ${JSON.stringify(body)}`);
    const response = await fetch(`${this.browserWorkerUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    if (!response.ok) {
      this.logger.error(`Request failed ${path}: ${response.status} ${text}`);
      throw new Error(text || `Request failed with status ${response.status}`);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Failed to parse response: ${text}`);
    }
  }

  /**
   * Start browser session via browser worker backend
   */
  async startBrowser(
    sessionId: string,
    url: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.log(`Starting browser for session ${sessionId} at ${url}`);
      const result = await this.postJson<{ success: boolean; message?: string }>('/browser/init', {
        runtimeSessionId: sessionId,
        initialUrl: url,
        backend: 'cli',
      });
      return result.success
        ? { success: true }
        : { success: false, error: result.message || 'Failed to start browser' };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to start browser: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Navigate to URL (alias for startBrowser)
   */
  async navigateToUrl(
    url: string,
    sessionId?: string
  ): Promise<{ success: boolean; error?: string }> {
    const sid = sessionId || `session-${Date.now()}`;
    return this.startBrowser(sid, url);
  }

  async executeStep(step: TemplateStep, sessionId?: string): Promise<ExecutionResult> {
    const results = await this.executeSteps([step], sessionId, {}, 'cli');
    return (
      results[0] || {
        success: false,
        step_id: step.step_id,
        action: step.action,
        error: 'Step execution returned no result',
      }
    );
  }

  /**
   * Replace ${param_name} placeholders with actual values
   */
  private replaceParams(value: unknown, params: Record<string, unknown>): unknown {
    if (typeof value === 'string') {
      // Replace ${param_name} patterns
      return value.replace(/\$\{(\w+)\}/g, (match, paramName) => {
        if (params[paramName] !== undefined) {
          return String(params[paramName]);
        }
        // Return original placeholder if param not found
        return match;
      });
    }
    return value;
  }

  private mapStepToCommand(
    step: TemplateStep,
    params: Record<string, unknown> = {}
  ): { tool: string; params: Record<string, unknown> } {
    const commandParams: Record<string, unknown> = { ...(step.params || {}) };

    if (step.selector && commandParams.selector === undefined)
      commandParams.selector = step.selector;
    if (step.target && commandParams.target === undefined) commandParams.target = step.target;
    if (step.value && commandParams.value === undefined) commandParams.value = step.value;
    if (step.url && commandParams.url === undefined) commandParams.url = step.url;
    if (step.text && commandParams.text === undefined) commandParams.text = step.text;
    if (step.key && commandParams.key === undefined) commandParams.key = step.key;
    if (step.duration !== undefined && commandParams.duration === undefined)
      commandParams.duration = step.duration;
    if (step.direction && commandParams.direction === undefined)
      commandParams.direction = step.direction;
    if (step.amount !== undefined && commandParams.amount === undefined)
      commandParams.amount = step.amount;
    if (step.locator) {
      if (step.locator.type === 'ref' && commandParams.target === undefined) {
        commandParams.target = step.locator.value;
      } else if (commandParams.selector === undefined) {
        commandParams.selector = this.buildSelector(step.locator);
      }
    }
    if (step.wait) {
      if (step.wait.value && commandParams.selector === undefined) {
        commandParams.selector = step.wait.value;
      }
      if (step.wait.timeout !== undefined && commandParams.duration === undefined) {
        commandParams.duration = step.wait.timeout;
      }
    }

    for (const key of Object.keys(commandParams)) {
      commandParams[key] = this.replaceParams(commandParams[key], params);
    }

    return {
      tool: step.action,
      params: commandParams,
    };
  }

  /**
   * Build CSS selector from locator
   */
  private buildSelector(locator: { type: string; value: string }): string {
    switch (locator.type) {
      case 'css':
        return locator.value;

      case 'xpath':
        return locator.value; // XPath handled separately in execution

      case 'text':
        return `text=${locator.value}`;

      case 'role':
        return `role=${locator.value}`;

      case 'ref':
        return locator.value;

      case 'placeholder':
        return `[placeholder="${locator.value}"]`;

      case 'label':
        return `label:has-text("${locator.value}")`;

      case 'testId':
        return `[data-testid="${locator.value}"]`;

      default:
        return locator.value;
    }
  }

  /**
   * Execute all steps in a template
   */
  async executeSteps(
    steps: TemplateStep[],
    sessionId?: string,
    params: Record<string, unknown> = {},
    backend: string = 'cli',
    options: ExecuteStepsOptions = {}
  ): Promise<ExecutionResult[]> {
    this.logger.log(`Executing ${steps.length} steps for session ${sessionId}`);
    this.logger.debug(`Steps: ${JSON.stringify(steps)}, Params: ${JSON.stringify(params)}`);
    const variables: Record<string, unknown> = {};

    try {
      const initResult = await this.postJson<{ success: boolean; message?: string }>(
        '/browser/init',
        {
          runtimeSessionId: sessionId,
          backend,
        }
      );
      if (!initResult.success) {
        throw new Error(initResult.message || 'Failed to initialize browser');
      }
      const results: ExecutionResult[] = [];
      const executeSequence = async (sequence: TemplateStep[]): Promise<ExecutionResult | null> => {
        for (const step of sequence) {
          const result = await this.executeSingleStep(step, sessionId, params, backend, variables);
          results.push(result);
          if (!result.success) {
            return result;
          }
        }
        return null;
      };
      const loopPlan = this.buildLoopPlan(steps, options.loopDraft);

      // #region debug-point E:executor-plan
      (() => {
        const fs = require('fs');
        const envPath = '.dbg/session-loop-stall.env';
        let debugUrl = `http://${process.env.EXTERNAL_HOST || 'host.docker.internal'}:7777/event`;
        let debugSessionId = 'session-loop-stall';
        try {
          const envContent = fs.readFileSync(envPath, 'utf8');
          debugUrl = envContent.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || debugUrl;
          debugSessionId = envContent.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || debugSessionId;
        } catch {}
        fetch(debugUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: debugSessionId,
            runId: 'pre-fix',
            hypothesisId: 'E',
            location: 'cdp.executor.ts:executeSteps:plan',
            msg: '[DEBUG] cdpExecutor initialized execution plan',
            data: {
              sessionId,
              backend,
              stepIds: steps.map((step) => step.step_id),
              hasLoopDraft: Boolean(options.loopDraft),
              hasLoopPlan: Boolean(loopPlan),
              preLoopCount: loopPlan?.preLoopSteps.length || 0,
              iterationCount: loopPlan?.iterationSteps.length || 0,
              postLoopCount: loopPlan?.postLoopSteps.length || 0,
            },
            ts: Date.now(),
          }),
        }).catch(() => {});
      })();
      // #endregion
      if (loopPlan) {
        const preLoopFailure = await executeSequence(loopPlan.preLoopSteps);
        if (preLoopFailure) {
          return results;
        }

        for (let iteration = 1; iteration <= loopPlan.maxIterations; iteration += 1) {
          const beforeStop = await this.readLoopStopSignal(
            loopPlan,
            iteration,
            'before',
            sessionId,
            params,
            backend,
            variables
          );
          results.push(beforeStop.result);
          if (!beforeStop.result.success) {
            return results;
          }
          if (this.evaluateLoopStopCondition(loopPlan.stopWhen.conditionFn, beforeStop.rawValue)) {
            break;
          }

          const beforeSignature = beforeStop.normalizedValue;
          const iterationFailure = await executeSequence(loopPlan.iterationSteps);
          if (iterationFailure) {
            return results;
          }

          const afterStop = await this.readLoopStopSignal(
            loopPlan,
            iteration,
            'after',
            sessionId,
            params,
            backend,
            variables
          );
          results.push(afterStop.result);
          if (!afterStop.result.success) {
            return results;
          }
          if (this.evaluateLoopStopCondition(loopPlan.stopWhen.conditionFn, afterStop.rawValue)) {
            break;
          }

          if (beforeSignature === afterStop.normalizedValue) {
            results.push(
              loopPlan.onNoProgress === 'takeover'
                ? {
                    success: false,
                    step_id: `loop_no_progress_${iteration}`,
                    action: 'loop_control',
                    error: `循环第 ${iteration} 轮执行后页面状态无进展`,
                    message: loopPlan.stopWhen.description,
                    takeover: true,
                    takeover_reason: `循环第 ${iteration} 轮执行后页面状态无进展`,
                  }
                : {
                    success: false,
                    step_id: `loop_no_progress_${iteration}`,
                    action: 'loop_control',
                    error: `循环第 ${iteration} 轮执行后页面状态无进展`,
                    message: loopPlan.stopWhen.description,
                  }
            );
            return results;
          }

          if (iteration === loopPlan.maxIterations) {
            results.push({
              success: false,
              step_id: 'loop_max_iterations',
              action: 'loop_control',
              error: `已达到最大循环次数 ${loopPlan.maxIterations}`,
              message: loopPlan.stopWhen.description,
            });
            return results;
          }
        }

        const postLoopFailure = await executeSequence(loopPlan.postLoopSteps);
        if (postLoopFailure) {
          return results;
        }
      } else {
        const linearFailure = await executeSequence(steps);
        if (linearFailure) {
          return results;
        }
      }

      // #region debug-point E:executor-results
      (() => {
        const fs = require('fs');
        const envPath = '.dbg/session-loop-stall.env';
        let debugUrl = `http://${process.env.EXTERNAL_HOST || 'host.docker.internal'}:7777/event`;
        let debugSessionId = 'session-loop-stall';
        try {
          const envContent = fs.readFileSync(envPath, 'utf8');
          debugUrl = envContent.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || debugUrl;
          debugSessionId = envContent.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || debugSessionId;
        } catch {}
        fetch(debugUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: debugSessionId,
            runId: 'pre-fix',
            hypothesisId: 'E',
            location: 'cdp.executor.ts:executeSteps:results',
            msg: '[DEBUG] cdpExecutor finished execution',
            data: {
              sessionId,
              resultCount: results.length,
              failedCount: results.filter((item) => !item.success).length,
              lastResult: results[results.length - 1] || null,
            },
            ts: Date.now(),
          }),
        }).catch(() => {});
      })();
      // #endregion
      return results;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Execution failed: ${errorMsg}`);

      // #region debug-point E:executor-error
      (() => {
        const fs = require('fs');
        const envPath = '.dbg/session-loop-stall.env';
        let debugUrl = `http://${process.env.EXTERNAL_HOST || 'host.docker.internal'}:7777/event`;
        let debugSessionId = 'session-loop-stall';
        try {
          const envContent = fs.readFileSync(envPath, 'utf8');
          debugUrl = envContent.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || debugUrl;
          debugSessionId = envContent.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || debugSessionId;
        } catch {}
        fetch(debugUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: debugSessionId,
            runId: 'pre-fix',
            hypothesisId: 'E',
            location: 'cdp.executor.ts:executeSteps:error',
            msg: '[DEBUG] cdpExecutor execution failed',
            data: {
              sessionId,
              backend,
              error: errorMsg,
            },
            ts: Date.now(),
          }),
        }).catch(() => {});
      })();
      // #endregion

      return [
        {
          success: false,
          step_id: 'all',
          action: 'batch',
          error: errorMsg,
        },
      ];
    }
  }

  private async executeSingleStep(
    step: TemplateStep,
    sessionId: string | undefined,
    params: Record<string, unknown>,
    backend: string,
    variables: Record<string, unknown>
  ): Promise<ExecutionResult> {
    const substitutedStep = this.substituteStep(step, params);

    if (substitutedStep.execution_policy === 'forbid_in_replay') {
      return {
        success: false,
        step_id: substitutedStep.step_id,
        action: substitutedStep.action,
        error: '步骤策略禁止在回放中自动执行',
        message: substitutedStep.description || '步骤策略禁止在回放中自动执行',
        replay_forbidden: true,
        replay_forbidden_reason: '步骤策略禁止在回放中自动执行',
      };
    }

    if (substitutedStep.execution_policy === 'require_confirmation') {
      return {
        success: false,
        step_id: substitutedStep.step_id,
        action: substitutedStep.action,
        error: '步骤策略要求人工确认后执行',
        message: substitutedStep.description || '步骤策略要求人工确认后执行',
        confirmation_required: true,
        confirmation_reason: '步骤策略要求人工确认后执行',
      };
    }

    if (substitutedStep.execution_policy === 'require_takeover') {
      return {
        success: false,
        step_id: substitutedStep.step_id,
        action: substitutedStep.action,
        error: '步骤策略要求人工接管',
        message: substitutedStep.description || '步骤策略要求人工接管',
        takeover: true,
        takeover_reason: '步骤策略要求人工接管',
      };
    }

    if (substitutedStep.action === 'read_value') {
      return this.executeReadValueStep(substitutedStep, sessionId, backend, variables);
    }

    if (substitutedStep.action === 'branch') {
      return this.executeBranchStep(substitutedStep, variables);
    }

    if (substitutedStep.action === 'takeover_gate') {
      return {
        success: false,
        step_id: substitutedStep.step_id,
        action: substitutedStep.action,
        error: substitutedStep.params?.reason
          ? String(substitutedStep.params.reason)
          : '人工接管节点触发',
        message: substitutedStep.description || '人工接管节点触发',
        takeover: true,
        takeover_reason:
          typeof substitutedStep.params?.reason === 'string'
            ? substitutedStep.params.reason
            : '人工接管节点触发',
      };
    }

    const result = await this.postJson<{
      success: boolean;
      results: Array<Record<string, unknown>>;
      message?: string;
    }>('/browser/execute', {
      runtimeSessionId: sessionId,
      backend,
      commands: [this.mapStepToCommand(substitutedStep, params)],
    });

    const stepResult = (
      Array.isArray(result.results) && result.results.length > 0 ? result.results[0] || {} : {}
    ) as Record<string, any>;
    const success = stepResult.status !== 'error' && result.success !== false;
    return {
      success,
      step_id: substitutedStep.step_id,
      action: String(stepResult.command || substitutedStep.action),
      error: success
        ? undefined
        : String(stepResult.message || result.message || 'Step execution failed'),
      message: String(stepResult.message || result.message || stepResult.stdout || ''),
      screenshot: typeof stepResult.screenshot === 'string' ? stepResult.screenshot : undefined,
      text:
        typeof stepResult?.data?.text === 'string'
          ? stepResult.data.text
          : typeof stepResult.text === 'string'
            ? stepResult.text
            : undefined,
      html:
        typeof stepResult.html === 'string'
          ? stepResult.html
          : typeof stepResult.stdout === 'string'
            ? stepResult.stdout
            : undefined,
    };
  }

  private async executeReadValueStep(
    step: TemplateStep,
    sessionId: string | undefined,
    backend: string,
    variables: Record<string, unknown>
  ): Promise<ExecutionResult> {
    const command = this.mapReadValueStepToCommand(step);
    const result = await this.postJson<{
      success: boolean;
      results: Array<Record<string, unknown>>;
      message?: string;
    }>('/browser/execute', {
      runtimeSessionId: sessionId,
      backend,
      commands: [command],
    });

    const raw = (
      Array.isArray(result.results) && result.results.length > 0 ? result.results[0] || {} : {}
    ) as Record<string, any>;
    const success = raw.status !== 'error' && result.success !== false;
    const rawText =
      typeof raw?.data?.text === 'string'
        ? raw.data.text
        : typeof raw.text === 'string'
          ? raw.text
          : typeof raw.stdout === 'string'
            ? raw.stdout
            : '';
    const textValue = this.extractReadValueText(rawText);

    if (success && step.output_var) {
      variables[step.output_var] = textValue;
    }

    return {
      success,
      step_id: step.step_id,
      action: step.action,
      error: success ? undefined : String(raw.message || result.message || '读取页面值失败'),
      message: success
        ? `读取到变量 ${step.output_var || 'value'}`
        : String(raw.message || result.message || ''),
      text: textValue,
    };
  }

  private extractReadValueText(rawText: string): string {
    const trimmed = rawText.trim();
    if (!trimmed) {
      return '';
    }

    const resultBlockMatch = trimmed.match(/### Result\s*\n([\s\S]*?)\n### Ran Playwright code/);
    const candidate = resultBlockMatch?.[1]?.trim() || trimmed;

    if (candidate === 'true' || candidate === 'false') {
      return candidate;
    }

    if (
      (candidate.startsWith('"') && candidate.endsWith('"')) ||
      (candidate.startsWith("'") && candidate.endsWith("'"))
    ) {
      try {
        const parsed = JSON.parse(candidate);
        if (
          typeof parsed === 'string' ||
          typeof parsed === 'number' ||
          typeof parsed === 'boolean'
        ) {
          return String(parsed).trim();
        }
      } catch {
        return candidate.slice(1, -1).trim();
      }
    }

    return candidate;
  }

  private executeBranchStep(
    step: TemplateStep,
    variables: Record<string, unknown>
  ): ExecutionResult {
    const branch = step.branch;
    if (!branch?.condition_fn) {
      return {
        success: false,
        step_id: step.step_id,
        action: step.action,
        error: 'branch step missing condition_fn',
      };
    }

    try {
      const evaluator = new Function(
        'ctx',
        `const fn = ${branch.condition_fn}; return fn(ctx);`
      ) as (ctx: Record<string, unknown>) => unknown;
      const matched = Boolean(evaluator(variables));
      const outcome = matched ? branch.on_match : branch.on_mismatch;
      if (outcome === 'continue') {
        return {
          success: true,
          step_id: step.step_id,
          action: step.action,
          message: matched ? '条件成立，继续执行' : '条件不成立，但配置为继续执行',
        };
      }
      if (outcome === 'stop') {
        return {
          success: false,
          step_id: step.step_id,
          action: step.action,
          error: matched ? '条件成立，按配置停止执行' : '条件不满足，按配置停止执行',
          message: branch.description || '条件分歧停止执行',
        };
      }
      return {
        success: false,
        step_id: step.step_id,
        action: step.action,
        error: branch.takeover_reason || '条件不满足，需要人工接管',
        message: branch.description || '条件分歧触发人工接管',
        takeover: true,
        takeover_reason: branch.takeover_reason || '条件不满足，需要人工接管',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        step_id: step.step_id,
        action: step.action,
        error: `执行条件表达式失败: ${errorMsg}`,
      };
    }
  }

  private buildLoopPlan(steps: TemplateStep[], loopDraft?: TemplateLoopDraft): LoopPlan | null {
    if (!loopDraft || loopDraft.mode !== 'repeat_until') {
      return null;
    }

    const stepIds = Array.isArray(loopDraft.eachIteration?.stepIds)
      ? loopDraft.eachIteration.stepIds
          .filter((stepId): stepId is string => typeof stepId === 'string' && stepId.trim().length > 0)
          .map((stepId) => stepId.trim())
      : [];
    if (stepIds.length === 0) {
      return null;
    }

    const matchedIndexes = stepIds
      .map((stepId) => steps.findIndex((step) => step.step_id === stepId))
      .filter((index) => index >= 0);
    if (matchedIndexes.length === 0) {
      return null;
    }

    const loopStartIndex = Math.min(...matchedIndexes);
    const loopEndIndex = Math.max(...matchedIndexes);
    const iterationSteps = steps.slice(loopStartIndex, loopEndIndex + 1);
    if (iterationSteps.length === 0) {
      return null;
    }

    const stopWhen = loopDraft.stopWhen;
    const stopRead = stopWhen?.read;
    const conditionFn = typeof stopWhen?.conditionFn === 'string' ? stopWhen.conditionFn.trim() : '';
    const description = typeof stopWhen?.description === 'string' ? stopWhen.description.trim() : '';
    if (!stopRead || !conditionFn || !description) {
      return null;
    }

    const stopReadPlan = this.buildLoopStopReadPlan(stopRead);
    if (!stopReadPlan) {
      return null;
    }

    return {
      mode: 'repeat_until',
      stopWhen: {
        read: stopReadPlan,
        conditionFn,
        description,
      },
      maxIterations: this.resolveLoopMaxIterations(loopDraft.maxIterations),
      onNoProgress: loopDraft.onNoProgress === 'stop' ? 'stop' : 'takeover',
      preLoopSteps: steps.slice(0, loopStartIndex),
      iterationSteps,
      postLoopSteps: steps.slice(loopEndIndex + 1),
    };
  }

  private buildLoopStopReadPlan(read?: LoopStopRead): LoopStopReadPlan | null {
    if (!read?.type) {
      return null;
    }

    if (read.type === 'page_signal') {
      const signalKey = typeof read.key === 'string' ? read.key.trim() : '';
      if (!signalKey) {
        return null;
      }
      return {
        type: 'page_signal',
        key: signalKey,
        step: {
          step_id: 'loop_stop_read',
          action: 'read_page',
          description: '读取循环终止页面信号',
          params: { max_length: 4000 },
        },
      };
    }

    const locator = asRecord(read.locator);
    if (!locator || typeof locator.type !== 'string' || typeof locator.value !== 'string') {
      return null;
    }

    return {
      type: read.type,
      ...(typeof read.key === 'string' && read.key.trim() ? { key: read.key.trim() } : {}),
      step: {
        step_id: 'loop_stop_read',
        action: 'read_value',
        locator: {
          type: locator.type,
          value: locator.value,
        },
        params: {
          selector: this.buildSelector({
            type: locator.type,
            value: locator.value,
          }),
        },
        description: '读取循环终止信号',
      },
    };
  }

  private resolveLoopMaxIterations(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : 100;
  }

  private async readLoopStopSignal(
    loopPlan: LoopPlan,
    iteration: number,
    phase: 'before' | 'after',
    sessionId: string | undefined,
    params: Record<string, unknown>,
    backend: string,
    variables: Record<string, unknown>
  ): Promise<{ result: ExecutionResult; rawValue: unknown; normalizedValue: string }> {
    const step = {
      ...loopPlan.stopWhen.read.step,
      step_id: `${loopPlan.stopWhen.read.step.step_id}:${phase}:${iteration}`,
    };

    if (loopPlan.stopWhen.read.type === 'page_signal') {
      const result = await this.executePageReadStep(step, sessionId, params, backend, variables);
      const rawValue = this.extractLoopPageSignalValue(
        result.rawOutput,
        loopPlan.stopWhen.read.key
      );
      const normalizedValue =
        typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue ?? null);
      return {
        result: {
          ...result.executionResult,
          action: 'loop_stop_read',
          text: normalizedValue,
        },
        rawValue,
        normalizedValue,
      };
    }

    const executionResult = await this.executeReadValueStep(step, sessionId, backend, variables);
    return {
      result: {
        ...executionResult,
        action: 'loop_stop_read',
      },
      rawValue: executionResult.text,
      normalizedValue: executionResult.text || '',
    };
  }

  private async executePageReadStep(
    step: TemplateStep,
    sessionId: string | undefined,
    params: Record<string, unknown>,
    backend: string,
    _variables: Record<string, unknown>
  ): Promise<{
    executionResult: ExecutionResult;
    rawOutput?: Record<string, unknown>;
  }> {
    const substitutedStep = this.substituteStep(step, params);
    const result = await this.postJson<{
      success: boolean;
      results: Array<Record<string, unknown>>;
      message?: string;
    }>('/browser/execute', {
      runtimeSessionId: sessionId,
      backend,
      commands: [this.mapStepToCommand(substitutedStep, params)],
    });

    const raw = (
      Array.isArray(result.results) && result.results.length > 0 ? result.results[0] || {} : {}
    ) as Record<string, any>;
    const success = raw.status !== 'error' && result.success !== false;
    const rawOutput = asRecord(raw.data) || raw;

    return {
      executionResult: {
        success,
        step_id: substitutedStep.step_id,
        action: substitutedStep.action,
        error: success ? undefined : String(raw.message || result.message || '读取页面信号失败'),
        message: success
          ? substitutedStep.description || '读取页面信号成功'
          : String(raw.message || result.message || ''),
        text:
          typeof rawOutput?.text === 'string'
            ? rawOutput.text
            : typeof raw.text === 'string'
              ? raw.text
              : undefined,
        html:
          typeof raw.html === 'string'
            ? raw.html
            : typeof raw.stdout === 'string'
              ? raw.stdout
              : undefined,
      },
      rawOutput,
    };
  }

  private extractLoopPageSignalValue(output: unknown, key: string): unknown {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      return undefined;
    }

    const keyParts = trimmedKey
      .split('.')
      .map((part) => part.trim())
      .filter(Boolean);
    let current: unknown = output;
    for (const part of keyParts) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private evaluateLoopStopCondition(conditionFn: string, value: unknown): boolean {
    try {
      const evaluator = new Function(
        'value',
        `const fn = (value) => ${conditionFn}; return fn(value);`
      ) as (input: unknown) => unknown;
      return Boolean(evaluator(value));
    } catch {
      if (typeof value === 'number') {
        return value === 0;
      }
      if (typeof value === 'string') {
        return value.trim().length === 0;
      }
      return value === false || value == null;
    }
  }

  private substituteStep(step: TemplateStep, params: Record<string, unknown>): TemplateStep {
    const substituted = JSON.parse(JSON.stringify(step)) as TemplateStep;
    const rewrite = (value: unknown): unknown => this.replaceParams(value, params);

    if (substituted.params) {
      substituted.params = Object.fromEntries(
        Object.entries(substituted.params).map(([key, value]) => [key, rewrite(value)])
      );
    }
    if (substituted.locator?.value) {
      substituted.locator.value = String(rewrite(substituted.locator.value));
    }
    if (substituted.output_var) {
      substituted.output_var = String(rewrite(substituted.output_var));
    }
    if (substituted.branch) {
      substituted.branch = {
        ...substituted.branch,
        condition_fn: String(rewrite(substituted.branch.condition_fn)),
        takeover_reason: substituted.branch.takeover_reason
          ? String(rewrite(substituted.branch.takeover_reason))
          : substituted.branch.takeover_reason,
        description: substituted.branch.description
          ? String(rewrite(substituted.branch.description))
          : substituted.branch.description,
      };
    }
    return substituted;
  }

  private mapReadValueStepToCommand(step: TemplateStep): {
    tool: string;
    params: Record<string, unknown>;
  } {
    const method =
      typeof step.params?.method === 'string' && step.params.method.trim()
        ? step.params.method.trim()
        : undefined;
    const selector =
      typeof step.params?.selector === 'string'
        ? step.params.selector
        : step.locator
          ? this.buildSelector(step.locator)
          : undefined;
    const maxLength = typeof step.params?.max_length === 'number' ? step.params.max_length : 4000;
    return {
      tool: 'get_text',
      params: {
        ...(selector ? { selector } : {}),
        ...(method ? { method } : {}),
        ...(typeof step.params?.attribute === 'string' && step.params.attribute.trim()
          ? { attribute: step.params.attribute.trim() }
          : {}),
        max_length: maxLength,
      },
    };
  }

  async captureFinalState(sessionId?: string, backend: string = 'cli'): Promise<ExecutionResult> {
    try {
      const result = await this.postJson<{
        success: boolean;
        results: Array<Record<string, unknown>>;
        message?: string;
      }>('/browser/execute', {
        runtimeSessionId: sessionId,
        backend,
        commands: [
          {
            tool: 'read_page',
            params: { max_length: 4000 },
          },
          {
            tool: 'screenshot',
            params: {},
          },
        ],
      });

      const rawPage: any = result.results?.[0] || {};
      const rawPageData: any = rawPage.data || {};
      const rawScreenshot: any = result.results?.[1] || {};
      const pageSuccess = rawPage.status !== 'error';
      const screenshotSuccess = !rawScreenshot?.status || rawScreenshot.status !== 'error';
      return {
        success: pageSuccess,
        step_id: 'final_state',
        action: 'final_state',
        error: pageSuccess
          ? undefined
          : String(
              rawPage.message ||
                rawScreenshot.message ||
                result.message ||
                'Final state capture failed'
            ),
        message: String(rawPage.message || rawPage.stdout || result.message || ''),
        screenshot:
          screenshotSuccess && typeof rawScreenshot.screenshot === 'string'
            ? rawScreenshot.screenshot
            : typeof rawPage.screenshot === 'string'
              ? rawPage.screenshot
              : undefined,
        text:
          typeof rawPageData.text === 'string'
            ? rawPageData.text
            : typeof rawPage.text === 'string'
              ? rawPage.text
              : undefined,
        html:
          typeof rawPage.html === 'string'
            ? rawPage.html
            : typeof rawPage.stdout === 'string'
              ? rawPage.stdout
              : undefined,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Final state capture failed: ${errorMsg}`);
      return {
        success: false,
        step_id: 'final_state',
        action: 'final_state',
        error: errorMsg,
      };
    }
  }

  /**
   * Close browser connection
   */
  async closeBrowser(sessionId?: string): Promise<void> {
    try {
      const result = await this.postJson<{ success: boolean }>('/browser/reset', {
        runtimeSessionId: sessionId,
        backend: 'cli',
      });
      this.logger.log(`Browser stopped: ${result.success}`);
    } catch (error) {
      this.logger.warn(`Failed to stop browser: ${error}`);
    }
  }
}
