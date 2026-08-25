import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { APPROVAL_STATUS } from '../contracts/approval-status';
import { EXECUTION_EVENT_TYPE } from '../contracts/execution-event-type';
import { EXECUTION_STATUS, ExecutionStatus } from '../contracts/execution-status';
import { CreateExecutionEventOptions } from '../state/execution-event.service';
import { ApprovalDecisionDto, ExecutionDto } from '../state/execution.dto';
import { ensureExecutionPermission } from '../shared/execution-permission.util';
import { ExecutionOutboxService } from '../outbox/execution-outbox.service';

interface RequestUserContext {
  id: string;
  role?: string;
}

export interface ExecutionApprovalHooks {
  getExecutionDto: (id: string, requester?: RequestUserContext) => Promise<ExecutionDto>;
  emitEvent: (
    executionId: string,
    eventType: (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE],
    payload: unknown,
    options?: CreateExecutionEventOptions
  ) => Promise<void>;
  updateStatus: (id: string, newStatus: ExecutionStatus) => Promise<void>;
  startExecution: (executionId: string) => Promise<void>;
}

@Injectable()
export class ExecutionApprovalService {
  private readonly logger = new Logger(ExecutionApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly outbox?: ExecutionOutboxService
  ) {}

  async approve(
    id: string,
    userId: string,
    dto: ApprovalDecisionDto,
    hooks: ExecutionApprovalHooks,
    requester?: RequestUserContext
  ): Promise<ExecutionDto> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (execution.status !== EXECUTION_STATUS.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Execution ${id} is not in ${EXECUTION_STATUS.PENDING_APPROVAL} status`
      );
    }

    await this.prisma.execution.update({
      where: { id },
      data: {
        approvalStatus: APPROVAL_STATUS.APPROVED,
      },
    });
    await hooks.updateStatus(id, EXECUTION_STATUS.QUEUED);
    await hooks.emitEvent(id, EXECUTION_EVENT_TYPE.EXECUTION_APPROVED, {
      userId,
      decidedBy: dto.decidedBy || userId,
      comment: dto.comment,
    });

    if (process.env.EXECUTION_OUTBOX_ENABLED === 'true' && this.outbox) {
      await this.outbox.enqueue({
        aggregateType: 'execution',
        aggregateId: id,
        eventType: 'execution.ready',
        payload: { executionId: id, reason: 'approval_granted', dispatcherVersion: 'v2' },
      });
    } else {
      hooks.startExecution(id).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to start approved execution ${id}: ${msg}`);
      });
    }

    this.logger.log(`Execution ${id} approved`);
    return hooks.getExecutionDto(id, requester || { id: userId });
  }

  async reject(
    id: string,
    userId: string,
    dto: ApprovalDecisionDto,
    hooks: ExecutionApprovalHooks,
    requester?: RequestUserContext
  ): Promise<ExecutionDto> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (execution.status !== EXECUTION_STATUS.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Execution ${id} is not in ${EXECUTION_STATUS.PENDING_APPROVAL} status`
      );
    }

    await this.prisma.execution.update({
      where: { id },
      data: {
        approvalStatus: APPROVAL_STATUS.REJECTED,
        failureReason: dto.comment || 'Execution rejected during approval',
        failureCode: 'APPROVAL_REJECTED',
      },
    });
    await hooks.updateStatus(id, EXECUTION_STATUS.CANCELLED);
    await hooks.emitEvent(id, EXECUTION_EVENT_TYPE.EXECUTION_REJECTED, {
      userId,
      decidedBy: dto.decidedBy || userId,
      comment: dto.comment,
    });

    this.logger.log(`Execution ${id} rejected`);
    return hooks.getExecutionDto(id, requester || { id: userId });
  }
}
