import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateRuntimeSessionDto,
  RuntimeSessionDto,
  FreezeRuntimeSessionDto,
  ResumeRuntimeSessionDto,
  ListRuntimeSessionsDto,
} from './runtime-session.dto';
import { AllocationService } from '../allocation/allocation.service';
import { FreezeService } from '../freeze/freeze.service';

// RuntimeSession state type
type RuntimeSessionState = 'allocating' | 'ready' | 'busy' | 'frozen' | 'closed' | 'error';

// Valid state transitions
const validTransitions: Record<RuntimeSessionState, RuntimeSessionState[]> = {
  allocating: ['ready', 'error', 'closed'],
  ready: ['busy', 'frozen', 'closed', 'error'],
  busy: ['frozen', 'ready', 'closed', 'error'],
  frozen: ['busy', 'closed'],
  closed: [],
  error: ['closed'],
};

@Injectable()
export class RuntimeSessionService {
  private readonly logger = new Logger(RuntimeSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly allocationService: AllocationService,
    private readonly freezeService: FreezeService,
  ) {}

  async create(dto: CreateRuntimeSessionDto): Promise<RuntimeSessionDto> {
    // Allocate worker through existing allocation service
    let workerId = dto.workerId;
    let connectionInfo: Record<string, unknown> | undefined = dto.connectionInfo;

    // If no workerId provided, allocate one
    if (!workerId) {
      const workerInfo = await this.allocationService.allocateWorker(dto.executionId || 'temp');
      if (!workerInfo) {
        throw new BadRequestException('No available workers in pool');
      }
      workerId = workerInfo.worker_id;
      connectionInfo = workerInfo.endpoints as unknown as Record<string, unknown>;
    }

    // PostgreSQL stores the formal runtime state. Redis only mirrors control data.
    const runtimeSession = await this.prisma.runtimeSession.create({
      data: {
        executionId: dto.executionId,
        runtimeType: dto.runtimeType || 'browser',
        workerId,
        profileId: dto.profileId || dto.userId,
        state: 'ready',
        controlMode: 'AGENT_RUNNING',
        connectionInfoJson: this.asJsonValue(connectionInfo),
        lastActivityAt: new Date(),
      },
    });

    await this.freezeService.syncRuntimeControlState(
      runtimeSession.id,
      runtimeSession.state,
      runtimeSession.controlMode as 'AGENT_RUNNING' | 'HUMAN_CONTROL',
    );

    this.logger.log(`RuntimeSession created: ${runtimeSession.id}, worker=${workerId}`);

    return this.toDto(runtimeSession);
  }

  async getById(id: string): Promise<RuntimeSessionDto> {
    const runtimeSession = await this.prisma.runtimeSession.findUnique({
      where: { id },
    });

    if (!runtimeSession) {
      throw new NotFoundException(`RuntimeSession ${id} not found`);
    }

    return this.toDto(runtimeSession);
  }

  async freeze(id: string, dto: FreezeRuntimeSessionDto): Promise<RuntimeSessionDto> {
    const runtimeSession = await this.prisma.runtimeSession.findUnique({
      where: { id },
    });

    if (!runtimeSession) {
      throw new NotFoundException(`RuntimeSession ${id} not found`);
    }

    const currentState = runtimeSession.state as RuntimeSessionState;
    if (!validTransitions[currentState].includes('frozen')) {
      throw new BadRequestException(`Cannot freeze from state ${currentState}`);
    }

    // Update state to frozen
    const updated = await this.prisma.runtimeSession.update({
      where: { id },
      data: {
        state: 'frozen',
        controlMode: 'HUMAN_CONTROL',
        freezeReason: dto.reason,
        lastActivityAt: new Date(),
      },
    });

    await this.freezeService.freezeSession(id, dto.reason);

    this.logger.log(`RuntimeSession ${id} frozen: ${dto.reason}`);

    return this.toDto(updated);
  }

  async resume(id: string, dto: ResumeRuntimeSessionDto): Promise<RuntimeSessionDto> {
    const runtimeSession = await this.prisma.runtimeSession.findUnique({
      where: { id },
    });

    if (!runtimeSession) {
      throw new NotFoundException(`RuntimeSession ${id} not found`);
    }

    if (runtimeSession.state !== 'frozen') {
      throw new BadRequestException(`RuntimeSession ${id} is not in frozen state`);
    }

    // Update state to busy (resuming execution)
    const updated = await this.prisma.runtimeSession.update({
      where: { id },
      data: {
        state: 'busy',
        controlMode: 'AGENT_RUNNING',
        freezeReason: null,
        lastActivityAt: new Date(),
      },
    });

    await this.freezeService.unfreezeSession(id, dto.stepId);

    this.logger.log(`RuntimeSession ${id} resumed`);

    return this.toDto(updated);
  }

  async close(id: string): Promise<RuntimeSessionDto> {
    const runtimeSession = await this.prisma.runtimeSession.findUnique({
      where: { id },
    });

    if (!runtimeSession) {
      throw new NotFoundException(`RuntimeSession ${id} not found`);
    }

    const currentState = runtimeSession.state as RuntimeSessionState;
    if (!validTransitions[currentState].includes('closed')) {
      throw new BadRequestException(`Cannot close from state ${currentState}`);
    }

    // Release worker back to pool
    if (runtimeSession.workerId) {
      await this.allocationService.releaseWorker(runtimeSession.workerId);
    }

    // Update state to closed
    const updated = await this.prisma.runtimeSession.update({
      where: { id },
      data: {
        state: 'closed',
        controlMode: 'AGENT_RUNNING',
        freezeReason: null,
        closedAt: new Date(),
        lastActivityAt: new Date(),
      },
    });

    await this.freezeService.clearControlState(id);

    this.logger.log(`RuntimeSession ${id} closed, worker released`);

    return this.toDto(updated);
  }

  async list(dto: ListRuntimeSessionsDto): Promise<{ data: RuntimeSessionDto[]; total: number; page: number; pageSize: number }> {
    const page = dto.page || 1;
    const pageSize = dto.pageSize || 10;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (dto.state) {
      where.state = dto.state;
    }
    if (dto.executionId) {
      where.executionId = dto.executionId;
    }

    const [sessions, total] = await Promise.all([
      this.prisma.runtimeSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.runtimeSession.count({ where }),
    ]);

    return {
      data: sessions.map(this.toDto),
      total,
      page,
      pageSize,
    };
  }

  private toDto(session: Record<string, unknown>): RuntimeSessionDto {
    return {
      id: session.id as string,
      executionId: session.executionId as string | undefined,
      runtimeType: session.runtimeType as string,
      workerId: session.workerId as string | undefined,
      profileId: session.profileId as string | undefined,
      state: session.state as string,
      controlMode: session.controlMode as string,
      connectionInfo: session.connectionInfoJson as Record<string, unknown> | undefined,
      healthStatus: session.healthStatus as string | undefined,
      freezeReason: session.freezeReason as string | undefined,
      lastActivityAt: session.lastActivityAt as Date | undefined,
      createdAt: session.createdAt as Date,
      updatedAt: session.updatedAt as Date,
      closedAt: session.closedAt as Date | undefined,
    };
  }

  private asJsonValue(value: Record<string, unknown> | undefined) {
    return value as never;
  }
}
