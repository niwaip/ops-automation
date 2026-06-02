import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CapabilityReleaseBuildValidationAccessors,
  CapabilityReleaseBuildValidationService,
} from './capability-release-build-validation.service';
import {
  CapabilityReleaseDeploymentAccessors,
  CapabilityReleaseDeploymentService,
} from './capability-release-deployment.service';
import {
  CapabilityReleaseAssistAccessors,
  CapabilityReleaseAssistService,
} from './capability-release-assist.service';
import {
  CapabilityReleasePublishAccessors,
  CapabilityReleasePublishService,
} from './capability-release-publish.service';
import {
  CapabilityPublishedSkillRuntimeContext,
  CapabilityReleaseRuntimeAccessors,
  CapabilityReleaseRuntimeExecutionOptions,
  CapabilityReleaseRuntimeService,
} from './capability-release-runtime.service';
import { CapabilityReleaseSkillDraftService } from './capability-release-skill-draft.service';
import { CapabilityReleaseTemporalSchemaService } from './capability-release-temporal-schema.service';
import {
  mapCapabilityAuditEvent,
  mapCapabilityBuild,
  mapCapabilityDeployment,
  mapCapabilityRelease,
  mapCapabilitySkillDraft,
  mapCapabilitySourceSnapshot,
  mapCapabilityValidation,
  parseCapabilityReleaseJson,
} from './capability-release.mapper';
import {
  ApproveCapabilityReleaseDTO,
  AnalyzeFailureDTO,
  AnalyzeFailureResultDTO,
  BridgeRecorderExportDTO,
  BridgeRecorderExportResultDTO,
  CapabilityBuildDTO,
  CapabilityReleaseDTO,
  CapabilityReleaseDetailDTO,
  CapabilitySourceSnapshotDTO,
  CapabilityValidationDTO,
  CreateCapabilityBuildDTO,
  CreateCapabilityReleaseDTO,
  DeployCapabilityReleaseDTO,
  DeploymentRecordDTO,
  ExecuteCapabilityRuntimeDTO,
  ExecuteCapabilityRuntimeResultDTO,
  GenerateSkillDraftDTO,
  PublishSkillDraftDTO,
  ReleaseAuditEventDTO,
  RollbackCapabilityReleaseDTO,
  SkillDraftDTO,
  SuggestReleaseWizardAssistDTO,
  SuggestReleaseWizardAssistResultDTO,
  UpdateCapabilitySourceDTO,
  UpdateSkillDraftDTO,
  ValidateCapabilityDTO,
} from './interfaces';

@Injectable()
export class CapabilityReleaseService implements OnModuleInit {
  private readonly logger = new Logger(CapabilityReleaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilityReleaseBuildValidationService: CapabilityReleaseBuildValidationService,
    private readonly capabilityReleaseDeploymentService: CapabilityReleaseDeploymentService,
    private readonly capabilityReleaseAssistService: CapabilityReleaseAssistService,
    private readonly capabilityReleasePublishService: CapabilityReleasePublishService,
    private readonly capabilityReleaseRuntimeService: CapabilityReleaseRuntimeService,
    private readonly capabilityReleaseSkillDraftService: CapabilityReleaseSkillDraftService,
    private readonly capabilityReleaseTemporalSchemaService: CapabilityReleaseTemporalSchemaService,
  ) {}

  async onModuleInit() {
    await this.ensureInfrastructure();
  }

  async listReleases(): Promise<CapabilityReleaseDTO[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT r.*, 
              (SELECT environment FROM deployment_records WHERE release_id = r.id ORDER BY created_at DESC LIMIT 1) as last_deployment_environment
       FROM capability_releases r
       WHERE archived_at IS NULL
       ORDER BY updated_at DESC`
    );
    return rows.map((row) => mapCapabilityRelease(row));
  }

  async listPublishedCapabilities(): Promise<CapabilityReleaseDTO[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT r.*,
              (SELECT environment FROM deployment_records WHERE release_id = r.id ORDER BY created_at DESC LIMIT 1) as last_deployment_environment
       FROM capability_releases r
       WHERE archived_at IS NULL
         AND (
           published_skill_id IS NOT NULL
           OR status IN ('published', 'deployed', 'rolled_back')
           OR deployment_status IN ('running', 'succeeded', 'deployed', 'rolled_back')
         )
       ORDER BY updated_at DESC`
    );
    return rows.map((row) => mapCapabilityRelease(row));
  }

  async getCapabilityDetail(id: string): Promise<CapabilityReleaseDetailDTO> {
    const release = await this.getReleaseOrThrow(id);
    const [snapshots, builds, validations, drafts, deployments, auditEvents] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT *
         FROM capability_source_snapshots
         WHERE release_id = $1::uuid
         ORDER BY snapshot_version DESC`,
        id,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT *
         FROM capability_builds
         WHERE release_id = $1::uuid
         ORDER BY created_at DESC`,
        id,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT *
         FROM capability_validations
         WHERE release_id = $1::uuid
         ORDER BY created_at DESC`,
        id,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT *
         FROM skill_drafts
         WHERE release_id = $1::uuid
         ORDER BY updated_at DESC`,
        id,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT *
         FROM deployment_records
         WHERE release_id = $1::uuid
         ORDER BY created_at DESC`,
        id,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT *
         FROM release_audit_events
         WHERE release_id = $1::uuid
         ORDER BY created_at DESC`,
        id,
      ),
    ]);

    const currentSourceSnapshot = snapshots.find(
      (snapshot) => snapshot.id === release.currentSourceSnapshotId,
    );
    const currentSkillDraft = drafts.find((draft) => draft.id === release.currentSkillDraftId);

    return {
      release,
      currentSourceSnapshot: currentSourceSnapshot
        ? mapCapabilitySourceSnapshot(currentSourceSnapshot)
        : null,
      sourceSnapshots: snapshots.map((row) => mapCapabilitySourceSnapshot(row)),
      builds: builds.map((row) => mapCapabilityBuild(row)),
      validations: validations.map((row) => mapCapabilityValidation(row)),
      currentSkillDraft: currentSkillDraft ? mapCapabilitySkillDraft(currentSkillDraft) : null,
      deployments: deployments.map((row) => mapCapabilityDeployment(row)),
      auditEvents: auditEvents.map((row) => mapCapabilityAuditEvent(row)),
    };
  }

  async getPublishedCapabilityDetail(id: string): Promise<CapabilityReleaseDetailDTO> {
    const release = await this.getReleaseOrThrow(id);
    const isVisible =
      Boolean(release.publishedSkillId)
      || ['published', 'deployed', 'rolled_back'].includes(release.status)
      || ['running', 'succeeded', 'deployed', 'rolled_back'].includes(release.deploymentStatus);

    if (!isVisible) {
      throw new NotFoundException('该 Release 尚未进入发布中心');
    }

    return this.getCapabilityDetail(id);
  }

  async archiveCapability(id: string, userId?: string): Promise<{ success: true; archivedId: string }> {
    const release = await this.getReleaseOrThrow(id);

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET source_status = 'archived',
           archived_at = now(),
           updated_at = now()
       WHERE id = $1::uuid`,
      id,
    );

    if (release.publishedSkillId) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE skill_configs
         SET is_active = false,
             updated_at = now()
         WHERE id = $1::uuid`,
        release.publishedSkillId,
      );
      await this.insertAuditEvent(
        id,
        'published_skill_deactivated',
        userId,
        true,
        `归档 Release 时停用已发布 Skill: ${release.publishedSkillId}`,
        { publishedSkillId: release.publishedSkillId },
      );
    }

    await this.insertAuditEvent(id, 'release_archived', userId, true, '归档 Capability');
    return { success: true, archivedId: id };
  }

  async executeCapabilityRuntime(
    dto: ExecuteCapabilityRuntimeDTO,
    userId?: string,
  ): Promise<ExecuteCapabilityRuntimeResultDTO> {
    return this.capabilityReleaseRuntimeService.executeCapabilityRuntime(
      dto,
      userId,
      this.getRuntimeAccessors(),
    );
  }

  async getPublishedSkillRuntimeContext(
    skillId: string,
  ): Promise<CapabilityPublishedSkillRuntimeContext> {
    return this.capabilityReleaseRuntimeService.getPublishedSkillRuntimeContext(skillId);
  }

  async executePublishedSkill(
    skillId: string,
    input: Record<string, unknown> | undefined,
    userId?: string,
    options?: CapabilityReleaseRuntimeExecutionOptions,
  ): Promise<ExecuteCapabilityRuntimeResultDTO> {
    return this.capabilityReleaseRuntimeService.executePublishedSkill(
      skillId,
      input,
      userId,
      options,
      this.getRuntimeAccessors(),
    );
  }

  async createCapability(
    dto: CreateCapabilityReleaseDTO,
    userId?: string,
  ): Promise<CapabilityReleaseDetailDTO> {
    const releaseId = randomUUID();
    const sourcePayload = dto.sourcePayload
      ? dto.sourcePayload
      : dto.sourceId
        ? await this.loadSourcePayload(dto.sourceType, dto.sourceId)
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
      dto.sourceId || null,
      sourceName,
      userId || null,
    );

    if (Object.keys(sourcePayload).length > 0) {
      const snapshot = await this.createSourceSnapshot(
        releaseId,
        dto.sourceType,
        dto.sourceId || null,
        sourcePayload,
        userId,
      );
      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_releases
         SET current_source_snapshot_id = $2::uuid, updated_at = now()
         WHERE id = $1::uuid`,
        releaseId,
        snapshot.id,
      );
    }

    await this.insertAuditEvent(releaseId, 'release_created', userId, true, '创建 Capability');
    return this.getCapabilityDetail(releaseId);
  }

  async bridgeRecorderExport(
    dto: BridgeRecorderExportDTO,
    userId?: string,
  ): Promise<BridgeRecorderExportResultDTO> {
    return this.capabilityReleasePublishService.bridgeRecorderExport(
      dto,
      userId,
      this.getPublishAccessors(),
    );
  }

  async updateSource(
    id: string,
    dto: UpdateCapabilitySourceDTO,
    userId?: string,
  ): Promise<CapabilityReleaseDetailDTO> {
    const release = await this.getReleaseOrThrow(id);
    const snapshot = await this.createSourceSnapshot(
      id,
      release.sourceType,
      release.sourceId || null,
      dto.sourcePayload,
      userId,
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET source_name = $2,
           current_source_snapshot_id = $3::uuid,
           status = 'draft',
           updated_at = now()
       WHERE id = $1::uuid`,
      id,
      dto.sourceName || this.extractSourceName(dto.sourcePayload) || release.sourceName || null,
      snapshot.id,
    );

    await this.insertAuditEvent(id, 'source_updated', userId, true, '更新源定义快照');
    return this.getCapabilityDetail(id);
  }

  async build(
    id: string,
    dto: CreateCapabilityBuildDTO,
    userId?: string,
  ): Promise<{ release: CapabilityReleaseDTO; build: CapabilityBuildDTO }> {
    return this.capabilityReleaseBuildValidationService.build(
      id,
      dto,
      userId,
      this.getBuildValidationAccessors(),
    );
  }

  async buildStream(
    id: string,
    dto: CreateCapabilityBuildDTO,
    userId: string | undefined,
    onEvent: (event: string, payload: Record<string, unknown>) => void,
  ): Promise<void> {
    return this.capabilityReleaseBuildValidationService.buildStream(
      id,
      dto,
      userId,
      onEvent,
      this.getBuildValidationAccessors(),
    );
  }

  async validateStatic(
    id: string,
    dto: ValidateCapabilityDTO,
    userId?: string,
  ): Promise<{ release: CapabilityReleaseDTO; validation: CapabilityValidationDTO }> {
    return this.capabilityReleaseBuildValidationService.validateStatic(
      id,
      dto,
      userId,
      this.getBuildValidationAccessors(),
    );
  }

  async validateSandbox(
    id: string,
    dto: ValidateCapabilityDTO,
    userId?: string,
    authToken?: string,
  ): Promise<{ release: CapabilityReleaseDTO; validation: CapabilityValidationDTO }> {
    return this.capabilityReleaseBuildValidationService.validateSandbox(
      id,
      dto,
      userId,
      authToken,
      this.getBuildValidationAccessors(),
    );
  }

  async validateSandboxStream(
    id: string,
    dto: ValidateCapabilityDTO,
    userId: string | undefined,
    _authToken: string | undefined,
    onEvent: (event: string, payload: Record<string, unknown>) => void,
  ): Promise<void> {
    return this.capabilityReleaseBuildValidationService.validateSandboxStream(
      id,
      dto,
      userId,
      onEvent,
      this.getBuildValidationAccessors(),
    );
  }

  async generateSkillDraft(
    id: string,
    dto: GenerateSkillDraftDTO,
    userId?: string,
  ): Promise<{ release: CapabilityReleaseDTO; skillDraft: SkillDraftDTO }> {
    return this.capabilityReleaseBuildValidationService.generateSkillDraft(
      id,
      dto,
      userId,
      this.getBuildValidationAccessors(),
    );
  }

  async getCurrentSkillDraft(id: string): Promise<SkillDraftDTO> {
    const release = await this.getReleaseOrThrow(id);
    if (!release.currentSkillDraftId) {
      throw new NotFoundException('当前 Release 没有 Skill 草案');
    }
    return this.getSkillDraftOrThrow(release.currentSkillDraftId);
  }

  async updateSkillDraft(
    id: string,
    dto: UpdateSkillDraftDTO,
    userId?: string,
  ): Promise<SkillDraftDTO> {
    return this.capabilityReleasePublishService.updateSkillDraft(
      id,
      dto,
      userId,
      this.getPublishAccessors(),
    );
  }

  async approveRelease(
    id: string,
    dto: ApproveCapabilityReleaseDTO,
    userId?: string,
  ): Promise<CapabilityReleaseDetailDTO> {
    return this.capabilityReleasePublishService.approveRelease(
      id,
      dto,
      userId,
      this.getPublishAccessors(),
    );
  }

  async publishSkill(
    id: string,
    dto: PublishSkillDraftDTO,
    userId?: string,
  ): Promise<{ release: CapabilityReleaseDTO; publishedSkillId: string }> {
    return this.capabilityReleasePublishService.publishSkill(
      id,
      dto,
      userId,
      this.getPublishAccessors(),
    );
  }

  async deploy(
    id: string,
    dto: DeployCapabilityReleaseDTO,
    userId?: string,
  ): Promise<{ release: CapabilityReleaseDTO; deployment: DeploymentRecordDTO }> {
    return this.capabilityReleaseDeploymentService.deploy(
      id,
      dto,
      userId,
      this.getDeploymentAccessors(),
    );
  }

  async getDeployments(id: string): Promise<DeploymentRecordDTO[]> {
    return this.capabilityReleaseDeploymentService.getDeployments(
      id,
      this.getDeploymentAccessors(),
    );
  }

  async getAuditEvents(id: string): Promise<ReleaseAuditEventDTO[]> {
    await this.getReleaseOrThrow(id);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT *
       FROM release_audit_events
       WHERE release_id = $1::uuid
       ORDER BY created_at DESC`,
      id,
    );
    return rows.map((row) => mapCapabilityAuditEvent(row));
  }

  async rollback(
    id: string,
    dto: RollbackCapabilityReleaseDTO,
    userId?: string,
  ): Promise<{ release: CapabilityReleaseDTO; deployment: DeploymentRecordDTO; targetReleaseId: string }> {
    return this.capabilityReleaseDeploymentService.rollback(
      id,
      dto,
      userId,
      this.getDeploymentAccessors(),
    );
  }

  async analyzeFailure(
    id: string,
    dto: AnalyzeFailureDTO,
    userId?: string,
  ): Promise<AnalyzeFailureResultDTO> {
    return this.capabilityReleaseAssistService.analyzeFailure(
      id,
      dto,
      userId,
      this.getAssistAccessors(),
    );
  }

  async suggestWizardAssist(
    id: string,
    dto: SuggestReleaseWizardAssistDTO,
    userId?: string,
  ): Promise<SuggestReleaseWizardAssistResultDTO> {
    return this.capabilityReleaseAssistService.suggestWizardAssist(
      id,
      dto,
      userId,
      this.getAssistAccessors(),
    );
  }

  private async ensureInfrastructure(): Promise<void> {
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
    this.logger.log('Capability infrastructure ensured');
  }

  private async getReleaseOrThrow(id: string): Promise<CapabilityReleaseDTO> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT *
       FROM capability_releases
       WHERE id = $1::uuid
         AND archived_at IS NULL
       LIMIT 1`,
      id,
    );
    if (!rows[0]) {
      throw new NotFoundException('Capability 不存在');
    }
    return mapCapabilityRelease(rows[0]);
  }

  private async getCurrentSnapshotOrThrow(
    release: CapabilityReleaseDTO,
  ): Promise<CapabilitySourceSnapshotDTO> {
    if (!release.currentSourceSnapshotId) {
      throw new NotFoundException('当前 Release 没有源定义快照');
    }
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM capability_source_snapshots WHERE id = $1::uuid LIMIT 1`,
      release.currentSourceSnapshotId,
    );
    if (!rows[0]) {
      throw new NotFoundException('源定义快照不存在');
    }
    return mapCapabilitySourceSnapshot(rows[0]);
  }

  private async getBuildOrThrow(id: string): Promise<CapabilityBuildDTO> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM capability_builds WHERE id = $1::uuid LIMIT 1`,
      id,
    );
    if (!rows[0]) {
      throw new NotFoundException('构建记录不存在');
    }
    return mapCapabilityBuild(rows[0]);
  }

  private async getValidationOrThrow(id: string): Promise<CapabilityValidationDTO> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM capability_validations WHERE id = $1::uuid LIMIT 1`,
      id,
    );
    if (!rows[0]) {
      throw new NotFoundException('验证记录不存在');
    }
    return mapCapabilityValidation(rows[0]);
  }

  private async getDeploymentOrThrow(id: string): Promise<DeploymentRecordDTO> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM deployment_records WHERE id = $1::uuid LIMIT 1`,
      id,
    );
    if (!rows[0]) {
      throw new NotFoundException('部署记录不存在');
    }
    return mapCapabilityDeployment(rows[0]);
  }

  private async getSkillDraftOrThrow(id: string): Promise<SkillDraftDTO> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM skill_drafts WHERE id = $1::uuid LIMIT 1`,
      id,
    );
    if (!rows[0]) {
      throw new NotFoundException('Skill 草案不存在');
    }
    return mapCapabilitySkillDraft(rows[0]);
  }

  private async getLatestSuccessfulValidationOrThrow(
    releaseId: string,
  ): Promise<CapabilityValidationDTO> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT *
       FROM capability_validations
       WHERE release_id = $1::uuid AND success = true
       ORDER BY created_at DESC
       LIMIT 1`,
      releaseId,
    );
    if (!rows[0]) {
      throw new NotFoundException('当前 Release 没有通过的验证记录');
    }
    return mapCapabilityValidation(rows[0]);
  }

  private async getLatestSuccessfulCodeBuild(
    releaseId: string,
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
      releaseId,
    );
    return rows[0] ? mapCapabilityBuild(rows[0]) : null;
  }

  private async createSyntheticTemporalCodeBuild(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    generatedCode: string,
    userId?: string,
  ): Promise<CapabilityBuildDTO> {
    const syntheticBuildId = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO capability_builds (
        id, release_id, source_snapshot_id, build_type, model_id, input_snapshot_json,
        generated_code, generated_config_json, diff_summary, status, started_at, finished_at, created_by, created_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, 'codegen_workflow', 'system', $4::jsonb,
        $5, $6::jsonb, $7, 'succeeded', now(), now(), $8::uuid, now()
      )`,
      syntheticBuildId,
      release.id,
      snapshot.id,
      JSON.stringify(snapshot.sourcePayload),
      generatedCode,
      JSON.stringify(snapshot.sourcePayload),
      '复用当前 Temporal Workflow 已生成代码',
      userId || null,
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET current_build_id = $2::uuid,
           latest_successful_build_id = $2::uuid,
           updated_at = now()
       WHERE id = $1::uuid`,
      release.id,
      syntheticBuildId,
    );

    return this.getBuildOrThrow(syntheticBuildId);
  }

  private async resolveTemporalExecutableBuildOrThrow(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    buildId: string | undefined,
    userId?: string,
  ): Promise<CapabilityBuildDTO> {
    if (buildId) {
      const build = await this.getBuildOrThrow(buildId);
      if (build.generatedCode) {
        return build;
      }
    }

    if (release.currentBuildId) {
      const currentBuild = await this.getBuildOrThrow(release.currentBuildId);
      if (currentBuild.generatedCode) {
        return currentBuild;
      }
    }

    const successfulCodeBuild = await this.getLatestSuccessfulCodeBuild(release.id);
    if (successfulCodeBuild) {
      return successfulCodeBuild;
    }

    const sourceGeneratedCode =
      typeof snapshot.sourcePayload.generatedCode === 'string' && snapshot.sourcePayload.generatedCode.trim()
        ? snapshot.sourcePayload.generatedCode.trim()
        : null;

    if (sourceGeneratedCode) {
      return this.createSyntheticTemporalCodeBuild(release, snapshot, sourceGeneratedCode, userId);
    }

    if (release.sourceId) {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT generated_code as "generatedCode"
         FROM temporal_workflows
         WHERE id = $1::uuid
         LIMIT 1`,
        release.sourceId,
      );
      const workflowGeneratedCode =
        typeof rows[0]?.generatedCode === 'string' && rows[0].generatedCode.trim()
          ? rows[0].generatedCode.trim()
          : null;
      if (workflowGeneratedCode) {
        return this.createSyntheticTemporalCodeBuild(release, snapshot, workflowGeneratedCode, userId);
      }
    }

    throw new BadRequestException('当前构建没有可执行代码，请先完成代码生成');
  }

  private async createSourceSnapshot(
    releaseId: string,
    sourceType: string,
    sourceId: string | null,
    sourcePayload: Record<string, unknown>,
    userId?: string,
  ): Promise<CapabilitySourceSnapshotDTO> {
    const snapshotId = randomUUID();
    const versionRows = await this.prisma.$queryRawUnsafe<{ max_version: number | null }[]>(
      `SELECT COALESCE(MAX(snapshot_version), 0) AS max_version
       FROM capability_source_snapshots
       WHERE release_id = $1::uuid`,
      releaseId,
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
      userId || null,
    );

    return this.getSourceSnapshot(snapshotId);
  }

  private async getSourceSnapshot(id: string): Promise<CapabilitySourceSnapshotDTO> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM capability_source_snapshots WHERE id = $1::uuid LIMIT 1`,
      id,
    );
    if (!rows[0]) {
      throw new NotFoundException('源定义快照不存在');
    }
    return mapCapabilitySourceSnapshot(rows[0]);
  }

  private async insertAuditEvent(
    releaseId: string,
    eventType: string,
    actorId: string | undefined,
    success: boolean,
    summary: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO release_audit_events (
        id, release_id, event_type, actor_id, success, summary, details_json, created_at
      ) VALUES (
        $1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7::jsonb, now()
      )`,
      randomUUID(),
      releaseId,
      eventType,
      actorId || null,
      success,
      summary,
      JSON.stringify(details || null),
    );
  }

  private async loadSourcePayload(
    sourceType: string,
    sourceId: string,
  ): Promise<Record<string, unknown>> {
    if (sourceType === 'browser_recording') {
      throw new BadRequestException('browser_recording 类型不支持通过 sourceId 自动加载，请直接提供 sourcePayload');
    }

    if (sourceType === 'temporal_workflow') {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id,
                name,
                description,
                "taskQueue" as "taskQueue",
                generated_code as "generatedCode",
                workflow_dsl as "workflowDsl",
                activity_dsl as "activityDsl"
         FROM temporal_workflows
         WHERE id = $1::uuid
         LIMIT 1`,
        sourceId,
      );
      if (!rows[0]) {
        throw new NotFoundException('Temporal Workflow 不存在');
      }
      const workflowDsl = parseCapabilityReleaseJson<Record<string, unknown>>(rows[0].workflowDsl) || {};
      const activityDsl = parseCapabilityReleaseJson<Record<string, unknown>>(rows[0].activityDsl) || {};

      return {
        id: rows[0].id,
        name: rows[0].name,
        description: rows[0].description,
        taskQueue: rows[0].taskQueue,
        generatedCode: rows[0].generatedCode || null,
        workflowDsl,
        activityDsl,
        goal: this.capabilityReleaseTemporalSchemaService
          .extractTemporalGoal(workflowDsl, rows[0].description),
        expectedResult: this.capabilityReleaseTemporalSchemaService
          .extractTemporalExpectedResult(workflowDsl),
        paramsSchema: this.capabilityReleaseTemporalSchemaService
          .buildTemporalParamsSchema(workflowDsl, activityDsl),
        executionFlowKeys: this.capabilityReleaseSkillDraftService
          .buildTemporalExecutionFlowKeys(rows[0].name, workflowDsl, activityDsl),
        outputParams: parseCapabilityReleaseJson(workflowDsl.outputParams) || {},
        workflowSteps: this.capabilityReleaseSkillDraftService.buildTemporalWorkflowSteps(workflowDsl),
        sourceTemplate: this.capabilityReleaseTemporalSchemaService
          .extractTemporalSourceTemplate(workflowDsl, activityDsl),
      };
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, name, description, goal, expected_result as "expectedResult", params_schema as "paramsSchema",
              category, steps, execution_flow_keys as "executionFlowKeys"
       FROM execution_flow_templates
       WHERE id = $1::uuid
       LIMIT 1`,
      sourceId,
    );
    if (!rows[0]) {
      throw new NotFoundException('执行流程模板不存在');
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

  private resolveWorkflowFnOrThrow(payload: Record<string, unknown>): string {
    const workflowDsl =
      payload.workflowDsl && typeof payload.workflowDsl === 'object'
        ? (payload.workflowDsl as Record<string, unknown>)
        : {};
    const workflowClassName =
      typeof workflowDsl.workflowClassName === 'string'
        ? workflowDsl.workflowClassName.trim()
        : '';
    if (!workflowClassName) {
      const workflowName = String(payload.name || '未命名工作流');
      throw new BadRequestException(
        `工作流 "${workflowName}" 缺少 Python 类名 (workflowDsl.workflowClassName)。请在工作流编辑页面的“高级配置”中设置类名，点击 AI 生成代码并保存，然后重新同步到 Release。`,
      );
    }
    return workflowClassName;
  }

  private getRuntimeAccessors(): CapabilityReleaseRuntimeAccessors {
    return {
      getCurrentSnapshotOrThrow: (release) => this.getCurrentSnapshotOrThrow(release),
      resolveTemporalExecutableBuildOrThrow: (release, snapshot, buildId, userId) =>
        this.resolveTemporalExecutableBuildOrThrow(release, snapshot, buildId, userId),
      resolveWorkflowFnOrThrow: (payload) => this.resolveWorkflowFnOrThrow(payload),
      insertAuditEvent: (releaseId, eventType, actorId, success, summary, details) =>
        this.insertAuditEvent(releaseId, eventType, actorId, success, summary, details || undefined),
    };
  }

  private getBuildValidationAccessors(): CapabilityReleaseBuildValidationAccessors {
    return {
      getReleaseOrThrow: (id) => this.getReleaseOrThrow(id),
      getCurrentSnapshotOrThrow: (release) => this.getCurrentSnapshotOrThrow(release),
      getBuildOrThrow: (id) => this.getBuildOrThrow(id),
      getValidationOrThrow: (id) => this.getValidationOrThrow(id),
      getSkillDraftOrThrow: (id) => this.getSkillDraftOrThrow(id),
      getLatestSuccessfulValidationOrThrow: (releaseId) => this.getLatestSuccessfulValidationOrThrow(releaseId),
      resolveTemporalExecutableBuildOrThrow: (release, snapshot, buildId, userId) =>
        this.resolveTemporalExecutableBuildOrThrow(release, snapshot, buildId, userId),
      resolveWorkflowFnOrThrow: (payload) => this.resolveWorkflowFnOrThrow(payload),
      insertAuditEvent: (releaseId, eventType, actorId, success, summary, details) =>
        this.insertAuditEvent(releaseId, eventType, actorId, success, summary, details || undefined),
    };
  }

  private getPublishAccessors(): CapabilityReleasePublishAccessors {
    return {
      getReleaseOrThrow: (id) => this.getReleaseOrThrow(id),
      getSkillDraftOrThrow: (id) => this.getSkillDraftOrThrow(id),
      getCurrentSnapshotOrThrow: (release) => this.getCurrentSnapshotOrThrow(release),
      getCapabilityDetail: (id) => this.getCapabilityDetail(id),
      createCapability: (dto, userId) => this.createCapability(dto, userId),
      updateSource: (id, dto, userId) => this.updateSource(id, dto, userId),
      insertAuditEvent: (releaseId, eventType, actorId, success, summary, details) =>
        this.insertAuditEvent(releaseId, eventType, actorId, success, summary, details || undefined),
    };
  }

  private getDeploymentAccessors(): CapabilityReleaseDeploymentAccessors {
    return {
      getReleaseOrThrow: (id) => this.getReleaseOrThrow(id),
      getCurrentSnapshotOrThrow: (release) => this.getCurrentSnapshotOrThrow(release),
      getBuildOrThrow: (id) => this.getBuildOrThrow(id),
      getDeploymentOrThrow: (id) => this.getDeploymentOrThrow(id),
      getSkillDraftOrThrow: (id) => this.getSkillDraftOrThrow(id),
      resolveTemporalExecutableBuildOrThrow: (release, snapshot, buildId, userId) =>
        this.resolveTemporalExecutableBuildOrThrow(release, snapshot, buildId, userId),
      resolveWorkflowFnOrThrow: (payload) => this.resolveWorkflowFnOrThrow(payload),
      insertAuditEvent: (releaseId, eventType, actorId, success, summary, details) =>
        this.insertAuditEvent(releaseId, eventType, actorId, success, summary, details || undefined),
    };
  }

  private getAssistAccessors(): CapabilityReleaseAssistAccessors {
    return {
      getReleaseOrThrow: (id) => this.getReleaseOrThrow(id),
      getCurrentSnapshotOrThrow: (release) => this.getCurrentSnapshotOrThrow(release),
      getBuildOrThrow: (id) => this.getBuildOrThrow(id),
      getValidationOrThrow: (id) => this.getValidationOrThrow(id),
      getDeploymentOrThrow: (id) => this.getDeploymentOrThrow(id),
      insertAuditEvent: (releaseId, eventType, actorId, success, summary, details) =>
        this.insertAuditEvent(releaseId, eventType, actorId, success, summary, details || undefined),
    };
  }
}
