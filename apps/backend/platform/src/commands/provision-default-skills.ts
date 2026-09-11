#!/usr/bin/env npx ts-node
/**
 * Provision Default Skills CLI
 * 
 * This script provisions the default skills (including markdown_artifact_writer)
 * with proper Release records, source snapshots, deployment records, and audit events.
 * 
 * Per design doc, this should be run explicitly rather than auto-provisioned on startup.
 * 
 * Usage:
 *   npx ts-node src/commands/provision-default-skills.ts
 *   
 * Environment variables:
 *   DATABASE_URL - PostgreSQL connection string (required)
 */

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';

const logger = new Logger('ProvisionDefaultSkills');

interface DefaultSkill {
  name: string;
  description: string;
  triggerKeywords: string[];
  paramsSchema: any;
  tools?: string[];
  executionFlow?: any[];
  apiEndpoints?: {
    runtimeMetadata?: {
      runtimeType: string;
      templateFormat?: string;
      supportsArtifact?: boolean;
      outputParams?: Record<string, string>;
    };
  };
}

const DEFAULT_SKILLS: DefaultSkill[] = [
  {
    name: 'general_document_generator',
    description: '通用文档生成技能 - 根据模板和参数生成 Office 文档',
    triggerKeywords: ['生成文档', '创建报告', '导出Word', '生成Excel'],
    paramsSchema: {
      properties: {
        templateName: { type: 'string', description: '模板名称', required: true },
        title: { type: 'string', description: '文档标题', required: true },
        content: { type: 'string', description: '文档主要内容', required: true },
      },
      required: ['templateName', 'title'],
    },
    tools: ['document_render'],
    executionFlow: [
      {
        id: 'step1',
        name: '渲染文档',
        type: 'tool',
        tool: { name: 'document_render' },
      },
    ],
  },
  {
    name: 'system_status_checker',
    description: '系统状态检查 - 检查当前自动化服务的健康状态',
    triggerKeywords: ['系统状态', '服务检查', '健康检查', 'status'],
    paramsSchema: {
      properties: {
        serviceName: { type: 'string', description: '指定检查的服务名称（可选）', required: false },
      },
      required: [],
    },
    tools: ['api_call'],
    executionFlow: [
      {
        id: 'step1',
        name: '检查健康状态',
        type: 'api',
        api: { url: '/health', method: 'GET', description: '调用健康检查接口' },
      },
    ],
  },
  {
    name: 'markdown_artifact_writer',
    description: 'Markdown 文档写入技能 - 将结构化 Markdown 写入受控文件产物',
    triggerKeywords: ['生成 md 文件', '输出 Markdown', '写入 md', '保存 Markdown', '输出 md', '生成md'],
    paramsSchema: {
      properties: {
        content: { type: 'string', description: 'Markdown 正文内容', required: true },
        fileName: { type: 'string', description: '目标文件名', required: false },
      },
      required: ['content'],
    },
    tools: ['document_render'],
    apiEndpoints: {
      runtimeMetadata: {
        runtimeType: 'document_markdown_writer',
        templateFormat: 'markdown',
        supportsArtifact: true,
        outputParams: { artifact: 'artifact_ref' },
      },
    },
    executionFlow: [
      {
        id: 'step1',
        name: '写入 Markdown 文件',
        type: 'document_markdown_writer',
      },
    ],
  },
];

/**
 * Result of checking an existing release's completeness.
 * - found: an un-archived release exists for this skill
 * - releaseId: the release id (if found)
 * - complete: the release has all required records in correct status
 */
interface ExistingReleaseCheck {
  found: boolean;
  releaseId: string | null;
  hasSnapshot: boolean;
  hasDeployment: boolean;
  deploymentOk: boolean;
  hasAudit: boolean;
}

/**
 * Check if a skill already has complete release records.
 * Returns detailed info about what exists and what's missing.
 * Queries are ordered by created_at DESC to pick the most recent release.
 */
async function checkExistingRelease(
  prisma: PrismaService,
  skillId: string,
): Promise<ExistingReleaseCheck> {
  const releases = await prisma.$queryRawUnsafe<any[]>(
    `SELECT r.id, r.status, r.deployment_status,
            r.current_source_snapshot_id, r.last_deployment_id
     FROM capability_releases r
     WHERE (r.published_skill_id = $1::uuid OR r.source_id = $1::uuid)
       AND r.archived_at IS NULL
     ORDER BY r.created_at DESC
     LIMIT 1`,
    skillId
  );

  if (!releases || releases.length === 0) {
    return { found: false, releaseId: null, hasSnapshot: false, hasDeployment: false, deploymentOk: false, hasAudit: false };
  }

  const rel = releases[0];

  let hasSnapshot = false;
  if (rel.current_source_snapshot_id) {
    const snapshots = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM capability_source_snapshots WHERE id = $1::uuid AND release_id = $2::uuid LIMIT 1`,
      rel.current_source_snapshot_id,
      rel.id
    );
    hasSnapshot = snapshots && snapshots.length > 0;
  }

  const deployments = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, status, success FROM deployment_records
     WHERE release_id = $1::uuid
     ORDER BY created_at DESC LIMIT 1`,
    rel.id
  );
  const hasDeployment = deployments && deployments.length > 0;
  const deploymentOk = hasDeployment && deployments[0].status === 'deployed' && deployments[0].success === true;

  const auditEvents = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id FROM release_audit_events WHERE release_id = $1::uuid LIMIT 1`,
    rel.id
  );
  const hasAudit = auditEvents && auditEvents.length > 0;

  return {
    found: true,
    releaseId: rel.id,
    hasSnapshot,
    hasDeployment,
    deploymentOk,
    hasAudit,
  };
}

/**
 * Ensure skill permissions exist for all roles.
 * This is idempotent via upsert and runs outside the release transaction
 * (permissions are a separate concern from release state).
 * Returns the number of roles that failed to converge.
 */
async function convergeReleasePermissions(prisma: PrismaService, skillId: string): Promise<number> {
  const roles = await prisma.role.findMany({ select: { id: true } });
  let failures = 0;
  for (const role of roles) {
    try {
      await prisma.skillPermission.upsert({
        where: { skillId_roleId: { skillId, roleId: role.id } },
        update: {},
        create: { skillId, roleId: role.id, grantedBy: 'system' },
      });
    } catch (err: any) {
      logger.warn(`Failed to create permission for role ${role.id}: ${err.message}`);
      failures++;
    }
  }
  if (failures > 0) {
    logger.warn(`Permission convergence: ${failures}/${roles.length} roles failed for skill ${skillId}`);
  } else {
    logger.log(`Permission convergence: all ${roles.length} roles converged for skill ${skillId}`);
  }
  return failures;
}

async function provisionSkill(prisma: PrismaService, skill: DefaultSkill): Promise<number> {
  let permissionFailures = 0;
  const existing = await prisma.skillConfig.findUnique({
    where: { name: skill.name },
  });

  if (!existing) {
    logger.warn(`Skill "${skill.name}" not found in database. Skipping release provisioning.`);
    logger.log(`Hint: Ensure the skill is created first via the application startup or API.`);
    return 0;
  }

  const skillId = existing.id;
  const runtimeMetadata = skill.apiEndpoints?.runtimeMetadata || {};
  const runtimeType = skill.apiEndpoints?.runtimeMetadata?.runtimeType || 'execution_flow_template';
  const sourcePayload = JSON.stringify({ skillId, name: skill.name, runtimeMetadata });

  const existingRelease = await checkExistingRelease(prisma, skillId);

  if (existingRelease.found) {
    const complete = existingRelease.hasSnapshot
      && existingRelease.deploymentOk
      && existingRelease.hasAudit;

    if (complete) {
      logger.log(`Skill "${skill.name}" already has a complete release.`);
      permissionFailures += await convergeReleasePermissions(prisma, skillId);
      return permissionFailures;
    }

    logger.log(`Completing existing release ${existingRelease.releaseId} for skill "${skill.name}"...`);

    const snapshotId = randomUUID();
    const deploymentId = randomUUID();

    await prisma.$transaction(async (tx) => {
      if (!existingRelease.hasSnapshot) {
        await tx.$executeRawUnsafe(
          `INSERT INTO capability_source_snapshots (
            id, release_id, snapshot_version, source_type, source_id,
            source_payload_json, created_at
          ) VALUES ($1::uuid, $2::uuid, 1, 'execution_flow_template', $3::uuid, $4::jsonb, NOW())`,
          snapshotId, existingRelease.releaseId, skillId, sourcePayload
        );
        await tx.$executeRawUnsafe(
          `UPDATE capability_releases SET current_source_snapshot_id = $1::uuid, updated_at = NOW() WHERE id = $2::uuid`,
          snapshotId, existingRelease.releaseId
        );
      }

      if (!existingRelease.deploymentOk) {
        await tx.$executeRawUnsafe(
          `INSERT INTO deployment_records (
            id, release_id, published_skill_id, environment, runtime_type,
            status, success, created_at
          ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'production', $4, 'deployed', true, NOW())`,
          deploymentId, existingRelease.releaseId, skillId, runtimeType
        );
        await tx.$executeRawUnsafe(
          `UPDATE capability_releases SET last_deployment_id = $1::uuid, deployment_status = 'deployed', updated_at = NOW() WHERE id = $2::uuid`,
          deploymentId, existingRelease.releaseId
        );
      }

      if (!existingRelease.hasAudit) {
        await tx.$executeRawUnsafe(
          `INSERT INTO release_audit_events (
            id, release_id, event_type, actor_id, actor_name,
            success, summary, created_at
          ) VALUES ($1::uuid, $2::uuid, 'default_skill_provisioned', NULL, 'system', true, $3, NOW())`,
          randomUUID(), existingRelease.releaseId,
          `Default skill "${skill.name}" provisioned with runtime_type=${runtimeType}`
        );
      }
    });

    permissionFailures += await convergeReleasePermissions(prisma, skillId);
    logger.log(`Successfully completed release ${existingRelease.releaseId} for skill "${skill.name}"`);
    return permissionFailures;
  }

  const releaseId = randomUUID();
  const snapshotId = randomUUID();
  const deploymentId = randomUUID();
  const auditEventId = randomUUID();

  logger.log(`Provisioning new release for skill "${skill.name}"...`);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO capability_releases (
        id, published_skill_id, release_version, status, deployment_status,
        source_type, source_id, source_name, current_source_snapshot_id,
        last_deployment_id, created_at, updated_at
      ) VALUES (
        $1::uuid, $2::uuid, 1, 'published', 'deployed',
        'execution_flow_template', $2::uuid, $3, $4::uuid,
        $5::uuid, NOW(), NOW()
      )`,
      releaseId, skillId, skill.name, snapshotId, deploymentId
    );

    await tx.$executeRawUnsafe(
      `INSERT INTO capability_source_snapshots (
        id, release_id, snapshot_version, source_type, source_id,
        source_payload_json, created_at
      ) VALUES ($1::uuid, $2::uuid, 1, 'execution_flow_template', $3::uuid, $4::jsonb, NOW())`,
      snapshotId, releaseId, skillId, sourcePayload
    );

    await tx.$executeRawUnsafe(
      `INSERT INTO deployment_records (
        id, release_id, published_skill_id, environment, runtime_type,
        status, success, created_at
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'production', $4, 'deployed', true, NOW())`,
      deploymentId, releaseId, skillId, runtimeType
    );

    await tx.$executeRawUnsafe(
      `INSERT INTO release_audit_events (
        id, release_id, event_type, actor_id, actor_name,
        success, summary, created_at
      ) VALUES ($1::uuid, $2::uuid, 'default_skill_provisioned', NULL, 'system', true, $3, NOW())`,
      auditEventId, releaseId,
      `Default skill "${skill.name}" provisioned with runtime_type=${runtimeType}`
    );
  });

  permissionFailures += await convergeReleasePermissions(prisma, skillId);
  logger.log(`Successfully provisioned skill "${skill.name}" with release ${releaseId}`);
  return permissionFailures;
}

async function bootstrap(): Promise<void> {
  logger.log('Starting default skills provisioning...');

  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  let totalPermissionFailures = 0;
  try {
    for (const skill of DEFAULT_SKILLS) {
      const failures = await provisionSkill(prisma, skill);
      totalPermissionFailures += failures;
    }

    if (totalPermissionFailures > 0) {
      logger.warn(`Provisioning completed with ${totalPermissionFailures} permission convergence failure(s).`);
      logger.warn('All releases and deployments were created successfully, but some role permissions may be missing.');
      logger.warn('Run this command again to retry permission convergence.');
      process.exit(2);
    }

    logger.log('Default skills provisioning completed successfully.');
  } catch (error) {
    logger.error('Failed to provision default skills:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap().catch((err) => {
  logger.error('Bootstrap failed:', err);
  process.exit(1);
});