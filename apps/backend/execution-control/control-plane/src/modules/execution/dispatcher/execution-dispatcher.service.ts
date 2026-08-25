import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { hostname } from 'os';
import { ExecutionOutboxService } from '../outbox/execution-outbox.service';
import { DeterministicPlanRecoveryService } from '../plan-runtime/deterministic-plan-recovery.service';
import { DeterministicPlanSchedulerService } from '../plan-runtime/deterministic-plan-scheduler.service';
import { roleEnabled } from '../../../config/control-plane-role';

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
    this.timer = setInterval(() => void this.dispatchOnce(), pollMs);
    this.recoveryTimer = setInterval(
      () =>
        void this.recovery.recoverPendingPlans().catch((error) => {
          this.logger.error(
            `Periodic recovery failed: ${error instanceof Error ? error.message : String(error)}`
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
    try {
      const items = await this.outbox.claimBatch(this.owner, {
        eventTypes: ['execution.ready'],
        limit: Number(process.env.EXECUTION_DISPATCHER_BATCH_SIZE || 20),
        leaseMs: Number(process.env.EXECUTION_DISPATCHER_LEASE_MS || 30_000),
      });
      let completed = 0;
      for (const item of items) {
        const executionId =
          typeof item.payload.executionId === 'string'
            ? item.payload.executionId
            : item.aggregateId;
        try {
          await this.scheduler.advanceExecution(executionId);
          if (await this.outbox.markPublished(item.id, this.owner)) completed += 1;
        } catch (error) {
          this.logger.error(
            `Dispatch failed for execution ${executionId}: ${error instanceof Error ? error.message : String(error)}`
          );
          const retryDelay = Math.min(60_000, 1_000 * 2 ** Math.min(item.attempts, 6));
          await this.outbox.releaseForRetry(item.id, this.owner, retryDelay);
        }
      }
      return completed;
    } finally {
      this.dispatching = false;
    }
  }
}
