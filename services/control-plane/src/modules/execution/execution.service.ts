import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateExecutionDto,
  ExecutionDto,
  ExecutionStepDto,
  TakeoverExecutionDto,
  ResumeExecutionDto,
  ListExecutionsDto,
} from './execution.dto';
import axios from 'axios';

// Execution status type
type ExecutionStatus = 'queued' | 'running' | 'pending_approval' | 'human_control' | 'succeeded' | 'failed' | 'cancelled';

// Valid status transitions
const validTransitions: Record<ExecutionStatus, ExecutionStatus[]> = {
  queued: ['running', 'cancelled'],
  running: ['pending_approval', 'human_control', 'succeeded', 'failed', 'cancelled'],
  pending_approval: ['running', 'cancelled'],
  human_control: ['running', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: [],
};

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);
  private readonly sessionBrokerUrl = process.env.SESSION_BROKER_URL || 'http://session-broker:3002';
  private readonly aiOrchestratorUrl = process.env.AI_ORCHESTRATOR_URL || 'http://ai-orchestrator:3007';

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateExecutionDto): Promise<ExecutionDto> {
    const execution = await this.prisma.execution.create({
      data: {
        createdBy: userId,
        skillId: dto.skillId,
        skillVersion: dto.skillVersion,
        status: 'queued',
        runtimeType: dto.runtimeType || 'browser',
        inputJson: this.asJsonValue(dto.input),
        riskLevel: 'L0',
        requiresApproval: false,
        takeoverRequired: false,
      },
    });

    // Create execution event
    await this.prisma.executionEvent.create({
      data: {
        executionId: execution.id,
        eventType: 'execution.created',
        eventSource: 'control-plane',
        payloadJson: this.asJsonValue({ userId, skillId: dto.skillId }),
      },
    });

    this.logger.log(`Execution created: ${execution.id}`);

    // Trigger execution start (async)
    this.startExecution(execution.id).catch((err) => {
      this.logger.error(`Failed to start execution ${execution.id}: ${err.message}`);
    });

    return this.toDto(execution);
  }

  private async startExecution(executionId: string): Promise<void> {
    const execution = await this.prisma.execution.findUnique({
      where: { id: executionId },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    // Update status to running
    await this.updateStatus(executionId, 'running');

    // Allocate runtime session via new RuntimeSession API
    try {
      const runtimeResponse = await axios.post(`${this.sessionBrokerUrl}/runtime-sessions`, {
        userId: execution.createdBy,
        executionId: execution.id,
        runtimeType: execution.runtimeType,
      });

      const runtimeSession = runtimeResponse.data;

      // Create event (RuntimeSession record is created by runtime-session service)
      await this.prisma.executionEvent.create({
        data: {
          executionId: execution.id,
          runtimeSessionId: runtimeSession.id,
          eventType: 'runtime.allocated',
          eventSource: 'control-plane',
          payloadJson: this.asJsonValue({ runtimeSessionId: runtimeSession.id }),
        },
      });

      this.logger.log(`Runtime allocated for execution ${executionId}`);
    } catch (error) {
      this.logger.error(`Failed to allocate runtime for execution ${executionId}`);
      await this.updateStatus(executionId, 'failed');
      await this.prisma.execution.update({
        where: { id: executionId },
        data: {
          failureReason: 'Failed to allocate runtime session',
          failureCode: 'RUNTIME_ALLOCATION_FAILED',
        },
      });
    }
  }

  async getById(id: string): Promise<ExecutionDto> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    return this.toDto(execution);
  }

  async getSteps(id: string): Promise<ExecutionStepDto[]> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    const steps = await this.prisma.executionStep.findMany({
      where: { executionId: id },
      orderBy: { stepIndex: 'asc' },
    });

    return steps.map(this.toStepDto);
  }

  async takeover(id: string, userId: string, dto: TakeoverExecutionDto): Promise<ExecutionDto> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    if (!validTransitions[execution.status as ExecutionStatus].includes('human_control')) {
      throw new BadRequestException(`Cannot takeover from status ${execution.status}`);
    }

    // Update execution
    await this.prisma.execution.update({
      where: { id },
      data: {
        status: 'human_control',
        takeoverRequired: true,
        takeoverReason: dto.reason,
      },
    });

    // Freeze runtime session
    const runtimeSession = await this.prisma.runtimeSession.findFirst({
      where: { executionId: id },
    });

    if (runtimeSession) {
      try {
        // Call new RuntimeSession API (state update is handled by runtime-session service)
        await axios.post(`${this.sessionBrokerUrl}/runtime-sessions/${runtimeSession.id}/freeze`, {
          reason: dto.reason,
        });
      } catch (error) {
        this.logger.error(`Failed to freeze runtime session for execution ${id}`);
      }
    }

    // Create event
    await this.prisma.executionEvent.create({
      data: {
        executionId: id,
        runtimeSessionId: runtimeSession?.id,
        eventType: 'execution.human_control.entered',
        eventSource: 'control-plane',
        payloadJson: this.asJsonValue({ userId, reason: dto.reason }),
      },
    });

    this.logger.log(`Execution ${id} entered human_control`);

    return this.getById(id);
  }

  async resume(id: string, userId: string, dto: ResumeExecutionDto): Promise<ExecutionDto> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    if (execution.status !== 'human_control') {
      throw new BadRequestException(`Execution ${id} is not in human_control status`);
    }

    // Update execution
    await this.updateStatus(id, 'running');

    // Resume runtime session
    const runtimeSession = await this.prisma.runtimeSession.findFirst({
      where: { executionId: id },
    });

    if (runtimeSession) {
      try {
        // Call new RuntimeSession API (state update is handled by runtime-session service)
        await axios.post(`${this.sessionBrokerUrl}/runtime-sessions/${runtimeSession.id}/resume`, {
          stepId: dto.stepId,
        });
      } catch (error) {
        this.logger.error(`Failed to resume runtime session for execution ${id}`);
      }
    }

    // Create event
    await this.prisma.executionEvent.create({
      data: {
        executionId: id,
        runtimeSessionId: runtimeSession?.id,
        stepId: dto.stepId,
        eventType: 'execution.resumed',
        eventSource: 'control-plane',
        payloadJson: this.asJsonValue({ userId, stepId: dto.stepId, comment: dto.comment }),
      },
    });

    this.logger.log(`Execution ${id} resumed`);

    return this.getById(id);
  }

  async cancel(id: string, userId: string): Promise<ExecutionDto> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    if (!validTransitions[execution.status as ExecutionStatus].includes('cancelled')) {
      throw new BadRequestException(`Cannot cancel from status ${execution.status}`);
    }

    await this.updateStatus(id, 'cancelled');

    // Close runtime session
    const runtimeSession = await this.prisma.runtimeSession.findFirst({
      where: { executionId: id },
    });

    if (runtimeSession) {
      try {
        // Call new RuntimeSession API (state update is handled by runtime-session service)
        await axios.post(`${this.sessionBrokerUrl}/runtime-sessions/${runtimeSession.id}/close`, {});
      } catch (error) {
        this.logger.error(`Failed to close runtime session for execution ${id}`);
      }
    }

    // Create event
    await this.prisma.executionEvent.create({
      data: {
        executionId: id,
        runtimeSessionId: runtimeSession?.id,
        eventType: 'execution.cancelled',
        eventSource: 'control-plane',
        payloadJson: this.asJsonValue({ userId }),
      },
    });

    this.logger.log(`Execution ${id} cancelled`);

    return this.getById(id);
  }

  async list(dto: ListExecutionsDto): Promise<{ data: ExecutionDto[]; total: number; page: number; pageSize: number }> {
    const page = dto.page || 1;
    const pageSize = dto.pageSize || 10;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (dto.status) {
      where.status = dto.status;
    }
    if (dto.skillId) {
      where.skillId = dto.skillId;
    }

    const [executions, total] = await Promise.all([
      this.prisma.execution.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.execution.count({ where }),
    ]);

    return {
      data: executions.map(this.toDto),
      total,
      page,
      pageSize,
    };
  }

  private async updateStatus(id: string, newStatus: ExecutionStatus): Promise<void> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    const currentStatus = execution.status as ExecutionStatus;
    if (!validTransitions[currentStatus].includes(newStatus)) {
      throw new BadRequestException(`Invalid transition from ${currentStatus} to ${newStatus}`);
    }

    await this.prisma.execution.update({
      where: { id },
      data: {
        status: newStatus,
        startedAt: newStatus === 'running' && !execution.startedAt ? new Date() : execution.startedAt,
        endedAt: ['succeeded', 'failed', 'cancelled'].includes(newStatus) ? new Date() : execution.endedAt,
      },
    });

    // Create event
    await this.prisma.executionEvent.create({
      data: {
        executionId: id,
        eventType: `execution.${newStatus}`,
        eventSource: 'control-plane',
      },
    });
  }

  private toDto(execution: Record<string, unknown>): ExecutionDto {
    return {
      id: execution.id as string,
      orgId: execution.orgId as string | undefined,
      createdBy: execution.createdBy as string,
      skillId: execution.skillId as string,
      skillVersion: execution.skillVersion as string | undefined,
      status: execution.status as string,
      runtimeType: execution.runtimeType as string,
      riskLevel: execution.riskLevel as string,
      input: execution.inputJson as Record<string, unknown> | undefined,
      normalizedInput: execution.normalizedInputJson as Record<string, unknown> | undefined,
      result: execution.resultJson as Record<string, unknown> | undefined,
      failureReason: execution.failureReason as string | undefined,
      failureCode: execution.failureCode as string | undefined,
      currentStepId: execution.currentStepId as string | undefined,
      requiresApproval: execution.requiresApproval as boolean,
      approvalStatus: execution.approvalStatus as string | undefined,
      takeoverRequired: execution.takeoverRequired as boolean,
      takeoverReason: execution.takeoverReason as string | undefined,
      startedAt: execution.startedAt as Date | undefined,
      endedAt: execution.endedAt as Date | undefined,
      createdAt: execution.createdAt as Date,
      updatedAt: execution.updatedAt as Date,
    };
  }

  private toStepDto(step: Record<string, unknown>): ExecutionStepDto {
    return {
      id: step.id as string,
      executionId: step.executionId as string,
      stepIndex: step.stepIndex as number,
      name: step.name as string | undefined,
      type: step.type as string,
      status: step.status as string,
      action: step.action as string | undefined,
      target: step.targetJson as Record<string, unknown> | undefined,
      input: step.inputJson as Record<string, unknown> | undefined,
      output: step.outputJson as Record<string, unknown> | undefined,
      assertion: step.assertionJson as Record<string, unknown> | undefined,
      errorMessage: step.errorMessage as string | undefined,
      errorCode: step.errorCode as string | undefined,
      retryCount: step.retryCount as number,
      snapshotId: step.snapshotId as string | undefined,
      takeoverTriggered: step.takeoverTriggered as boolean,
      startedAt: step.startedAt as Date | undefined,
      endedAt: step.endedAt as Date | undefined,
      createdAt: step.createdAt as Date,
      updatedAt: step.updatedAt as Date,
    };
  }

  private asJsonValue(value: unknown): Prisma.JsonValue {
    return value as Prisma.JsonValue;
  }
}
