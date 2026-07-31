import { Inject, Injectable } from '@nestjs/common';
import type {
  ReleaseManagerPrismaPort,
  ReleaseManagerSkillServicePort,
  ReleaseManagerToolCatalogPort,
} from '../platform-runtime.ports';
import {
  RELEASE_MANAGER_PRISMA,
  RELEASE_MANAGER_SKILL_SERVICE,
  RELEASE_MANAGER_TOOL_CATALOG,
} from '../platform-runtime.tokens';
import {
  mapCapabilityDeployment,
  mapCapabilityRelease,
} from '../capability-release.mapper';
import { CapabilityReleaseDTO } from '../interfaces';

type SkillRuntimeToolPolicy = {
  name: string;
  promptExposure: string;
  defaultRequiresConfirmation: boolean;
  defaultRequiresApproval: boolean;
  status: string;
};

export interface CapabilityPublishedSkillRuntimeContext {
  publishedSkillId: string;
  releaseId: string;
  sourceType: string;
  runtimeType: string;
  runtimeSource: 'deployment' | 'sandbox_fallback' | 'flow_runtime_fallback';
  allowedToolNames: string[];
  toolPolicies: SkillRuntimeToolPolicy[];
  environment?: string | null;
  deploymentId?: string | null;
}

@Injectable()
export class ReleaseRuntimeBindingService {
  constructor(
    @Inject(RELEASE_MANAGER_PRISMA) private readonly prisma: ReleaseManagerPrismaPort,
    @Inject(RELEASE_MANAGER_SKILL_SERVICE)
    private readonly skillService: ReleaseManagerSkillServicePort,
    @Inject(RELEASE_MANAGER_TOOL_CATALOG)
    private readonly toolCatalogService: ReleaseManagerToolCatalogPort
  ) {}

  async getPublishedSkillRuntimeContext(
    skillId: string
  ): Promise<CapabilityPublishedSkillRuntimeContext> {
    const release = await this.getReleaseByPublishedSkillOrThrow(skillId);
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
      release.id
    );

    const lastDeployment = release.lastDeploymentId
      ? await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT *
             FROM deployment_records
             WHERE id = $1::uuid
             LIMIT 1`,
          release.lastDeploymentId
        )
      : [];

    const deploymentRow =
      (Array.isArray(lastDeployment) && lastDeployment[0]?.success ? lastDeployment[0] : null) ||
      latestSuccessfulDeploymentRows[0] ||
      null;

    if (deploymentRow) {
      const deployment = mapCapabilityDeployment(deploymentRow);
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

  async getReleaseByPublishedSkillOrThrow(skillId: string): Promise<CapabilityReleaseDTO> {
    const trimmedId = (skillId || '').trim();
    if (!trimmedId) {
      throw new Error('Skill ID cannot be empty');
    }

    // Use text-based comparisons throughout to avoid PG ::uuid cast failures
    // when skillId is a non-UUID string (e.g. skill name). Cast uuid columns to
    // text for comparison; match source_name both exactly and by LIKE.
    const likePattern = `%${trimmedId}%`;
    const releaseRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT *
       FROM capability_releases
       WHERE published_skill_id::text = $1
          OR id::text = $1
          OR source_id::text = $1
          OR source_name = $1
          OR source_name ILIKE $2
       ORDER BY
         CASE WHEN archived_at IS NULL THEN 0 ELSE 1 END,
         updated_at DESC
       LIMIT 1`,
      trimmedId,
      likePattern,
    );

    if (!releaseRows[0]) {
      throw new Error(`未找到与该 Skill (${trimmedId}) 绑定的 Capability`);
    }

    return mapCapabilityRelease(releaseRows[0]);
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
}
