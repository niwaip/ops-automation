import {
  Injectable,
  Inject,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../prisma/client';
import { ExecutionStatus } from './contracts/execution-status';
import { EXECUTION_EVENT_TYPE } from './contracts/execution-event-type';
import { ExecutionCreateService } from './creation/execution-create.service';
import {
  CreateExecutionEventOptions,
  ExecutionEventService,
  ExecutionStreamEventPayload,
} from './state/execution-event.service';
import { ExecutionFailureService } from './recovery/execution-failure.service';
import { ExecutionFlowRunnerService } from './step-runner/flow/execution-flow-runner.service';
import { ExecutionPhaseService } from './state/execution-phase.service';
import { ExecutionPhaseSyncService } from './state/execution-phase-sync.service';
import { WorkflowActivityProgressService } from './state/workflow-activity-progress.service';
import {
  ExecutionLifecycleService,
  RequestUserContext,
} from './lifecycle/execution-lifecycle.service';
import { ExecutionStreamService } from './lifecycle/execution-stream.service';
import { ExecutionStateService } from './state/execution-state.service';
import { ExecutionQueryService } from './query/execution-query.service';
import { ExecutionApplicationHooksService } from './shared/execution-application-hooks.service';
import { resolveExecutionServiceDependencies } from './shared/execution-service-dependencies';
import { ExecutionServiceHooksFacade } from './shared/execution-service-hooks.facade';
import { ExecutionBrowserReadService } from './step-runner/browser/execution-browser-read.service';
import { ExecutionStepExecutorService } from './step-runner/flow/execution-step-executor.service';
import { ExecutionRuntimeHooksService } from './step-runner/runtime/execution-runtime-hooks.service';
import { ExecutionRuntimeControlService } from './step-runner/runtime/execution-runtime-control.service';
import { ExecutionSystemSkillResultService } from './step-runner/runtime/execution-system-skill-result.service';
import { ExecutionStepService } from './step-runner/steps/execution-step.service';
import { ExecutionApprovalService } from './human-control/execution-approval.service';
import { ExecutionHumanControlService } from './human-control/execution-human-control.service';
import {
  ExecutionInputResolutionService,
} from './human-control/execution-input-resolution.service';
import { ExecutionSubmitInputService } from './human-control/execution-submit-input.service';
import { ExecutionPlanNormalizationService } from './step-runner/planning/execution-plan-normalization.service';
import { ExecutionStartService } from './step-runner/flow/execution-start.service';
import {
  CreateExecutionDto,
  ExecutionDto,
  ExecutionStepDto,
  TakeoverExecutionDto,
  ResumeExecutionDto,
  ReleaseHumanControlDto,
  ReconcilePhaseTakeoverDto,
  ListExecutionsDto,
  SubmitInputDto,
  ApprovalDecisionDto,
  UpdateWorkflowActivityProgressDto,
} from './state/execution.dto';
import { ExecutionPlanningService } from './step-runner/planning/execution-planning.service';
import { ExecutionRuntimeSessionService } from './adapters/execution-runtime-session.service';
import { RuntimePhaseInvokeResult, RuntimeStepInvokeResult } from './adapters/runtime-adapter.interface';
import { RuntimeExecutionOrchestrator } from './step-runner/runtime/runtime-execution.orchestrator';
import { RuntimeResultInterpreter } from './step-runner/runtime/runtime-result.interpreter';
import { RuntimeStepRequestFactory } from './step-runner/runtime/runtime-step-request.factory';
import { BrowserPhaseExecutor } from './step-runner/browser/browser-phase.executor';
import { BrowserRuntimeAdapter } from './adapters/browser-runtime.adapter';
import {
  ExecutionBrowserOrchestrationService,
  ExecutionStepPhaseMetadata,
} from './step-runner/browser/execution-browser-orchestration.service';

type ExecutionEventType =
  (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE];
type WorkflowActivityPhaseDefinitionsLoader = (
  capabilityId: string,
  parentPhaseKey: string
) => Promise<unknown>;

@Injectable()
export class ExecutionService {
  private readonly executionFailureService: ExecutionFailureService;
  private readonly executionFlowRunnerService: ExecutionFlowRunnerService;
  private readonly executionPhaseSyncService: ExecutionPhaseSyncService;
  private readonly executionStateService: ExecutionStateService;
  private readonly executionLifecycleService: ExecutionLifecycleService;
  private readonly executionStreamService: ExecutionStreamService;
  private readonly executionQueryService: ExecutionQueryService;
  private readonly executionApplicationHooksService: ExecutionApplicationHooksService;
  private readonly executionApprovalService: ExecutionApprovalService;
  private readonly executionHumanControlService: ExecutionHumanControlService;
  private readonly executionCreateService: ExecutionCreateService;
  private readonly executionSubmitInputService: ExecutionSubmitInputService;
  private readonly executionStartService: ExecutionStartService;
  private readonly executionPlanningService: ExecutionPlanningService;
  private readonly executionBrowserOrchestrationService: ExecutionBrowserOrchestrationService;
  private readonly executionRuntimeSessionService: ExecutionRuntimeSessionService;
  private readonly executionStepExecutorService: ExecutionStepExecutorService;
  private readonly executionRuntimeHooksService: ExecutionRuntimeHooksService;
  private readonly executionRuntimeControlService: ExecutionRuntimeControlService;
  private readonly executionSystemSkillResultService: ExecutionSystemSkillResultService;
  private readonly workflowActivityProgressService: WorkflowActivityProgressService;
  private readonly executionBrowserReadService: ExecutionBrowserReadService;
  private readonly executionServiceHooksFacade: ExecutionServiceHooksFacade;

  constructor(
    prisma: PrismaService,
    @Optional()
    @Inject(RuntimeExecutionOrchestrator)
    runtimeExecutionOrchestrator?: RuntimeExecutionOrchestrator | ExecutionEventService,
    @Optional()
    @Inject(RuntimeResultInterpreter)
    runtimeResultInterpreter?: RuntimeResultInterpreter,
    @Optional()
    @Inject(RuntimeStepRequestFactory)
    runtimeStepRequestFactory?: RuntimeStepRequestFactory,
    executionEventService?: ExecutionEventService,
    executionFailureService?: ExecutionFailureService,
    executionPhaseService?: ExecutionPhaseService,
    executionPhaseSyncService?: ExecutionPhaseSyncService,
    executionStateService?: ExecutionStateService,
    executionStepService?: ExecutionStepService,
    executionCreateService?: ExecutionCreateService,
    executionInputResolutionService?: ExecutionInputResolutionService,
    executionSubmitInputService?: ExecutionSubmitInputService,
    executionStartService?: ExecutionStartService,
    executionPlanNormalizationService?: ExecutionPlanNormalizationService,
    browserPhaseExecutor?: BrowserPhaseExecutor,
    executionHumanControlService?: ExecutionHumanControlService,
    executionApprovalService?: ExecutionApprovalService,
    executionPlanningService?: ExecutionPlanningService,
    executionRuntimeSessionService?: ExecutionRuntimeSessionService,
    executionFlowRunnerService?: ExecutionFlowRunnerService,
    executionStepExecutorService?: ExecutionStepExecutorService,
    executionApplicationHooksService?: ExecutionApplicationHooksService,
    executionRuntimeHooksService?: ExecutionRuntimeHooksService,
    executionRuntimeControlService?: ExecutionRuntimeControlService,
    executionSystemSkillResultService?: ExecutionSystemSkillResultService,
    executionBrowserOrchestrationService?: ExecutionBrowserOrchestrationService,
    browserRuntimeAdapter?: BrowserRuntimeAdapter,
    workflowActivityProgressService?: WorkflowActivityProgressService,
    executionQueryService?: ExecutionQueryService,
    executionLifecycleService?: ExecutionLifecycleService,
    executionBrowserReadService?: ExecutionBrowserReadService,
    executionStreamService?: ExecutionStreamService
  ) {
    const resolved = resolveExecutionServiceDependencies({
      prisma,
      runtimeExecutionOrchestrator,
      runtimeResultInterpreter,
      runtimeStepRequestFactory,
      executionEventService,
      executionFailureService,
      executionPhaseService,
      executionPhaseSyncService,
      executionStateService,
      executionStepService,
      executionCreateService,
      executionInputResolutionService,
      executionSubmitInputService,
      executionStartService,
      executionPlanNormalizationService,
      browserPhaseExecutor,
      executionHumanControlService,
      executionApprovalService,
      executionPlanningService,
      executionRuntimeSessionService,
      executionFlowRunnerService,
      executionStepExecutorService,
      executionApplicationHooksService,
      executionRuntimeHooksService,
      executionRuntimeControlService,
      executionSystemSkillResultService,
      executionBrowserOrchestrationService,
      browserRuntimeAdapter,
      workflowActivityProgressService,
      executionQueryService,
      executionLifecycleService,
      executionBrowserReadService,
      executionStreamService,
    });

    this.executionFailureService = resolved.executionFailureService;
    this.executionFlowRunnerService = resolved.executionFlowRunnerService;
    this.executionPhaseSyncService = resolved.executionPhaseSyncService;
    this.executionStateService = resolved.executionStateService;
    this.executionLifecycleService = resolved.executionLifecycleService;
    this.executionStreamService = resolved.executionStreamService;
    this.executionQueryService = resolved.executionQueryService;
    this.executionApplicationHooksService = resolved.executionApplicationHooksService;
    this.executionApprovalService = resolved.executionApprovalService;
    this.executionHumanControlService = resolved.executionHumanControlService;
    this.executionCreateService = resolved.executionCreateService;
    this.executionSubmitInputService = resolved.executionSubmitInputService;
    this.executionStartService = resolved.executionStartService;
    this.executionPlanningService = resolved.executionPlanningService;
    void this.executionPlanningService;
    void this.getFailureHooks;
    void this.getStepExecutorHooks;
    this.executionBrowserOrchestrationService = resolved.executionBrowserOrchestrationService;
    this.executionRuntimeSessionService = resolved.executionRuntimeSessionService;
    this.executionStepExecutorService = resolved.executionStepExecutorService;
    this.executionRuntimeHooksService = resolved.executionRuntimeHooksService;
    this.executionRuntimeControlService = resolved.executionRuntimeControlService;
    this.executionSystemSkillResultService = resolved.executionSystemSkillResultService;
    this.workflowActivityProgressService = resolved.workflowActivityProgressService;
    this.executionBrowserReadService = resolved.executionBrowserReadService;
    this.executionServiceHooksFacade = new ExecutionServiceHooksFacade(
      {
        executionApplicationHooksService: this.executionApplicationHooksService,
        executionBrowserOrchestrationService: this.executionBrowserOrchestrationService,
        executionBrowserReadService: this.executionBrowserReadService,
        executionFailureService: this.executionFailureService,
        executionFlowRunnerService: this.executionFlowRunnerService,
        executionRuntimeControlService: this.executionRuntimeControlService,
        executionRuntimeHooksService: this.executionRuntimeHooksService,
        executionRuntimeSessionService: this.executionRuntimeSessionService,
        executionStepExecutorService: this.executionStepExecutorService,
        executionSystemSkillResultService: this.executionSystemSkillResultService,
        executionPhaseSyncService: this.executionPhaseSyncService,
      },
      {
        getExecutionDto: this.getExecutionDtoCallback(),
        getExecutionDtoById: this.getExecutionDtoByIdCallback(),
        emitEvent: this.getEmitEventCallback(),
        updateStatus: this.getUpdateStatusCallback(),
        startExecution: this.getStartExecutionCallback(),
        advanceExecutionFlow: this.getAdvanceExecutionFlowCallback(),
        failExecutionFromRuntimeStep: this.getFailExecutionFromRuntimeStepCallback(),
        requestSystemTakeover: this.getRequestSystemTakeoverCallback(),
        enterRuntimeWaitingInput: this.getEnterRuntimeWaitingInputCallback(),
        enterPendingApprovalFromRuntimeStep:
          this.getEnterPendingApprovalFromRuntimeStepCallback(),
        handleBrowserStepResult: this.getHandleBrowserStepResultCallback(),
        handleBrowserPhaseStepResult: this.getHandleBrowserPhaseStepResultCallback(),
        handleSystemSkillStepResult: this.getHandleSystemSkillStepResultCallback(),
        enterWaitingInput: this.getEnterWaitingInputCallback(),
        getWorkflowActivityPhaseDefinitionsLoader: () =>
          this.getWorkflowActivityPhaseDefinitionsLoader(),
      }
    );
  }

  subscribeToEvents(executionId: string, callback: (event: ExecutionStreamEventPayload) => void) {
    return this.executionStreamService.subscribeToEvents(executionId, callback);
  }

  async create(
    userId: string,
    dto: CreateExecutionDto,
    options?: { authToken?: string }
  ): Promise<ExecutionDto> {
    return this.executionCreateService.create(userId, dto, this.getCreateHooks(), options);
  }

  async getById(id: string, requester?: RequestUserContext): Promise<ExecutionDto> {
    return this.executionQueryService.getById(id, requester);
  }

  async getSteps(id: string, requester?: RequestUserContext): Promise<ExecutionStepDto[]> {
    return this.executionQueryService.getSteps(id, requester);
  }

  async getPhases(id: string, requester?: RequestUserContext) {
    return this.executionQueryService.getPhases(id, requester);
  }

  async updateWorkflowActivityProgress(
    executionId: string,
    dto: UpdateWorkflowActivityProgressDto,
    requester?: RequestUserContext
  ): Promise<void> {
    await this.workflowActivityProgressService.updateWorkflowActivityProgress(
      executionId,
      dto,
      requester
    );
  }

  async takeover(
    id: string,
    userId: string,
    dto: TakeoverExecutionDto,
    requester?: RequestUserContext
  ): Promise<ExecutionDto> {
    return this.executionHumanControlService.takeover(
      id,
      userId,
      dto,
      this.getHumanControlHooks(),
      requester
    );
  }

  async resume(
    id: string,
    userId: string,
    dto: ResumeExecutionDto,
    requester?: RequestUserContext
  ): Promise<ExecutionDto> {
    return this.executionHumanControlService.resume(
      id,
      userId,
      dto,
      this.getHumanControlHooks(),
      requester
    );
  }

  async releaseHumanControl(
    id: string,
    userId: string,
    dto: ReleaseHumanControlDto,
    requester?: RequestUserContext
  ): Promise<ExecutionDto> {
    return this.resume(id, userId, dto, requester);
  }

  async takeoverPhase(
    executionId: string,
    phaseKey: string,
    userId: string,
    dto: TakeoverExecutionDto,
    requester?: RequestUserContext
  ): Promise<ExecutionDto> {
    return this.executionHumanControlService.takeoverPhase(
      executionId,
      phaseKey,
      userId,
      dto,
      this.getHumanControlHooks(),
      requester
    );
  }

  async reconcilePhaseTakeover(
    executionId: string,
    phaseKey: string,
    userId: string,
    dto: ReconcilePhaseTakeoverDto,
    requester?: RequestUserContext
  ): Promise<ExecutionDto> {
    return this.executionHumanControlService.reconcilePhaseTakeover(
      executionId,
      phaseKey,
      userId,
      dto,
      this.getHumanControlHooks(),
      requester
    );
  }

  async resumePhaseTakeover(
    executionId: string,
    phaseKey: string,
    userId: string,
    dto: ResumeExecutionDto,
    requester?: RequestUserContext
  ): Promise<ExecutionDto> {
    return this.executionHumanControlService.resumePhaseTakeover(
      executionId,
      phaseKey,
      userId,
      dto,
      this.getHumanControlHooks(),
      requester
    );
  }

  async approve(
    id: string,
    userId: string,
    dto: ApprovalDecisionDto,
    requester?: RequestUserContext
  ): Promise<ExecutionDto> {
    return this.executionApprovalService.approve(
      id,
      userId,
      dto,
      this.getApprovalHooks(),
      requester
    );
  }

  async reject(
    id: string,
    userId: string,
    dto: ApprovalDecisionDto,
    requester?: RequestUserContext
  ): Promise<ExecutionDto> {
    return this.executionApprovalService.reject(
      id,
      userId,
      dto,
      this.getApprovalHooks(),
      requester
    );
  }

  async submitInputAndResume(
    id: string,
    userId: string,
    dto: SubmitInputDto,
    requester?: RequestUserContext
  ): Promise<ExecutionDto> {
    return this.executionSubmitInputService.submitInputAndResume(
      id,
      userId,
      dto,
      this.getSubmitInputHooks(),
      requester
    );
  }

  async cancel(id: string, userId: string, requester?: RequestUserContext): Promise<ExecutionDto> {
    return this.executionLifecycleService.cancel(id, userId, this.getLifecycleHooks(), requester);
  }

  async list(
    dto: ListExecutionsDto,
    requester?: RequestUserContext
  ): Promise<{ data: ExecutionDto[]; total: number; page: number; pageSize: number }> {
    return this.executionQueryService.list(dto, requester);
  }

  private async updateStatus(id: string, newStatus: ExecutionStatus): Promise<void> {
    const event = await this.executionStateService.updateStatus(id, newStatus);
    this.executionStreamService.publishEvent(event);
  }

  private getExecutionDtoCallback() {
    return (id: string, requester?: RequestUserContext) => this.getById(id, requester);
  }

  private getExecutionDtoByIdCallback() {
    return (id: string) => this.getById(id);
  }

  private getEmitEventCallback() {
    return (
      executionId: string,
      eventType: ExecutionEventType,
      payload: unknown,
      options: CreateExecutionEventOptions = {}
    ) =>
      this.executionStreamService.createEvent(
        executionId,
        eventType,
        this.asJsonValue(payload),
        options
      );
  }

  private getUpdateStatusCallback() {
    return (id: string, newStatus: ExecutionStatus) => this.updateStatus(id, newStatus);
  }

  private getStartExecutionCallback() {
    return (executionId: string) =>
      this.executionStartService.startExecution(executionId, this.getStartHooks());
  }

  private getAdvanceExecutionFlowCallback() {
    return (executionId: string, runtimeSessionId: string) =>
      this.advanceExecutionFlow(executionId, runtimeSessionId);
  }

  private getFailExecutionFromRuntimeStepCallback() {
    return (
      input: {
        executionId: string;
        stepId: string;
        failureReason: string;
        failureCode: string;
        runtimeSessionId?: string;
      },
      failureHooks: Parameters<
        ExecutionRuntimeControlService['failExecutionFromRuntimeStep']
      >[1]
    ) => this.executionRuntimeControlService.failExecutionFromRuntimeStep(input, failureHooks);
  }

  private getRequestSystemTakeoverCallback() {
    return (
      executionId: string,
      reason: string,
      humanControlHooks: Parameters<
        ExecutionRuntimeControlService['requestSystemTakeover']
      >[2]
    ) => this.executionRuntimeControlService.requestSystemTakeover(executionId, reason, humanControlHooks);
  }

  private getEnterRuntimeWaitingInputCallback() {
    return (
      executionId: string,
      runtimeSessionId: string,
      stepId: string,
      requiredInputs: unknown[],
      reason: string | undefined,
      failureHooks: Parameters<
        ExecutionRuntimeControlService['enterRuntimeWaitingInput']
      >[5]
    ) =>
      this.executionRuntimeControlService.enterRuntimeWaitingInput(
        executionId,
        runtimeSessionId,
        stepId,
        requiredInputs,
        reason,
        failureHooks
      );
  }

  private getEnterPendingApprovalFromRuntimeStepCallback() {
    return (
      executionId: string,
      reason: string,
      failureHooks: Parameters<
        ExecutionRuntimeControlService['enterPendingApprovalFromRuntimeStep']
      >[2]
    ) =>
      this.executionRuntimeControlService.enterPendingApprovalFromRuntimeStep(
        executionId,
        reason,
        failureHooks
      );
  }

  private getHandleBrowserStepResultCallback() {
    return (
      executionId: string,
      runtimeSessionId: string,
      stepId: string,
      result: RuntimeStepInvokeResult,
      browserOrchestrationHooks: ReturnType<typeof this.getBrowserOrchestrationHooks>,
      phaseMetadata?: ExecutionStepPhaseMetadata,
      step?: Record<string, unknown> | null
    ) =>
      this.executionBrowserOrchestrationService.handleBrowserStepResult(
        executionId,
        runtimeSessionId,
        stepId,
        result,
        browserOrchestrationHooks,
        phaseMetadata,
        step
      );
  }

  private getHandleBrowserPhaseStepResultCallback() {
    return (
      executionId: string,
      runtimeSessionId: string,
      stepId: string,
      result: RuntimePhaseInvokeResult,
      browserOrchestrationHooks: ReturnType<typeof this.getBrowserOrchestrationHooks>
    ) =>
      this.executionBrowserOrchestrationService.handleBrowserPhaseStepResult(
        executionId,
        runtimeSessionId,
        stepId,
        result,
        browserOrchestrationHooks
      );
  }

  private getHandleSystemSkillStepResultCallback() {
    return (
      executionId: string,
      runtimeSessionId: string,
      stepId: string,
      result: RuntimeStepInvokeResult,
      capabilityId: string,
      phaseMetadata?: ExecutionStepPhaseMetadata,
      step?: Record<string, unknown> | null
    ) =>
      this.handleSystemSkillStepResult(
        executionId,
        runtimeSessionId,
        stepId,
        result,
        capabilityId,
        phaseMetadata,
        step
      );
  }

  private getEnterWaitingInputCallback() {
    return (
      execution: Record<string, unknown>,
      stepId: string,
      failureHooks: Parameters<ExecutionFailureService['enterWaitingInput']>[2]
    ) => this.executionFailureService.enterWaitingInput(execution, stepId, failureHooks);
  }

  private getLifecycleHooks() {
    return this.executionServiceHooksFacade.getLifecycleHooks();
  }

  private getCreateHooks() {
    return this.executionServiceHooksFacade.getCreateHooks();
  }

  private getSubmitInputHooks() {
    return this.executionServiceHooksFacade.getSubmitInputHooks();
  }

  private getStartHooks() {
    return this.executionServiceHooksFacade.getStartHooks();
  }

  private getHumanControlHooks() {
    return this.executionServiceHooksFacade.getHumanControlHooks();
  }

  private getApprovalHooks() {
    return this.executionServiceHooksFacade.getApprovalHooks();
  }

  private getFailureHooks() {
    return this.executionServiceHooksFacade.getFailureHooks();
  }

  private getBrowserOrchestrationHooks() {
    return this.executionServiceHooksFacade.getBrowserOrchestrationHooks();
  }

  private getStepExecutorHooks() {
    return this.executionServiceHooksFacade.getStepExecutorHooks();
  }

  private asJsonValue(value: unknown): Prisma.JsonValue {
    return value as Prisma.JsonValue;
  }

  private async advanceExecutionFlow(executionId: string, runtimeSessionId: string): Promise<void> {
    await this.executionServiceHooksFacade.advanceExecutionFlow(executionId, runtimeSessionId);
  }

  private async handleSystemSkillStepResult(
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    result: RuntimeStepInvokeResult,
    capabilityId: string,
    phaseMetadata?: ExecutionStepPhaseMetadata,
    step?: Record<string, unknown> | null
  ): Promise<void> {
    await this.executionServiceHooksFacade.handleSystemSkillStepResult(
      executionId,
      runtimeSessionId,
      stepId,
      result,
      capabilityId,
      phaseMetadata,
      step
    );
  }

  private getWorkflowActivityPhaseDefinitionsLoader():
    | WorkflowActivityPhaseDefinitionsLoader
    | undefined {
    const currentLoader = (
      this as {
        loadWorkflowActivityPhaseDefinitions?: WorkflowActivityPhaseDefinitionsLoader;
      }
    ).loadWorkflowActivityPhaseDefinitions;

    if (typeof currentLoader !== 'function') {
      return undefined;
    }

    return (capabilityId: string, parentPhaseKey: string) =>
      currentLoader.call(this, capabilityId, parentPhaseKey);
  }

  async delete(
    id: string,
    userId: string,
    requester?: RequestUserContext
  ): Promise<{ success: boolean }> {
    return this.executionLifecycleService.delete(id, userId, requester);
  }

  async cleanupBeforeDate(
    beforeDate: string,
    userId: string,
    requester?: RequestUserContext
  ): Promise<{ success: boolean; deletedCount: number; beforeDate: string }> {
    return this.executionLifecycleService.cleanupBeforeDate(beforeDate, userId, requester);
  }
}
