import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { APPROVAL_STATUS } from '../contracts/approval-status';
import { EXECUTION_EVENT_TYPE } from '../contracts/execution-event-type';
import { EXECUTION_STATUS, ExecutionStatus } from '../contracts/execution-status';
import { CreateExecutionEventOptions } from '../state/execution-event.service';
import { ExecutionInputResolutionService } from '../human-control/execution-input-resolution.service';
import { ExecutionStepService } from '../step-runner/execution-step.service';

interface ExecutionFailureHooks {
  emitEvent: (
    executionId: string,
    eventType: (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE],
    payload: unknown,
    options?: CreateExecutionEventOptions
  ) => Promise<void>;
  updateStatus: (id: string, newStatus: ExecutionStatus) => Promise<void>;
  closeRuntimeSessionQuietly: (
    runtimeSessionId: string,
    executionId: string,
    reason: string
  ) => Promise<void>;
}

@Injectable()
export class ExecutionFailureService {
  private readonly logger = new Logger(ExecutionFailureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionStepService: ExecutionStepService,
    private readonly executionInputResolutionService: ExecutionInputResolutionService
  ) {}

  async failExecutionFromRuntimeStep(
    input: {
      executionId: string;
      stepId: string;
      failureReason: string;
      failureCode: string;
      runtimeSessionId?: string;
    },
    hooks: ExecutionFailureHooks
  ): Promise<void> {
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
      hooks
    );
    await hooks.updateStatus(input.executionId, EXECUTION_STATUS.FAILED);
    if (input.runtimeSessionId) {
      await hooks.closeRuntimeSessionQuietly(
        input.runtimeSessionId,
        input.executionId,
        'runtime_step_failed'
      );
    }
  }

  async enterRuntimeWaitingInput(
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    requiredInputs: unknown[],
    reason: string | undefined,
    hooks: ExecutionFailureHooks
  ): Promise<void> {
    const semantic = await this.loadExecutionSemantic(executionId);
    await hooks.updateStatus(executionId, EXECUTION_STATUS.WAITING_INPUT);
    await hooks.emitEvent(
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
      }
    );
  }

  async enterPendingApprovalFromRuntimeStep(
    executionId: string,
    reason: string,
    hooks: Pick<ExecutionFailureHooks, 'updateStatus'>
  ): Promise<void> {
    await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        requiresApproval: true,
        approvalStatus: APPROVAL_STATUS.PENDING,
      },
    });
    await hooks.updateStatus(executionId, EXECUTION_STATUS.PENDING_APPROVAL);
    this.logger.log(
      `Execution ${executionId} entered pending_approval due to runtime block: ${reason}`
    );
  }

  async skipPendingSteps(
    executionId: string,
    currentStepId: string,
    reason: string,
    hooks: Pick<ExecutionFailureHooks, 'emitEvent'>
  ): Promise<void> {
    const skippedStepIds = await this.executionStepService.skipPendingSteps(
      executionId,
      currentStepId,
      reason
    );

    if (skippedStepIds.length === 0) {
      return;
    }

    await hooks.emitEvent(
      executionId,
      EXECUTION_EVENT_TYPE.STEPS_SKIPPED,
      {
        skippedStepIds,
        reason,
      },
      {
        stepId: currentStepId,
      }
    );
  }

  async skipSingleStep(
    stepId: string,
    executionId: string,
    reason: string,
    hooks: Pick<ExecutionFailureHooks, 'emitEvent'>
  ): Promise<void> {
    await this.executionStepService.skipSingleStep(stepId, reason);

    await hooks.emitEvent(
      executionId,
      EXECUTION_EVENT_TYPE.STEP_SKIPPED,
      { reason },
      {
        stepId,
      }
    );
  }

  async enterWaitingInput(
    execution: Record<string, unknown>,
    stepId: string,
    hooks: Pick<ExecutionFailureHooks, 'emitEvent' | 'updateStatus'>
  ): Promise<void> {
    const missingInputs = this.executionInputResolutionService.getMissingRequiredInputs(execution);
    const semantic = this.extractSemanticFromExecution(execution);

    await this.executionStepService.prepareWaitingInputStep(
      execution.id as string,
      stepId,
      missingInputs
    );

    await hooks.updateStatus(execution.id as string, EXECUTION_STATUS.WAITING_INPUT);
    await hooks.emitEvent(
      execution.id as string,
      EXECUTION_EVENT_TYPE.STEP_WAITING_INPUT,
      {
        requiredInputs: missingInputs,
        ...(semantic ? { semantic } : {}),
      },
      {
        stepId,
      }
    );
  }

  private extractSemanticFromExecution(
    execution: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    const normalizedInput = execution.normalizedInputJson as Record<string, unknown> | undefined;
    const semantic = normalizedInput?.semantic;
    if (semantic && typeof semantic === 'object' && !Array.isArray(semantic)) {
      return semantic as Record<string, unknown>;
    }
    return undefined;
  }

  private async loadExecutionSemantic(
    executionId: string
  ): Promise<Record<string, unknown> | undefined> {
    try {
      const row = await this.prisma.execution.findUnique({
        where: { id: executionId },
        select: { normalizedInputJson: true },
      });
      if (
        !row?.normalizedInputJson ||
        typeof row.normalizedInputJson !== 'object' ||
        Array.isArray(row.normalizedInputJson)
      ) {
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
}
