import { Injectable } from '@nestjs/common';
import { ExecutionDto } from '../../state/execution.dto';
import { CreateExecutionEventOptions } from '../../state/execution-event.service';
import { ExecutionFailureHooks, ExecutionFailureService } from '../../recovery/execution-failure.service';
import { ExecutionHumanControlHooks } from '../../human-control/execution-human-control.service';
import { ExecutionPhaseSyncService } from '../../state/execution-phase-sync.service';
import { RuntimePhaseInvokeResult, RuntimeStepInvokeResult } from '../../adapters/runtime-adapter.interface';
import {
  ExecutionBrowserOrchestrationHooks,
  ExecutionBrowserOrchestrationService,
  ExecutionStepPhaseMetadata,
} from '../browser/execution-browser-orchestration.service';
import { HandleSystemSkillStepResultHooks } from './execution-system-skill-result.service';
import { AdvanceExecutionFlowHooks } from '../flow/execution-flow-runner.service';
import { ExecutionStepExecutorHooks } from '../flow/execution-step-executor.service';
import { EXECUTION_EVENT_TYPE } from '../../contracts/execution-event-type';

type ExecutionEventType =
  (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE];

interface ExecutionRuntimeFailureCallbacks {
  emitEvent: (
    executionId: string,
    eventType: ExecutionEventType,
    payload: unknown,
    options?: CreateExecutionEventOptions
  ) => Promise<void>;
  updateStatus: (id: string, newStatus: string) => Promise<void>;
  closeRuntimeSessionQuietly: (
    runtimeSessionId: string,
    executionId: string,
    reason: string
  ) => Promise<void>;
}

interface ExecutionRuntimeHumanControlCallbacks {
  getExecutionDto: (id: string, requester?: { id: string; role?: string }) => Promise<ExecutionDto>;
  emitEvent: (
    executionId: string,
    eventType: ExecutionEventType,
    payload: unknown,
    options?: CreateExecutionEventOptions
  ) => Promise<void>;
  updateStatus: (id: string, newStatus: string) => Promise<void>;
  freezeRuntimeSessionQuietly: (
    runtimeSessionId: string | null | undefined,
    executionId: string,
    reason: string
  ) => Promise<void>;
  resumeRuntimeSessionQuietly: (
    runtimeSessionId: string | null | undefined,
    executionId: string,
    stepId?: string
  ) => Promise<void>;
  advanceExecutionFlow: (executionId: string, runtimeSessionId: string) => Promise<void>;
}

interface CreateBrowserOrchestrationHooksInput {
  emitEvent: (
    executionId: string,
    eventType: ExecutionEventType,
    payload: unknown,
    options?: CreateExecutionEventOptions
  ) => Promise<void>;
  advanceExecutionFlow: (executionId: string, runtimeSessionId: string) => Promise<void>;
  enterRuntimeWaitingInput: (
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    requiredInputs: unknown[],
    reason?: string
  ) => Promise<void>;
  enterPendingApprovalFromRuntimeStep: (executionId: string, reason: string) => Promise<void>;
  failExecutionFromRuntimeStep: (input: {
    executionId: string;
    stepId: string;
    failureReason: string;
    failureCode: string;
    runtimeSessionId?: string;
  }) => Promise<void>;
  takeover: (executionId: string, reason: string) => Promise<void>;
  failureHooks: ExecutionRuntimeFailureCallbacks;
}

interface CreateStepExecutorHooksInput {
  emitEvent: (
    executionId: string,
    eventType: ExecutionEventType,
    payload: unknown,
    options?: CreateExecutionEventOptions
  ) => Promise<void>;
  advanceExecutionFlow: (executionId: string, runtimeSessionId: string) => Promise<void>;
  handleBrowserStepResult: (
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    result: RuntimeStepInvokeResult,
    phaseMetadata?: ExecutionStepPhaseMetadata,
    step?: Record<string, unknown> | null
  ) => Promise<void>;
  handleBrowserPhaseStepResult: (
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    result: RuntimePhaseInvokeResult
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
  failureHooks: ExecutionRuntimeFailureCallbacks;
}

interface CreateSystemSkillResultHooksInput {
  executionId: string;
  runtimeSessionId: string;
  stepId: string;
  emitEvent: (
    executionId: string,
    eventType: ExecutionEventType,
    payload: unknown,
    options?: CreateExecutionEventOptions
  ) => Promise<void>;
  advanceExecutionFlow: (executionId: string, runtimeSessionId: string) => Promise<void>;
  failExecutionFromRuntimeStep: (
    input: {
      executionId: string;
      stepId: string;
      failureReason: string;
      failureCode: string;
      runtimeSessionId?: string;
    },
    hooks: ExecutionFailureHooks
  ) => Promise<void>;
  requestSystemTakeover: (
    executionId: string,
    reason: string,
    hooks: ExecutionHumanControlHooks
  ) => Promise<void>;
  enterRuntimeWaitingInput: (
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    requiredInputs: unknown[],
    reason: string | undefined,
    hooks: ExecutionFailureHooks
  ) => Promise<void>;
  enterPendingApprovalFromRuntimeStep: (
    executionId: string,
    reason: string,
    hooks: Pick<ExecutionFailureHooks, 'updateStatus'>
  ) => Promise<void>;
  failureHooks: ExecutionRuntimeFailureCallbacks;
  humanControlHooks: ExecutionRuntimeHumanControlCallbacks;
  loadWorkflowActivityPhaseDefinitions?: (
    capabilityId: string,
    parentPhaseKey: string
  ) => Promise<unknown>;
}

interface CreateFlowRunnerHooksInput {
  completeActivePhasesOnExecutionSuccess: (
    executionId: string,
    runtimeSessionId: string
  ) => Promise<void>;
  updateStatus: (executionId: string, newStatus: string) => Promise<void>;
  closeRuntimeSessionQuietly: (
    runtimeSessionId: string,
    executionId: string,
    reason: string
  ) => Promise<void>;
  extractStepUrl: (
    step: Record<string, unknown>,
    execution: Record<string, unknown>
  ) => string | undefined;
  skipSingleStep: (
    stepId: string,
    executionId: string,
    reason: string,
    hooks: ExecutionFailureHooks
  ) => Promise<void>;
  failExecutionFromRuntimeStep: (
    input: {
      executionId: string;
      stepId: string;
      failureReason: string;
      failureCode: string;
      runtimeSessionId?: string;
    },
    hooks: ExecutionFailureHooks
  ) => Promise<void>;
  executeBrowserGotoStep: (
    execution: Record<string, unknown>,
    runtimeSessionId: string,
    stepId: string,
    url: string
  ) => Promise<void>;
  enterWaitingInput: (execution: Record<string, unknown>, stepId: string) => Promise<void>;
  executeBrowserPhaseStep: (
    execution: Record<string, unknown>,
    runtimeSessionId: string,
    stepId: string
  ) => Promise<void>;
  executeSystemSkillStep: (
    execution: Record<string, unknown>,
    runtimeSessionId: string,
    stepId: string
  ) => Promise<void>;
  readBrowserTextBySelector?: (
    runtimeSessionId: string,
    selector: string
  ) => Promise<string | undefined>;
  failureHooks: ExecutionRuntimeFailureCallbacks;
}

@Injectable()
export class ExecutionRuntimeHooksService {
  constructor(
    private readonly executionBrowserOrchestrationService: ExecutionBrowserOrchestrationService,
    private readonly executionPhaseSyncService: ExecutionPhaseSyncService,
    private readonly executionFailureService: ExecutionFailureService
  ) {}

  createFailureHooks(input: ExecutionRuntimeFailureCallbacks): ExecutionFailureHooks {
    return {
      emitEvent: input.emitEvent,
      updateStatus: input.updateStatus,
      closeRuntimeSessionQuietly: input.closeRuntimeSessionQuietly,
    };
  }

  createHumanControlHooks(
    input: ExecutionRuntimeHumanControlCallbacks
  ): ExecutionHumanControlHooks {
    return {
      getExecutionDto: input.getExecutionDto,
      emitEvent: input.emitEvent,
      updateStatus: input.updateStatus,
      freezeRuntimeSessionQuietly: input.freezeRuntimeSessionQuietly,
      resumeRuntimeSessionQuietly: input.resumeRuntimeSessionQuietly,
      advanceExecutionFlow: input.advanceExecutionFlow,
    };
  }

  createSystemSkillResultHooks(
    input: CreateSystemSkillResultHooksInput
  ): HandleSystemSkillStepResultHooks {
    const failureHooks = this.createFailureHooks(input.failureHooks);
    const humanControlHooks = this.createHumanControlHooks(input.humanControlHooks);

    return {
      emitEvent: (eventType, payload) =>
        input.emitEvent(input.executionId, eventType, payload, {
          runtimeSessionId: input.runtimeSessionId,
          stepId: input.stepId,
        }),
      advanceExecutionFlow: () =>
        input.advanceExecutionFlow(input.executionId, input.runtimeSessionId),
      failExecution: (failureReason, failureCode) =>
        input.failExecutionFromRuntimeStep(
          {
            executionId: input.executionId,
            stepId: input.stepId,
            failureReason,
            failureCode,
            runtimeSessionId: input.runtimeSessionId,
          },
          failureHooks
        ),
      takeover: (reason) =>
        input.requestSystemTakeover(input.executionId, reason, humanControlHooks),
      enterWaitingInput: (requiredInputs, reason) =>
        input.enterRuntimeWaitingInput(
          input.executionId,
          input.runtimeSessionId,
          input.stepId,
          requiredInputs,
          reason,
          failureHooks
        ),
      enterPendingApproval: (reason) =>
        input.enterPendingApprovalFromRuntimeStep(input.executionId, reason, failureHooks),
      loadWorkflowActivityPhaseDefinitions: input.loadWorkflowActivityPhaseDefinitions,
    };
  }

  createFlowRunnerHooks(input: CreateFlowRunnerHooksInput): AdvanceExecutionFlowHooks {
    const failureHooks = this.createFailureHooks(input.failureHooks);

    return {
      completeActivePhasesOnExecutionSuccess: input.completeActivePhasesOnExecutionSuccess,
      updateStatus: input.updateStatus,
      closeRuntimeSessionQuietly: input.closeRuntimeSessionQuietly,
      extractStepUrl: input.extractStepUrl,
      skipSingleStep: (stepId, executionId, reason) =>
        input.skipSingleStep(stepId, executionId, reason, failureHooks),
      failExecutionFromRuntimeStep: (failure) =>
        input.failExecutionFromRuntimeStep(failure, failureHooks),
      executeBrowserGotoStep: input.executeBrowserGotoStep,
      enterWaitingInput: input.enterWaitingInput,
      executeBrowserPhaseStep: input.executeBrowserPhaseStep,
      executeSystemSkillStep: input.executeSystemSkillStep,
      readBrowserTextBySelector: input.readBrowserTextBySelector,
    };
  }

  createBrowserOrchestrationHooks(
    input: CreateBrowserOrchestrationHooksInput
  ): ExecutionBrowserOrchestrationHooks {
    const failureHooks = this.createFailureHooks(input.failureHooks);

    return {
      emitEvent: input.emitEvent,
      advanceExecutionFlow: input.advanceExecutionFlow,
      enterRuntimeWaitingInput: input.enterRuntimeWaitingInput,
      enterPendingApprovalFromRuntimeStep: input.enterPendingApprovalFromRuntimeStep,
      failExecutionFromRuntimeStep: input.failExecutionFromRuntimeStep,
      syncPhaseAfterStepResult: (
        executionId: string,
        runtimeSessionId: string,
        result: RuntimeStepInvokeResult,
        phaseMetadata?: ExecutionStepPhaseMetadata,
        step?: Record<string, unknown> | null
      ) =>
        this.executionPhaseSyncService.syncPhaseAfterStepResult(
          executionId,
          runtimeSessionId,
          result,
          phaseMetadata,
          step
        ),
      takeover: (executionId: string, reason: string) =>
        input.takeover(executionId, reason).then(() => undefined),
      failureHooks,
    };
  }

  createStepExecutorHooks(input: CreateStepExecutorHooksInput): ExecutionStepExecutorHooks {
    const failureHooks = this.createFailureHooks(input.failureHooks);

    return {
      extractStepPhaseMetadata: (step?: Record<string, unknown> | null) =>
        this.executionBrowserOrchestrationService.extractStepPhaseMetadata(step),
      markPhaseRunningForStep: (
        executionId: string,
        runtimeSessionId: string,
        phaseMetadata?: ExecutionStepPhaseMetadata,
        step?: Record<string, unknown> | null
      ) =>
        this.executionPhaseSyncService.markPhaseRunningForStep(
          executionId,
          runtimeSessionId,
          phaseMetadata,
          step
        ),
      emitEvent: input.emitEvent,
      handleBrowserStepResult: input.handleBrowserStepResult,
      extractStepBrowserPhaseConfig: (step?: Record<string, unknown> | null) =>
        this.executionBrowserOrchestrationService.extractStepBrowserPhaseConfig(step),
      skipSingleStep: (stepId: string, executionId: string, reason: string) =>
        this.executionFailureService.skipSingleStep(stepId, executionId, reason, failureHooks),
      advanceExecutionFlow: input.advanceExecutionFlow,
      buildBrowserPhasePolicyContext: (execution: Record<string, unknown>) =>
        this.executionBrowserOrchestrationService.buildBrowserPhasePolicyContext(execution),
      buildBrowserPhaseTraceContext: (execution: Record<string, unknown>) =>
        this.executionBrowserOrchestrationService.buildBrowserPhaseTraceContext(execution),
      extractBrowserPhaseInput: (step?: Record<string, unknown> | null) =>
        this.executionBrowserOrchestrationService.extractBrowserPhaseInput(step),
      handleBrowserPhaseStepResult: input.handleBrowserPhaseStepResult,
      initializeWorkflowActivityPhasesForSkillExecution: (
        executionId: string,
        runtimeSessionId: string,
        capabilityId: string,
        phaseMetadata?: ExecutionStepPhaseMetadata,
        step?: Record<string, unknown> | null
      ) =>
        this.executionPhaseSyncService.initializeWorkflowActivityPhasesForSkillExecution(
          executionId,
          runtimeSessionId,
          capabilityId,
          phaseMetadata,
          step
        ),
      handleSystemSkillStepResult: input.handleSystemSkillStepResult,
    };
  }
}
