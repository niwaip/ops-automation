import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EXECUTION_EVENT_TYPE } from '../../contracts/execution-event-type';
import { EXECUTION_STATUS, ExecutionStatus } from '../../contracts/execution-status';
import { CreateExecutionEventOptions } from '../../state/execution-event.service';
import { ExecutionRuntimeSessionService } from '../../adapters/execution-runtime-session.service';
import { BROWSER_RUNTIME } from '../browser/browser-execution-constants';

export interface ExecutionStartHooks {
  updateStatus: (id: string, newStatus: ExecutionStatus) => Promise<void>;
  emitEvent: (
    executionId: string,
    eventType: (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE],
    payload: unknown,
    options?: CreateExecutionEventOptions
  ) => Promise<void>;
  advanceExecutionFlow: (executionId: string, runtimeSessionId: string) => Promise<void>;
  bootstrapBrowserExecution: (execution: Record<string, unknown>, runtimeSessionId: string) => Promise<void>;
}

@Injectable()
export class ExecutionStartService {
  private readonly logger = new Logger(ExecutionStartService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionRuntimeSessionService: ExecutionRuntimeSessionService
  ) {}

  async startExecution(executionId: string, hooks: ExecutionStartHooks): Promise<void> {
    this.logger.log(`Starting execution ${executionId}`);
    const execution = await this.prisma.execution.findUnique({
      where: { id: executionId },
    });

    if (!execution) {
      this.logger.error(`Execution ${executionId} not found during startExecution`);
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    await hooks.updateStatus(executionId, EXECUTION_STATUS.RUNNING);

    if (execution.runtimeType !== BROWSER_RUNTIME.TYPE) {
      await hooks.emitEvent(execution.id, EXECUTION_EVENT_TYPE.RUNTIME_SKIPPED, {
        runtimeType: execution.runtimeType,
        mode: BROWSER_RUNTIME.NON_BROWSER_MODE,
      });
      await hooks.advanceExecutionFlow(execution.id, execution.id);
      this.logger.log(
        `Skipped browser runtime allocation for execution ${executionId} (runtime: ${execution.runtimeType})`
      );
      return;
    }

    try {
      this.logger.log(
        `Allocating runtime session for execution ${executionId} (type: ${execution.runtimeType})`
      );
      const runtimeSession = await this.executionRuntimeSessionService.allocateRuntimeSession({
        userId: execution.createdBy,
        executionId: execution.id,
        runtimeType: execution.runtimeType,
      });
      this.logger.log(`Runtime session allocated: ${runtimeSession.id}`);

      await hooks.emitEvent(execution.id, EXECUTION_EVENT_TYPE.RUNTIME_ALLOCATED, {
        runtimeSessionId: runtimeSession.id,
      });

      await hooks.bootstrapBrowserExecution(execution as unknown as Record<string, unknown>, runtimeSession.id);
      this.logger.log(`Runtime allocated and bootstrap complete for execution ${executionId}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to allocate runtime for execution ${executionId}: ${errorMsg}`);
      await hooks.updateStatus(executionId, EXECUTION_STATUS.FAILED);
      await this.prisma.execution.update({
        where: { id: executionId },
        data: {
          failureReason: `Failed to allocate runtime session: ${errorMsg}`,
          failureCode: 'RUNTIME_ALLOCATION_FAILED',
        },
      });
    }
  }
}
