import { Injectable } from '@nestjs/common';
import { ExecutionHumanControlHooks, ExecutionHumanControlService } from '../../human-control/execution-human-control.service';
import { TakeoverExecutionDto } from '../../state/execution.dto';
import { ExecutionFailureHooks, ExecutionFailureService } from '../../recovery/execution-failure.service';

@Injectable()
export class ExecutionRuntimeControlService {
  constructor(
    private readonly executionFailureService: ExecutionFailureService,
    private readonly executionHumanControlService: ExecutionHumanControlService
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
    await this.executionFailureService.failExecutionFromRuntimeStep(input, hooks);
  }

  async enterRuntimeWaitingInput(
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    requiredInputs: unknown[],
    reason: string | undefined,
    hooks: ExecutionFailureHooks
  ): Promise<void> {
    await this.executionFailureService.enterRuntimeWaitingInput(
      executionId,
      runtimeSessionId,
      stepId,
      requiredInputs,
      reason,
      hooks
    );
  }

  async enterPendingApprovalFromRuntimeStep(
    executionId: string,
    reason: string,
    hooks: Pick<ExecutionFailureHooks, 'updateStatus'>
  ): Promise<void> {
    await this.executionFailureService.enterPendingApprovalFromRuntimeStep(executionId, reason, hooks);
  }

  async requestSystemTakeover(
    executionId: string,
    reason: string,
    hooks: ExecutionHumanControlHooks
  ): Promise<void> {
    const dto: TakeoverExecutionDto = { reason };
    await this.executionHumanControlService.takeover(
      executionId,
      'system',
      dto,
      hooks,
      {
        id: 'system',
        role: 'admin',
      }
    );
  }
}
