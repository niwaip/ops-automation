import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EXECUTION_EVENT_TYPE } from '../contracts/execution-event-type';
import { EXECUTION_STATUS, ExecutionStatus } from '../contracts/execution-status';
import { CreateExecutionEventOptions } from '../state/execution-event.service';
import { canTransitionExecutionStatus } from '../state/execution-transition-policy';
import { ExecutionDto } from '../state/execution.dto';
import { ExecutionRuntimeSessionService } from '../adapters/execution-runtime-session.service';
import { ExecutionStepService } from '../step-runner/steps/execution-step.service';
import { ensureExecutionPermission } from '../shared/execution-permission.util';

export interface RequestUserContext {
  id: string;
  role?: string;
}

export interface ExecutionLifecycleHooks {
  getExecutionDto: (id: string, requester?: RequestUserContext) => Promise<ExecutionDto>;
  updateStatus: (id: string, newStatus: ExecutionStatus) => Promise<void>;
  emitEvent: (
    executionId: string,
    eventType: (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE],
    payload: unknown,
    options?: CreateExecutionEventOptions
  ) => Promise<void>;
}

@Injectable()
export class ExecutionLifecycleService {
  private readonly logger = new Logger(ExecutionLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionStepService: ExecutionStepService,
    private readonly executionRuntimeSessionService: ExecutionRuntimeSessionService
  ) {}

  async cancel(
    id: string,
    userId: string,
    hooks: ExecutionLifecycleHooks,
    requester?: RequestUserContext
  ): Promise<ExecutionDto> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    const effectiveRequester = requester || { id: userId };
    ensureExecutionPermission(execution.createdBy, effectiveRequester);

    if (
      !canTransitionExecutionStatus(execution.status as ExecutionStatus, EXECUTION_STATUS.CANCELLED)
    ) {
      throw new BadRequestException(`Cannot cancel from status ${execution.status}`);
    }

    await hooks.updateStatus(id, EXECUTION_STATUS.CANCELLED);

    const runtimeSession = await this.prisma.runtimeSession.findFirst({
      where: { executionId: id },
    });

    if (runtimeSession) {
      await this.executionRuntimeSessionService.closeQuietly(
        runtimeSession.id,
        id,
        'execution_cancelled'
      );
    }

    await hooks.emitEvent(id, EXECUTION_EVENT_TYPE.EXECUTION_CANCELLED, { userId });

    this.logger.log(`Execution ${id} cancelled`);
    return hooks.getExecutionDto(id, effectiveRequester);
  }

  async delete(
    id: string,
    userId: string,
    requester?: RequestUserContext
  ): Promise<{ success: boolean }> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution with ID "${id}" not found`);
    }

    ensureExecutionPermission(execution.createdBy, requester || { id: userId });

    await this.executionStepService.deleteByExecutionId(id);
    await this.prisma.executionEvent.deleteMany({
      where: { executionId: id },
    });
    await this.prisma.execution.delete({
      where: { id },
    });

    this.logger.log(`Execution ${id} deleted by user ${userId}`);
    return { success: true };
  }

  async cleanupBeforeDate(
    beforeDate: string,
    userId: string,
    requester?: RequestUserContext
  ): Promise<{ success: boolean; deletedCount: number; beforeDate: string }> {
    const cutoff = this.parseCleanupCutoff(beforeDate);
    const effectiveRequester = requester || { id: userId };
    const where: Prisma.ExecutionWhereInput = {
      createdAt: { lt: cutoff },
    };

    if (effectiveRequester.role !== 'admin') {
      where.createdBy = effectiveRequester.id;
    }

    const executions = await this.prisma.execution.findMany({
      where,
      select: { id: true },
    });

    const maxCleanupLimit = Number(process.env.MAX_CLEANUP_LIMIT || 1000);
    if (executions.length > maxCleanupLimit) {
      throw new BadRequestException(
        `Cannot cleanup more than ${maxCleanupLimit} executions in a single operation. ` +
          `Found ${executions.length} matching records. Please refine the date cutoff.`
      );
    }

    if (executions.length === 0) {
      return {
        success: true,
        deletedCount: 0,
        beforeDate,
      };
    }

    const executionIds = executions.map((execution) => execution.id);

    await this.prisma.$transaction([
      this.prisma.executionStep.deleteMany({
        where: { executionId: { in: executionIds } },
      }),
      this.prisma.executionEvent.deleteMany({
        where: { executionId: { in: executionIds } },
      }),
      this.prisma.execution.deleteMany({
        where: { id: { in: executionIds } },
      }),
    ]);

    this.logger.log(`Deleted ${executionIds.length} executions before ${beforeDate} by user ${userId}`);
    return {
      success: true,
      deletedCount: executionIds.length,
      beforeDate,
    };
  }

  private parseCleanupCutoff(beforeDate: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(beforeDate)) {
      throw new BadRequestException('beforeDate must use YYYY-MM-DD format');
    }

    const cutoff = new Date(`${beforeDate}T00:00:00`);
    if (Number.isNaN(cutoff.getTime())) {
      throw new BadRequestException('beforeDate is invalid');
    }

    return cutoff;
  }
}
