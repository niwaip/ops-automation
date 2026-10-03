import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ExecuteCapabilityRuntimeResultDTO } from '../interfaces';
import { CapabilityReleaseBrowserRuntimeSupportService } from './capability-release-browser-runtime-support.service';
import { CapabilityReleaseBrowserRuntimeStepExecutorService } from './capability-release-browser-runtime-step-executor.service';
import {
  BrowserRuntimeExecutionContext,
  BrowserRuntimeMutableState,
} from './capability-release-browser-runtime.types';
import { BrowserRuntimeStepResultStateService } from './browser-runtime-result/browser-runtime-step-result-state.service';

@Injectable()
export class CapabilityReleaseBrowserRuntimeLoopExecutorService {
  constructor(
    private readonly capabilityReleaseBrowserRuntimeStepExecutorService: CapabilityReleaseBrowserRuntimeStepExecutorService,
    private readonly capabilityReleaseBrowserRuntimeSupportService: CapabilityReleaseBrowserRuntimeSupportService,
    private readonly browserRuntimeStepResultStateService: BrowserRuntimeStepResultStateService
  ) {}

  async executeLoopPlan(
    context: BrowserRuntimeExecutionContext,
    state: BrowserRuntimeMutableState
  ): Promise<ExecuteCapabilityRuntimeResultDTO | null> {
    const { loopPlan } = context;
    if (!loopPlan) {
      return null;
    }

    const resumeFromStepId =
      typeof context.options?.metadata?.resumeFromStepId === 'string' &&
      context.options.metadata.resumeFromStepId.trim()
        ? context.options.metadata.resumeFromStepId.trim()
        : undefined;

    const preLoopResumeIndex = resumeFromStepId
      ? loopPlan.preLoopSteps.findIndex((s) => s.id === resumeFromStepId)
      : -1;
    const iterationResumeIndex = resumeFromStepId
      ? loopPlan.iterationSteps.findIndex((s) => s.id === resumeFromStepId)
      : -1;
    const postLoopResumeIndex = resumeFromStepId
      ? loopPlan.postLoopSteps.findIndex((s) => s.id === resumeFromStepId)
      : -1;

    const isResumingInsideIteration = iterationResumeIndex >= 0;
    const isResumingPreLoop = preLoopResumeIndex >= 0;
    const isResumingPostLoop = postLoopResumeIndex >= 0;

    if (!isResumingInsideIteration && !isResumingPostLoop && loopPlan.preLoopSteps.length > 0) {
      const stepsToRun = isResumingPreLoop
        ? loopPlan.preLoopSteps.slice(preLoopResumeIndex)
        : loopPlan.preLoopSteps;
      if (isResumingPreLoop) {
        state.logs.push(`[BrowserRuntime][Resume] 从前置步骤 ${resumeFromStepId} 恢复执行`);
      }
      const preResult = await this.capabilityReleaseBrowserRuntimeStepExecutorService.executeSequence(
        context,
        stepsToRun,
        'PreLoop',
        state
      );
      if (preResult) {
        return preResult;
      }
    } else if (isResumingInsideIteration || isResumingPostLoop) {
      state.logs.push(`[BrowserRuntime][Resume] 已跳过前置步骤 (当前已在页面目标状态)`);
    }

    if (!isResumingPostLoop) {
      const startIteration = isResumingInsideIteration
        ? Math.max(
            1,
            Number(
              (
                context.options?.metadata?.runtimeEvidence as
                  | Record<string, unknown>
                  | undefined
              )?.currentLoopIteration
            ) || 1
          )
        : 1;

      for (let iteration = startIteration; iteration <= loopPlan.maxIterations; iteration += 1) {
        state.runtimeEvidence.currentLoopIteration = iteration;

        const isResumedCurrentIteration = isResumingInsideIteration && iteration === startIteration;
        let beforeSignature: string | undefined;

        if (!isResumedCurrentIteration) {
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
          beforeSignature = beforeStop.normalizedValue;
        }

        const stepsToRun = isResumedCurrentIteration
          ? loopPlan.iterationSteps.slice(iterationResumeIndex)
          : loopPlan.iterationSteps;

        if (isResumedCurrentIteration) {
          state.logs.push(
            `[BrowserRuntime][Resume] 从循环第 ${iteration} 轮步骤 ${resumeFromStepId} 恢复执行 (执行剩余 ${stepsToRun.length} 步)`
          );
        }

        const iterationResult =
          await this.capabilityReleaseBrowserRuntimeStepExecutorService.executeSequence(
            context,
            stepsToRun,
            isResumedCurrentIteration ? `Loop ${iteration} (Resumed)` : `Loop ${iteration}`,
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

        if (beforeSignature !== undefined && beforeSignature === afterStop.normalizedValue) {
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
    }

    if (loopPlan.postLoopSteps.length > 0) {
      const stepsToRun = isResumingPostLoop
        ? loopPlan.postLoopSteps.slice(postLoopResumeIndex)
        : loopPlan.postLoopSteps;
      if (isResumingPostLoop) {
        state.logs.push(`[BrowserRuntime][Resume] 从后置步骤 ${resumeFromStepId} 恢复执行`);
      }
      return this.capabilityReleaseBrowserRuntimeStepExecutorService.executeSequence(
        context,
        stepsToRun,
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
    const stateStepId = `${stopStep.id}:${phase}:${iteration}`;
    const attempt = this.browserRuntimeStepResultStateService.nextAttempt(state, stateStepId);
    const response = await axios.post<{
      success: boolean;
      snapshotId?: string;
      output?: Record<string, unknown>;
      errorMessage?: string;
      pageState?: Record<string, unknown>;
      artifacts?: Array<Record<string, unknown>>;
      attemptedAt?: string;
      observedAt?: string;
      warningCodes?: string[];
    }>(
      `${context.browserWorkerUrl}/browser/execute-step`,
      {
        executionId: context.runtimeExecutionId,
        runtimeSessionId: context.runtimeSessionId,
        backend: context.backend,
        stepId: `${context.options?.stepId || context.release.id}:${stopStep.id}:${phase}:${iteration}`,
        attempt,
        action,
        ...(stopStep.target ? { target: stopStep.target } : {}),
        ...(stopStep.args && Object.keys(stopStep.args).length > 0 ? { args: stopStep.args } : {}),
      },
      {
        timeout: 120000,
        headers: {
          'x-internal-auth': process.env.INTERNAL_API_SHARED_SECRET || 'ops_internal_shared_secret_change_me',
        },
      }
    );
    const result = response.data;
    if (!result.success) {
      this.browserRuntimeStepResultStateService.recordWorkerResult({
        state,
        step: { ...stopStep, id: stateStepId },
        attempt,
        result: result as Record<string, unknown>,
        metadata: { phase, iteration, stopReadType: loopPlan.stopWhen.read.type },
      });
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
    this.browserRuntimeStepResultStateService.recordWorkerResult({
      state,
      step: { ...stopStep, id: stateStepId, name: `${stopStep.name} (${phase})` },
      attempt,
      result: result as Record<string, unknown>,
      metadata: {
        phase,
        iteration,
        stopReadType: loopPlan.stopWhen.read.type,
        description: loopPlan.stopWhen.description,
        text: normalizedValue,
      },
    });
    return { failure: null, rawValue, normalizedValue };
  }
}
