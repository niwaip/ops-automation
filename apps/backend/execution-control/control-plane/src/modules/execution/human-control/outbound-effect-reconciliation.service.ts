import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EXECUTION_EVENT_TYPE } from '../contracts/execution-event-type';
import { EXECUTION_STATUS, ExecutionStatus } from '../contracts/execution-status';
import { CreateExecutionEventOptions } from '../state/execution-event.service';
import {
  AuthorizeRetryOutboundEffectDto,
  ExecutionDto,
  ResolveOutboundEffectDto,
} from '../state/execution.dto';
import { ensureExecutionPermission } from '../shared/execution-permission.util';
import { ExecutionOutboxService } from '../outbox/execution-outbox.service';
import { OutboundEffectLedgerService } from '../outbox/outbound-effect-ledger.service';

export interface RequestUserContext {
  id: string;
  role?: string;
  traceContext?: any;
}

export interface ExecutionReconciliationHooks {
  getExecutionDto?: (id: string, requester?: RequestUserContext) => Promise<ExecutionDto>;
  emitEvent?: (
    executionId: string,
    eventType: (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE],
    payload: unknown,
    options?: CreateExecutionEventOptions
  ) => Promise<void>;
  updateStatus?: (id: string, newStatus: ExecutionStatus) => Promise<void>;
  startExecution?: (executionId: string) => Promise<void>;
}

@Injectable()
export class OutboundEffectReconciliationService {
  private readonly logger = new Logger(OutboundEffectReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly outbox?: ExecutionOutboxService,
    @Optional() private readonly ledger?: OutboundEffectLedgerService
  ) {}

  private async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    if (typeof this.prisma.$transaction === 'function') {
      return this.prisma.$transaction(fn);
    }
    return fn(this.prisma);
  }

  private findTargetStep(steps: any[], effectId: string, idempotencyKey: string) {
    const matchedSteps = steps.filter((s) => {
      const output = (s.outputJson as Record<string, any>) || {};
      if (output.ledgerId === effectId || output.effectId === effectId) {
        return true;
      }
      return s.idempotencyKey === idempotencyKey;
    });

    if (matchedSteps.length === 0) {
      throw new NotFoundException(
        `TARGET_STEP_NOT_FOUND: No execution step found correlating to effect '${effectId}'`
      );
    }
    if (matchedSteps.length > 1) {
      throw new BadRequestException(
        `AMBIGUOUS_TARGET_STEP: Multiple execution steps correlated to effect '${effectId}'`
      );
    }

    return matchedSteps[0];
  }

  async resolveOutboundEffect(
    executionId: string,
    effectId: string,
    dto: ResolveOutboundEffectDto,
    userId: string,
    requester?: RequestUserContext,
    hooks?: ExecutionReconciliationHooks
  ) {
    const execution = await this.prisma.execution.findUnique({
      where: { id: executionId },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (!this.ledger) {
      throw new BadRequestException('Outbound effect ledger service is not available');
    }

    const record = await this.prisma.outboundEffectLedger.findUnique({
      where: { id: effectId },
    });

    if (!record) {
      throw new NotFoundException(`Outbound effect record ${effectId} not found`);
    }

    if (!record.idempotencyKey.startsWith(`${executionId}:`)) {
      throw new ForbiddenException(
        `OUTBOUND_EFFECT_MISMATCH: Outbound effect '${effectId}' does not belong to execution '${executionId}'`
      );
    }

    const steps = await this.prisma.executionStep.findMany({
      where: { executionId },
      orderBy: { stepIndex: 'asc' },
    });

    const targetStep = this.findTargetStep(steps, effectId, record.idempotencyKey);
    const effectiveResolver = requester?.id || userId;

    let resolved: any;

    if (dto.targetState === 'COMMITTED') {
      resolved = await this.runTransaction(async (tx) => {
        const res = await this.ledger!.resolveUnknown(
          {
            id: effectId,
            targetState: dto.targetState,
            resolutionReason: dto.resolutionReason,
            resolvedBy: effectiveResolver,
          },
          tx
        );

        const existingOutput = (targetStep.outputJson as Record<string, any>) || {};
        await tx.executionStep.update({
          where: { id: targetStep.id },
          data: {
            status: 'succeeded',
            errorCode: null,
            errorMessage: null,
            takeoverTriggered: false,
            endedAt: new Date(),
            leaseExpiresAt: null,
            outputJson: {
              ...existingOutput,
              deliveryId:
                (res as any).providerMessageId ||
                (res as any).providerRequestId ||
                (res as any).id,
              state: 'accepted',
              acceptedAt: new Date().toISOString(),
            },
          },
        });

        await tx.execution.update({
          where: { id: executionId },
          data: {
            takeoverRequired: false,
            takeoverReason: null,
            failureCode: null,
            failureReason: null,
          },
        });

        if (process.env.EXECUTION_OUTBOX_ENABLED === 'true' && this.outbox) {
          const trace =
            (requester as any)?.traceContext || ((execution as any)?.metadata as any)?.traceContext;
          await this.outbox.enqueue(
            {
              aggregateType: 'execution',
              aggregateId: executionId,
              eventType: 'execution.ready',
              payload: {
                executionId,
                reason: 'outbound_effect_reconciled_committed',
                dispatcherVersion: 'v2',
                ...(trace ? { traceContext: trace } : {}),
              },
              traceContext: trace,
            },
            tx
          );
        }

        return res;
      });

      if (hooks?.updateStatus) {
        await hooks.updateStatus(executionId, EXECUTION_STATUS.QUEUED);
      } else {
        await this.prisma.execution.update({
          where: { id: executionId },
          data: { status: EXECUTION_STATUS.QUEUED },
        });
      }

      if (process.env.EXECUTION_OUTBOX_ENABLED !== 'true' && hooks?.startExecution) {
        hooks.startExecution(executionId).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Failed to resume execution ${executionId} after commit reconciliation: ${msg}`
          );
        });
      }

      if (hooks?.emitEvent) {
        await hooks.emitEvent(
          executionId,
          EXECUTION_EVENT_TYPE.EXECUTION_RESUMED as any,
          {
            action: 'reconcile_outbound_effect',
            effectId,
            targetState: 'COMMITTED',
            resolvedBy: effectiveResolver,
            reason: dto.resolutionReason,
          },
          { stepId: targetStep.id }
        );
      }
    } else if (dto.targetState === 'FAILED') {
      resolved = await this.runTransaction(async (tx) => {
        const res = await this.ledger!.resolveUnknown(
          {
            id: effectId,
            targetState: dto.targetState,
            resolutionReason: dto.resolutionReason,
            resolvedBy: effectiveResolver,
          },
          tx
        );

        await tx.executionStep.update({
          where: { id: targetStep.id },
          data: {
            status: 'failed',
            errorCode: 'OUTBOUND_EFFECT_FAILED',
            errorMessage: dto.resolutionReason,
            takeoverTriggered: false,
            endedAt: new Date(),
            leaseExpiresAt: null,
          },
        });

        await tx.execution.update({
          where: { id: executionId },
          data: {
            takeoverRequired: true,
            takeoverReason: `Outbound effect ${effectId} reconciled as FAILED: ${dto.resolutionReason}`,
            failureCode: 'OUTBOUND_EFFECT_FAILED',
            failureReason: dto.resolutionReason,
          },
        });

        return res;
      });
    } else if (dto.targetState === 'CANCELLED') {
      resolved = await this.runTransaction(async (tx) => {
        const res = await this.ledger!.resolveUnknown(
          {
            id: effectId,
            targetState: dto.targetState,
            resolutionReason: dto.resolutionReason,
            resolvedBy: effectiveResolver,
          },
          tx
        );

        await tx.executionStep.update({
          where: { id: targetStep.id },
          data: {
            status: 'cancelled',
            takeoverTriggered: false,
            endedAt: new Date(),
            leaseExpiresAt: null,
          },
        });

        await tx.execution.update({
          where: { id: executionId },
          data: {
            takeoverRequired: false,
            takeoverReason: null,
            failureReason:
              dto.resolutionReason || 'Execution cancelled via outbound effect reconciliation',
            endedAt: new Date(),
          },
        });

        return res;
      });

      if (hooks?.updateStatus) {
        await hooks.updateStatus(executionId, EXECUTION_STATUS.CANCELLED);
      } else {
        await this.prisma.execution.update({
          where: { id: executionId },
          data: { status: EXECUTION_STATUS.CANCELLED },
        });
      }
    }

    return resolved;
  }

  async authorizeRetryOutboundEffect(
    executionId: string,
    effectId: string,
    dto: AuthorizeRetryOutboundEffectDto,
    userId: string,
    requester?: RequestUserContext,
    hooks?: ExecutionReconciliationHooks
  ) {
    const execution = await this.prisma.execution.findUnique({
      where: { id: executionId },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    if (!this.ledger) {
      throw new BadRequestException('Outbound effect ledger service is not available');
    }

    const record = await this.prisma.outboundEffectLedger.findUnique({
      where: { id: effectId },
    });

    if (!record) {
      throw new NotFoundException(`Outbound effect record ${effectId} not found`);
    }

    if (!record.idempotencyKey.startsWith(`${executionId}:`)) {
      throw new ForbiddenException(
        `OUTBOUND_EFFECT_MISMATCH: Outbound effect '${effectId}' does not belong to execution '${executionId}'`
      );
    }

    const steps = await this.prisma.executionStep.findMany({
      where: { executionId },
      orderBy: { stepIndex: 'asc' },
    });

    const targetStep = this.findTargetStep(steps, effectId, record.idempotencyKey);
    const effectiveUser = requester?.id || userId;

    const authorized = await this.runTransaction(async (tx) => {
      const res = await this.ledger!.authorizeRetry(
        {
          id: effectId,
          authorizedBy: effectiveUser,
          reason: dto.reason,
        },
        tx
      );

      await tx.executionStep.update({
        where: { id: targetStep.id },
        data: {
          status: 'pending',
          errorCode: null,
          errorMessage: null,
          takeoverTriggered: false,
          startedAt: null,
          endedAt: null,
          leaseExpiresAt: null,
        },
      });

      await tx.execution.update({
        where: { id: executionId },
        data: {
          takeoverRequired: false,
          takeoverReason: null,
          failureCode: null,
          failureReason: null,
        },
      });

      if (process.env.EXECUTION_OUTBOX_ENABLED === 'true' && this.outbox) {
        const trace =
          (requester as any)?.traceContext || ((execution as any)?.metadata as any)?.traceContext;
        await this.outbox.enqueue(
          {
            aggregateType: 'execution',
            aggregateId: executionId,
            eventType: 'execution.ready',
            payload: {
              executionId,
              reason: 'retry_authorized',
              dispatcherVersion: 'v2',
              ...(trace ? { traceContext: trace } : {}),
            },
            traceContext: trace,
          },
          tx
        );
      }

      return res;
    });

    if (hooks?.updateStatus) {
      await hooks.updateStatus(executionId, EXECUTION_STATUS.QUEUED);
    } else {
      await this.prisma.execution.update({
        where: { id: executionId },
        data: { status: EXECUTION_STATUS.QUEUED },
      });
    }

    if (process.env.EXECUTION_OUTBOX_ENABLED !== 'true' && hooks?.startExecution) {
      hooks.startExecution(executionId).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Failed to resume execution ${executionId} after retry authorization: ${msg}`
        );
      });
    }

    if (hooks?.emitEvent) {
      await hooks.emitEvent(
        executionId,
        EXECUTION_EVENT_TYPE.EXECUTION_RESUMED as any,
        {
          action: 'authorize_retry_outbound_effect',
          effectId,
          authorizedBy: effectiveUser,
          reason: dto.reason,
        },
        { stepId: targetStep.id }
      );
    }

    return authorized;
  }
}
