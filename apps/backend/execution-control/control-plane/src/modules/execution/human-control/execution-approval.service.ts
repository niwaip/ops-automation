import {
  BadRequestException,
  ForbiddenException,
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
import {
  ApprovalDecisionDto,
  AuthorizeRetryOutboundEffectDto,
  ExecutionDto,
  ResolveOutboundEffectDto,
} from '../state/execution.dto';
import { ensureExecutionPermission } from '../shared/execution-permission.util';
import { ExecutionOutboxService } from '../outbox/execution-outbox.service';
import { OutboundEffectLedgerService } from '../outbox/outbound-effect-ledger.service';
import { OutboundEffectReconciliationService } from './outbound-effect-reconciliation.service';

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
  private readonly reconciliationService: OutboundEffectReconciliationService;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly outbox?: ExecutionOutboxService,
    @Optional() private readonly ledger?: OutboundEffectLedgerService,
    @Optional() reconciliation?: OutboundEffectReconciliationService
  ) {
    this.reconciliationService =
      reconciliation || new OutboundEffectReconciliationService(prisma, outbox, ledger);
  }

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

    const effectiveApprover = requester?.id || userId;
    let targetEffectId: string | undefined = undefined;

    // Approve prepared outbound effect ledger record associated with this execution
    if (this.ledger) {
      const preparedRecords = await this.prisma.outboundEffectLedger.findMany({
        where: {
          idempotencyKey: { startsWith: `${id}:` },
          state: 'PREPARED',
        },
      });

      if (preparedRecords.length > 0) {
        if (!dto.approvedPayloadHash || !dto.approvedPayloadHash.trim()) {
          throw new BadRequestException(
            'APPROVED_PAYLOAD_HASH_REQUIRED: Approval of execution with prepared outbound effects requires approvedPayloadHash'
          );
        }

        let targetRecord = preparedRecords[0];
        if (dto.effectId) {
          const matched = preparedRecords.find((r) => r.id === dto.effectId);
          if (!matched) {
            throw new NotFoundException(
              `EFFECT_NOT_FOUND: Prepared outbound effect '${dto.effectId}' not found for execution '${id}'`
            );
          }
          targetRecord = matched;
        } else if (preparedRecords.length > 1) {
          throw new BadRequestException(
            `EFFECT_ID_REQUIRED: Multiple prepared outbound effects exist for execution '${id}'. Explicit effectId is required.`
          );
        }

        if (dto.approvedPayloadHash !== targetRecord.payloadHash) {
          throw new BadRequestException(
            `PAYLOAD_HASH_MISMATCH: Approved hash '${dto.approvedPayloadHash}' does not match prepared hash '${targetRecord.payloadHash}'`
          );
        }

        await this.ledger.approve({
          tenantId: targetRecord.tenantId,
          capabilityKey: targetRecord.capabilityKey,
          idempotencyKey: targetRecord.idempotencyKey,
          approvedPayloadHash: dto.approvedPayloadHash,
          approver: effectiveApprover,
        });

        targetEffectId = targetRecord.id;
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
      decidedBy: effectiveApprover,
      comment: dto.comment,
      ...(dto.approvedPayloadHash ? { approvedPayloadHash: dto.approvedPayloadHash } : {}),
      ...(targetEffectId ? { effectId: targetEffectId } : dto.effectId ? { effectId: dto.effectId } : {}),
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

    const effectiveRejecter = requester?.id || userId;

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
          effectiveRejecter
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
      decidedBy: effectiveRejecter,
      comment: dto.comment,
    });

    this.logger.log(`Execution ${id} rejected`);
    return hooks.getExecutionDto(id, requester || { id: userId });
  }

  async resolveOutboundEffect(
    executionId: string,
    effectId: string,
    dto: ResolveOutboundEffectDto,
    userId: string,
    requester?: RequestUserContext,
    hooks?: ExecutionApprovalHooks
  ) {
    return this.reconciliationService.resolveOutboundEffect(
      executionId,
      effectId,
      dto,
      userId,
      requester,
      hooks
    );
  }

  async authorizeRetryOutboundEffect(
    executionId: string,
    effectId: string,
    dto: AuthorizeRetryOutboundEffectDto,
    userId: string,
    requester?: RequestUserContext,
    hooks?: ExecutionApprovalHooks
  ) {
    return this.reconciliationService.authorizeRetryOutboundEffect(
      executionId,
      effectId,
      dto,
      userId,
      requester,
      hooks
    );
  }
}
