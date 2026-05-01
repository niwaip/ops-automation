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

interface BrowserExecuteStepRequest {
  executionId: string;
  runtimeSessionId: string;
  stepId: string;
  action: 'goto';
  target: string;
  args?: Record<string, unknown>;
}

interface BrowserExecuteStepResult {
  success: boolean;
  snapshotId?: string;
  output?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  shouldTakeover: boolean;
  takeoverReason?: string;
}

interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
}

interface CapabilityRuntimeExecuteResult {
  releaseId: string;
  capabilityId: string;
  capabilityVersion?: string | null;
  publishedSkillId: string;
  runtime: string;
  fn?: string;
  taskQueue?: string;
  success: boolean;
  output?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  usage?: LLMUsage;
  logs: string[];
  error?: string | null;
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
  metadata?: Record<string, unknown>;
  usage?: LLMUsage;
}

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);
  private readonly sessionBrokerUrl = process.env.SESSION_BROKER_URL || 'http://session-broker:3002';
  private readonly browserWorkerUrl = process.env.BROWSER_WORKER_URL || 'http://ops-browser-worker:3004';
  private readonly authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://ops-auth:3001';
  private readonly aiOrchestratorUrl =
    process.env.AI_ORCHESTRATOR_URL || process.env.AI_SERVICE_URL || 'http://ops-ai-orchestrator:3007';

  private readonly eventSubject = new Subject<ExecutionStreamEventPayload>();
  private readonly executionEventService: ExecutionEventService;
  private readonly executionStateService: ExecutionStateService;
  private readonly executionStepService: ExecutionStepService;

  constructor(
    private readonly prisma: PrismaService,
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
    };

    const generatedPlanDraft = await this.generatePlanDraft(userId, resolvedDto, options?.authToken);
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

    const user = await this.prisma.user.findUnique({
      where: { id: execution.createdBy },
      select: { username: true },
    });

    return this.toDto(execution, user?.username);
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

    const updatedRequiredInputs = requiredInputs.map((item) => {
      if (!submittedKeys.includes(item.name)) {
        return item;
      }

      return {
        ...item,
        value: dto.input[item.name],
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
      ...dto.input,
      input: {
        ...normalizedInputData,
        ...dto.input,
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
          outputJson: this.asJsonValue(dto.input),
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
      input: dto.input,
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

    const createdByIds = Array.from(new Set(executions.map((execution) => execution.createdBy)));
    const users = createdByIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: createdByIds } },
          select: { id: true, username: true },
        })
      : [];
    const usernameMap = new Map(users.map((user) => [user.id, user.username]));

    return {
      data: executions.map((execution) => this.toDto(execution, usernameMap.get(execution.createdBy))),
      total,
      page,
      pageSize,
    };
  }

  private async updateStatus(id: string, newStatus: ExecutionStatus): Promise<void> {
    const event = await this.executionStateService.updateStatus(id, newStatus);
    this.eventSubject.next(event);
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

    await axios.post<{ success: boolean; message: string }>(`${this.browserWorkerUrl}/browser/init`, {});
    await this.executionStepService.startStep(step.id);

    const result = await axios.post<BrowserExecuteStepResult>(
      `${this.browserWorkerUrl}/browser/execute-step`,
      {
        executionId: execution.id as string,
        runtimeSessionId,
        stepId: step.id,
        action: 'goto',
        target: url,
      } satisfies BrowserExecuteStepRequest,
    );

    await this.handleBrowserStepResult(execution.id as string, runtimeSessionId, step.id, result.data);
  }

  private async handleBrowserStepResult(
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    result: BrowserExecuteStepResult,
  ): Promise<void> {
    await this.executionStepService.finishBrowserStep(stepId, result);

    await this.createEvent(
      executionId,
      result.success ? EXECUTION_EVENT_TYPE.STEP_SUCCEEDED : EXECUTION_EVENT_TYPE.STEP_FAILED,
      {
      runtimeSessionId,
      stepId,
      snapshotId: result.snapshotId,
      errorCode: result.errorCode,
      shouldTakeover: result.shouldTakeover,
      },
    );

    if (result.shouldTakeover) {
      await this.takeover(executionId, 'system', {
        reason: result.takeoverReason || 'Browser runtime requested human takeover',
      });
      return;
    }

    if (result.success) {
      await this.advanceExecutionFlow(executionId, runtimeSessionId);
      return;
    }

    await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        failureReason: result.errorMessage || 'Browser step failed',
        failureCode: result.errorCode || 'BROWSER_STEP_FAILED',
      },
    });
    await this.skipPendingSteps(executionId, stepId, 'Execution failed before remaining planned steps were executed');
    await this.updateStatus(executionId, EXECUTION_STATUS.FAILED);
  }

  private toDto(execution: any, createdByName?: string): ExecutionDto {
    return mapExecutionToDto(execution, createdByName);
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
      risk_summary: {
        ...planDraft.risk_summary,
        level: missingRequiredInputs.length > 0 ? planDraft.risk_summary.level : 'low',
        items: riskItems.length > 0 ? riskItems : ['no_material_risk_detected'],
      },
    };
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

        await this.executeBrowserGotoStep(executionId, runtimeSessionId, nextStep.id, stepUrl);
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
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    url: string,
  ): Promise<void> {
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

    await axios.post<{ success: boolean; message: string }>(`${this.browserWorkerUrl}/browser/init`, {});
    await this.executionStepService.startStep(stepId, {
      targetJson: { url },
      inputJson: { url },
    });

    const result = await axios.post<BrowserExecuteStepResult>(
      `${this.browserWorkerUrl}/browser/execute-step`,
      {
        executionId,
        runtimeSessionId,
        stepId,
        action: 'goto',
        target: url,
      } satisfies BrowserExecuteStepRequest,
    );

    await this.handleBrowserStepResult(executionId, runtimeSessionId, stepId, result.data);
  }

  private async executeSystemSkillStep(
    execution: Record<string, unknown>,
    runtimeSessionId: string,
    stepId: string,
  ): Promise<void> {
    const executionId = execution.id as string;
    this.logger.log(`Executing system skill step ${stepId} for execution ${executionId}`);
    const capabilityId = this.resolveExecutionCapabilityId(execution);
    if (!capabilityId) {
      this.logger.error(`Skill execution step ${stepId} is missing capability identifier for execution ${executionId}`);
      await this.skipSingleStep(stepId, executionId, 'Skill execution step is missing capability identifier');
      await this.advanceExecutionFlow(executionId, runtimeSessionId);
      return;
    }

    const capabilityVersion = this.resolveExecutionCapabilityVersion(execution);
    const input = this.resolveExecutionInput(execution);
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
      this.logger.log(`Sending POST request to ${this.authServiceUrl}/capability-releases/runtime/execute`);
      const result = await axios.post<CapabilityRuntimeExecuteResult>(
        `${this.authServiceUrl}/capability-releases/runtime/execute`,
        {
          capabilityId,
          capabilityVersion,
          executionId,
          stepId,
          input,
        },
      );
      this.logger.log(`Received result from auth runtime: ${JSON.stringify(result.data)}`);
      await this.handleSystemSkillStepResult(executionId, runtimeSessionId, stepId, result.data);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'response' in error
            ? String((error as { response?: { data?: unknown } }).response?.data || 'Unknown error')
            : 'Unknown error';

      this.logger.error(`Failed to execute system skill step ${stepId}: ${message}`);
      await this.handleSystemSkillStepResult(executionId, runtimeSessionId, stepId, {
        releaseId: '',
        capabilityId,
        capabilityVersion,
        publishedSkillId: capabilityId,
        runtime: 'capability_runtime',
        success: false,
        logs: [],
        error: message,
      });
    }
  }

  private async handleSystemSkillStepResult(
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    result: CapabilityRuntimeExecuteResult,
  ): Promise<void> {
    const output = result.output || result.result || null;

    await this.executionStepService.finishSystemSkillStep(stepId, result);

    await this.createEvent(
      executionId,
      result.success ? EXECUTION_EVENT_TYPE.STEP_SUCCEEDED : EXECUTION_EVENT_TYPE.STEP_FAILED,
      {
      runtimeSessionId,
      stepId,
      result: result.result || result.output,
      error: result.error,
      },
    );

    if (result.success) {
      // 获取当前 usage 并累加
      const currentExecution = await this.prisma.execution.findUnique({
        where: { id: executionId },
        select: { normalizedInputJson: true },
      });

      const normalizedInput = currentExecution?.normalizedInputJson as Record<string, unknown> | undefined;
      const currentUsage = normalizedInput?.__usage as unknown as LLMUsage | undefined;
      const stepUsage = result.usage;
      const totalUsage = this.sumUsage(currentUsage, stepUsage);

      // 更新 normalizedInputJson 中的 usage
      const updatedNormalizedInput = {
        ...(normalizedInput || {}),
        ...(totalUsage ? { __usage: totalUsage } : {}),
      };

      await this.prisma.execution.update({
        where: { id: executionId },
        data: {
          resultJson: this.asJsonValue(output),
          normalizedInputJson: this.asJsonValue(updatedNormalizedInput),
        },
      });
      await this.advanceExecutionFlow(executionId, runtimeSessionId);
      return;
    }

    await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        failureReason: result.error || 'Capability runtime execution failed',
        failureCode: 'CAPABILITY_RUNTIME_FAILED',
      },
    });
    await this.skipPendingSteps(executionId, stepId, 'Execution failed before remaining planned steps were executed');
    await this.updateStatus(executionId, EXECUTION_STATUS.FAILED);
  }

  private sumUsage(...usages: (LLMUsage | undefined)[]): LLMUsage | undefined {
    const validUsages = usages.filter((u): u is LLMUsage => !!u && (u.total_tokens > 0 || u.prompt_tokens > 0));
    if (validUsages.length === 0) return undefined;

    const result: LLMUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      completion_tokens_details: {
        reasoning_tokens: 0,
      },
    };

    for (const usage of validUsages) {
      result.prompt_tokens += (usage.prompt_tokens || 0);
      result.completion_tokens += (usage.completion_tokens || 0);
      result.total_tokens += (usage.total_tokens || 0);
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
      },
      {
        stepId,
      },
    );
  }

  private getMissingRequiredInputs(execution: Record<string, unknown>): PlannerRequiredInput[] {
    return this.getRequiredInputs(execution).filter((item) => item?.missing);
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

  private resolveExecutionCapabilityId(execution: Record<string, unknown>): string | undefined {
    const normalizedInput = execution.normalizedInputJson as Record<string, unknown> | undefined;
    const capabilityMatch = normalizedInput?.capabilityMatch as Record<string, unknown> | undefined;
    const skillMatch = normalizedInput?.skillMatch as Record<string, unknown> | undefined;

    if (typeof capabilityMatch?.capabilityId === 'string' && capabilityMatch.capabilityId.trim()) {
      return capabilityMatch.capabilityId;
    }
    if (typeof skillMatch?.skill_id === 'string' && skillMatch.skill_id.trim()) {
      return skillMatch.skill_id;
    }
    const fromExecution = execution.skillId;
    if (typeof fromExecution === 'string' && fromExecution.trim()) {
      return fromExecution;
    }

    return undefined;
  }

  private resolveExecutionCapabilityVersion(execution: Record<string, unknown>): string | undefined {
    return typeof execution.skillVersion === 'string' && execution.skillVersion.trim()
      ? execution.skillVersion
      : undefined;
  }

  private resolveExecutionInput(execution: Record<string, unknown>): Record<string, unknown> {
    const normalizedInput = execution.normalizedInputJson as Record<string, unknown> | undefined;
    if (normalizedInput?.input && typeof normalizedInput.input === 'object') {
      return normalizedInput.input as Record<string, unknown>;
    }

    return (execution.inputJson as Record<string, unknown> | undefined) || {};
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
