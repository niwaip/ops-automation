import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ReleaseManagerPrismaPort } from '../platform-runtime.ports';
import { RELEASE_MANAGER_PRISMA } from '../platform-runtime.tokens';
import {
  mapCapabilitySourceSnapshot,
  parseCapabilityReleaseJson,
} from '../capability-release.mapper';
import { CapabilityReleaseSkillDraftService } from '../capability-release-skill-draft.service';
import { CapabilityReleaseTemporalSchemaService } from '../compiler/capability-release-temporal-schema.service';
import {
  CapabilityReleaseDTO,
  CapabilityReleaseDetailDTO,
  CapabilitySourceSnapshotDTO,
  CreateCapabilityReleaseDTO,
  UpdateCapabilitySourceDTO,
  WorkflowArtifactRefDTO,
} from '../interfaces';
import { ReleaseQueryService } from './release-query.service';
import { ReleaseSupportService } from './release-support.service';

function createBadRequestException(response: string | Record<string, unknown>): BadRequestException {
  return new BadRequestException(response);
}

function createNotFoundException(response: string | Record<string, unknown>): NotFoundException {
  return new NotFoundException(response);
}

export interface CapabilityReleaseDraftAccessors {
  getReleaseOrThrow(id: string): Promise<CapabilityReleaseDTO>;
  insertAuditEvent(
    releaseId: string,
    eventType: string,
    actorId: string | undefined,
    success: boolean,
    summary: string,
    details?: Record<string, unknown> | null
  ): Promise<void>;
}

@Injectable()
export class ReleaseDraftService {
  constructor(
    @Inject(RELEASE_MANAGER_PRISMA) private readonly prisma: ReleaseManagerPrismaPort,
    private readonly capabilityReleaseSkillDraftService: CapabilityReleaseSkillDraftService,
    private readonly capabilityReleaseTemporalSchemaService: CapabilityReleaseTemporalSchemaService,
    private readonly releaseQueryService: ReleaseQueryService,
    private readonly releaseSupportService: ReleaseSupportService
  ) {}

  async createCapability(
    dto: CreateCapabilityReleaseDTO,
    userId: string | undefined,
    accessors: CapabilityReleaseDraftAccessors
  ): Promise<CapabilityReleaseDetailDTO> {
    const releaseId = randomUUID();
    const normalizedSourceId = this.resolveReleaseSourceId(dto);
    const sourcePayload = dto.sourcePayload
      ? this.mergeWorkflowArtifactRefIntoPayload(
          dto.sourcePayload,
          dto.sourceType,
          normalizedSourceId,
          dto.workflowArtifactRef
        )
      : normalizedSourceId
        ? await this.loadSourcePayload(dto.sourceType, normalizedSourceId)
        : {};
    const sourceName = dto.sourceName || this.extractSourceName(sourcePayload) || null;

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO capability_releases (
        id, source_type, source_id, source_name, source_status, release_version, status,
        approval_status, deployment_status, created_by, created_at, updated_at
      ) VALUES (
        $1::uuid, $2, $3::uuid, $4, 'draft', 1, 'draft', 'not_required', 'not_started', $5::uuid, now(), now()
      )`,
      releaseId,
      dto.sourceType,
      normalizedSourceId,
      sourceName,
      userId || null
    );

    if (Object.keys(sourcePayload).length > 0) {
      const snapshot = await this.createSourceSnapshot(
        releaseId,
        dto.sourceType,
        normalizedSourceId,
        sourcePayload,
        userId
      );
      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_releases
         SET current_source_snapshot_id = $2::uuid, updated_at = now()
         WHERE id = $1::uuid`,
        releaseId,
        snapshot.id
      );
    }

    await accessors.insertAuditEvent(releaseId, 'release_created', userId, true, '创建 Capability');
    return this.getCapabilityDetail(releaseId);
  }

  async updateSource(
    id: string,
    dto: UpdateCapabilitySourceDTO,
    userId: string | undefined,
    accessors: CapabilityReleaseDraftAccessors
  ): Promise<CapabilityReleaseDetailDTO> {
    const release = await accessors.getReleaseOrThrow(id);
    const sourcePayload = this.mergeWorkflowArtifactRefIntoPayload(
      dto.sourcePayload,
      release.sourceType,
      release.sourceId || null,
      dto.workflowArtifactRef
    );
    const snapshot = await this.createSourceSnapshot(
      id,
      release.sourceType,
      release.sourceId || null,
      sourcePayload,
      userId
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET source_name = $2,
           current_source_snapshot_id = $3::uuid,
           status = 'draft',
           updated_at = now()
       WHERE id = $1::uuid`,
      id,
      dto.sourceName || this.extractSourceName(sourcePayload) || release.sourceName || null,
      snapshot.id
    );

    await accessors.insertAuditEvent(id, 'source_updated', userId, true, '更新源定义快照');
    return this.getCapabilityDetail(id);
  }

  private getCapabilityDetail(id: string): Promise<CapabilityReleaseDetailDTO> {
    return this.releaseQueryService.getCapabilityDetail(id, {
      getReleaseOrThrow: (releaseId: string) => this.releaseSupportService.getReleaseOrThrow(releaseId),
      getSkillDraftOrThrow: (draftId: string) => this.releaseSupportService.getSkillDraftOrThrow(draftId),
    });
  }

  private async createSourceSnapshot(
    releaseId: string,
    sourceType: string,
    sourceId: string | null,
    sourcePayload: Record<string, unknown>,
    userId?: string
  ): Promise<CapabilitySourceSnapshotDTO> {
    const snapshotId = randomUUID();
    const versionRows = await this.prisma.$queryRawUnsafe<{ max_version: number | null }[]>(
      `SELECT COALESCE(MAX(snapshot_version), 0) AS max_version
       FROM capability_source_snapshots
       WHERE release_id = $1::uuid`,
      releaseId
    );
    const snapshotVersion = Number(versionRows[0]?.max_version || 0) + 1;

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO capability_source_snapshots (
        id, release_id, snapshot_version, source_type, source_id, source_payload_json, summary, created_by, created_at
      ) VALUES (
        $1::uuid, $2::uuid, $3, $4, $5::uuid, $6::jsonb, $7, $8::uuid, now()
      )`,
      snapshotId,
      releaseId,
      snapshotVersion,
      sourceType,
      sourceId,
      JSON.stringify(sourcePayload),
      this.extractSourceName(sourcePayload) || 'source snapshot',
      userId || null
    );

    return this.getSourceSnapshot(snapshotId);
  }

  private async getSourceSnapshot(id: string): Promise<CapabilitySourceSnapshotDTO> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM capability_source_snapshots WHERE id = $1::uuid LIMIT 1`,
      id
    );
    if (!rows[0]) {
      throw createNotFoundException('源定义快照不存在');
    }
    return mapCapabilitySourceSnapshot(rows[0]);
  }

  private async loadSourcePayload(
    sourceType: string,
    sourceId: string
  ): Promise<Record<string, unknown>> {
    if (sourceType === 'browser_recording') {
      throw createBadRequestException(
        'browser_recording 类型不支持通过 sourceId 自动加载，请直接提供 sourcePayload'
      );
    }

    if (sourceType === 'temporal_workflow') {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id,
                name,
                description,
                "taskQueue" as "taskQueue",
                artifact_version as "artifactVersion",
                artifact_hash as "artifactHash",
                generated_code as "generatedCode",
                validated_at as "validatedAt",
                validation_result_json as "validationResultJson",
                validation_score as "validationScore",
                validation_status as "validationStatus",
                workflow_dsl as "workflowDsl",
                activity_dsl as "activityDsl"
         FROM temporal_workflows
         WHERE id = $1::uuid
         LIMIT 1`,
        sourceId
      );
      if (!rows[0]) {
        throw createNotFoundException('Temporal Workflow 不存在');
      }
      const workflowDsl =
        parseCapabilityReleaseJson<Record<string, unknown>>(rows[0].workflowDsl) || {};
      const activityDsl =
        parseCapabilityReleaseJson<Record<string, unknown>>(rows[0].activityDsl) || {};

      return {
        artifactHash: rows[0].artifactHash || null,
        artifactVersion: Number(rows[0].artifactVersion || 0),
        id: rows[0].id,
        name: rows[0].name,
        description: rows[0].description,
        taskQueue: rows[0].taskQueue,
        generatedCode: rows[0].generatedCode || null,
        validatedAt: rows[0].validatedAt || null,
        validationResult: parseCapabilityReleaseJson(rows[0].validationResultJson) || null,
        validationScore: Number(rows[0].validationScore || 0),
        validationStatus: rows[0].validationStatus || 'draft',
        workflowDsl,
        workflowArtifactRef: {
          workflowId: rows[0].id,
          artifactVersion: Number(rows[0].artifactVersion || 0),
          artifactHash: rows[0].artifactHash || null,
        },
        activityDsl,
        goal: this.capabilityReleaseTemporalSchemaService.extractTemporalGoal(
          workflowDsl,
          rows[0].description
        ),
        expectedResult:
          this.capabilityReleaseTemporalSchemaService.extractTemporalExpectedResult(workflowDsl),
        paramsSchema: this.capabilityReleaseTemporalSchemaService.buildTemporalParamsSchema(
          workflowDsl,
          activityDsl
        ),
        executionFlowKeys: this.capabilityReleaseSkillDraftService.buildTemporalExecutionFlowKeys(
          rows[0].name,
          workflowDsl,
          activityDsl
        ),
        outputParams: parseCapabilityReleaseJson(workflowDsl.outputParams) || {},
        workflowSteps: this.capabilityReleaseSkillDraftService.buildTemporalWorkflowSteps(workflowDsl),
        sourceTemplate: this.capabilityReleaseTemporalSchemaService.extractTemporalSourceTemplate(
          workflowDsl,
          activityDsl
        ),
      };
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, name, description, goal, expected_result as "expectedResult", params_schema as "paramsSchema",
              category, steps, execution_flow_keys as "executionFlowKeys"
       FROM execution_flow_templates
       WHERE id = $1::uuid
       LIMIT 1`,
      sourceId
    );
    if (!rows[0]) {
      throw createNotFoundException('执行流程模板不存在');
    }
    return {
      id: rows[0].id,
      name: rows[0].name,
      description: rows[0].description,
      goal: rows[0].goal,
      expectedResult: rows[0].expectedResult,
      paramsSchema: parseCapabilityReleaseJson(rows[0].paramsSchema),
      category: rows[0].category,
      steps: parseCapabilityReleaseJson(rows[0].steps),
      executionFlowKeys: parseCapabilityReleaseJson(rows[0].executionFlowKeys),
      sourceTemplate: this.capabilityReleaseSkillDraftService.extractExecutionFlowSourceTemplate({
        id: rows[0].id,
        name: rows[0].name,
        description: rows[0].description,
        goal: rows[0].goal,
        expectedResult: rows[0].expectedResult,
        paramsSchema: rows[0].paramsSchema,
        category: rows[0].category,
        steps: rows[0].steps,
        executionFlowKeys: rows[0].executionFlowKeys,
      }),
    };
  }

  private extractSourceName(payload: Record<string, unknown>): string | null {
    const name = payload.name;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  }

  private resolveReleaseSourceId(dto: CreateCapabilityReleaseDTO): string | null {
    if (dto.sourceType !== 'temporal_workflow') {
      return dto.sourceId || null;
    }
    return dto.sourceId || dto.workflowId || dto.workflowArtifactRef?.workflowId || null;
  }

  private mergeWorkflowArtifactRefIntoPayload(
    sourcePayload: Record<string, unknown>,
    sourceType: string,
    sourceId: string | null,
    explicitRef?: WorkflowArtifactRefDTO
  ): Record<string, unknown> {
    if (sourceType !== 'temporal_workflow') {
      return sourcePayload;
    }

    const payloadRef = this.extractWorkflowArtifactRef(sourcePayload, sourceId);
    const mergedRef = explicitRef?.workflowId ? explicitRef : payloadRef;

    return {
      ...sourcePayload,
      ...(mergedRef ? { workflowArtifactRef: mergedRef } : {}),
    };
  }

  private extractWorkflowArtifactRef(
    payload: Record<string, unknown>,
    fallbackWorkflowId?: string | null
  ): WorkflowArtifactRefDTO | null {
    const directRef = payload.workflowArtifactRef;
    if (directRef && typeof directRef === 'object') {
      const workflowId =
        typeof (directRef as Record<string, unknown>).workflowId === 'string'
          ? ((directRef as Record<string, unknown>).workflowId as string).trim()
          : '';
      if (workflowId) {
        return {
          workflowId,
          artifactVersion: this.asNullableNumber(
            (directRef as Record<string, unknown>).artifactVersion
          ),
          artifactHash: this.asNullableString((directRef as Record<string, unknown>).artifactHash),
        };
      }
    }

    const payloadId = typeof payload.id === 'string' ? payload.id.trim() : '';
    const workflowId = payloadId || (fallbackWorkflowId || '').trim();
    if (!workflowId) {
      return null;
    }

    return {
      workflowId,
      artifactVersion: this.asNullableNumber(payload.artifactVersion),
      artifactHash: this.asNullableString(payload.artifactHash),
    };
  }

  private asNullableString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private asNullableNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
}
