import { Injectable, Logger } from '@nestjs/common';
import { CdpWorkerClientService } from './cdp-worker-client.service';
import { CdpStepRunnerService } from './cdp-step-runner.service';
import {
  asRecord,
  type ExecutionResult,
  type LoopPlan,
  type LoopStopRead,
  type LoopStopReadPlan,
  type TemplateLoopDraft,
  type TemplateStep,
} from './cdp-executor.types';

@Injectable()
export class CdpLoopRunnerService {
  private readonly logger = new Logger(CdpLoopRunnerService.name);

  constructor(
    private readonly client: CdpWorkerClientService,
    private readonly stepRunner: CdpStepRunnerService
  ) {}

  buildLoopPlan(steps: TemplateStep[], loopDraft?: TemplateLoopDraft): LoopPlan | null {
    if (!loopDraft || loopDraft.mode !== 'repeat_until') {
      return null;
    }

    const stepIds = Array.isArray(loopDraft.eachIteration?.stepIds)
      ? loopDraft.eachIteration.stepIds
          .filter(
            (stepId): stepId is string => typeof stepId === 'string' && stepId.trim().length > 0
          )
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
    const conditionFn =
      typeof stopWhen?.conditionFn === 'string' ? stopWhen.conditionFn.trim() : '';
    const description =
      typeof stopWhen?.description === 'string' ? stopWhen.description.trim() : '';
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

  buildLoopStopReadPlan(read?: LoopStopRead): LoopStopReadPlan | null {
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
          selector: this.stepRunner.buildSelector({
            type: locator.type,
            value: locator.value,
          }),
        },
        description: '读取循环终止信号',
      },
    };
  }

  resolveLoopMaxIterations(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : 100;
  }

  async readLoopStopSignal(
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

    const executionResult = await this.stepRunner.executeReadValueStep(step, sessionId, backend, variables);
    return {
      result: {
        ...executionResult,
        action: 'loop_stop_read',
      },
      rawValue: executionResult.text,
      normalizedValue: executionResult.text || '',
    };
  }

  async executePageReadStep(
    step: TemplateStep,
    sessionId: string | undefined,
    params: Record<string, unknown>,
    backend: string,
    _variables: Record<string, unknown>
  ): Promise<{
    executionResult: ExecutionResult;
    rawOutput?: Record<string, unknown>;
  }> {
    const substitutedStep = this.stepRunner.substituteStep(step, params);
    const result = await this.client.postJson<{
      success: boolean;
      results: Array<Record<string, unknown>>;
      message?: string;
    }>('/browser/execute', {
      runtimeSessionId: sessionId,
      backend,
      commands: [this.stepRunner.mapStepToCommand(substitutedStep, params)],
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
        html: this.stepRunner.extractHtmlResult(raw.html),
      },
      rawOutput,
    };
  }

  extractLoopPageSignalValue(output: unknown, key: string): unknown {
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

  evaluateLoopStopCondition(conditionFn: string, value: unknown): boolean {
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

  async runLoop(
    loopPlan: LoopPlan,
    sessionId: string | undefined,
    params: Record<string, unknown>,
    backend: string,
    variables: Record<string, unknown>,
    results: ExecutionResult[],
    executeSequence: (seq: TemplateStep[]) => Promise<ExecutionResult | null>
  ): Promise<ExecutionResult | null> {
    const preLoopFailure = await executeSequence(loopPlan.preLoopSteps);
    if (preLoopFailure) {
      return preLoopFailure;
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
        return beforeStop.result;
      }
      if (this.evaluateLoopStopCondition(loopPlan.stopWhen.conditionFn, beforeStop.rawValue)) {
        break;
      }

      const beforeSignature = beforeStop.normalizedValue;
      const iterationFailure = await executeSequence(loopPlan.iterationSteps);
      if (iterationFailure) {
        return iterationFailure;
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
        return afterStop.result;
      }
      if (this.evaluateLoopStopCondition(loopPlan.stopWhen.conditionFn, afterStop.rawValue)) {
        break;
      }

      if (beforeSignature === afterStop.normalizedValue) {
        const noProgressResult: ExecutionResult =
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
              };
        results.push(noProgressResult);
        return noProgressResult;
      }

      if (iteration === loopPlan.maxIterations) {
        const maxIterResult: ExecutionResult = {
          success: false,
          step_id: 'loop_max_iterations',
          action: 'loop_control',
          error: `已达到最大循环次数 ${loopPlan.maxIterations}`,
          message: loopPlan.stopWhen.description,
        };
        results.push(maxIterResult);
        return maxIterResult;
      }
    }

    return executeSequence(loopPlan.postLoopSteps);
  }
}
