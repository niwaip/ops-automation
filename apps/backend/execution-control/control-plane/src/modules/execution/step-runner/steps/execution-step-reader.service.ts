import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EXECUTION_STEP_STATUS } from '../../contracts/execution-step-status';
import { BROWSER_ACTIONS, BROWSER_RUNTIME } from '../browser/browser-execution-constants';

@Injectable()
export class ExecutionStepReaderService {
  constructor(private readonly prisma: PrismaService) {}

  async listByExecutionId(executionId: string) {
    return this.prisma.executionStep.findMany({
      where: { executionId },
      orderBy: { stepIndex: 'asc' },
    });
  }

  async findPendingBrowserGotoStep(executionId: string) {
    return this.prisma.executionStep.findFirst({
      where: {
        executionId,
        type: BROWSER_RUNTIME.STEP_TYPE,
        action: BROWSER_ACTIONS.GOTO,
        status: EXECUTION_STEP_STATUS.PENDING,
      },
      orderBy: { stepIndex: 'asc' },
    });
  }

  async findPendingInputCollectionStep(executionId: string) {
    return this.prisma.executionStep.findFirst({
      where: {
        executionId,
        type: 'input_collection',
        status: EXECUTION_STEP_STATUS.PENDING,
      },
      orderBy: { stepIndex: 'asc' },
    });
  }

  async findNextPendingStep(executionId: string) {
    return this.prisma.executionStep.findFirst({
      where: {
        executionId,
        status: EXECUTION_STEP_STATUS.PENDING,
      },
      orderBy: { stepIndex: 'asc' },
    });
  }

  async getById(stepId: string) {
    return this.prisma.executionStep.findUnique({
      where: { id: stepId },
    });
  }
}
