import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { hostname } from 'os';
import { ExecutionOutboxService } from '../outbox/execution-outbox.service';
import { DeterministicPlanRecoveryService } from '../plan-runtime/deterministic-plan-recovery.service';
import { DeterministicPlanSchedulerService } from '../plan-runtime/deterministic-plan-scheduler.service';
import { roleEnabled } from '../../../config/control-plane-role';
import {
  createConsumerSpan,
  formatStructuredSpanLog,
} from '../../../common/tracing/consumer-span';

@Injectable()
export class ExecutionDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExecutionDispatcherService.name);
  private readonly owner = `${hostname()}:${process.pid}:execution-dispatcher`;
  private timer: NodeJS.Timeout | null = null;
  private recoveryTimer: NodeJS.Timeout | null = null;
  private dispatching = false;

  constructor(
    private readonly outbox: ExecutionOutboxService,
    private readonly scheduler: DeterministicPlanSchedulerService,
    private readonly recovery: DeterministicPlanRecoveryService
  ) {}

  onModuleInit(): void {
    if (!roleEnabled('dispatcher')) return;
    if (
      process.env.EXECUTION_OUTBOX_ENABLED !== 'true' ||
      process.env.EXECUTION_DISPATCHER_V2_ENABLED !== 'true'
    ) {
      return;
    }
    const pollMs = Math.max(Number(process.env.EXECUTION_DISPATCHER_POLL_MS || 1_000), 250);
    const recoveryMs = Math.max(Number(process.env.EXECUTION_RECOVERY_SCAN_MS || 30_000), 5_000);
    const maxAttempts = Number(process.env.EXECUTION_OUTBOX_MAX_ATTEMPTS || 10);
    this.timer = setInterval(() => void this.dispatchOnce(), pollMs);
    this.recoveryTimer = setInterval(
      () =>
        void Promise.all([
          this.recovery.recoverPendingPlans(),
          this.outbox.quarantinePoisonMessages(maxAttempts),
        ]).catch((error) => {
          this.logger.error(
            `Periodic recovery/quarantine failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }),
      recoveryMs
    );
    void this.dispatchOnce();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    this.timer = null;
    this.recoveryTimer = null;
  }

  async dispatchOnce(): Promise<number> {
    if (this.dispatching) return 0;
    this.dispatching = true;
    const maxAttempts = Number(process.env.EXECUTION_OUTBOX_MAX_ATTEMPTS || 10);
    try {
      const items = await this.outbox.claimBatch(this.owner, {
        eventTypes: ['execution.ready'],
        limit: Number(process.env.EXECUTION_DISPATCHER_BATCH_SIZE || 20),
        leaseMs: Number(process.env.EXECUTION_DISPATCHER_LEASE_MS || 30_000),
        maxAttempts,
      });
      let completed = 0;
      for (const item of items) {
        const executionId =
          typeof item.payload.executionId === 'string'
            ? item.payload.executionId
            : item.aggregateId;
        const incomingTrace = (item.payload.traceContext as any) || undefined;
        const consumerSpan = createConsumerSpan({
          incomingTraceparent: incomingTrace?.traceparent,
          tracestate: incomingTrace?.tracestate,
          fallbackTraceId: incomingTrace?.traceId,
        });

        this.logger.log(
          JSON.stringify(
            formatStructuredSpanLog(
              consumerSpan,
              `Dispatching execution ${executionId} from outbox item ${item.id}`,
              { executionId, outboxId: item.id, attempts: item.attempts }
            )
          )
        );
        try {
          await this.scheduler.advanceExecution(executionId, {
            traceContext: {
              traceparent: consumerSpan.traceparent,
              traceId: consumerSpan.traceId,
              tracestate: consumerSpan.tracestate,
            },
          });
          if (await this.outbox.markPublished(item.id, this.owner)) completed += 1;
        } catch (error) {
          const errMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `[${consumerSpan.traceId}] Dispatch failed for execution ${executionId} (attempt ${item.attempts}/${maxAttempts}): ${errMessage}`
          );
          if (item.attempts >= maxAttempts) {
            this.logger.error(
              `[${consumerSpan.traceId}] Outbox item ${item.id} exceeded max attempts (${item.attempts}/${maxAttempts}), moving to dead-letter quarantine.`
            );
            await this.outbox.markDeadLetter(item.id, this.owner, errMessage);
          } else {
            const retryDelay = Math.min(60_000, 1_000 * 2 ** Math.min(item.attempts, 6));
            await this.outbox.releaseForRetry(item.id, this.owner, retryDelay);
          }
        }
      }
      return completed;
    } finally {
      this.dispatching = false;
    }
  }
}
