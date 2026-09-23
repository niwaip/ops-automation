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
import { OutboundEffectLedgerService } from '../outbox/outbound-effect-ledger.service';

interface RequestUserContext {
  id: string;
  role?: string;
  traceContext?: any;
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
    @Optional() private readonly outbox?: ExecutionOutboxService,
    @Optional() private readonly ledger?: OutboundEffectLedgerService
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

    // Approve any prepared outbound effect ledger records associated with this execution
    if (this.ledger) {
      const preparedRecords = await this.prisma.outboundEffectLedger.findMany({
        where: {
          idempotencyKey: { startsWith: `${id}:` },
          state: 'PREPARED',
        },
      });

      for (const record of preparedRecords) {
        if ((dto as any).approvedPayloadHash && (dto as any).approvedPayloadHash !== record.payloadHash) {
          throw new BadRequestException(
            `PAYLOAD_HASH_MISMATCH: Approved hash '${(dto as any).approvedPayloadHash}' does not match prepared hash '${record.payloadHash}'`
          );
        }
        await this.ledger.approve({
          tenantId: record.tenantId,
          capabilityKey: record.capabilityKey,
          idempotencyKey: record.idempotencyKey,
          approvedPayloadHash: record.payloadHash,
          approver: dto.decidedBy || userId,
        });
      }
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
      const approvalTrace = (requester as any)?.traceContext || ((execution as any)?.metadata as any)?.traceContext;
      await this.outbox.enqueue({
        aggregateType: 'execution',
        aggregateId: id,
        eventType: 'execution.ready',
        payload: {
          executionId: id,
          reason: 'approval_granted',
          dispatcherVersion: 'v2',
          ...(approvalTrace ? { traceContext: approvalTrace } : {}),
        },
        traceContext: approvalTrace,
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

    if (this.prisma.$queryRawUnsafe) {
      try {
        await this.prisma.$queryRawUnsafe(
          `UPDATE outbound_effect_ledgers
              SET state = 'CANCELLED',
                  resolution_reason = $2,
                  resolved_by = $3,
                  resolved_at = NOW(),
                  updated_at = NOW()
            WHERE idempotency_key LIKE $1 || ':%'
              AND state = 'PREPARED'`,
          id,
          dto.comment || 'Execution rejected during approval',
          dto.decidedBy || userId
        );
      } catch {}
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
