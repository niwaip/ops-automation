import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ExecutionPhaseService } from '../state/execution-phase.service';
import { ExecutionStepService } from '../step-runner/steps/execution-step.service';
import {
  ExecutionDto,
  ExecutionPhaseDto,
  ExecutionStepDto,
  ListExecutionsDto,
} from '../state/execution.dto';
import {
  mapExecutionPhaseToDto,
  mapExecutionStepToDto,
  mapExecutionToDto,
} from '../state/execution.mapper';
import { ensureExecutionPermission } from '../shared/execution-permission.util';

interface RequestUserContext {
  id: string;
  role?: string;
}

@Injectable()
export class ExecutionQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executionPhaseService: ExecutionPhaseService,
    private readonly executionStepService: ExecutionStepService
  ) {}

  async getById(id: string, requester?: RequestUserContext): Promise<ExecutionDto> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    ensureExecutionPermission(execution.createdBy, requester);

    const runtimeSession = await this.prisma.runtimeSession.findFirst({
      where: { executionId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const phases = await this.executionPhaseService.listByExecutionId(id);

    return mapExecutionToDto({
      ...execution,
      runtimeSessionId: runtimeSession?.id || null,
      phases,
    });
  }

  async getPhases(id: string, requester?: RequestUserContext): Promise<ExecutionPhaseDto[]> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    ensureExecutionPermission(execution.createdBy, requester);

    return (await this.executionPhaseService.listByExecutionId(id))
      .map((phase) => mapExecutionPhaseToDto(phase))
      .filter((phase): phase is NonNullable<ExecutionDto['phases']>[number] => Boolean(phase));
  }

  async getSteps(id: string, requester?: RequestUserContext): Promise<ExecutionStepDto[]> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    ensureExecutionPermission(execution.createdBy, requester);

    const steps = await this.executionStepService.listByExecutionId(id);

    return steps.map((step) => mapExecutionStepToDto(step));
  }

  async list(
    dto: ListExecutionsDto,
    requester?: RequestUserContext
  ): Promise<{ data: ExecutionDto[]; total: number; page: number; pageSize: number }> {
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
    if (requester?.id && requester.role !== 'admin') {
      where.createdBy = requester.id;
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

    const runtimeSessions =
      executions.length > 0
        ? await this.prisma.runtimeSession.findMany({
            where: {
              executionId: {
                in: executions.map((execution) => execution.id),
              },
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true, executionId: true },
          })
        : [];
    const runtimeSessionIdByExecutionId = new Map<string, string>();
    runtimeSessions.forEach((runtimeSession) => {
      if (!runtimeSessionIdByExecutionId.has(runtimeSession.executionId)) {
        runtimeSessionIdByExecutionId.set(runtimeSession.executionId, runtimeSession.id);
      }
    });

    return {
      data: executions.map((execution) =>
        mapExecutionToDto({
          ...execution,
          runtimeSessionId: runtimeSessionIdByExecutionId.get(execution.id) || null,
        })
      ),
      total,
      page,
      pageSize,
    };
  }
}
