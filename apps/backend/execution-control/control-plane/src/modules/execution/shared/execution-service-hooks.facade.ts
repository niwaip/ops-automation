import { CreateExecutionEventOptions } from '../state/execution-event.service';
import { ExecutionDto } from '../state/execution.dto';
import { ExecutionFailureService } from '../recovery/execution-failure.service';
import { ExecutionApplicationHooksService } from './execution-application-hooks.service';
import { ExecutionBrowserOrchestrationService } from '../step-runner/browser/execution-browser-orchestration.service';
import {
  ExecutionStepPhaseMetadata,
} from '../step-runner/browser/execution-browser-orchestration.service';
import { ExecutionBrowserReadService } from '../step-runner/browser/execution-browser-read.service';
import { ExecutionFlowRunnerService } from '../step-runner/flow/execution-flow-runner.service';
import { ExecutionStepExecutorService } from '../step-runner/flow/execution-step-executor.service';
import { ExecutionRuntimeControlService } from '../step-runner/runtime/execution-runtime-control.service';
import { ExecutionRuntimeHooksService } from '../step-runner/runtime/execution-runtime-hooks.service';
import { ExecutionSystemSkillResultService } from '../step-runner/runtime/execution-system-skill-result.service';
import { ExecutionPhaseSyncService } from '../state/execution-phase-sync.service';
import { ExecutionRuntimeSessionService } from '../adapters/execution-runtime-session.service';
import { RuntimePhaseInvokeResult, RuntimeStepInvokeResult } from '../adapters/runtime-adapter.interface';
import { EXECUTION_EVENT_TYPE } from '../contracts/execution-event-type';

type ExecutionEventType =
  (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE];

type WorkflowActivityPhaseDefinitionsLoader = (
  capabilityId: string,
  parentPhaseKey: string
) => Promise<unknown>;

interface ExecutionServiceHooksFacadeDeps {
  executionApplicationHooksService: ExecutionApplicationHooksService;
  executionBrowserOrchestrationService: ExecutionBrowserOrchestrationService;
  executionBrowserReadService: ExecutionBrowserReadService;
  executionFailureService: ExecutionFailureService;
  executionFlowRunnerService: ExecutionFlowRunnerService;
  executionRuntimeControlService: ExecutionRuntimeControlService;
  executionRuntimeHooksService: ExecutionRuntimeHooksService;
  executionRuntimeSessionService: ExecutionRuntimeSessionService;
  executionStepExecutorService: ExecutionStepExecutorService;
  executionSystemSkillResultService: ExecutionSystemSkillResultService;
  executionPhaseSyncService: ExecutionPhaseSyncService;
}

interface ExecutionServiceHooksFacadeCallbacks {
  getExecutionDto: (id: string, requester?: { id: string; role?: string }) => Promise<ExecutionDto>;
  getExecutionDtoById: (id: string) => Promise<ExecutionDto>;
  emitEvent: (
    executionId: string,
    eventType: ExecutionEventType,
    payload: unknown,
    options?: CreateExecutionEventOptions
  ) => Promise<void>;
  updateStatus: (id: string, newStatus: string) => Promise<void>;
  startExecution: (executionId: string) => Promise<void>;
  advanceExecutionFlow: (executionId: string, runtimeSessionId: string) => Promise<void>;
  failExecutionFromRuntimeStep: (
    input: {
      executionId: string;
      stepId: string;
      failureReason: string;
      failureCode: string;
      runtimeSessionId?: string;
    },
    failureHooks: Parameters<ExecutionRuntimeControlService['failExecutionFromRuntimeStep']>[1]
  ) => Promise<void>;
  requestSystemTakeover: (
    executionId: string,
    reason: string,
    humanControlHooks: Parameters<ExecutionRuntimeControlService['requestSystemTakeover']>[2]
  ) => Promise<void>;
  enterRuntimeWaitingInput: (
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    requiredInputs: unknown[],
    reason: string | undefined,
    failureHooks: Parameters<ExecutionRuntimeControlService['enterRuntimeWaitingInput']>[5]
  ) => Promise<void>;
  enterPendingApprovalFromRuntimeStep: (
    executionId: string,
    reason: string,
    failureHooks: Parameters<ExecutionRuntimeControlService['enterPendingApprovalFromRuntimeStep']>[2]
  ) => Promise<void>;
  handleBrowserStepResult: (
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    result: RuntimeStepInvokeResult,
    browserOrchestrationHooks: ReturnType<
      ExecutionRuntimeHooksService['createBrowserOrchestrationHooks']
    >,
    phaseMetadata?: ExecutionStepPhaseMetadata,
    step?: Record<string, unknown> | null
  ) => Promise<void>;
  handleBrowserPhaseStepResult: (
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    result: RuntimePhaseInvokeResult,
    browserOrchestrationHooks: ReturnType<
      ExecutionRuntimeHooksService['createBrowserOrchestrationHooks']
    >
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
  enterWaitingInput: (
    execution: Record<string, unknown>,
    stepId: string,
    failureHooks: Parameters<ExecutionFailureService['enterWaitingInput']>[2]
  ) => Promise<void>;
  getWorkflowActivityPhaseDefinitionsLoader: () => WorkflowActivityPhaseDefinitionsLoader | undefined;
}

export class ExecutionServiceHooksFacade {
  constructor(
    private readonly deps: ExecutionServiceHooksFacadeDeps,
    private readonly callbacks: ExecutionServiceHooksFacadeCallbacks
  ) {}

  getLifecycleHooks(): ReturnType<ExecutionApplicationHooksService['createLifecycleHooks']> {
    return this.deps.executionApplicationHooksService.createLifecycleHooks({
      getExecutionDto: this.callbacks.getExecutionDto,
      updateStatus: this.callbacks.updateStatus,
      emitEvent: this.callbacks.emitEvent,
    });
  }

  getCreateHooks(): ReturnType<ExecutionApplicationHooksService['createCreateHooks']> {
    const failureHooks = this.getFailureHooks();

    return this.deps.executionApplicationHooksService.createCreateHooks({
      getExecutionDto: this.callbacks.getExecutionDtoById,
      emitEvent: this.callbacks.emitEvent,
      enterWaitingInput: (execution: Record<string, unknown>, stepId: string) =>
        this.callbacks.enterWaitingInput(execution, stepId, failureHooks),
      startExecution: this.callbacks.startExecution,
    });
  }

  getSubmitInputHooks(): ReturnType<ExecutionApplicationHooksService['createSubmitInputHooks']> {
    return this.deps.executionApplicationHooksService.createSubmitInputHooks({
      getExecutionDto: this.callbacks.getExecutionDto,
      emitEvent: this.callbacks.emitEvent,
      updateStatus: this.callbacks.updateStatus,
      startExecution: this.callbacks.startExecution,
      advanceExecutionFlow: this.callbacks.advanceExecutionFlow,
    });
  }

  getStartHooks(): ReturnType<ExecutionApplicationHooksService['createStartHooks']> {
    return this.deps.executionApplicationHooksService.createStartHooks({
      updateStatus: this.callbacks.updateStatus,
      emitEvent: this.callbacks.emitEvent,
      advanceExecutionFlow: this.callbacks.advanceExecutionFlow,
      bootstrapBrowserExecution: (execution: Record<string, unknown>, runtimeSessionId: string) =>
        this.deps.executionBrowserOrchestrationService.bootstrapBrowserExecution(
          execution,
          runtimeSessionId,
          this.getBrowserOrchestrationHooks()
        ),
    });
  }

  getHumanControlHooks(): ReturnType<ExecutionRuntimeHooksService['createHumanControlHooks']> {
    return this.deps.executionRuntimeHooksService.createHumanControlHooks({
      getExecutionDto: this.callbacks.getExecutionDto,
      emitEvent: this.callbacks.emitEvent,
      updateStatus: this.callbacks.updateStatus,
      freezeRuntimeSessionQuietly: (
        runtimeSessionId: string | null | undefined,
        executionId: string,
        reason: string
      ) => this.deps.executionRuntimeSessionService.freezeQuietly(runtimeSessionId, executionId, reason),
      resumeRuntimeSessionQuietly: (
        runtimeSessionId: string | null | undefined,
        executionId: string,
        stepId?: string
      ) => this.deps.executionRuntimeSessionService.resumeQuietly(runtimeSessionId, executionId, stepId),
      advanceExecutionFlow: this.callbacks.advanceExecutionFlow,
    });
  }

  getApprovalHooks(): ReturnType<ExecutionApplicationHooksService['createApprovalHooks']> {
    return this.deps.executionApplicationHooksService.createApprovalHooks({
      getExecutionDto: this.callbacks.getExecutionDto,
      emitEvent: this.callbacks.emitEvent,
      updateStatus: this.callbacks.updateStatus,
      startExecution: this.callbacks.startExecution,
    });
  }

  getFailureHooks(): ReturnType<ExecutionRuntimeHooksService['createFailureHooks']> {
    return this.deps.executionRuntimeHooksService.createFailureHooks({
      emitEvent: this.callbacks.emitEvent,
      updateStatus: this.callbacks.updateStatus,
      closeRuntimeSessionQuietly: (runtimeSessionId: string, executionId: string, reason: string) =>
        this.deps.executionRuntimeSessionService.closeQuietly(runtimeSessionId, executionId, reason),
    });
  }

  getBrowserOrchestrationHooks(): ReturnType<
    ExecutionRuntimeHooksService['createBrowserOrchestrationHooks']
  > {
    const failureHooks = this.getFailureHooks();
    const humanControlHooks = this.getHumanControlHooks();

    return this.deps.executionRuntimeHooksService.createBrowserOrchestrationHooks({
      emitEvent: this.callbacks.emitEvent,
      advanceExecutionFlow: this.callbacks.advanceExecutionFlow,
      enterRuntimeWaitingInput: (executionId, runtimeSessionId, stepId, requiredInputs, reason) =>
        this.callbacks.enterRuntimeWaitingInput(
          executionId,
          runtimeSessionId,
          stepId,
          requiredInputs,
          reason,
          failureHooks
        ),
      enterPendingApprovalFromRuntimeStep: (executionId: string, reason: string) =>
        this.callbacks.enterPendingApprovalFromRuntimeStep(executionId, reason, failureHooks),
      failExecutionFromRuntimeStep: (input) =>
        this.callbacks.failExecutionFromRuntimeStep(input, failureHooks),
      takeover: (executionId: string, reason: string) =>
        this.callbacks.requestSystemTakeover(executionId, reason, humanControlHooks).then(
          () => undefined
        ),
      failureHooks,
    });
  }

  getStepExecutorHooks(): ReturnType<ExecutionRuntimeHooksService['createStepExecutorHooks']> {
    const browserOrchestrationHooks = this.getBrowserOrchestrationHooks();
    const failureHooks = this.getFailureHooks();

    return this.deps.executionRuntimeHooksService.createStepExecutorHooks({
      emitEvent: this.callbacks.emitEvent,
      handleBrowserStepResult: (
        executionId: string,
        runtimeSessionId: string,
        stepId: string,
        result: RuntimeStepInvokeResult,
        phaseMetadata?: ExecutionStepPhaseMetadata,
        step?: Record<string, unknown> | null
      ) =>
        this.callbacks.handleBrowserStepResult(
          executionId,
          runtimeSessionId,
          stepId,
          result,
          browserOrchestrationHooks,
          phaseMetadata,
          step
        ),
      advanceExecutionFlow: this.callbacks.advanceExecutionFlow,
      handleBrowserPhaseStepResult: (
        executionId: string,
        runtimeSessionId: string,
        stepId: string,
        result: RuntimePhaseInvokeResult
      ) =>
        this.callbacks.handleBrowserPhaseStepResult(
          executionId,
          runtimeSessionId,
          stepId,
          result,
          browserOrchestrationHooks
        ),
      handleSystemSkillStepResult: (
        executionId: string,
        runtimeSessionId: string,
        stepId: string,
        result: RuntimeStepInvokeResult,
        capabilityId: string,
        phaseMetadata?: ExecutionStepPhaseMetadata,
        step?: Record<string, unknown> | null
      ) =>
        this.callbacks.handleSystemSkillStepResult(
          executionId,
          runtimeSessionId,
          stepId,
          result,
          capabilityId,
          phaseMetadata,
          step
        ),
      failureHooks,
    });
  }

  async advanceExecutionFlow(executionId: string, runtimeSessionId: string): Promise<void> {
    const failureHooks = this.getFailureHooks();
    const hooks = this.deps.executionRuntimeHooksService.createFlowRunnerHooks({
      completeActivePhasesOnExecutionSuccess: (
        targetExecutionId,
        targetRuntimeSessionId
      ) =>
        this.deps.executionPhaseSyncService.completeActivePhasesOnExecutionSuccess(
          targetExecutionId,
          targetRuntimeSessionId
        ),
      updateStatus: this.callbacks.updateStatus,
      closeRuntimeSessionQuietly: (targetRuntimeSessionId, targetExecutionId, reason) =>
        this.deps.executionRuntimeSessionService.closeQuietly(
          targetRuntimeSessionId,
          targetExecutionId,
          reason
        ),
      extractStepUrl: (step, execution) =>
        this.deps.executionBrowserOrchestrationService.extractStepUrl(step, execution),
      skipSingleStep: (stepId, targetExecutionId, reason, targetFailureHooks) =>
        this.deps.executionFailureService.skipSingleStep(
          stepId,
          targetExecutionId,
          reason,
          targetFailureHooks
        ),
      failExecutionFromRuntimeStep: (failure, targetFailureHooks) =>
        this.deps.executionFailureService.failExecutionFromRuntimeStep(failure, targetFailureHooks),
      executeBrowserGotoStep: (execution, targetRuntimeSessionId, stepId, url) =>
        this.deps.executionStepExecutorService.executeBrowserGotoStep(
          execution,
          targetRuntimeSessionId,
          stepId,
          url,
          this.getStepExecutorHooks()
        ),
      enterWaitingInput: (execution, stepId) =>
        this.callbacks.enterWaitingInput(execution, stepId, failureHooks),
      executeBrowserPhaseStep: (execution, targetRuntimeSessionId, stepId) =>
        this.deps.executionStepExecutorService.executeBrowserPhaseStep(
          execution,
          targetRuntimeSessionId,
          stepId,
          this.getStepExecutorHooks()
        ),
      executeSystemSkillStep: (execution, targetRuntimeSessionId, stepId) =>
        this.deps.executionStepExecutorService.executeSystemSkillStep(
          execution,
          targetRuntimeSessionId,
          stepId,
          this.getStepExecutorHooks()
        ),
      readBrowserTextBySelector: (targetRuntimeSessionId, selector) =>
        this.deps.executionBrowserReadService.readBrowserTextBySelector(
          targetRuntimeSessionId,
          selector
        ),
      failureHooks,
    });

    await this.deps.executionFlowRunnerService.advanceExecutionFlow(
      executionId,
      runtimeSessionId,
      hooks
    );
  }

  async handleSystemSkillStepResult(
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    result: RuntimeStepInvokeResult,
    capabilityId: string,
    phaseMetadata?: ExecutionStepPhaseMetadata,
    step?: Record<string, unknown> | null
  ): Promise<void> {
    const hooks = this.deps.executionRuntimeHooksService.createSystemSkillResultHooks({
      executionId,
      runtimeSessionId,
      stepId,
      emitEvent: this.callbacks.emitEvent,
      advanceExecutionFlow: this.callbacks.advanceExecutionFlow,
      failExecutionFromRuntimeStep: this.callbacks.failExecutionFromRuntimeStep,
      requestSystemTakeover: this.callbacks.requestSystemTakeover,
      enterRuntimeWaitingInput: this.callbacks.enterRuntimeWaitingInput,
      enterPendingApprovalFromRuntimeStep: this.callbacks.enterPendingApprovalFromRuntimeStep,
      failureHooks: this.getFailureHooks(),
      humanControlHooks: this.getHumanControlHooks(),
      loadWorkflowActivityPhaseDefinitions:
        this.callbacks.getWorkflowActivityPhaseDefinitionsLoader(),
    });

    await this.deps.executionSystemSkillResultService.handleSystemSkillStepResult(
      {
        executionId,
        runtimeSessionId,
        stepId,
        result,
        capabilityId,
        phaseMetadata,
        step,
      },
      hooks
    );
  }
}
