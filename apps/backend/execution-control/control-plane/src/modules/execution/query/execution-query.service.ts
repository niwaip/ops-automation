import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ExecutionPhaseService } from '../state/execution-phase.service';
import { ExecutionStepService } from '../step-runner/steps/execution-step.service';
import {
  ExecutionDto,
  ExecutionPhaseDto,
  ExecutionStepDto,
  ListExecutionsDto,
  PendingOutboundEffectDto,
  UnknownOutboundEffectDto,
} from '../state/execution.dto';
import {
  mapExecutionPhaseToDto,
  mapExecutionStepToDto,
  mapExecutionToDto,
} from '../state/execution.mapper';
import { mapExecutionListSummary } from './execution-list-summary.mapper';
import { ensureExecutionPermission } from '../shared/execution-permission.util';

interface RequestUserContext {
  id: string;
  role?: string;
}

@Injectable()
export class ExecutionQueryService {
  private readonly logger = new Logger(ExecutionQueryService.name);

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

    let pendingOutboundEffects: PendingOutboundEffectDto[] | undefined = undefined;
    let unknownOutboundEffects: UnknownOutboundEffectDto[] | undefined = undefined;

    if (this.prisma.outboundEffectLedger) {
      if (execution.status === 'pending_approval' || execution.approvalStatus === 'pending') {
        const records = await this.prisma.outboundEffectLedger.findMany({
          where: {
            idempotencyKey: { startsWith: `${id}:` },
            state: 'PREPARED',
          },
        });
        if (records.length > 0) {
          pendingOutboundEffects = records.map((r) => {
            const rawPayload = r.canonicalPayloadJson;
            let canonicalPayload: Record<string, unknown> | null = null;
            if (rawPayload && typeof rawPayload === 'object') {
              canonicalPayload = rawPayload as Record<string, unknown>;
            } else if (typeof rawPayload === 'string') {
              try {
                canonicalPayload = JSON.parse(rawPayload);
              } catch {
                canonicalPayload = null;
              }
            }
            return {
              effectId: r.id,
              capabilityKey: r.capabilityKey,
              idempotencyKey: r.idempotencyKey,
              payloadHash: r.payloadHash,
              canonicalPayload,
              state: r.state,
              stepId: r.idempotencyKey.split(':')[1] || undefined,
            };
          });
        }
      }

      if (execution.status === 'human_control' || execution.takeoverRequired) {
        const records = await this.prisma.outboundEffectLedger.findMany({
          where: {
            idempotencyKey: { startsWith: `${id}:` },
            state: 'UNKNOWN',
          },
        });
        if (records.length > 0) {
          unknownOutboundEffects = records.map((r) => ({
            effectId: r.id,
            capabilityKey: r.capabilityKey,
            idempotencyKey: r.idempotencyKey,
            payloadHash: r.payloadHash,
            errorClassification: r.errorClassification || undefined,
            resolutionReason: r.resolutionReason || undefined,
            state: r.state,
            stepId: r.idempotencyKey.split(':')[1] || undefined,
          }));
        }
      }
    }

    let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;
    if (this.prisma.llmUsageLedger) {
      try {
        const ledgerAgg = await this.prisma.llmUsageLedger.aggregate({
          where: { executionId: id },
          _sum: {
            inputTokens: true,
            outputTokens: true,
          },
        });
        const promptTokens = ledgerAgg._sum.inputTokens || 0;
        const completionTokens = ledgerAgg._sum.outputTokens || 0;
        if (promptTokens > 0 || completionTokens > 0) {
          usage = {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
          };
        }
      } catch (err) {
        this.logger.warn(`Failed to aggregate llm usage for execution ${id}: ${(err as Error).message}`);
      }
    }

    return mapExecutionToDto({
      ...execution,
      usage,
      runtimeSessionId: runtimeSession?.id || null,
      phases,
      pendingOutboundEffects,
      unknownOutboundEffects,
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
    const cleanId = dto.id?.trim().replace(/^#/, '');
    if (cleanId) {
      const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
      if (isFullUuid) {
        where.id = cleanId;
      } else if (/^[0-9a-f-]+$/i.test(cleanId)) {
        try {
          const matching = await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM executions WHERE id::text ILIKE ${'%' + cleanId + '%'} LIMIT 100
          `;
          const ids = matching.map((r) => r.id);
          where.id = { in: ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000'] };
        } catch {
          // ignore fallback
        }
      }
    }

    const cleanQuery = dto.q?.trim();
    if (cleanQuery) {
      try {
        const matching = await this.prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM executions 
          WHERE id::text ILIKE ${'%' + cleanQuery + '%'}
             OR input_json::text ILIKE ${'%' + cleanQuery + '%'}
             OR normalized_input_json::text ILIKE ${'%' + cleanQuery + '%'}
             OR result_json::text ILIKE ${'%' + cleanQuery + '%'}
             OR failure_reason ILIKE ${'%' + cleanQuery + '%'}
          ORDER BY created_at DESC
          LIMIT 500
        `;
        const ids = matching.map((r) => r.id);
        if (where.id && typeof where.id === 'object' && 'in' in (where.id as any)) {
          const existingIds = new Set((where.id as any).in as string[]);
          const intersected = ids.filter((id) => existingIds.has(id));
          where.id = { in: intersected.length > 0 ? intersected : ['00000000-0000-0000-0000-000000000000'] };
        } else if (where.id && typeof where.id === 'string') {
          if (!ids.includes(where.id)) {
            where.id = '00000000-0000-0000-0000-000000000000';
          }
        } else {
          where.id = { in: ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000'] };
        }
      } catch (err: any) {
        this.logger.warn(`Failed to execute search query q fallback: ${err.message}`);
      }
    }

    if (dto.status) {
      const statuses = dto.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
    }
    if (dto.skillId) {
      const isUuidSkill =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dto.skillId);
      if (isUuidSkill) {
        where.skillId = dto.skillId;
      } else {
        where.OR = [
          { inputJson: { path: ['capabilityId'], equals: dto.skillId } },
          { inputJson: { path: ['skillId'], equals: dto.skillId } },
          { normalizedInputJson: { path: ['capabilityId'], equals: dto.skillId } },
        ];
      }
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
        (dto.view === 'summary' ? mapExecutionListSummary : mapExecutionToDto)({
          ...execution,
          runtimeSessionId: runtimeSessionIdByExecutionId.get(execution.id) || null,
        })
      ),
      total,
      page,
      pageSize,
    };
  }

  async getPlan(id: string, requester?: RequestUserContext): Promise<any> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    ensureExecutionPermission(execution.createdBy, requester);

    const plan = await this.prisma.executionPlan.findUnique({
      where: { executionId: id },
    });

    if (!plan) {
      throw new NotFoundException(`Plan for execution ${id} not found`);
    }

    return plan;
  }

  async getArtifacts(id: string, requester?: RequestUserContext): Promise<any[]> {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
    });

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    ensureExecutionPermission(execution.createdBy, requester);

    const artifacts = await this.prisma.executionArtifact.findMany({
      where: { executionId: id },
      orderBy: { createdAt: 'desc' },
    });

    return artifacts.map((art) => ({
      ...art,
      sizeBytes: art.sizeBytes !== null && art.sizeBytes !== undefined ? Number(art.sizeBytes) : null,
    }));
  }
}
