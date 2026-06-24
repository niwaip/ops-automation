import { Injectable, Logger } from '@nestjs/common';
import { CreateExecutionEventOptions } from '../../state/execution-event.service';
import { BrowserPhaseExecutor } from '../browser/browser-phase.executor';
import {
  BROWSER_ACTIONS,
  BROWSER_ERROR_CODES,
  BROWSER_MESSAGES,
  BROWSER_RUNTIME,
} from '../browser/browser-execution-constants';
import { RuntimePhaseInvokeResult, RuntimeStepInvokeResult } from '../../adapters/runtime-adapter.interface';
import { RuntimeExecutionOrchestrator } from '../runtime/runtime-execution.orchestrator';
import { RuntimeStepRequestFactory } from '../runtime/runtime-step-request.factory';
import { ExecutionStepService } from '../steps/execution-step.service';
import { EXECUTION_EVENT_TYPE } from '../../contracts/execution-event-type';
import { RECOVERY_MESSAGES } from '../../recovery/recovery-constants';
import type {
  ExecutionStepBrowserPhaseConfig,
  ExecutionStepPhaseMetadata,
} from '../browser/execution-browser-orchestration.service';

export interface ExecutionStepExecutorHooks {
  extractStepPhaseMetadata: (
    step?: Record<string, unknown> | null
  ) => ExecutionStepPhaseMetadata | undefined;
  markPhaseRunningForStep: (
    executionId: string,
    runtimeSessionId: string,
    phaseMetadata?: ExecutionStepPhaseMetadata,
    step?: Record<string, unknown> | null
  ) => Promise<void>;
  emitEvent: (
    executionId: string,
    eventType: (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE],
    payload: unknown,
    options?: CreateExecutionEventOptions
  ) => Promise<void>;
  handleBrowserStepResult: (
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    result: RuntimeStepInvokeResult,
    phaseMetadata?: ExecutionStepPhaseMetadata,
    step?: Record<string, unknown> | null
  ) => Promise<void>;
  extractStepBrowserPhaseConfig: (
    step?: Record<string, unknown> | null
  ) => ExecutionStepBrowserPhaseConfig | undefined;
  skipSingleStep: (stepId: string, executionId: string, reason: string) => Promise<void>;
  advanceExecutionFlow: (executionId: string, runtimeSessionId: string) => Promise<void>;
  buildBrowserPhasePolicyContext: (execution: Record<string, unknown>) =>
    | {
        riskLevel?: 'L0' | 'L1' | 'L2' | 'L3';
        requiresApproval?: boolean;
      }
    | undefined;
  buildBrowserPhaseTraceContext: (execution: Record<string, unknown>) =>
    | {
        userId?: string;
        actorType?: 'system';
        sourceService?: string;
      }
    | undefined;
  extractBrowserPhaseInput: (
    step?: Record<string, unknown> | null
  ) => Record<string, unknown> | undefined;
  handleBrowserPhaseStepResult: (
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    result: RuntimePhaseInvokeResult
  ) => Promise<void>;
  initializeWorkflowActivityPhasesForSkillExecution: (
    executionId: string,
    runtimeSessionId: string,
    capabilityId: string,
    phaseMetadata?: ExecutionStepPhaseMetadata,
    step?: Record<string, unknown> | null
  ) => Promise<void>;
  handleSystemSkillStepResult: (
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    result: RuntimeStepInvokeResult,
    capabilityId: string,
    phaseMetadata?: ExecutionStepPhaseMetadata,
    step?: Record<string, unknown> | null
  ) => Promise<void>;
}

@Injectable()
export class ExecutionStepExecutorService {
  private readonly logger = new Logger(ExecutionStepExecutorService.name);

  constructor(
    private readonly executionStepService: ExecutionStepService,
    private readonly runtimeExecutionOrchestrator: RuntimeExecutionOrchestrator,
    private readonly runtimeStepRequestFactory: RuntimeStepRequestFactory,
    private readonly browserPhaseExecutor?: BrowserPhaseExecutor
  ) {}

  async executeBrowserGotoStep(
    execution: Record<string, unknown>,
    runtimeSessionId: string,
    stepId: string,
    url: string,
    hooks: ExecutionStepExecutorHooks
  ): Promise<void> {
    const executionId = execution.id as string;
    const step = await this.executionStepService.getById(stepId);
    const phaseMetadata = hooks.extractStepPhaseMetadata(
      step as Record<string, unknown> | null | undefined
    );

    await this.executionStepService.setCurrentStep(executionId, stepId);
    await hooks.markPhaseRunningForStep(executionId, runtimeSessionId, phaseMetadata, step);

    await hooks.emitEvent(
      executionId,
      EXECUTION_EVENT_TYPE.STEP_STARTED,
      { action: BROWSER_ACTIONS.GOTO, url },
      {
        runtimeSessionId,
        stepId,
      }
    );

    await this.executionStepService.startStep(stepId, {
      targetJson: { url },
      inputJson: { url },
    });

    const result = await this.runtimeExecutionOrchestrator.executeStep(
      this.runtimeStepRequestFactory.buildBrowserGotoRequest({
        execution,
        stepId,
        runtimeSessionId,
        url,
        executionMode: BROWSER_RUNTIME.EXECUTION_MODE_PLANNED_STEP,
        phaseMetadata,
      })
    );

    await hooks.handleBrowserStepResult(
      executionId,
      runtimeSessionId,
      stepId,
      result,
      phaseMetadata,
      step as Record<string, unknown> | null | undefined
    );
  }

  async executeBrowserPhaseStep(
    execution: Record<string, unknown>,
    runtimeSessionId: string,
    stepId: string,
    hooks: ExecutionStepExecutorHooks
  ): Promise<void> {
    const executionId = execution.id as string;
    const step = await this.executionStepService.getById(stepId);
    const phaseMetadata = hooks.extractStepPhaseMetadata(
      step as Record<string, unknown> | null | undefined
    );
    const browserPhaseConfig = hooks.extractStepBrowserPhaseConfig(
      step as Record<string, unknown> | null | undefined
    );

    if (!phaseMetadata) {
      await hooks.skipSingleStep(stepId, executionId, BROWSER_MESSAGES.PHASE_MISSING_METADATA);
      await hooks.advanceExecutionFlow(executionId, runtimeSessionId);
      return;
    }

    if (!browserPhaseConfig || browserPhaseConfig.commands.length === 0) {
      await hooks.skipSingleStep(stepId, executionId, BROWSER_MESSAGES.PHASE_MISSING_COMMANDS);
      await hooks.advanceExecutionFlow(executionId, runtimeSessionId);
      return;
    }

    if (!this.browserPhaseExecutor) {
      throw new Error(BROWSER_MESSAGES.PHASE_EXECUTOR_UNAVAILABLE);
    }

    await this.executionStepService.setCurrentStep(executionId, stepId);
    await hooks.emitEvent(
      executionId,
      EXECUTION_EVENT_TYPE.STEP_STARTED,
      {
        runtimeSessionId,
        stepId,
        stepName: step?.name,
        action: BROWSER_ACTIONS.EXECUTE_PHASE,
        phaseKey: phaseMetadata.phaseKey,
        phaseName: phaseMetadata.phaseName,
        phaseType: phaseMetadata.phaseType,
      },
      {
        runtimeSessionId,
        stepId,
      }
    );
    await this.executionStepService.startStep(stepId);

    try {
      const phaseInput = (() => {
        const extractedInput =
          hooks.extractBrowserPhaseInput(step as Record<string, unknown> | null | undefined) || {};
        const normalizedInput =
          execution.normalizedInputJson &&
          typeof execution.normalizedInputJson === 'object' &&
          !Array.isArray(execution.normalizedInputJson)
            ? (execution.normalizedInputJson as Record<string, unknown>)
            : undefined;
        const executionInput =
          normalizedInput?.input &&
          typeof normalizedInput.input === 'object' &&
          !Array.isArray(normalizedInput.input)
            ? (normalizedInput.input as Record<string, unknown>)
            : undefined;
        const browserPhaseVariables =
          normalizedInput?.browserPhaseVariables &&
          typeof normalizedInput.browserPhaseVariables === 'object' &&
          !Array.isArray(normalizedInput.browserPhaseVariables)
            ? (normalizedInput.browserPhaseVariables as Record<string, unknown>)
            : undefined;
        return {
          ...(executionInput || {}),
          ...extractedInput,
          ...(browserPhaseVariables ? { browserPhaseVariables } : {}),
        };
      })();
      const result = await this.browserPhaseExecutor.execute({
        executionId,
        executionStepId: stepId,
        phaseKey: phaseMetadata.phaseKey,
        phaseName: phaseMetadata.phaseName,
        phaseType: phaseMetadata.phaseType,
        runtimeSessionId,
        skillId:
          typeof execution.skillId === 'string' && execution.skillId.trim().length > 0
            ? execution.skillId
            : undefined,
        publishedSkillId:
          typeof execution.skillId === 'string' && execution.skillId.trim().length > 0
            ? execution.skillId
            : undefined,
        runtimeType: BROWSER_RUNTIME.TYPE,
        policyContext: hooks.buildBrowserPhasePolicyContext(execution),
        traceContext: hooks.buildBrowserPhaseTraceContext(execution),
        commands: browserPhaseConfig.commands,
        input: phaseInput,
        precheck: browserPhaseConfig.precheck,
        postcheck: browserPhaseConfig.postcheck,
        recoveryPolicy: browserPhaseConfig.recoveryPolicy,
      });

      await hooks.handleBrowserPhaseStepResult(executionId, runtimeSessionId, stepId, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : RECOVERY_MESSAGES.BROWSER_FAILED;
      this.logger.error(`Failed to execute browser phase step ${stepId}: ${message}`);
      await hooks.handleBrowserPhaseStepResult(executionId, runtimeSessionId, stepId, {
        success: false,
        status: 'failed',
        stepResults: [],
        errorCode: BROWSER_ERROR_CODES.PHASE_RUNTIME_FAILED,
        errorMessage: message,
      });
    }
  }

  async executeSystemSkillStep(
    execution: Record<string, unknown>,
    runtimeSessionId: string,
    stepId: string,
    hooks: ExecutionStepExecutorHooks
  ): Promise<void> {
    const executionId = execution.id as string;
    const step = await this.executionStepService.getById(stepId);
    const phaseMetadata = hooks.extractStepPhaseMetadata(
      step as Record<string, unknown> | null | undefined
    );
    this.logger.log(`Executing system skill step ${stepId} for execution ${executionId}`);

    const capabilityId = this.runtimeStepRequestFactory.resolveExecutionCapabilityId(execution);
    if (!capabilityId) {
      this.logger.error(
        `Skill execution step ${stepId} is missing capability identifier for execution ${executionId}`
      );
      await hooks.skipSingleStep(
        stepId,
        executionId,
        'Skill execution step is missing capability identifier'
      );
      await hooks.advanceExecutionFlow(executionId, runtimeSessionId);
      return;
    }

    const capabilityVersion =
      this.runtimeStepRequestFactory.resolveExecutionCapabilityVersion(execution);
    const input = this.runtimeStepRequestFactory.resolveExecutionInput(execution);
    this.logger.log(
      `Calling auth runtime for capability ${capabilityId} (version: ${capabilityVersion || 'latest'}) with input: ${JSON.stringify(input)}`
    );

    await this.executionStepService.setCurrentStep(executionId, stepId);
    await hooks.markPhaseRunningForStep(executionId, runtimeSessionId, phaseMetadata, step);
    await hooks.initializeWorkflowActivityPhasesForSkillExecution(
      executionId,
      runtimeSessionId,
      capabilityId,
      phaseMetadata,
      step as Record<string, unknown> | null | undefined
    );

    await hooks.emitEvent(executionId, EXECUTION_EVENT_TYPE.STEP_STARTED, {
      runtimeSessionId,
      stepId,
      action: 'execute_skill',
      capabilityId,
      capabilityVersion,
    });

    await this.executionStepService.startStep(stepId, {
      inputJson: input,
      targetJson: {
        capabilityId,
        capabilityVersion,
        runtime: 'capability_runtime',
      },
    });

    try {
      const request = this.runtimeStepRequestFactory.buildSkillRuntimeRequest({
        execution,
        stepId,
        runtimeSessionId,
        phaseMetadata,
        step: step as Record<string, unknown> | null | undefined,
      });
      if (!request) {
        throw new Error('Skill runtime request is missing capability identifier');
      }

      const result = await this.runtimeExecutionOrchestrator.executeStep(request);
      await hooks.handleSystemSkillStepResult(
        executionId,
        runtimeSessionId,
        stepId,
        result,
        capabilityId,
        phaseMetadata,
        step as Record<string, unknown> | null | undefined
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'response' in error
            ? String((error as { response?: { data?: unknown } }).response?.data || 'Unknown error')
            : 'Unknown error';

      this.logger.error(`Failed to execute system skill step ${stepId}: ${message}`);
      await hooks.handleSystemSkillStepResult(
        executionId,
        runtimeSessionId,
        stepId,
        {
          success: false,
          status: 'failed',
          errorCode: 'CAPABILITY_RUNTIME_FAILED',
          errorMessage: message,
          rawResult: {
            releaseId: '',
            capabilityId,
            capabilityVersion,
            publishedSkillId: capabilityId,
            runtime: 'capability_runtime',
            success: false,
            logs: [],
            error: message,
          },
        },
        capabilityId,
        phaseMetadata,
        step as Record<string, unknown> | null | undefined
      );
    }
  }
}
