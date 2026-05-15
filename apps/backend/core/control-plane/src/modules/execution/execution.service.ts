import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { Subject, filter } from 'rxjs';
import { APPROVAL_STATUS } from './contracts/approval-status';
import { EXECUTION_STATUS, ExecutionStatus } from './contracts/execution-status';
import { EXECUTION_EVENT_TYPE } from './contracts/execution-event-type';
import { EXECUTION_STEP_STATUS } from './contracts/execution-step-status';
import { CreateExecutionEventOptions, ExecutionEventService, ExecutionStreamEventPayload } from './execution-event.service';
import { mapExecutionStepToDto, mapExecutionToDto } from './execution.mapper';
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
  ListExecutionsDto,
  RuntimeSessionSummaryDto,
  SubmitInputDto,
  ApprovalDecisionDto,
} from './execution.dto';
import axios from 'axios';
import {
  getAiOrchestratorUrl,
  getAuthServiceUrl,
  getSessionBrokerUrl,
} from '../../config/service-endpoints';
import { RuntimeStepInvokeResult } from './runtime-adapter.interface';
import { RuntimeExecutionOrchestrator } from './runtime-execution.orchestrator';
import { RuntimeResultInterpreter } from './runtime-result.interpreter';
import { RuntimeStepRequestFactory } from './runtime-step-request.factory';

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

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);
  private readonly sessionBrokerUrl = getSessionBrokerUrl();
  private readonly authServiceUrl = getAuthServiceUrl();
  private readonly aiOrchestratorUrl = getAiOrchestratorUrl();

  private readonly eventSubject = new Subject<ExecutionStreamEventPayload>();
  private readonly executionEventService: ExecutionEventService;
  private readonly executionStateService: ExecutionStateService;
  private readonly executionStepService: ExecutionStepService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runtimeExecutionOrchestrator: RuntimeExecutionOrchestrator,
    private readonly runtimeResultInterpreter: RuntimeResultInterpreter,
    private readonly runtimeStepRequestFactory: RuntimeStepRequestFactory,
    executionEventService?: ExecutionEventService,
    executionStateService?: ExecutionStateService,
    executionStepService?: ExecutionStepService,
  ) {
    this.executionEventService = executionEventService || new ExecutionEventService(prisma);
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
    const planDraft = this.reconcilePlanDraftWithInput(generatedPlanDraft, resolvedDto.input);
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

    return this.toDto(execution);
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

  async takeover(id: string, userId: string, dto: TakeoverExecutionDto, requester?: RequestUserContext): Promise<ExecutionDto> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    this.ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (!canTransitionExecutionStatus(execution.status as ExecutionStatus, EXECUTION_STATUS.HUMAN_CONTROL)) {
      throw new BadRequestException(`Cannot takeover from status ${execution.status}`);
    }

    // Update execution
    await this.prisma.execution.update({
      where: { id },
      data: {
        status: EXECUTION_STATUS.HUMAN_CONTROL,
        takeoverRequired: true,
        takeoverReason: dto.reason,
      },
    });

    // Freeze runtime session
    const runtimeSession = await this.prisma.runtimeSession.findFirst({
      where: { executionId: id },
    });

    if (runtimeSession) {
      try {
        // Call new RuntimeSession API (state update is handled by runtime-session service)
        await axios.post(`${this.sessionBrokerUrl}/runtime-sessions/${runtimeSession.id}/freeze`, {
          reason: dto.reason,
        });
      } catch (error) {
        this.logger.error(`Failed to freeze runtime session for execution ${id}`);
      }
    }

    // Create event
    await this.createEvent(id, EXECUTION_EVENT_TYPE.EXECUTION_TAKEOVER_REQUESTED, {
      userId,
      reason: dto.reason,
    });

    this.logger.log(`Execution ${id} entered ${EXECUTION_STATUS.HUMAN_CONTROL}`);

    return this.getById(id, requester || { id: userId });
  }

  async resume(id: string, userId: string, dto: ResumeExecutionDto, requester?: RequestUserContext): Promise<ExecutionDto> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    this.ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (execution.status !== EXECUTION_STATUS.HUMAN_CONTROL) {
      throw new BadRequestException(`Execution ${id} is not in ${EXECUTION_STATUS.HUMAN_CONTROL} status`);
    }

    // Update execution
    await this.updateStatus(id, EXECUTION_STATUS.RUNNING);

    // Resume runtime session
    const runtimeSession = await this.prisma.runtimeSession.findFirst({
      where: { executionId: id },
    });

    if (runtimeSession) {
      try {
        // Call new RuntimeSession API (state update is handled by runtime-session service)
        await axios.post(`${this.sessionBrokerUrl}/runtime-sessions/${runtimeSession.id}/resume`, {
          stepId: dto.stepId,
        });
      } catch (error) {
        this.logger.error(`Failed to resume runtime session for execution ${id}`);
      }
    }

    // Create event
    await this.createEvent(id, EXECUTION_EVENT_TYPE.EXECUTION_RESUMED, {
      userId,
      stepId: dto.stepId,
      comment: dto.comment,
    });

    this.logger.log(`Execution ${id} resumed`);

    return this.getById(id, requester || { id: userId });
  }

  async releaseHumanControl(id: string, userId: string, dto: ReleaseHumanControlDto, requester?: RequestUserContext): Promise<ExecutionDto> {
    return this.resume(id, userId, dto, requester);
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
    const updatedNormalized = {
      ...normalized,
      ...(totalUsage ? { __usage: totalUsage } : {}),
      ...normalizedSubmittedInput,
      input: {
        ...normalizedInputData,
        ...normalizedSubmittedInput,
      },
      requiredInputs: updatedRequiredInputs,
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

    await this.advanceExecutionFlow(id, runtimeSession.id);
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

    return {
      data: executions.map((execution) => this.toDto(execution)),
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
          this.takeover(executionId, 'system', {
            reason,
          }).then(() => undefined),
      },
      result,
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
    await this.executionStepService.setCurrentStep(executionId, stepId);

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
      }),
    );

    await this.handleBrowserStepResult(executionId, runtimeSessionId, stepId, result);
  }

  private async executeSystemSkillStep(
    execution: Record<string, unknown>,
    runtimeSessionId: string,
    stepId: string,
  ): Promise<void> {
    const executionId = execution.id as string;
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
      });
      if (!request) {
        throw new Error('Skill runtime request is missing capability identifier');
      }

      const result = await this.runtimeExecutionOrchestrator.executeStep(request);
      await this.handleSystemSkillStepResult(executionId, runtimeSessionId, stepId, result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'response' in error
            ? String((error as { response?: { data?: unknown } }).response?.data || 'Unknown error')
            : 'Unknown error';

      this.logger.error(`Failed to execute system skill step ${stepId}: ${message}`);
      await this.handleSystemSkillStepResult(executionId, runtimeSessionId, stepId, {
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
      });
    }
  }

  private async handleSystemSkillStepResult(
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    result: RuntimeStepInvokeResult,
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
        enterWaitingInput: (requiredInputs, reason) =>
          this.enterRuntimeWaitingInput(executionId, runtimeSessionId, stepId, requiredInputs, reason),
        enterPendingApproval: (reason) =>
          this.enterPendingApprovalFromRuntimeStep(executionId, reason),
      },
      result,
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
}
