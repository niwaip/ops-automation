import { Injectable } from '@nestjs/common';
import { BrowserRecordingRuntimeLoopPlannerService } from './browser-recording-runtime-loop-planner.service';
import { BrowserRecordingRuntimeStepBuilderService } from './browser-recording-runtime-step-builder.service';
import { pickFirstNonEmptyString } from './browser-recording-runtime-utils';
import {
  asRecord,
  BrowserRecordingRequestedStep,
  BrowserRecordingRuntimePlan,
  BrowserRecordingRuntimeStep,
} from './browser-recording-runtime.types';

@Injectable()
export class BrowserRecordingRuntimePlannerService {
  constructor(
    private readonly browserRecordingRuntimeStepBuilderService: BrowserRecordingRuntimeStepBuilderService,
    private readonly browserRecordingRuntimeLoopPlannerService: BrowserRecordingRuntimeLoopPlannerService
  ) {}

  buildRuntimePlan(
    payload: Record<string, unknown>,
    runtimeInput: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): BrowserRecordingRuntimePlan {
    const backend = this.resolveBackend(payload);
    const sessionPreferences = this.resolveSessionPreferences(payload);
    const runtimeSteps = this.browserRecordingRuntimeStepBuilderService.buildRuntimeSteps(
      payload,
      runtimeInput
    );
    const loopPlan = this.browserRecordingRuntimeLoopPlannerService.buildLoopPlan(
      payload,
      runtimeInput,
      runtimeSteps
    );
    const executionStepMetadata = this.extractRequestedExecutionStepMetadata(metadata);
    const targetRuntimeStep = this.resolveRequestedRuntimeStep(runtimeSteps, executionStepMetadata);
    const runtimeStepsToExecute = targetRuntimeStep
      ? [targetRuntimeStep]
      : loopPlan
        ? [...loopPlan.preLoopSteps, ...loopPlan.iterationSteps, ...loopPlan.postLoopSteps]
        : runtimeSteps;
    const initialUrl = pickFirstNonEmptyString(
      runtimeInput.url,
      runtimeInput.startUrl,
      runtimeSteps.find((step) => step.action === 'goto' || step.action === 'navigate')?.target,
      (runtimeSteps.find((step) => step.action === 'goto' || step.action === 'navigate')?.args as any)?.url
    );

    return {
      backend,
      sessionPreferences,
      runtimeSteps,
      runtimeStepsToExecute,
      targetRuntimeStep,
      loopPlan,
      ...(initialUrl ? { initialUrl } : {}),
    };
  }

  private resolveBackend(payload: Record<string, unknown>): string {
    const apiEndpoints = asRecord(payload.apiEndpoints);
    const runtimeMetadata = asRecord(apiEndpoints?.runtimeMetadata);
    const executionPlan = asRecord(runtimeMetadata?.executionPlan);

    return (
      pickFirstNonEmptyString(
        payload.backend,
        payload.executionBackend,
        runtimeMetadata?.backend,
        executionPlan?.backend,
        process.env.BROWSER_RECORDING_BACKEND,
        process.env.BROWSER_EXECUTION_BACKEND,
        'cli'
      ) || 'cli'
    );
  }

  private resolveSessionPreferences(payload: Record<string, unknown>): {
    mode?: 'interactive' | 'agent';
    enableCodegen?: boolean;
    headless?: boolean;
  } {
    const apiEndpoints = asRecord(payload.apiEndpoints);
    const runtimeMetadata = asRecord(apiEndpoints?.runtimeMetadata);
    const executionPlan = asRecord(runtimeMetadata?.executionPlan);
    const sessionPreferences =
      asRecord(payload.sessionPreferences) ||
      asRecord(runtimeMetadata?.sessionPreferences) ||
      asRecord(executionPlan?.sessionPreferences) ||
      {};
    const mode = pickFirstNonEmptyString(
      sessionPreferences.mode,
      process.env.BROWSER_RUNTIME_SESSION_MODE,
      'agent'
    );

    return {
      ...(mode === 'interactive' || mode === 'agent' ? { mode } : {}),
      enableCodegen:
        typeof sessionPreferences.enableCodegen === 'boolean'
          ? sessionPreferences.enableCodegen
          : process.env.BROWSER_RUNTIME_ENABLE_CODEGEN === 'true'
            ? true
            : process.env.BROWSER_RUNTIME_ENABLE_CODEGEN === 'false'
              ? false
              : false,
      headless:
        typeof sessionPreferences.headless === 'boolean'
          ? sessionPreferences.headless
          : process.env.BROWSER_RUNTIME_HEADLESS === 'true'
            ? true
            : process.env.BROWSER_RUNTIME_HEADLESS === 'false'
              ? false
              : false,
    };
  }

  private extractRequestedExecutionStepMetadata(
    metadata?: Record<string, unknown>
  ): BrowserRecordingRequestedStep {
    const name = pickFirstNonEmptyString(metadata?.executionStepName, metadata?.stepName);
    const rawIndex = metadata?.executionStepIndex ?? metadata?.stepIndex;
    const index =
      typeof rawIndex === 'number' && Number.isFinite(rawIndex)
        ? rawIndex
        : typeof rawIndex === 'string' && rawIndex.trim() && !Number.isNaN(Number(rawIndex))
          ? Number(rawIndex)
          : undefined;

    return {
      ...(name ? { name } : {}),
      ...(typeof index === 'number' ? { index } : {}),
    };
  }

  private resolveRequestedRuntimeStep(
    runtimeSteps: BrowserRecordingRuntimeStep[],
    requestedStep: BrowserRecordingRequestedStep
  ): BrowserRecordingRuntimeStep | null {
    if (requestedStep.name) {
      const matchedByName = runtimeSteps.find((step) => step.name === requestedStep.name);
      if (matchedByName) {
        return matchedByName;
      }
    }

    if (
      typeof requestedStep.index === 'number' &&
      Number.isInteger(requestedStep.index) &&
      requestedStep.index > 0 &&
      requestedStep.index <= runtimeSteps.length
    ) {
      return runtimeSteps[requestedStep.index - 1];
    }

    return null;
  }
}
