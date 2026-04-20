import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface CreateStepInput {
  executionId: string;
  stepIndex: number;
  name?: string;
  type: string;
  action?: string;
  inputJson?: Record<string, unknown>;
}

export interface UpdateStepInput {
  name?: string;
  status?: string;
  action?: string;
  targetJson?: Record<string, unknown>;
  inputJson?: Record<string, unknown>;
  outputJson?: Record<string, unknown>;
  assertionJson?: Record<string, unknown>;
  errorMessage?: string;
  errorCode?: string;
  retryCount?: number;
  snapshotId?: string;
  takeoverTriggered?: boolean;
  startedAt?: Date;
  endedAt?: Date;
}

@Injectable()
export class ExecutionStepService {
  private readonly logger = new Logger(ExecutionStepService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createStep(input: CreateStepInput) {
    const step = await this.prisma.executionStep.create({
      data: {
        executionId: input.executionId,
        stepIndex: input.stepIndex,
        name: input.name,
        type: input.type,
        status: 'pending',
        action: input.action,
        inputJson: input.inputJson as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Created execution step: ${step.id} for execution ${input.executionId}`);
    return step;
  }

  async createSteps(steps: CreateStepInput[]) {
    const created = await this.prisma.executionStep.createMany({
      data: steps.map((s) => ({
        executionId: s.executionId,
        stepIndex: s.stepIndex,
        name: s.name,
        type: s.type,
        status: 'pending',
        action: s.action,
        inputJson: s.inputJson as Prisma.InputJsonValue,
      })),
    });

    this.logger.log(`Created ${created.count} execution steps for execution ${steps[0]?.executionId}`);
    return created;
  }

  async getStepById(id: string) {
    const step = await this.prisma.executionStep.findUnique({
      where: { id },
    });

    if (!step) {
      throw new NotFoundException(`ExecutionStep ${id} not found`);
    }

    return step;
  }

  async getStepsByExecutionId(executionId: string) {
    return this.prisma.executionStep.findMany({
      where: { executionId },
      orderBy: { stepIndex: 'asc' },
    });
  }

  async updateStep(id: string, input: UpdateStepInput) {
    const step = await this.prisma.executionStep.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.action !== undefined && { action: input.action }),
        ...(input.targetJson !== undefined && { targetJson: input.targetJson as Prisma.InputJsonValue }),
        ...(input.inputJson !== undefined && { inputJson: input.inputJson as Prisma.InputJsonValue }),
        ...(input.outputJson !== undefined && { outputJson: input.outputJson as Prisma.InputJsonValue }),
        ...(input.assertionJson !== undefined && { assertionJson: input.assertionJson as Prisma.InputJsonValue }),
        ...(input.errorMessage !== undefined && { errorMessage: input.errorMessage }),
        ...(input.errorCode !== undefined && { errorCode: input.errorCode }),
        ...(input.retryCount !== undefined && { retryCount: input.retryCount }),
        ...(input.snapshotId !== undefined && { snapshotId: input.snapshotId }),
        ...(input.takeoverTriggered !== undefined && { takeoverTriggered: input.takeoverTriggered }),
        ...(input.startedAt !== undefined && { startedAt: input.startedAt }),
        ...(input.endedAt !== undefined && { endedAt: input.endedAt }),
      },
    });

    this.logger.log(`Updated execution step: ${id}, status: ${input.status}`);
    return step;
  }

  async updateStepStatus(id: string, status: string, additionalData?: Partial<UpdateStepInput>) {
    const updateData: UpdateStepInput = { status };

    if (status === 'running' && !additionalData?.startedAt) {
      updateData.startedAt = new Date();
    }

    if (['succeeded', 'failed', 'skipped'].includes(status) && !additionalData?.endedAt) {
      updateData.endedAt = new Date();
    }

    if (additionalData) {
      Object.assign(updateData, additionalData);
    }

    return this.updateStep(id, updateData);
  }

  async getNextPendingStep(executionId: string) {
    return this.prisma.executionStep.findFirst({
      where: {
        executionId,
        status: 'pending',
      },
      orderBy: { stepIndex: 'asc' },
    });
  }

  async getCurrentStep(executionId: string) {
    const steps = await this.prisma.executionStep.findMany({
      where: {
        executionId,
        status: { in: ['running', 'pending'] },
      },
      orderBy: { stepIndex: 'asc' },
      take: 1,
    });

    return steps[0] || null;
  }
}