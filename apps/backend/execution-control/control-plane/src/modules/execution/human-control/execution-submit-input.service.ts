import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EXECUTION_EVENT_TYPE } from '../contracts/execution-event-type';
import { EXECUTION_STATUS, ExecutionStatus } from '../contracts/execution-status';
import { EXECUTION_STEP_STATUS } from '../contracts/execution-step-status';
import { CreateExecutionEventOptions } from '../state/execution-event.service';
import {
  ExecutionDto,
  ExecutionParamResolutionEntry,
  ExecutionRequiredInput,
  SubmitInputDto,
} from '../state/execution.dto';
import { ExecutionPlanNormalizationService } from '../step-runner/planning/execution-plan-normalization.service';
import { ExecutionStepService } from '../step-runner/steps/execution-step.service';
import {
  ExecutionInputResolutionService,
  ExecutionUsageSummary,
  SubmitInputResolutionResult,
} from './execution-input-resolution.service';
import { RequestUserContext } from '../lifecycle/execution-lifecycle.service';
import { ensureExecutionPermission } from '../shared/execution-permission.util';

interface SubmitInputContext {
  execution: Record<string, any>;
  effectiveRequester: RequestUserContext;
  normalized: Record<string, unknown>;
  requiredInputs: ExecutionRequiredInput[];
  currentParamResolution: Record<string, ExecutionParamResolutionEntry>;
  missingInputs: ExecutionRequiredInput[];
}

export interface ExecutionSubmitInputHooks {
  getExecutionDto: (id: string, requester?: RequestUserContext) => Promise<ExecutionDto>;
  emitEvent: (
    executionId: string,
    eventType: (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE],
    payload: unknown,
    options?: CreateExecutionEventOptions
  ) => Promise<void>;
  updateStatus: (id: string, newStatus: ExecutionStatus) => Promise<void>;
  startExecution: (executionId: string) => Promise<void>;
  advanceExecutionFlow: (executionId: string, runtimeSessionId: string) => Promise<void>;
}

@Injectable()
export class ExecutionSubmitInputService {
  private readonly logger = new Logger(ExecutionSubmitInputService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionStepService: ExecutionStepService,
    private readonly executionInputResolutionService: ExecutionInputResolutionService,
    private readonly executionPlanNormalizationService: ExecutionPlanNormalizationService
  ) {}

  async submitInputAndResume(
    id: string,
    userId: string,
    dto: SubmitInputDto,
    hooks: ExecutionSubmitInputHooks,
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
        currentUsage: context.normalized.__usage as unknown as ExecutionUsageSummary | undefined,
        submittedUsage: dto.usage as unknown as ExecutionUsageSummary | undefined,
        reconcileSemantic: (semantic, requiredInputs) =>
          this.executionPlanNormalizationService.reconcilePlanSemantic(
            semantic as Record<string, unknown> | undefined,
            requiredInputs as ExecutionRequiredInput[]
          ) as Record<string, unknown> | undefined,
      }
    );

    await this.persistSubmitInputState(id, dto.stepId, resolution);

    return this.finishSubmitInputAndResume(
      id,
      userId,
      dto.stepId,
      context.effectiveRequester,
      resolution,
      hooks
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
    ensureExecutionPermission(execution.createdBy, effectiveRequester);

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
    const currentParamResolution = this.executionInputResolutionService.getParamResolution(execution);
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
          inputJson: {
            requiredInputs: resolution.updatedRequiredInputs.filter((item) => item.missing),
          } as unknown as Prisma.JsonObject,
          outputJson: resolution.mergedSubmittedInput as Prisma.JsonObject,
          endedAt: resolution.canResumeExecution ? new Date() : null,
        },
      }),
      this.prisma.execution.update({
        where: { id: executionId },
        data: {
          normalizedInputJson: resolution.updatedNormalized as Prisma.JsonObject,
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
    resolution: SubmitInputResolutionResult,
    hooks: ExecutionSubmitInputHooks
  ): Promise<ExecutionDto> {
    const runtimeSession = await this.prisma.runtimeSession.findFirst({
      where: { executionId },
      orderBy: { createdAt: 'desc' },
    });

    await hooks.emitEvent(
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
      return hooks.getExecutionDto(executionId, requester);
    }

    if (!runtimeSession) {
      await hooks.startExecution(executionId);
      this.logger.log(
        `Input submitted for execution ${executionId}; runtime session will be allocated on start`
      );
      return hooks.getExecutionDto(executionId, requester);
    }

    await hooks.updateStatus(executionId, EXECUTION_STATUS.RUNNING);

    await hooks.emitEvent(
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

    hooks.advanceExecutionFlow(executionId, runtimeSession.id).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to asynchronously resume execution ${executionId}: ${message}`);
    });
    this.logger.log(`Input submitted and execution ${executionId} resumed from step ${stepId}`);
    return hooks.getExecutionDto(executionId, requester);
  }
}
