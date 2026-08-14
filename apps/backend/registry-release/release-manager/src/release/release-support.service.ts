import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  ReleaseManagerPrismaPort,
  ReleaseManagerTemporalWorkflowPort,
} from '../platform-runtime.ports';
import {
  RELEASE_MANAGER_PRISMA,
  RELEASE_MANAGER_TEMPORAL_WORKFLOW,
} from '../platform-runtime.tokens';
import {
  mapCapabilityBuild,
  mapCapabilityDeployment,
  mapCapabilityRelease,
  mapCapabilitySkillDraft,
  mapCapabilitySourceSnapshot,
  mapCapabilityValidation,
} from '../capability-release.mapper';
import {
  CapabilityBuildDTO,
  CapabilityReleaseDTO,
  CapabilitySourceSnapshotDTO,
  CapabilityValidationDTO,
  DeploymentRecordDTO,
  SkillDraftDTO,
  WorkflowArtifactRefDTO,
} from '../interfaces';

function createBadRequestException(response: string | Record<string, unknown>): BadRequestException {
  return new BadRequestException(response);
}

function createNotFoundException(response: string | Record<string, unknown>): NotFoundException {
  return new NotFoundException(response);
}

@Injectable()
export class ReleaseSupportService {
  constructor(
    @Inject(RELEASE_MANAGER_PRISMA) private readonly prisma: ReleaseManagerPrismaPort,
    @Inject(RELEASE_MANAGER_TEMPORAL_WORKFLOW)
    private readonly temporalWorkflowService: ReleaseManagerTemporalWorkflowPort
  ) {}

  async ensureInfrastructure(): Promise<void> {
    const statements = [
      `CREATE TABLE IF NOT EXISTS capability_releases (
        id uuid PRIMARY KEY,
        source_type varchar(64) NOT NULL,
        source_id uuid NULL,
        source_name varchar(255) NULL,
        source_status varchar(32) NOT NULL DEFAULT 'draft',
        release_version integer NOT NULL DEFAULT 1,
        status varchar(32) NOT NULL DEFAULT 'draft',
        approval_status varchar(32) NOT NULL DEFAULT 'not_required',
        deployment_status varchar(32) NOT NULL DEFAULT 'not_started',
        current_source_snapshot_id uuid NULL,
        current_build_id uuid NULL,
        latest_successful_build_id uuid NULL,
        latest_validation_id uuid NULL,
        latest_successful_validation_id uuid NULL,
        current_skill_draft_id uuid NULL,
        published_skill_id uuid NULL,
        last_deployment_id uuid NULL,
        rollback_of_release_id uuid NULL,
        created_by uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        archived_at timestamptz NULL
      )`,
      `CREATE TABLE IF NOT EXISTS capability_source_snapshots (
        id uuid PRIMARY KEY,
        release_id uuid NOT NULL,
        snapshot_version integer NOT NULL,
        source_type varchar(64) NOT NULL,
        source_id uuid NULL,
        source_payload_json jsonb NOT NULL,
        summary text NULL,
        created_by uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS capability_builds (
        id uuid PRIMARY KEY,
        release_id uuid NOT NULL,
        source_snapshot_id uuid NOT NULL,
        build_type varchar(64) NOT NULL,
        model_id varchar(128) NOT NULL,
        prompt_version varchar(64) NULL,
        prompt_snapshot text NULL,
        input_snapshot_json jsonb NOT NULL,
        generated_code text NULL,
        generated_config_json jsonb NULL,
        logs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        diff_summary text NULL,
        status varchar(32) NOT NULL,
        error_summary text NULL,
        started_at timestamptz NULL,
        finished_at timestamptz NULL,
        created_by uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS capability_validations (
        id uuid PRIMARY KEY,
        release_id uuid NOT NULL,
        build_id uuid NOT NULL,
        validation_type varchar(32) NOT NULL,
        input_snapshot_json jsonb NULL,
        result_snapshot_json jsonb NULL,
        logs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        score integer NOT NULL DEFAULT 0,
        success boolean NOT NULL DEFAULT false,
        error_summary text NULL,
        started_at timestamptz NULL,
        finished_at timestamptz NULL,
        created_by uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS skill_drafts (
        id uuid PRIMARY KEY,
        release_id uuid NOT NULL,
        generated_from_build_id uuid NULL,
        generated_from_validation_id uuid NULL,
        source_type varchar(64) NOT NULL,
        name varchar(255) NOT NULL,
        description text NOT NULL,
        trigger_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
        params_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
        execution_flow_template_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        tools jsonb NOT NULL DEFAULT '[]'::jsonb,
        api_endpoints jsonb NULL,
        draft_payload_json jsonb NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'draft',
        created_by uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS deployment_records (
        id uuid PRIMARY KEY,
        release_id uuid NOT NULL,
        published_skill_id uuid NULL,
        environment varchar(32) NOT NULL,
        runtime_type varchar(32) NOT NULL,
        artifact_uri text NULL,
        artifact_hash varchar(128) NULL,
        worker_version varchar(128) NULL,
        reload_strategy varchar(32) NULL,
        request_payload_json jsonb NULL,
        result_snapshot_json jsonb NULL,
        logs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        status varchar(32) NOT NULL,
        success boolean NOT NULL DEFAULT false,
        smoke_validation_id uuid NULL,
        rollback_target_release_id uuid NULL,
        started_at timestamptz NULL,
        finished_at timestamptz NULL,
        created_by uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS release_audit_events (
        id uuid PRIMARY KEY,
        release_id uuid NOT NULL,
        event_type varchar(64) NOT NULL,
        actor_id uuid NULL,
        actor_name varchar(255) NULL,
        success boolean NOT NULL DEFAULT true,
        summary text NOT NULL,
        details_json jsonb NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_capability_releases_status_updated_at
       ON capability_releases(status, updated_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_capability_source_snapshots_release_id_created_at
       ON capability_source_snapshots(release_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_capability_builds_release_id_created_at
       ON capability_builds(release_id, created_at DESC)`,
      `ALTER TABLE capability_builds
       ADD COLUMN IF NOT EXISTS logs_json jsonb NOT NULL DEFAULT '[]'::jsonb`,
      `CREATE INDEX IF NOT EXISTS idx_capability_validations_release_id_created_at
       ON capability_validations(release_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_skill_drafts_release_id_updated_at
       ON skill_drafts(release_id, updated_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_release_audit_events_release_id_created_at
       ON release_audit_events(release_id, created_at DESC)`,
    ];

    for (const statement of statements) {
      await this.prisma.$executeRawUnsafe(statement);
    }
  }

  async getReleaseOrThrow(id: string): Promise<CapabilityReleaseDTO> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT *
       FROM capability_releases
       WHERE id = $1::uuid
         AND archived_at IS NULL
       LIMIT 1`,
      id
    );
    if (!rows[0]) {
      throw createNotFoundException('Capability 不存在');
    }
    return mapCapabilityRelease(rows[0]);
  }

  async getCurrentSnapshotOrThrow(
    release: CapabilityReleaseDTO
  ): Promise<CapabilitySourceSnapshotDTO> {
    if (!release.currentSourceSnapshotId) {
      throw createNotFoundException('当前 Release 没有源定义快照');
    }
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM capability_source_snapshots WHERE id = $1::uuid LIMIT 1`,
      release.currentSourceSnapshotId
    );
    if (!rows[0]) {
      throw createNotFoundException('源定义快照不存在');
    }
    return mapCapabilitySourceSnapshot(rows[0]);
  }

  async getBuildOrThrow(id: string): Promise<CapabilityBuildDTO> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM capability_builds WHERE id = $1::uuid LIMIT 1`,
      id
    );
    if (!rows[0]) {
      throw createNotFoundException('构建记录不存在');
    }
    return mapCapabilityBuild(rows[0]);
  }

  async getValidationOrThrow(id: string): Promise<CapabilityValidationDTO> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM capability_validations WHERE id = $1::uuid LIMIT 1`,
      id
    );
    if (!rows[0]) {
      throw createNotFoundException('验证记录不存在');
    }
    return mapCapabilityValidation(rows[0]);
  }

  async getDeploymentOrThrow(id: string): Promise<DeploymentRecordDTO> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM deployment_records WHERE id = $1::uuid LIMIT 1`,
      id
    );
    if (!rows[0]) {
      throw createNotFoundException('部署记录不存在');
    }
    return mapCapabilityDeployment(rows[0]);
  }

  async getSkillDraftOrThrow(id: string): Promise<SkillDraftDTO> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM skill_drafts WHERE id = $1::uuid LIMIT 1`,
      id
    );
    if (!rows[0]) {
      throw createNotFoundException('Skill 草案不存在');
    }
    return mapCapabilitySkillDraft(rows[0]);
  }

  async getLatestSuccessfulValidationOrThrow(
    releaseId: string
  ): Promise<CapabilityValidationDTO> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT *
       FROM capability_validations
       WHERE release_id = $1::uuid AND success = true
       ORDER BY created_at DESC
       LIMIT 1`,
      releaseId
    );
    if (!rows[0]) {
      throw createNotFoundException('当前 Release 没有通过的验证记录');
    }
    return mapCapabilityValidation(rows[0]);
  }

  async resolveTemporalExecutableBuildOrThrow(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    buildId: string | undefined,
    userId?: string
  ): Promise<CapabilityBuildDTO> {
    const artifact = await this.getTemporalWorkflowArtifactOrThrow(release, snapshot);

    if (buildId) {
      const build = await this.getBuildOrThrow(buildId);
      return this.attachArtifactCodeToBuild(build, artifact);
    }

    if (release.currentBuildId) {
      const currentBuild = await this.getBuildOrThrow(release.currentBuildId);
      return this.attachArtifactCodeToBuild(currentBuild, artifact);
    }

    const successfulCodeBuild = await this.getLatestSuccessfulCodeBuild(release.id);
    if (successfulCodeBuild) {
      return this.attachArtifactCodeToBuild(successfulCodeBuild, artifact);
    }

    return this.createWorkflowArtifactBindingBuild(release, snapshot, artifact, userId);
  }

  resolveWorkflowFnOrThrow(payload: Record<string, unknown>): string {
    const workflowDsl =
      payload.workflowDsl && typeof payload.workflowDsl === 'object'
        ? (payload.workflowDsl as Record<string, unknown>)
        : {};
    const workflowClassName =
      typeof workflowDsl.workflowClassName === 'string' ? workflowDsl.workflowClassName.trim() : '';
    if (!workflowClassName) {
      const workflowName = String(payload.name || '未命名工作流');
      throw createBadRequestException(
        `工作流 "${workflowName}" 缺少 Python 类名 (workflowDsl.workflowClassName)。请在工作流编辑页面的“高级配置”中设置类名，点击 AI 生成代码并保存，然后重新同步到 Release。`
      );
    }
    return workflowClassName;
  }

  private async getLatestSuccessfulCodeBuild(
    releaseId: string
  ): Promise<CapabilityBuildDTO | null> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT *
       FROM capability_builds
       WHERE release_id = $1::uuid
         AND status = 'succeeded'
         AND generated_code IS NOT NULL
         AND length(trim(generated_code)) > 0
       ORDER BY created_at DESC
       LIMIT 1`,
      releaseId
    );
    return rows[0] ? mapCapabilityBuild(rows[0]) : null;
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

  private async getTemporalWorkflowArtifactOrThrow(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO
  ): Promise<{
    workflowId: string;
    workflowName: string;
    artifactVersion?: number | null;
    artifactHash?: string | null;
    generatedCode: string;
  }> {
    const workflowArtifactRef = this.extractWorkflowArtifactRef(
      snapshot.sourcePayload,
      release.sourceId || snapshot.sourceId || null
    );

    if (!workflowArtifactRef?.workflowId) {
      throw createBadRequestException(
        '当前 Release 未绑定 Workflow artifact，请先重新同步 Workflow 并完成工件绑定'
      );
    }

    const artifact = await this.temporalWorkflowService.getArtifact(workflowArtifactRef.workflowId);
    const generatedCode =
      typeof artifact.generatedCode === 'string' ? artifact.generatedCode.trim() : '';
    if (!generatedCode) {
      throw createBadRequestException(
        `关联的 Workflow 尚未保存可执行代码: ${artifact.workflowName || workflowArtifactRef.workflowId}`
      );
    }
    if (artifact.validationStatus !== 'validated') {
      throw createBadRequestException(
        `关联的 Workflow artifact 尚未通过验证: ${artifact.workflowName || workflowArtifactRef.workflowId}`
      );
    }
    if (
      workflowArtifactRef.artifactVersion !== undefined &&
      workflowArtifactRef.artifactVersion !== null &&
      Number(workflowArtifactRef.artifactVersion) !== Number(artifact.artifactVersion || 0)
    ) {
      throw createBadRequestException(
        '当前 Release 绑定的 Workflow artifact 版本已过期，请重新绑定最新已验证工件'
      );
    }
    if (
      workflowArtifactRef.artifactHash &&
      artifact.artifactHash &&
      workflowArtifactRef.artifactHash !== artifact.artifactHash
    ) {
      throw createBadRequestException(
        '当前 Release 绑定的 Workflow artifact 哈希已变化，请重新绑定最新工件'
      );
    }

    return {
      workflowId: artifact.workflowId,
      workflowName: artifact.workflowName,
      artifactVersion: artifact.artifactVersion,
      artifactHash: artifact.artifactHash,
      generatedCode,
    };
  }

  private attachArtifactCodeToBuild(
    build: CapabilityBuildDTO,
    artifact: {
      workflowId: string;
      workflowName: string;
      artifactVersion?: number | null;
      artifactHash?: string | null;
      generatedCode: string;
    }
  ): CapabilityBuildDTO {
    if (build.generatedCode?.trim()) {
      return build;
    }
    return {
      ...build,
      diffSummary: build.diffSummary || `引用 Workflow artifact ${artifact.workflowId}`,
      generatedCode: artifact.generatedCode,
    };
  }

  private async createWorkflowArtifactBindingBuild(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    artifact: {
      workflowId: string;
      workflowName: string;
      artifactVersion?: number | null;
      artifactHash?: string | null;
      generatedCode: string;
    },
    userId?: string
  ): Promise<CapabilityBuildDTO> {
    const buildId = randomUUID();
    const logs = [
      `[${new Date().toISOString()}] 自动创建 Workflow artifact 绑定记录`,
      `[${new Date().toISOString()}] Workflow: ${artifact.workflowName} (${artifact.workflowId})`,
      `[${new Date().toISOString()}] Artifact version: ${artifact.artifactVersion ?? 0}`,
      `[${new Date().toISOString()}] Artifact hash: ${artifact.artifactHash || 'n/a'}`,
    ];

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO capability_builds (
        id, release_id, source_snapshot_id, build_type, model_id, input_snapshot_json,
        generated_config_json, logs_json, diff_summary, status, started_at, finished_at, created_by, created_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, 'codegen_workflow', 'workflow_artifact', $4::jsonb,
        $5::jsonb, $6::jsonb, $7, 'succeeded', now(), now(), $8::uuid, now()
      )`,
      buildId,
      release.id,
      snapshot.id,
      JSON.stringify(snapshot.sourcePayload),
      JSON.stringify({
        workflowArtifactRef: {
          workflowId: artifact.workflowId,
          artifactVersion: artifact.artifactVersion ?? null,
          artifactHash: artifact.artifactHash || null,
        },
      }),
      JSON.stringify(logs),
      `自动绑定 Workflow artifact ${artifact.workflowId}`,
      userId || null
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET current_build_id = $2::uuid,
           latest_successful_build_id = $2::uuid,
           updated_at = now()
       WHERE id = $1::uuid`,
      release.id,
      buildId
    );

    const build = await this.getBuildOrThrow(buildId);
    return this.attachArtifactCodeToBuild(build, artifact);
  }

  private asNullableString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private asNullableNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) {
      return Number(value);
    }
    return null;
  }
}
