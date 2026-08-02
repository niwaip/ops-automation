import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { BuiltinSkillPermissionService } from '../permissions/builtin-skill-permission.service';
import { ExecutableCapabilityView } from '@ops/backend-builtin-skill-contract';
import { computeContractDigest } from '@ops/backend-runtime-capability-contract';

@Injectable()
export class BuiltinSkillCatalogProjectionService {
  private readonly logger = new Logger(BuiltinSkillCatalogProjectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: BuiltinSkillPermissionService,
  ) {}

  async getUnifiedCatalog(userContext?: { userId?: string; orgId?: string; roleIds?: string[] }): Promise<ExecutableCapabilityView[]> {
    const views: ExecutableCapabilityView[] = [];

    // 1. Built-in Skills
    const builtinSkills = await this.prisma.builtinSkill.findMany({
      where: { isEnabled: true },
      include: {
        versions: {
          include: { deployments: true },
        },
      },
    });

    for (const skill of builtinSkills) {
      if (!skill.activeVersionId) continue;
      const activeVersion = skill.versions.find(v => v.id === skill.activeVersionId);
      if (!activeVersion) continue;

      // Active version MUST have a healthy deployment record
      const isHealthy = activeVersion.deployments.some(d => d.status === 'healthy' || d.status === 'deployed');
      if (!isHealthy) continue;

      const authResult = await this.permissionService.authorize({
        capabilityKey: skill.capabilityKey,
        userId: userContext?.userId,
        orgId: userContext?.orgId,
        roleIds: userContext?.roleIds,
        action: 'discover',
      });

      if (!authResult.authorized) continue;

      const manifest = activeVersion.manifestJson as any;
      const plannerSpec = manifest?.spec?.planner;
      const inputContract = manifest?.spec?.contracts?.input?.schema || {};
      const outputContract = manifest?.spec?.contracts?.output?.schema || {};
      const digest = activeVersion.definitionDigest;

      views.push({
        capabilityRef: {
          source: 'builtin_skill',
          id: skill.capabilityKey,
          version: activeVersion.definitionVersion,
        },
        displayName: skill.displayName,
        description: skill.description || undefined,
        category: skill.category,
        runtimeType: plannerSpec?.runtimeType || 'workflow',
        inputSchema: inputContract,
        outputSchema: outputContract,
        contractDigest: digest,
        contractRef: `capability://${skill.capabilityKey}/${activeVersion.definitionVersion}`,
        accessStatus: 'authorized',
        lifecycle: (skill.lifecycle as any) || 'stable',
        supportsArtifact: plannerSpec?.supportsArtifact || false,
        runtimeHints: {
          handlerKey: manifest?.spec?.runtime?.handlerKey,
          adapterRoute: manifest?.spec?.runtime?.adapterRoute,
          triggerKeywords: plannerSpec?.triggerKeywords || [],
        },
      });
    }

    // 2. Published Skills from SkillConfig (for legacy & standard skills).
    // The Prisma schema does not declare a back-relation from SkillConfig to
    // CapabilityRelease, so we pre-resolve the set of skill IDs that have at
    // least one healthy deployment record via raw SQL and use that as a hard
    // filter. Earlier code only filtered on skill_config.configStatus='published',
    // which let stale or never-deployed skills slip into the catalog while
    // shadowing actually-deployed skills like the web search capability.
    const healthyDeploymentRows = await this.prisma.$queryRaw<
      Array<{ published_skill_id: string; release_version: number | string }>
    >`
      SELECT DISTINCT cr.published_skill_id, cr.release_version
      FROM capability_releases cr
      INNER JOIN deployment_records dr ON dr.release_id = cr.id
      WHERE cr.status = 'published'
        AND cr.deployment_status IN ('deployed', 'succeeded', 'completed')
        AND dr.status IN ('deployed', 'succeeded', 'completed')
        AND dr.success = true
        AND cr.published_skill_id IS NOT NULL
    `;
    const healthySkillIds = new Set(
      healthyDeploymentRows
        .map((row) => row.published_skill_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    );

    const publishedSkills = await this.prisma.skillConfig.findMany({
      where: {
        id: { in: Array.from(healthySkillIds) },
        isActive: true,
        // Accept both legacy 'valid' and newer 'published' so existing rows keep
        // working. The CapabilityRelease+DeploymentRecord filter above is the
        // authoritative gate; this field is just a sanity check.
        configStatus: { in: ['published', 'valid'] },
      },
      include: {
        permissions: true,
      },
    });

    for (const published of publishedSkills) {
      // Defense-in-depth: even though the `id: { in: ... }` filter pre-narrows
      // to healthy releases, we double-check so partially-corrupt rows cannot
      // slip through if Prisma's relation cache is stale.
      if (!healthySkillIds.has(published.id)) continue;

      // If it's the legacy alias 'markdown_artifact_writer' and we already have builtin 'platform.document.markdown-artifact-writer', skip
      if (published.name === 'markdown_artifact_writer') {
        const hasBuiltin = views.some(v => v.capabilityRef.id === 'platform.document.markdown-artifact-writer');
        if (hasBuiltin) continue;
      }

      // SkillPermission check if roleIds are present
      if (userContext?.roleIds && userContext.roleIds.length > 0 && published.permissions.length > 0) {
        const isPermitted = published.permissions.some(p => userContext.roleIds!.includes(p.roleId));
        if (!isPermitted) continue;
      }

      const pubInput = (published.paramsSchema as Record<string, unknown>) || {};
      const pubOutput = (published.outputSchema as Record<string, unknown>) || {
        type: 'object',
        properties: {},
        additionalProperties: true,
      };
      const pubDigest = computeContractDigest({
        apiVersion: 'ops-automation/v2',
        kind: 'Capability',
        metadata: {
          id: published.id,
          version: '1.0.0',
          sourceType: 'published_skill',
        },
        contracts: {
          input: { schema: pubInput },
          output: { schema: pubOutput },
        },
        runtime: { type: published.name === 'markdown_artifact_writer' ? 'artifact' : 'workflow' },
      });

const release = healthyDeploymentRows.find(
        (r: { published_skill_id: string; release_version: number | string }) =>
          r.published_skill_id === published.id,
      );
      // Use the actual release_version from the CapabilityRelease row. Earlier
      // code hardcoded '1.0.0' here which caused downstream version-mismatch
      // validation failures because the real value (often just '1') is what the
      // control-plane's /resolve endpoint returns.
      const releaseVersion = release?.release_version != null
        ? String(release.release_version)
        : '1.0.0';

      views.push({
        capabilityRef: {
          source: 'published_skill',
          id: published.id,
          version: releaseVersion,
        },
        displayName: published.name,
        description: published.description || undefined,
        category: 'workflow',
        runtimeType: published.name === 'markdown_artifact_writer' ? 'artifact' : 'workflow',
        inputSchema: pubInput,
        outputSchema: pubOutput,
        contractDigest: pubDigest,
        contractRef: `capability://${published.id}/${releaseVersion}`,
        accessStatus: 'authorized',
        lifecycle: 'stable',
        supportsArtifact: published.name === 'markdown_artifact_writer',
        // Surface release/deployment status so downstream candidate selectors can
        // verify this entry without a second hop to the CapabilityRelease table.
        publishedReleaseStatus: release ? 'published' : undefined,
        publishedDeploymentStatus: release ? 'deployed' : undefined,
        publishedReleaseVersion: releaseVersion,
      });
    }

    return views;
  }

  async resolveCapability(input: {
    capabilityKey: string;
    definitionVersion?: string;
    userId?: string;
    orgId?: string;
    roleIds?: string[];
    action?: 'discover' | 'execute' | 'manage';
  }) {
    const action = input.action || 'execute';
    const skill = await this.prisma.builtinSkill.findUnique({
      where: { capabilityKey: input.capabilityKey },
      include: {
        versions: {
          include: { deployments: true },
        },
      },
    });

    if (!skill || !skill.isEnabled) {
      return {
        found: false,
        authorized: false,
        capabilityKey: input.capabilityKey,
        reason: skill ? 'BUILTIN_SKILL_DISABLED' : 'BUILTIN_SKILL_NOT_FOUND',
      };
    }

    let targetVersion: typeof skill.versions[0] | undefined;

    // Strict Version Resolution: Never silently fall back to active version if definitionVersion is specified!
    if (input.definitionVersion) {
      targetVersion = skill.versions.find(v => v.definitionVersion === input.definitionVersion);
      if (!targetVersion) {
        return {
          found: false,
          authorized: false,
          capabilityKey: input.capabilityKey,
          reason: 'BUILTIN_SKILL_VERSION_NOT_FOUND',
        };
      }
    } else if (skill.activeVersionId) {
      targetVersion = skill.versions.find(v => v.id === skill.activeVersionId);
    }

    if (!targetVersion) {
      return {
        found: false,
        authorized: false,
        capabilityKey: input.capabilityKey,
        reason: 'BUILTIN_SKILL_NO_ACTIVE_VERSION',
      };
    }

    const deployment = targetVersion.deployments.find(d => d.status === 'healthy' || d.status === 'deployed');
    const isHealthy = Boolean(deployment);

    const manifest = targetVersion.manifestJson as any;

    // If deployment is not healthy, return authorized: false and no capabilityView
    if (!isHealthy) {
      return {
        found: true,
        authorized: false,
        reason: 'BUILTIN_SKILL_NOT_HEALTHY',
        capabilityKey: skill.capabilityKey,
        definitionVersion: targetVersion.definitionVersion,
        definitionDigest: targetVersion.definitionDigest,
        deploymentStatus: deployment ? deployment.status : 'not_deployed',
        isHealthy: false,
        manifest,
      };
    }

    const authResult = await this.permissionService.authorize({
      capabilityKey: skill.capabilityKey,
      userId: input.userId,
      orgId: input.orgId,
      roleIds: input.roleIds,
      action,
    });

    const plannerSpec = manifest?.spec?.planner;
    const inputContract = manifest?.spec?.contracts?.input?.schema || {};
    const outputContract = manifest?.spec?.contracts?.output?.schema || {};

    const view: ExecutableCapabilityView = {
      capabilityRef: {
        source: 'builtin_skill',
        id: skill.capabilityKey,
        version: targetVersion.definitionVersion,
      },
      displayName: skill.displayName,
      description: skill.description || undefined,
      category: skill.category,
      runtimeType: plannerSpec?.runtimeType || 'workflow',
      inputSchema: inputContract,
      outputSchema: outputContract,
      accessStatus: authResult.authorized ? 'authorized' : 'unauthorized',
      lifecycle: (skill.lifecycle as any) || 'stable',
      supportsArtifact: plannerSpec?.supportsArtifact || false,
      runtimeHints: {
        handlerKey: manifest?.spec?.runtime?.handlerKey,
        adapterRoute: manifest?.spec?.runtime?.adapterRoute,
        triggerKeywords: plannerSpec?.triggerKeywords || [],
      },
    };

    return {
      found: true,
      authorized: authResult.authorized,
      reason: authResult.reason,
      capabilityKey: skill.capabilityKey,
      definitionVersion: targetVersion.definitionVersion,
      definitionDigest: targetVersion.definitionDigest,
      deploymentStatus: deployment ? deployment.status : 'not_deployed',
      isHealthy,
      manifest,
      capabilityView: authResult.authorized ? view : undefined,
    };
  }
}
