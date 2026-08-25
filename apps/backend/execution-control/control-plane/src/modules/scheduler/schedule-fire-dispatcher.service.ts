import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { hostname } from 'os';
import { ExecutionService } from '../execution/execution.service';
import { ExecutionOutboxService } from '../execution/outbox/execution-outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { roleEnabled } from '../../config/control-plane-role';

@Injectable()
export class ScheduleFireDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduleFireDispatcherService.name);
  private readonly owner = `${hostname()}:${process.pid}:schedule-fire-dispatcher`;
  private timer: NodeJS.Timeout | null = null;
  private dispatching = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: ExecutionOutboxService,
    private readonly executions: ExecutionService
  ) {}

  onModuleInit(): void {
    if (!roleEnabled('schedule')) return;
    if (
      process.env.EXECUTION_OUTBOX_ENABLED !== 'true' ||
      process.env.SCHEDULE_FIRE_V2_ENABLED !== 'true'
    ) {
      return;
    }
    const pollMs = Math.max(Number(process.env.SCHEDULE_FIRE_DISPATCH_POLL_MS || 1_000), 250);
    this.timer = setInterval(() => void this.dispatchOnce(), pollMs);
    void this.dispatchOnce();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async dispatchOnce(): Promise<number> {
    if (this.dispatching) return 0;
    this.dispatching = true;
    try {
      const items = await this.outbox.claimBatch(this.owner, {
        eventTypes: ['schedule.fire.created'],
        limit: 10,
        leaseMs: 30_000,
      });
      let completed = 0;
      for (const item of items) {
        const payload = item.payload;
        const fireId = typeof payload.fireId === 'string' ? payload.fireId : item.aggregateId;
        try {
          const existing = await this.prisma.$queryRawUnsafe<Array<{ executionId: string | null }>>(
            `SELECT execution_id AS "executionId"
               FROM schedule_fires
              WHERE id = $1::uuid`,
            fireId
          );
          let executionId = existing[0]?.executionId || undefined;
          if (!executionId) {
            if (
              typeof payload.createdBy !== 'string' ||
              typeof payload.skillId !== 'string' ||
              typeof payload.scheduleId !== 'string'
            ) {
              throw new Error(`Schedule fire ${fireId} has an invalid payload`);
            }
            const execution = await this.executions.create(payload.createdBy, {
              skillId: payload.skillId,
              skillVersion:
                typeof payload.skillVersion === 'string' ? payload.skillVersion : undefined,
              input:
                payload.input && typeof payload.input === 'object' && !Array.isArray(payload.input)
                  ? (payload.input as Record<string, unknown>)
                  : {},
              triggerType: 'schedule',
              scheduleId: payload.scheduleId,
              idempotencyKey: `schedule-fire:${fireId}`,
            });
            executionId = execution.id;
            await this.prisma.$queryRawUnsafe(
              `UPDATE schedule_fires
                  SET status = 'execution_created', execution_id = $2::uuid,
                      claimed_by = NULL, lease_expires_at = NULL, updated_at = NOW()
                WHERE id = $1::uuid
                  AND execution_id IS NULL`,
              fireId,
              executionId
            );
          }
          if (await this.outbox.markPublished(item.id, this.owner)) completed += 1;
        } catch (error) {
          this.logger.error(
            `Failed to dispatch schedule fire ${fireId}: ${error instanceof Error ? error.message : String(error)}`
          );
          await this.outbox.releaseForRetry(
            item.id,
            this.owner,
            Math.min(60_000, 1_000 * 2 ** Math.min(item.attempts, 6))
          );
        }
      }
      return completed;
    } finally {
      this.dispatching = false;
    }
  }
}
