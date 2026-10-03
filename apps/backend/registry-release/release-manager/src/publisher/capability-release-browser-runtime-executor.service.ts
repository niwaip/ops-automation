import { Injectable } from '@nestjs/common';
import { ExecuteCapabilityRuntimeResultDTO } from '../interfaces';
import { CapabilityReleaseBrowserRuntimeLoopExecutorService } from './capability-release-browser-runtime-loop-executor.service';
import { CapabilityReleaseBrowserRuntimeStepExecutorService } from './capability-release-browser-runtime-step-executor.service';
import { BrowserRuntimeExecutionContext } from './capability-release-browser-runtime.types';

@Injectable()
export class CapabilityReleaseBrowserRuntimeExecutorService {
  constructor(
    private readonly capabilityReleaseBrowserRuntimeStepExecutorService: CapabilityReleaseBrowserRuntimeStepExecutorService,
    private readonly capabilityReleaseBrowserRuntimeLoopExecutorService: CapabilityReleaseBrowserRuntimeLoopExecutorService
  ) {}

  async execute(
    context: BrowserRuntimeExecutionContext
  ): Promise<ExecuteCapabilityRuntimeResultDTO | null> {
    const { loopPlan, runtimeStepsToExecute, targetRuntimeStep, state } = context;
    if (loopPlan && !targetRuntimeStep) {
      return this.capabilityReleaseBrowserRuntimeLoopExecutorService.executeLoopPlan(context, state);
    }

    const resumeFromStepId =
      typeof context.options?.metadata?.resumeFromStepId === 'string' &&
      context.options.metadata.resumeFromStepId.trim()
        ? context.options.metadata.resumeFromStepId.trim()
        : undefined;

    let stepsToRun = runtimeStepsToExecute;
    if (resumeFromStepId && !targetRuntimeStep) {
      const resumeIndex = stepsToRun.findIndex((step) => step.id === resumeFromStepId);
      if (resumeIndex >= 0) {
        state.logs.push(
          `[BrowserRuntime][Resume] 从步骤 ${resumeFromStepId} 恢复执行线性计划 (跳过前 ${resumeIndex} 步)`
        );
        stepsToRun = stepsToRun.slice(resumeIndex);
      }
    }

    return this.capabilityReleaseBrowserRuntimeStepExecutorService.executeSequence(
      context,
      stepsToRun,
      'Linear',
      state
    );
  }
}
