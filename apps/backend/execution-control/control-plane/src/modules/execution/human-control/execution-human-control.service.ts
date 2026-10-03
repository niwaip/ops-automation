import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EXECUTION_STATUS, ExecutionStatus } from '../contracts/execution-status';
import { EXECUTION_STEP_STATUS } from '../contracts/execution-step-status';
import { EXECUTION_EVENT_TYPE } from '../contracts/execution-event-type';
import {
  canTransitionExecutionStatus,
  isTerminalExecutionStatus,
} from '../state/execution-transition-policy';
import { ExecutionPhaseService } from '../state/execution-phase.service';
import { ExecutionStepService } from '../step-runner/steps/execution-step.service';
import { CreateExecutionEventOptions } from '../state/execution-event.service';
import {
  ExecutionDto,
  ReconcilePhaseTakeoverDto,
  ResumeExecutionDto,
  TakeoverExecutionDto,
} from '../state/execution.dto';
import { ensureExecutionPermission } from '../shared/execution-permission.util';
import { DeterministicPlanSchedulerService } from '../plan-runtime/deterministic-plan-scheduler.service';
import { ExecutionOutboxService } from '../outbox/execution-outbox.service';

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
  recovery_decision_json?: Record<string, unknown> | null;
  postcheck_json?: Record<string, unknown> | null;
  error_code?: string | null;
  error_message?: string | null;
  started_at?: Date | string | null;
  completed_at?: Date | string | null;
}

interface ExecutionStepPhaseMetadata {
  phaseKey: string;
  phaseName: string;
  phaseType: string;
}

export interface ExecutionHumanControlHooks {
  getExecutionDto: (id: string, requester?: RequestUserContext) => Promise<ExecutionDto>;
  emitEvent: (
    executionId: string,
    eventType: (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE],
    payload: unknown,
    options?: CreateExecutionEventOptions
  ) => Promise<void>;
  updateStatus: (id: string, newStatus: ExecutionStatus) => Promise<void>;
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

@Injectable()
export class ExecutionHumanControlService {
  private readonly logger = new Logger(ExecutionHumanControlService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionPhaseService: ExecutionPhaseService,
    private readonly executionStepService: ExecutionStepService,
    @Optional() private readonly planSchedulerService?: DeterministicPlanSchedulerService,
    @Optional() private readonly outbox?: ExecutionOutboxService
  ) {}

  async takeover(
    id: string,
    userId: string,
    dto: TakeoverExecutionDto,
    hooks: ExecutionHumanControlHooks,
    requester?: RequestUserContext
  ): Promise<ExecutionDto> {
    const execution = await this.getExecutionOrThrow(id);
    ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (
      !canTransitionExecutionStatus(
        execution.status as ExecutionStatus,
        EXECUTION_STATUS.HUMAN_CONTROL
      )
    ) {
      throw new BadRequestException(`Cannot takeover from status ${execution.status}`);
    }

    const currentPhase = await this.getCurrentPhaseRecord(
      id,
      (execution as unknown as Record<string, unknown>).currentPhaseKey as string | null | undefined
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
    requester?: RequestUserContext
  ): Promise<ExecutionDto> {
    const execution = await this.getExecutionOrThrow(id);
    ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (execution.status !== EXECUTION_STATUS.HUMAN_CONTROL) {
      throw new BadRequestException(
        `Execution ${id} is not in ${EXECUTION_STATUS.HUMAN_CONTROL} status`
      );
    }

    let didFinishTargetStep = false;
    const currentPhase = await this.getCurrentPhaseRecord(
      id,
      (execution as unknown as Record<string, unknown>).currentPhaseKey as string | null | undefined
    );
    if (currentPhase?.id) {
      didFinishTargetStep = await this.resolvePhaseTakeoverAndMarkRunning(id, currentPhase, userId, dto.comment);
    } else {
      const waitingPhase = await this.findWaitingPhase(id);
      if (waitingPhase) {
        didFinishTargetStep = await this.resolvePhaseTakeoverAndMarkRunning(id, waitingPhase, userId, dto.comment);
      } else {
        await this.resolveOrRequeueStepWithoutPhase(id, userId, dto.comment);
      }
    }

    const effectiveStepId = didFinishTargetStep ? undefined : dto.stepId;
    const runtimeSessionId = await this.exitHumanControlAndResume(
      id,
      hooks,
      effectiveStepId,
      currentPhase?.runtime_session_id
    );
    await hooks.emitEvent(id, EXECUTION_EVENT_TYPE.EXECUTION_RESUMED, {
      userId,
      stepId: effectiveStepId,
      comment: dto.comment,
      ...(currentPhase?.phase_key ? { phaseKey: currentPhase.phase_key } : {}),
    });

    if (execution.executionMode === 'deterministic_plan') {
      if (this.planSchedulerService) {
        await this.advanceDeterministicExecution(id, userId, requester, effectiveStepId);
      }
    } else if (runtimeSessionId) {
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
    requester?: RequestUserContext
  ): Promise<ExecutionDto> {
    const execution = await this.getExecutionOrThrow(executionId);
    ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (isTerminalExecutionStatus(execution.status as ExecutionStatus)) {
      throw new BadRequestException(
        `Cannot takeover phase from terminal execution status ${execution.status}`
      );
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
    requester?: RequestUserContext
  ): Promise<ExecutionDto> {
    const execution = await this.getExecutionOrThrow(executionId);
    ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (execution.status !== EXECUTION_STATUS.HUMAN_CONTROL) {
      throw new BadRequestException(
        `Execution ${executionId} is not in ${EXECUTION_STATUS.HUMAN_CONTROL} status`
      );
    }

    const phase = await this.requirePhaseRecord(executionId, phaseKey);

    let takeover = await this.prisma.executionTakeover.findFirst({
      where: {
        executionId,
        phaseId: phase.id,
        status: { in: ['requested', 'pending'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!takeover) {
      takeover = await this.prisma.executionTakeover.findFirst({
        where: {
          executionId,
          phaseId: phase.id,
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    const patchNote =
      typeof (dto.patch as any)?.note === 'string'
        ? (dto.patch as any).note.trim()
        : typeof (dto.patch as any)?.comment === 'string'
        ? (dto.patch as any).comment.trim()
        : null;
    const effectiveResolutionNote = dto.comment?.trim() || patchNote || null;
    const authoritativeResolvedAt = new Date().toISOString();

    await this.executionPhaseService.markResumable(executionId, phase.phase_key!, {
      phaseName: phase.phase_name || phase.phase_key!,
      phaseType: phase.phase_type || 'workflow_execution',
      attempt: phase.attempt || 1,
      runtimeSessionId: phase.runtime_session_id || null,
      output: phase.output_json || null,
      postcheck: phase.postcheck_json || null,
      recoveryDecision: {
        takeoverId: takeover?.id || null,
        reconciledBy: dto.resolvedBy || userId,
        resolvedBy: dto.resolvedBy || userId,
        resolvedAt: authoritativeResolvedAt,
        comment: effectiveResolutionNote,
        resolutionNote: effectiveResolutionNote,
        patch: dto.patch || null,
      },
      errorCode: null,
      errorMessage: null,
    });
    await this.executionPhaseService.resolveTakeoverRecord({
      executionId,
      phaseId: phase.id,
      takeoverId: takeover?.id || undefined,
      resolvedBy: dto.resolvedBy || userId,
      resolutionNote: effectiveResolutionNote,
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
    requester?: RequestUserContext
  ): Promise<ExecutionDto> {
    const execution = await this.getExecutionOrThrow(executionId);
    ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (execution.status !== EXECUTION_STATUS.HUMAN_CONTROL) {
      throw new BadRequestException(
        `Execution ${executionId} is not in ${EXECUTION_STATUS.HUMAN_CONTROL} status`
      );
    }

    const phase = await this.requirePhaseRecord(executionId, phaseKey);
    const sessionId = await this.resolveExecutionRuntimeSessionId(executionId, phase.runtime_session_id);
    await hooks.resumeRuntimeSessionQuietly(sessionId, executionId, dto.stepId);
    const didFinishTargetStep = await this.resolvePhaseTakeoverAndMarkRunning(executionId, phase, userId, dto.comment);
    const effectiveStepId = didFinishTargetStep ? undefined : dto.stepId;
    const runtimeSessionId = await this.exitHumanControlAndResume(
      executionId,
      hooks,
      effectiveStepId,
      phase.runtime_session_id,
      false
    );
    await hooks.emitEvent(executionId, EXECUTION_EVENT_TYPE.EXECUTION_RESUMED, {
      userId,
      stepId: effectiveStepId,
      comment: dto.comment,
      phaseKey,
    });

    if (execution.executionMode === 'deterministic_plan') {
      if (this.planSchedulerService) {
        await this.advanceDeterministicExecution(executionId, userId, requester, effectiveStepId);
      }
    } else if (runtimeSessionId) {
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
    preferredRuntimeSessionId?: string | null
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
    phaseKey?: string | null
  ): Promise<ExecutionPhaseRecord | null> {
    if (!phaseKey) {
      return null;
    }

    return this.executionPhaseService.getByExecutionIdAndPhaseKey(
      executionId,
      phaseKey
    ) as unknown as Promise<ExecutionPhaseRecord | null>;
  }

  private async requirePhaseRecord(
    executionId: string,
    phaseKey: string
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
    preferredRuntimeSessionId?: string | null
  ): Promise<string | null> {
    await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        status: EXECUTION_STATUS.HUMAN_CONTROL,
        takeoverRequired: true,
        takeoverReason: reason,
      },
    });

    const runtimeSessionId = await this.resolveExecutionRuntimeSessionId(
      executionId,
      preferredRuntimeSessionId
    );
    await hooks.freezeRuntimeSessionQuietly(runtimeSessionId, executionId, reason);
    return runtimeSessionId;
  }

  private async exitHumanControlAndResume(
    executionId: string,
    hooks: ExecutionHumanControlHooks,
    stepId?: string,
    preferredRuntimeSessionId?: string | null,
    resumeRuntimeSession = true
  ): Promise<string | null> {
    const runtimeSessionId = await this.resolveExecutionRuntimeSessionId(
      executionId,
      preferredRuntimeSessionId
    );
    if (resumeRuntimeSession) {
      await hooks.resumeRuntimeSessionQuietly(runtimeSessionId, executionId, stepId);
    }
    await hooks.updateStatus(executionId, EXECUTION_STATUS.RUNNING);
    await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        takeoverRequired: false,
        takeoverReason: null,
        currentPhaseStatus: null,
      },
    });

    return runtimeSessionId;
  }

  private async resolvePhaseTakeoverAndMarkRunning(
    executionId: string,
    phase: ExecutionPhaseRecord,
    userId: string,
    resolutionNote?: string
  ): Promise<boolean> {
    const recoveryDecision = this.readJsonRecord(phase.recovery_decision_json);
    const recoveryPatch = this.readJsonRecord(recoveryDecision?.patch);
    const hasResumeFromStepId =
      typeof recoveryPatch?.resumeFromStepId === 'string' &&
      recoveryPatch.resumeFromStepId.trim().length > 0;
    const hasFailedStepId =
      typeof recoveryPatch?.failedStepId === 'string' &&
      recoveryPatch.failedStepId.trim().length > 0;
    const execution = await this.prisma.execution.findUnique({
      where: { id: executionId },
      select: { currentStepId: true, executionMode: true },
    });
    const isDeterministicPlan = execution?.executionMode === 'deterministic_plan';

    const targetStep = await this.findFailedStepForPhase(executionId, phase);
    const targetStepId = targetStep?.id;

    const failedStepIdStr = hasFailedStepId ? String(recoveryPatch!.failedStepId).trim() : '';
    const resumeStepIdStr = hasResumeFromStepId ? String(recoveryPatch!.resumeFromStepId).trim() : '';
    const isSequentialSubStep = (val?: string | null) => Boolean(val && /^step_\d+$/.test(val));

    const isDistinctSubStepResume = Boolean(
      isDeterministicPlan &&
      (isSequentialSubStep(failedStepIdStr) || isSequentialSubStep(resumeStepIdStr)) &&
      failedStepIdStr !== targetStepId &&
      resumeStepIdStr !== targetStepId &&
      (!hasResumeFromStepId || resumeStepIdStr !== failedStepIdStr)
    );

    const isResolveByHuman =
      recoveryPatch?.type === 'resolve_by_human' ||
      recoveryDecision?.type === 'resolve_by_human';

    const shouldFinishTargetStep = isResolveByHuman && (!isDeterministicPlan || !isDistinctSubStepResume);

    if (targetStep) {
      if (shouldFinishTargetStep) {
        if (typeof this.executionStepService.finishRuntimeStep === 'function') {
          const existingOutput = this.readJsonRecord(targetStep.outputJson) || {};
          const existingVariables = this.readJsonRecord(existingOutput.variables) || {};
          const patchVariables = this.readJsonRecord(recoveryPatch?.variables) || {};
          const mergedVariables = {
            ...existingVariables,
            ...patchVariables,
          };
          const note =
            resolutionNote ||
            (typeof recoveryPatch?.note === 'string' ? recoveryPatch.note : null) ||
            (typeof recoveryDecision?.comment === 'string' ? recoveryDecision.comment : null) ||
            '人工接管处理完成';
          const resolvedOutput = {
            ...existingOutput,
            status: 'completed',
            requiresTakeover: false,
            takeoverReason: null,
            ...(Object.keys(mergedVariables).length > 0 ? { variables: mergedVariables } : {}),
            text:
              typeof existingOutput.text === 'string' && existingOutput.text.trim().length > 0
                ? existingOutput.text
                : note,
            result:
              existingOutput.result && typeof existingOutput.result === 'object'
                ? existingOutput.result
                : { success: true, resolvedByHuman: true },
            resolvedByHuman: true,
            resolvedBy: userId,
            resolutionNote: note,
          };
          await this.executionStepService.finishRuntimeStep(targetStep.id, {
            success: true,
            outputJson: resolvedOutput,
            errorCode: null,
            errorMessage: null,
            takeoverTriggered: false,
          });
        }
      } else {
        if (typeof this.executionStepService.requeueFailedStep === 'function') {
          await this.executionStepService.requeueFailedStep(targetStep.id);
        }
        const patchVariables = this.readJsonRecord(recoveryPatch?.variables) || {};
        const existingInput = this.readJsonRecord(targetStep.inputJson) || {};
        const resolvedResumeStepId =
          (hasResumeFromStepId ? String(recoveryPatch?.resumeFromStepId).trim() : null) ||
          (hasFailedStepId && /^step_\d+$/.test(failedStepIdStr)
            ? `step_${parseInt(failedStepIdStr.replace('step_', ''), 10) + 1}`
            : null);
        if (typeof this.prisma.executionStep?.update === 'function') {
          await this.prisma.executionStep.update({
            where: { id: targetStep.id },
            data: {
              inputJson: {
                ...existingInput,
                ...patchVariables,
                ...(recoveryPatch ? { __recoveryPatch: recoveryPatch } : {}),
                ...(resolvedResumeStepId
                  ? { __resumeFromStepId: resolvedResumeStepId }
                  : {}),
              } as any,
            },
          });
        }
      }
    }

    const effectiveResolutionNote =
      resolutionNote?.trim() ||
      (typeof recoveryPatch?.note === 'string' ? recoveryPatch.note.trim() : null) ||
      (typeof recoveryPatch?.comment === 'string' ? recoveryPatch.comment.trim() : null) ||
      (typeof recoveryDecision?.comment === 'string' ? recoveryDecision.comment.trim() : null) ||
      null;

    await this.executionPhaseService.resolveTakeoverRecord({
      executionId,
      phaseId: phase.id,
      resolvedBy: userId,
      resolutionNote: effectiveResolutionNote,
      status: 'resolved',
    });
    await this.executionPhaseService.createOrUpdatePhase({
      executionId,
      phaseKey: phase.phase_key!,
      phaseName: phase.phase_name || phase.phase_key!,
      phaseType: phase.phase_type || 'workflow_execution',
      status: isDeterministicPlan && shouldFinishTargetStep ? 'completed' : 'running',
      attempt: phase.attempt || 1,
      runtimeSessionId: phase.runtime_session_id || null,
      input: phase.input_json || null,
      output: phase.output_json || null,
      postcheck: phase.postcheck_json || null,
      recoveryDecision: phase.recovery_decision_json || null,
      startedAt: phase.started_at ? new Date(phase.started_at) : new Date(),
      completedAt: isDeterministicPlan && shouldFinishTargetStep ? new Date() : null,
      errorCode: null,
      errorMessage: null,
    });

    return shouldFinishTargetStep;
  }

  private async findFailedStepForPhase(
    executionId: string,
    phase?: ExecutionPhaseRecord | null
  ): Promise<any | null> {
    const recoveryDecision = this.readJsonRecord(phase?.recovery_decision_json);
    const recoveryPatch = this.readJsonRecord(recoveryDecision?.patch);
    const inputJson = this.readJsonRecord(phase?.input_json);
    const candidateStepId =
      (typeof recoveryPatch?.failedStepId === 'string' && recoveryPatch.failedStepId) ||
      (typeof inputJson?.stepId === 'string' && inputJson.stepId) ||
      (typeof inputJson?.parentStepId === 'string' && inputJson.parentStepId) ||
      null;

    if (candidateStepId) {
      try {
        const step = await this.executionStepService.getById(candidateStepId);
        if (
          step &&
          (step.executionId === executionId || !step.executionId) &&
          (step.status === EXECUTION_STEP_STATUS.FAILED ||
            step.status === EXECUTION_STEP_STATUS.RUNNING)
        ) {
          return step;
        }
      } catch {
        // Step not found by candidate ID, proceed with next strategies
      }
    }

    const execution = await this.prisma.execution.findUnique({
      where: { id: executionId },
      select: { currentStepId: true, currentPhaseKey: true },
    });

    if (execution?.currentStepId) {
      try {
        const currentStep = await this.executionStepService.getById(execution.currentStepId);
        if (
          currentStep &&
          (currentStep.executionId === executionId || !currentStep.executionId) &&
          (currentStep.status === EXECUTION_STEP_STATUS.FAILED ||
            currentStep.status === EXECUTION_STEP_STATUS.RUNNING)
        ) {
          if (!phase || this.doesStepMatchPhase(currentStep, phase, execution.currentPhaseKey)) {
            return currentStep;
          }
        }
      } catch {
        // Step not found by currentStepId
      }
    }

    let allSteps: any[] = [];
    if (typeof this.executionStepService.listByExecutionId === 'function') {
      try {
        allSteps = (await this.executionStepService.listByExecutionId(executionId)) || [];
      } catch {
        allSteps = [];
      }
    } else if (typeof this.prisma.executionStep?.findMany === 'function') {
      try {
        allSteps =
          (await this.prisma.executionStep.findMany({
            where: { executionId },
            orderBy: { stepIndex: 'desc' },
          })) || [];
      } catch {
        allSteps = [];
      }
    }

    const failedSteps = allSteps.filter(
      (s: any) =>
        s &&
        (s.status === EXECUTION_STEP_STATUS.FAILED || s.status === EXECUTION_STEP_STATUS.RUNNING)
    );

    if (failedSteps.length === 0) {
      return null;
    }

    if (!phase) {
      return failedSteps[0];
    }

    const matched = failedSteps.find((step) =>
      this.doesStepMatchPhase(step, phase, execution?.currentPhaseKey)
    );
    return matched || failedSteps[0];
  }

  private doesStepMatchPhase(
    step: any,
    phase: ExecutionPhaseRecord,
    currentPhaseKey?: string | null
  ): boolean {
    if (!step || !phase?.phase_key) {
      return false;
    }
    const stepPhase = this.extractStepPhaseMetadata(step as Record<string, unknown>);
    if (stepPhase?.phaseKey === phase.phase_key) {
      return true;
    }
    if (currentPhaseKey && currentPhaseKey === phase.phase_key) {
      return true;
    }
    if (step.planNodeId && phase.phase_key.includes(step.planNodeId)) {
      return true;
    }
    if (step.name && phase.phase_key.includes(step.name)) {
      return true;
    }
    if (step.id && phase.phase_key.includes(step.id)) {
      return true;
    }
    const inputJson = this.readJsonRecord(phase.input_json);
    if (inputJson?.stepId === step.id || inputJson?.parentStepId === step.id) {
      return true;
    }
    return false;
  }

  private async findWaitingPhase(executionId: string): Promise<ExecutionPhaseRecord | null> {
    if (typeof this.prisma.executionPhase?.findFirst !== 'function') {
      return null;
    }
    const phase = await this.prisma.executionPhase.findFirst({
      where: {
        executionId,
        status: 'waiting_takeover',
      },
      orderBy: { updatedAt: 'desc' },
    });
    return (phase as unknown as ExecutionPhaseRecord) || null;
  }

  private async resolveOrRequeueStepWithoutPhase(
    executionId: string,
    userId: string,
    resolutionNote?: string
  ): Promise<void> {
    const targetStep = await this.findFailedStepForPhase(executionId);
    if (targetStep) {
      if (targetStep.takeoverTriggered) {
        if (typeof this.executionStepService.finishRuntimeStep === 'function') {
          const existingOutput = this.readJsonRecord(targetStep.outputJson) || {};
          const note = resolutionNote || '人工接管处理完成';
          const resolvedOutput = {
            ...existingOutput,
            status: 'completed',
            requiresTakeover: false,
            takeoverReason: null,
            text:
              typeof existingOutput.text === 'string' && existingOutput.text.trim().length > 0
                ? existingOutput.text
                : note,
            result:
              existingOutput.result && typeof existingOutput.result === 'object'
                ? existingOutput.result
                : { success: true, resolvedByHuman: true },
            resolvedByHuman: true,
            resolvedBy: userId,
            resolutionNote: note,
          };
          await this.executionStepService.finishRuntimeStep(targetStep.id, {
            success: true,
            outputJson: resolvedOutput,
            errorCode: null,
            errorMessage: null,
            takeoverTriggered: false,
          });
        }
      } else {
        if (typeof this.executionStepService.requeueFailedStep === 'function') {
          await this.executionStepService.requeueFailedStep(targetStep.id);
        }
      }
    }
  }

  private async advanceDeterministicExecution(
    executionId: string,
    userId: string,
    requester?: RequestUserContext,
    stepId?: string
  ): Promise<void> {
    const inputTrace = (requester as any)?.traceContext;
    if (process.env.EXECUTION_OUTBOX_ENABLED === 'true' && this.outbox) {
      await this.outbox.enqueue({
        aggregateType: 'execution',
        aggregateId: executionId,
        eventType: 'execution.ready',
        payload: {
          executionId,
          reason: 'takeover_resumed',
          dispatcherVersion: 'v2',
          ...(stepId ? { resumeFromStepId: stepId } : {}),
          ...(inputTrace ? { traceContext: inputTrace } : {}),
        },
        traceContext: inputTrace,
      });
    } else {
      setTimeout(() => {
        const advanceOptions = {
          ...(stepId ? { resumeFromStepId: stepId } : {}),
          ...(inputTrace ? { traceContext: inputTrace } : {}),
        };
        const hasOptions = Object.keys(advanceOptions).length > 0;
        const advancePromise = hasOptions
          ? this.planSchedulerService?.advanceExecution(executionId, advanceOptions)
          : this.planSchedulerService?.advanceExecution(executionId);
        advancePromise?.catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Failed to advance deterministic execution ${executionId}: ${message}`
          );
        });
      }, 0);
    }
  }

  private extractStepPhaseMetadata(
    step?: Record<string, unknown> | null
  ): ExecutionStepPhaseMetadata | undefined {
    if (!step) {
      return undefined;
    }

    const targetJson = this.readJsonRecord(step.targetJson);
    const inputJson = this.readJsonRecord(step.inputJson);
    const phaseKey =
      typeof targetJson?.phaseKey === 'string'
        ? targetJson.phaseKey
        : typeof targetJson?.phase_key === 'string'
          ? targetJson.phase_key
          : typeof inputJson?.phaseKey === 'string'
            ? inputJson.phaseKey
            : typeof inputJson?.phase_key === 'string'
              ? inputJson.phase_key
              : undefined;
    const phaseName =
      typeof targetJson?.phaseName === 'string'
        ? targetJson.phaseName
        : typeof targetJson?.phase_name === 'string'
          ? targetJson.phase_name
          : typeof inputJson?.phaseName === 'string'
            ? inputJson.phaseName
            : typeof inputJson?.phase_name === 'string'
              ? inputJson.phase_name
              : undefined;
    const phaseType =
      typeof targetJson?.phaseType === 'string'
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
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // value is not a valid JSON string, fall through to undefined
      }
    }
    return undefined;
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
    hooks: ExecutionHumanControlHooks
  ): void {
    hooks.advanceExecutionFlow(executionId, runtimeSessionId).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to asynchronously resume execution ${executionId}: ${message}`);
    });
  }
}
