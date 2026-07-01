import axios from 'axios';
import { ExecuteCapabilityRuntimeResultDTO } from '../interfaces';
import { CapabilityReleaseBrowserRuntimeSupportService } from './capability-release-browser-runtime-support.service';
import { CapabilityReleaseBrowserRuntimeStepExecutorService } from './capability-release-browser-runtime-step-executor.service';
import {
  BrowserRuntimeExecutionContext,
  BrowserRuntimeMutableState,
} from './capability-release-browser-runtime.types';

export class CapabilityReleaseBrowserRuntimeLoopExecutorService {
  constructor(
    private readonly capabilityReleaseBrowserRuntimeStepExecutorService: CapabilityReleaseBrowserRuntimeStepExecutorService,
    private readonly capabilityReleaseBrowserRuntimeSupportService: CapabilityReleaseBrowserRuntimeSupportService
  ) {}

  async executeLoopPlan(
    context: BrowserRuntimeExecutionContext,
    state: BrowserRuntimeMutableState
  ): Promise<ExecuteCapabilityRuntimeResultDTO | null> {
    const { loopPlan } = context;
    if (!loopPlan) {
      return null;
    }

    if (loopPlan.preLoopSteps.length > 0) {
      const preResult = await this.capabilityReleaseBrowserRuntimeStepExecutorService.executeSequence(
        context,
        loopPlan.preLoopSteps,
        'PreLoop',
        state
      );
      if (preResult) {
        return preResult;
      }
    }

    for (let iteration = 1; iteration <= loopPlan.maxIterations; iteration += 1) {
      const beforeStop = await this.readLoopStopSignal(context, iteration, 'before', state);
      if (beforeStop.failure) {
        return beforeStop.failure;
      }
      if (
        this.capabilityReleaseBrowserRuntimeSupportService.evaluateLoopStopCondition(
          loopPlan.stopWhen.conditionFn,
          beforeStop.rawValue
        )
      ) {
        state.logs.push(`[BrowserRuntime][Loop ${iteration}] 终止条件已满足，结束循环`);
        break;
      }

      const beforeSignature = beforeStop.normalizedValue;
      const iterationResult =
        await this.capabilityReleaseBrowserRuntimeStepExecutorService.executeSequence(
          context,
          loopPlan.iterationSteps,
          `Loop ${iteration}`,
          state
        );
      if (iterationResult) {
        return iterationResult;
      }

      const afterStop = await this.readLoopStopSignal(context, iteration, 'after', state);
      if (afterStop.failure) {
        return afterStop.failure;
      }
      if (
        this.capabilityReleaseBrowserRuntimeSupportService.evaluateLoopStopCondition(
          loopPlan.stopWhen.conditionFn,
          afterStop.rawValue
        )
      ) {
        state.logs.push(`[BrowserRuntime][Loop ${iteration}] 已达到终止条件`);
        break;
      }

      if (beforeSignature === afterStop.normalizedValue) {
        const message = `循环第 ${iteration} 轮执行后页面状态无进展`;
        state.logs.push(`[BrowserRuntime][Loop][NoProgress] ${message}`);
        if (loopPlan.onNoProgress === 'takeover') {
          state.preserveRuntimeSession = true;
          state.runtimeEvidence.takeoverReason = message;
          await this.capabilityReleaseBrowserRuntimeSupportService.freezeBrowserRuntimeSession(
            context.browserWorkerUrl,
            context.runtimeSessionId,
            context.backend,
            message
          );
          return context.failWithAudit({
            message,
            status: 'takeover_required',
            takeoverReason: message,
            eventType: 'skill_runtime_takeover_required_by_loop_no_progress',
            summary: `运行时接管：Browser Recording 循环无进展: ${context.skillId}`,
            details: {
              iteration,
            },
          });
        }
        return context.failWithAudit({
          message,
          status: 'blocked',
          eventType: 'skill_runtime_blocked_by_loop_no_progress',
          summary: `运行时阻断：Browser Recording 循环无进展: ${context.skillId}`,
          details: {
            iteration,
          },
        });
      }

      if (iteration === loopPlan.maxIterations) {
        const message = `已达到最大循环次数 ${loopPlan.maxIterations}`;
        state.logs.push(`[BrowserRuntime][Loop][Stop] ${message}`);
        return context.failWithAudit({
          message,
          status: 'blocked',
          eventType: 'skill_runtime_blocked_by_loop_limit',
          summary: `运行时阻断：Browser Recording 达到最大循环次数: ${context.skillId}`,
          details: {
            iteration,
            maxIterations: loopPlan.maxIterations,
          },
        });
      }
    }

    if (loopPlan.postLoopSteps.length > 0) {
      return this.capabilityReleaseBrowserRuntimeStepExecutorService.executeSequence(
        context,
        loopPlan.postLoopSteps,
        'PostLoop',
        state
      );
    }
    return null;
  }

  private async readLoopStopSignal(
    context: BrowserRuntimeExecutionContext,
    iteration: number,
    phase: 'before' | 'after',
    state: BrowserRuntimeMutableState
  ): Promise<{
    failure: ExecuteCapabilityRuntimeResultDTO | null;
    rawValue?: unknown;
    normalizedValue?: string;
  }> {
    const { loopPlan } = context;
    if (!loopPlan) {
      return { failure: null };
    }

    state.runtimeEvidence.currentLoopIteration = iteration;
    const stopStep = loopPlan.stopWhen.read.step;
    const action = stopStep.action === 'read_page' ? 'read_page' : 'get_text';
    state.logs.push(`[BrowserRuntime][Loop ${iteration}][${phase}] 读取终止条件`);
    const response = await axios.post<{
      success: boolean;
      snapshotId?: string;
      output?: Record<string, unknown>;
      errorMessage?: string;
    }>(
      `${context.browserWorkerUrl}/browser/execute-step`,
      {
        executionId: context.runtimeExecutionId,
        runtimeSessionId: context.runtimeSessionId,
        backend: context.backend,
        stepId: `${context.options?.stepId || context.release.id}:${stopStep.id}:${phase}:${iteration}`,
        action,
        ...(stopStep.target ? { target: stopStep.target } : {}),
        ...(stopStep.args && Object.keys(stopStep.args).length > 0 ? { args: stopStep.args } : {}),
      },
      { timeout: 120000 }
    );
    const result = response.data;
    if (!result.success) {
      const message = result.errorMessage || '读取循环终止条件失败';
      state.logs.push(`[BrowserRuntime][Error] ${message}`);
      return {
        failure: await context.failWithAudit({
          message,
          status: 'blocked',
          eventType: 'skill_runtime_blocked_by_loop_stop_read',
          summary: `运行时阻断：Browser Recording 循环终止条件读取失败: ${context.skillId}`,
          details: {
            stepId: stopStep.id,
            action,
            target: stopStep.target || null,
            phase,
            iteration,
          },
        }),
      };
    }

    const rawValue =
      loopPlan.stopWhen.read.type === 'page_signal'
        ? this.capabilityReleaseBrowserRuntimeSupportService.extractLoopPageSignalValue(
            result.output,
            loopPlan.stopWhen.read.key
          )
        : this.capabilityReleaseBrowserRuntimeSupportService.extractBrowserStepText(result.output);
    const normalizedValue =
      typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue ?? null);
    state.stepResults.push({
      stepId: `${stopStep.id}:${phase}:${iteration}`,
      name: `${stopStep.name} (${phase})`,
      action: 'loop_stop_read',
      target: stopStep.target || null,
      output: result.output || null,
      text: normalizedValue,
      meta: {
        phase,
        iteration,
        stopReadType: loopPlan.stopWhen.read.type,
        description: loopPlan.stopWhen.description,
      },
    });
    return { failure: null, rawValue, normalizedValue };
  }
}
