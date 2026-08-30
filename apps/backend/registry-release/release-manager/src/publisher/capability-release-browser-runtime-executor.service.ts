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
    return this.capabilityReleaseBrowserRuntimeStepExecutorService.executeSequence(
      context,
      runtimeStepsToExecute,
      'Linear',
      state
    );
  }
}
