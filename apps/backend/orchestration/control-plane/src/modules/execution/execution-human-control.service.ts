import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EXECUTION_STATUS, ExecutionStatus } from './contracts/execution-status';
import { EXECUTION_STEP_STATUS } from './contracts/execution-step-status';
import { EXECUTION_EVENT_TYPE } from './contracts/execution-event-type';
import { canTransitionExecutionStatus, isTerminalExecutionStatus } from './execution-transition-policy';
import { ExecutionPhaseService } from './execution-phase.service';
import { ExecutionStepService } from './execution-step.service';
import { CreateExecutionEventOptions } from './execution-event.service';
import {
  ExecutionDto,
  ReconcilePhaseTakeoverDto,
  ResumeExecutionDto,
  TakeoverExecutionDto,
} from './execution.dto';

interface RequestUserContext {
  id: string;
  role?: string;
}

interface ExecutionPhaseRecord {
  id: string;
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

interface ExecutionStepPhaseMetadata {
  phaseKey: string;
  phaseName: string;
  phaseType: string;
}

interface ExecutionHumanControlHooks {
  getExecutionDto: (id: string, requester?: RequestUserContext) => Promise<ExecutionDto>;
  emitEvent: (
    executionId: string,
    eventType: typeof EXECUTION_EVENT_TYPE[keyof typeof EXECUTION_EVENT_TYPE],
    payload: unknown,
    options?: CreateExecutionEventOptions,
  ) => Promise<void>;
  updateStatus: (id: string, newStatus: ExecutionStatus) => Promise<void>;
  freezeRuntimeSessionQuietly: (
    runtimeSessionId: string | null | undefined,
    executionId: string,
    reason: string,
  ) => Promise<void>;
  resumeRuntimeSessionQuietly: (
    runtimeSessionId: string | null | undefined,
    executionId: string,
    stepId?: string,
  ) => Promise<void>;
  advanceExecutionFlow: (executionId: string, runtimeSessionId: string) => Promise<void>;
}

@Injectable()
export class ExecutionHumanControlService {
  private readonly logger = new Logger(ExecutionHumanControlService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionPhaseService: ExecutionPhaseService,
    private readonly executionStepService: ExecutionStepService,
  ) {}

  async takeover(
    id: string,
    userId: string,
    dto: TakeoverExecutionDto,
    hooks: ExecutionHumanControlHooks,
    requester?: RequestUserContext,
  ): Promise<ExecutionDto> {
    const execution = await this.getExecutionOrThrow(id);
    this.ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (!canTransitionExecutionStatus(execution.status as ExecutionStatus, EXECUTION_STATUS.HUMAN_CONTROL)) {
      throw new BadRequestException(`Cannot takeover from status ${execution.status}`);
    }

    const currentPhase = await this.getCurrentPhaseRecord(
      id,
      (execution as unknown as Record<string, unknown>).currentPhaseKey as string | null | undefined,
    );
    await this.enterHumanControl(id, dto.reason, hooks, currentPhase?.runtime_session_id);

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

    await hooks.emitEvent(id, EXECUTION_EVENT_TYPE.EXECUTION_TAKEOVER_REQUESTED, {
      userId,
      reason: dto.reason,
      ...(currentPhase?.phase_key ? { phaseKey: currentPhase.phase_key } : {}),
    });

    this.logger.log(`Execution ${id} entered ${EXECUTION_STATUS.HUMAN_CONTROL}`);
    return hooks.getExecutionDto(id, requester || { id: userId });
  }

  async resume(
    id: string,
    userId: string,
    dto: ResumeExecutionDto,
    hooks: ExecutionHumanControlHooks,
    requester?: RequestUserContext,
  ): Promise<ExecutionDto> {
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
      await this.resolvePhaseTakeoverAndMarkRunning(id, currentPhase, userId);
    }

    const runtimeSessionId = await this.exitHumanControlAndResume(
      id,
      hooks,
      dto.stepId,
      currentPhase?.runtime_session_id,
    );
    await hooks.emitEvent(id, EXECUTION_EVENT_TYPE.EXECUTION_RESUMED, {
      userId,
      stepId: dto.stepId,
      comment: dto.comment,
      ...(currentPhase?.phase_key ? { phaseKey: currentPhase.phase_key } : {}),
    });

    if (runtimeSessionId) {
      this.runAdvanceExecutionFlow(id, runtimeSessionId, hooks);
    }

    this.logger.log(`Execution ${id} resumed`);
    return hooks.getExecutionDto(id, requester || { id: userId });
  }

  async takeoverPhase(
    executionId: string,
    phaseKey: string,
    userId: string,
    dto: TakeoverExecutionDto,
    hooks: ExecutionHumanControlHooks,
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

    await this.enterHumanControl(executionId, dto.reason, hooks, phase.runtime_session_id);
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
    await hooks.emitEvent(executionId, EXECUTION_EVENT_TYPE.EXECUTION_TAKEOVER_REQUESTED, {
      userId,
      reason: dto.reason,
      phaseKey,
    });

    return hooks.getExecutionDto(executionId, requester || { id: userId });
  }

  async reconcilePhaseTakeover(
    executionId: string,
    phaseKey: string,
    userId: string,
    dto: ReconcilePhaseTakeoverDto,
    hooks: ExecutionHumanControlHooks,
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

    return hooks.getExecutionDto(executionId, requester || { id: userId });
  }

  async resumePhaseTakeover(
    executionId: string,
    phaseKey: string,
    userId: string,
    dto: ResumeExecutionDto,
    hooks: ExecutionHumanControlHooks,
    requester?: RequestUserContext,
  ): Promise<ExecutionDto> {
    const execution = await this.getExecutionOrThrow(executionId);
    this.ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (execution.status !== EXECUTION_STATUS.HUMAN_CONTROL) {
      throw new BadRequestException(`Execution ${executionId} is not in ${EXECUTION_STATUS.HUMAN_CONTROL} status`);
    }

    const phase = await this.requirePhaseRecord(executionId, phaseKey);
    await this.resolvePhaseTakeoverAndMarkRunning(executionId, phase, userId, dto.comment);
    const runtimeSessionId = await this.exitHumanControlAndResume(
      executionId,
      hooks,
      dto.stepId,
      phase.runtime_session_id,
    );
    await hooks.emitEvent(executionId, EXECUTION_EVENT_TYPE.EXECUTION_RESUMED, {
      userId,
      stepId: dto.stepId,
      comment: dto.comment,
      phaseKey,
    });

    if (runtimeSessionId) {
      this.runAdvanceExecutionFlow(executionId, runtimeSessionId, hooks);
    }

    return hooks.getExecutionDto(executionId, requester || { id: userId });
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
    hooks: ExecutionHumanControlHooks,
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
    await hooks.freezeRuntimeSessionQuietly(runtimeSessionId, executionId, reason);
    return runtimeSessionId;
  }

  private async exitHumanControlAndResume(
    executionId: string,
    hooks: ExecutionHumanControlHooks,
    stepId?: string,
    preferredRuntimeSessionId?: string | null,
  ): Promise<string | null> {
    await hooks.updateStatus(executionId, EXECUTION_STATUS.RUNNING);
    await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        takeoverRequired: false,
        takeoverReason: null,
      },
    });

    const runtimeSessionId = await this.resolveExecutionRuntimeSessionId(executionId, preferredRuntimeSessionId);
    await hooks.resumeRuntimeSessionQuietly(runtimeSessionId, executionId, stepId);
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

  private extractStepPhaseMetadata(
    step?: Record<string, unknown> | null,
  ): ExecutionStepPhaseMetadata | undefined {
    if (!step) {
      return undefined;
    }

    const targetJson = this.readJsonRecord(step.targetJson);
    const inputJson = this.readJsonRecord(step.inputJson);
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

  private readJsonRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
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

  private runAdvanceExecutionFlow(
    executionId: string,
    runtimeSessionId: string,
    hooks: ExecutionHumanControlHooks,
  ): void {
    hooks.advanceExecutionFlow(executionId, runtimeSessionId).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to asynchronously resume execution ${executionId}: ${message}`);
    });
  }
}
