import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  ReleaseManagerPrismaPort,
  ReleaseManagerSkillServicePort,
  ReleaseManagerTemporalWorkflowPort,
} from '../platform-runtime.ports';
import {
  RELEASE_MANAGER_PRISMA,
  RELEASE_MANAGER_SKILL_SERVICE,
  RELEASE_MANAGER_TEMPORAL_WORKFLOW,
} from '../platform-runtime.tokens';
import { CAPABILITY_RELEASE_ERROR_CODE } from '../capability-release.constants';
import { CapabilityReleaseDeploymentSmokeService } from './capability-release-deployment-smoke.service';
import { mapCapabilityDeployment } from '../capability-release.mapper';
import {
  CapabilityBuildDTO,
  CapabilityDeploymentRuntimeType,
  CapabilityDeploymentStatus,
  CapabilityReleaseDTO,
  CapabilitySourceSnapshotDTO,
  DeployCapabilityReleaseDTO,
  DeploymentRecordDTO,
  RollbackCapabilityReleaseDTO,
  SkillDraftDTO,
} from '../interfaces';

function createBadRequestException(response: string | Record<string, unknown>): BadRequestException {
  return new BadRequestException(response);
}

function createNotFoundException(response: string | Record<string, unknown>): NotFoundException {
  return new NotFoundException(response);
}


export interface CapabilityReleaseDeploymentAccessors {
  getReleaseOrThrow(id: string): Promise<CapabilityReleaseDTO>;
  getCurrentSnapshotOrThrow(release: CapabilityReleaseDTO): Promise<CapabilitySourceSnapshotDTO>;
  getBuildOrThrow(id: string): Promise<CapabilityBuildDTO>;
  getDeploymentOrThrow(id: string): Promise<DeploymentRecordDTO>;
  getSkillDraftOrThrow(id: string): Promise<SkillDraftDTO>;
  resolveTemporalExecutableBuildOrThrow(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    buildId: string | undefined,
    userId?: string
  ): Promise<CapabilityBuildDTO>;
  resolveWorkflowFnOrThrow(payload: Record<string, unknown>): string;
  insertAuditEvent(
    releaseId: string,
    eventType: string,
    actorId: string | undefined,
    success: boolean,
    summary: string,
    details?: Record<string, unknown>
  ): Promise<void>;
}

@Injectable()
export class CapabilityReleaseDeploymentService {
  constructor(
    @Inject(RELEASE_MANAGER_PRISMA) private readonly prisma: ReleaseManagerPrismaPort,
    @Inject(RELEASE_MANAGER_TEMPORAL_WORKFLOW)
    private readonly temporalWorkflowService: ReleaseManagerTemporalWorkflowPort,
    @Inject(RELEASE_MANAGER_SKILL_SERVICE)
    private readonly skillService: ReleaseManagerSkillServicePort,
    private readonly capabilityReleaseDeploymentSmokeService: CapabilityReleaseDeploymentSmokeService
  ) {}

  async deploy(
    id: string,
    dto: DeployCapabilityReleaseDTO,
    userId: string | undefined,
    accessors: CapabilityReleaseDeploymentAccessors
  ): Promise<{ release: CapabilityReleaseDTO; deployment: DeploymentRecordDTO }> {
    const release = await accessors.getReleaseOrThrow(id);
    if (release.status === 'deploying') {
      throw createBadRequestException({
        code: CAPABILITY_RELEASE_ERROR_CODE.RELEASE_DEPLOYING,
        message: '当前 Release 正在部署中',
      });
    }

    const deploymentId = randomUUID();
    const environment = dto.environment || 'staging';
    const snapshot = await accessors.getCurrentSnapshotOrThrow(release);
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
        preResolvedTemporalBuild = await accessors.resolveTemporalExecutableBuildOrThrow(
          release,
          snapshot,
          undefined,
          userId
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : '当前 Release 缺少可执行代码';
        throw createBadRequestException({
          code: CAPABILITY_RELEASE_ERROR_CODE.TEMPORAL_BUILD_NOT_EXECUTABLE,
          message: `${message}。请先在 Workflow 页面完成“生成并保存代码”与“端到端验证”，再重新部署。`,
        });
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
      JSON.stringify({
        environment,
        strategy,
        deploymentProfile,
        configOverrides,
        effectiveConfig,
      }),
      userId || null
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET status = 'deploying',
           deployment_status = 'deploying',
           last_deployment_id = $2::uuid,
           updated_at = now()
       WHERE id = $1::uuid`,
      id,
      deploymentId
    );

    await accessors.insertAuditEvent(
      id,
      'deployment_started',
      userId,
      true,
      `开始部署到 ${environment}`
    );

    try {
      const logs: string[] = [];
      let artifactUri: string | null = null;
      let artifactHash: string | null = null;
      let workerVersion: string | null = null;
      let resultSnapshot: Record<string, unknown> | null = null;
      let smokeValidationId: string | null = null;
      let deploymentBuild: CapabilityBuildDTO | null = null;

      if (release.sourceType === 'temporal_workflow') {
        const build =
          preResolvedTemporalBuild ||
          (await accessors.resolveTemporalExecutableBuildOrThrow(
            release,
            snapshot,
            undefined,
            userId
          ));
        deploymentBuild = build;
        const workflowArtifactRef = this.resolveWorkflowArtifactRef(
          snapshot.sourcePayload,
          release.sourceId || snapshot.sourceId || null
        );
        if (!workflowArtifactRef?.workflowId) {
          throw new Error('当前 Release 未绑定 Workflow artifact，无法部署');
        }
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

        const deployedWorkflowRef = (await this.temporalWorkflowService.deploy(
          workflowArtifactRef.workflowId
        )) as any;
        logs.push('Workflow artifact resolved and deployed');
        logs.push(`Temporal workflow deployed: ${deployedWorkflowRef.id}`);
        logs.push(`Task queue: ${deployedWorkflowRef.taskQueue}`);
        artifactUri = `temporal-workflow://${deployedWorkflowRef.id}`;
        artifactHash =
          workflowArtifactRef.artifactHash || this.extractArtifactHashFromBuild(build) || null;
        workerVersion = workflowArtifactRef.artifactVersion
          ? `artifact:${workflowArtifactRef.artifactVersion}`
          : artifactHash;
        resultSnapshot = {
          workflowId: deployedWorkflowRef.id,
          workflowArtifactRef,
          taskQueue: deployedWorkflowRef.taskQueue,
          deployedAt: deployedWorkflowRef.deployedAt?.toISOString?.() || null,
          generatedFromBuildId: build.id,
          targetService: 'ops-temporal',
          environment,
          strategy,
          deploymentProfile,
          effectiveConfig,
          workerReloadRequested,
        };
      } else {
        deploymentBuild =
          await this.capabilityReleaseDeploymentSmokeService.resolveBuildForDeployment(
            release,
            snapshot,
            undefined,
            userId,
            accessors
          );
        const templateId = this.resolveExecutionTemplateIdForRuntime(release, snapshot);
        logs.push(`Environment: ${environment}`);
        logs.push(`Strategy: ${strategy}`);
        if (Object.keys(deploymentProfile).length > 0) {
          logs.push(`Deployment profile loaded for ${environment}`);
        }
        if (Object.keys(configOverrides).length > 0) {
          logs.push(`Deployment overrides applied: ${JSON.stringify(configOverrides)}`);
        }
        logs.push('模板/浏览器能力无需独立 Worker 部署，已完成运行配置下发并进入 smoke test');
        if (release.publishedSkillId) {
          logs.push(`当前绑定已发布 Skill: ${release.publishedSkillId}`);
        } else {
          logs.push('当前尚未发布 Skill，本次部署用于验证运行链路与参数，不影响线上 Skill 路由');
        }
        artifactUri = release.publishedSkillId
          ? `skill-config://${release.publishedSkillId}`
          : templateId
            ? `template-runtime://${templateId}`
            : `release-runtime://${release.id}`;
        artifactHash = release.publishedSkillId || templateId || release.id;
        resultSnapshot = {
          publishedSkillId: release.publishedSkillId,
          mode: 'skill_config_activation',
          prePublishDeploy: !release.publishedSkillId,
          sourceTemplateId: templateId,
          environment,
          strategy,
          deploymentProfile,
          effectiveConfig,
        };
      }

      if (deploymentBuild) {
        logs.push(`[Smoke] 开始执行部署后验证 (${environment})`);
        const smokeResult =
          await this.capabilityReleaseDeploymentSmokeService.runPostDeploySmokeTest(
            release,
            snapshot,
            deploymentBuild,
            deploymentId,
            environment,
            userId,
            accessors
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
        null
      );
      await accessors.insertAuditEvent(
        id,
        'deployment_succeeded',
        userId,
        true,
        `部署成功 (${environment})`
      );

      return {
        release: await accessors.getReleaseOrThrow(id),
        deployment: await accessors.getDeploymentOrThrow(deploymentId),
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
        null
      );
      await accessors.insertAuditEvent(
        id,
        'deployment_failed',
        userId,
        false,
        `部署失败: ${message}`
      );
      throw createBadRequestException(message);
    }
  }

  async getDeployments(
    id: string,
    accessors: CapabilityReleaseDeploymentAccessors
  ): Promise<DeploymentRecordDTO[]> {
    await accessors.getReleaseOrThrow(id);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT *
       FROM deployment_records
       WHERE release_id = $1::uuid
       ORDER BY created_at DESC`,
      id
    );
    return rows.map((row) => mapCapabilityDeployment(row));
  }

  async rollback(
    id: string,
    dto: RollbackCapabilityReleaseDTO,
    userId: string | undefined,
    accessors: CapabilityReleaseDeploymentAccessors
  ): Promise<{
    release: CapabilityReleaseDTO;
    deployment: DeploymentRecordDTO;
    targetReleaseId: string;
  }> {
    const release = await accessors.getReleaseOrThrow(id);
    const targetRelease = await this.getRollbackTargetOrThrow(
      release,
      dto.targetReleaseId,
      accessors
    );
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
      userId || null
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET status = 'deploying',
           deployment_status = 'deploying',
           last_deployment_id = $2::uuid,
           updated_at = now()
       WHERE id = $1::uuid`,
      id,
      deploymentId
    );

    await accessors.insertAuditEvent(
      id,
      'rollback_started',
      userId,
      true,
      `开始回滚到 Release ${targetRelease.id}`,
      { targetReleaseId: targetRelease.id, reason: dto.reason || null }
    );

    try {
      const logs: string[] = [];
      let restoredSkillId = targetRelease.publishedSkillId || null;
      let resultSnapshot: Record<string, unknown> | null = null;

      if (targetRelease.currentSkillDraftId) {
        const targetDraft = await accessors.getSkillDraftOrThrow(targetRelease.currentSkillDraftId);
        if (release.publishedSkillId) {
          const updated = await this.skillService.updateSkill(
            release.publishedSkillId,
            targetDraft.draftPayload as any
          );
          restoredSkillId = updated?.id || release.publishedSkillId;
        } else if (targetRelease.publishedSkillId) {
          const updated = await this.skillService.updateSkill(
            targetRelease.publishedSkillId,
            targetDraft.draftPayload as any
          );
          restoredSkillId = updated?.id || targetRelease.publishedSkillId;
        } else {
          const created = await this.skillService.createSkill(targetDraft.draftPayload as any);
          restoredSkillId = created.id;
        }
        logs.push(`Skill configuration rolled back using draft ${targetDraft.id}`);
      }

      if (release.sourceType === 'temporal_workflow') {
        const targetSnapshot = await accessors.getCurrentSnapshotOrThrow(targetRelease);
        const targetBuild = await accessors.resolveTemporalExecutableBuildOrThrow(
          targetRelease,
          targetSnapshot,
          undefined,
          userId
        );
        const workflowArtifactRef = this.resolveWorkflowArtifactRef(
          targetSnapshot.sourcePayload,
          targetRelease.sourceId || targetSnapshot.sourceId || null
        );
        if (!workflowArtifactRef?.workflowId) {
          throw new Error('目标 Release 缺少可回滚的 Workflow artifact');
        }
        await this.temporalWorkflowService.deploy(workflowArtifactRef.workflowId);
        logs.push('Workflow artifact restored to deployment target');
        logs.push(`Temporal workflow rolled back to build ${targetBuild.id}`);
        resultSnapshot = {
          workflowArtifactRef,
          workflowId: workflowArtifactRef.workflowId,
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
        targetRelease.id
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
        targetRelease.id
      );
      await accessors.insertAuditEvent(
        id,
        'rollback_succeeded',
        userId,
        true,
        `已回滚到 Release ${targetRelease.id}`,
        { targetReleaseId: targetRelease.id, restoredSkillId }
      );

      return {
        release: await accessors.getReleaseOrThrow(id),
        deployment: await accessors.getDeploymentOrThrow(deploymentId),
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
        targetRelease.id
      );
      await accessors.insertAuditEvent(
        id,
        'rollback_failed',
        userId,
        false,
        `回滚失败: ${message}`
      );
      throw createBadRequestException(message);
    }
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
    rollbackTargetReleaseId: string | null
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
      rollbackTargetReleaseId
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
      deploymentId
    );
  }

  private resolveExecutionTemplateIdForRuntime(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO
  ): string | null {
    if (release.sourceType === 'temporal_workflow') {
      return null;
    }
    if (release.sourceId && release.sourceId.trim()) {
      return release.sourceId.trim();
    }
    const payload =
      snapshot.sourcePayload && typeof snapshot.sourcePayload === 'object'
        ? (snapshot.sourcePayload as Record<string, unknown>)
        : {};
    const sourceTemplate =
      payload.sourceTemplate && typeof payload.sourceTemplate === 'object'
        ? (payload.sourceTemplate as Record<string, unknown>)
        : {};
    const fromTemplate = sourceTemplate.templateId;
    if (typeof fromTemplate === 'string' && fromTemplate.trim()) {
      return fromTemplate.trim();
    }
    const fromPayloadId = payload.id;
    if (typeof fromPayloadId === 'string' && fromPayloadId.trim()) {
      return fromPayloadId.trim();
    }
    return null;
  }

  private resolveWorkflowArtifactRef(
    sourcePayload: Record<string, unknown>,
    fallbackWorkflowId?: string | null
  ): { workflowId: string; artifactVersion?: number | null; artifactHash?: string | null } | null {
    const directRef = sourcePayload.workflowArtifactRef;
    if (directRef && typeof directRef === 'object') {
      const record = directRef as Record<string, unknown>;
      const workflowId = typeof record.workflowId === 'string' ? record.workflowId.trim() : '';
      if (workflowId) {
        return {
          workflowId,
          artifactVersion:
            typeof record.artifactVersion === 'number' ? record.artifactVersion : null,
          artifactHash: typeof record.artifactHash === 'string' ? record.artifactHash : null,
        };
      }
    }

    const workflowId =
      typeof sourcePayload.id === 'string' && sourcePayload.id.trim()
        ? sourcePayload.id.trim()
        : typeof fallbackWorkflowId === 'string' && fallbackWorkflowId.trim()
          ? fallbackWorkflowId.trim()
          : '';
    if (!workflowId) {
      return null;
    }
    return {
      workflowId,
      artifactVersion:
        typeof sourcePayload.artifactVersion === 'number' ? sourcePayload.artifactVersion : null,
      artifactHash:
        typeof sourcePayload.artifactHash === 'string' ? sourcePayload.artifactHash : null,
    };
  }

  private extractArtifactHashFromBuild(build: CapabilityBuildDTO): string | null {
    const workflowArtifactRef = build.generatedConfig?.workflowArtifactRef;
    if (!workflowArtifactRef || typeof workflowArtifactRef !== 'object') {
      return null;
    }
    return typeof (workflowArtifactRef as Record<string, unknown>).artifactHash === 'string'
      ? ((workflowArtifactRef as Record<string, unknown>).artifactHash as string)
      : null;
  }

  private async getRollbackTargetOrThrow(
    release: CapabilityReleaseDTO,
    targetReleaseId: string | undefined,
    accessors: CapabilityReleaseDeploymentAccessors
  ): Promise<CapabilityReleaseDTO> {
    if (targetReleaseId) {
      const target = await accessors.getReleaseOrThrow(targetReleaseId);
      if (target.id === release.id) {
        throw createBadRequestException({
          code: CAPABILITY_RELEASE_ERROR_CODE.ROLLBACK_TARGET_SAME_RELEASE,
          message: '不能回滚到当前 Release 自身',
        });
      }
      return target;
    }

    if (!release.sourceId && !release.sourceName) {
      throw createBadRequestException({
        code: CAPABILITY_RELEASE_ERROR_CODE.ROLLBACK_SOURCE_IDENTIFIER_MISSING,
        message: '当前 Release 缺少可用于推断回滚目标的源标识',
      });
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
      release.sourceName || null
    );

    if (!rows[0]) {
      throw createNotFoundException({
        code: CAPABILITY_RELEASE_ERROR_CODE.ROLLBACK_TARGET_RELEASE_NOT_FOUND,
        message: '未找到可回滚的目标 Release',
      });
    }

    return accessors.getReleaseOrThrow(rows[0].id);
  }

  private resolveDeploymentProfile(
    sourcePayload: Record<string, unknown>,
    environment: string
  ): Record<string, unknown> {
    const profiles =
      sourcePayload.deploymentProfiles && typeof sourcePayload.deploymentProfiles === 'object'
        ? (sourcePayload.deploymentProfiles as Record<string, unknown>)
        : {};

    return profiles[environment] && typeof profiles[environment] === 'object'
      ? (profiles[environment] as Record<string, unknown>)
      : {};
  }
}
