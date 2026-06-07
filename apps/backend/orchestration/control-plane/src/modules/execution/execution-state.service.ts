import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EXECUTION_EVENT_TYPE } from './contracts/execution-event-type';
import { PrismaService } from '../prisma/prisma.service';
import { EXECUTION_STATUS, ExecutionStatus } from './contracts/execution-status';
import { ExecutionEventService, ExecutionStreamEventPayload } from './execution-event.service';
import { canTransitionExecutionStatus, isTerminalExecutionStatus } from './execution-transition-policy';

@Injectable()
export class ExecutionStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executionEventService: ExecutionEventService,
  ) {}

  async updateStatus(id: string, newStatus: ExecutionStatus): Promise<ExecutionStreamEventPayload> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    const currentStatus = execution.status as ExecutionStatus;
    if (!canTransitionExecutionStatus(currentStatus, newStatus)) {
      throw new BadRequestException(`Invalid transition from ${currentStatus} to ${newStatus}`);
    }

    await this.prisma.execution.update({
      where: { id },
      data: {
        status: newStatus,
        startedAt:
          newStatus === EXECUTION_STATUS.RUNNING && !execution.startedAt
            ? new Date()
            : execution.startedAt,
        endedAt: isTerminalExecutionStatus(newStatus) ? new Date() : execution.endedAt,
      },
    });

    return this.executionEventService.createEvent(id, EXECUTION_EVENT_TYPE.EXECUTION_STATUS_CHANGED, {
      oldStatus: currentStatus,
      newStatus,
    });
  }
}
