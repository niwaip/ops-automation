import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EXECUTION_STEP_STATUS } from './contracts/execution-step-status';
import { PrismaService } from '../prisma/prisma.service';

interface CreateBootstrapGotoStepInput {
  executionId: string;
  stepIndex: number;
  url: string;
}

interface StartStepInput {
  targetJson?: Record<string, unknown>;
  inputJson?: Record<string, unknown>;
}

interface FinishRuntimeStepInput {
  success: boolean;
  outputJson?: Record<string, unknown> | null;
  errorCode?: string;
  errorMessage?: string | null;
  snapshotId?: string;
  takeoverTriggered?: boolean;
}

interface MarkStepWaitingInput {
  requiredInputs?: unknown[];
  outputJson?: Record<string, unknown> | null;
  errorCode?: string;
  errorMessage?: string | null;
}

interface FinishBrowserStepInput {
  success: boolean;
  output?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  snapshotId?: string;
  shouldTakeover: boolean;
}

interface FinishSystemSkillStepInput {
  success: boolean;
  runtime: string;
  releaseId: string;
  capabilityId: string;
  capabilityVersion?: string | null;
  publishedSkillId: string;
  result?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  logs: string[];
  error?: string | null;
}

@Injectable()
export class ExecutionStepService {
  constructor(private readonly prisma: PrismaService) {}

  async listByExecutionId(executionId: string) {
    return this.prisma.executionStep.findMany({
      where: { executionId },
      orderBy: { stepIndex: 'asc' },
    });
  }

  async createManyPlannedSteps(steps: Array<Record<string, unknown>>): Promise<void> {
    if (steps.length === 0) {
      return;
    }

    await this.prisma.executionStep.createMany({
      data: steps as never,
    });
  }

  async findPendingBrowserGotoStep(executionId: string) {
    return this.prisma.executionStep.findFirst({
      where: {
        executionId,
        type: 'browser_action',
        action: 'goto',
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

  async createBootstrapGotoStep(input: CreateBootstrapGotoStepInput) {
    return this.prisma.executionStep.create({
      data: {
        executionId: input.executionId,
        stepIndex: input.stepIndex,
        name: 'Open target page',
        type: 'browser_action',
        status: EXECUTION_STEP_STATUS.PENDING,
        action: 'goto',
        targetJson: this.asJsonValue({ url: input.url }),
        inputJson: this.asJsonValue({ url: input.url }),
      },
    });
  }

  async setCurrentStep(executionId: string, stepId: string): Promise<void> {
    await this.prisma.execution.update({
      where: { id: executionId },
      data: { currentStepId: stepId },
    });
  }

  async startStep(stepId: string, input: StartStepInput = {}): Promise<void> {
    await this.prisma.executionStep.update({
      where: { id: stepId },
      data: {
        status: EXECUTION_STEP_STATUS.RUNNING,
        startedAt: new Date(),
        ...(input.targetJson !== undefined ? { targetJson: this.asJsonValue(input.targetJson) } : {}),
        ...(input.inputJson !== undefined ? { inputJson: this.asJsonValue(input.inputJson) } : {}),
      },
    });
  }

  async finishBrowserStep(stepId: string, input: FinishBrowserStepInput): Promise<void> {
    await this.finishRuntimeStep(stepId, {
      success: input.success,
      outputJson: input.output,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      snapshotId: input.snapshotId,
      takeoverTriggered: input.shouldTakeover,
    });
  }

  async finishSystemSkillStep(stepId: string, input: FinishSystemSkillStepInput): Promise<void> {
    const output = input.output || input.result || null;

    await this.finishRuntimeStep(stepId, {
      success: input.success,
      outputJson: {
        runtime: input.runtime,
        releaseId: input.releaseId,
        capabilityId: input.capabilityId,
        capabilityVersion: input.capabilityVersion,
        publishedSkillId: input.publishedSkillId,
        result: output,
        logs: input.logs,
      },
      errorCode: input.success ? undefined : 'CAPABILITY_RUNTIME_FAILED',
      errorMessage: input.error || undefined,
    });
  }

  async finishRuntimeStep(stepId: string, input: FinishRuntimeStepInput): Promise<void> {
    await this.prisma.executionStep.update({
      where: { id: stepId },
      data: {
        status: input.success ? EXECUTION_STEP_STATUS.SUCCEEDED : EXECUTION_STEP_STATUS.FAILED,
        outputJson: this.asJsonValue(input.outputJson),
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        snapshotId: input.snapshotId,
        takeoverTriggered: input.takeoverTriggered,
        endedAt: new Date(),
      },
    });
  }

  async markStepWaiting(stepId: string, input: MarkStepWaitingInput = {}): Promise<void> {
    await this.prisma.executionStep.update({
      where: { id: stepId },
      data: {
        status: EXECUTION_STEP_STATUS.WAITING_INPUT,
        ...(input.requiredInputs !== undefined
          ? {
              inputJson: this.asJsonValue({
                requiredInputs: input.requiredInputs,
              }),
            }
          : {}),
        ...(input.outputJson !== undefined ? { outputJson: this.asJsonValue(input.outputJson) } : {}),
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        endedAt: null,
      },
    });
  }

  async skipPendingSteps(executionId: string, currentStepId: string, reason: string): Promise<string[]> {
    const pendingSteps = await this.prisma.executionStep.findMany({
      where: {
        executionId,
        status: EXECUTION_STEP_STATUS.PENDING,
        id: { not: currentStepId },
      },
    });

    if (pendingSteps.length === 0) {
      return [];
    }

    await this.prisma.executionStep.updateMany({
      where: {
        executionId,
        status: EXECUTION_STEP_STATUS.PENDING,
        id: { not: currentStepId },
      },
      data: {
        status: EXECUTION_STEP_STATUS.SKIPPED,
        errorMessage: reason,
        endedAt: new Date(),
      },
    });

    return pendingSteps.map((step) => step.id);
  }

  async skipSingleStep(stepId: string, reason: string): Promise<void> {
    await this.prisma.executionStep.update({
      where: { id: stepId },
      data: {
        status: EXECUTION_STEP_STATUS.SKIPPED,
        errorMessage: reason,
        endedAt: new Date(),
      },
    });
  }

  async requeueFailedStep(stepId: string): Promise<void> {
    await this.prisma.executionStep.update({
      where: { id: stepId },
      data: {
        status: EXECUTION_STEP_STATUS.PENDING,
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        endedAt: null,
      },
    });
  }

  async prepareWaitingInputStep(
    executionId: string,
    stepId: string,
    requiredInputs: unknown[],
  ): Promise<void> {
    await this.setCurrentStep(executionId, stepId);

    await this.prisma.executionStep.update({
      where: { id: stepId },
      data: {
        status: EXECUTION_STEP_STATUS.RUNNING,
        startedAt: new Date(),
        inputJson: this.asJsonValue({
          requiredInputs,
        }),
      },
    });
  }

  async deleteByExecutionId(executionId: string): Promise<void> {
    await this.prisma.executionStep.deleteMany({
      where: { executionId },
    });
  }

  private asJsonValue(value: unknown): Prisma.JsonValue {
    return value as Prisma.JsonValue;
  }
}
