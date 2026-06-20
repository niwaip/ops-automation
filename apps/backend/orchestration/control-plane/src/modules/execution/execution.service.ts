import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { Subject, filter } from 'rxjs';
import { APPROVAL_STATUS } from './contracts/approval-status';
import { EXECUTION_STATUS, ExecutionStatus } from './contracts/execution-status';
import { EXECUTION_EVENT_TYPE } from './contracts/execution-event-type';
import { EXECUTION_STEP_STATUS } from './contracts/execution-step-status';
import {
  CreateExecutionEventOptions,
  ExecutionEventService,
  ExecutionStreamEventPayload,
} from './execution-event.service';
import { ExecutionFailureService } from './execution-failure.service';
import { ExecutionFlowRunnerService } from './execution-flow-runner.service';
import { ExecutionPhaseService } from './execution-phase.service';
import { ExecutionPhaseSyncService } from './execution-phase-sync.service';
import {
  mapExecutionPhaseToDto,
  mapExecutionStepToDto,
  mapExecutionToDto,
} from './execution.mapper';
import { buildPlannedExecutionSteps } from './execution-plan-step.builder';
import { canTransitionExecutionStatus } from './execution-transition-policy';
import { ExecutionStateService } from './execution-state.service';
import { ExecutionStepExecutorService } from './execution-step-executor.service';
import { ExecutionStepService } from './execution-step.service';
import { ExecutionApprovalService } from './execution-approval.service';
import { ExecutionHumanControlService } from './execution-human-control.service';
import {
  ExecutionInputResolutionService,
  SubmitInputResolutionResult,
} from './execution-input-resolution.service';
import { ExecutionPlanNormalizationService } from './execution-plan-normalization.service';
import {
  CreateExecutionDto,
  ExecutionDto,
  ExecutionParamSource,
  ExecutionParamResolutionEntry,
  ExecutionRequiredInput,
  ExecutionStepDto,
  TakeoverExecutionDto,
  ResumeExecutionDto,
  ReleaseHumanControlDto,
  ReconcilePhaseTakeoverDto,
  ListExecutionsDto,
  SubmitInputDto,
  ApprovalDecisionDto,
  UpdateWorkflowActivityProgressDto,
} from './execution.dto';
import { ExecutionPlanningService } from './execution-planning.service';
import { ExecutionRuntimeSessionService } from './execution-runtime-session.service';
import { RuntimePhaseInvokeResult, RuntimeStepInvokeResult } from './runtime-adapter.interface';
import { RuntimeExecutionOrchestrator } from './runtime-execution.orchestrator';
import { RuntimeResultInterpreter } from './runtime-result.interpreter';
import { RuntimeStepRequestFactory } from './runtime-step-request.factory';
import { BrowserPhaseExecutor } from './browser-phase.executor';
import { BROWSER_RUNTIME } from './browser-execution-constants';
import {
  ExecutionBrowserOrchestrationService,
  ExecutionStepPhaseMetadata,
} from './execution-browser-orchestration.service';
import type { BrowserPhaseCheck } from './execution.dto';

interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
}

interface RequestUserContext {
  id: string;
  role?: string;
}

interface PlannerRequiredInput extends ExecutionRequiredInput {}

interface RuntimeDefaultResolution {
  input: Record<string, unknown>;
  sources: Record<string, ExecutionParamSource>;
}

interface PlannerSkillMatch {
  skill_id: string;
  skill_name: string;
  confidence: number;
  match_reason?: string;
}

interface PlannerSemanticGroupedMissing {
  key: string;
  label: string;
  kind: 'field' | 'array_group';
  blocking: boolean;
  required: boolean;
  fieldNames: string[];
  missingFieldNames: string[];
  description?: string;
}

interface PlannerSemantic {
  enabled: boolean;
  mode: 'field_level' | 'complex_document';
  previewReady: boolean;
  finalReady: boolean;
  fallbackToFieldLevel: boolean;
  summary?: string;
  groupedMissing: PlannerSemanticGroupedMissing[];
  complexity: {
    category: 'simple' | 'complex_document';
    totalFields: number;
    requiredFields: number;
    missingFields: number;
    arrayGroups: number;
    reasonCodes: string[];
  };
}

interface PlannerPlanDraft {
  plan_id: string;
  planner_mode: 'skill' | 'fallback';
  objective: string;
  summary: string;
  skill_match?: PlannerSkillMatch;
  steps: Array<{
    id: string;
    title: string;
    description: string;
    kind: 'skill' | 'tool' | 'human_input' | 'execution';
    tool_name?: string;
    status: 'planned';
    phase_key?: string;
    phase_name?: string;
    phase_type?: string;
    commands?: Array<{
      step_id?: string;
      capability_type?: string;
      action: string;
      input?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    }>;
    precheck?: BrowserPhaseCheck;
    postcheck?: BrowserPhaseCheck;
    recovery_policy?: {
      max_auto_retries?: number;
      allow_ai_recovery?: boolean;
      allow_human_takeover?: boolean;
      model_id?: string;
    };
  }>;
  required_inputs: PlannerRequiredInput[];
  risk_summary: {
    level: 'low' | 'medium' | 'high';
    requires_human_review: boolean;
    items: string[];
  };
  semantic?: PlannerSemantic;
  metadata?: Record<string, unknown>;
  usage?: LLMUsage;
}

interface SubmitInputContext {
  execution: any;
  effectiveRequester: RequestUserContext;
  normalized: Record<string, unknown>;
  requiredInputs: PlannerRequiredInput[];
  currentParamResolution: Record<string, ExecutionParamResolutionEntry>;
  missingInputs: PlannerRequiredInput[];
}

const hasMethod = (value: unknown, methodName: string): boolean =>
  Boolean(value) &&
  typeof value === 'object' &&
  typeof (value as Record<string, unknown>)[methodName] === 'function';

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  private readonly eventSubject = new Subject<ExecutionStreamEventPayload>();
  private readonly executionEventService: ExecutionEventService;
  private readonly executionFailureService: ExecutionFailureService;
  private readonly executionFlowRunnerService: ExecutionFlowRunnerService;
  private readonly executionPhaseService: ExecutionPhaseService;
  private readonly executionPhaseSyncService: ExecutionPhaseSyncService;
  private readonly executionStateService: ExecutionStateService;
  private readonly executionStepService: ExecutionStepService;
  private readonly executionApprovalService: ExecutionApprovalService;
  private readonly executionHumanControlService: ExecutionHumanControlService;
  private readonly executionInputResolutionService: ExecutionInputResolutionService;
  private readonly executionPlanningService: ExecutionPlanningService;
  private readonly executionPlanNormalizationService: ExecutionPlanNormalizationService;
  private readonly executionBrowserOrchestrationService: ExecutionBrowserOrchestrationService;
  private readonly executionRuntimeSessionService: ExecutionRuntimeSessionService;
  private readonly executionStepExecutorService: ExecutionStepExecutorService;

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(RuntimeExecutionOrchestrator)
    private readonly runtimeExecutionOrchestrator?:
      | RuntimeExecutionOrchestrator
      | ExecutionEventService,
    @Optional()
    @Inject(RuntimeResultInterpreter)
    private readonly runtimeResultInterpreter?: RuntimeResultInterpreter,
    @Optional()
    @Inject(RuntimeStepRequestFactory)
    private readonly runtimeStepRequestFactory?: RuntimeStepRequestFactory,
    executionEventService?: ExecutionEventService,
    executionFailureService?: ExecutionFailureService,
    executionPhaseService?: ExecutionPhaseService,
    executionPhaseSyncService?: ExecutionPhaseSyncService,
    executionStateService?: ExecutionStateService,
    executionStepService?: ExecutionStepService,
    executionInputResolutionService?: ExecutionInputResolutionService,
    executionPlanNormalizationService?: ExecutionPlanNormalizationService,
    browserPhaseExecutor?: BrowserPhaseExecutor,
    executionHumanControlService?: ExecutionHumanControlService,
    executionApprovalService?: ExecutionApprovalService,
    executionPlanningService?: ExecutionPlanningService,
    executionRuntimeSessionService?: ExecutionRuntimeSessionService,
    executionFlowRunnerService?: ExecutionFlowRunnerService,
    executionStepExecutorService?: ExecutionStepExecutorService,
    executionBrowserOrchestrationService?: ExecutionBrowserOrchestrationService
  ) {
    const dependencyCandidates = [
      runtimeExecutionOrchestrator,
      runtimeResultInterpreter,
      runtimeStepRequestFactory,
      executionEventService,
      executionFailureService,
      executionPhaseService,
      executionPhaseSyncService,
      executionStateService,
      executionStepService,
      executionInputResolutionService,
      executionPlanNormalizationService,
      browserPhaseExecutor,
      executionHumanControlService,
      executionApprovalService,
      executionPlanningService,
      executionRuntimeSessionService,
      executionFlowRunnerService,
      executionStepExecutorService,
      executionBrowserOrchestrationService,
    ];
    const pickDependency = <T>(
      explicit: T | undefined,
      predicate: (value: unknown) => boolean
    ): T | undefined => {
      if (predicate(explicit)) {
        return explicit;
      }
      return dependencyCandidates.find((candidate) => predicate(candidate)) as T | undefined;
    };

    const resolvedExecutionEventService = pickDependency<ExecutionEventService>(
      executionEventService,
      (value) => hasMethod(value, 'createEvent')
    );
    const resolvedExecutionFailureService = pickDependency<ExecutionFailureService>(
      executionFailureService,
      (value) => hasMethod(value, 'enterRuntimeWaitingInput') && hasMethod(value, 'skipSingleStep')
    );
    const resolvedExecutionPhaseService = pickDependency<ExecutionPhaseService>(
      executionPhaseService,
      (value) =>
        hasMethod(value, 'listByExecutionId') ||
        hasMethod(value, 'createOrUpdatePhase') ||
        hasMethod(value, 'markCompleted') ||
        hasMethod(value, 'markRunning') ||
        hasMethod(value, 'getByExecutionIdAndPhaseKey') ||
        hasMethod(value, 'markWaitingTakeover') ||
        hasMethod(value, 'createTakeoverRecord')
    );
    const resolvedExecutionPhaseSyncService = pickDependency<ExecutionPhaseSyncService>(
      executionPhaseSyncService,
      (value) =>
        hasMethod(value, 'syncPhaseAfterStepResult') &&
        hasMethod(value, 'completeActivePhasesOnExecutionSuccess')
    );
    const resolvedExecutionStateService = pickDependency<ExecutionStateService>(
      executionStateService,
      (value) => hasMethod(value, 'updateStatus')
    );
    const resolvedExecutionStepService = pickDependency<ExecutionStepService>(
      executionStepService,
      (value) =>
        hasMethod(value, 'getById') ||
        hasMethod(value, 'createManyPlannedSteps') ||
        hasMethod(value, 'findNextPendingStep') ||
        hasMethod(value, 'finishRuntimeStep') ||
        hasMethod(value, 'requeueFailedStep') ||
        hasMethod(value, 'findPendingBrowserGotoStep') ||
        hasMethod(value, 'setCurrentStep')
    );
    const resolvedExecutionInputResolutionService = pickDependency<ExecutionInputResolutionService>(
      executionInputResolutionService,
      (value) => hasMethod(value, 'resolveSubmitInputState')
    );
    const resolvedExecutionPlanNormalizationService =
      pickDependency<ExecutionPlanNormalizationService>(
        executionPlanNormalizationService,
        (value) => hasMethod(value, 'shouldSkipPlannerForExplicitStructuredInput')
      );
    const resolvedBrowserPhaseExecutor = pickDependency<BrowserPhaseExecutor>(
      browserPhaseExecutor,
      (value) => hasMethod(value, 'execute')
    );
    const resolvedExecutionHumanControlService = pickDependency<ExecutionHumanControlService>(
      executionHumanControlService,
      (value) => hasMethod(value, 'takeover') && hasMethod(value, 'resumePhaseTakeover')
    );
    const resolvedExecutionApprovalService = pickDependency<ExecutionApprovalService>(
      executionApprovalService,
      (value) => hasMethod(value, 'approve') && hasMethod(value, 'reject')
    );
    const resolvedExecutionPlanningService = pickDependency<ExecutionPlanningService>(
      executionPlanningService,
      (value) =>
        hasMethod(value, 'generatePlanDraft') && hasMethod(value, 'assertSkillAccessibleByUser')
    );
    const resolvedExecutionRuntimeSessionService = pickDependency<ExecutionRuntimeSessionService>(
      executionRuntimeSessionService,
      (value) => hasMethod(value, 'allocateRuntimeSession') && hasMethod(value, 'closeQuietly')
    );
    const resolvedExecutionFlowRunnerService = pickDependency<ExecutionFlowRunnerService>(
      executionFlowRunnerService,
      (value) => hasMethod(value, 'advanceExecutionFlow')
    );
    const resolvedExecutionStepExecutorService = pickDependency<ExecutionStepExecutorService>(
      executionStepExecutorService,
      (value) =>
        hasMethod(value, 'executeBrowserGotoStep') && hasMethod(value, 'executeSystemSkillStep')
    );
    const resolvedExecutionBrowserOrchestrationService =
      pickDependency<ExecutionBrowserOrchestrationService>(
        executionBrowserOrchestrationService,
        (value) =>
          hasMethod(value, 'bootstrapBrowserExecution') &&
          hasMethod(value, 'handleBrowserPhaseStepResult')
      );

    this.executionEventService = resolvedExecutionEventService || new ExecutionEventService(prisma);
    this.executionStepService = resolvedExecutionStepService || new ExecutionStepService(prisma);
    this.executionFlowRunnerService =
      resolvedExecutionFlowRunnerService ||
      new ExecutionFlowRunnerService(prisma, this.executionStepService);
    this.executionPhaseService = resolvedExecutionPhaseService || new ExecutionPhaseService(prisma);
    this.executionPhaseSyncService =
      resolvedExecutionPhaseSyncService ||
      new ExecutionPhaseSyncService(prisma, this.executionPhaseService);
    this.executionStateService =
      resolvedExecutionStateService ||
      new ExecutionStateService(prisma, this.executionEventService);
    this.executionApprovalService =
      resolvedExecutionApprovalService || new ExecutionApprovalService(prisma);
    this.executionHumanControlService =
      resolvedExecutionHumanControlService ||
      new ExecutionHumanControlService(
        prisma,
        this.executionPhaseService,
        this.executionStepService
      );
    this.executionInputResolutionService =
      resolvedExecutionInputResolutionService || new ExecutionInputResolutionService();
    this.executionFailureService =
      resolvedExecutionFailureService ||
      new ExecutionFailureService(
        prisma,
        this.executionStepService,
        this.executionInputResolutionService
      );
    this.executionPlanNormalizationService =
      resolvedExecutionPlanNormalizationService ||
      new ExecutionPlanNormalizationService(this.executionInputResolutionService);
    this.executionPlanningService =
      resolvedExecutionPlanningService ||
      new ExecutionPlanningService(prisma, this.executionPlanNormalizationService);
    this.executionBrowserOrchestrationService =
      resolvedExecutionBrowserOrchestrationService ||
      new ExecutionBrowserOrchestrationService(
        prisma,
        this.executionStepService,
        this.executionPhaseSyncService,
        this.executionFailureService,
        this.runtimeExecutionOrchestrator as RuntimeExecutionOrchestrator,
        this.runtimeResultInterpreter,
        this.runtimeStepRequestFactory
      );
    this.executionRuntimeSessionService =
      resolvedExecutionRuntimeSessionService || new ExecutionRuntimeSessionService();
    this.executionStepExecutorService =
      resolvedExecutionStepExecutorService ||
      new ExecutionStepExecutorService(
        this.executionStepService,
        this.runtimeExecutionOrchestrator as RuntimeExecutionOrchestrator,
        this.runtimeStepRequestFactory,
        resolvedBrowserPhaseExecutor
      );
  }

  subscribeToEvents(executionId: string, callback: (event: ExecutionStreamEventPayload) => void) {
    const subscription = this.eventSubject
      .pipe(filter((e) => e.executionId === executionId))
      .subscribe(callback);
    return subscription;
  }

  private async createEvent(
    executionId: string,
    eventType: (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE],
    payload: any,
    options: CreateExecutionEventOptions = {}
  ): Promise<void> {
    const event = await this.executionEventService.createEvent(
      executionId,
      eventType,
      this.asJsonValue(payload),
      options
    );

    this.eventSubject.next(event);
  }

  private normalizeIdempotencyKey(idempotencyKey?: string): string | undefined {
    if (typeof idempotencyKey !== 'string') {
      return undefined;
    }

    const normalized = idempotencyKey.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private async findExistingExecutionIdByIdempotencyKey(
    userId: string,
    idempotencyKey: string
  ): Promise<string | undefined> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ execution_id: string }>>(
      `
        SELECT e.id AS execution_id
        FROM executions e
        INNER JOIN execution_events ev
          ON ev.execution_id = e.id
        WHERE e.created_by = $1::uuid
          AND ev.event_type = $2
          AND ev.payload_json->>'idempotencyKey' = $3
        ORDER BY ev.created_at DESC
        LIMIT 1
      `,
      userId,
      EXECUTION_EVENT_TYPE.EXECUTION_CREATED,
      idempotencyKey
    );

    const executionId = rows[0]?.execution_id;
    return typeof executionId === 'string' && executionId.trim().length > 0
      ? executionId
      : undefined;
  }

  async create(
    userId: string,
    dto: CreateExecutionDto,
    options?: { authToken?: string }
  ): Promise<ExecutionDto> {
    const resolvedSkillId = dto.capabilityId || dto.skillId;
    const resolvedSkillVersion = dto.capabilityVersion || dto.skillVersion;

    if (!resolvedSkillId) {
      throw new BadRequestException('skillId or capabilityId is required');
    }

    await this.assertSkillAccessibleByUser(resolvedSkillId, options?.authToken, {
      id: userId,
      role: 'employee',
    });

    const resolvedDto: CreateExecutionDto = {
      ...dto,
      skillId: resolvedSkillId,
      capabilityId: dto.capabilityId || resolvedSkillId,
      skillVersion: resolvedSkillVersion,
      capabilityVersion: dto.capabilityVersion || resolvedSkillVersion,
      idempotencyKey: this.normalizeIdempotencyKey(dto.idempotencyKey),
    };

    if (resolvedDto.idempotencyKey) {
      const existingExecutionId = await this.findExistingExecutionIdByIdempotencyKey(
        userId,
        resolvedDto.idempotencyKey
      );
      if (existingExecutionId) {
        this.logger.log(
          `Reusing existing execution ${existingExecutionId} for idempotency key ${resolvedDto.idempotencyKey}`
        );
        return this.getById(existingExecutionId);
      }
    }

    const runtimeDefaultResolution = await this.fetchSkillDefaultResolution(
      resolvedSkillId,
      options?.authToken,
      { id: userId, role: 'employee' }
    );
    const runtimeDefaultInput = runtimeDefaultResolution.input;

    const providedPlanDraft =
      resolvedDto.planDraft &&
      typeof resolvedDto.planDraft === 'object' &&
      !Array.isArray(resolvedDto.planDraft)
        ? (resolvedDto.planDraft as unknown as PlannerPlanDraft)
        : undefined;
    const shouldUseDirectExecutionPlan =
      !providedPlanDraft &&
      this.executionPlanNormalizationService.shouldSkipPlannerForExplicitStructuredInput(
        resolvedDto
      );
    const shouldGeneratePlanDraft = !providedPlanDraft && !shouldUseDirectExecutionPlan;
    const generatedPlanDraft =
      providedPlanDraft ||
      (shouldGeneratePlanDraft
        ? await this.generatePlanDraft(userId, resolvedDto, options?.authToken)
        : undefined);
    const effectiveGeneratedPlanDraft =
      generatedPlanDraft ||
      (shouldUseDirectExecutionPlan
        ? this.executionPlanNormalizationService.buildDirectExecutionPlanDraft(
            resolvedDto,
            resolvedSkillId
          )
        : undefined);
    const reconciledPlanDraft = this.executionPlanNormalizationService.reconcilePlanDraftWithInput(
      generatedPlanDraft as unknown as any,
      resolvedDto.input
    ) as unknown as PlannerPlanDraft | undefined;
    const reconciledDirectPlanDraft =
      !reconciledPlanDraft && effectiveGeneratedPlanDraft
        ? (this.executionPlanNormalizationService.reconcilePlanDraftWithInput(
            effectiveGeneratedPlanDraft as unknown as any,
            resolvedDto.input
          ) as unknown as PlannerPlanDraft | undefined)
        : reconciledPlanDraft;
    const defaultedPlanDraft =
      this.executionPlanNormalizationService.applyRuntimeDefaultsToPlanDraft(
        reconciledDirectPlanDraft as unknown as any,
        runtimeDefaultInput,
        runtimeDefaultResolution.sources
      ) as unknown as PlannerPlanDraft | undefined;
    const planDraft = await this.rewriteBrowserRecordingPlanDraftWithActivities(
      defaultedPlanDraft,
      resolvedSkillId,
      resolvedDto.input,
      runtimeDefaultInput
    );
    const plannedCapabilityId = planDraft?.skill_match?.skill_id;
    const effectiveSkillId = plannedCapabilityId || resolvedSkillId;
    const effectiveSkillVersion = resolvedSkillVersion;
    const normalizedInput = this.executionPlanNormalizationService.buildNormalizedInput(
      resolvedDto,
      planDraft as unknown as any,
      runtimeDefaultInput,
      runtimeDefaultResolution.sources,
      (draftDto) => this.executionPlanNormalizationService.buildPlannerUserInput(draftDto)
    );

    // 注入 usage 到 normalizedInput 中以便持久化
    const usage = planDraft?.usage || resolvedDto.usage;
    if (usage) {
      (normalizedInput as any).__usage = usage;
    }

    const executionRuntimeType = this.executionPlanNormalizationService.resolveExecutionRuntimeType(
      resolvedDto.runtimeType,
      planDraft as unknown as any,
      normalizedInput
    );
    const execution = await this.prisma.execution.create({
      data: {
        createdBy: userId,
        skillId: effectiveSkillId,
        skillVersion: effectiveSkillVersion,
        status: planDraft?.risk_summary.requires_human_review
          ? EXECUTION_STATUS.PENDING_APPROVAL
          : EXECUTION_STATUS.QUEUED,
        runtimeType: executionRuntimeType,
        inputJson: this.asJsonValue(resolvedDto.input),
        normalizedInputJson: this.asJsonValue(normalizedInput),
        riskLevel: this.executionPlanNormalizationService.mapPlannerRiskLevel(
          planDraft as unknown as any
        ),
        requiresApproval: planDraft?.risk_summary.requires_human_review || false,
        approvalStatus: planDraft?.risk_summary.requires_human_review
          ? APPROVAL_STATUS.PENDING
          : APPROVAL_STATUS.NOT_REQUIRED,
        takeoverRequired: false,
      },
    });

    // Create execution event
    await this.createEvent(execution.id, EXECUTION_EVENT_TYPE.EXECUTION_CREATED, {
      userId,
      skillId: effectiveSkillId,
      capabilityId: plannedCapabilityId || resolvedDto.capabilityId || resolvedSkillId,
      capabilityVersion: effectiveSkillVersion || resolvedDto.capabilityVersion || null,
      ...(resolvedDto.idempotencyKey ? { idempotencyKey: resolvedDto.idempotencyKey } : {}),
    });

    if (planDraft) {
      await this.createEvent(execution.id, EXECUTION_EVENT_TYPE.EXECUTION_PLAN_GENERATED, {
        planId: planDraft.plan_id,
        plannerMode: planDraft.planner_mode,
        summary: planDraft.summary,
        skillMatch: planDraft.skill_match,
        capabilityMatch: planDraft.skill_match
          ? {
              capabilityId: planDraft.skill_match.skill_id,
              capabilityName: planDraft.skill_match.skill_name,
              confidence: planDraft.skill_match.confidence,
              matchReason: planDraft.skill_match.match_reason,
            }
          : undefined,
        riskSummary: planDraft.risk_summary,
        semantic: planDraft.semantic
          ? {
              mode: planDraft.semantic.mode,
              previewReady: planDraft.semantic.previewReady,
              finalReady: planDraft.semantic.finalReady,
              groupedMissingCount: planDraft.semantic.groupedMissing.length,
            }
          : undefined,
      });
    }

    await this.createPlannedSteps(execution.id, normalizedInput, planDraft);

    const hasMissingRequiredInputs = Boolean(
      planDraft?.required_inputs?.some(
        (item) =>
          item.required && this.executionInputResolutionService.isBlockingRequiredInput(item)
      )
    );

    this.logger.log(`Execution created: ${execution.id}`);

    if (!execution.requiresApproval) {
      if (hasMissingRequiredInputs) {
        const waitingInputStep = await this.executionStepService.findPendingInputCollectionStep(
          execution.id
        );

        if (waitingInputStep) {
          await this.enterWaitingInput(execution as any, waitingInputStep.id);
          return this.getById(execution.id);
        }
      }

      // Trigger execution start (async)
      this.startExecution(execution.id).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to start execution ${execution.id}: ${msg}`);
      });
    }

    return this.getById(execution.id);
  }

  private async startExecution(executionId: string): Promise<void> {
    this.logger.log(`Starting execution ${executionId}`);
    const execution = await this.prisma.execution.findUnique({
      where: { id: executionId },
    });

    if (!execution) {
      this.logger.error(`Execution ${executionId} not found during startExecution`);
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    // Update status to running
    await this.updateStatus(executionId, EXECUTION_STATUS.RUNNING);

    if (execution.runtimeType !== BROWSER_RUNTIME.TYPE) {
      await this.createEvent(execution.id, EXECUTION_EVENT_TYPE.RUNTIME_SKIPPED, {
        runtimeType: execution.runtimeType,
        mode: BROWSER_RUNTIME.NON_BROWSER_MODE,
      });
      await this.advanceExecutionFlow(execution.id, execution.id);
      this.logger.log(
        `Skipped browser runtime allocation for execution ${executionId} (runtime: ${execution.runtimeType})`
      );
      return;
    }

    try {
      this.logger.log(
        `Allocating runtime session for execution ${executionId} (type: ${execution.runtimeType})`
      );
      const runtimeSession = await this.executionRuntimeSessionService.allocateRuntimeSession({
        userId: execution.createdBy,
        executionId: execution.id,
        runtimeType: execution.runtimeType,
      });
      this.logger.log(`Runtime session allocated: ${runtimeSession.id}`);

      // Create event (RuntimeSession record is created by runtime-session service)
      await this.createEvent(execution.id, EXECUTION_EVENT_TYPE.RUNTIME_ALLOCATED, {
        runtimeSessionId: runtimeSession.id,
      });

      await this.bootstrapBrowserExecution(execution as any, runtimeSession.id);
      this.logger.log(`Runtime allocated and bootstrap complete for execution ${executionId}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to allocate runtime for execution ${executionId}: ${errorMsg}`);
      await this.updateStatus(executionId, EXECUTION_STATUS.FAILED);
      await this.prisma.execution.update({
        where: { id: executionId },
        data: {
          failureReason: `Failed to allocate runtime session: ${errorMsg}`,
          failureCode: 'RUNTIME_ALLOCATION_FAILED',
        },
      });
    }
  }

  async getById(id: string, requester?: RequestUserContext): Promise<ExecutionDto> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    this.ensureExecutionPermission(execution.createdBy, requester);

    const runtimeSession = await this.prisma.runtimeSession.findFirst({
      where: { executionId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const phases = await this.executionPhaseService.listByExecutionId(id);

    return this.toDto({
      ...execution,
      runtimeSessionId: runtimeSession?.id || null,
      phases,
    });
  }

  async getSteps(id: string, requester?: RequestUserContext): Promise<ExecutionStepDto[]> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    this.ensureExecutionPermission(execution.createdBy, requester);

    const steps = await this.executionStepService.listByExecutionId(id);

    return steps.map((s) => this.toStepDto(s));
  }

  async getPhases(id: string, requester?: RequestUserContext) {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    this.ensureExecutionPermission(execution.createdBy, requester);

    return (await this.executionPhaseService.listByExecutionId(id))
      .map((phase) => mapExecutionPhaseToDto(phase))
      .filter((phase): phase is NonNullable<ExecutionDto['phases']>[number] => Boolean(phase));
  }

  async updateWorkflowActivityProgress(
    executionId: string,
    dto: UpdateWorkflowActivityProgressDto,
    requester?: RequestUserContext
  ): Promise<void> {
    const execution = await this.prisma.execution.findUnique({
      where: { id: executionId },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    this.ensureExecutionPermission(execution.createdBy, requester);

    const phases = await this.executionPhaseService.listByExecutionId(executionId);
    const workflowActivityPhases = phases
      .filter((phase) => {
        const phaseType = this.readNonEmptyString(phase.phaseType, phase.phase_type);
        if (phaseType !== 'workflow_activity') {
          return false;
        }
        const input = this.readRecord(phase.input, phase.input_json);
        return this.readNonEmptyString(input?.parentPhaseKey) === dto.parentPhaseKey;
      })
      .sort((left, right) => {
        const leftInput = this.readRecord(left.input, left.input_json);
        const rightInput = this.readRecord(right.input, right.input_json);
        const leftOrder = Number(leftInput?.order || 0);
        const rightOrder = Number(rightInput?.order || 0);
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        return String(left.phaseKey || left.phase_key || '').localeCompare(
          String(right.phaseKey || right.phase_key || '')
        );
      });

    if (workflowActivityPhases.length === 0) {
      return;
    }

    const currentPhase = workflowActivityPhases.find((phase) => {
      const input = this.readRecord(phase.input, phase.input_json);
      const order = Number(input?.order || 0);
      if (dto.activityOrder && order === dto.activityOrder) {
        return true;
      }
      return Boolean(
        dto.activityName &&
        this.readNonEmptyString(phase.phaseName, phase.phase_name) === dto.activityName
      );
    });

    if (!currentPhase) {
      this.logger.warn(
        `Workflow activity progress ignored for execution ${executionId}: parentPhaseKey=${dto.parentPhaseKey}, activityOrder=${dto.activityOrder ?? '-'}, activityName=${dto.activityName ?? '-'}`
      );
      return;
    }

    const currentPhaseKey = this.readNonEmptyString(currentPhase.phaseKey, currentPhase.phase_key);
    const currentPhaseName = this.readNonEmptyString(
      currentPhase.phaseName,
      currentPhase.phase_name
    );
    const currentPhaseType =
      this.readNonEmptyString(currentPhase.phaseType, currentPhase.phase_type) ||
      'workflow_activity';
    const currentAttempt = Number(currentPhase.attempt || 1);
    const currentInput = this.readRecord(currentPhase.input, currentPhase.input_json);
    const currentOutput = this.readRecord(currentPhase.output, currentPhase.output_json);
    const currentStartedAt = this.toNullableDate(currentPhase.startedAt || currentPhase.started_at);
    const currentOrder = Number(currentInput?.order || dto.activityOrder || 0);
    const runtimeSessionId =
      dto.runtimeSessionId ||
      this.readNonEmptyString(currentPhase.runtimeSessionId, currentPhase.runtime_session_id) ||
      null;

    if (!currentPhaseKey || !currentPhaseName) {
      return;
    }

    for (const phase of workflowActivityPhases) {
      const phaseKey = this.readNonEmptyString(phase.phaseKey, phase.phase_key);
      if (!phaseKey || phaseKey === currentPhaseKey) {
        continue;
      }

      const phaseInput = this.readRecord(phase.input, phase.input_json);
      const phaseOrder = Number(phaseInput?.order || 0);
      const phaseStatus = this.readNonEmptyString(phase.status) || 'pending';
      if (
        phaseOrder > 0 &&
        currentOrder > 0 &&
        phaseOrder < currentOrder &&
        phaseStatus === 'running'
      ) {
        await this.executionPhaseService.createOrUpdatePhase({
          executionId,
          phaseKey,
          phaseName: this.readNonEmptyString(phase.phaseName, phase.phase_name) || phaseKey,
          phaseType:
            this.readNonEmptyString(phase.phaseType, phase.phase_type) || 'workflow_activity',
          status: 'completed',
          attempt: Number(phase.attempt || 1),
          runtimeSessionId:
            runtimeSessionId ||
            this.readNonEmptyString(phase.runtimeSessionId, phase.runtime_session_id) ||
            null,
          input: phaseInput,
          output: this.readRecord(phase.output, phase.output_json),
          errorCode: null,
          errorMessage: null,
          startedAt: this.toNullableDate(phase.startedAt || phase.started_at),
          completedAt: new Date(),
        });
      }
    }

    const currentStatus = this.readNonEmptyString(currentPhase.status) || 'pending';
    if (currentStatus !== 'completed') {
      await this.executionPhaseService.createOrUpdatePhase({
        executionId,
        phaseKey: currentPhaseKey,
        phaseName: currentPhaseName,
        phaseType: currentPhaseType,
        status: 'running',
        attempt: currentAttempt,
        runtimeSessionId,
        input: currentInput,
        output: currentOutput,
        errorCode: null,
        errorMessage: null,
        startedAt: currentStartedAt || new Date(),
        completedAt: null,
      });
    }
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
    const context = await this.loadSubmitInputContext(id, userId, dto, requester);
    const resolution = this.executionInputResolutionService.resolveSubmitInputState(
      {
        normalized: context.normalized,
        requiredInputs: context.requiredInputs,
        currentParamResolution: context.currentParamResolution,
        missingInputs: context.missingInputs,
      },
      {
        input: dto.input,
        currentUsage: context.normalized.__usage as unknown as LLMUsage | undefined,
        submittedUsage: dto.usage as unknown as LLMUsage | undefined,
        reconcileSemantic: (semantic, requiredInputs) =>
          this.executionPlanNormalizationService.reconcilePlanSemantic(
            semantic as Record<string, unknown> | undefined,
            requiredInputs as ExecutionRequiredInput[]
          ) as unknown as Record<string, unknown> | undefined,
      }
    );

    await this.persistSubmitInputState(id, dto.stepId, resolution);

    return this.finishSubmitInputAndResume(
      id,
      userId,
      dto.stepId,
      context.effectiveRequester,
      resolution
    );
  }

  private async loadSubmitInputContext(
    id: string,
    userId: string,
    dto: SubmitInputDto,
    requester?: RequestUserContext
  ): Promise<SubmitInputContext> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    const effectiveRequester = requester || { id: userId };
    this.ensureExecutionPermission(execution.createdBy, effectiveRequester);

    if (execution.status !== EXECUTION_STATUS.WAITING_INPUT) {
      throw new BadRequestException(
        `Execution ${id} is not in ${EXECUTION_STATUS.WAITING_INPUT} status`
      );
    }

    const step = await this.executionStepService.getById(dto.stepId);
    if (!step || step.executionId !== id || step.type !== 'input_collection') {
      throw new BadRequestException('Invalid step ID for input submission');
    }

    const normalized = (execution.normalizedInputJson as Record<string, unknown>) || {};
    const requiredInputs = this.executionInputResolutionService.getRequiredInputs(execution);
    const currentParamResolution =
      this.executionInputResolutionService.getParamResolution(execution);
    const missingInputs = requiredInputs.filter((item) =>
      this.executionInputResolutionService.isBlockingRequiredInput(item)
    );

    if (missingInputs.length === 0) {
      throw new BadRequestException(`Execution ${id} has no missing input to submit`);
    }

    return {
      execution,
      effectiveRequester,
      normalized,
      requiredInputs,
      currentParamResolution,
      missingInputs,
    };
  }

  private async persistSubmitInputState(
    executionId: string,
    stepId: string,
    resolution: SubmitInputResolutionResult
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.executionStep.update({
        where: { id: stepId },
        data: {
          status: resolution.canResumeExecution
            ? EXECUTION_STEP_STATUS.SUCCEEDED
            : EXECUTION_STEP_STATUS.WAITING_INPUT,
          inputJson: this.asJsonValue({
            requiredInputs: resolution.updatedRequiredInputs.filter((item) => item.missing),
          }),
          outputJson: this.asJsonValue(resolution.mergedSubmittedInput),
          endedAt: resolution.canResumeExecution ? new Date() : null,
        },
      }),
      this.prisma.execution.update({
        where: { id: executionId },
        data: {
          normalizedInputJson: this.asJsonValue(resolution.updatedNormalized),
          status: resolution.canResumeExecution
            ? EXECUTION_STATUS.QUEUED
            : EXECUTION_STATUS.WAITING_INPUT,
        },
      }),
    ]);
  }

  private async finishSubmitInputAndResume(
    executionId: string,
    userId: string,
    stepId: string,
    requester: RequestUserContext,
    resolution: SubmitInputResolutionResult
  ): Promise<ExecutionDto> {
    const runtimeSession = await this.prisma.runtimeSession.findFirst({
      where: { executionId },
      orderBy: { createdAt: 'desc' },
    });

    await this.createEvent(
      executionId,
      resolution.canResumeExecution
        ? EXECUTION_EVENT_TYPE.EXECUTION_INPUT_SUBMITTED
        : EXECUTION_EVENT_TYPE.EXECUTION_PARTIAL_INPUT_SUBMITTED,
      {
        stepId,
        input: resolution.normalizedSubmittedInput,
        remainingMissing: resolution.remainingMissingInputs.map((item) => item.name),
      }
    );

    if (!resolution.canResumeExecution) {
      this.logger.log(
        `Partial input submitted for execution ${executionId}; remaining: ${resolution.remainingMissingInputs.length}`
      );
      return this.getById(executionId, requester);
    }

    if (!runtimeSession) {
      await this.startExecution(executionId);
      this.logger.log(
        `Input submitted for execution ${executionId}; runtime session will be allocated on start`
      );
      return this.getById(executionId, requester);
    }

    await this.updateStatus(executionId, EXECUTION_STATUS.RUNNING);

    await this.createEvent(
      executionId,
      EXECUTION_EVENT_TYPE.EXECUTION_RESUMED,
      {
        userId,
        reason: 'input_submitted',
      },
      {
        runtimeSessionId: runtimeSession.id,
        stepId,
      }
    );

    this.advanceExecutionFlow(executionId, runtimeSession.id).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to asynchronously resume execution ${executionId}: ${message}`);
    });
    this.logger.log(`Input submitted and execution ${executionId} resumed from step ${stepId}`);
    return this.getById(executionId, requester);
  }

  async cancel(id: string, userId: string, requester?: RequestUserContext): Promise<ExecutionDto> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    this.ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (
      !canTransitionExecutionStatus(execution.status as ExecutionStatus, EXECUTION_STATUS.CANCELLED)
    ) {
      throw new BadRequestException(`Cannot cancel from status ${execution.status}`);
    }

    await this.updateStatus(id, EXECUTION_STATUS.CANCELLED);

    // Close runtime session
    const runtimeSession = await this.prisma.runtimeSession.findFirst({
      where: { executionId: id },
    });

    if (runtimeSession) {
      try {
        await this.closeRuntimeSessionQuietly(runtimeSession.id, id, 'execution_cancelled');
      } catch (error) {
        this.logger.error(`Failed to close runtime session for execution ${id}`);
      }
    }

    // Create event
    await this.createEvent(id, EXECUTION_EVENT_TYPE.EXECUTION_CANCELLED, { userId });

    this.logger.log(`Execution ${id} cancelled`);

    return this.getById(id, requester || { id: userId });
  }

  async list(
    dto: ListExecutionsDto,
    requester?: RequestUserContext
  ): Promise<{ data: ExecutionDto[]; total: number; page: number; pageSize: number }> {
    const page = dto.page || 1;
    const pageSize = dto.pageSize || 10;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (dto.status) {
      where.status = dto.status;
    }
    if (dto.skillId) {
      where.skillId = dto.skillId;
    }
    if (requester?.id && requester.role !== 'admin') {
      where.createdBy = requester.id;
    }

    const [executions, total] = await Promise.all([
      this.prisma.execution.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.execution.count({ where }),
    ]);

    const runtimeSessions =
      executions.length > 0
        ? await this.prisma.runtimeSession.findMany({
            where: {
              executionId: {
                in: executions.map((execution) => execution.id),
              },
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true, executionId: true },
          })
        : [];
    const runtimeSessionIdByExecutionId = new Map<string, string>();
    runtimeSessions.forEach((runtimeSession) => {
      if (!runtimeSessionIdByExecutionId.has(runtimeSession.executionId)) {
        runtimeSessionIdByExecutionId.set(runtimeSession.executionId, runtimeSession.id);
      }
    });

    return {
      data: executions.map((execution) =>
        this.toDto({
          ...execution,
          runtimeSessionId: runtimeSessionIdByExecutionId.get(execution.id) || null,
        })
      ),
      total,
      page,
      pageSize,
    };
  }

  private async updateStatus(id: string, newStatus: ExecutionStatus): Promise<void> {
    const event = await this.executionStateService.updateStatus(id, newStatus);
    this.eventSubject.next(event);
  }

  private getHumanControlHooks() {
    return {
      getExecutionDto: (id: string, requester?: RequestUserContext) => this.getById(id, requester),
      emitEvent: (
        executionId: string,
        eventType: (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE],
        payload: unknown,
        options: CreateExecutionEventOptions = {}
      ) => this.createEvent(executionId, eventType, payload, options),
      updateStatus: (id: string, newStatus: ExecutionStatus) => this.updateStatus(id, newStatus),
      freezeRuntimeSessionQuietly: (
        runtimeSessionId: string | null | undefined,
        executionId: string,
        reason: string
      ) => this.freezeRuntimeSessionQuietly(runtimeSessionId, executionId, reason),
      resumeRuntimeSessionQuietly: (
        runtimeSessionId: string | null | undefined,
        executionId: string,
        stepId?: string
      ) => this.resumeRuntimeSessionQuietly(runtimeSessionId, executionId, stepId),
      advanceExecutionFlow: (executionId: string, runtimeSessionId: string) =>
        this.advanceExecutionFlow(executionId, runtimeSessionId),
    };
  }

  private getApprovalHooks() {
    return {
      getExecutionDto: (id: string, requester?: RequestUserContext) => this.getById(id, requester),
      emitEvent: (
        executionId: string,
        eventType: (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE],
        payload: unknown,
        options: CreateExecutionEventOptions = {}
      ) => this.createEvent(executionId, eventType, payload, options),
      updateStatus: (id: string, newStatus: ExecutionStatus) => this.updateStatus(id, newStatus),
      startExecution: (executionId: string) => this.startExecution(executionId),
    };
  }

  private getFailureHooks() {
    return {
      emitEvent: (
        executionId: string,
        eventType: (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE],
        payload: unknown,
        options: CreateExecutionEventOptions = {}
      ) => this.createEvent(executionId, eventType, payload, options),
      updateStatus: (id: string, newStatus: ExecutionStatus) => this.updateStatus(id, newStatus),
      closeRuntimeSessionQuietly: (runtimeSessionId: string, executionId: string, reason: string) =>
        this.closeRuntimeSessionQuietly(runtimeSessionId, executionId, reason),
    };
  }

  private getBrowserOrchestrationHooks() {
    return {
      emitEvent: (
        executionId: string,
        eventType: (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE],
        payload: unknown,
        options: CreateExecutionEventOptions = {}
      ) => this.createEvent(executionId, eventType, payload, options),
      advanceExecutionFlow: (executionId: string, runtimeSessionId: string) =>
        this.advanceExecutionFlow(executionId, runtimeSessionId),
      enterRuntimeWaitingInput: (
        executionId: string,
        runtimeSessionId: string,
        stepId: string,
        requiredInputs: unknown[],
        reason?: string
      ) =>
        this.enterRuntimeWaitingInput(
          executionId,
          runtimeSessionId,
          stepId,
          requiredInputs,
          reason
        ),
      enterPendingApprovalFromRuntimeStep: (executionId: string, reason: string) =>
        this.enterPendingApprovalFromRuntimeStep(executionId, reason),
      failExecutionFromRuntimeStep: (input: {
        executionId: string;
        stepId: string;
        failureReason: string;
        failureCode: string;
        runtimeSessionId?: string;
      }) => this.failExecutionFromRuntimeStep(input),
      syncPhaseAfterStepResult: (
        executionId: string,
        runtimeSessionId: string,
        result: RuntimeStepInvokeResult,
        phaseMetadata?: ExecutionStepPhaseMetadata,
        step?: Record<string, unknown> | null
      ) =>
        this.syncPhaseAfterStepResult(executionId, runtimeSessionId, result, phaseMetadata, step),
      takeover: (executionId: string, reason: string) =>
        this.takeover(
          executionId,
          'system',
          { reason },
          {
            id: 'system',
            role: 'admin',
          }
        ).then(() => undefined),
      failureHooks: this.getFailureHooks(),
    };
  }

  private getStepExecutorHooks() {
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
      emitEvent: (
        executionId: string,
        eventType: (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE],
        payload: unknown,
        options: CreateExecutionEventOptions = {}
      ) => this.createEvent(executionId, eventType, payload, options),
      handleBrowserStepResult: (
        executionId: string,
        runtimeSessionId: string,
        stepId: string,
        result: RuntimeStepInvokeResult,
        phaseMetadata?: ExecutionStepPhaseMetadata,
        step?: Record<string, unknown> | null
      ) =>
        this.handleBrowserStepResult(
          executionId,
          runtimeSessionId,
          stepId,
          result,
          phaseMetadata,
          step
        ),
      extractStepBrowserPhaseConfig: (step?: Record<string, unknown> | null) =>
        this.executionBrowserOrchestrationService.extractStepBrowserPhaseConfig(step),
      skipSingleStep: (stepId: string, executionId: string, reason: string) =>
        this.executionFailureService.skipSingleStep(
          stepId,
          executionId,
          reason,
          this.getFailureHooks()
        ),
      advanceExecutionFlow: (executionId: string, runtimeSessionId: string) =>
        this.advanceExecutionFlow(executionId, runtimeSessionId),
      buildBrowserPhasePolicyContext: (execution: Record<string, unknown>) =>
        this.executionBrowserOrchestrationService.buildBrowserPhasePolicyContext(execution),
      buildBrowserPhaseTraceContext: (execution: Record<string, unknown>) =>
        this.executionBrowserOrchestrationService.buildBrowserPhaseTraceContext(execution),
      extractBrowserPhaseInput: (step?: Record<string, unknown> | null) =>
        this.executionBrowserOrchestrationService.extractBrowserPhaseInput(step),
      handleBrowserPhaseStepResult: (
        executionId: string,
        runtimeSessionId: string,
        stepId: string,
        result: RuntimePhaseInvokeResult
      ) => this.handleBrowserPhaseStepResult(executionId, runtimeSessionId, stepId, result),
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
      handleSystemSkillStepResult: (
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
        ),
    };
  }

  private async closeRuntimeSessionQuietly(
    runtimeSessionId: string,
    executionId: string,
    reason: string
  ): Promise<void> {
    await this.executionRuntimeSessionService.closeQuietly(runtimeSessionId, executionId, reason);
  }

  private async freezeRuntimeSessionQuietly(
    runtimeSessionId: string | null | undefined,
    executionId: string,
    reason: string
  ): Promise<void> {
    await this.executionRuntimeSessionService.freezeQuietly(runtimeSessionId, executionId, reason);
  }

  private async resumeRuntimeSessionQuietly(
    runtimeSessionId: string | null | undefined,
    executionId: string,
    stepId?: string
  ): Promise<void> {
    await this.executionRuntimeSessionService.resumeQuietly(runtimeSessionId, executionId, stepId);
  }

  private async bootstrapBrowserExecution(
    execution: Record<string, unknown>,
    runtimeSessionId: string
  ): Promise<void> {
    await this.executionBrowserOrchestrationService.bootstrapBrowserExecution(
      execution,
      runtimeSessionId,
      this.getBrowserOrchestrationHooks()
    );
  }

  private async handleBrowserStepResult(
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    result: RuntimeStepInvokeResult,
    phaseMetadata?: ExecutionStepPhaseMetadata,
    step?: Record<string, unknown> | null
  ): Promise<void> {
    await this.executionBrowserOrchestrationService.handleBrowserStepResult(
      executionId,
      runtimeSessionId,
      stepId,
      result,
      this.getBrowserOrchestrationHooks(),
      phaseMetadata,
      step
    );
  }

  private toDto(execution: any): ExecutionDto {
    return mapExecutionToDto(execution);
  }

  private toStepDto(step: Record<string, unknown>): ExecutionStepDto {
    return mapExecutionStepToDto(step);
  }

  private asJsonValue(value: unknown): Prisma.JsonValue {
    return value as Prisma.JsonValue;
  }

  private async assertSkillAccessibleByUser(
    skillId: string,
    authToken?: string,
    requester?: RequestUserContext
  ): Promise<void> {
    await this.executionPlanningService.assertSkillAccessibleByUser(skillId, authToken, requester);
  }

  private async fetchSkillDefaultResolution(
    skillId: string,
    authToken?: string,
    requester?: RequestUserContext
  ): Promise<RuntimeDefaultResolution> {
    return this.executionPlanningService.fetchSkillDefaultResolution(
      skillId,
      authToken,
      requester
    ) as Promise<RuntimeDefaultResolution>;
  }

  private ensureExecutionPermission(
    executionOwnerId: string,
    requester?: RequestUserContext
  ): void {
    if (!requester?.id) {
      return;
    }
    if (requester.role === 'admin') {
      return;
    }
    if (requester.id !== executionOwnerId) {
      throw new NotFoundException('Execution not found');
    }
  }

  private async generatePlanDraft(
    userId: string,
    dto: CreateExecutionDto,
    authToken?: string
  ): Promise<PlannerPlanDraft | undefined> {
    return this.executionPlanningService.generatePlanDraft(userId, dto, authToken) as Promise<
      PlannerPlanDraft | undefined
    >;
  }

  private async rewriteBrowserRecordingPlanDraftWithActivities(
    planDraft: PlannerPlanDraft | undefined,
    fallbackCapabilityId?: string,
    input?: Record<string, unknown>,
    runtimeDefaultInput?: Record<string, unknown>
  ): Promise<PlannerPlanDraft | undefined> {
    return this.executionPlanningService.rewriteBrowserRecordingPlanDraftWithActivities(
      planDraft,
      fallbackCapabilityId,
      input,
      runtimeDefaultInput
    ) as Promise<PlannerPlanDraft | undefined>;
  }

  private async advanceExecutionFlow(executionId: string, runtimeSessionId: string): Promise<void> {
    await this.executionFlowRunnerService.advanceExecutionFlow(executionId, runtimeSessionId, {
      completeActivePhasesOnExecutionSuccess: (targetExecutionId, targetRuntimeSessionId) =>
        this.completeActivePhasesOnExecutionSuccess(targetExecutionId, targetRuntimeSessionId),
      updateStatus: (targetExecutionId, newStatus) =>
        this.updateStatus(targetExecutionId, newStatus),
      closeRuntimeSessionQuietly: (targetRuntimeSessionId, targetExecutionId, reason) =>
        this.closeRuntimeSessionQuietly(targetRuntimeSessionId, targetExecutionId, reason),
      extractStepUrl: (step, execution) => this.extractStepUrl(step, execution),
      skipSingleStep: (stepId, targetExecutionId, reason) =>
        this.executionFailureService.skipSingleStep(
          stepId,
          targetExecutionId,
          reason,
          this.getFailureHooks()
        ),
      executeBrowserGotoStep: (execution, targetRuntimeSessionId, stepId, url) =>
        this.executeBrowserGotoStep(execution, targetRuntimeSessionId, stepId, url),
      enterWaitingInput: (execution, stepId) => this.enterWaitingInput(execution, stepId),
      executeBrowserPhaseStep: (execution, targetRuntimeSessionId, stepId) =>
        this.executeBrowserPhaseStep(execution, targetRuntimeSessionId, stepId),
      executeSystemSkillStep: (execution, targetRuntimeSessionId, stepId) =>
        this.executeSystemSkillStep(execution, targetRuntimeSessionId, stepId),
    });
  }

  private async createPlannedSteps(
    executionId: string,
    normalizedInput: Record<string, unknown>,
    planDraft?: PlannerPlanDraft
  ): Promise<void> {
    const { steps, bootstrapUrl } = buildPlannedExecutionSteps(
      executionId,
      normalizedInput,
      planDraft
    );

    if (steps.length === 0) {
      return;
    }

    await this.executionStepService.createManyPlannedSteps(steps);

    await this.createEvent(executionId, EXECUTION_EVENT_TYPE.EXECUTION_STEPS_PLANNED, {
      stepCount: steps.length,
      bootstrapUrl,
      plannerStepCount: planDraft?.steps.length || 0,
    });
  }

  private async executeBrowserGotoStep(
    execution: Record<string, unknown>,
    runtimeSessionId: string,
    stepId: string,
    url: string
  ): Promise<void> {
    await this.executionStepExecutorService.executeBrowserGotoStep(
      execution,
      runtimeSessionId,
      stepId,
      url,
      this.getStepExecutorHooks()
    );
  }

  private async executeBrowserPhaseStep(
    execution: Record<string, unknown>,
    runtimeSessionId: string,
    stepId: string
  ): Promise<void> {
    await this.executionStepExecutorService.executeBrowserPhaseStep(
      execution,
      runtimeSessionId,
      stepId,
      this.getStepExecutorHooks()
    );
  }

  private async executeSystemSkillStep(
    execution: Record<string, unknown>,
    runtimeSessionId: string,
    stepId: string
  ): Promise<void> {
    await this.executionStepExecutorService.executeSystemSkillStep(
      execution,
      runtimeSessionId,
      stepId,
      this.getStepExecutorHooks()
    );
  }

  private async handleBrowserPhaseStepResult(
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    result: RuntimePhaseInvokeResult
  ): Promise<void> {
    await this.executionBrowserOrchestrationService.handleBrowserPhaseStepResult(
      executionId,
      runtimeSessionId,
      stepId,
      result,
      this.getBrowserOrchestrationHooks()
    );
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
    await this.runtimeResultInterpreter.handleSkillRuntimeResult(
      {
        executionId,
        runtimeSessionId,
        stepId,
        emitEvent: (eventType, payload) =>
          this.createEvent(executionId, eventType, payload, {
            runtimeSessionId,
            stepId,
          }),
        advanceExecutionFlow: () => this.advanceExecutionFlow(executionId, runtimeSessionId),
        failExecution: (failureReason, failureCode) =>
          this.failExecutionFromRuntimeStep({
            executionId,
            stepId,
            failureReason,
            failureCode,
            runtimeSessionId,
          }),
        takeover: async (reason) => {
          await this.takeover(
            executionId,
            'system',
            {
              reason,
            },
            {
              id: 'system',
              role: 'admin',
            }
          );
        },
        enterWaitingInput: (requiredInputs, reason) =>
          this.enterRuntimeWaitingInput(
            executionId,
            runtimeSessionId,
            stepId,
            requiredInputs,
            reason
          ),
        enterPendingApproval: (reason) =>
          this.enterPendingApprovalFromRuntimeStep(executionId, reason),
      },
      result
    );
    await this.syncPhaseAfterStepResult(executionId, runtimeSessionId, result, phaseMetadata, step);
    await this.syncWorkflowActivityPhasesAfterSkillResult(
      executionId,
      runtimeSessionId,
      capabilityId,
      result,
      phaseMetadata
    );
  }

  private readRecord(...values: unknown[]): Record<string, unknown> | null {
    for (const value of values) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    }
    return null;
  }

  private readNonEmptyString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private toNullableDate(value: unknown): Date | null {
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }

  private extractStepUrl(
    step: Record<string, unknown>,
    execution: Record<string, unknown>
  ): string | undefined {
    return this.executionBrowserOrchestrationService.extractStepUrl(step, execution);
  }

  private async enterRuntimeWaitingInput(
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    requiredInputs: unknown[],
    reason?: string
  ): Promise<void> {
    await this.executionFailureService.enterRuntimeWaitingInput(
      executionId,
      runtimeSessionId,
      stepId,
      requiredInputs,
      reason,
      this.getFailureHooks()
    );
  }

  private async enterPendingApprovalFromRuntimeStep(
    executionId: string,
    reason: string
  ): Promise<void> {
    await this.executionFailureService.enterPendingApprovalFromRuntimeStep(
      executionId,
      reason,
      this.getFailureHooks()
    );
  }

  private async failExecutionFromRuntimeStep(input: {
    executionId: string;
    stepId: string;
    failureReason: string;
    failureCode: string;
    runtimeSessionId?: string;
  }): Promise<void> {
    await this.prisma.execution.update({
      where: { id: input.executionId },
      data: {
        failureReason: input.failureReason,
        failureCode: input.failureCode,
      },
    });
    await this.skipPendingSteps(
      input.executionId,
      input.stepId,
      'Execution failed before remaining planned steps were executed'
    );
    await this.updateStatus(input.executionId, EXECUTION_STATUS.FAILED);
    if (input.runtimeSessionId) {
      await this.closeRuntimeSessionQuietly(
        input.runtimeSessionId,
        input.executionId,
        'runtime_step_failed'
      );
    }
  }

  private async enterWaitingInput(
    execution: Record<string, unknown>,
    stepId: string
  ): Promise<void> {
    await this.executionFailureService.enterWaitingInput(execution, stepId, this.getFailureHooks());
  }

  private async skipPendingSteps(
    executionId: string,
    currentStepId: string,
    reason: string
  ): Promise<void> {
    await this.executionFailureService.skipPendingSteps(
      executionId,
      currentStepId,
      reason,
      this.getFailureHooks()
    );
  }

  private async syncPhaseAfterStepResult(
    executionId: string,
    runtimeSessionId: string,
    result: RuntimeStepInvokeResult,
    phaseMetadata?: ExecutionStepPhaseMetadata,
    step?: Record<string, unknown> | null
  ): Promise<void> {
    await this.executionPhaseSyncService.syncPhaseAfterStepResult(
      executionId,
      runtimeSessionId,
      result,
      phaseMetadata,
      step
    );
  }

  private async completeActivePhasesOnExecutionSuccess(
    executionId: string,
    runtimeSessionId: string
  ): Promise<void> {
    await this.executionPhaseSyncService.completeActivePhasesOnExecutionSuccess(
      executionId,
      runtimeSessionId
    );
  }

  private async syncWorkflowActivityPhasesAfterSkillResult(
    executionId: string,
    runtimeSessionId: string,
    capabilityId: string,
    result: RuntimeStepInvokeResult,
    phaseMetadata?: ExecutionStepPhaseMetadata
  ): Promise<void> {
    const phaseSyncService = this.executionPhaseSyncService as unknown as {
      syncWorkflowActivityPhasesAfterSkillResult: (
        executionId: string,
        runtimeSessionId: string,
        capabilityId: string,
        result: RuntimeStepInvokeResult,
        phaseMetadata?: ExecutionStepPhaseMetadata
      ) => Promise<void>;
      loadWorkflowActivityPhaseDefinitions?: (
        capabilityId: string,
        parentPhaseKey: string
      ) => Promise<unknown>;
    };
    const currentLoader = this.loadWorkflowActivityPhaseDefinitions;
    const prototypeLoader = ExecutionService.prototype.loadWorkflowActivityPhaseDefinitions;
    const shouldBridgeLoader = currentLoader !== prototypeLoader;
    const originalLoader = phaseSyncService.loadWorkflowActivityPhaseDefinitions;
    if (shouldBridgeLoader) {
      phaseSyncService.loadWorkflowActivityPhaseDefinitions = (
        targetCapabilityId: string,
        parentPhaseKey: string
      ) => currentLoader.call(this, targetCapabilityId, parentPhaseKey);
    }

    try {
      await phaseSyncService.syncWorkflowActivityPhasesAfterSkillResult(
        executionId,
        runtimeSessionId,
        capabilityId,
        result,
        phaseMetadata
      );
    } finally {
      if (shouldBridgeLoader) {
        phaseSyncService.loadWorkflowActivityPhaseDefinitions = originalLoader;
      }
    }
  }

  private async loadWorkflowActivityPhaseDefinitions(capabilityId: string, parentPhaseKey: string) {
    return (this.executionPhaseSyncService as any).loadWorkflowActivityPhaseDefinitions(
      capabilityId,
      parentPhaseKey
    );
  }

  async delete(
    id: string,
    userId: string,
    requester?: RequestUserContext
  ): Promise<{ success: boolean }> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution with ID "${id}" not found`);
    }

    this.ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    await this.executionStepService.deleteByExecutionId(id);

    await this.prisma.executionEvent.deleteMany({
      where: { executionId: id },
    });

    await this.prisma.execution.delete({
      where: { id },
    });

    this.logger.log(`Execution ${id} deleted by user ${userId}`);
    return { success: true };
  }

  async cleanupBeforeDate(
    beforeDate: string,
    userId: string,
    requester?: RequestUserContext
  ): Promise<{ success: boolean; deletedCount: number; beforeDate: string }> {
    const cutoff = this.parseCleanupCutoff(beforeDate);
    const effectiveRequester = requester || { id: userId };
    const where: Prisma.ExecutionWhereInput = {
      createdAt: { lt: cutoff },
    };

    if (effectiveRequester.role !== 'admin') {
      where.createdBy = effectiveRequester.id;
    }

    const executions = await this.prisma.execution.findMany({
      where,
      select: { id: true },
    });

    const MAX_CLEANUP_LIMIT = Number(process.env.MAX_CLEANUP_LIMIT || 1000);
    if (executions.length > MAX_CLEANUP_LIMIT) {
      throw new BadRequestException(
        `Cannot cleanup more than ${MAX_CLEANUP_LIMIT} executions in a single operation. ` +
          `Found ${executions.length} matching records. Please refine the date cutoff.`
      );
    }

    if (executions.length === 0) {
      return {
        success: true,
        deletedCount: 0,
        beforeDate,
      };
    }

    const executionIds = executions.map((execution) => execution.id);

    await this.prisma.$transaction([
      this.prisma.executionStep.deleteMany({
        where: { executionId: { in: executionIds } },
      }),
      this.prisma.executionEvent.deleteMany({
        where: { executionId: { in: executionIds } },
      }),
      this.prisma.execution.deleteMany({
        where: { id: { in: executionIds } },
      }),
    ]);

    this.logger.log(
      `Deleted ${executionIds.length} executions before ${beforeDate} by user ${userId}`
    );
    return {
      success: true,
      deletedCount: executionIds.length,
      beforeDate,
    };
  }

  private parseCleanupCutoff(beforeDate: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(beforeDate)) {
      throw new BadRequestException('beforeDate must use YYYY-MM-DD format');
    }

    const cutoff = new Date(`${beforeDate}T00:00:00`);
    if (Number.isNaN(cutoff.getTime())) {
      throw new BadRequestException('beforeDate is invalid');
    }

    return cutoff;
  }
}
