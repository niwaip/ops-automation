import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { Subject, filter } from 'rxjs';
import { APPROVAL_STATUS } from './contracts/approval-status';
import { EXECUTION_STATUS, ExecutionStatus } from './contracts/execution-status';
import { EXECUTION_EVENT_TYPE } from './contracts/execution-event-type';
import { EXECUTION_STEP_STATUS } from './contracts/execution-step-status';
import { CreateExecutionEventOptions, ExecutionEventService, ExecutionStreamEventPayload } from './execution-event.service';
import { ExecutionPhaseService } from './execution-phase.service';
import { mapExecutionPhaseToDto, mapExecutionStepToDto, mapExecutionToDto } from './execution.mapper';
import { buildPlannedExecutionSteps } from './execution-plan-step.builder';
import { canTransitionExecutionStatus, isTerminalExecutionStatus } from './execution-transition-policy';
import { ExecutionStateService } from './execution-state.service';
import { ExecutionStepService } from './execution-step.service';
import {
  CreateExecutionDto,
  ExecutionDto,
  ExecutionStepDto,
  TakeoverExecutionDto,
  ResumeExecutionDto,
  ReleaseHumanControlDto,
  ReconcilePhaseTakeoverDto,
  ListExecutionsDto,
  RuntimeSessionSummaryDto,
  SubmitInputDto,
  ApprovalDecisionDto,
  UpdateWorkflowActivityProgressDto,
} from './execution.dto';
import axios from 'axios';
import {
  getAiOrchestratorUrl,
  getAuthServiceUrl,
  getSessionBrokerUrl,
} from '../../config/service-endpoints';
import { RuntimePhaseInvokeResult, RuntimeStepInvokeResult } from './runtime-adapter.interface';
import { RuntimeExecutionOrchestrator } from './runtime-execution.orchestrator';
import { RuntimeResultInterpreter } from './runtime-result.interpreter';
import { RuntimeStepRequestFactory } from './runtime-step-request.factory';
import { BrowserPhaseExecutor, BrowserPhaseCommand } from './browser-phase.executor';
import type { BrowserPhaseRecoveryPolicy } from './browser-phase-recovery.planner';
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

interface PlannerRequiredInput {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  value?: unknown;
  missing: boolean;
  source: 'user_input' | 'default' | 'unresolved';
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

interface ExecutionStepPhaseMetadata {
  phaseKey: string;
  phaseName: string;
  phaseType: string;
}

interface WorkflowActivityPhaseDefinition {
  phaseKey: string;
  phaseName: string;
  phaseType: string;
  activityName?: string;
  parentPhaseKey: string;
  order: number;
}

interface ExecutionStepBrowserPhaseConfig {
  commands: BrowserPhaseCommand[];
  precheck?: BrowserPhaseCheck;
  postcheck?: BrowserPhaseCheck;
  recoveryPolicy?: BrowserPhaseRecoveryPolicy;
}

interface ExecutionPhaseRecord {
  id: string;
  execution_id?: string;
  phase_key?: string;
  phase_name?: string;
  phase_type?: string;
  status?: string;
  attempt?: number;
  runtime_session_id?: string | null;
  input_json?: Record<string, unknown> | null;
  output_json?: Record<string, unknown> | null;
  postcheck_json?: Record<string, unknown> | null;
  error_code?: string | null;
  error_message?: string | null;
}

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);
  private readonly sessionBrokerUrl = getSessionBrokerUrl();
  private readonly authServiceUrl = getAuthServiceUrl();
  private readonly aiOrchestratorUrl = getAiOrchestratorUrl();

  private readonly eventSubject = new Subject<ExecutionStreamEventPayload>();
  private readonly executionEventService: ExecutionEventService;
  private readonly executionPhaseService: ExecutionPhaseService;
  private readonly executionStateService: ExecutionStateService;
  private readonly executionStepService: ExecutionStepService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runtimeExecutionOrchestrator: RuntimeExecutionOrchestrator,
    private readonly runtimeResultInterpreter: RuntimeResultInterpreter,
    private readonly runtimeStepRequestFactory: RuntimeStepRequestFactory,
    executionEventService?: ExecutionEventService,
    executionPhaseService?: ExecutionPhaseService,
    executionStateService?: ExecutionStateService,
    executionStepService?: ExecutionStepService,
    private readonly browserPhaseExecutor?: BrowserPhaseExecutor,
  ) {
    this.executionEventService = executionEventService || new ExecutionEventService(prisma);
    this.executionPhaseService = executionPhaseService || new ExecutionPhaseService(prisma);
    this.executionStateService = executionStateService || new ExecutionStateService(
      prisma,
      this.executionEventService,
    );
    this.executionStepService = executionStepService || new ExecutionStepService(prisma);
  }

  subscribeToEvents(executionId: string, callback: (event: ExecutionStreamEventPayload) => void) {
    const subscription = this.eventSubject
      .pipe(filter((e) => e.executionId === executionId))
      .subscribe(callback);
    return subscription;
  }

  private async createEvent(
    executionId: string,
    eventType: typeof EXECUTION_EVENT_TYPE[keyof typeof EXECUTION_EVENT_TYPE],
    payload: any,
    options: CreateExecutionEventOptions = {},
  ): Promise<void> {
    const event = await this.executionEventService.createEvent(
      executionId,
      eventType,
      this.asJsonValue(payload),
      options,
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
    idempotencyKey: string,
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
      idempotencyKey,
    );

    const executionId = rows[0]?.execution_id;
    return typeof executionId === 'string' && executionId.trim().length > 0
      ? executionId
      : undefined;
  }

  async create(
    userId: string,
    dto: CreateExecutionDto,
    options?: { authToken?: string },
  ): Promise<ExecutionDto> {
    const resolvedSkillId = dto.capabilityId || dto.skillId;
    const resolvedSkillVersion = dto.capabilityVersion || dto.skillVersion;

    if (!resolvedSkillId) {
      throw new BadRequestException('skillId or capabilityId is required');
    }

    if (options?.authToken) {
      await this.assertSkillAccessibleByUser(resolvedSkillId, options.authToken);
    }

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
        resolvedDto.idempotencyKey,
      );
      if (existingExecutionId) {
        this.logger.log(
          `Reusing existing execution ${existingExecutionId} for idempotency key ${resolvedDto.idempotencyKey}`,
        );
        return this.getById(existingExecutionId);
      }
    }

    const providedPlanDraft =
      resolvedDto.planDraft
      && typeof resolvedDto.planDraft === 'object'
      && !Array.isArray(resolvedDto.planDraft)
        ? (resolvedDto.planDraft as unknown as PlannerPlanDraft)
        : undefined;
    const generatedPlanDraft = providedPlanDraft
      || await this.generatePlanDraft(userId, resolvedDto, options?.authToken);
    const reconciledPlanDraft = this.reconcilePlanDraftWithInput(generatedPlanDraft, resolvedDto.input);
    const planDraft = await this.rewriteBrowserRecordingPlanDraftWithActivities(
      reconciledPlanDraft,
      resolvedSkillId,
      resolvedDto.input,
    );
    const plannedCapabilityId = planDraft?.skill_match?.skill_id;
    const effectiveSkillId = plannedCapabilityId || resolvedSkillId;
    const effectiveSkillVersion = resolvedSkillVersion;
    const normalizedInput = this.buildNormalizedInput(resolvedDto, planDraft);

    // 注入 usage 到 normalizedInput 中以便持久化
    const usage = planDraft?.usage || resolvedDto.usage;
    if (usage) {
      (normalizedInput as any).__usage = usage;
    }

    const execution = await this.prisma.execution.create({
      data: {
        createdBy: userId,
        skillId: effectiveSkillId,
        skillVersion: effectiveSkillVersion,
        status: planDraft?.risk_summary.requires_human_review
          ? EXECUTION_STATUS.PENDING_APPROVAL
          : EXECUTION_STATUS.QUEUED,
        runtimeType: resolvedDto.runtimeType || 'browser',
        inputJson: this.asJsonValue(resolvedDto.input),
        normalizedInputJson: this.asJsonValue(normalizedInput),
        riskLevel: this.mapPlannerRiskLevel(planDraft),
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
      planDraft?.required_inputs?.some((item) => item.required && item.missing),
    );

    this.logger.log(`Execution created: ${execution.id}`);

    if (!execution.requiresApproval) {
      if (hasMissingRequiredInputs) {
        const waitingInputStep = await this.executionStepService.findPendingInputCollectionStep(execution.id);

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

    if (execution.runtimeType !== 'browser') {
      await this.createEvent(execution.id, EXECUTION_EVENT_TYPE.RUNTIME_SKIPPED, {
        runtimeType: execution.runtimeType,
        mode: 'non_browser_runtime',
      });
      await this.advanceExecutionFlow(execution.id, execution.id);
      this.logger.log(
        `Skipped browser runtime allocation for execution ${executionId} (runtime: ${execution.runtimeType})`,
      );
      return;
    }

    // Allocate runtime session via new RuntimeSession API
    try {
      this.logger.log(`Allocating runtime session for execution ${executionId} (type: ${execution.runtimeType})`);
      const runtimeResponse = await axios.post<RuntimeSessionSummaryDto>(`${this.sessionBrokerUrl}/runtime-sessions`, {
        userId: execution.createdBy,
        executionId: execution.id,
        runtimeType: execution.runtimeType,
      });

      const runtimeSession = runtimeResponse.data;
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
    requester?: RequestUserContext,
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
        return String(left.phaseKey || left.phase_key || '').localeCompare(String(right.phaseKey || right.phase_key || ''));
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
        dto.activityName
        && this.readNonEmptyString(phase.phaseName, phase.phase_name) === dto.activityName,
      );
    });

    if (!currentPhase) {
      this.logger.warn(
        `Workflow activity progress ignored for execution ${executionId}: parentPhaseKey=${dto.parentPhaseKey}, activityOrder=${dto.activityOrder ?? '-'}, activityName=${dto.activityName ?? '-'}`,
      );
      return;
    }

    const currentPhaseKey = this.readNonEmptyString(currentPhase.phaseKey, currentPhase.phase_key);
    const currentPhaseName = this.readNonEmptyString(currentPhase.phaseName, currentPhase.phase_name);
    const currentPhaseType = this.readNonEmptyString(currentPhase.phaseType, currentPhase.phase_type) || 'workflow_activity';
    const currentAttempt = Number(currentPhase.attempt || 1);
    const currentInput = this.readRecord(currentPhase.input, currentPhase.input_json);
    const currentOutput = this.readRecord(currentPhase.output, currentPhase.output_json);
    const currentStartedAt = this.toNullableDate(currentPhase.startedAt || currentPhase.started_at);
    const currentOrder = Number(currentInput?.order || dto.activityOrder || 0);
    const runtimeSessionId =
      dto.runtimeSessionId
      || this.readNonEmptyString(currentPhase.runtimeSessionId, currentPhase.runtime_session_id)
      || null;

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
      if (phaseOrder > 0 && currentOrder > 0 && phaseOrder < currentOrder && phaseStatus === 'running') {
        await this.executionPhaseService.createOrUpdatePhase({
          executionId,
          phaseKey,
          phaseName: this.readNonEmptyString(phase.phaseName, phase.phase_name) || phaseKey,
          phaseType: this.readNonEmptyString(phase.phaseType, phase.phase_type) || 'workflow_activity',
          status: 'completed',
          attempt: Number(phase.attempt || 1),
          runtimeSessionId:
            runtimeSessionId
            || this.readNonEmptyString(phase.runtimeSessionId, phase.runtime_session_id)
            || null,
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

  async takeover(id: string, userId: string, dto: TakeoverExecutionDto, requester?: RequestUserContext): Promise<ExecutionDto> {
    const execution = await this.getExecutionOrThrow(id);
    this.ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (!canTransitionExecutionStatus(execution.status as ExecutionStatus, EXECUTION_STATUS.HUMAN_CONTROL)) {
      throw new BadRequestException(`Cannot takeover from status ${execution.status}`);
    }

    const currentPhase = await this.getCurrentPhaseRecord(
      id,
      (execution as unknown as Record<string, unknown>).currentPhaseKey as string | null | undefined,
    );
    await this.enterHumanControl(id, dto.reason, currentPhase?.runtime_session_id);

    if (currentPhase) {
      await this.executionPhaseService.markWaitingTakeover(id, currentPhase.phase_key!, {
        phaseName: currentPhase.phase_name || currentPhase.phase_key!,
        phaseType: currentPhase.phase_type || 'workflow_execution',
        attempt: currentPhase.attempt || 1,
        runtimeSessionId: currentPhase.runtime_session_id || null,
        output: currentPhase.output_json || null,
        postcheck: currentPhase.postcheck_json || null,
        recoveryDecision: null,
        errorCode: currentPhase.error_code || null,
        errorMessage: currentPhase.error_message || dto.reason || null,
      });
      await this.executionPhaseService.createTakeoverRecord({
        executionId: id,
        phaseId: currentPhase.id,
        runtimeSessionId: currentPhase.runtime_session_id || null,
        reason: dto.reason,
        requestedBy: this.normalizeTakeoverRequestedBy(userId),
      });
    }

    await this.createEvent(id, EXECUTION_EVENT_TYPE.EXECUTION_TAKEOVER_REQUESTED, {
      userId,
      reason: dto.reason,
      ...(currentPhase?.phase_key ? { phaseKey: currentPhase.phase_key } : {}),
    });

    this.logger.log(`Execution ${id} entered ${EXECUTION_STATUS.HUMAN_CONTROL}`);
    return this.getById(id, requester || { id: userId });
  }

  async resume(id: string, userId: string, dto: ResumeExecutionDto, requester?: RequestUserContext): Promise<ExecutionDto> {
    const execution = await this.getExecutionOrThrow(id);
    this.ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (execution.status !== EXECUTION_STATUS.HUMAN_CONTROL) {
      throw new BadRequestException(`Execution ${id} is not in ${EXECUTION_STATUS.HUMAN_CONTROL} status`);
    }

    const currentPhase = await this.getCurrentPhaseRecord(
      id,
      (execution as unknown as Record<string, unknown>).currentPhaseKey as string | null | undefined,
    );
    if (currentPhase?.id) {
      await this.resolvePhaseTakeoverAndMarkRunning(id, currentPhase, userId, dto.comment);
    }

    const runtimeSessionId = await this.exitHumanControlAndResume(id, dto.stepId, currentPhase?.runtime_session_id);
    await this.createEvent(id, EXECUTION_EVENT_TYPE.EXECUTION_RESUMED, {
      userId,
      stepId: dto.stepId,
      comment: dto.comment,
      ...(currentPhase?.phase_key ? { phaseKey: currentPhase.phase_key } : {}),
    });

    if (runtimeSessionId) {
      this.advanceExecutionFlow(id, runtimeSessionId).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to asynchronously resume execution ${id}: ${message}`);
      });
    }

    this.logger.log(`Execution ${id} resumed`);
    return this.getById(id, requester || { id: userId });
  }

  async releaseHumanControl(id: string, userId: string, dto: ReleaseHumanControlDto, requester?: RequestUserContext): Promise<ExecutionDto> {
    return this.resume(id, userId, dto, requester);
  }

  async takeoverPhase(
    executionId: string,
    phaseKey: string,
    userId: string,
    dto: TakeoverExecutionDto,
    requester?: RequestUserContext,
  ): Promise<ExecutionDto> {
    const execution = await this.getExecutionOrThrow(executionId);
    this.ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (isTerminalExecutionStatus(execution.status as ExecutionStatus)) {
      throw new BadRequestException(`Cannot takeover phase from terminal execution status ${execution.status}`);
    }

    const phase = await this.requirePhaseRecord(executionId, phaseKey);
    if (phase.status === 'completed') {
      throw new BadRequestException(`Phase ${phaseKey} is already completed`);
    }

    await this.enterHumanControl(executionId, dto.reason, phase.runtime_session_id);
    await this.executionPhaseService.markWaitingTakeover(executionId, phase.phase_key!, {
      phaseName: phase.phase_name || phase.phase_key!,
      phaseType: phase.phase_type || 'workflow_execution',
      attempt: phase.attempt || 1,
      runtimeSessionId: phase.runtime_session_id || null,
      output: phase.output_json || null,
      postcheck: phase.postcheck_json || null,
      recoveryDecision: null,
      errorCode: phase.error_code || null,
      errorMessage: phase.error_message || dto.reason || null,
    });
    await this.executionPhaseService.createTakeoverRecord({
      executionId,
      phaseId: phase.id,
      runtimeSessionId: phase.runtime_session_id || null,
      reason: dto.reason,
      requestedBy: this.normalizeTakeoverRequestedBy(userId),
    });
    await this.createEvent(executionId, EXECUTION_EVENT_TYPE.EXECUTION_TAKEOVER_REQUESTED, {
      userId,
      reason: dto.reason,
      phaseKey,
    });

    return this.getById(executionId, requester || { id: userId });
  }

  async reconcilePhaseTakeover(
    executionId: string,
    phaseKey: string,
    userId: string,
    dto: ReconcilePhaseTakeoverDto,
    requester?: RequestUserContext,
  ): Promise<ExecutionDto> {
    const execution = await this.getExecutionOrThrow(executionId);
    this.ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (execution.status !== EXECUTION_STATUS.HUMAN_CONTROL) {
      throw new BadRequestException(`Execution ${executionId} is not in ${EXECUTION_STATUS.HUMAN_CONTROL} status`);
    }

    const phase = await this.requirePhaseRecord(executionId, phaseKey);
    await this.executionPhaseService.markResumable(executionId, phase.phase_key!, {
      phaseName: phase.phase_name || phase.phase_key!,
      phaseType: phase.phase_type || 'workflow_execution',
      attempt: phase.attempt || 1,
      runtimeSessionId: phase.runtime_session_id || null,
      output: phase.output_json || null,
      postcheck: phase.postcheck_json || null,
      recoveryDecision: {
        reconciledBy: dto.resolvedBy || userId,
        comment: dto.comment || null,
        patch: dto.patch || null,
      },
      errorCode: null,
      errorMessage: null,
    });
    await this.executionPhaseService.resolveTakeoverRecord({
      executionId,
      phaseId: phase.id,
      resolvedBy: dto.resolvedBy || userId,
      resolutionNote: dto.comment || null,
      status: 'resolved',
    });

    return this.getById(executionId, requester || { id: userId });
  }

  async resumePhaseTakeover(
    executionId: string,
    phaseKey: string,
    userId: string,
    dto: ResumeExecutionDto,
    requester?: RequestUserContext,
  ): Promise<ExecutionDto> {
    const execution = await this.getExecutionOrThrow(executionId);
    this.ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (execution.status !== EXECUTION_STATUS.HUMAN_CONTROL) {
      throw new BadRequestException(`Execution ${executionId} is not in ${EXECUTION_STATUS.HUMAN_CONTROL} status`);
    }

    const phase = await this.requirePhaseRecord(executionId, phaseKey);
    await this.resolvePhaseTakeoverAndMarkRunning(executionId, phase, userId, dto.comment);
    const runtimeSessionId = await this.exitHumanControlAndResume(executionId, dto.stepId, phase.runtime_session_id);
    await this.createEvent(executionId, EXECUTION_EVENT_TYPE.EXECUTION_RESUMED, {
      userId,
      stepId: dto.stepId,
      comment: dto.comment,
      phaseKey,
    });

    if (runtimeSessionId) {
      this.advanceExecutionFlow(executionId, runtimeSessionId).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to asynchronously resume execution ${executionId}: ${message}`);
      });
    }

    return this.getById(executionId, requester || { id: userId });
  }

  async approve(id: string, userId: string, dto: ApprovalDecisionDto, requester?: RequestUserContext): Promise<ExecutionDto> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    this.ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (execution.status !== EXECUTION_STATUS.PENDING_APPROVAL) {
      throw new BadRequestException(`Execution ${id} is not in ${EXECUTION_STATUS.PENDING_APPROVAL} status`);
    }

    await this.prisma.execution.update({
      where: { id },
      data: {
        approvalStatus: APPROVAL_STATUS.APPROVED,
      },
    });
    await this.updateStatus(id, EXECUTION_STATUS.QUEUED);
    await this.createEvent(id, EXECUTION_EVENT_TYPE.EXECUTION_APPROVED, {
      userId,
      decidedBy: dto.decidedBy || userId,
      comment: dto.comment,
    });

    this.startExecution(id).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to start approved execution ${id}: ${msg}`);
    });

    this.logger.log(`Execution ${id} approved`);
    return this.getById(id, requester || { id: userId });
  }

  async reject(id: string, userId: string, dto: ApprovalDecisionDto, requester?: RequestUserContext): Promise<ExecutionDto> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    this.ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (execution.status !== EXECUTION_STATUS.PENDING_APPROVAL) {
      throw new BadRequestException(`Execution ${id} is not in ${EXECUTION_STATUS.PENDING_APPROVAL} status`);
    }

    await this.prisma.execution.update({
      where: { id },
      data: {
        approvalStatus: APPROVAL_STATUS.REJECTED,
        failureReason: dto.comment || 'Execution rejected during approval',
        failureCode: 'APPROVAL_REJECTED',
      },
    });
    await this.updateStatus(id, EXECUTION_STATUS.CANCELLED);
    await this.createEvent(id, EXECUTION_EVENT_TYPE.EXECUTION_REJECTED, {
      userId,
      decidedBy: dto.decidedBy || userId,
      comment: dto.comment,
    });

    this.logger.log(`Execution ${id} rejected`);
    return this.getById(id, requester || { id: userId });
  }

  async submitInputAndResume(id: string, userId: string, dto: SubmitInputDto, requester?: RequestUserContext): Promise<ExecutionDto> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    this.ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (execution.status !== EXECUTION_STATUS.WAITING_INPUT) {
      throw new BadRequestException(`Execution ${id} is not in ${EXECUTION_STATUS.WAITING_INPUT} status`);
    }

    const step = await this.executionStepService.getById(dto.stepId);

    if (!step || step.executionId !== id || step.type !== 'input_collection') {
      throw new BadRequestException('Invalid step ID for input submission');
    }

    const normalized = (execution.normalizedInputJson as Record<string, unknown>) || {};
    const requiredInputs = this.getRequiredInputs(execution);
    const missingInputs = requiredInputs.filter((item) => item?.missing);

    if (missingInputs.length === 0) {
      throw new BadRequestException(`Execution ${id} has no missing input to submit`);
    }

    const submittedKeys = Object.keys(dto.input || {});
    if (submittedKeys.length === 0) {
      throw new BadRequestException('Input payload must contain at least one field');
    }

    const allowedKeys = new Set(missingInputs.map((item) => item.name));
    const invalidKeys = submittedKeys.filter((key) => !allowedKeys.has(key));
    if (invalidKeys.length > 0) {
      throw new BadRequestException(`Unexpected input fields: ${invalidKeys.join(', ')}`);
    }

    const normalizedSubmittedInput = Object.fromEntries(
      missingInputs.map((item) => [item.name, this.normalizeSubmittedInputValue(dto.input?.[item.name], item.type)]),
    );

    const updatedRequiredInputs = requiredInputs.map((item) => {
      if (!submittedKeys.includes(item.name)) {
        return item;
      }

      const normalizedValue = normalizedSubmittedInput[item.name];
      if (!this.hasMeaningfulSubmittedInputValue(normalizedValue)) {
        return {
          ...item,
          value: undefined,
          missing: true,
          source: 'unresolved' as const,
        };
      }

      return {
        ...item,
        value: normalizedValue,
        missing: false,
        source: 'user_input' as const,
      };
    });

    const remainingMissingInputs = updatedRequiredInputs.filter((item) => item.required && item.missing);
    const isFullySubmitted = remainingMissingInputs.length === 0;
    const currentUsage = normalized.__usage as unknown as LLMUsage | undefined;
    const submittedUsage = dto.usage as unknown as LLMUsage | undefined;
    const totalUsage = this.sumUsage(currentUsage, submittedUsage);

    const normalizedInputData =
      normalized.input && typeof normalized.input === 'object'
        ? (normalized.input as Record<string, unknown>)
        : {};
    const updatedSemantic = this.reconcilePlanSemantic(
      normalized.semantic && typeof normalized.semantic === 'object' && !Array.isArray(normalized.semantic)
        ? normalized.semantic as PlannerSemantic
        : undefined,
      updatedRequiredInputs,
    );
    const updatedNormalized = {
      ...normalized,
      ...(totalUsage ? { __usage: totalUsage } : {}),
      ...normalizedSubmittedInput,
      input: {
        ...normalizedInputData,
        ...normalizedSubmittedInput,
      },
      requiredInputs: updatedRequiredInputs,
      ...(updatedSemantic ? { semantic: updatedSemantic } : {}),
    };

    await this.prisma.$transaction([
      this.prisma.executionStep.update({
        where: { id: dto.stepId },
        data: {
          status: isFullySubmitted ? EXECUTION_STEP_STATUS.SUCCEEDED : EXECUTION_STEP_STATUS.WAITING_INPUT,
          inputJson: this.asJsonValue({
            requiredInputs: updatedRequiredInputs.filter((item) => item.missing),
          }),
          outputJson: this.asJsonValue(normalizedSubmittedInput),
          endedAt: isFullySubmitted ? new Date() : null,
        },
      }),
      this.prisma.execution.update({
        where: { id },
        data: {
          normalizedInputJson: this.asJsonValue(updatedNormalized),
          status: isFullySubmitted ? EXECUTION_STATUS.QUEUED : EXECUTION_STATUS.WAITING_INPUT,
        },
      }),
    ]);

    const runtimeSession = await this.prisma.runtimeSession.findFirst({
      where: { executionId: id },
      orderBy: { createdAt: 'desc' },
    });

    await this.createEvent(
      id,
      isFullySubmitted
        ? EXECUTION_EVENT_TYPE.EXECUTION_INPUT_SUBMITTED
        : EXECUTION_EVENT_TYPE.EXECUTION_PARTIAL_INPUT_SUBMITTED,
      {
      stepId: dto.stepId,
      input: normalizedSubmittedInput,
      remainingMissing: remainingMissingInputs.map(i => i.name),
      },
    );

    if (!isFullySubmitted) {
      this.logger.log(`Partial input submitted for execution ${id}; remaining: ${remainingMissingInputs.length}`);
      return this.getById(id, requester || { id: userId });
    }

    if (!runtimeSession) {
      await this.startExecution(id);
      this.logger.log(`Input submitted for execution ${id}; runtime session will be allocated on start`);
      return this.getById(id, requester || { id: userId });
    }

    await this.updateStatus(id, EXECUTION_STATUS.RUNNING);

    await this.createEvent(
      id,
      EXECUTION_EVENT_TYPE.EXECUTION_RESUMED,
      {
        userId,
        reason: 'input_submitted',
      },
      {
        runtimeSessionId: runtimeSession.id,
        stepId: dto.stepId,
      },
    );

    this.advanceExecutionFlow(id, runtimeSession.id).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to asynchronously resume execution ${id}: ${message}`);
    });
    this.logger.log(`Input submitted and execution ${id} resumed from step ${dto.stepId}`);
    return this.getById(id, requester || { id: userId });
  }
  async cancel(id: string, userId: string, requester?: RequestUserContext): Promise<ExecutionDto> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    this.ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (!canTransitionExecutionStatus(execution.status as ExecutionStatus, EXECUTION_STATUS.CANCELLED)) {
      throw new BadRequestException(`Cannot cancel from status ${execution.status}`);
    }

    await this.updateStatus(id, EXECUTION_STATUS.CANCELLED);

    // Close runtime session
    const runtimeSession = await this.prisma.runtimeSession.findFirst({
      where: { executionId: id },
    });

    if (runtimeSession) {
      try {
        // Call new RuntimeSession API (state update is handled by runtime-session service)
        await axios.post(`${this.sessionBrokerUrl}/runtime-sessions/${runtimeSession.id}/close`, {});
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
    requester?: RequestUserContext,
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

    const runtimeSessions = executions.length > 0
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
      data: executions.map((execution) => this.toDto({
        ...execution,
        runtimeSessionId: runtimeSessionIdByExecutionId.get(execution.id) || null,
      })),
      total,
      page,
      pageSize,
    };
  }

  private async updateStatus(id: string, newStatus: ExecutionStatus): Promise<void> {
    const event = await this.executionStateService.updateStatus(id, newStatus);
    this.eventSubject.next(event);
  }

  private async closeRuntimeSessionQuietly(
    runtimeSessionId: string,
    executionId: string,
    reason: string,
  ): Promise<void> {
    try {
      await axios.post(`${this.sessionBrokerUrl}/runtime-sessions/${runtimeSessionId}/close`, {});
      this.logger.log(
        `Runtime session ${runtimeSessionId} closed for execution ${executionId} (${reason})`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Close should be best-effort here to avoid breaking terminal state transitions.
      this.logger.warn(
        `Failed to close runtime session ${runtimeSessionId} for execution ${executionId} (${reason}): ${errorMessage}`,
      );
    }
  }

  private async freezeRuntimeSessionQuietly(
    runtimeSessionId: string | null | undefined,
    executionId: string,
    reason: string,
  ): Promise<void> {
    if (!runtimeSessionId) {
      return;
    }

    try {
      await axios.post(`${this.sessionBrokerUrl}/runtime-sessions/${runtimeSessionId}/freeze`, { reason });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to freeze runtime session ${runtimeSessionId} for execution ${executionId}: ${errorMessage}`,
      );
    }
  }

  private async resumeRuntimeSessionQuietly(
    runtimeSessionId: string | null | undefined,
    executionId: string,
    stepId?: string,
  ): Promise<void> {
    if (!runtimeSessionId) {
      return;
    }

    try {
      await axios.post(`${this.sessionBrokerUrl}/runtime-sessions/${runtimeSessionId}/resume`, { stepId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to resume runtime session ${runtimeSessionId} for execution ${executionId}: ${errorMessage}`,
      );
    }
  }

  private async getExecutionOrThrow(id: string) {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    return execution;
  }

  private async resolveExecutionRuntimeSessionId(
    executionId: string,
    preferredRuntimeSessionId?: string | null,
  ): Promise<string | null> {
    if (preferredRuntimeSessionId) {
      return preferredRuntimeSessionId;
    }

    const runtimeSession = await this.prisma.runtimeSession.findFirst({
      where: { executionId },
    });
    return runtimeSession?.id || null;
  }

  private async getCurrentPhaseRecord(
    executionId: string,
    phaseKey?: string | null,
  ): Promise<ExecutionPhaseRecord | null> {
    if (!phaseKey) {
      return null;
    }

    return this.executionPhaseService.getByExecutionIdAndPhaseKey(executionId, phaseKey) as unknown as Promise<ExecutionPhaseRecord | null>;
  }

  private async requirePhaseRecord(
    executionId: string,
    phaseKey: string,
  ): Promise<ExecutionPhaseRecord> {
    const phase = await this.getCurrentPhaseRecord(executionId, phaseKey);
    if (!phase?.id) {
      throw new NotFoundException(`Execution phase ${phaseKey} not found`);
    }
    return phase;
  }

  private async enterHumanControl(
    executionId: string,
    reason: string,
    preferredRuntimeSessionId?: string | null,
  ): Promise<string | null> {
    await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        status: EXECUTION_STATUS.HUMAN_CONTROL,
        takeoverRequired: true,
        takeoverReason: reason,
      },
    });

    const runtimeSessionId = await this.resolveExecutionRuntimeSessionId(executionId, preferredRuntimeSessionId);
    await this.freezeRuntimeSessionQuietly(runtimeSessionId, executionId, reason);
    return runtimeSessionId;
  }

  private async exitHumanControlAndResume(
    executionId: string,
    stepId?: string,
    preferredRuntimeSessionId?: string | null,
  ): Promise<string | null> {
    await this.updateStatus(executionId, EXECUTION_STATUS.RUNNING);
    await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        takeoverRequired: false,
        takeoverReason: null,
      },
    });

    const runtimeSessionId = await this.resolveExecutionRuntimeSessionId(executionId, preferredRuntimeSessionId);
    await this.resumeRuntimeSessionQuietly(runtimeSessionId, executionId, stepId);
    return runtimeSessionId;
  }

  private async resolvePhaseTakeoverAndMarkRunning(
    executionId: string,
    phase: ExecutionPhaseRecord,
    userId: string,
    resolutionNote?: string,
  ): Promise<void> {
    const execution = await this.prisma.execution.findUnique({
      where: { id: executionId },
      select: { currentStepId: true },
    });
    if (execution?.currentStepId) {
      const currentStep = await this.executionStepService.getById(execution.currentStepId);
      const currentStepPhase = this.extractStepPhaseMetadata(currentStep as Record<string, unknown> | null | undefined);
      if (
        currentStep
        && currentStep.status === EXECUTION_STEP_STATUS.FAILED
        && currentStepPhase?.phaseKey === phase.phase_key
      ) {
        await this.executionStepService.requeueFailedStep(currentStep.id);
      }
    }

    await this.executionPhaseService.resolveTakeoverRecord({
      executionId,
      phaseId: phase.id,
      resolvedBy: userId,
      resolutionNote: resolutionNote || null,
      status: 'resolved',
    });
    await this.executionPhaseService.markRunning(executionId, phase.phase_key!, {
      phaseName: phase.phase_name || phase.phase_key!,
      phaseType: phase.phase_type || 'workflow_execution',
      attempt: phase.attempt || 1,
      runtimeSessionId: phase.runtime_session_id || null,
      input: phase.input_json || null,
      precheck: null,
    });
  }

  private async bootstrapBrowserExecution(
    execution: Record<string, unknown>,
    runtimeSessionId: string,
  ): Promise<void> {
    if (execution.runtimeType !== 'browser') {
      await this.advanceExecutionFlow(execution.id as string, runtimeSessionId);
      return;
    }

    const normalizedInput = execution.normalizedInputJson as Record<string, unknown> | undefined;
    const input = execution.inputJson as Record<string, unknown> | undefined;
    const plannerMode =
      typeof normalizedInput?.plannerMode === 'string' && normalizedInput.plannerMode.trim()
        ? normalizedInput.plannerMode.trim()
        : undefined;

    if (plannerMode === 'skill') {
      this.logger.log(
        `Execution ${String(execution.id)} uses plannerMode=skill; skipping runtime bootstrap goto step`,
      );
      await this.advanceExecutionFlow(execution.id as string, runtimeSessionId);
      return;
    }

    const url = typeof normalizedInput?.url === 'string'
      ? normalizedInput.url
      : typeof input?.url === 'string'
        ? input.url
        : undefined;
    if (!url) {
      this.logger.warn(`Execution ${String(execution.id)} has no browser bootstrap url; skipping auto step`);
      await this.advanceExecutionFlow(execution.id as string, runtimeSessionId);
      return;
    }

    let step = await this.executionStepService.findPendingBrowserGotoStep(execution.id as string);
    let createdStep = false;

    if (!step) {
      step = await this.executionStepService.createBootstrapGotoStep({
        executionId: execution.id as string,
        stepIndex: 1,
        url,
      });
      createdStep = true;
    }

    await this.executionStepService.setCurrentStep(execution.id as string, step.id);

    if (createdStep) {
      await this.createEvent(execution.id as string, EXECUTION_EVENT_TYPE.STEP_CREATED, {
        runtimeSessionId,
        stepId: step.id,
        action: 'goto',
        url,
      });
    }

    await this.createEvent(execution.id as string, EXECUTION_EVENT_TYPE.STEP_STARTED, {
      runtimeSessionId,
      stepId: step.id,
      action: 'goto',
      url,
    });

    await this.executionStepService.startStep(step.id);

    const result = await this.runtimeExecutionOrchestrator.executeStep(
      this.runtimeStepRequestFactory.buildBrowserGotoRequest({
        execution,
        stepId: step.id,
        runtimeSessionId,
        url,
        executionMode: 'bootstrap',
      }),
    );

    await this.handleBrowserStepResult(execution.id as string, runtimeSessionId, step.id, result);
  }

  private async handleBrowserStepResult(
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    result: RuntimeStepInvokeResult,
    phaseMetadata?: ExecutionStepPhaseMetadata,
    step?: Record<string, unknown> | null,
  ): Promise<void> {
    await this.runtimeResultInterpreter.handleBrowserStepResult(
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
        enterWaitingInput: (requiredInputs, reason) =>
          this.enterRuntimeWaitingInput(executionId, runtimeSessionId, stepId, requiredInputs, reason),
        enterPendingApproval: (reason) =>
          this.enterPendingApprovalFromRuntimeStep(executionId, reason),
        takeover: (reason) =>
          this.takeover(
            executionId,
            'system',
            {
              reason,
            },
            {
              id: 'system',
              role: 'admin',
            },
          ).then(() => undefined),
      },
      result,
    );
    await this.syncPhaseAfterStepResult(executionId, runtimeSessionId, result, phaseMetadata, step);
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
    authToken: string,
  ): Promise<void> {
    try {
      await axios.get(`${this.authServiceUrl}/skills/${skillId}`, {
        headers: {
          Authorization: authToken,
        },
        timeout: 10000,
      });
    } catch (error) {
      const status =
        typeof error === 'object' &&
        error !== null &&
        'response' in error
          ? (error as { response?: { status?: number } }).response?.status
          : undefined;
      if (status === 403 || status === 404) {
        throw new ForbiddenException('You do not have permission to execute this skill');
      }
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Failed to verify skill permission for ${skillId}: ${message}`);
      throw new BadRequestException('Unable to verify skill permission');
    }
  }

  private ensureExecutionPermission(
    executionOwnerId: string,
    requester?: RequestUserContext,
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

  private normalizeTakeoverRequestedBy(userId?: string | null): string | null {
    const value = String(userId || '').trim();
    if (!value) {
      return null;
    }
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
      ? value
      : null;
  }

  private async generatePlanDraft(
    userId: string,
    dto: CreateExecutionDto,
    authToken?: string,
  ): Promise<PlannerPlanDraft | undefined> {
    try {
      const userInput = this.buildPlannerUserInput(dto);
      const response = await axios.post<PlannerPlanDraft>(
        `${this.aiOrchestratorUrl}/ai/plans/generate`,
        {
          user_input: userInput,
          user_id: userId,
          context: {
            skillId: dto.skillId,
            skillVersion: dto.skillVersion,
            runtimeType: dto.runtimeType || 'browser',
            executionInput: dto.input,
          },
        },
        {
          headers: authToken ? { Authorization: authToken } : undefined,
        },
      );

      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`Failed to generate plan draft for skill ${dto.skillId}: ${message}`);
      return undefined;
    }
  }

  private buildPlannerUserInput(dto: CreateExecutionDto): string {
    const input = dto.input || {};
    const candidateKeys = ['prompt', 'task', 'goal', 'instruction', 'query', 'url'];

    for (const key of candidateKeys) {
      const value = input[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return JSON.stringify({
      skillId: dto.skillId,
      runtimeType: dto.runtimeType || 'browser',
      input,
    });
  }

  private reconcilePlanDraftWithInput(
    planDraft: PlannerPlanDraft | undefined,
    input: Record<string, unknown> | undefined,
  ): PlannerPlanDraft | undefined {
    if (!planDraft || !input) {
      return planDraft;
    }

    const requiredInputs = planDraft.required_inputs.map((item) => {
      if (!item.required || !item.missing) {
        return item;
      }

      if (!Object.prototype.hasOwnProperty.call(input, item.name)) {
        return item;
      }

      const value = input[item.name];
      if (value === undefined || value === null || value === '') {
        return item;
      }

      return {
        ...item,
        value,
        missing: false,
        source: 'user_input' as const,
      };
    });

    const missingRequiredInputs = requiredInputs.filter((item) => item.required && item.missing);
    const riskItems = missingRequiredInputs.length > 0
      ? Array.from(new Set([...planDraft.risk_summary.items, 'missing_required_inputs']))
      : planDraft.risk_summary.items.filter((item) => item !== 'missing_required_inputs');
    const steps = missingRequiredInputs.length > 0
      ? planDraft.steps.map((step) => {
          if (step.kind !== 'human_input') {
            return step;
          }
          return {
            ...step,
            description: `补齐必填参数: ${missingRequiredInputs.map((item) => item.name).join(', ')}`,
          };
        })
      : planDraft.steps.filter((step) => step.kind !== 'human_input');

    return {
      ...planDraft,
      summary: missingRequiredInputs.length > 0
        ? `已识别技能 ${planDraft.skill_match?.skill_name || '目标技能'}，但仍缺少 ${missingRequiredInputs.length} 个关键输入。`
        : planDraft.skill_match
          ? `已识别技能 ${planDraft.skill_match.skill_name}，可以按计划进入执行。`
          : planDraft.summary,
      steps,
      required_inputs: requiredInputs,
      semantic: this.reconcilePlanSemantic(planDraft.semantic, requiredInputs),
      risk_summary: {
        ...planDraft.risk_summary,
        level: missingRequiredInputs.length > 0 ? planDraft.risk_summary.level : 'low',
        items: riskItems.length > 0 ? riskItems : ['no_material_risk_detected'],
      },
    };
  }

  private async rewriteBrowserRecordingPlanDraftWithActivities(
    planDraft: PlannerPlanDraft | undefined,
    fallbackCapabilityId?: string,
    input?: Record<string, unknown>,
  ): Promise<PlannerPlanDraft | undefined> {
    if (!planDraft) {
      return planDraft;
    }
    if (planDraft.steps.some((step) => Array.isArray(step.commands) && step.commands.length > 0)) {
      return planDraft;
    }

    const capabilityId = planDraft.skill_match?.skill_id || fallbackCapabilityId;
    if (!capabilityId) {
      return planDraft;
    }
    const resolvedInput = this.buildPlannerResolvedInput(planDraft, input);

    const activitySteps = await this.loadBrowserRecordingPlannerActivitySteps(capabilityId, resolvedInput);
    if (activitySteps.length === 0) {
      return planDraft;
    }

    return {
      ...planDraft,
      steps: activitySteps,
    };
  }

  private async loadBrowserRecordingPlannerActivitySteps(
    capabilityId: string,
    resolvedInput: Record<string, unknown>,
  ): Promise<PlannerPlanDraft['steps']> {
    if (!capabilityId) {
      return [];
    }
    if (typeof this.prisma.$queryRawUnsafe !== 'function') {
      return [];
    }

    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{
        source_type?: string;
        source_id?: string;
        source_payload_json?: unknown;
        workflow_dsl?: unknown;
        activity_dsl?: unknown;
      }>>(
        `
          SELECT
            cr.source_type,
            cr.source_id,
            css.source_payload_json,
            tw.workflow_dsl,
            tw.activity_dsl
          FROM capability_releases cr
          LEFT JOIN capability_source_snapshots css
            ON css.id = cr.current_source_snapshot_id
          LEFT JOIN temporal_workflows tw
            ON tw.id = cr.source_id
          WHERE cr.published_skill_id = $1::uuid
            AND cr.archived_at IS NULL
          ORDER BY cr.updated_at DESC
          LIMIT 1
        `,
        capabilityId,
      );

      const row = rows[0];
      if (!row || this.readNonEmptyString(row.source_type) !== 'browser_recording') {
        return [];
      }

      const sourcePayload = this.parseJsonRecord(row.source_payload_json);
      const workflowDsl = this.parseJsonRecord(sourcePayload?.workflowDsl)
        || this.parseJsonRecord(row.workflow_dsl);
      const activityDsl = this.parseJsonRecord(sourcePayload?.activityDsl)
        || this.parseJsonRecord(row.activity_dsl);
      if (!workflowDsl || !activityDsl) {
        return [];
      }

      const workflowSteps = this.readRecordArray(workflowDsl.steps)
        .filter((step) => this.readNonEmptyString(step.type) === 'activity');
      const browserActivities = this.readRecordArray(activityDsl.activities)
        .filter((activity) => this.readNonEmptyString(activity.handler) === 'browser');

      if (workflowSteps.length === 0 || browserActivities.length === 0) {
        return [];
      }

      const plannerSteps: PlannerPlanDraft['steps'] = [];
      workflowSteps.forEach((workflowStep, index) => {
          const activityLabel = this.readNonEmptyString(
            workflowStep.name,
            workflowStep.activityName,
            workflowStep.activityRef,
          ) || `Activity ${index + 1}`;
          const activityKey = this.readNonEmptyString(
            workflowStep.id,
            workflowStep.activityName,
            workflowStep.activityRef,
            activityLabel,
          ) || `activity_${index + 1}`;
          const activityRef = this.readNonEmptyString(workflowStep.activityRef);
          const matchingActivity = browserActivities.find((activity, activityIndex) => {
            const fn = this.readNonEmptyString(activity.fn);
            const name = this.readNonEmptyString(activity.name);
            if (activityRef && fn && (activityRef === fn || activityRef === `custom:${fn}`)) {
              return true;
            }
            if (name && (name === activityLabel || name === this.readNonEmptyString(workflowStep.activityName))) {
              return true;
            }
            return activityIndex === index;
          });
          const commands = this.mapBrowserActivityCommands(
            this.readRecordArray(this.readRecord(matchingActivity?.config)?.steps),
            index + 1,
            activityLabel,
            resolvedInput,
          );
          if (commands.length === 0) {
            return;
          }

          plannerSteps.push({
            id: activityKey,
            title: activityLabel,
            description: `执行 ${activityLabel} activity。`,
            kind: 'tool' as const,
            status: 'planned' as const,
            phase_key: `phase_${String(index + 1).padStart(2, '0')}_${this.sanitizePhaseKeyFragment(activityKey)}`,
            phase_name: activityLabel,
            phase_type: 'workflow_activity',
            commands,
            recovery_policy: {
              max_auto_retries: 1,
              allow_human_takeover: true,
            },
          });
      });
      return plannerSteps;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      this.logger.warn(`Failed to rewrite browser recording plan draft for capability ${capabilityId}: ${message}`);
      return [];
    }
  }

  private mapBrowserActivityCommands(
    steps: Record<string, unknown>[],
    activityOrder: number,
    activityName: string,
    resolvedInput: Record<string, unknown>,
  ): NonNullable<PlannerPlanDraft['steps'][number]['commands']> {
    const commands: NonNullable<PlannerPlanDraft['steps'][number]['commands']> = [];
    steps.forEach((step, index) => {
        const config = this.readRecord(step.config) || {};
        const normalizedAction = this.normalizeBrowserPhaseCommandAction(
          this.readNonEmptyString(config.action, step.action),
        );
        if (!normalizedAction) {
          return;
        }

        const input = this.buildBrowserPhaseCommandInput(
          normalizedAction,
          config,
          resolvedInput,
        );

        commands.push({
          step_id: `${this.sanitizePhaseKeyFragment(activityName)}__command_${String(index + 1).padStart(2, '0')}`,
          capability_type: 'browser.step',
          action: normalizedAction,
          input,
          metadata: {
            stepName: this.readNonEmptyString(step.name) || `${activityName} command ${index + 1}`,
            activityName,
            activityOrder,
          },
        });
    });
    return commands;
  }

  private buildBrowserPhaseCommandInput(
    action: string,
    config: Record<string, unknown>,
    resolvedInput: Record<string, unknown>,
  ): Record<string, unknown> {
    const resolve = (value: unknown): unknown => this.resolveBrowserTemplateValue(value, resolvedInput);
    const target = this.readNonEmptyString(
      resolve(config.target),
      resolve(config.selector),
      resolve(config.url),
      resolve(config.text),
    );
    const duration = this.readInteger(resolve(config.duration), resolve(config.timeoutMs));
    const selector = this.readNonEmptyString(resolve(config.selector), resolve(config.target));
    const value = this.readNonEmptyString(resolve(config.value), resolve(config.text), resolve(config.query));
    const text = this.readNonEmptyString(resolve(config.text), resolve(config.value), resolve(config.query));
    const url = this.readNonEmptyString(resolve(config.url), resolve(config.target));

    const args = (() => {
      switch (action) {
        case 'goto':
        case 'navigate':
          return Object.fromEntries(
            Object.entries({ url }).filter(([, item]) => item !== undefined),
          );
        case 'fill':
        case 'type_text':
          return Object.fromEntries(
            Object.entries({ selector, value, text }).filter(([, item]) => item !== undefined),
          );
        case 'click':
        case 'hover':
        case 'screenshot':
        case 'snapshot':
        case 'read_page':
        case 'get_text':
          return Object.fromEntries(
            Object.entries({ selector }).filter(([, item]) => item !== undefined),
          );
        case 'wait':
          return Object.fromEntries(
            Object.entries({ duration, selector }).filter(([, item]) => item !== undefined),
          );
        default:
          return Object.fromEntries(
            Object.entries({
              duration,
              selector,
              value,
              text,
              url,
            }).filter(([, item]) => item !== undefined),
          );
      }
    })();

    return {
      ...(target ? { target } : {}),
      ...(Object.keys(args).length > 0 ? { args } : {}),
    };
  }

  private resolveBrowserTemplateValue(
    value: unknown,
    resolvedInput: Record<string, unknown>,
  ): unknown {
    if (typeof value === 'string') {
      return value.replace(/\$\{([^}]+)\}/g, (_match, key) => {
        const resolved = resolvedInput[key.trim()];
        return resolved === undefined || resolved === null ? '' : String(resolved);
      });
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.resolveBrowserTemplateValue(item, resolvedInput));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, this.resolveBrowserTemplateValue(item, resolvedInput)]),
      );
    }
    return value;
  }

  private buildPlannerResolvedInput(
    planDraft: PlannerPlanDraft | undefined,
    input?: Record<string, unknown>,
  ): Record<string, unknown> {
    const plannerExtractedInput = (planDraft?.required_inputs || []).reduce<Record<string, unknown>>(
      (acc, item) => {
        if (!item || item.missing || item.value === undefined || item.value === null) {
          return acc;
        }
        acc[item.name] = item.value;
        return acc;
      },
      {},
    );

    return {
      ...plannerExtractedInput,
      ...(input || {}),
    };
  }

  private normalizeBrowserPhaseCommandAction(action: string | undefined): string | undefined {
    if (!action) {
      return undefined;
    }

    const normalized = action.trim().toLowerCase();
    switch (normalized) {
      case 'navigate':
        return 'goto';
      case 'waitforselector':
        return 'wait';
      case 'press':
        return 'press_key';
      case 'type':
        return 'type_text';
      default:
        return normalized;
    }
  }

  private reconcilePlanSemantic(
    semantic: PlannerSemantic | undefined,
    requiredInputs: PlannerRequiredInput[],
  ): PlannerSemantic | undefined {
    if (!semantic) {
      return undefined;
    }

    const missingRequiredInputs = requiredInputs.filter((item) => item.required && item.missing);
    const missingFieldNames = new Set(missingRequiredInputs.map((item) => item.name));
    const groupedMissing = (semantic.groupedMissing || [])
      .map((group) => {
        const groupFieldNames = this.resolveSemanticGroupFieldNames(group, requiredInputs);
        const currentMissingFieldNames = groupFieldNames.filter((name) => missingFieldNames.has(name));
        if (currentMissingFieldNames.length === 0) {
          return undefined;
        }

        return {
          ...group,
          fieldNames: groupFieldNames,
          missingFieldNames: currentMissingFieldNames,
        };
      })
      .filter((group): group is PlannerSemanticGroupedMissing => Boolean(group));

    const coveredMissingNames = new Set(groupedMissing.flatMap((group) => group.missingFieldNames));
    missingRequiredInputs
      .filter((item) => !coveredMissingNames.has(item.name))
      .forEach((item) => {
        groupedMissing.push({
          key: item.name,
          label: item.description || item.name,
          kind: 'field',
          blocking: true,
          required: true,
          fieldNames: [item.name],
          missingFieldNames: [item.name],
          description: item.description || `请补充 ${item.name}`,
        });
      });

    const blockingGroups = groupedMissing.filter((group) => group.blocking);
    const previewReady = blockingGroups.length === 0;
    const finalReady = groupedMissing.length === 0;

    return {
      ...semantic,
      previewReady,
      finalReady,
      summary: finalReady
        ? '文档参数已满足最终渲染要求。'
        : previewReady
          ? `文档可以先进入预览，但仍缺少 ${groupedMissing.length} 个业务组。`
          : `文档仍缺少 ${blockingGroups.length} 个关键业务组。`,
      groupedMissing,
      complexity: {
        ...semantic.complexity,
        requiredFields: requiredInputs.filter((item) => item.required).length,
        missingFields: missingRequiredInputs.length,
      },
    };
  }

  private resolveSemanticGroupFieldNames(
    group: PlannerSemanticGroupedMissing,
    requiredInputs: PlannerRequiredInput[],
  ): string[] {
    if (group.kind === 'array_group') {
      const groupPrefix = `${group.key}[].`;
      const fieldNames = requiredInputs
        .map((item) => item.name)
        .filter((name) => name === group.key || name.startsWith(groupPrefix));
      if (fieldNames.length > 0) {
        return fieldNames;
      }
    }

    const fieldNames = Array.isArray(group.fieldNames)
      ? group.fieldNames.filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
      : [];
    if (fieldNames.length > 0) {
      return Array.from(new Set(fieldNames));
    }

    return [group.key];
  }

  private buildNormalizedInput(
    dto: CreateExecutionDto,
    planDraft?: PlannerPlanDraft,
  ): Record<string, unknown> {
    const rawInput = dto.input || {};
    const promptDebugCandidate = (rawInput as Record<string, unknown>).__promptDebug;
    const input = { ...rawInput } as Record<string, unknown>;
    delete input.__promptDebug;
    const plannerExtractedInput = (planDraft?.required_inputs || []).reduce<Record<string, unknown>>(
      (acc, item) => {
        if (!item || item.missing || item.value === undefined || item.value === null) {
          return acc;
        }
        acc[item.name] = item.value;
        return acc;
      },
      {},
    );
    // Runtime execution should use planner-extracted params (e.g. city) while preserving explicit user input.
    const mergedInput = {
      ...plannerExtractedInput,
      ...input,
    };
    const normalizedInput: Record<string, unknown> = {
      objective: planDraft?.objective || this.buildPlannerUserInput(dto),
      plannerMode: planDraft?.planner_mode,
      plannerSummary: planDraft?.summary,
      requiredInputs: planDraft?.required_inputs,
      input: mergedInput,
    };

    if (planDraft?.skill_match) {
      normalizedInput.skillMatch = planDraft.skill_match;
      normalizedInput.capabilityMatch = {
        capabilityId: planDraft.skill_match.skill_id,
        capabilityName: planDraft.skill_match.skill_name,
        confidence: planDraft.skill_match.confidence,
        matchReason: planDraft.skill_match.match_reason,
      };
    }

    if (planDraft?.steps) {
      normalizedInput.planSteps = planDraft.steps;
    }

    if (planDraft?.risk_summary) {
      normalizedInput.riskSummary = planDraft.risk_summary;
    }

    if (planDraft?.semantic) {
      normalizedInput.semantic = planDraft.semantic;
    }

    const bootstrapUrl = this.extractBootstrapUrl(mergedInput, planDraft);
    if (bootstrapUrl) {
      normalizedInput.url = bootstrapUrl;
    }

    if (
      promptDebugCandidate
      && typeof promptDebugCandidate === 'object'
      && !Array.isArray(promptDebugCandidate)
    ) {
      normalizedInput.promptDebug = promptDebugCandidate;
    }

    return normalizedInput;
  }

  private extractBootstrapUrl(
    input: Record<string, unknown>,
    planDraft?: PlannerPlanDraft,
  ): string | undefined {
    if (typeof input.url === 'string' && input.url.trim()) {
      return input.url;
    }

    const urlLikeInput = planDraft?.required_inputs.find(
      (item) => item.name.toLowerCase() === 'url' && typeof item.value === 'string' && item.value.trim(),
    );

    return typeof urlLikeInput?.value === 'string' ? urlLikeInput.value : undefined;
  }

  private mapPlannerRiskLevel(planDraft?: PlannerPlanDraft): string {
    switch (planDraft?.risk_summary.level) {
      case 'high':
        return 'L2';
      case 'medium':
        return 'L1';
      case 'low':
      default:
        return 'L0';
    }
  }

  private async advanceExecutionFlow(
    executionId: string,
    runtimeSessionId: string,
  ): Promise<void> {
    this.logger.log(`Advancing execution flow for ${executionId}`);
    for (let safety = 0; safety < 1000; safety++) {
      const execution = await this.prisma.execution.findUnique({
        where: { id: executionId },
      });

      if (!execution) {
        this.logger.error(`Execution ${executionId} not found during advanceExecutionFlow`);
        throw new NotFoundException(`Execution ${executionId} not found`);
      }

      if (isTerminalExecutionStatus(execution.status)) {
        this.logger.log(`Execution ${executionId} is in terminal status ${execution.status}; stopping flow`);
        return;
      }

      const nextStep = await this.executionStepService.findNextPendingStep(executionId);

      if (!nextStep) {
        this.logger.log(`No more pending steps for execution ${executionId}`);
        if (execution.status === EXECUTION_STATUS.RUNNING) {
          await this.completeActivePhasesOnExecutionSuccess(executionId, runtimeSessionId);
          await this.updateStatus(executionId, EXECUTION_STATUS.SUCCEEDED);
          this.logger.log(`Execution ${executionId} marked as succeeded`);
          await this.closeRuntimeSessionQuietly(runtimeSessionId, executionId, 'execution_succeeded');
        }
        return;
      }

      this.logger.log(`Next step for ${executionId}: ${nextStep.id} (type: ${nextStep.type}, action: ${nextStep.action})`);

      if (nextStep.type === 'browser_action' && nextStep.action === 'goto') {
        const stepUrl = this.extractStepUrl(nextStep as any, execution as any);
        if (!stepUrl) {
          this.logger.warn(`Browser goto step ${nextStep.id} is missing target url; skipping`);
          await this.skipSingleStep(nextStep.id, executionId, 'Browser goto step is missing target url');
          continue;
        }

        await this.executeBrowserGotoStep(execution as any, runtimeSessionId, nextStep.id, stepUrl);
        return;
      }

      if (nextStep.type === 'input_collection') {
        this.logger.log(`Entering waiting_input for execution ${executionId}, step ${nextStep.id}`);
        await this.enterWaitingInput(execution as any, nextStep.id);
        return;
      }

      if (nextStep.type === 'system' && nextStep.action === 'execute_browser_phase') {
        this.logger.log(`Executing browser phase step for execution ${executionId}, step ${nextStep.id}`);
        await this.executeBrowserPhaseStep(execution as any, runtimeSessionId, nextStep.id);
        return;
      }

      if (nextStep.type === 'system') {
        this.logger.log(`Executing system step for execution ${executionId}, step ${nextStep.id} (action: ${nextStep.action})`);
        await this.executeSystemSkillStep(execution as any, runtimeSessionId, nextStep.id);
        return;
      }

      const reason = `Planner step executor not implemented yet for type=${nextStep.type}, action=${nextStep.action || 'none'}`;
      this.logger.warn(`${reason} for step ${nextStep.id}; skipping`);
      await this.skipSingleStep(
        nextStep.id,
        executionId,
        reason,
      );
    }
  }

  private async createPlannedSteps(
    executionId: string,
    normalizedInput: Record<string, unknown>,
    planDraft?: PlannerPlanDraft,
  ): Promise<void> {
    const { steps, bootstrapUrl } = buildPlannedExecutionSteps(executionId, normalizedInput, planDraft);

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
    url: string,
  ): Promise<void> {
    const executionId = execution.id as string;
    const step = await this.executionStepService.getById(stepId);
    const phaseMetadata = this.extractStepPhaseMetadata(step as Record<string, unknown> | null | undefined);
    await this.executionStepService.setCurrentStep(executionId, stepId);
    await this.markPhaseRunningForStep(executionId, runtimeSessionId, phaseMetadata, step);

    await this.createEvent(
      executionId,
      EXECUTION_EVENT_TYPE.STEP_STARTED,
      { action: 'goto', url },
      {
        runtimeSessionId,
        stepId,
      },
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
        executionMode: 'planned_step',
        phaseMetadata,
      }),
    );

    await this.handleBrowserStepResult(executionId, runtimeSessionId, stepId, result, phaseMetadata, step as Record<string, unknown> | null | undefined);
  }

  private async executeBrowserPhaseStep(
    execution: Record<string, unknown>,
    runtimeSessionId: string,
    stepId: string,
  ): Promise<void> {
    const executionId = execution.id as string;
    const step = await this.executionStepService.getById(stepId);
    const phaseMetadata = this.extractStepPhaseMetadata(step as Record<string, unknown> | null | undefined);
    const browserPhaseConfig = this.extractStepBrowserPhaseConfig(step as Record<string, unknown> | null | undefined);

    if (!phaseMetadata) {
      await this.skipSingleStep(stepId, executionId, 'Browser phase step is missing phase metadata');
      await this.advanceExecutionFlow(executionId, runtimeSessionId);
      return;
    }

    if (!browserPhaseConfig || browserPhaseConfig.commands.length === 0) {
      await this.skipSingleStep(stepId, executionId, 'Browser phase step is missing commands');
      await this.advanceExecutionFlow(executionId, runtimeSessionId);
      return;
    }

    if (!this.browserPhaseExecutor) {
      throw new Error('BrowserPhaseExecutor is not available');
    }

    await this.executionStepService.setCurrentStep(executionId, stepId);
    await this.createEvent(
      executionId,
      EXECUTION_EVENT_TYPE.STEP_STARTED,
      {
        runtimeSessionId,
        stepId,
        stepName: step?.name,
        action: 'execute_browser_phase',
        phaseKey: phaseMetadata.phaseKey,
        phaseName: phaseMetadata.phaseName,
        phaseType: phaseMetadata.phaseType,
      },
      {
        runtimeSessionId,
        stepId,
      },
    );
    await this.executionStepService.startStep(stepId);

    try {
      const result = await this.browserPhaseExecutor.execute({
        executionId,
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
        runtimeType: 'browser',
        policyContext: this.buildBrowserPhasePolicyContext(execution),
        traceContext: this.buildBrowserPhaseTraceContext(execution),
        commands: browserPhaseConfig.commands,
        input: this.extractBrowserPhaseInput(step as Record<string, unknown> | null | undefined),
        precheck: browserPhaseConfig.precheck,
        postcheck: browserPhaseConfig.postcheck,
        recoveryPolicy: browserPhaseConfig.recoveryPolicy,
      });

      await this.handleBrowserPhaseStepResult(executionId, runtimeSessionId, stepId, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Browser phase execution failed';
      this.logger.error(`Failed to execute browser phase step ${stepId}: ${message}`);
      await this.handleBrowserPhaseStepResult(executionId, runtimeSessionId, stepId, {
        success: false,
        status: 'failed',
        stepResults: [],
        errorCode: 'BROWSER_PHASE_EXECUTION_FAILED',
        errorMessage: message,
      });
    }
  }

  private async executeSystemSkillStep(
    execution: Record<string, unknown>,
    runtimeSessionId: string,
    stepId: string,
  ): Promise<void> {
    const executionId = execution.id as string;
    const step = await this.executionStepService.getById(stepId);
    const phaseMetadata = this.extractStepPhaseMetadata(step as Record<string, unknown> | null | undefined);
    this.logger.log(`Executing system skill step ${stepId} for execution ${executionId}`);
    const capabilityId = this.runtimeStepRequestFactory.resolveExecutionCapabilityId(execution);
    if (!capabilityId) {
      this.logger.error(`Skill execution step ${stepId} is missing capability identifier for execution ${executionId}`);
      await this.skipSingleStep(stepId, executionId, 'Skill execution step is missing capability identifier');
      await this.advanceExecutionFlow(executionId, runtimeSessionId);
      return;
    }

    const capabilityVersion = this.runtimeStepRequestFactory.resolveExecutionCapabilityVersion(execution);
    const input = this.runtimeStepRequestFactory.resolveExecutionInput(execution);
    this.logger.log(`Calling auth runtime for capability ${capabilityId} (version: ${capabilityVersion || 'latest'}) with input: ${JSON.stringify(input)}`);

    await this.executionStepService.setCurrentStep(executionId, stepId);
    await this.markPhaseRunningForStep(executionId, runtimeSessionId, phaseMetadata, step);
    await this.initializeWorkflowActivityPhasesForSkillExecution(
      executionId,
      runtimeSessionId,
      capabilityId,
      phaseMetadata,
      step as Record<string, unknown> | null | undefined,
    );

    // Create start event
    await this.createEvent(executionId, EXECUTION_EVENT_TYPE.STEP_STARTED, {
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
      await this.handleSystemSkillStepResult(
        executionId,
        runtimeSessionId,
        stepId,
        result,
        capabilityId,
        phaseMetadata,
        step as Record<string, unknown> | null | undefined,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'response' in error
            ? String((error as { response?: { data?: unknown } }).response?.data || 'Unknown error')
            : 'Unknown error';

      this.logger.error(`Failed to execute system skill step ${stepId}: ${message}`);
      await this.handleSystemSkillStepResult(
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
        step as Record<string, unknown> | null | undefined,
      );
    }
  }

  private async handleBrowserPhaseStepResult(
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    result: RuntimePhaseInvokeResult,
  ): Promise<void> {
    const phaseOutput = {
      status: result.status,
      output: result.output || null,
      stepResults: result.stepResults,
      failedStepId: result.failedStepId || null,
      failedAction: result.failedAction || null,
      snapshotId: result.snapshotId || null,
      pageUrl: result.pageUrl || null,
      pageFingerprint: result.pageFingerprint || null,
      artifacts: result.artifacts || [],
      retryable: result.retryable || false,
      requiresTakeover: result.requiresTakeover || false,
      takeoverReason: result.takeoverReason || null,
    };

    if (result.status === 'waiting') {
      const requiredInputs = this.extractRequiredInputsFromPhaseOutput(result.output);
      await this.executionStepService.markStepWaiting(stepId, {
        requiredInputs,
        outputJson: phaseOutput,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
      await this.enterRuntimeWaitingInput(
        executionId,
        runtimeSessionId,
        stepId,
        requiredInputs,
        result.errorMessage,
      );
      return;
    }

    if (result.status === 'blocked') {
      await this.enterPendingApprovalFromRuntimeStep(
        executionId,
        result.errorMessage || 'Browser phase blocked by runtime policy',
      );
      return;
    }

    await this.executionStepService.finishRuntimeStep(stepId, {
      success: result.success,
      outputJson: phaseOutput,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      snapshotId: result.snapshotId || undefined,
      takeoverTriggered: Boolean(result.requiresTakeover || result.status === 'takeover_required'),
    });

    await this.createEvent(
      executionId,
      result.success ? EXECUTION_EVENT_TYPE.STEP_SUCCEEDED : EXECUTION_EVENT_TYPE.STEP_FAILED,
      {
        runtimeSessionId,
        stepId,
        result: result.output || phaseOutput,
        error: result.errorMessage,
        errorCode: result.errorCode,
        phaseStatus: result.status,
        failedStepId: result.failedStepId,
        failedAction: result.failedAction,
        shouldTakeover: result.requiresTakeover || result.status === 'takeover_required',
      },
      {
        runtimeSessionId,
        stepId,
      },
    );

    if (result.status === 'takeover_required' || result.requiresTakeover) {
      await this.takeover(
        executionId,
        'system',
        {
          reason: result.takeoverReason || result.errorMessage || 'Browser phase requires human takeover',
        },
        {
          id: 'system',
          role: 'admin',
        },
      );
      return;
    }

    if (result.success) {
      await this.persistBrowserPhaseSuccess(executionId, runtimeSessionId, phaseOutput);
      await this.advanceExecutionFlow(executionId, runtimeSessionId);
      return;
    }

    await this.failExecutionFromRuntimeStep({
      executionId,
      stepId,
      failureReason: result.errorMessage || 'Browser phase execution failed',
      failureCode: result.errorCode || 'BROWSER_PHASE_EXECUTION_FAILED',
      runtimeSessionId,
    });
  }

  private async handleSystemSkillStepResult(
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    result: RuntimeStepInvokeResult,
    capabilityId: string,
    phaseMetadata?: ExecutionStepPhaseMetadata,
    step?: Record<string, unknown> | null,
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
            },
          );
        },
        enterWaitingInput: (requiredInputs, reason) =>
          this.enterRuntimeWaitingInput(executionId, runtimeSessionId, stepId, requiredInputs, reason),
        enterPendingApproval: (reason) =>
          this.enterPendingApprovalFromRuntimeStep(executionId, reason),
      },
      result,
    );
    await this.syncPhaseAfterStepResult(executionId, runtimeSessionId, result, phaseMetadata, step);
    await this.syncWorkflowActivityPhasesAfterSkillResult(
      executionId,
      runtimeSessionId,
      capabilityId,
      result,
      phaseMetadata,
    );
  }

  private extractStepBrowserPhaseConfig(
    step?: Record<string, unknown> | null,
  ): ExecutionStepBrowserPhaseConfig | undefined {
    if (!step) {
      return undefined;
    }

    const targetJson = this.readJsonRecord(step.targetJson);
    const inputJson = this.readJsonRecord(step.inputJson);
    const commands = this.extractBrowserPhaseCommands(
      targetJson?.commands || inputJson?.commands,
      typeof step.id === 'string' ? step.id : 'browser_phase_step',
    );

    if (commands.length === 0) {
      return undefined;
    }

    return {
      commands,
      precheck: this.extractBrowserPhaseCheck(targetJson?.precheck || inputJson?.precheck),
      postcheck: this.extractBrowserPhaseCheck(targetJson?.postcheck || inputJson?.postcheck),
      recoveryPolicy: this.extractBrowserPhaseRecoveryPolicy(
        targetJson?.recoveryPolicy
          || targetJson?.recovery_policy
          || inputJson?.recoveryPolicy
          || inputJson?.recovery_policy,
      ),
    };
  }

  private extractBrowserPhaseCommands(value: unknown, stepIdPrefix: string): BrowserPhaseCommand[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter(
        (command): command is Record<string, unknown> =>
          Boolean(command)
          && typeof command === 'object'
          && !Array.isArray(command)
          && typeof command.action === 'string'
          && command.action.trim().length > 0,
      )
      .map((command, index) => ({
        stepId:
          typeof command.stepId === 'string' && command.stepId.trim().length > 0
            ? command.stepId.trim()
            : typeof command.step_id === 'string' && command.step_id.trim().length > 0
              ? command.step_id.trim()
              : `${stepIdPrefix}__command_${index + 1}`,
        capabilityType:
          typeof command.capabilityType === 'string' && command.capabilityType.trim().length > 0
            ? command.capabilityType.trim().replace(/_/g, '.')
            : typeof command.capability_type === 'string' && command.capability_type.trim().length > 0
              ? command.capability_type.trim().replace(/_/g, '.')
              : 'browser.step',
        action: (command.action as string).trim(),
        input: this.readJsonRecord(command.input) || {},
        metadata: this.readJsonRecord(command.metadata),
      }));
  }

  private extractBrowserPhaseCheck(value: unknown): BrowserPhaseCheck | undefined {
    const record = this.readJsonRecord(value);
    return record as BrowserPhaseCheck | undefined;
  }

  private extractBrowserPhaseRecoveryPolicy(
    value: unknown,
  ): BrowserPhaseRecoveryPolicy | undefined {
    const record = this.readJsonRecord(value);
    if (!record) {
      return undefined;
    }

    const policy: BrowserPhaseRecoveryPolicy = {
      ...(typeof record.maxAutoRetries === 'number'
        ? { maxAutoRetries: record.maxAutoRetries }
        : typeof record.max_auto_retries === 'number'
          ? { maxAutoRetries: record.max_auto_retries }
          : {}),
      ...(typeof record.allowAiRecovery === 'boolean'
        ? { allowAiRecovery: record.allowAiRecovery }
        : typeof record.allow_ai_recovery === 'boolean'
          ? { allowAiRecovery: record.allow_ai_recovery }
          : {}),
      ...(typeof record.allowHumanTakeover === 'boolean'
        ? { allowHumanTakeover: record.allowHumanTakeover }
        : typeof record.allow_human_takeover === 'boolean'
          ? { allowHumanTakeover: record.allow_human_takeover }
          : {}),
      ...(typeof record.modelId === 'string' && record.modelId.trim().length > 0
        ? { modelId: record.modelId.trim() }
        : typeof record.model_id === 'string' && record.model_id.trim().length > 0
          ? { modelId: record.model_id.trim() }
          : {}),
    };

    return Object.keys(policy).length > 0 ? policy : undefined;
  }

  private extractBrowserPhaseInput(
    step?: Record<string, unknown> | null,
  ): Record<string, unknown> | undefined {
    const inputJson = this.readJsonRecord(step?.inputJson);
    if (!inputJson) {
      return undefined;
    }

    const { commands, precheck, postcheck, recoveryPolicy, recovery_policy, ...phaseInput } = inputJson;
    return phaseInput;
  }

  private buildBrowserPhasePolicyContext(
    execution: Record<string, unknown>,
  ): {
    riskLevel?: 'L0' | 'L1' | 'L2' | 'L3';
    requiresApproval?: boolean;
  } | undefined {
    const riskLevel =
      typeof execution.riskLevel === 'string'
      && ['L0', 'L1', 'L2', 'L3'].includes(execution.riskLevel)
        ? execution.riskLevel as 'L0' | 'L1' | 'L2' | 'L3'
        : undefined;
    const requiresApproval =
      typeof execution.requiresApproval === 'boolean' ? execution.requiresApproval : undefined;

    if (riskLevel === undefined && requiresApproval === undefined) {
      return undefined;
    }

    return {
      ...(riskLevel ? { riskLevel } : {}),
      ...(requiresApproval !== undefined ? { requiresApproval } : {}),
    };
  }

  private buildBrowserPhaseTraceContext(
    execution: Record<string, unknown>,
  ): {
    userId?: string;
    actorType?: 'system';
    sourceService?: string;
  } | undefined {
    const userId =
      typeof execution.createdBy === 'string' && execution.createdBy.trim().length > 0
        ? execution.createdBy
        : undefined;
    if (!userId) {
      return undefined;
    }

    return {
      userId,
      actorType: 'system',
      sourceService: 'control-plane',
    };
  }

  private extractRequiredInputsFromPhaseOutput(output?: Record<string, unknown>): unknown[] {
    if (Array.isArray(output?.requiredInputs)) {
      return output.requiredInputs;
    }
    if (Array.isArray(output?.required_inputs)) {
      return output.required_inputs;
    }
    return [];
  }

  private readJsonRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  }

  private extractStepPhaseMetadata(
    step?: Record<string, unknown> | null,
  ): ExecutionStepPhaseMetadata | undefined {
    if (!step) {
      return undefined;
    }

    const targetJson = step.targetJson as Record<string, unknown> | undefined;
    const inputJson = step.inputJson as Record<string, unknown> | undefined;
    const phaseKey = typeof targetJson?.phaseKey === 'string'
      ? targetJson.phaseKey
      : typeof targetJson?.phase_key === 'string'
        ? targetJson.phase_key
        : typeof inputJson?.phaseKey === 'string'
          ? inputJson.phaseKey
          : typeof inputJson?.phase_key === 'string'
            ? inputJson.phase_key
            : undefined;
    const phaseName = typeof targetJson?.phaseName === 'string'
      ? targetJson.phaseName
      : typeof targetJson?.phase_name === 'string'
        ? targetJson.phase_name
        : typeof inputJson?.phaseName === 'string'
          ? inputJson.phaseName
          : typeof inputJson?.phase_name === 'string'
            ? inputJson.phase_name
            : undefined;
    const phaseType = typeof targetJson?.phaseType === 'string'
      ? targetJson.phaseType
      : typeof targetJson?.phase_type === 'string'
        ? targetJson.phase_type
        : typeof inputJson?.phaseType === 'string'
          ? inputJson.phaseType
          : typeof inputJson?.phase_type === 'string'
            ? inputJson.phase_type
            : undefined;

    if (!phaseKey || !phaseName || !phaseType) {
      return undefined;
    }

    return { phaseKey, phaseName, phaseType };
  }

  private async markPhaseRunningForStep(
    executionId: string,
    runtimeSessionId: string,
    phaseMetadata?: ExecutionStepPhaseMetadata,
    step?: Record<string, unknown> | null,
  ): Promise<void> {
    if (!phaseMetadata) {
      return;
    }

    const stepInput = (step?.inputJson as Record<string, unknown> | undefined) || null;
    const stepTarget = (step?.targetJson as Record<string, unknown> | undefined) || null;
    await this.executionPhaseService.markRunning(executionId, phaseMetadata.phaseKey, {
      phaseName: phaseMetadata.phaseName,
      phaseType: phaseMetadata.phaseType,
      attempt: 1,
      runtimeSessionId,
      input: {
        stepId: step?.id,
        stepType: step?.type,
        action: step?.action,
        target: stepTarget,
        input: stepInput,
      },
      precheck: null,
    });
  }

  private async initializeWorkflowActivityPhasesForSkillExecution(
    executionId: string,
    runtimeSessionId: string,
    capabilityId: string,
    phaseMetadata?: ExecutionStepPhaseMetadata,
    step?: Record<string, unknown> | null,
  ): Promise<void> {
    if (!phaseMetadata) {
      return;
    }

    const activityPhases = await this.loadWorkflowActivityPhaseDefinitions(capabilityId, phaseMetadata.phaseKey);
    if (activityPhases.length === 0) {
      return;
    }

    const sharedInput = {
      parentPhaseKey: phaseMetadata.phaseKey,
      parentPhaseName: phaseMetadata.phaseName,
      parentStepId: typeof step?.id === 'string' ? step.id : null,
      activityCount: activityPhases.length,
    };

    for (const activityPhase of activityPhases.slice(1)) {
      await this.executionPhaseService.createOrUpdatePhase({
        executionId,
        phaseKey: activityPhase.phaseKey,
        phaseName: activityPhase.phaseName,
        phaseType: activityPhase.phaseType,
        status: 'pending',
        attempt: 1,
        runtimeSessionId,
        input: {
          ...sharedInput,
          order: activityPhase.order,
          activityName: activityPhase.activityName || activityPhase.phaseName,
        },
      });
    }

    const firstActivityPhase = activityPhases[0];
    await this.executionPhaseService.markRunning(executionId, firstActivityPhase.phaseKey, {
      phaseName: firstActivityPhase.phaseName,
      phaseType: firstActivityPhase.phaseType,
      attempt: 1,
      runtimeSessionId,
      input: {
        ...sharedInput,
        order: firstActivityPhase.order,
        activityName: firstActivityPhase.activityName || firstActivityPhase.phaseName,
      },
      precheck: null,
    });
  }

  private async syncWorkflowActivityPhasesAfterSkillResult(
    executionId: string,
    runtimeSessionId: string,
    capabilityId: string,
    result: RuntimeStepInvokeResult,
    phaseMetadata?: ExecutionStepPhaseMetadata,
  ): Promise<void> {
    if (!phaseMetadata) {
      return;
    }

    const activityPhases = await this.loadWorkflowActivityPhaseDefinitions(
      capabilityId,
      phaseMetadata.phaseKey,
    );
    if (activityPhases.length === 0) {
      return;
    }

    const runtimePhaseResults = this.extractRuntimePhaseResults(result);
    if (runtimePhaseResults.length === 0) {
      const failedActivityPhase = !result.success
        ? await this.resolveFailedWorkflowActivityPhase(executionId, phaseMetadata.phaseKey, activityPhases)
        : null;
      if (!result.success && failedActivityPhase) {
        await this.executionPhaseService.createOrUpdatePhase({
          executionId,
          phaseKey: failedActivityPhase.phaseKey,
          phaseName: failedActivityPhase.phaseName,
          phaseType: failedActivityPhase.phaseType,
          status: result.status === 'takeover_required' || result.requiresTakeover ? 'waiting_takeover' : 'failed',
          attempt: 1,
          runtimeSessionId,
          output: {
            parentPhaseKey: phaseMetadata.phaseKey,
            activityName: failedActivityPhase.activityName || failedActivityPhase.phaseName,
            result: result.output || result.rawResult || null,
          },
          recoveryDecision: null,
          errorCode: result.errorCode || null,
          errorMessage: result.errorMessage || null,
          completedAt: result.status === 'takeover_required' || result.requiresTakeover ? null : new Date(),
        });
      }
      return;
    }

    for (const [index, activityPhase] of activityPhases.entries()) {
      const phaseResult = runtimePhaseResults[index];
      if (!phaseResult) {
        continue;
      }

      const phaseResultBody = this.readRecord(
        phaseResult.result,
        phaseResult.output,
        phaseResult,
      ) || phaseResult;
      const normalizedStatus = this.normalizeRuntimePhaseStepStatus(phaseResultBody);
      const phaseArtifacts = this.mapRuntimeArtifactsFromActivityPhaseResult(phaseResultBody);
      const phaseSteps = this.mapRuntimeStepsFromActivityPhaseResult(phaseResultBody, phaseResult);
      const phaseOutput = {
        parentPhaseKey: phaseMetadata.phaseKey,
        activityName: this.readNonEmptyString(
          phaseResult.activityName,
          activityPhase.activityName,
          activityPhase.phaseName,
        ),
        stepName: this.readNonEmptyString(phaseResult.stepName, activityPhase.phaseName),
        result: phaseResultBody,
      };

      if (normalizedStatus === 'failed') {
        await this.executionPhaseService.createOrUpdatePhase({
          executionId,
          phaseKey: activityPhase.phaseKey,
          phaseName: activityPhase.phaseName,
          phaseType: activityPhase.phaseType,
          status: 'failed',
          attempt: 1,
          runtimeSessionId,
          output: phaseOutput,
          errorCode: this.readNonEmptyString(phaseResultBody.errorCode, phaseResultBody.error_code) || result.errorCode || null,
          errorMessage: this.readNonEmptyString(
            phaseResultBody.errorMessage,
            phaseResultBody.error_message,
            phaseResultBody.message,
          ) || result.errorMessage || null,
          completedAt: new Date(),
        });
      } else if (normalizedStatus === 'waiting_takeover') {
        await this.executionPhaseService.createOrUpdatePhase({
          executionId,
          phaseKey: activityPhase.phaseKey,
          phaseName: activityPhase.phaseName,
          phaseType: activityPhase.phaseType,
          status: 'waiting_takeover',
          attempt: 1,
          runtimeSessionId,
          output: phaseOutput,
          errorCode: this.readNonEmptyString(phaseResultBody.errorCode, phaseResultBody.error_code) || result.errorCode || null,
          errorMessage: this.readNonEmptyString(
            phaseResultBody.errorMessage,
            phaseResultBody.error_message,
            phaseResultBody.message,
          ) || result.errorMessage || null,
          completedAt: null,
        });
      } else {
        await this.executionPhaseService.markCompleted(executionId, activityPhase.phaseKey, {
          phaseName: activityPhase.phaseName,
          phaseType: activityPhase.phaseType,
          attempt: 1,
          runtimeSessionId,
          output: phaseOutput,
          postcheck: null,
        });
      }

      await this.executionPhaseService.replaceArtifacts(executionId, activityPhase.phaseKey, phaseArtifacts);
      await this.executionPhaseService.replaceSteps(executionId, activityPhase.phaseKey, phaseSteps);
    }
  }

  private async syncPhaseAfterStepResult(
    executionId: string,
    runtimeSessionId: string,
    result: RuntimeStepInvokeResult,
    phaseMetadata?: ExecutionStepPhaseMetadata,
    step?: Record<string, unknown> | null,
  ): Promise<void> {
    if (!phaseMetadata) {
      return;
    }

    const phaseLikeResult = result as RuntimeStepInvokeResult & Partial<RuntimePhaseInvokeResult>;
    const phaseOutput = {
      stepId: step?.id,
      action: step?.action,
      output: result.output || null,
      snapshot: result.snapshot || null,
      rawResult: result.rawResult || null,
      ...(Array.isArray(phaseLikeResult.stepResults)
        ? { stepResults: phaseLikeResult.stepResults }
        : {}),
      ...(Array.isArray(result.artifacts) ? { artifacts: result.artifacts } : {}),
      ...(typeof phaseLikeResult.status === 'string'
        ? { status: phaseLikeResult.status }
        : {}),
      ...(phaseLikeResult.failedStepId
        ? { failedStepId: phaseLikeResult.failedStepId }
        : {}),
      ...(phaseLikeResult.failedAction
        ? { failedAction: phaseLikeResult.failedAction }
        : {}),
      ...(typeof phaseLikeResult.requiresTakeover === 'boolean'
        ? { requiresTakeover: phaseLikeResult.requiresTakeover }
        : {}),
      ...(phaseLikeResult.takeoverReason
        ? { takeoverReason: phaseLikeResult.takeoverReason }
        : {}),
    };
    const phaseArtifacts = this.mapRuntimeArtifactsToPhaseArtifacts(result);
    const phaseSteps = this.extractPhaseStepsFromRuntimeResult(result, step);

    if (result.success) {
      await this.executionPhaseService.markCompleted(executionId, phaseMetadata.phaseKey, {
        phaseName: phaseMetadata.phaseName,
        phaseType: phaseMetadata.phaseType,
        attempt: 1,
        runtimeSessionId,
        output: phaseOutput,
        postcheck: null,
      });
      await this.executionPhaseService.replaceArtifacts(executionId, phaseMetadata.phaseKey, phaseArtifacts);
      await this.executionPhaseService.replaceSteps(executionId, phaseMetadata.phaseKey, phaseSteps);
      return;
    }

    const mappedStatus = result.status === 'takeover_required'
      ? 'waiting_takeover'
      : result.status === 'waiting'
        ? 'resumable'
        : 'failed';

    await this.executionPhaseService.createOrUpdatePhase({
      executionId,
      phaseKey: phaseMetadata.phaseKey,
      phaseName: phaseMetadata.phaseName,
      phaseType: phaseMetadata.phaseType,
      status: mappedStatus,
      attempt: 1,
      runtimeSessionId,
      output: phaseOutput,
      recoveryDecision: null,
      errorCode: result.errorCode || null,
      errorMessage: result.errorMessage || null,
      completedAt: mappedStatus === 'failed' ? new Date() : null,
    });
    await this.executionPhaseService.replaceArtifacts(executionId, phaseMetadata.phaseKey, phaseArtifacts);
    await this.executionPhaseService.replaceSteps(executionId, phaseMetadata.phaseKey, phaseSteps);
  }

  private async persistBrowserPhaseSuccess(
    executionId: string,
    runtimeSessionId: string,
    phaseOutput: Record<string, unknown>,
  ): Promise<void> {
    const canReadExecution = typeof this.prisma?.execution?.findUnique === 'function';
    const canUpdateExecution = typeof this.prisma?.execution?.update === 'function';
    if (!canReadExecution || !canUpdateExecution) {
      return;
    }

    const currentExecution = await this.prisma.execution.findUnique({
      where: { id: executionId },
      select: { resultJson: true },
    });

    const currentResult = this.readRecord(currentExecution?.resultJson) || {};
    const browserResult = {
      ...currentResult,
      ...phaseOutput,
      runtimeSessionId,
      backend: typeof currentResult.backend === 'string' ? currentResult.backend : 'browser',
    };

    await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        resultJson: this.asJsonValue(browserResult),
      },
    });
  }

  private mapRuntimeArtifactsToPhaseArtifacts(result: RuntimeStepInvokeResult): Array<{
    artifactType: string;
    snapshotId?: string | null;
    pageUrl?: string | null;
    pageFingerprint?: string | null;
    payload?: Record<string, unknown> | null;
  }> {
    if (!Array.isArray(result.artifacts) || result.artifacts.length === 0) {
      return [];
    }

    return result.artifacts.map((artifact) => ({
      artifactType: artifact.type,
      snapshotId: artifact.id || null,
      pageUrl: artifact.url || null,
      pageFingerprint: this.extractPageFingerprintFromArtifactMetadata(artifact.metadata) || null,
      payload: artifact.metadata || null,
    }));
  }

  private extractPageFingerprintFromArtifactMetadata(
    metadata?: Record<string, unknown>,
  ): string | undefined {
    if (!metadata) {
      return undefined;
    }
    const page = metadata.page;
    if (page && typeof page === 'object' && typeof (page as Record<string, unknown>).fingerprint === 'string') {
      return ((page as Record<string, unknown>).fingerprint as string).trim() || undefined;
    }
    if (typeof metadata.pageFingerprint === 'string' && metadata.pageFingerprint.trim()) {
      return metadata.pageFingerprint.trim();
    }
    if (typeof metadata.page_fingerprint === 'string' && metadata.page_fingerprint.trim()) {
      return metadata.page_fingerprint.trim();
    }
    return undefined;
  }

  private extractRuntimePhaseResults(result: RuntimeStepInvokeResult): Record<string, unknown>[] {
    const outputPhaseResults = this.readRecordArray(result.output?.phaseResults);
    if (outputPhaseResults.length > 0) {
      return outputPhaseResults;
    }
    return this.readRecordArray(result.rawResult?.output, 'phaseResults');
  }

  private async resolveFailedWorkflowActivityPhase(
    executionId: string,
    parentPhaseKey: string,
    activityPhases: WorkflowActivityPhaseDefinition[],
  ): Promise<WorkflowActivityPhaseDefinition | null> {
    if (typeof this.executionPhaseService?.listByExecutionId !== 'function') {
      return activityPhases[0] || null;
    }

    const existingPhases = await this.executionPhaseService.listByExecutionId(executionId);
    const candidatePhases = existingPhases
      .filter((phase) => {
        const phaseType = this.readNonEmptyString(phase.phaseType, phase.phase_type);
        if (phaseType !== 'workflow_activity') {
          return false;
        }
        const input = this.readRecord(phase.input, phase.input_json);
        return this.readNonEmptyString(input?.parentPhaseKey) === parentPhaseKey;
      })
      .sort((left, right) => {
        const leftInput = this.readRecord(left.input, left.input_json);
        const rightInput = this.readRecord(right.input, right.input_json);
        const leftOrder = Number(leftInput?.order || 0);
        const rightOrder = Number(rightInput?.order || 0);
        return rightOrder - leftOrder;
      });

    const activePhase = candidatePhases.find((phase) => {
      const status = this.readNonEmptyString(phase.status);
      return status === 'running' || status === 'waiting_takeover' || status === 'resumable';
    }) || candidatePhases[0];

    const activePhaseKey = activePhase
      ? this.readNonEmptyString(activePhase.phaseKey, activePhase.phase_key)
      : undefined;
    if (!activePhaseKey) {
      return activityPhases[0] || null;
    }

    return activityPhases.find((phase) => phase.phaseKey === activePhaseKey) || activityPhases[0] || null;
  }

  private mapRuntimeArtifactsFromActivityPhaseResult(
    phaseResultBody: Record<string, unknown>,
  ): Array<{
    artifactType: string;
    snapshotId?: string | null;
    pageUrl?: string | null;
    pageFingerprint?: string | null;
    payload?: Record<string, unknown> | null;
  }> {
    const runtimeArtifacts = this.readRecordArray(phaseResultBody, 'artifacts');
    if (runtimeArtifacts.length === 0) {
      return [];
    }

    const mappedArtifacts = runtimeArtifacts
      .map((artifact) => {
        const snapshot = this.readRecord(artifact.snapshot);
        const artifactRecord = this.readRecord(artifact.artifact);
        const snapshotId = this.readNonEmptyString(artifact.snapshotId, artifact.snapshot_id, snapshot?.id);
        const snapshotPath = this.readNonEmptyString(snapshot?.path);
        const artifactPath = this.readNonEmptyString(artifactRecord?.path);
        const command = this.readNonEmptyString(artifact.command);
        const status = this.readNonEmptyString(artifact.status);

        if (!snapshotId && !snapshotPath && !artifactPath) {
          return null;
        }

        return {
          artifactType: snapshotId ? 'snapshot' : 'browser_artifact',
          snapshotId: snapshotId || null,
          pageUrl: null,
          pageFingerprint: null,
          payload: {
            ...(command ? { command } : {}),
            ...(status ? { status } : {}),
            ...(snapshotPath ? { snapshotPath } : {}),
            ...(artifactPath ? { artifactPath } : {}),
          },
        };
      });

    return mappedArtifacts.filter((item) => item !== null);
  }

  private mapRuntimeStepsFromActivityPhaseResult(
    phaseResultBody: Record<string, unknown>,
    phaseResult?: Record<string, unknown>,
  ): Array<{
    stepIndex: number;
    stepId?: string | null;
    action: string;
    status: string;
    input?: Record<string, unknown> | null;
    output?: Record<string, unknown> | null;
    errorMessage?: string | null;
    errorCode?: string | null;
    snapshotId?: string | null;
    startedAt?: Date | null;
    endedAt?: Date | null;
  }> {
    const nestedResults = this.readRecordArray(phaseResultBody, 'results');
    if (nestedResults.length > 0) {
      return nestedResults.map((nestedResult, index) => (
        this.mapRuntimePhaseStepRecord(nestedResult, index + 1, {
          phaseResult,
          fallbackAction:
            this.readNonEmptyString(
              nestedResult.action,
              nestedResult.command,
              phaseResult?.stepName,
              phaseResult?.activityName,
            ) || 'execute',
        })
      ));
    }

    return [
      this.mapRuntimePhaseStepRecord(phaseResultBody, 1, {
        phaseResult,
        fallbackAction:
          this.readNonEmptyString(
            phaseResult?.stepName,
            phaseResult?.activityName,
          ) || 'execute',
      }),
    ];
  }

  private async loadWorkflowActivityPhaseDefinitions(
    capabilityId: string,
    parentPhaseKey: string,
  ): Promise<WorkflowActivityPhaseDefinition[]> {
    if (!capabilityId) {
      return [];
    }
    if (typeof this.prisma.$queryRawUnsafe !== 'function') {
      return [];
    }

    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ source_payload_json?: unknown }>>(
        `
          SELECT css.source_payload_json
          FROM capability_releases cr
          INNER JOIN capability_source_snapshots css
            ON css.id = cr.current_source_snapshot_id
          WHERE cr.published_skill_id = $1::uuid
            AND cr.archived_at IS NULL
          ORDER BY cr.updated_at DESC
          LIMIT 1
        `,
        capabilityId,
      );

      const sourcePayload = this.parseJsonRecord(rows[0]?.source_payload_json);
      const workflowDsl = this.parseJsonRecord(sourcePayload?.workflowDsl);
      const workflowSteps = Array.isArray(workflowDsl?.steps)
        ? workflowDsl.steps.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        : [];
      const activitySteps = workflowSteps.filter((step) => {
        const stepType = this.readNonEmptyString(step.type);
        return stepType === 'activity';
      });

      return activitySteps.map((activityStep, index) => {
        const activityKeySource = this.readNonEmptyString(
          activityStep.activityName,
          activityStep.activityRef,
          activityStep.name,
        ) || `activity_${index + 1}`;
        const activityLabel = this.readNonEmptyString(
          activityStep.name,
          activityStep.activityName,
          activityStep.activityRef,
        ) || `Activity ${index + 1}`;

        return {
          phaseKey: `${parentPhaseKey}__activity_${String(index + 1).padStart(2, '0')}_${this.sanitizePhaseKeyFragment(activityKeySource)}`,
          phaseName: activityLabel,
          phaseType: 'workflow_activity',
          activityName: this.readNonEmptyString(activityStep.activityName, activityStep.activityRef, activityLabel) || undefined,
          parentPhaseKey,
          order: index + 1,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      this.logger.warn(`Failed to load workflow activity phases for capability ${capabilityId}: ${message}`);
      return [];
    }
  }

  private parseJsonRecord(value: unknown): Record<string, unknown> | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? parsed as Record<string, unknown>
          : undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private async completeActivePhasesOnExecutionSuccess(
    executionId: string,
    runtimeSessionId: string,
  ): Promise<void> {
    const phases = await this.executionPhaseService.listByExecutionId(executionId);
    if (!Array.isArray(phases) || phases.length === 0) {
      return;
    }

    const completionTime = new Date();
    const activePhases = phases
      .filter((phase) => {
        const status = this.readNonEmptyString(phase.status);
        return status === 'running' || status === 'waiting_takeover' || status === 'resumable';
      })
      .sort((left, right) => {
        const leftKey = this.readNonEmptyString(left.phaseKey, left.phase_key) || '';
        const rightKey = this.readNonEmptyString(right.phaseKey, right.phase_key) || '';
        return leftKey.length - rightKey.length;
      });

    for (const phase of activePhases) {
      const phaseKey = this.readNonEmptyString(phase.phaseKey, phase.phase_key);
      if (!phaseKey) {
        continue;
      }
      await this.executionPhaseService.createOrUpdatePhase({
        executionId,
        phaseKey,
        phaseName: this.readNonEmptyString(phase.phaseName, phase.phase_name) || phaseKey,
        phaseType: this.readNonEmptyString(phase.phaseType, phase.phase_type) || 'workflow_activity',
        status: 'completed',
        attempt: this.readInteger(phase.attempt) || 0,
        runtimeSessionId: this.readNonEmptyString(phase.runtimeSessionId, phase.runtime_session_id) || runtimeSessionId,
        input: this.parseJsonRecord(phase.inputJson ?? phase.input_json),
        output: this.parseJsonRecord(phase.outputJson ?? phase.output_json),
        precheck: this.parseJsonRecord(phase.precheckJson ?? phase.precheck_json) as BrowserPhaseCheck | undefined,
        postcheck: this.parseJsonRecord(phase.postcheckJson ?? phase.postcheck_json) as BrowserPhaseCheck | undefined,
        recoveryDecision: this.parseJsonRecord(phase.recoveryDecision ?? phase.recovery_decision_json),
        errorCode: null,
        errorMessage: null,
        startedAt: this.readDateValue(phase.startedAt, phase.started_at) || null,
        completedAt: completionTime,
      });
    }
  }

  private sanitizePhaseKeyFragment(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return normalized || 'activity';
  }

  private extractPhaseStepsFromRuntimeResult(
    result: RuntimeStepInvokeResult,
    step?: Record<string, unknown> | null,
  ): Array<{
    stepIndex: number;
    stepId?: string | null;
    action: string;
    status: string;
    input?: Record<string, unknown> | null;
    output?: Record<string, unknown> | null;
    errorMessage?: string | null;
    errorCode?: string | null;
    snapshotId?: string | null;
    startedAt?: Date | null;
    endedAt?: Date | null;
  }> {
    const phaseResults = this.readRecordArray(result.output?.phaseResults).length > 0
      ? this.readRecordArray(result.output?.phaseResults)
      : this.readRecordArray(result.rawResult?.output, 'phaseResults');

    if (phaseResults.length > 0) {
      const flattenedSteps: Array<{
        stepIndex: number;
        stepId?: string | null;
        action: string;
        status: string;
        input?: Record<string, unknown> | null;
        output?: Record<string, unknown> | null;
        errorMessage?: string | null;
        errorCode?: string | null;
        snapshotId?: string | null;
        startedAt?: Date | null;
        endedAt?: Date | null;
      }> = [];

      phaseResults.forEach((phaseResult, phaseIndex) => {
        const phaseResultBody = this.readRecord(
          phaseResult.result,
          phaseResult.output,
          phaseResult,
        );
        const nestedResults = this.readRecordArray(
          phaseResultBody,
          'results',
        );

        if (nestedResults.length > 0) {
          nestedResults.forEach((nestedResult) => {
            flattenedSteps.push(
              this.mapRuntimePhaseStepRecord(nestedResult, flattenedSteps.length + 1, {
                phaseResult,
                fallbackAction:
                  this.readNonEmptyString(
                    nestedResult.action,
                    nestedResult.command,
                    phaseResult.stepName,
                    phaseResult.phaseName,
                    phaseResult.name,
                    step?.action,
                  ) || 'execute',
              }),
            );
          });
          return;
        }

        flattenedSteps.push(
          this.mapRuntimePhaseStepRecord(phaseResultBody, flattenedSteps.length + 1, {
            phaseResult,
            fallbackAction:
              this.readNonEmptyString(
                phaseResult.stepName,
                phaseResult.phaseName,
                phaseResult.name,
                step?.action,
              ) || `phase_${phaseIndex + 1}`,
          }),
        );
      });

      return flattenedSteps;
    }

    const topLevelStepResults = this.readRecordArray(result.output?.stepResults).length > 0
      ? this.readRecordArray(result.output?.stepResults)
      : this.readRecordArray(result.rawResult?.output, 'stepResults');
    if (topLevelStepResults.length > 0) {
      return topLevelStepResults.map((stepResult, index) => (
        this.mapRuntimePhaseStepRecord(stepResult, index + 1, {
          fallbackAction:
            this.readNonEmptyString(
              stepResult.action,
              stepResult.name,
              step?.action,
            ) || 'execute',
        })
      ));
    }

    return [];
  }

  private mapRuntimePhaseStepRecord(
    stepRecord: Record<string, unknown>,
    stepIndex: number,
    options?: {
      phaseResult?: Record<string, unknown>;
      fallbackAction?: string;
    },
  ): {
    stepIndex: number;
    stepId?: string | null;
    action: string;
    status: string;
    input?: Record<string, unknown> | null;
    output?: Record<string, unknown> | null;
    errorMessage?: string | null;
    errorCode?: string | null;
    snapshotId?: string | null;
    startedAt?: Date | null;
    endedAt?: Date | null;
  } {
    const snapshot = this.readRecord(stepRecord.snapshot);
    const input = this.readRecord(
      stepRecord.input,
      stepRecord.args,
      stepRecord.params,
    );
    const output = this.readRecord(
      stepRecord.output,
      stepRecord.result,
      stepRecord.data,
      stepRecord,
    );

    return {
      stepIndex,
      stepId: this.readNonEmptyString(stepRecord.stepId, stepRecord.step_id, stepRecord.id) || null,
      action:
        this.readNonEmptyString(
          stepRecord.action,
          stepRecord.command,
          stepRecord.name,
          options?.fallbackAction,
        ) || 'execute',
      status: this.normalizeRuntimePhaseStepStatus(stepRecord),
      input,
      output,
      errorMessage: this.readNonEmptyString(stepRecord.errorMessage, stepRecord.error_message, stepRecord.message) || null,
      errorCode: this.readNonEmptyString(stepRecord.errorCode, stepRecord.error_code) || null,
      snapshotId:
        this.readNonEmptyString(
          stepRecord.snapshotId,
          stepRecord.snapshot_id,
          snapshot?.id,
        ) || null,
      startedAt: null,
      endedAt: null,
    };
  }

  private normalizeRuntimePhaseStepStatus(stepRecord: Record<string, unknown>): string {
    const explicitStatus = this.readNonEmptyString(stepRecord.status);
    if (explicitStatus) {
      const normalized = explicitStatus.toLowerCase();
      if (normalized === 'success') {
        return 'completed';
      }
      if (normalized === 'error') {
        return 'failed';
      }
      if (normalized === 'takeover_required') {
        return 'waiting_takeover';
      }
      return normalized;
    }

    if (stepRecord.success === true) {
      return 'completed';
    }
    if (stepRecord.success === false) {
      return 'failed';
    }
    if (this.readNonEmptyString(stepRecord.errorMessage, stepRecord.error_message, stepRecord.message)) {
      return 'failed';
    }
    return 'completed';
  }

  private readRecordArray(source: unknown, key?: string): Record<string, unknown>[] {
    const value = key && source && typeof source === 'object'
      ? (source as Record<string, unknown>)[key]
      : source;
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
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

  private readInteger(...values: unknown[]): number | undefined {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.trunc(value);
      }
      if (typeof value === 'string' && value.trim()) {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return undefined;
  }

  private readDateValue(...values: unknown[]): Date | undefined {
    for (const value of values) {
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
      }
      if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed;
        }
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
      'Execution failed before remaining planned steps were executed',
    );
    await this.updateStatus(input.executionId, EXECUTION_STATUS.FAILED);
    if (input.runtimeSessionId) {
      await this.closeRuntimeSessionQuietly(input.runtimeSessionId, input.executionId, 'runtime_step_failed');
    }
  }

  private async enterRuntimeWaitingInput(
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    requiredInputs: unknown[],
    reason?: string,
  ): Promise<void> {
    const semantic = await this.loadExecutionSemantic(executionId);
    await this.updateStatus(executionId, EXECUTION_STATUS.WAITING_INPUT);
    await this.createEvent(
      executionId,
      EXECUTION_EVENT_TYPE.STEP_WAITING_INPUT,
      {
        requiredInputs,
        reason,
        ...(semantic ? { semantic } : {}),
      },
      {
        runtimeSessionId,
        stepId,
      },
    );
  }

  private async enterPendingApprovalFromRuntimeStep(
    executionId: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        requiresApproval: true,
        approvalStatus: APPROVAL_STATUS.PENDING,
      },
    });
    await this.updateStatus(executionId, EXECUTION_STATUS.PENDING_APPROVAL);
    this.logger.log(`Execution ${executionId} entered pending_approval due to runtime block: ${reason}`);
  }

  private sumUsage(...usages: (LLMUsage | undefined)[]): LLMUsage | undefined {
    const validUsages = usages.filter((u): u is LLMUsage => !!u && (u.total_tokens > 0 || u.prompt_tokens > 0));
    if (validUsages.length === 0) {
      return undefined;
    }

    const result: LLMUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      completion_tokens_details: {
        reasoning_tokens: 0,
      },
    };

    for (const usage of validUsages) {
      result.prompt_tokens += usage.prompt_tokens || 0;
      result.completion_tokens += usage.completion_tokens || 0;
      result.total_tokens += usage.total_tokens || 0;
      if (usage.completion_tokens_details?.reasoning_tokens) {
        if (!result.completion_tokens_details) {
          result.completion_tokens_details = { reasoning_tokens: 0 };
        }
        result.completion_tokens_details.reasoning_tokens =
          (result.completion_tokens_details.reasoning_tokens || 0) +
          usage.completion_tokens_details.reasoning_tokens;
      }
    }

    return result;
  }

  private async skipPendingSteps(
    executionId: string,
    currentStepId: string,
    reason: string,
  ): Promise<void> {
    const skippedStepIds = await this.executionStepService.skipPendingSteps(
      executionId,
      currentStepId,
      reason,
    );

    if (skippedStepIds.length === 0) {
      return;
    }

    await this.createEvent(
      executionId,
      EXECUTION_EVENT_TYPE.STEPS_SKIPPED,
      {
        skippedStepIds,
        reason,
      },
      {
        stepId: currentStepId,
      },
    );
  }

  private async skipSingleStep(
    stepId: string,
    executionId: string,
    reason: string,
  ): Promise<void> {
    await this.executionStepService.skipSingleStep(stepId, reason);

    await this.createEvent(
      executionId,
      EXECUTION_EVENT_TYPE.STEP_SKIPPED,
      { reason },
      {
        stepId,
      },
    );
  }

  private async enterWaitingInput(
    execution: Record<string, unknown>,
    stepId: string,
  ): Promise<void> {
    const missingInputs = this.getMissingRequiredInputs(execution);
    const semantic = this.extractSemanticFromExecution(execution);

    await this.executionStepService.prepareWaitingInputStep(
      execution.id as string,
      stepId,
      missingInputs,
    );

    await this.updateStatus(execution.id as string, EXECUTION_STATUS.WAITING_INPUT);
    await this.createEvent(
      execution.id as string,
      EXECUTION_EVENT_TYPE.STEP_WAITING_INPUT,
      {
        requiredInputs: missingInputs,
        ...(semantic ? { semantic } : {}),
      },
      {
        stepId,
      },
    );
  }

  private extractSemanticFromExecution(execution: Record<string, unknown>): Record<string, unknown> | undefined {
    const normalizedInput = execution.normalizedInputJson as Record<string, unknown> | undefined;
    const semantic = normalizedInput?.semantic;
    if (semantic && typeof semantic === 'object' && !Array.isArray(semantic)) {
      return semantic as Record<string, unknown>;
    }
    return undefined;
  }

  private async loadExecutionSemantic(executionId: string): Promise<Record<string, unknown> | undefined> {
    try {
      const row = await this.prisma.execution.findUnique({
        where: { id: executionId },
        select: { normalizedInputJson: true },
      });
      if (!row?.normalizedInputJson || typeof row.normalizedInputJson !== 'object' || Array.isArray(row.normalizedInputJson)) {
        return undefined;
      }
      const semantic = (row.normalizedInputJson as Record<string, unknown>).semantic;
      if (semantic && typeof semantic === 'object' && !Array.isArray(semantic)) {
        return semantic as Record<string, unknown>;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private getMissingRequiredInputs(execution: Record<string, unknown>): PlannerRequiredInput[] {
    return this.getRequiredInputs(execution).filter((item) => item?.missing);
  }

  private hasMeaningfulSubmittedInputValue(value: unknown): boolean {
    if (value === undefined || value === null) {
      return false;
    }
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    if (Array.isArray(value)) {
      return value.some((item) => this.hasMeaningfulSubmittedInputValue(item));
    }
    if (typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).some((item) => this.hasMeaningfulSubmittedInputValue(item));
    }
    return true;
  }

  private normalizeSubmittedInputValue(value: unknown, expectedType: string): unknown {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (Array.isArray(value)) {
      const normalized = value
        .map((item) => this.normalizeSubmittedInputValue(item, expectedType))
        .filter((item) => item !== undefined);
      return normalized.length > 0 ? normalized : undefined;
    }
    if (typeof value === 'object') {
      const normalizedEntries = Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, this.normalizeSubmittedInputValue(item, expectedType)] as const)
        .filter(([, item]) => item !== undefined);
      return normalizedEntries.length > 0 ? Object.fromEntries(normalizedEntries) : undefined;
    }
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    if (!trimmed || this.isPlaceholderTextValue(trimmed)) {
      return undefined;
    }

    if (expectedType === 'date') {
      return this.normalizeDateInputValue(trimmed) || trimmed;
    }

    return trimmed;
  }

  private normalizeDateInputValue(value: string): string | undefined {
    const normalized = value.trim();
    const isoMatch = normalized.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const zhMatch = normalized.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/);
    if (zhMatch) {
      const [, year, month, day] = zhMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    return undefined;
  }

  private isPlaceholderTextValue(value: string): boolean {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/^[`"'“”‘’]+|[`"'“”‘’。．\.,，；;：:、!！?？]+$/g, '');

    if (!normalized) {
      return true;
    }

    return new Set([
      '-',
      '--',
      'n/a',
      'n.a.',
      'n.a',
      'na',
      'none',
      'null',
      'undefined',
      'unknown',
      'tbd',
      'pending',
      'notprovided',
      'notspecified',
      'notavailable',
      '待补充',
      '待确认',
      '待定',
      '暂未提供',
      '未提供',
      '未填写',
      '未确定',
      '未知',
      '未说明',
      '未注明',
      '未提及',
      '未明确',
      '留空',
      '空字符串',
      '空值',
      '暂无',
      '暂无数据',
      '无',
      '无数据',
      '无具体信息',
      '不详',
      'to be confirmed',
      'to be determined',
    ]).has(normalized);
  }

  private getRequiredInputs(execution: Record<string, unknown>): PlannerRequiredInput[] {
    const normalizedInput = execution.normalizedInputJson as Record<string, unknown> | undefined;
    const requiredInputs = Array.isArray(normalizedInput?.requiredInputs)
      ? normalizedInput.requiredInputs as PlannerRequiredInput[]
      : [];

    return requiredInputs;
  }

  private extractStepUrl(
    step: Record<string, unknown>,
    execution: Record<string, unknown>,
  ): string | undefined {
    const target = step.targetJson as Record<string, unknown> | undefined;
    const input = step.inputJson as Record<string, unknown> | undefined;
    const normalizedInput = execution.normalizedInputJson as Record<string, unknown> | undefined;
    const rawInput = execution.inputJson as Record<string, unknown> | undefined;

    if (typeof target?.url === 'string' && target.url.trim()) {
      return target.url;
    }
    if (typeof input?.url === 'string' && input.url.trim()) {
      return input.url;
    }
    if (typeof normalizedInput?.url === 'string' && normalizedInput.url.trim()) {
      return normalizedInput.url;
    }
    if (typeof rawInput?.url === 'string' && rawInput.url.trim()) {
      return rawInput.url;
    }

    return undefined;
  }

  async delete(id: string, userId: string, requester?: RequestUserContext): Promise<{ success: boolean }> {
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
    requester?: RequestUserContext,
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

    this.logger.log(`Deleted ${executionIds.length} executions before ${beforeDate} by user ${userId}`);
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
