import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ExecutionStepReaderService } from './execution-step-reader.service';
import {
  CreateBootstrapGotoStepInput,
  FinishBrowserStepInput,
  FinishRuntimeStepInput,
  FinishSystemSkillStepInput,
  InsertPlannedStepsAfterStepInput,
  MarkStepWaitingInput,
  StartStepInput,
} from './execution-step.types';
import { ExecutionStepWriterService } from './execution-step-writer.service';

@Injectable()
export class ExecutionStepService {
  private readonly reader: ExecutionStepReaderService;
  private readonly writer: ExecutionStepWriterService;

  constructor(
    prisma: PrismaService,
    reader?: ExecutionStepReaderService,
    writer?: ExecutionStepWriterService
  ) {
    this.reader = reader || new ExecutionStepReaderService(prisma);
    this.writer = writer || new ExecutionStepWriterService(prisma);
  }

  async listByExecutionId(executionId: string) {
    return this.reader.listByExecutionId(executionId);
  }

  async createManyPlannedSteps(steps: Array<Record<string, unknown>>): Promise<void> {
    await this.writer.createManyPlannedSteps(steps);
  }

  async findPendingBrowserGotoStep(executionId: string) {
    return this.reader.findPendingBrowserGotoStep(executionId);
  }

  async findPendingInputCollectionStep(executionId: string) {
    return this.reader.findPendingInputCollectionStep(executionId);
  }

  async findNextPendingStep(executionId: string) {
    return this.reader.findNextPendingStep(executionId);
  }

  async getById(stepId: string) {
    return this.reader.getById(stepId);
  }

  async createBootstrapGotoStep(input: CreateBootstrapGotoStepInput) {
    return this.writer.createBootstrapGotoStep(input);
  }

  async setCurrentStep(executionId: string, stepId: string): Promise<void> {
    await this.writer.setCurrentStep(executionId, stepId);
  }

  async startStep(stepId: string, input: StartStepInput = {}): Promise<void> {
    await this.writer.startStep(stepId, input);
  }

  async finishBrowserStep(stepId: string, input: FinishBrowserStepInput): Promise<void> {
    await this.writer.finishBrowserStep(stepId, input);
  }

  async finishSystemSkillStep(stepId: string, input: FinishSystemSkillStepInput): Promise<void> {
    await this.writer.finishSystemSkillStep(stepId, input);
  }

  async finishRuntimeStep(stepId: string, input: FinishRuntimeStepInput): Promise<void> {
    await this.writer.finishRuntimeStep(stepId, input);
  }

  async finishControlStep(
    stepId: string,
    input?: {
      outputJson?: Record<string, unknown> | null;
      errorCode?: string;
      errorMessage?: string | null;
      success?: boolean;
    }
  ): Promise<void> {
    await this.writer.finishControlStep(stepId, input);
  }

  async markStepWaiting(stepId: string, input: MarkStepWaitingInput = {}): Promise<void> {
    await this.writer.markStepWaiting(stepId, input);
  }

  async skipPendingSteps(
    executionId: string,
    currentStepId: string,
    reason: string
  ): Promise<string[]> {
    return this.writer.skipPendingSteps(executionId, currentStepId, reason);
  }

  async skipSingleStep(stepId: string, reason: string): Promise<void> {
    await this.writer.skipSingleStep(stepId, reason);
  }

  async requeueFailedStep(stepId: string): Promise<void> {
    await this.writer.requeueFailedStep(stepId);
  }

  async prepareWaitingInputStep(
    executionId: string,
    stepId: string,
    requiredInputs: unknown[]
  ): Promise<void> {
    await this.writer.prepareWaitingInputStep(executionId, stepId, requiredInputs);
  }

  async insertPlannedStepsAfterStep(input: InsertPlannedStepsAfterStepInput): Promise<void> {
    await this.writer.insertPlannedStepsAfterStep(input);
  }

  async deleteByExecutionId(executionId: string): Promise<void> {
    await this.writer.deleteByExecutionId(executionId);
  }
}
