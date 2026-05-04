import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { PrismaService } from '../../prisma/prisma.service';
import { TemporalWorkflowService } from '../temporal-workflow/temporal-workflow.service';
import { ActivityService } from '../temporal-workflow/temporal-activity.service';
import { ExecutionFlowTemplateService } from '../execution-flow/execution-flow-template.service';
import { SkillService } from '../skill/skill.service';
import { ToolCatalogService } from '../skill/tool-catalog.service';
import { ToolPromptExposure } from '../skill/interfaces';
import {
  ApproveCapabilityReleaseDTO,
  CapabilityBuildDTO,
  CapabilityBuildType,
  CapabilityDeploymentRuntimeType,
  CapabilityDeploymentStatus,
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
  UpdateCapabilitySourceDTO,
  UpdateSkillDraftDTO,
  ValidateCapabilityDTO,
  AnalyzeFailureDTO,
  AnalyzeFailureResultDTO,
  SuggestReleaseWizardAssistDTO,
  SuggestReleaseWizardAssistResultDTO,
} from './interfaces';

type SkillRuntimeToolPolicy = {
  name: string;
  promptExposure: ToolPromptExposure;
  defaultRequiresConfirmation: boolean;
  defaultRequiresApproval: boolean;
  status: string;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const getCarboneServiceUrl = (): string => {
  const configured = process.env.CARBONE_SERVICE_URL;
  if (configured && configured.trim()) {
    return configured.replace(/\/$/, '');
  }
  if (process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production') {
    return 'http://carbone-engine:3009';
  }
  return 'http://localhost:3009';
};

const getCarboneExternalUrl = (): string => (
  process.env.CARBONE_EXTERNAL_URL
  || `http://${process.env.HOST_IP || process.env.EXTERNAL_HOST || 'localhost'}:3009`
).replace(/\/$/, '');

const toExternalCarboneUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return `${getCarboneExternalUrl()}${trimmed}`;
  }
  return `${getCarboneExternalUrl()}/${trimmed.replace(/^\/+/, '')}`;
};

const extractDownloadUrl = (value: unknown): string | undefined => {
  const queue: unknown[] = [value];
  const visited = new Set<unknown>();
  let inspected = 0;

  while (queue.length > 0 && inspected < 50) {
    const current = queue.shift();
    inspected += 1;

    if (!current || typeof current !== 'object' || visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (Array.isArray(current)) {
      current.forEach((item) => queue.push(item));
      continue;
    }

    const record = current as Record<string, unknown>;
    const directUrl = [record.downloadUrl, record.download_url, record.url]
      .map((item) => toExternalCarboneUrl(item))
      .find((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (directUrl) {
      return directUrl;
    }

    const documentId = [record.documentId, record.document_id]
      .find((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (documentId) {
      return `${getCarboneExternalUrl()}/studio/download/${documentId}`;
    }

    Object.values(record).forEach((item) => {
      if (item && typeof item === 'object') {
        queue.push(item);
      }
    });
  }

  return undefined;
};

@Injectable()
export class CapabilityReleaseService implements OnModuleInit {
  private readonly logger = new Logger(CapabilityReleaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly temporalWorkflowService: TemporalWorkflowService,
    private readonly activityService: ActivityService,
    private readonly executionFlowTemplateService: ExecutionFlowTemplateService,
    private readonly skillService: SkillService,
    private readonly toolCatalogService: ToolCatalogService,
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
    return rows.map((row) => this.mapRelease(row));
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
    return rows.map((row) => this.mapRelease(row));
  }

  async getCapabilityDetail(id: string): Promise<CapabilityReleaseDetailDTO> {
    const release = await this.getReleaseOrThrow(id);
    const [snapshots, builds, validations, drafts, deployments, auditEvents] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT *
         FROM capability_source_snapshots
         WHERE release_id = $1::uuid
         ORDER BY snapshot_version DESC`,
        id
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT *
         FROM capability_builds
         WHERE release_id = $1::uuid
         ORDER BY created_at DESC`,
        id
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT *
         FROM capability_validations
         WHERE release_id = $1::uuid
         ORDER BY created_at DESC`,
        id
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT *
         FROM skill_drafts
         WHERE release_id = $1::uuid
         ORDER BY updated_at DESC`,
        id
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT *
         FROM deployment_records
         WHERE release_id = $1::uuid
         ORDER BY created_at DESC`,
        id
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT *
         FROM release_audit_events
         WHERE release_id = $1::uuid
         ORDER BY created_at DESC`,
        id
      ),
    ]);

    const currentSourceSnapshot = snapshots.find(
      (snapshot) => snapshot.id === release.currentSourceSnapshotId,
    );
    const currentSkillDraft = drafts.find((draft) => draft.id === release.currentSkillDraftId);

    return {
      release,
      currentSourceSnapshot: currentSourceSnapshot
        ? this.mapSourceSnapshot(currentSourceSnapshot)
        : null,
      sourceSnapshots: snapshots.map((row) => this.mapSourceSnapshot(row)),
      builds: builds.map((row) => this.mapBuild(row)),
      validations: validations.map((row) => this.mapValidation(row)),
      currentSkillDraft: currentSkillDraft ? this.mapSkillDraft(currentSkillDraft) : null,
      deployments: deployments.map((row) => this.mapDeployment(row)),
      auditEvents: auditEvents.map((row) => this.mapAuditEvent(row)),
    };
  }

  async getPublishedCapabilityDetail(id: string): Promise<CapabilityReleaseDetailDTO> {
    const release = await this.getReleaseOrThrow(id);
    const isVisible =
      Boolean(release.publishedSkillId) ||
      ['published', 'deployed', 'rolled_back'].includes(release.status) ||
      ['running', 'succeeded', 'deployed', 'rolled_back'].includes(release.deploymentStatus);

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
    const capabilityId = dto.capabilityId || dto.publishedSkillId;
    if (!capabilityId) {
      throw new BadRequestException('capabilityId 或 publishedSkillId 不能为空');
    }

    return this.executePublishedSkill(
      capabilityId,
      dto.input,
      userId,
      {
        executionId: dto.executionId,
        stepId: dto.stepId,
        capabilityVersion: dto.capabilityVersion,
        runtimeType: dto.runtimeType,
      },
    );
  }

  async getPublishedSkillRuntimeContext(skillId: string): Promise<{
    publishedSkillId: string;
    releaseId: string;
    sourceType: string;
    runtimeType: string;
    runtimeSource: 'deployment' | 'sandbox_fallback' | 'flow_runtime_fallback';
    allowedToolNames: string[];
    toolPolicies: SkillRuntimeToolPolicy[];
    environment?: string | null;
    deploymentId?: string | null;
  }> {
    const releaseRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT *
       FROM capability_releases
       WHERE published_skill_id = $1::uuid
         AND archived_at IS NULL
       ORDER BY updated_at DESC
       LIMIT 1`,
      skillId,
    );

    if (!releaseRows[0]) {
      throw new NotFoundException('未找到与该 Skill 绑定的 Capability');
    }

    const release = this.mapRelease(releaseRows[0]);
    const toolBindings = await this.skillService.getSkillToolBindings(skillId);
    const allowedToolNames = toolBindings.validation.effectiveTools;
    const toolPolicies = await this.buildRuntimeToolPolicies(allowedToolNames);

    const latestSuccessfulDeploymentRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT *
       FROM deployment_records
       WHERE release_id = $1::uuid
         AND success = true
       ORDER BY created_at DESC
       LIMIT 1`,
      release.id,
    );

    const lastDeployment =
      release.lastDeploymentId
        ? await this.prisma.$queryRawUnsafe<any[]>(
            `SELECT *
             FROM deployment_records
             WHERE id = $1::uuid
             LIMIT 1`,
            release.lastDeploymentId,
          )
        : [];

    const deploymentRow =
      (Array.isArray(lastDeployment) && lastDeployment[0]?.success ? lastDeployment[0] : null)
      || latestSuccessfulDeploymentRows[0]
      || null;

    if (deploymentRow) {
      const deployment = this.mapDeployment(deploymentRow);
      return {
        publishedSkillId: skillId,
        releaseId: release.id,
        sourceType: release.sourceType,
        runtimeType: deployment.runtimeType,
        runtimeSource: 'deployment',
        allowedToolNames,
        toolPolicies,
        environment: deployment.environment,
        deploymentId: deployment.id,
      };
    }

    if (release.sourceType === 'temporal_workflow') {
      return {
        publishedSkillId: skillId,
        releaseId: release.id,
        sourceType: release.sourceType,
        runtimeType: 'sandbox',
        runtimeSource: 'sandbox_fallback',
        allowedToolNames,
        toolPolicies,
        environment: null,
        deploymentId: null,
      };
    }

    return {
      publishedSkillId: skillId,
      releaseId: release.id,
      sourceType: release.sourceType,
      runtimeType: 'flow_runtime',
      runtimeSource: 'flow_runtime_fallback',
      allowedToolNames,
      toolPolicies,
      environment: null,
      deploymentId: null,
    };
  }

  private async buildRuntimeToolPolicies(toolNames: string[]): Promise<SkillRuntimeToolPolicy[]> {
    const uniqueToolNames = Array.from(new Set(toolNames.filter(Boolean)));
    if (uniqueToolNames.length === 0) {
      return [];
    }

    const catalogMap = await this.toolCatalogService.getCatalogItemsByNames(uniqueToolNames);
    return uniqueToolNames.map((toolName) => {
      const catalogItem = catalogMap.get(toolName);
      return {
        name: toolName,
        promptExposure: catalogItem?.promptExposure || 'prompt_and_runtime',
        defaultRequiresConfirmation: Boolean(catalogItem?.defaultRequiresConfirmation),
        defaultRequiresApproval: Boolean(catalogItem?.defaultRequiresApproval),
        status: catalogItem?.status || 'active',
      };
    });
  }

  async executePublishedSkill(
    skillId: string,
    input: Record<string, unknown> | undefined,
    userId?: string,
    options?: {
      executionId?: string;
      stepId?: string;
      capabilityVersion?: string;
      runtimeType?: string;
    },
  ): Promise<ExecuteCapabilityRuntimeResultDTO> {
    const releaseRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT *
       FROM capability_releases
       WHERE published_skill_id = $1::uuid
         AND archived_at IS NULL
       ORDER BY updated_at DESC
       LIMIT 1`,
      skillId,
    );

    if (!releaseRows[0]) {
      throw new NotFoundException('未找到与该 Skill 绑定的 Capability');
    }

    const release = this.mapRelease(releaseRows[0]);
    if (release.sourceType === 'temporal_workflow') {
      const snapshot = await this.getCurrentSnapshotOrThrow(release);
      const build = await this.resolveTemporalExecutableBuildOrThrow(release, snapshot, undefined, userId);

      const fn = this.resolveWorkflowFnOrThrow(snapshot.sourcePayload);
      const taskQueue = typeof snapshot.sourcePayload.taskQueue === 'string'
        ? snapshot.sourcePayload.taskQueue
        : 'SKILL_TASK_QUEUE';
      const generatedCode = build.generatedCode || '';

      const result = await this.activityService.executeCodeInTemporalSandbox(
        generatedCode,
        fn,
        taskQueue,
        input as Record<string, any> | undefined,
      );

      const rawResult = result.result;
      const downloadUrl = extractDownloadUrl(rawResult);
      const temporalWorkflowId = result.workflowId;
      const temporalLink = temporalWorkflowId 
        ? `http://localhost:8088/namespaces/default/workflows/${temporalWorkflowId}`
        : null;

      // 允许非对象结果透传，包装为标准对象
      const normalizedResult = (rawResult !== undefined && rawResult !== null)
        ? (typeof rawResult === 'object' && !Array.isArray(rawResult)
          ? { 
              ...(rawResult as Record<string, unknown>), 
              ...(downloadUrl ? { downloadUrl } : {}),
              ...(temporalLink ? { temporalLink } : {})
            }
          : { 
              result: rawResult, 
              ...(downloadUrl ? { downloadUrl } : {}),
              ...(temporalLink ? { temporalLink } : {})
            })
        : (downloadUrl || temporalLink 
            ? { ...(downloadUrl ? { downloadUrl } : {}), ...(temporalLink ? { temporalLink } : {}) } 
            : null);

      await this.insertAuditEvent(
        release.id,
        'skill_runtime_invoked',
        userId,
        result.success,
        result.success
          ? `运行时调用 Skill 成功: ${skillId}`
          : `运行时调用 Skill 失败: ${skillId}`,
        {
          publishedSkillId: skillId,
          capabilityId: skillId,
          capabilityVersion: options?.capabilityVersion || null,
          runtime: 'temporal_workflow',
          requestedRuntimeType: options?.runtimeType || null,
          executionId: options?.executionId || null,
          stepId: options?.stepId || null,
          fn,
          taskQueue,
          temporalWorkflowId,
        },
      );

      return {
        releaseId: release.id,
        capabilityId: skillId,
        capabilityVersion: options?.capabilityVersion || null,
        publishedSkillId: skillId,
        runtime: 'temporal_workflow',
        fn,
        taskQueue,
        success: result.success,
        downloadUrl: downloadUrl || null,
        temporalWorkflowId: temporalWorkflowId || null,
        output: normalizedResult,
        result: normalizedResult,
        logs: result.logs || [],
        error: result.error || null,
      };
    }

    if (release.sourceType === 'execution_flow_template') {
      return this.executeDocumentPublishedSkill(release, skillId, input, userId, options);
    }

    throw new BadRequestException(`当前不支持执行 ${release.sourceType} 类型的已发布 Skill`);
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
    const release = await this.getReleaseOrThrow(id);
    const snapshot = await this.getCurrentSnapshotOrThrow(release);
    const buildId = randomUUID();
    const buildType = dto.buildType || this.getDefaultBuildType(release.sourceType);
    const modelId = dto.modelId || 'default';
    const inputSnapshot = snapshot.sourcePayload;

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO capability_builds (
        id, release_id, source_snapshot_id, build_type, model_id, input_snapshot_json,
        logs_json, status, started_at, created_by, created_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb, '[]'::jsonb, 'running', now(), $7::uuid, now()
      )`,
      buildId,
      id,
      snapshot.id,
      buildType,
      modelId,
      JSON.stringify(inputSnapshot),
      userId || null,
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET status = 'building', current_build_id = $2::uuid, updated_at = now()
       WHERE id = $1::uuid`,
      id,
      buildId,
    );

    await this.insertAuditEvent(id, 'build_started', userId, true, `开始构建 (${buildType})`);

    try {
      const logs: string[] = [];
      let generatedCode: string | null = null;
      let generatedConfig: Record<string, unknown> | null = null;
      let diffSummary: string | null = null;

      logs.push(`[${new Date().toISOString()}] 开始构建，类型: ${buildType}`);
      logs.push(`[${new Date().toISOString()}] 模型: ${modelId}`);

      if (release.sourceType === 'temporal_workflow') {
        logs.push(`[${new Date().toISOString()}] 识别为 Temporal 工作流，开始解析 DSL`);
        const workflowDsl = this.expectRecord(inputSnapshot.workflowDsl, '缺少 workflowDsl');
        const activityDsl = this.expectRecord(inputSnapshot.activityDsl, '缺少 activityDsl');
        logs.push(`[${new Date().toISOString()}] 调用 AI 生成工作流代码`);
        const result = await this.temporalWorkflowService.generateWorkflowCode(
          workflowDsl as any,
          activityDsl as any,
          dto.errorContext,
        );
        if (!result.success || !result.code) {
          throw new Error(result.error || 'Temporal 工作流代码生成失败');
        }
        generatedCode = result.code;
        diffSummary = '已生成 Temporal Workflow Python 代码';
        logs.push(`[${new Date().toISOString()}] 代码生成完成，长度: ${generatedCode?.length || 0} 字符`);
      } else {
        generatedConfig = inputSnapshot;
        diffSummary = '模板型能力已固化当前配置快照，可进入验证和草案生成阶段';
        logs.push(`[${new Date().toISOString()}] 模板型能力无需代码生成，已固化配置快照`);
      }

      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_builds
         SET generated_code = $2,
             generated_config_json = $3::jsonb,
             diff_summary = $4,
             logs_json = $5::jsonb,
             status = 'succeeded',
             finished_at = now()
         WHERE id = $1::uuid`,
        buildId,
        generatedCode,
        JSON.stringify(generatedConfig),
        diffSummary,
        JSON.stringify(logs),
      );

      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_releases
         SET status = 'draft',
             current_build_id = $2::uuid,
             latest_successful_build_id = $2::uuid,
             updated_at = now()
         WHERE id = $1::uuid`,
        id,
        buildId,
      );

      await this.insertAuditEvent(id, 'build_succeeded', userId, true, `构建成功 (${buildType})`);
      return {
        release: await this.getReleaseOrThrow(id),
        build: await this.getBuildOrThrow(buildId),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_builds
         SET status = 'failed',
             logs_json = $3::jsonb,
             error_summary = $2,
             finished_at = now()
         WHERE id = $1::uuid`,
        buildId,
        message,
        JSON.stringify([`[${new Date().toISOString()}] ${message}`]),
      );
      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_releases
         SET status = 'build_failed', updated_at = now()
         WHERE id = $1::uuid`,
        id,
      );
      await this.insertAuditEvent(id, 'build_failed', userId, false, `构建失败: ${message}`);
      throw new BadRequestException(message);
    }
  }

  async buildStream(
    id: string,
    dto: CreateCapabilityBuildDTO,
    userId: string | undefined,
    onEvent: (event: string, payload: Record<string, unknown>) => void,
  ): Promise<void> {
    const release = await this.getReleaseOrThrow(id);
    const snapshot = await this.getCurrentSnapshotOrThrow(release);
    const buildId = randomUUID();
    const buildType = dto.buildType || this.getDefaultBuildType(release.sourceType);
    const modelId = dto.modelId || 'default';
    const inputSnapshot = snapshot.sourcePayload;
    const logs: string[] = [];
    const pushLog = (message: string) => {
      logs.push(message);
      onEvent('log', { message });
    };

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO capability_builds (
        id, release_id, source_snapshot_id, build_type, model_id, input_snapshot_json,
        logs_json, status, started_at, created_by, created_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb,
        '[]'::jsonb, 'running', now(), $7::uuid, now()
      )`,
      buildId,
      id,
      snapshot.id,
      buildType,
      modelId,
      JSON.stringify(inputSnapshot),
      userId || null,
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET status = 'building', current_build_id = $2::uuid, updated_at = now()
       WHERE id = $1::uuid`,
      id,
      buildId,
    );

    onEvent('status', {
      phase: 'started',
      releaseId: id,
      buildId,
      buildType,
      sourceType: release.sourceType,
    });
    await this.insertAuditEvent(id, 'build_started', userId, true, `开始构建 (${buildType})`);

    try {
      let generatedCode: string | null = null;
      let generatedConfig: Record<string, unknown> | null = null;
      let diffSummary: string | null = null;

      pushLog(`[${new Date().toISOString()}] 开始构建，类型: ${buildType}`);
      pushLog(`[${new Date().toISOString()}] 模型: ${modelId}`);

      if (release.sourceType === 'temporal_workflow') {
        onEvent('status', { phase: 'preparing_dsl', buildId });
        pushLog(`[${new Date().toISOString()}] 识别为 Temporal 工作流，开始解析 DSL`);
        const workflowDsl = this.expectRecord(inputSnapshot.workflowDsl, '缺少 workflowDsl');
        const activityDsl = this.expectRecord(inputSnapshot.activityDsl, '缺少 activityDsl');
        onEvent('status', { phase: 'generating_code', buildId });
        pushLog(`[${new Date().toISOString()}] 调用 AI 生成工作流代码`);
        const result = await this.temporalWorkflowService.generateWorkflowCode(
          workflowDsl as any,
          activityDsl as any,
          dto.errorContext,
        );
        if (!result.success || !result.code) {
          throw new Error(result.error || 'Temporal 工作流代码生成失败');
        }
        generatedCode = result.code;
        diffSummary = '已生成 Temporal Workflow Python 代码';
        pushLog(`[${new Date().toISOString()}] 代码生成完成，长度: ${generatedCode?.length || 0} 字符`);
      } else {
        onEvent('status', { phase: 'solidifying_config', buildId });
        generatedConfig = inputSnapshot;
        diffSummary = '模板型能力已固化当前配置快照，可进入验证和草案生成阶段';
        pushLog(`[${new Date().toISOString()}] 模板型能力无需代码生成，已固化配置快照`);
      }

      onEvent('status', { phase: 'persisting', buildId });
      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_builds
         SET generated_code = $2,
             generated_config_json = $3::jsonb,
             diff_summary = $4,
             logs_json = $5::jsonb,
             status = 'succeeded',
             finished_at = now()
         WHERE id = $1::uuid`,
        buildId,
        generatedCode,
        JSON.stringify(generatedConfig),
        diffSummary,
        JSON.stringify(logs),
      );

      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_releases
         SET status = 'draft',
             current_build_id = $2::uuid,
             latest_successful_build_id = $2::uuid,
             updated_at = now()
         WHERE id = $1::uuid`,
        id,
        buildId,
      );

      await this.insertAuditEvent(id, 'build_succeeded', userId, true, `构建成功 (${buildType})`);
      onEvent('complete', {
        release: (await this.getReleaseOrThrow(id)) as unknown as Record<string, unknown>,
        build: (await this.getBuildOrThrow(buildId)) as unknown as Record<string, unknown>,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      logs.push(`[${new Date().toISOString()}] ${message}`);
      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_builds
         SET status = 'failed',
             logs_json = $3::jsonb,
             error_summary = $2,
             finished_at = now()
         WHERE id = $1::uuid`,
        buildId,
        message,
        JSON.stringify(logs),
      );
      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_releases
         SET status = 'build_failed', updated_at = now()
         WHERE id = $1::uuid`,
        id,
      );
      await this.insertAuditEvent(id, 'build_failed', userId, false, `构建失败: ${message}`);
      onEvent('error', {
        message,
        release: (await this.getReleaseOrThrow(id)) as unknown as Record<string, unknown>,
        build: (await this.getBuildOrThrow(buildId)) as unknown as Record<string, unknown>,
      });
    }
  }

  async validateStatic(
    id: string,
    dto: ValidateCapabilityDTO,
    userId?: string,
  ): Promise<{ release: CapabilityReleaseDTO; validation: CapabilityValidationDTO }> {
    const release = await this.getReleaseOrThrow(id);
    const snapshot = await this.getCurrentSnapshotOrThrow(release);
    const build = await this.resolveBuildForValidation(release, snapshot, dto.buildId, userId);
    const preserveReleaseStatus = this.shouldPreserveReleaseStatusDuringValidation(release);
    const validationId = await this.createValidationRecord(
      id,
      build.id,
      'static',
      dto.input,
      userId,
      !preserveReleaseStatus,
    );

    await this.insertAuditEvent(id, 'validation_started', userId, true, '开始静态校验');

    try {
      let resultSnapshot: Record<string, unknown>;
      let logs: string[];
      let success: boolean;
      let score: number;
      let errorSummary: string | null = null;

      if (release.sourceType === 'temporal_workflow') {
        const workflowDsl = this.expectRecord(snapshot.sourcePayload.workflowDsl, '缺少 workflowDsl');
        const activityDsl = this.expectRecord(snapshot.sourcePayload.activityDsl, '缺少 activityDsl');
        const result = await this.temporalWorkflowService.validate(
          workflowDsl as any,
          activityDsl as any,
        );
        success = result.isValid;
        score = result.score;
        resultSnapshot = result as unknown as Record<string, unknown>;
        logs = [
          ...result.errors.map((item: string) => `[Error] ${item}`),
          ...result.warnings.map((item: string) => `[Warning] ${item}`),
        ];
        errorSummary = result.errors[0] || null;
      } else {
        const result = this.validateExecutionFlowPayload(snapshot.sourcePayload);
        success = result.isValid;
        score = result.score;
        resultSnapshot = result as unknown as Record<string, unknown>;
        logs = [
          ...result.errors.map((item) => `[Error] ${item}`),
          ...result.warnings.map((item) => `[Warning] ${item}`),
        ];
        errorSummary = result.errors[0] || null;
      }

      await this.finishValidation(
        validationId,
        id,
        success ? 'draft_ready' : 'validation_failed',
        success,
        score,
        logs,
        resultSnapshot,
        errorSummary,
        preserveReleaseStatus,
      );

      await this.insertAuditEvent(
        id,
        success ? 'validation_succeeded' : 'validation_failed',
        userId,
        success,
        success ? '静态校验通过' : `静态校验失败: ${errorSummary || '未知错误'}`,
      );

      return {
        release: await this.getReleaseOrThrow(id),
        validation: await this.getValidationOrThrow(validationId),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      await this.finishValidation(
        validationId,
        id,
        'validation_failed',
        false,
        0,
        [`[Error] ${message}`],
        null,
        message,
      );
      await this.insertAuditEvent(id, 'validation_failed', userId, false, `静态校验失败: ${message}`);
      throw new BadRequestException(message);
    }
  }

  async validateSandbox(
    id: string,
    dto: ValidateCapabilityDTO,
    userId?: string,
    authToken?: string,
  ): Promise<{ release: CapabilityReleaseDTO; validation: CapabilityValidationDTO }> {
    const release = await this.getReleaseOrThrow(id);
    const snapshot = await this.getCurrentSnapshotOrThrow(release);
    const build = await this.resolveBuildForValidation(release, snapshot, dto.buildId, userId);
    const preserveReleaseStatus = this.shouldPreserveReleaseStatusDuringValidation(release);
    const validationId = await this.createValidationRecord(
      id,
      build.id,
      'sandbox',
      dto.input,
      userId,
      !preserveReleaseStatus,
    );

    await this.insertAuditEvent(id, 'validation_started', userId, true, '开始 Sandbox 校验');

    try {
      let success = false;
      let score = 0;
      let logs: string[] = [];
      let resultSnapshot: Record<string, unknown> | null = null;
      let errorSummary: string | null = null;
      const testCasesFromRequest = Array.isArray(dto.testCases)
        ? dto.testCases.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
        : [];
      const naturalLanguageCases = testCasesFromRequest.length > 0
        ? testCasesFromRequest
        : (dto.testUserInput?.trim() ? [dto.testUserInput.trim()] : []);

      if (release.sourceType === 'temporal_workflow') {
        if (naturalLanguageCases.length > 0 && (!dto.input || Object.keys(dto.input).length === 0)) {
          if (!release.publishedSkillId) {
            throw new Error('请先发布 Skill，再使用自然语言进行真实验证');
          }
          const caseResults: Array<{
            caseIndex: number;
            testUserInput: string;
            success: boolean;
            score: number;
            error?: string;
            logs: string[];
            result?: Record<string, unknown> | null;
          }> = [];

          for (let i = 0; i < naturalLanguageCases.length; i += 1) {
            const currentCase = naturalLanguageCases[i] as string;
            const runtimeResult = await this.executePublishedSkillByPromptForValidation(
              release.publishedSkillId,
              currentCase,
              authToken,
            );
            caseResults.push({
              caseIndex: i + 1,
              testUserInput: currentCase,
              success: runtimeResult.success,
              score: runtimeResult.success ? 100 : 50,
              ...(runtimeResult.error ? { error: runtimeResult.error } : {}),
              logs: runtimeResult.logs,
              result: runtimeResult.result ?? null,
            });
          }

          const passedCases = caseResults.filter((item) => item.success).length;
          success = passedCases === caseResults.length;
          score = caseResults.length > 0 ? Math.round((passedCases / caseResults.length) * 100) : 0;
          logs = caseResults.flatMap((item) => [
            `[Case ${item.caseIndex}] ${item.testUserInput}`,
            ...item.logs.map((line) => `[Case ${item.caseIndex}] ${line}`),
          ]);
          resultSnapshot = {
            mode: 'nl_task_runtime_batch',
            totalCases: caseResults.length,
            passedCases,
            caseResults,
          };
          const firstError = caseResults.find((item) => !item.success)?.error;
          errorSummary = firstError || null;
        } else {
          if (!build.generatedCode) {
            throw new Error('当前构建没有可执行代码，请先完成代码生成');
          }
          const fn = dto.fn || this.resolveWorkflowFnOrThrow(snapshot.sourcePayload);
          const result = await this.temporalWorkflowService.validateWorkflowReal(
            build.generatedCode,
            fn,
            dto.input,
          );
          success = result.success;
          score = result.score;
          logs = result.logs;
          resultSnapshot = {
            result: result.result ?? null,
            error: result.error ?? null,
            fn,
          };
          errorSummary = result.error || null;
        }
      } else if (release.sourceId) {
        const validation = await this.executionFlowTemplateService.validateTemplate(
          release.sourceId,
          undefined,
          dto.input,
          true,
          dto.testUserInput,
        );
        success = validation.isValid;
        score = validation.score || 0;
        logs = validation.details?.executionTest?.log || [];
        resultSnapshot = validation as unknown as Record<string, unknown>;
        errorSummary = validation.warnings?.[0] || null;
      } else {
        throw new Error('模板型能力当前仅支持基于已保存模板进行 Sandbox 校验');
      }

      await this.finishValidation(
        validationId,
        id,
        success ? 'draft_ready' : 'validation_failed',
        success,
        score,
        logs,
        resultSnapshot,
        errorSummary,
        preserveReleaseStatus,
      );

      await this.insertAuditEvent(
        id,
        success ? 'validation_succeeded' : 'validation_failed',
        userId,
        success,
        success ? 'Sandbox 校验通过' : `Sandbox 校验失败: ${errorSummary || '未知错误'}`,
      );

      return {
        release: await this.getReleaseOrThrow(id),
        validation: await this.getValidationOrThrow(validationId),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      await this.finishValidation(
        validationId,
        id,
        'validation_failed',
        false,
        0,
        [`[Error] ${message}`],
        null,
        message,
      );
      await this.insertAuditEvent(id, 'validation_failed', userId, false, `Sandbox 校验失败: ${message}`);
      throw new BadRequestException(message);
    }
  }

  async validateSandboxStream(
    id: string,
    dto: ValidateCapabilityDTO,
    userId: string | undefined,
    _authToken: string | undefined,
    onEvent: (event: string, payload: Record<string, unknown>) => void,
  ): Promise<void> {
    const release = await this.getReleaseOrThrow(id);
    const snapshot = await this.getCurrentSnapshotOrThrow(release);
    const build = await this.resolveBuildForValidation(release, snapshot, dto.buildId, userId);
    const validationId = await this.createValidationRecord(id, build.id, 'sandbox', dto.input, userId);

    onEvent('status', {
      phase: 'started',
      releaseId: id,
      validationId,
      buildId: build.id,
      sourceType: release.sourceType,
    });

    await this.insertAuditEvent(id, 'validation_started', userId, true, '开始 Sandbox 校验');

    try {
      let success = false;
      let score = 0;
      let logs: string[] = [];
      let resultSnapshot: Record<string, unknown> | null = null;
      let errorSummary: string | null = null;
      const streamedLogs: string[] = [];

      if (release.sourceType === 'temporal_workflow') {
        if (!build.generatedCode) {
          throw new Error('当前构建没有可执行代码，请先完成代码生成');
        }
        const fn = dto.fn || this.resolveWorkflowFnOrThrow(snapshot.sourcePayload);
        onEvent('status', {
          phase: 'executing',
          runtime: 'temporal_workflow',
          fn,
        });
        const result = await this.temporalWorkflowService.validateWorkflowRealStreaming(
          build.generatedCode,
          fn,
          dto.input as Record<string, any> | undefined,
          undefined,
          (log: string) => {
            streamedLogs.push(log);
            onEvent('log', { message: log });
          },
        );
        success = result.success;
        score = result.score;
        logs = streamedLogs.length > 0 ? streamedLogs : result.logs || [];
        resultSnapshot = {
          result: result.result ?? null,
          error: result.error ?? null,
          traceback: result.traceback ?? null,
          fn,
        };
        errorSummary = result.error || null;
      } else if (release.sourceId) {
        onEvent('status', {
          phase: 'executing',
          runtime: 'flow_runtime',
          note: '当前模板型能力通过同步校验结果回放日志',
        });
        const validation = await this.executionFlowTemplateService.validateTemplate(
          release.sourceId,
          undefined,
          dto.input,
          true,
          dto.testUserInput,
        );
        success = validation.isValid;
        score = validation.score || 0;
        logs = validation.details?.executionTest?.log || [];
        for (const log of logs) {
          onEvent('log', { message: log });
        }
        resultSnapshot = validation as unknown as Record<string, unknown>;
        errorSummary = validation.warnings?.[0] || null;
      } else {
        throw new Error('模板型能力当前仅支持基于已保存模板进行 Sandbox 校验');
      }

      await this.finishValidation(
        validationId,
        id,
        success ? 'draft_ready' : 'validation_failed',
        success,
        score,
        logs,
        resultSnapshot,
        errorSummary,
      );

      await this.insertAuditEvent(
        id,
        success ? 'validation_succeeded' : 'validation_failed',
        userId,
        success,
        success ? 'Sandbox 校验通过' : `Sandbox 校验失败: ${errorSummary || '未知错误'}`,
      );

      const finalRelease = await this.getReleaseOrThrow(id);
      const finalValidation = await this.getValidationOrThrow(validationId);
      onEvent('complete', {
        release: finalRelease as unknown as Record<string, unknown>,
        validation: finalValidation as unknown as Record<string, unknown>,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      await this.finishValidation(
        validationId,
        id,
        'validation_failed',
        false,
        0,
        [`[Error] ${message}`],
        null,
        message,
      );
      await this.insertAuditEvent(id, 'validation_failed', userId, false, `Sandbox 校验失败: ${message}`);
      const failedRelease = await this.getReleaseOrThrow(id);
      const failedValidation = await this.getValidationOrThrow(validationId);
      onEvent('error', {
        message,
        release: failedRelease as unknown as Record<string, unknown>,
        validation: failedValidation as unknown as Record<string, unknown>,
      });
    }
  }

  async generateSkillDraft(
    id: string,
    dto: GenerateSkillDraftDTO,
    userId?: string,
  ): Promise<{ release: CapabilityReleaseDTO; skillDraft: SkillDraftDTO }> {
    const release = await this.getReleaseOrThrow(id);
    const snapshot = await this.getCurrentSnapshotOrThrow(release);
    const validation = dto.validationId
      ? await this.getValidationOrThrow(dto.validationId)
      : await this.getLatestSuccessfulValidationOrThrow(id);

    const draftPayload = this.buildSkillDraftPayload(release, snapshot, validation);
    const draftId = randomUUID();

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO skill_drafts (
        id, release_id, generated_from_build_id, generated_from_validation_id, source_type,
        name, description, trigger_keywords, params_schema, execution_flow_template_ids,
        tools, api_endpoints, draft_payload_json, status, created_by, created_at, updated_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5,
        $6, $7, $8::jsonb, $9::jsonb, $10::jsonb,
        $11::jsonb, $12::jsonb, $13::jsonb, 'draft', $14::uuid, now(), now()
      )`,
      draftId,
      id,
      validation.buildId,
      validation.id,
      release.sourceType,
      draftPayload.name,
      draftPayload.description,
      JSON.stringify(draftPayload.triggerKeywords),
      JSON.stringify(draftPayload.paramsSchema),
      JSON.stringify(draftPayload.executionFlowTemplateIds),
      JSON.stringify(draftPayload.tools),
      JSON.stringify(draftPayload.apiEndpoints || null),
      JSON.stringify(draftPayload),
      userId || null,
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET current_skill_draft_id = $2::uuid,
           status = 'pending_approval',
           approval_status = 'pending',
           updated_at = now()
       WHERE id = $1::uuid`,
      id,
      draftId,
    );

    await this.insertAuditEvent(id, 'skill_draft_generated', userId, true, '生成 Skill 草案');
    return {
      release: await this.getReleaseOrThrow(id),
      skillDraft: await this.getSkillDraftOrThrow(draftId),
    };
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
    const release = await this.getReleaseOrThrow(id);
    if (!release.currentSkillDraftId) {
      throw new NotFoundException('当前 Release 没有 Skill 草案');
    }
    const draft = await this.getSkillDraftOrThrow(release.currentSkillDraftId);
    const payload = {
      ...draft.draftPayload,
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.triggerKeywords !== undefined ? { triggerKeywords: dto.triggerKeywords } : {}),
      ...(dto.paramsSchema !== undefined ? { paramsSchema: dto.paramsSchema } : {}),
      ...(dto.executionFlowTemplateIds !== undefined
        ? { executionFlowTemplateIds: dto.executionFlowTemplateIds }
        : {}),
      ...(dto.tools !== undefined ? { tools: dto.tools } : {}),
      ...(dto.apiEndpoints !== undefined ? { apiEndpoints: dto.apiEndpoints } : {}),
    };

    await this.prisma.$executeRawUnsafe(
      `UPDATE skill_drafts
       SET name = $2,
           description = $3,
           trigger_keywords = $4::jsonb,
           params_schema = $5::jsonb,
           execution_flow_template_ids = $6::jsonb,
           tools = $7::jsonb,
           api_endpoints = $8::jsonb,
           draft_payload_json = $9::jsonb,
           status = 'reviewed',
           updated_at = now()
       WHERE id = $1::uuid`,
      draft.id,
      payload.name,
      payload.description,
      JSON.stringify(payload.triggerKeywords || []),
      JSON.stringify(payload.paramsSchema || {}),
      JSON.stringify(payload.executionFlowTemplateIds || []),
      JSON.stringify(payload.tools || []),
      JSON.stringify(payload.apiEndpoints || null),
      JSON.stringify(payload),
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET status = 'pending_approval',
           approval_status = 'pending',
           updated_at = now()
       WHERE id = $1::uuid`,
      id,
    );

    await this.insertAuditEvent(id, 'skill_draft_updated', userId, true, '更新 Skill 草案');
    return this.getSkillDraftOrThrow(draft.id);
  }

  async approveRelease(
    id: string,
    dto: ApproveCapabilityReleaseDTO,
    userId?: string,
  ): Promise<CapabilityReleaseDetailDTO> {
    const release = await this.getReleaseOrThrow(id);
    if (!['draft_ready', 'pending_approval', 'approved'].includes(release.status)) {
      throw new BadRequestException('当前 Release 不处于可审批状态');
    }

    const approved = dto.decision === 'approved';
    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET status = $2,
           approval_status = $3,
           updated_at = now()
       WHERE id = $1::uuid`,
      id,
      approved ? 'approved' : 'draft',
      approved ? 'approved' : 'rejected',
    );

    await this.insertAuditEvent(
      id,
      approved ? 'approval_approved' : 'approval_rejected',
      userId,
      approved,
      dto.comment || (approved ? '审批通过' : '审批拒绝'),
      { decision: dto.decision, comment: dto.comment || null },
    );

    return this.getCapabilityDetail(id);
  }

  async publishSkill(
    id: string,
    dto: PublishSkillDraftDTO,
    userId?: string,
  ): Promise<{ release: CapabilityReleaseDTO; publishedSkillId: string }> {
    const release = await this.getReleaseOrThrow(id);
    if (release.approvalStatus === 'pending' || release.status === 'pending_approval') {
      throw new BadRequestException('当前 Release 尚未审批通过');
    }
    if (release.approvalStatus === 'rejected') {
      throw new BadRequestException('当前 Release 审批未通过，请调整草案后重新提交');
    }
    const draftId = dto.draftId || release.currentSkillDraftId;
    if (!draftId) {
      throw new NotFoundException('没有可发布的 Skill 草案');
    }
    const previousPublishedSkillId = release.publishedSkillId;
    const draft = await this.getSkillDraftOrThrow(draftId);
    const toolValidation = await this.skillService.validateSkillToolsPayload({
      tools: draft.tools,
      executionFlow: [],
      executionFlowTemplateIds: draft.executionFlowTemplateIds,
    });

    if (!toolValidation.isValid) {
      await this.insertAuditEvent(
        id,
        'skill_publish_blocked_by_tool_validation',
        userId,
        false,
        '发布前工具校验失败',
        { toolValidation },
      );
      throw new BadRequestException({
        message: '发布前工具校验失败',
        toolValidation,
      });
    }

    const payload = { ...(draft.draftPayload as Record<string, unknown>) };
    if (typeof payload.description === 'string' && payload.description.length > 500) {
      payload.description = payload.description.slice(0, 497) + '...';
    }
    const baseName =
      (typeof payload.name === 'string' && payload.name.trim()) || release.sourceName || `Skill-${release.id.slice(0, 8)}`;
    let finalName = String(baseName);
    // 确保每个 Release 发布都会新建新 Skill：如果同名已存在，则派生唯一名称（含递增后缀）
    const nameExists = async (name: string) => {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM skill_configs WHERE name = $1 LIMIT 1`,
        name,
      );
      return Boolean(rows[0]?.id);
    };
    if (await nameExists(finalName)) {
      const baseCandidate = `${baseName}-${release.id.slice(0, 8)}`;
      finalName = baseCandidate;
      let suffix = 1;
      while (await nameExists(finalName)) {
        finalName = `${baseCandidate}-${suffix}`;
        suffix += 1;
        if (suffix > 1000) {
          finalName = `${baseCandidate}-${Date.now()}`;
          break;
        }
      }
    }
    payload.name = finalName;
    const created = await this.skillService.createSkill(payload as any);
    const publishedSkillId = created.id;

    // Re-publish safety: deactivate the previously bound skill for this release
    // so skill matching does not continue to route to stale versions.
    if (
      previousPublishedSkillId
      && previousPublishedSkillId !== publishedSkillId
    ) {
      await this.prisma.skillConfig.updateMany({
        where: { id: previousPublishedSkillId },
        data: { isActive: false },
      });
      await this.insertAuditEvent(
        id,
        'published_skill_deactivated',
        userId,
        true,
        `重新发布后停用旧 Skill: ${previousPublishedSkillId}`,
        {
          previousPublishedSkillId,
          newPublishedSkillId: publishedSkillId,
        },
      );
    }

    await this.prisma.$executeRawUnsafe(
      `UPDATE skill_drafts
       SET status = 'published', updated_at = now()
       WHERE id = $1::uuid`,
      draft.id,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET published_skill_id = $2::uuid,
           status = 'published',
           approval_status = $3,
           updated_at = now()
       WHERE id = $1::uuid`,
      id,
      publishedSkillId,
      release.approvalStatus === 'not_required' ? 'not_required' : 'approved',
    );

    await this.insertAuditEvent(id, 'skill_published', userId, true, `发布 Skill 成功: ${publishedSkillId}`);
    return {
      release: await this.getReleaseOrThrow(id),
      publishedSkillId,
    };
  }

  async deploy(
    id: string,
    dto: DeployCapabilityReleaseDTO,
    userId?: string,
  ): Promise<{ release: CapabilityReleaseDTO; deployment: DeploymentRecordDTO }> {
    const release = await this.getReleaseOrThrow(id);
    if (!release.publishedSkillId && release.sourceType !== 'temporal_workflow') {
      throw new BadRequestException('当前 Release 尚未发布 Skill，不能部署');
    }
    if (release.status === 'deploying') {
      throw new BadRequestException('当前 Release 正在部署中');
    }

    const deploymentId = randomUUID();
    const environment = dto.environment || 'staging';
    const snapshot = await this.getCurrentSnapshotOrThrow(release);
    const deploymentProfile = this.resolveDeploymentProfile(snapshot.sourcePayload, environment);
    const configOverrides = dto.configOverrides || {};
    const effectiveConfig = { ...deploymentProfile, ...configOverrides };
    const runtimeType: CapabilityDeploymentRuntimeType =
      release.sourceType === 'temporal_workflow' ? 'temporal_worker' : 'flow_runtime';
    const strategy =
      dto.strategy ||
      (typeof deploymentProfile.strategy === 'string' ? deploymentProfile.strategy : undefined) ||
      'rolling_restart';
    let preResolvedTemporalBuild: CapabilityBuildDTO | null = null;

    if (release.sourceType === 'temporal_workflow') {
      try {
        preResolvedTemporalBuild = await this.resolveTemporalExecutableBuildOrThrow(
          release,
          snapshot,
          undefined,
          userId,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : '当前 Release 缺少可执行代码';
        throw new BadRequestException(
          `${message}。请先在该 Release 上执行“构建 / AI 生成代码”，确认生成的 Workflow 代码已保存，再重新部署。`,
        );
      }
    }

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO deployment_records (
        id, release_id, published_skill_id, environment, runtime_type, reload_strategy,
        request_payload_json, logs_json, status, success, started_at, created_by, created_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4, $5, $6,
        $7::jsonb, '[]'::jsonb, 'running', false, now(), $8::uuid, now()
      )`,
      deploymentId,
      id,
      release.publishedSkillId,
      environment,
      runtimeType,
      strategy,
      JSON.stringify({ environment, strategy, deploymentProfile, configOverrides, effectiveConfig }),
      userId || null,
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET status = 'deploying',
           deployment_status = 'deploying',
           last_deployment_id = $2::uuid,
           updated_at = now()
       WHERE id = $1::uuid`,
      id,
      deploymentId,
    );

    await this.insertAuditEvent(id, 'deployment_started', userId, true, `开始部署到 ${environment}`);

    try {
      const logs: string[] = [];
      let artifactUri: string | null = null;
      let artifactHash: string | null = null;
      let workerVersion: string | null = null;
      let resultSnapshot: Record<string, unknown> | null = null;
      let smokeValidationId: string | null = null;
      let deploymentBuild: CapabilityBuildDTO | null = null;

      if (release.sourceType === 'temporal_workflow') {
        const build = preResolvedTemporalBuild || await this.resolveTemporalExecutableBuildOrThrow(release, snapshot, undefined, userId);
        deploymentBuild = build;
        const workflowDsl = this.expectRecord(snapshot.sourcePayload.workflowDsl, '缺少 workflowDsl');
        const activityDsl = this.expectRecord(snapshot.sourcePayload.activityDsl, '缺少 activityDsl');
        const workflowName = String(snapshot.sourcePayload.name || release.sourceName || 'GeneratedWorkflow');
        const description = String(snapshot.sourcePayload.description || '');
        const taskQueue =
          typeof effectiveConfig.taskQueue === 'string'
            ? effectiveConfig.taskQueue
            : typeof snapshot.sourcePayload.taskQueue === 'string'
              ? snapshot.sourcePayload.taskQueue
            : 'SKILL_TASK_QUEUE';
        const workerReloadRequested =
          typeof effectiveConfig.workerReload === 'boolean'
            ? effectiveConfig.workerReload
            : strategy !== 'hot_reload';
        logs.push(`Environment: ${environment}`);
        logs.push('Deployment target: ops-temporal');
        logs.push(`Strategy: ${strategy}`);
        if (Object.keys(deploymentProfile).length > 0) {
          logs.push(`Deployment profile loaded for ${environment}`);
        }
        if (Object.keys(configOverrides).length > 0) {
          logs.push(`Deployment overrides applied: ${JSON.stringify(configOverrides)}`);
        }
        logs.push(`Worker reload requested: ${workerReloadRequested ? 'yes' : 'no'}`);

        const generatedCode = build.generatedCode || '';
        const workflow =
          release.sourceId
            ? await this.temporalWorkflowService.update(release.sourceId, {
                name: workflowName,
                description,
                taskQueue,
                workflowDsl: workflowDsl as any,
                activityDsl: activityDsl as any,
                generatedCode,
                isActive: true,
              })
            : await this.temporalWorkflowService.create({
                name: workflowName,
                description,
                taskQueue,
                workflowDsl: workflowDsl as any,
                activityDsl: activityDsl as any,
                generatedCode,
              });

        if (!release.sourceId) {
          await this.prisma.$executeRawUnsafe(
            `UPDATE capability_releases
             SET source_id = $2::uuid, source_name = $3, updated_at = now()
             WHERE id = $1::uuid`,
            id,
            workflow.id,
            workflow.name,
          );
        }

        const deployedWorkflow = await this.temporalWorkflowService.deploy(workflow.id);
        logs.push('Workflow code synced to ops-temporal metadata');
        logs.push(`Temporal workflow deployed: ${deployedWorkflow.id}`);
        logs.push(`Task queue: ${deployedWorkflow.taskQueue}`);
        artifactUri = `temporal-workflow://${deployedWorkflow.id}`;
        artifactHash = build.id;
        workerVersion = build.id;
        resultSnapshot = {
          workflowId: deployedWorkflow.id,
          taskQueue: deployedWorkflow.taskQueue,
          deployedAt: deployedWorkflow.deployedAt?.toISOString?.() || null,
          generatedFromBuildId: build.id,
          targetService: 'ops-temporal',
          environment,
          strategy,
          deploymentProfile,
          effectiveConfig,
          workerReloadRequested,
        };
      } else {
        deploymentBuild = await this.resolveBuildForValidation(release, snapshot, undefined, userId);
        logs.push(`Environment: ${environment}`);
        logs.push(`Strategy: ${strategy}`);
        if (Object.keys(deploymentProfile).length > 0) {
          logs.push(`Deployment profile loaded for ${environment}`);
        }
        if (Object.keys(configOverrides).length > 0) {
          logs.push(`Deployment overrides applied: ${JSON.stringify(configOverrides)}`);
        }
        logs.push('模板型能力无需独立 Worker 部署，已将当前已发布 Skill 作为生效版本');
        artifactUri = release.publishedSkillId ? `skill-config://${release.publishedSkillId}` : null;
        artifactHash = release.publishedSkillId || null;
        resultSnapshot = {
          publishedSkillId: release.publishedSkillId,
          mode: 'skill_config_activation',
          environment,
          strategy,
          deploymentProfile,
          effectiveConfig,
        };
      }

      if (deploymentBuild) {
        logs.push(`[Smoke] 开始执行部署后验证 (${environment})`);
        const smokeResult = await this.runPostDeploySmokeTest(
          release,
          snapshot,
          deploymentBuild,
          deploymentId,
          environment,
          userId,
        );
        smokeValidationId = smokeResult.validationId;
        logs.push(...smokeResult.logs.map((item) => `[Smoke] ${item}`));
        if (!smokeResult.success) {
          throw new Error(smokeResult.errorSummary || `${environment} smoke test failed`);
        }
        logs.push(`[Smoke] 部署后验证通过，分数: ${smokeResult.score}`);
      }

      await this.finishDeployment(
        deploymentId,
        id,
        'deployed',
        'succeeded',
        true,
        logs,
        resultSnapshot,
        artifactUri,
        artifactHash,
        workerVersion,
        smokeValidationId,
        null,
      );
      await this.insertAuditEvent(id, 'deployment_succeeded', userId, true, `部署成功 (${environment})`);

      return {
        release: await this.getReleaseOrThrow(id),
        deployment: await this.getDeploymentOrThrow(deploymentId),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      await this.finishDeployment(
        deploymentId,
        id,
        'deploy_failed',
        'failed',
        false,
        [`[Error] ${message}`],
        { error: message },
        null,
        null,
        null,
        null,
        null,
      );
      await this.insertAuditEvent(id, 'deployment_failed', userId, false, `部署失败: ${message}`);
      throw new BadRequestException(message);
    }
  }

  async getDeployments(id: string): Promise<DeploymentRecordDTO[]> {
    await this.getReleaseOrThrow(id);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT *
       FROM deployment_records
       WHERE release_id = $1::uuid
       ORDER BY created_at DESC`,
      id,
    );
    return rows.map((row) => this.mapDeployment(row));
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
    return rows.map((row) => this.mapAuditEvent(row));
  }

  async rollback(
    id: string,
    dto: RollbackCapabilityReleaseDTO,
    userId?: string,
  ): Promise<{ release: CapabilityReleaseDTO; deployment: DeploymentRecordDTO; targetReleaseId: string }> {
    const release = await this.getReleaseOrThrow(id);
    const targetRelease = await this.getRollbackTargetOrThrow(release, dto.targetReleaseId);

    const deploymentId = randomUUID();
    const runtimeType: CapabilityDeploymentRuntimeType =
      release.sourceType === 'temporal_workflow' ? 'temporal_worker' : 'flow_runtime';

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO deployment_records (
        id, release_id, published_skill_id, environment, runtime_type, reload_strategy,
        request_payload_json, logs_json, status, success, rollback_target_release_id,
        started_at, created_by, created_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, 'staging', $4, 'rolling_restart',
        $5::jsonb, '[]'::jsonb, 'running', false, $6::uuid,
        now(), $7::uuid, now()
      )`,
      deploymentId,
      id,
      release.publishedSkillId || targetRelease.publishedSkillId || null,
      runtimeType,
      JSON.stringify({ targetReleaseId: targetRelease.id, reason: dto.reason || null }),
      targetRelease.id,
      userId || null,
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET status = 'deploying',
           deployment_status = 'deploying',
           last_deployment_id = $2::uuid,
           updated_at = now()
       WHERE id = $1::uuid`,
      id,
      deploymentId,
    );

    await this.insertAuditEvent(
      id,
      'rollback_started',
      userId,
      true,
      `开始回滚到 Release ${targetRelease.id}`,
      { targetReleaseId: targetRelease.id, reason: dto.reason || null },
    );

    try {
      const logs: string[] = [];
      let restoredSkillId = targetRelease.publishedSkillId || null;
      let resultSnapshot: Record<string, unknown> | null = null;

      if (targetRelease.currentSkillDraftId) {
        const targetDraft = await this.getSkillDraftOrThrow(targetRelease.currentSkillDraftId);
        if (release.publishedSkillId) {
          const updated = await this.skillService.updateSkill(release.publishedSkillId, targetDraft.draftPayload as any);
          restoredSkillId = updated?.id || release.publishedSkillId;
        } else if (targetRelease.publishedSkillId) {
          const updated = await this.skillService.updateSkill(targetRelease.publishedSkillId, targetDraft.draftPayload as any);
          restoredSkillId = updated?.id || targetRelease.publishedSkillId;
        } else {
          const created = await this.skillService.createSkill(targetDraft.draftPayload as any);
          restoredSkillId = created.id;
        }
        logs.push(`Skill configuration rolled back using draft ${targetDraft.id}`);
      }

      if (release.sourceType === 'temporal_workflow') {
        const targetSnapshot = await this.getCurrentSnapshotOrThrow(targetRelease);
        const targetBuild = await this.resolveTemporalExecutableBuildOrThrow(
          targetRelease,
          targetSnapshot,
          undefined,
          userId,
        );
        const workflowDsl = this.expectRecord(targetSnapshot.sourcePayload.workflowDsl, '缺少 workflowDsl');
        const activityDsl = this.expectRecord(targetSnapshot.sourcePayload.activityDsl, '缺少 activityDsl');
        const workflowName = String(
          targetSnapshot.sourcePayload.name || targetRelease.sourceName || 'GeneratedWorkflow',
        );
        const description = String(targetSnapshot.sourcePayload.description || '');
        const taskQueue =
          typeof targetSnapshot.sourcePayload.taskQueue === 'string'
            ? targetSnapshot.sourcePayload.taskQueue
            : 'SKILL_TASK_QUEUE';
        const workflowId = release.sourceId || targetRelease.sourceId;
        const generatedCode = targetBuild.generatedCode || '';
        const workflow =
          workflowId
            ? await this.temporalWorkflowService.update(workflowId, {
                name: workflowName,
                description,
                taskQueue,
                workflowDsl: workflowDsl as any,
                activityDsl: activityDsl as any,
                generatedCode,
                isActive: true,
              })
            : await this.temporalWorkflowService.create({
                name: workflowName,
                description,
                taskQueue,
                workflowDsl: workflowDsl as any,
                activityDsl: activityDsl as any,
                generatedCode,
              });

        await this.temporalWorkflowService.deploy(workflow.id);
        logs.push('Workflow code synced to ops-temporal metadata');
        logs.push(`Temporal workflow rolled back to build ${targetBuild.id}`);
        resultSnapshot = {
          workflowId: workflow.id,
          restoredFromReleaseId: targetRelease.id,
          restoredBuildId: targetBuild.id,
          restoredSkillId,
        };
      } else {
        logs.push(`模板型能力已回滚到 Release ${targetRelease.id} 的已发布配置`);
        resultSnapshot = {
          restoredFromReleaseId: targetRelease.id,
          restoredSkillId,
        };
      }

      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_releases
         SET published_skill_id = $2::uuid,
             rollback_of_release_id = $3::uuid,
             updated_at = now()
         WHERE id = $1::uuid`,
        id,
        restoredSkillId,
        targetRelease.id,
      );

      await this.finishDeployment(
        deploymentId,
        id,
        'rolled_back',
        'rolled_back',
        true,
        logs,
        resultSnapshot,
        restoredSkillId ? `skill-config://${restoredSkillId}` : null,
        restoredSkillId,
        targetRelease.latestSuccessfulBuildId || null,
        null,
        targetRelease.id,
      );
      await this.insertAuditEvent(
        id,
        'rollback_succeeded',
        userId,
        true,
        `已回滚到 Release ${targetRelease.id}`,
        { targetReleaseId: targetRelease.id, restoredSkillId },
      );

      return {
        release: await this.getReleaseOrThrow(id),
        deployment: await this.getDeploymentOrThrow(deploymentId),
        targetReleaseId: targetRelease.id,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      await this.finishDeployment(
        deploymentId,
        id,
        'deploy_failed',
        'failed',
        false,
        [`[Error] ${message}`],
        { error: message, targetReleaseId: targetRelease.id },
        null,
        null,
        null,
        null,
        targetRelease.id,
      );
      await this.insertAuditEvent(id, 'rollback_failed', userId, false, `回滚失败: ${message}`);
      throw new BadRequestException(message);
    }
  }

  async analyzeFailure(
    id: string,
    dto: AnalyzeFailureDTO,
    userId?: string,
  ): Promise<AnalyzeFailureResultDTO> {
    const release = await this.getReleaseOrThrow(id);
    let logs: string[] = [];
    let errorSummary = '';
    let recordContext = '';

    if (dto.recordType === 'build') {
      const build = await this.getBuildOrThrow(dto.recordId);
      logs = build.logs || [];
      errorSummary = build.errorSummary || '';
      recordContext = `Build Type: ${build.buildType}, Model: ${build.modelId}`;
    } else if (dto.recordType === 'validation') {
      const validation = await this.getValidationOrThrow(dto.recordId);
      logs = validation.logs || [];
      errorSummary = validation.errorSummary || '';
      recordContext = `Validation Type: ${validation.validationType}`;
    } else if (dto.recordType === 'deployment') {
      const deployment = await this.getDeploymentOrThrow(dto.recordId);
      logs = deployment.logs || [];
      errorSummary = logs.find((l) => l.includes('[Error]')) || '';
      recordContext = `Env: ${deployment.environment}, Runtime: ${deployment.runtimeType}`;
    }

    const prompt = `你是一个高级系统调试专家。正在分析一个自动化能力发布过程中的失败。
上下文：
能力名称: ${release.sourceName}
源类型: ${release.sourceType}
记录类型: ${dto.recordType} (${recordContext})
失败摘要: ${errorSummary}
执行日志:
${logs.join('\n')}

任务：
1. 识别失败的根本原因。
2. 判断失败是否是由于测试输入（testInput/input）中缺失或错误的参数导致的。如果是网络超时或SSL错误，请结合日志判断是否是因为输入了非法参数（如 [None]）触发的请求。
3. 如果是参数问题，请生成一个 JSON 对象，代表建议的正确测试参数。
4. 提供一个简明扼要的解释给用户。
5. 给出建议的下一步操作（suggestedAction）。

输出格式 (JSON)：
{
  "analysis": "原因分析文本",
  "explanation": "给用户的简短解释",
  "isParameterIssue": true/false,
  "suggestedParams": { "key": "value" } 或 null,
  "suggestedAction": "建议的操作，如：更新测试参数并重新校验"
}`;

    try {
      const orchestratorUrl = process.env.AI_ORCHESTRATOR_URL || 'http://ai-orchestrator:3007';
      const response = await axios.post<{ result: string }>(
        `${orchestratorUrl}/ai/model/call`,
        {
          modelId: 'default',
          prompt,
        },
        { timeout: 60000 },
      );

      const content = response.data?.result || '';
      // 提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          analysis: content,
          explanation: 'AI 未能返回结构化分析结果，请参考分析内容',
          isParameterIssue: false,
        };
      }

      const result = JSON.parse(jsonMatch[0]);
      await this.insertAuditEvent(
        id,
        'failure_analyzed',
        userId,
        true,
        `AI 失败分析完成: ${result.explanation}`,
        { recordId: dto.recordId, recordType: dto.recordType },
      );

      return {
        analysis: result.analysis,
        explanation: result.explanation,
        isParameterIssue: !!result.isParameterIssue,
        suggestedParams: result.suggestedParams,
        suggestedAction: result.suggestedAction,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.error(`AI failure analysis failed: ${message}`);
      return {
        analysis: `AI 分析调用失败: ${message}`,
        explanation: '暂时无法提供 AI 自动分析，请手动检查日志',
        isParameterIssue: false,
      };
    }
  }

  async suggestWizardAssist(
    id: string,
    dto: SuggestReleaseWizardAssistDTO,
    userId?: string,
  ): Promise<SuggestReleaseWizardAssistResultDTO> {
    const release = await this.getReleaseOrThrow(id);
    const snapshot = await this.getCurrentSnapshotOrThrow(release);
    const environment = dto.environment || 'test';
    const paramsSchema = this.resolveEffectiveTemporalParamsSchema(snapshot.sourcePayload);
    const fallbackTestInput = this.buildSuggestedInputFromSchema(paramsSchema);
    const deployConfig = this.resolveDeploymentProfile(snapshot.sourcePayload, environment);

    const prompt = `你是企业技能发布向导的 AI 助手。请基于以下能力定义，给出“部署配置建议”和“真实校验测试参数建议”。\n\n能力名称: ${
      release.sourceName || release.id
    }\n能力类型: ${release.sourceType}\n目标环境: ${environment}\n参数 Schema: ${JSON.stringify(
      paramsSchema,
      null,
      2,
    )}\n源定义快照: ${JSON.stringify(snapshot.sourcePayload, null, 2)}\n\n要求：\n1. 返回一个适合演示和校验的 testInput JSON。\n2. 如果有比较合理的 testUserInput，自然语言给一句。\n3. deployConfig 只返回用户本次需要重点关注或覆盖的字段；没有必要覆盖则返回空对象。\n4. explanation 用中文，告诉用户这些参数为什么这样推荐。\n5. 只返回 JSON，不要 Markdown。\n\n返回格式：\n{\n  "explanation": "中文说明",\n  "deployConfig": {},\n  "testInput": {},\n  "testUserInput": "..." \n}`;

    try {
      const orchestratorUrl = process.env.AI_ORCHESTRATOR_URL || 'http://ai-orchestrator:3007';
      const response = await axios.post<{ result: string }>(
        `${orchestratorUrl}/ai/model/call`,
        { modelId: 'default', prompt },
        { timeout: 60000 },
      );
      const content = response.data?.result || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

      const result: SuggestReleaseWizardAssistResultDTO = {
        explanation:
          typeof parsed?.explanation === 'string' && parsed.explanation.trim()
            ? parsed.explanation.trim()
            : '已根据当前能力定义自动生成推荐的部署与测试参数。',
        deployConfig:
          parsed?.deployConfig && typeof parsed.deployConfig === 'object'
            ? parsed.deployConfig
            : deployConfig,
        testInput:
          parsed?.testInput && typeof parsed.testInput === 'object'
            ? parsed.testInput
            : fallbackTestInput,
        testUserInput:
          typeof parsed?.testUserInput === 'string' && parsed.testUserInput.trim()
            ? parsed.testUserInput.trim()
            : null,
      };

      await this.insertAuditEvent(
        id,
        'wizard_assist_suggested',
        userId,
        true,
        `已生成向导建议 (${environment})`,
        { environment },
      );

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(`Wizard assist fallback due to AI error: ${message}`);
      return {
        explanation: 'AI 暂时不可用，已根据参数 Schema 自动生成建议参数。',
        deployConfig,
        testInput: fallbackTestInput,
        testUserInput: Object.keys(fallbackTestInput).length > 0 ? `请使用这些参数验证 ${release.sourceName || '当前能力'}` : null,
      };
    }
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
    return this.mapRelease(rows[0]);
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
    return this.mapSourceSnapshot(rows[0]);
  }

  private async getBuildOrThrow(id: string): Promise<CapabilityBuildDTO> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM capability_builds WHERE id = $1::uuid LIMIT 1`,
      id,
    );
    if (!rows[0]) {
      throw new NotFoundException('构建记录不存在');
    }
    return this.mapBuild(rows[0]);
  }

  private async getValidationOrThrow(id: string): Promise<CapabilityValidationDTO> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM capability_validations WHERE id = $1::uuid LIMIT 1`,
      id,
    );
    if (!rows[0]) {
      throw new NotFoundException('验证记录不存在');
    }
    return this.mapValidation(rows[0]);
  }

  private async getDeploymentOrThrow(id: string): Promise<DeploymentRecordDTO> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM deployment_records WHERE id = $1::uuid LIMIT 1`,
      id,
    );
    if (!rows[0]) {
      throw new NotFoundException('部署记录不存在');
    }
    return this.mapDeployment(rows[0]);
  }

  private async getSkillDraftOrThrow(id: string): Promise<SkillDraftDTO> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM skill_drafts WHERE id = $1::uuid LIMIT 1`,
      id,
    );
    if (!rows[0]) {
      throw new NotFoundException('Skill 草案不存在');
    }
    return this.mapSkillDraft(rows[0]);
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
    return this.mapValidation(rows[0]);
  }

  private async getLatestSuccessfulBuildOrThrow(releaseId: string): Promise<CapabilityBuildDTO> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT *
       FROM capability_builds
       WHERE release_id = $1::uuid AND status = 'succeeded'
       ORDER BY created_at DESC
       LIMIT 1`,
      releaseId,
    );
    if (!rows[0]) {
      throw new NotFoundException('当前 Release 没有成功的构建记录');
    }
    return this.mapBuild(rows[0]);
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
    return rows[0] ? this.mapBuild(rows[0]) : null;
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
    return this.mapSourceSnapshot(rows[0]);
  }

  private async createValidationRecord(
    releaseId: string,
    buildId: string,
    validationType: 'static' | 'sandbox' | 'post_deploy_smoke',
    input: Record<string, unknown> | undefined,
    userId?: string,
    updateReleaseStatus = true,
  ): Promise<string> {
    const validationId = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO capability_validations (
        id, release_id, build_id, validation_type, input_snapshot_json,
        logs_json, score, success, started_at, created_by, created_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4, $5::jsonb,
        '[]'::jsonb, 0, false, now(), $6::uuid, now()
      )`,
      validationId,
      releaseId,
      buildId,
      validationType,
      JSON.stringify(input || null),
      userId || null,
    );
    if (updateReleaseStatus) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_releases
         SET status = 'validating', latest_validation_id = $2::uuid, updated_at = now()
         WHERE id = $1::uuid`,
        releaseId,
        validationId,
      );
    } else {
      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_releases
         SET latest_validation_id = $2::uuid, updated_at = now()
         WHERE id = $1::uuid`,
        releaseId,
        validationId,
      );
    }
    return validationId;
  }

  private async createSmokeValidationRecord(
    releaseId: string,
    buildId: string,
    input: Record<string, unknown> | undefined,
    userId?: string,
  ): Promise<string> {
    const validationId = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO capability_validations (
        id, release_id, build_id, validation_type, input_snapshot_json,
        logs_json, score, success, started_at, created_by, created_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, 'post_deploy_smoke', $4::jsonb,
        '[]'::jsonb, 0, false, now(), $5::uuid, now()
      )`,
      validationId,
      releaseId,
      buildId,
      JSON.stringify(input || null),
      userId || null,
    );
    return validationId;
  }

  private async finishValidation(
    validationId: string,
    releaseId: string,
    releaseStatus: string,
    success: boolean,
    score: number,
    logs: string[],
    resultSnapshot: Record<string, unknown> | null,
    errorSummary: string | null,
    preserveReleaseStatus = false,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_validations
       SET result_snapshot_json = $2::jsonb,
           logs_json = $3::jsonb,
           score = $4,
           success = $5,
           error_summary = $6,
           finished_at = now()
       WHERE id = $1::uuid`,
      validationId,
      JSON.stringify(resultSnapshot),
      JSON.stringify(logs),
      score,
      success,
      errorSummary,
    );

    if (preserveReleaseStatus) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_releases
         SET latest_validation_id = $2::uuid,
             latest_successful_validation_id = CASE WHEN $3 THEN $2::uuid ELSE latest_successful_validation_id END,
             updated_at = now()
         WHERE id = $1::uuid`,
        releaseId,
        validationId,
        success,
      );
      return;
    }

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET status = $2,
           latest_validation_id = $3::uuid,
           latest_successful_validation_id = CASE WHEN $4 THEN $3::uuid ELSE latest_successful_validation_id END,
           updated_at = now()
       WHERE id = $1::uuid`,
      releaseId,
      releaseStatus,
      validationId,
      success,
    );
  }

  private shouldPreserveReleaseStatusDuringValidation(release: CapabilityReleaseDTO): boolean {
    return (
      Boolean(release.publishedSkillId) ||
      ['published', 'deploying', 'deployed', 'rolled_back'].includes(release.status) ||
      ['running', 'succeeded', 'deployed', 'rolled_back'].includes(release.deploymentStatus)
    );
  }

  private async finishSmokeValidation(
    validationId: string,
    releaseId: string,
    success: boolean,
    score: number,
    logs: string[],
    resultSnapshot: Record<string, unknown> | null,
    errorSummary: string | null,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_validations
       SET result_snapshot_json = $2::jsonb,
           logs_json = $3::jsonb,
           score = $4,
           success = $5,
           error_summary = $6,
           finished_at = now()
       WHERE id = $1::uuid`,
      validationId,
      JSON.stringify(resultSnapshot),
      JSON.stringify(logs),
      score,
      success,
      errorSummary,
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET latest_validation_id = $2::uuid,
           latest_successful_validation_id = CASE WHEN $3 THEN $2::uuid ELSE latest_successful_validation_id END,
           updated_at = now()
       WHERE id = $1::uuid`,
      releaseId,
      validationId,
      success,
    );
  }

  private async finishDeployment(
    deploymentId: string,
    releaseId: string,
    releaseStatus: string,
    deploymentStatus: CapabilityDeploymentStatus,
    success: boolean,
    logs: string[],
    resultSnapshot: Record<string, unknown> | null,
    artifactUri: string | null,
    artifactHash: string | null,
    workerVersion: string | null,
    smokeValidationId: string | null,
    rollbackTargetReleaseId: string | null,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE deployment_records
       SET artifact_uri = $2,
           artifact_hash = $3,
           worker_version = $4,
           result_snapshot_json = $5::jsonb,
           logs_json = $6::jsonb,
           status = $7,
           success = $8,
           smoke_validation_id = $9::uuid,
           rollback_target_release_id = $10::uuid,
           finished_at = now()
       WHERE id = $1::uuid`,
      deploymentId,
      artifactUri,
      artifactHash,
      workerVersion,
      JSON.stringify(resultSnapshot),
      JSON.stringify(logs),
      deploymentStatus,
      success,
      smokeValidationId,
      rollbackTargetReleaseId,
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET status = $2,
           deployment_status = $3,
           last_deployment_id = $4::uuid,
           updated_at = now()
       WHERE id = $1::uuid`,
      releaseId,
      releaseStatus,
      deploymentStatus === 'succeeded'
        ? 'deployed'
        : deploymentStatus === 'rolled_back'
          ? 'rolled_back'
          : 'failed',
      deploymentId,
    );
  }

  private async runPostDeploySmokeTest(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    build: CapabilityBuildDTO,
    deploymentId: string,
    environment: string,
    userId?: string,
  ): Promise<{
    validationId: string;
    success: boolean;
    score: number;
    logs: string[];
    resultSnapshot: Record<string, unknown> | null;
    errorSummary: string | null;
  }> {
    const validationId = await this.createSmokeValidationRecord(
      release.id,
      build.id,
      { deploymentId, environment },
      userId,
    );

    try {
      let success = false;
      let score = 0;
      let logs: string[] = [];
      let resultSnapshot: Record<string, unknown> | null = null;
      let errorSummary: string | null = null;
      const smokeInput = this.buildSmokeTestInput(release, snapshot, environment);

      if (release.sourceType === 'temporal_workflow') {
        if (!build.generatedCode) {
          throw new Error('当前构建没有可执行代码，无法执行部署后 smoke test');
        }
        const fn = this.resolveWorkflowFnOrThrow(snapshot.sourcePayload);
        const result = await this.temporalWorkflowService.validateWorkflowReal(
          build.generatedCode,
          fn,
          smokeInput,
        );
        success = result.success;
        score = result.score;
        logs = result.logs;
        resultSnapshot = {
          result: result.result ?? null,
          error: result.error ?? null,
          fn,
          environment,
          deploymentId,
          input: smokeInput,
        };
        errorSummary = result.error || null;
      } else if (release.sourceId) {
        const validation = await this.executionFlowTemplateService.validateTemplate(
          release.sourceId,
          undefined,
          smokeInput,
          true,
          `smoke test for ${environment}`,
        );
        success = validation.isValid;
        score = validation.score || 0;
        logs = validation.details?.executionTest?.log || [];
        resultSnapshot = {
          ...((validation as unknown as Record<string, unknown>) || {}),
          environment,
          deploymentId,
          input: smokeInput,
        };
        errorSummary = validation.warnings?.[0] || null;
      } else {
        throw new Error('当前能力缺少 sourceId，无法执行部署后 smoke test');
      }

      await this.finishSmokeValidation(
        validationId,
        release.id,
        success,
        score,
        logs,
        resultSnapshot,
        errorSummary,
      );

      await this.insertAuditEvent(
        release.id,
        success ? 'deployment_smoke_succeeded' : 'deployment_smoke_failed',
        userId,
        success,
        success
          ? `部署后 smoke test 通过 (${environment})`
          : `部署后 smoke test 失败: ${errorSummary || '未知错误'}`,
        { deploymentId, environment, validationId },
      );

      return {
        validationId,
        success,
        score,
        logs,
        resultSnapshot,
        errorSummary,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      await this.finishSmokeValidation(
        validationId,
        release.id,
        false,
        0,
        [`[Error] ${message}`],
        { deploymentId, environment, error: message },
        message,
      );
      await this.insertAuditEvent(
        release.id,
        'deployment_smoke_failed',
        userId,
        false,
        `部署后 smoke test 失败: ${message}`,
        { deploymentId, environment, validationId },
      );
      return {
        validationId,
        success: false,
        score: 0,
        logs: [`[Error] ${message}`],
        resultSnapshot: { deploymentId, environment, error: message },
        errorSummary: message,
      };
    }
  }

  private async resolveBuildForValidation(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    buildId: string | undefined,
    userId?: string,
  ): Promise<CapabilityBuildDTO> {
    if (release.sourceType === 'temporal_workflow') {
      return this.resolveTemporalExecutableBuildOrThrow(release, snapshot, buildId, userId);
    }

    if (buildId) {
      return this.getBuildOrThrow(buildId);
    }
    if (release.currentBuildId) {
      return this.getBuildOrThrow(release.currentBuildId);
    }

    const syntheticBuildId = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO capability_builds (
        id, release_id, source_snapshot_id, build_type, model_id, input_snapshot_json,
        generated_config_json, status, started_at, finished_at, created_by, created_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, 'config_enhancement', 'system', $4::jsonb,
        $5::jsonb, 'succeeded', now(), now(), $6::uuid, now()
      )`,
      syntheticBuildId,
      release.id,
      snapshot.id,
      JSON.stringify(snapshot.sourcePayload),
      JSON.stringify(snapshot.sourcePayload),
      userId || null,
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET current_build_id = $2::uuid, latest_successful_build_id = $2::uuid, updated_at = now()
       WHERE id = $1::uuid`,
      release.id,
      syntheticBuildId,
    );

    return this.getBuildOrThrow(syntheticBuildId);
  }

  private async getRollbackTargetOrThrow(
    release: CapabilityReleaseDTO,
    targetReleaseId?: string,
  ): Promise<CapabilityReleaseDTO> {
    if (targetReleaseId) {
      const target = await this.getReleaseOrThrow(targetReleaseId);
      if (target.id === release.id) {
        throw new BadRequestException('不能回滚到当前 Release 自身');
      }
      return target;
    }

    if (!release.sourceId && !release.sourceName) {
      throw new BadRequestException('当前 Release 缺少可用于推断回滚目标的源标识');
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT *
       FROM capability_releases
       WHERE id <> $1::uuid
         AND source_type = $2
         AND published_skill_id IS NOT NULL
         AND archived_at IS NULL
         AND (
           ($3::uuid IS NOT NULL AND source_id = $3::uuid)
           OR ($3::uuid IS NULL AND $4 IS NOT NULL AND source_name = $4)
         )
       ORDER BY updated_at DESC
       LIMIT 1`,
      release.id,
      release.sourceType,
      release.sourceId || null,
      release.sourceName || null,
    );

    if (!rows[0]) {
      throw new NotFoundException('未找到可回滚的目标 Release');
    }

    return this.mapRelease(rows[0]);
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
      const workflowDsl = this.parseJson<Record<string, unknown>>(rows[0].workflowDsl) || {};
      const activityDsl = this.parseJson<Record<string, unknown>>(rows[0].activityDsl) || {};

      return {
        id: rows[0].id,
        name: rows[0].name,
        description: rows[0].description,
        taskQueue: rows[0].taskQueue,
        generatedCode: rows[0].generatedCode || null,
        workflowDsl,
        activityDsl,
        goal: this.extractTemporalGoal(workflowDsl, rows[0].description),
        expectedResult: this.extractTemporalExpectedResult(workflowDsl),
        paramsSchema: this.buildTemporalParamsSchema(workflowDsl, activityDsl),
        executionFlowKeys: this.buildTemporalExecutionFlowKeys(rows[0].name, workflowDsl, activityDsl),
        outputParams: this.parseJson(workflowDsl.outputParams) || {},
        workflowSteps: this.buildTemporalWorkflowSteps(workflowDsl),
        sourceTemplate: this.extractTemporalSourceTemplate(workflowDsl, activityDsl),
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
      paramsSchema: this.parseJson(rows[0].paramsSchema),
      category: rows[0].category,
      steps: this.parseJson(rows[0].steps),
      executionFlowKeys: this.parseJson(rows[0].executionFlowKeys),
      sourceTemplate: this.extractExecutionFlowSourceTemplate({
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

  private getDefaultBuildType(sourceType: string): CapabilityBuildType {
    return sourceType === 'temporal_workflow' ? 'codegen_workflow' : 'config_enhancement';
  }

  private resolveDeploymentProfile(
    sourcePayload: Record<string, unknown>,
    environment: string,
  ): Record<string, unknown> {
    const profiles =
      sourcePayload.deploymentProfiles && typeof sourcePayload.deploymentProfiles === 'object'
        ? (sourcePayload.deploymentProfiles as Record<string, unknown>)
        : {};

    return profiles[environment] && typeof profiles[environment] === 'object'
      ? (profiles[environment] as Record<string, unknown>)
      : {};
  }

  private extractSourceName(payload: Record<string, unknown>): string | null {
    const name = payload.name;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  }

  private extractTemporalGoal(
    workflowDsl: Record<string, unknown>,
    fallbackDescription?: string | null,
  ): string | null {
    const extraPrompt = workflowDsl.extraPrompt;
    if (typeof extraPrompt === 'string' && extraPrompt.trim()) {
      return extraPrompt.trim();
    }
    return typeof fallbackDescription === 'string' && fallbackDescription.trim()
      ? fallbackDescription.trim()
      : null;
  }

  private extractTemporalExpectedResult(workflowDsl: Record<string, unknown>): string | null {
    const outputParams = this.parseJson<Record<string, unknown>>(workflowDsl.outputParams) || {};
    const entries = Object.entries(outputParams)
      .map(([key, value]) => {
        const definition = value && typeof value === 'object'
          ? (value as Record<string, unknown>)
          : {};
        const description = typeof definition.description === 'string'
          ? definition.description.trim()
          : '';
        return description ? `${key}: ${description}` : key;
      })
      .filter(Boolean);

    return entries.length > 0 ? entries.join('; ') : null;
  }

  private buildTemporalOutputParamsFromValidation(
    validation: CapabilityValidationDTO,
  ): Record<string, unknown> {
    const snapshot = validation.resultSnapshot && typeof validation.resultSnapshot === 'object'
      ? validation.resultSnapshot
      : {};
    const resultContainer = this.parseJson<Record<string, unknown>>(
      (snapshot as Record<string, unknown>).result,
    ) || {};
    const rawResult = this.parseJson<Record<string, unknown>>(resultContainer.result) || {};
    const properties = Object.entries(rawResult).reduce<Record<string, unknown>>((acc, [key, value]) => {
      acc[key] = {
        type: this.inferTemporalParamType(value, key),
        description: `Workflow 输出字段 ${key}`,
      };
      return acc;
    }, {});
    return properties;
  }

  private resolveEffectiveTemporalParamsSchema(
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const workflowDsl = this.parseJson(payload.workflowDsl) as Record<string, unknown> || {};
    const activityDsl = this.parseJson(payload.activityDsl) as Record<string, unknown> || {};
    const rawSchema = this.parseJson(payload.paramsSchema) as Record<string, unknown> | null;
    const inferredSchema = this.buildTemporalParamsSchema(workflowDsl, activityDsl);

    if (!rawSchema || typeof rawSchema !== 'object') {
      return inferredSchema;
    }

    const rawProperties =
      rawSchema.properties && typeof rawSchema.properties === 'object'
        ? (rawSchema.properties as Record<string, unknown>)
        : {};
    const inferredProperties =
      inferredSchema.properties && typeof inferredSchema.properties === 'object'
        ? (inferredSchema.properties as Record<string, unknown>)
        : {};
    const rawRequired = Array.isArray(rawSchema.required)
      ? rawSchema.required.filter((item): item is string => typeof item === 'string')
      : [];
    const inferredRequired = Array.isArray(inferredSchema.required)
      ? inferredSchema.required.filter((item): item is string => typeof item === 'string')
      : [];

    const mergedProperties = Object.entries(inferredProperties).reduce<Record<string, unknown>>(
      (acc, [key, inferredValue]) => {
        const rawValue = rawProperties[key];
        acc[key] =
          rawValue && typeof rawValue === 'object'
            ? {
                ...(inferredValue as Record<string, unknown>),
                ...(rawValue as Record<string, unknown>),
                ...(
                  (rawValue as Record<string, unknown>).default === undefined &&
                  (inferredValue as Record<string, unknown>).default !== undefined
                    ? { default: (inferredValue as Record<string, unknown>).default }
                    : {}
                ),
                ...(Array.from(new Set([...rawRequired, ...inferredRequired])).includes(key)
                  ? { required: true }
                  : {}),
              }
            : inferredValue;
        return acc;
      },
      { ...rawProperties },
    );

    return {
      ...rawSchema,
      ...inferredSchema,
      properties: mergedProperties,
      required: Array.from(new Set([...rawRequired, ...inferredRequired])),
    };
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
      throw new BadRequestException(
        '当前工作流缺少 workflowDsl.workflowClassName，请在工作流页面设置函数名称并重新同步后再验证/部署',
      );
    }
    return workflowClassName;
  }

  private getControlPlaneApiUrl(): string {
    const configured = process.env.CONTROL_PLANE_URL;
    if (configured && configured.trim()) {
      return configured.endsWith('/api') ? configured : `${configured}/api`;
    }
    if (process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production') {
      return 'http://ops-control-plane:3003/api';
    }
    return 'http://localhost:3003/api';
  }

  private async executePublishedSkillByPromptForValidation(
    skillId: string,
    prompt: string,
    authToken?: string,
  ): Promise<{ success: boolean; logs: string[]; result?: Record<string, unknown> | null; error?: string }> {
    const runtimeContext = await this.getPublishedSkillRuntimeContext(skillId);
    const controlPlaneUrl = this.getControlPlaneApiUrl();
    const logs: string[] = [
      `[NL-Validation] 使用自然语言调用已发布 Skill: ${skillId}`,
      `[NL-Validation] runtimeType=${runtimeContext.runtimeType}, runtimeSource=${runtimeContext.runtimeSource}`,
    ];

    const createRes = await axios.post<{ id: string }>(
      `${controlPlaneUrl}/executions`,
      {
        skillId,
        runtimeType: runtimeContext.runtimeType,
        input: {
          prompt,
        },
      },
      {
        headers: authToken ? { Authorization: authToken } : undefined,
      },
    );
    const executionId = createRes.data.id;
    logs.push(`[NL-Validation] 已创建执行单: ${executionId}`);

    const maxAttempts = 60;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const detailRes = await axios.get<Record<string, unknown>>(
        `${controlPlaneUrl}/executions/${executionId}`,
        {
          headers: authToken ? { Authorization: authToken } : undefined,
        },
      );
      const status = String(detailRes.data?.status || '');
      logs.push(`[NL-Validation] 执行状态: ${status}`);

      if (status === 'succeeded') {
        return {
          success: true,
          logs,
          result:
            detailRes.data?.result && typeof detailRes.data.result === 'object'
              ? (detailRes.data.result as Record<string, unknown>)
              : null,
        };
      }

      if (status === 'failed' || status === 'cancelled' || status === 'rolled_back') {
        const failureReason = String(detailRes.data?.failureReason || '执行失败');
        return {
          success: false,
          logs,
          error: failureReason,
          result:
            detailRes.data?.result && typeof detailRes.data.result === 'object'
              ? (detailRes.data.result as Record<string, unknown>)
              : null,
        };
      }

      if (status === 'waiting_input' || status === 'pending_approval') {
        return {
          success: false,
          logs,
          error: `自然语言验证未完成：执行进入 ${status}，请补充信息或审批后重试`,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    return {
      success: false,
      logs,
      error: '自然语言验证超时：执行长时间未进入终态',
    };
  }

  private buildTemporalParamsSchema(
    workflowDsl: Record<string, unknown>,
    activityDsl?: Record<string, unknown>,
  ): Record<string, unknown> {
    const inputParams = this.parseJson<Record<string, unknown>>(workflowDsl.inputParams) || {};
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    Object.entries(inputParams).forEach(([key, value]) => {
      const definition = value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : {};
      const description = typeof definition.description === 'string'
        ? definition.description.trim()
        : `Workflow 输入参数 ${key}`;
      const defaultValue = definition.defaultValue;
      const inferredType = this.inferTemporalParamType(defaultValue, description);

      properties[key] = {
        type: inferredType,
        description,
        required: Boolean(definition.required),
        ...(!definition.required && defaultValue !== undefined ? { default: defaultValue } : {}),
        extractionPrompt: description,
      };

      if (definition.required) {
        required.push(key);
      }
    });

    if (Object.keys(properties).length === 0) {
      const inferredFromActivities = this.inferTemporalParamsFromActivityDsl(activityDsl);
      const steps = Array.isArray(workflowDsl.steps) ? workflowDsl.steps : [];
      steps.forEach((step) => {
        if (!step || typeof step !== 'object') {
          return;
        }
        const stepRecord = step as Record<string, unknown>;
        const input = this.parseJson<Record<string, unknown>>(stepRecord.input) || {};
        Object.entries(input).forEach(([key, value]) => {
          if (properties[key]) {
            return;
          }

          let description = `Workflow 输入参数 ${key}`;
          if (key === 'city') {
            description = '城市名称';
          } else if (key === 'format') {
            description = '返回格式';
          } else if (key === 'timeout') {
            description = '超时时间';
          }

          properties[key] = {
            type: this.inferTemporalParamType(value, description),
            description,
            ...(inferredFromActivities[key]?.default !== undefined
              ? { default: inferredFromActivities[key].default }
              : key === 'timeout' && value !== undefined
                ? { default: value }
                : {}),
            ...(inferredFromActivities[key]?.required ? { required: true } : {}),
            extractionPrompt: description,
          };

          if (inferredFromActivities[key]?.required) {
            required.push(key);
          }
        });
      });
    }

    return { properties, required };
  }

  private inferTemporalParamsFromActivityDsl(
    activityDsl?: Record<string, unknown>,
  ): Record<string, { required: boolean; default?: unknown }> {
    const result: Record<string, { required: boolean; default?: unknown }> = {};
    const activities = Array.isArray(activityDsl?.activities) ? activityDsl.activities : [];

    activities.forEach((activity) => {
      if (!activity || typeof activity !== 'object') {
        return;
      }
      const record = activity as Record<string, unknown>;
      const config = this.parseJson<Record<string, unknown>>(record.config) || {};
      const configSteps = Array.isArray(config.steps) ? config.steps : [];

      configSteps.forEach((step) => {
        if (!step || typeof step !== 'object') {
          return;
        }
        const stepRecord = step as Record<string, unknown>;
        const inputParams = this.parseJson<Record<string, unknown>>(stepRecord.inputParams) || {};
        Object.entries(inputParams).forEach(([key, value]) => {
          if (result[key]?.required) {
            return;
          }
          result[key] = {
            required: result[key]?.required || false,
            default: value,
          };
        });
      });

      const generatedCode =
        typeof config.generatedCode === 'string'
          ? config.generatedCode
          : typeof record.generatedCode === 'string'
            ? record.generatedCode
            : '';

      if (!generatedCode.trim()) {
        return;
      }

      const getPattern =
        /input_data\.get\(\s*["']([A-Za-z0-9_]+)["'](?:\s*,\s*([^)]+))?\s*\)/g;
      let match: RegExpExecArray | null;
      while ((match = getPattern.exec(generatedCode))) {
        const [, key, defaultLiteral] = match;
        if (!key) {
          continue;
        }

        if (defaultLiteral === undefined) {
          result[key] = { required: true };
          continue;
        }

        if (result[key]?.required) {
          continue;
        }

        const normalizedDefault = defaultLiteral.trim();
        result[key] = {
          required: false,
          default: this.parsePythonLiteral(normalizedDefault),
        };
      }
    });

    return result;
  }

  private parsePythonLiteral(value: string): unknown {
    const normalized = value.trim();
    if (
      (normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith('\'') && normalized.endsWith('\''))
    ) {
      return normalized.slice(1, -1);
    }
    if (normalized === 'True') {
      return true;
    }
    if (normalized === 'False') {
      return false;
    }
    if (normalized === 'None') {
      return null;
    }
    if (/^-?\d+(\.\d+)?$/.test(normalized)) {
      return Number(normalized);
    }
    return normalized;
  }

  private buildSuggestedInputFromSchema(paramsSchema: Record<string, unknown>): Record<string, unknown> {
    const properties =
      paramsSchema && typeof paramsSchema === 'object'
        ? ((paramsSchema as Record<string, unknown>).properties as Record<string, unknown> | undefined)
        : undefined;
    if (!properties) {
      return {};
    }

    return Object.entries(properties).reduce<Record<string, unknown>>((acc, [key, rawValue]) => {
      const definition = rawValue && typeof rawValue === 'object'
        ? (rawValue as Record<string, unknown>)
        : {};
      if (definition.default !== undefined) {
        acc[key] = definition.default;
        return acc;
      }

      const type = typeof definition.type === 'string' ? definition.type : 'string';
      if (type === 'number') {
        acc[key] = 1;
      } else if (type === 'boolean') {
        acc[key] = true;
      } else if (type === 'array') {
        acc[key] = [];
      } else if (type === 'object') {
        acc[key] = {};
      } else {
        acc[key] = `test_${key}`;
      }

      return acc;
    }, {});
  }

  private buildSmokeTestInput(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    environment: string,
  ): Record<string, unknown> {
    const schema =
      release.sourceType === 'temporal_workflow'
        ? this.resolveEffectiveTemporalParamsSchema(snapshot.sourcePayload)
        : (this.parseJson(snapshot.sourcePayload.paramsSchema) as Record<string, unknown> | null) || {};

    return {
      ...this.buildSuggestedInputFromSchema(schema),
      smokeTest: true,
      environment,
    };
  }

  private inferTemporalParamType(
    defaultValue: unknown,
    description: string,
  ): 'string' | 'number' | 'date' | 'boolean' {
    if (typeof defaultValue === 'boolean') {
      return 'boolean';
    }
    if (typeof defaultValue === 'number') {
      return 'number';
    }
    if (typeof defaultValue === 'string') {
      const normalized = defaultValue.trim().toLowerCase();
      if (/^\d+[smh]$/.test(normalized)) {
        return 'string';
      }
      if (normalized === 'true' || normalized === 'false') {
        return 'boolean';
      }
      if (/^-?\d+(\.\d+)?$/.test(normalized)) {
        return 'number';
      }
      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
        return 'date';
      }
    }

    if (/日期|时间|date|time/i.test(description)) {
      return 'date';
    }
    if (/数量|金额|number|count|price|age/i.test(description)) {
      return 'number';
    }
    if (/是否|true|false|开关|启用/i.test(description)) {
      return 'boolean';
    }
    return 'string';
  }

  private buildTemporalExecutionFlowKeys(
    workflowName: string,
    workflowDsl: Record<string, unknown>,
    activityDsl: Record<string, unknown>,
  ): string[] {
    const candidates = new Set<string>();
    [workflowName, workflowDsl.name]
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .forEach((item) => candidates.add(item.trim()));

    const activities = Array.isArray(activityDsl.activities) ? activityDsl.activities : [];
    activities.forEach((activity) => {
      if (activity && typeof activity === 'object') {
        const record = activity as Record<string, unknown>;
        if (typeof record.name === 'string' && record.name.trim()) {
          candidates.add(record.name.trim());
        }
      }
    });

    return Array.from(candidates).slice(0, 10);
  }

  private buildTemporalWorkflowSteps(
    workflowDsl: Record<string, unknown>,
  ): Array<{ id?: string; name?: string; type?: string; activityName?: string }> {
    const steps = Array.isArray(workflowDsl.steps) ? workflowDsl.steps : [];
    return steps
      .filter((step): step is Record<string, unknown> => Boolean(step) && typeof step === 'object')
      .map((step) => ({
        id: typeof step.id === 'string' ? step.id : undefined,
        name: typeof step.name === 'string' ? step.name : undefined,
        type: typeof step.type === 'string' ? step.type : undefined,
        activityName: typeof step.activityName === 'string' ? step.activityName : undefined,
      }));
  }

  private buildTemporalSkillDescription(
    payload: Record<string, unknown>,
    baseName: string,
    _paramsSchema: Record<string, unknown>,
  ): string {
    const baseDescription = typeof payload.description === 'string' && this.sanitizeSkillNarrative(payload.description).trim()
      ? this.sanitizeSkillNarrative(payload.description).trim()
      : `${baseName} 自动生成技能`;
    return baseDescription;
  }

  private sanitizeSkillNarrative(value: string): string {
    const text = String(value || '').trim();
    if (!text) {
      return '';
    }

    const markers = [
      /\n\s*输入参数\s*[：:]/,
      /\n\s*参数定义\s*[：:]/,
      /\n\s*请求参数\s*[：:]/,
      /\n\s*必填参数\s*[：:]/,
      /\n\s*参数列表\s*[：:]/,
    ];

    let sliced = text;
    for (const marker of markers) {
      const match = sliced.match(marker);
      if (match?.index !== undefined) {
        sliced = sliced.slice(0, match.index).trim();
        break;
      }
    }

    return sliced
      .replace(/\s*\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  private buildSkillMatchSummary(
    payload: Record<string, unknown>,
    baseName: string,
    expectedResult?: string,
  ): string {
    const parts: string[] = [];
    const description = typeof payload.description === 'string'
      ? this.sanitizeSkillNarrative(payload.description).trim()
      : '';
    const goal = typeof payload.goal === 'string'
      ? this.sanitizeSkillNarrative(payload.goal).trim()
      : '';
    const normalizedExpectedResult = typeof expectedResult === 'string'
      ? this.sanitizeSkillNarrative(expectedResult).trim()
      : '';

    if (description) {
      parts.push(description);
    } else {
      parts.push(`${baseName} 自动生成技能`);
    }

    if (
      normalizedExpectedResult
      && normalizedExpectedResult !== description
      && normalizedExpectedResult !== goal
      && normalizedExpectedResult.length <= 80
    ) {
      parts.push(`输出：${normalizedExpectedResult}`);
    }

    return parts.join('；').slice(0, 240);
  }

  private buildParamCollectionGuidance(
    paramsSchema: Record<string, unknown>,
  ): string | undefined {
    const schema = paramsSchema && typeof paramsSchema === 'object'
      ? paramsSchema as Record<string, unknown>
      : undefined;
    const properties = schema?.properties && typeof schema.properties === 'object'
      ? schema.properties as Record<string, unknown>
      : undefined;
    const required = Array.isArray(schema?.required)
      ? schema.required.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];

    if (!properties || Object.keys(properties).length === 0) {
      return undefined;
    }

    const orderedKeys = [
      ...required,
      ...Object.keys(properties).filter((key) => !required.includes(key)),
    ];

    const lines = orderedKeys.map((key) => {
      const definition = properties[key] && typeof properties[key] === 'object'
        ? properties[key] as Record<string, unknown>
        : {};
      const label = typeof definition.description === 'string' && definition.description.trim()
        ? definition.description.trim()
        : key;
      return `${key}: ${label}${required.includes(key) ? '（必填）' : '（可选）'}`;
    });

    return `收集参数时，请优先补齐以下信息：${lines.join('；')}`.slice(0, 600);
  }

  private buildValidationRules(
    payload: Record<string, unknown>,
  ): string | undefined {
    const goal = typeof payload.goal === 'string'
      ? this.sanitizeSkillNarrative(payload.goal).trim()
      : '';
    return goal || undefined;
  }

  private validateExecutionFlowPayload(payload: Record<string, unknown>) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const steps = Array.isArray(payload.steps) ? payload.steps : [];
    const paramsSchema = this.parseJson(payload.paramsSchema) as Record<string, unknown>;

    if (!payload.name || typeof payload.name !== 'string') {
      errors.push('模板名称不能为空');
    }
    if (steps.length === 0) {
      errors.push('至少需要一个流程步骤');
    }
    steps.forEach((step, index) => {
      const record = this.parseJson(step) as Record<string, unknown>;
      if (!record.name) {
        errors.push(`步骤 ${index + 1} 缺少名称`);
      }
      if (!record.type) {
        errors.push(`步骤 ${index + 1} 缺少类型`);
      }
      if (record.type === 'api' && !(record.api as Record<string, unknown> | undefined)?.endpoint) {
        errors.push(`步骤 ${index + 1} 的 API endpoint 不能为空`);
      }
    });
    if (!paramsSchema || typeof paramsSchema !== 'object') {
      warnings.push('未配置 paramsSchema，后续参数提取能力会受限');
    }

    const score = Math.max(0, 100 - errors.length * 20 - warnings.length * 5);
    return {
      isValid: errors.length === 0,
      score,
      errors,
      warnings,
    };
  }

  private buildSkillDraftPayload(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    validation: CapabilityValidationDTO,
  ) {
    const payload = snapshot.sourcePayload;
    const baseName = this.extractSourceName(payload) || `Release-${release.releaseVersion}`;
    const rawParamsSchema = this.parseJson(payload.paramsSchema) as Record<string, unknown> | null;
    const paramsSchema =
      release.sourceType === 'temporal_workflow'
        ? this.resolveEffectiveTemporalParamsSchema(payload)
        : rawParamsSchema && typeof rawParamsSchema === 'object'
          ? rawParamsSchema
          : {};
    const workflowDsl = this.parseJson(payload.workflowDsl) as Record<string, unknown> || {};
    const outputParams = this.parseJson(payload.outputParams) as Record<string, unknown> | null;
    const resolvedOutputParams = outputParams && Object.keys(outputParams).length > 0
      ? outputParams
      : this.buildTemporalOutputParamsFromValidation(validation);
    const expectedResult = typeof payload.expectedResult === 'string' && payload.expectedResult.trim()
      ? payload.expectedResult.trim()
      : this.extractTemporalExpectedResult({
        ...workflowDsl,
        outputParams: resolvedOutputParams,
      }) || undefined;
    const workflowSteps = Array.isArray(payload.workflowSteps)
      ? payload.workflowSteps
      : this.buildTemporalWorkflowSteps(workflowDsl);
    const executionFlowKeys = Array.isArray(payload.executionFlowKeys)
      ? payload.executionFlowKeys.filter((item): item is string => typeof item === 'string')
      : [];
    const description = release.sourceType === 'temporal_workflow'
      ? this.buildTemporalSkillDescription(payload, baseName, paramsSchema || { properties: {}, required: [] })
      : this.sanitizeSkillNarrative(String(payload.description || payload.goal || `${baseName} 自动生成技能`));
    const matchSummary = this.buildSkillMatchSummary(payload, baseName, expectedResult);
    const paramCollectionGuidance = this.buildParamCollectionGuidance(paramsSchema || {});
    const validationRules = this.buildValidationRules(payload);

    const finalDescription = description.length > 500 ? description.slice(0, 497) + '...' : description;

    if (release.sourceType === 'execution_flow_template') {
      return {
        name: baseName.replace(/流程$/, ''),
        description: finalDescription,
        triggerKeywords: executionFlowKeys.length > 0 ? executionFlowKeys : [baseName],
        paramsSchema: paramsSchema || { properties: {}, required: [] },
        executionFlowTemplateIds: release.sourceId ? [release.sourceId] : [],
        tools: ['skill_match', 'flow_execute'],
        apiEndpoints: {
          runtimeMetadata: {
            sourceType: 'execution_flow_template',
            sourceTemplate: this.extractExecutionFlowSourceTemplate(payload),
            goal: typeof payload.goal === 'string' ? payload.goal : undefined,
            expectedResult,
            outputParams: resolvedOutputParams || {},
            matchSummary,
            paramCollectionGuidance,
            validationRules,
          },
        },
        validationId: validation.id,
      };
    }

    return {
      name: baseName.replace(/工作流$/, ''),
      description: finalDescription,
      triggerKeywords: executionFlowKeys.length > 0 ? executionFlowKeys : [baseName],
      paramsSchema: paramsSchema || { properties: {}, required: [] },
      executionFlowTemplateIds: [],
      tools: ['skill_match', 'flow_execute'],
      apiEndpoints: {
        runtimeMetadata: {
          matchSummary,
          paramCollectionGuidance,
          validationRules,
          sourceType: 'temporal_workflow',
          sourceTemplate: this.extractTemporalSourceTemplate(
            this.parseJson(payload.workflowDsl) as Record<string, unknown> || {},
            this.parseJson(payload.activityDsl) as Record<string, unknown> || {},
          ),
          goal: typeof payload.goal === 'string' ? payload.goal : undefined,
          expectedResult,
          outputParams: resolvedOutputParams || {},
          taskQueue: typeof payload.taskQueue === 'string' ? payload.taskQueue : undefined,
          workflowSteps,
        },
      },
      validationId: validation.id,
    };
  }

  private extractTemporalSourceTemplate(
    workflowDsl: Record<string, unknown>,
    activityDsl: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const workflowSource = this.parseJson<Record<string, unknown>>(workflowDsl.sourceTemplate) || {};
    const activities = Array.isArray(activityDsl.activities) ? activityDsl.activities as Array<Record<string, unknown>> : [];
    const carboneActivity = activities.find((activity) => {
      if (activity?.handler === 'carbone') {
        return true;
      }
      const config = activity?.config && typeof activity.config === 'object'
        ? activity.config as Record<string, unknown>
        : {};
      const steps = Array.isArray(config.steps) ? config.steps as Array<Record<string, unknown>> : [];
      return steps.some((step) => step?.type === 'carbone');
    });
    const carboneConfig = carboneActivity?.config && typeof carboneActivity.config === 'object'
      ? carboneActivity.config as Record<string, unknown>
      : {};
    const carboneSteps = Array.isArray(carboneConfig.steps) ? carboneConfig.steps as Array<Record<string, unknown>> : [];
    const carboneStep = carboneSteps.find((step) => step?.type === 'carbone');
    const carboneStepConfig = carboneStep?.config && typeof carboneStep.config === 'object'
      ? carboneStep.config as Record<string, unknown>
      : {};
    const inputParams = this.parseJson<Record<string, unknown>>(workflowDsl.inputParams) || {};

    const sourceTemplate = {
      templateId: this.pickFirstNonEmptyString(workflowSource.templateId, carboneStepConfig.templateId, carboneConfig.templateId),
      skillId: this.pickFirstNonEmptyString(workflowSource.skillId, carboneConfig.skillId),
      fileName: this.pickFirstNonEmptyString(workflowSource.fileName, carboneConfig.fileName),
      format: this.pickFirstNonEmptyString(workflowSource.format, carboneStepConfig.format, carboneConfig.format),
      variableCount: this.pickFirstPositiveNumber(
        workflowSource.variableCount,
        carboneConfig.variableCount,
        Object.keys(inputParams).length,
      ),
    };

    if (!sourceTemplate.templateId && !sourceTemplate.skillId && !sourceTemplate.fileName) {
      return undefined;
    }

    return sourceTemplate;
  }

  private extractExecutionFlowSourceTemplate(
    payload: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const declaredSourceTemplate = this.parseJson<Record<string, unknown>>(payload.sourceTemplate) || {};
    const steps = this.parseJson<Array<Record<string, unknown>>>(payload.steps) || [];
    const paramsSchema = this.parseJson<Record<string, unknown>>(payload.paramsSchema) || {};
    const paramsProperties =
      paramsSchema.properties && typeof paramsSchema.properties === 'object'
        ? (paramsSchema.properties as Record<string, unknown>)
        : paramsSchema;
    const renderStep = steps.find((step) => {
      const api = step?.api && typeof step.api === 'object'
        ? step.api as Record<string, unknown>
        : {};
      return typeof api.endpoint === 'string' && api.endpoint.includes('/api/carbone/render');
    });
    const renderApi = renderStep?.api && typeof renderStep.api === 'object'
      ? renderStep.api as Record<string, unknown>
      : {};
    const renderBody = renderApi.body && typeof renderApi.body === 'object'
      ? renderApi.body as Record<string, unknown>
      : {};

    const sourceTemplate = {
      templateId: this.pickFirstNonEmptyString(
        declaredSourceTemplate.templateId,
        payload.templateId,
        payload.template_id,
        renderBody.templateId,
        renderBody.template_id,
      ),
      skillId: this.pickFirstNonEmptyString(
        declaredSourceTemplate.skillId,
        payload.skillId,
        payload.skill_id,
        renderBody.skillId,
        renderBody.skill_id,
      ),
      fileName: this.pickFirstNonEmptyString(
        declaredSourceTemplate.fileName,
        payload.fileName,
        payload.file_name,
        renderBody.fileName,
        renderBody.file_name,
      ),
      format: this.pickFirstNonEmptyString(
        declaredSourceTemplate.format,
        payload.outputFormat,
        payload.output_format,
        payload.format,
        renderBody.outputFormat,
        renderBody.output_format,
        renderBody.format,
      ),
      variableCount: this.pickFirstPositiveNumber(
        declaredSourceTemplate.variableCount,
        Object.keys(paramsProperties).length,
      ),
    };

    const isDocumentCategory = typeof payload.category === 'string' && payload.category === 'document';
    if (
      !sourceTemplate.templateId
      && !sourceTemplate.skillId
      && !sourceTemplate.fileName
      && !isDocumentCategory
    ) {
      return undefined;
    }

    return sourceTemplate;
  }

  private async executeDocumentPublishedSkill(
    release: CapabilityReleaseDTO,
    skillId: string,
    input: Record<string, unknown> | undefined,
    userId?: string,
    options?: {
      executionId?: string;
      stepId?: string;
      capabilityVersion?: string;
      runtimeType?: string;
    },
  ): Promise<ExecuteCapabilityRuntimeResultDTO> {
    const snapshot = await this.getCurrentSnapshotOrThrow(release);
    const sourceTemplate =
      this.parseJson<Record<string, unknown>>(snapshot.sourcePayload.sourceTemplate)
      || this.extractExecutionFlowSourceTemplate(snapshot.sourcePayload)
      || {};
    const renderInput = this.resolveDocumentRenderInput(input, sourceTemplate);
    const renderViaTemplateId = typeof renderInput.templateId === 'string' && renderInput.templateId.trim().length > 0;
    const url = renderViaTemplateId
      ? `${getCarboneServiceUrl()}/studio/render`
      : `${getCarboneServiceUrl()}/studio/render-with-skill`;
    const requestBody = renderViaTemplateId
      ? {
          templateId: renderInput.templateId,
          data: renderInput.data,
          outputFormat: renderInput.outputFormat,
        }
      : {
          skillId,
          params: renderInput.data,
          outputFormat: renderInput.outputFormat,
        };
    const logs = [
      `[DocumentRuntime] 调用文档运行时: ${renderViaTemplateId ? 'template_render' : 'skill_render'}`,
      `[DocumentRuntime] endpoint=${url}`,
      `[DocumentRuntime] publishedSkillId=${skillId}`,
      ...(renderViaTemplateId ? [`[DocumentRuntime] templateId=${renderInput.templateId}`] : []),
      ...(renderInput.outputFormat ? [`[DocumentRuntime] outputFormat=${renderInput.outputFormat}`] : []),
    ];

    try {
      const response = await axios.post<Record<string, unknown>>(url, requestBody, {
        timeout: 120000,
      });
      const responseData = response.data;
      const downloadUrl = extractDownloadUrl(responseData);
      
      const rawResult = (responseData !== undefined && responseData !== null)
        ? (typeof responseData === 'object' && !Array.isArray(responseData)
          ? (responseData as Record<string, unknown>)
          : { result: responseData })
        : {};

      const normalizedResult = {
        ...rawResult,
        ...(downloadUrl ? { downloadUrl } : {}),
        ...(renderViaTemplateId && renderInput.templateId ? { templateId: renderInput.templateId } : {}),
      };

      await this.insertAuditEvent(
        release.id,
        'skill_runtime_invoked',
        userId,
        true,
        `运行时调用 Document Skill 成功: ${skillId}`,
        {
          publishedSkillId: skillId,
          capabilityId: skillId,
          capabilityVersion: options?.capabilityVersion || null,
          runtime: 'document',
          requestedRuntimeType: options?.runtimeType || null,
          executionId: options?.executionId || null,
          stepId: options?.stepId || null,
          sourceTemplate,
          renderMode: renderViaTemplateId ? 'templateId' : 'published_skill',
        },
      );

      return {
        releaseId: release.id,
        capabilityId: skillId,
        capabilityVersion: options?.capabilityVersion || null,
        publishedSkillId: skillId,
        runtime: 'document',
        success: true,
        downloadUrl: downloadUrl || null,
        output: normalizedResult,
        result: normalizedResult,
        logs,
        error: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Document runtime execution failed';
      logs.push(`[DocumentRuntime][Error] ${message}`);

      await this.insertAuditEvent(
        release.id,
        'skill_runtime_invoked',
        userId,
        false,
        `运行时调用 Document Skill 失败: ${skillId}`,
        {
          publishedSkillId: skillId,
          capabilityId: skillId,
          capabilityVersion: options?.capabilityVersion || null,
          runtime: 'document',
          requestedRuntimeType: options?.runtimeType || null,
          executionId: options?.executionId || null,
          stepId: options?.stepId || null,
          sourceTemplate,
          renderMode: renderViaTemplateId ? 'templateId' : 'published_skill',
          error: message,
        },
      );

      return {
        releaseId: release.id,
        capabilityId: skillId,
        capabilityVersion: options?.capabilityVersion || null,
        publishedSkillId: skillId,
        runtime: 'document',
        success: false,
        downloadUrl: null,
        output: null,
        result: null,
        logs,
        error: message,
      };
    }
  }

  private resolveDocumentRenderInput(
    input: Record<string, unknown> | undefined,
    sourceTemplate: Record<string, unknown>,
  ): {
    templateId?: string;
    outputFormat?: string;
    data: Record<string, unknown>;
  } {
    const normalizedInput = input || {};
    const directData = asRecord(normalizedInput.data);
    const directParams = asRecord(normalizedInput.params);
    const data = directData || directParams || this.omitRuntimeEnvelopeFields(normalizedInput);

    return {
      templateId: this.pickFirstNonEmptyString(
        normalizedInput.templateId,
        normalizedInput.template_id,
        sourceTemplate.templateId,
      ),
      outputFormat: this.pickFirstNonEmptyString(
        normalizedInput.outputFormat,
        normalizedInput.output_format,
        normalizedInput.format,
        sourceTemplate.format,
      ),
      data,
    };
  }

  private omitRuntimeEnvelopeFields(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    const omittedKeys = new Set([
      'templateId',
      'template_id',
      'params',
      'data',
      'outputFormat',
      'output_format',
      'format',
      'outputName',
      'output_name',
      'action',
      'sourceTemplate',
    ]);

    return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, current]) => {
      if (!omittedKeys.has(key)) {
        acc[key] = current;
      }
      return acc;
    }, {});
  }

  private pickFirstNonEmptyString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private pickFirstPositiveNumber(...values: unknown[]): number | undefined {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value;
      }
    }
    return undefined;
  }

  private expectRecord(value: unknown, errorMessage: string): Record<string, unknown> {
    const record = this.parseJson(value);
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new BadRequestException(errorMessage);
    }
    return record as Record<string, unknown>;
  }

  private parseJson<T = unknown>(value: unknown): T {
    if (value === null || value === undefined) {
      return value as T;
    }
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    }
    return value as T;
  }

  private mapRelease(raw: any): CapabilityReleaseDTO {
    return {
      id: raw.id,
      sourceType: raw.source_type,
      sourceId: raw.source_id,
      sourceName: raw.source_name,
      sourceStatus: raw.source_status,
      releaseVersion: Number(raw.release_version || 1),
      status: raw.status,
      approvalStatus: raw.approval_status,
      deploymentStatus: raw.deployment_status,
      currentSourceSnapshotId: raw.current_source_snapshot_id,
      currentBuildId: raw.current_build_id,
      latestSuccessfulBuildId: raw.latest_successful_build_id,
      latestValidationId: raw.latest_validation_id,
      latestSuccessfulValidationId: raw.latest_successful_validation_id,
      currentSkillDraftId: raw.current_skill_draft_id,
      publishedSkillId: raw.published_skill_id,
      lastDeploymentId: raw.last_deployment_id,
      lastDeploymentEnvironment: raw.last_deployment_environment,
      rollbackOfReleaseId: raw.rollback_of_release_id,
      createdBy: raw.created_by,
      createdAt: this.toIsoString(raw.created_at),
      updatedAt: this.toIsoString(raw.updated_at),
    };
  }

  private mapSourceSnapshot(raw: any): CapabilitySourceSnapshotDTO {
    return {
      id: raw.id,
      releaseId: raw.release_id,
      snapshotVersion: Number(raw.snapshot_version || 1),
      sourceType: raw.source_type,
      sourceId: raw.source_id,
      sourcePayload: this.parseJson(raw.source_payload_json) || {},
      summary: raw.summary,
      createdBy: raw.created_by,
      createdAt: this.toIsoString(raw.created_at),
    };
  }

  private mapBuild(raw: any): CapabilityBuildDTO {
    return {
      id: raw.id,
      releaseId: raw.release_id,
      sourceSnapshotId: raw.source_snapshot_id,
      buildType: raw.build_type,
      modelId: raw.model_id,
      promptVersion: raw.prompt_version,
      inputSnapshot: this.parseJson(raw.input_snapshot_json) || {},
      generatedCode: raw.generated_code,
      generatedConfig: this.parseJson(raw.generated_config_json) || null,
      logs: this.parseJson<string[]>(raw.logs_json) || [],
      diffSummary: raw.diff_summary,
      status: raw.status,
      errorSummary: raw.error_summary,
      startedAt: raw.started_at ? this.toIsoString(raw.started_at) : null,
      finishedAt: raw.finished_at ? this.toIsoString(raw.finished_at) : null,
      createdBy: raw.created_by,
      createdAt: this.toIsoString(raw.created_at),
    };
  }

  private mapValidation(raw: any): CapabilityValidationDTO {
    return {
      id: raw.id,
      releaseId: raw.release_id,
      buildId: raw.build_id,
      validationType: raw.validation_type,
      inputSnapshot: this.parseJson(raw.input_snapshot_json) || null,
      resultSnapshot: this.parseJson(raw.result_snapshot_json) || null,
      logs: this.parseJson<string[]>(raw.logs_json) || [],
      score: Number(raw.score || 0),
      success: Boolean(raw.success),
      errorSummary: raw.error_summary,
      startedAt: raw.started_at ? this.toIsoString(raw.started_at) : null,
      finishedAt: raw.finished_at ? this.toIsoString(raw.finished_at) : null,
      createdBy: raw.created_by,
      createdAt: this.toIsoString(raw.created_at),
    };
  }

  private mapSkillDraft(raw: any): SkillDraftDTO {
    return {
      id: raw.id,
      releaseId: raw.release_id,
      generatedFromBuildId: raw.generated_from_build_id,
      generatedFromValidationId: raw.generated_from_validation_id,
      sourceType: raw.source_type,
      name: raw.name,
      description: raw.description,
      triggerKeywords: this.parseJson<string[]>(raw.trigger_keywords) || [],
      paramsSchema: this.parseJson(raw.params_schema) || {},
      executionFlowTemplateIds: this.parseJson<string[]>(raw.execution_flow_template_ids) || [],
      tools: this.parseJson<string[]>(raw.tools) || [],
      apiEndpoints: this.parseJson(raw.api_endpoints) || null,
      draftPayload: this.parseJson(raw.draft_payload_json) || {},
      status: raw.status,
      createdBy: raw.created_by,
      createdAt: this.toIsoString(raw.created_at),
      updatedAt: this.toIsoString(raw.updated_at),
    };
  }

  private mapDeployment(raw: any): DeploymentRecordDTO {
    return {
      id: raw.id,
      releaseId: raw.release_id,
      publishedSkillId: raw.published_skill_id,
      environment: raw.environment,
      runtimeType: raw.runtime_type,
      artifactUri: raw.artifact_uri,
      artifactHash: raw.artifact_hash,
      workerVersion: raw.worker_version,
      reloadStrategy: raw.reload_strategy,
      requestPayload: this.parseJson(raw.request_payload_json) || null,
      resultSnapshot: this.parseJson(raw.result_snapshot_json) || null,
      logs: this.parseJson<string[]>(raw.logs_json) || [],
      status: raw.status,
      success: Boolean(raw.success),
      smokeValidationId: raw.smoke_validation_id,
      rollbackTargetReleaseId: raw.rollback_target_release_id,
      startedAt: raw.started_at ? this.toIsoString(raw.started_at) : null,
      finishedAt: raw.finished_at ? this.toIsoString(raw.finished_at) : null,
      createdBy: raw.created_by,
      createdAt: this.toIsoString(raw.created_at),
    };
  }

  private mapAuditEvent(raw: any): ReleaseAuditEventDTO {
    return {
      id: raw.id,
      releaseId: raw.release_id,
      eventType: raw.event_type,
      actorId: raw.actor_id,
      actorName: raw.actor_name,
      success: Boolean(raw.success),
      summary: raw.summary,
      details: this.parseJson(raw.details_json) || null,
      createdAt: this.toIsoString(raw.created_at),
    };
  }

  private toIsoString(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return new Date(String(value)).toISOString();
  }
}
