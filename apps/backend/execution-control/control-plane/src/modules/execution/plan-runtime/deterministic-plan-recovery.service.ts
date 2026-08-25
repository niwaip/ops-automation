import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DeterministicPlanSchedulerService } from './deterministic-plan-scheduler.service';
import { GracePolicyService } from './grace-policy.service';
import { ExecutionStreamService } from '../lifecycle/execution-stream.service';
import { roleEnabled } from '../../../config/control-plane-role';

@Injectable()
export class DeterministicPlanRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(DeterministicPlanRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: DeterministicPlanSchedulerService,
    private readonly gracePolicy: GracePolicyService,
    private readonly eventStream: ExecutionStreamService
  ) {}

  async onModuleInit(): Promise<void> {
    if (!roleEnabled('dispatcher')) return;
    // Run async recovery on startup without blocking module initialization
    setTimeout(() => {
      this.recoverPendingPlans().catch((err) => {
        this.logger.error('Failed to run deterministic plan recovery scan:', err);
      });
    }, 3000);
  }

  public async recoverPendingPlans(): Promise<void> {
    this.logger.log('Scanning for uncompleted deterministic execution plans to recover...');

    const now = new Date();
    const resetCount = await this.prisma.executionStep.updateMany({
      where: {
        execution: { executionMode: 'deterministic_plan', status: { in: ['queued', 'running'] } },
        status: 'running',
        OR: [{ leaseExpiresAt: { lt: now } }, { leaseExpiresAt: null }],
      },
      data: {
        status: 'pending',
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });

    if (resetCount.count > 0) {
      this.logger.log(
        `Reset ${resetCount.count} expired/stuck step leases back to 'pending' for recovery.`
      );
    }

    const pendingExecutions = await this.prisma.execution.findMany({
      where: {
        executionMode: 'deterministic_plan',
        status: { in: ['queued', 'running'] },
      },
      select: {
        id: true,
        status: true,
        plan: { select: { planJson: true } },
      },
    });

    if (pendingExecutions.length === 0) {
      this.logger.log('No pending deterministic execution plans found.');
      return;
    }

    this.logger.log(
      `Found ${pendingExecutions.length} pending deterministic execution plans. Recovering...`
    );

    for (const exec of pendingExecutions) {
      // Legacy grace period gate (§17.1): never-started executions rejected by
      // the grace policy are marked failed here so they never re-enter the
      // scheduler's advance loop. Fix ⑩: only legacy plans (nodes without an
      // authoritative contractRef) are subject to the gate — V2 plans are
      // exempt from the migration deadline.
      if (this.isLegacyPlan(exec) && this.gracePolicy.shouldReject(exec.status)) {
        this.logger.warn(
          `Execution ${exec.id} rejected by legacy grace policy (status=${exec.status}, grace expired)`
        );
        await this.prisma.execution.update({
          where: { id: exec.id },
          data: {
            status: 'failed',
            failureReason: 'Legacy grace period expired — execution rejected before start',
            failureCode: 'LEGACY_GRACE_EXPIRED',
            endedAt: new Date(),
          },
        });
        await this.eventStream.createEvent(exec.id, 'execution.legacy_grace.rejected', {
          oldStatus: exec.status,
          newStatus: 'failed',
          failureCode: 'LEGACY_GRACE_EXPIRED',
          failureReason: 'Legacy grace period expired — execution rejected before start',
        });
        continue;
      }
      try {
        await this.scheduler.advanceExecution(exec.id);
      } catch (err: any) {
        this.logger.error(
          `Error recovering deterministic plan execution ${exec.id}: ${err.message}`
        );
      }
    }
  }

  /**
   * Legacy vs V2 classification for the grace gate (fix ⑩). Mirrors
   * DeterministicPlanSchedulerService: V2 = every frozen node carries an
   * authoritative contractRef; anything else is legacy.
   */
  private isLegacyPlan(exec: { plan?: { planJson?: unknown } | null }): boolean {
    const nodes = (exec?.plan?.planJson as any)?.nodes;
    if (!Array.isArray(nodes) || nodes.length === 0) return true;
    return nodes.some((node: any) => !node?.contractRef);
  }
}
