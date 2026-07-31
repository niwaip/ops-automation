import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DeterministicPlanSchedulerService } from './deterministic-plan-scheduler.service';

@Injectable()
export class DeterministicPlanRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(DeterministicPlanRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: DeterministicPlanSchedulerService,
  ) {}

  async onModuleInit(): Promise<void> {
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
        OR: [
          { leaseExpiresAt: { lt: now } },
          { leaseExpiresAt: null },
        ],
      },
      data: {
        status: 'pending',
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });

    if (resetCount.count > 0) {
      this.logger.log(`Reset ${resetCount.count} expired/stuck step leases back to 'pending' for recovery.`);
    }

    const pendingExecutions = await this.prisma.execution.findMany({
      where: {
        executionMode: 'deterministic_plan',
        status: { in: ['queued', 'running'] },
      },
      select: { id: true, status: true },
    });

    if (pendingExecutions.length === 0) {
      this.logger.log('No pending deterministic execution plans found.');
      return;
    }

    this.logger.log(`Found ${pendingExecutions.length} pending deterministic execution plans. Recovering...`);

    for (const exec of pendingExecutions) {
      try {
        await this.scheduler.advanceExecution(exec.id);
      } catch (err: any) {
        this.logger.error(`Error recovering deterministic plan execution ${exec.id}: ${err.message}`);
      }
    }
  }
}
