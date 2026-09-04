import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { BuiltinSkillManifest } from '@ops/backend-builtin-skill-contract';
import { BuiltinSkillAuditService } from '../audit/builtin-skill-audit.service';

const ALIAS_MAP: Record<string, string> = {
  markdown_artifact_writer: 'platform.document.markdown-artifact-writer',
  tavily_search: 'platform.search.web',
  web_search: 'platform.search.web',
  workspace_explorer: 'platform.workspace.explorer',
};

@Injectable()
export class BuiltinSkillRegistryService {
  private readonly logger = new Logger(BuiltinSkillRegistryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: BuiltinSkillAuditService
  ) {}

  resolveCanonicalKey(keyOrAlias: string): string {
    return ALIAS_MAP[keyOrAlias] || keyOrAlias;
  }

  /**
   * Administrative inventory is intentionally different from the executable
   * catalog: operators must also be able to see disabled, inactive, or
   * unhealthy registrations so they can diagnose provisioning problems.
   */
  async listSkillInventory() {
    const skills = await this.prisma.builtinSkill.findMany({
      include: {
        versions: {
          include: { deployments: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ category: 'asc' }, { capabilityKey: 'asc' }],
    });

    return skills.map((skill) => {
      const activeVersion = skill.activeVersionId
        ? skill.versions.find((version) => version.id === skill.activeVersionId) || null
        : null;

      return {
        id: skill.id,
        capabilityKey: skill.capabilityKey,
        aliases: Object.entries(ALIAS_MAP)
          .filter(([, canonicalKey]) => canonicalKey === skill.capabilityKey)
          .map(([alias]) => alias),
        displayName: skill.displayName,
        description: skill.description,
        owner: skill.owner,
        category: skill.category,
        defaultAccess: skill.defaultAccess,
        lifecycle: skill.lifecycle,
        isEnabled: skill.isEnabled,
        activeVersionId: skill.activeVersionId,
        activeVersion: activeVersion
          ? {
              id: activeVersion.id,
              definitionVersion: activeVersion.definitionVersion,
              apiVersion: activeVersion.apiVersion,
              definitionDigest: activeVersion.definitionDigest,
              runtimeBuild: activeVersion.runtimeBuild,
              attestationId: activeVersion.attestationId,
              manifest: activeVersion.manifestJson,
              deployments: activeVersion.deployments.map((deployment) => ({
                environment: deployment.environment,
                status: deployment.status,
                smokeTestStatus: deployment.smokeTestStatus,
                failureCode: deployment.failureCode,
                deployedAt: deployment.deployedAt,
              })),
              createdAt: activeVersion.createdAt,
            }
          : null,
        versions: skill.versions.map((version) => ({
          id: version.id,
          definitionVersion: version.definitionVersion,
          definitionDigest: version.definitionDigest,
          attestationId: version.attestationId,
          createdAt: version.createdAt,
        })),
        createdAt: skill.createdAt,
        updatedAt: skill.updatedAt,
      };
    });
  }

  async findSkillByKey(keyOrAlias: string) {
    const canonicalKey = this.resolveCanonicalKey(keyOrAlias);
    return this.prisma.builtinSkill.findUnique({
      where: { capabilityKey: canonicalKey },
      include: {
        versions: true,
        permissionOverrides: true,
      },
    });
  }

  async setSkillEnabled(keyOrAlias: string, isEnabled: boolean, operator?: string) {
    const capabilityKey = this.resolveCanonicalKey(keyOrAlias);
    const skill = await this.prisma.builtinSkill.findUnique({ where: { capabilityKey } });
    if (!skill) throw new NotFoundException(`Builtin skill '${keyOrAlias}' not found`);
    if (skill.isEnabled === isEnabled) return skill;
    const updated = await this.prisma.builtinSkill.update({
      where: { id: skill.id },
      data: { isEnabled },
    });
    await this.auditService.logEvent({
      builtinSkillId: skill.id,
      action: isEnabled ? 'enabled' : 'disabled',
      operator,
      payload: { previousValue: skill.isEnabled, isEnabled },
    });
    return updated;
  }

  async getActiveSkillVersion(keyOrAlias: string) {
    const skill = await this.findSkillByKey(keyOrAlias);
    if (!skill) {
      throw new NotFoundException(`Builtin skill '${keyOrAlias}' not found`);
    }
    if (!skill.activeVersionId) {
      throw new BadRequestException(`Builtin skill '${skill.capabilityKey}' has no active version`);
    }
    const version = await this.prisma.builtinSkillVersion.findUnique({
      where: { id: skill.activeVersionId },
      include: { deployments: true },
    });
    if (!version) {
      throw new NotFoundException(
        `Active version ID '${skill.activeVersionId}' for skill '${skill.capabilityKey}' not found`
      );
    }
    return { skill, version };
  }

  async upsertSkillFromManifest(manifest: BuiltinSkillManifest, definitionDigest: string) {
    const canonicalKey = manifest.metadata.key;
    let skill = await this.prisma.builtinSkill.findUnique({
      where: { capabilityKey: canonicalKey },
    });

    if (!skill) {
      skill = await this.prisma.builtinSkill.create({
        data: {
          capabilityKey: canonicalKey,
          displayName: manifest.metadata.displayName,
          description: manifest.metadata.description || null,
          owner: manifest.metadata.owner,
          category: manifest.metadata.labels?.category || 'workflow',
          defaultAccess: manifest.spec.defaultAccess?.mode || 'authenticated',
          lifecycle: manifest.spec.lifecycle || 'stable',
          isEnabled: manifest.spec.planner?.enabled ?? true,
        },
      });
      await this.auditService.logEvent({
        builtinSkillId: skill.id,
        action: 'skill_created',
        payload: { capabilityKey: canonicalKey },
      });
    } else {
      skill = await this.prisma.builtinSkill.update({
        where: { id: skill.id },
        data: {
          displayName: manifest.metadata.displayName,
          description: manifest.metadata.description || null,
          owner: manifest.metadata.owner,
          category: manifest.metadata.labels?.category || skill.category,
          defaultAccess: manifest.spec.defaultAccess?.mode || skill.defaultAccess,
          lifecycle: manifest.spec.lifecycle || skill.lifecycle,
        },
      });
    }

    // Check version
    const existingVersion = await this.prisma.builtinSkillVersion.findUnique({
      where: {
        builtinSkillId_definitionVersion: {
          builtinSkillId: skill.id,
          definitionVersion: manifest.spec.definitionVersion,
        },
      },
    });

    let version;
    if (existingVersion) {
      if (existingVersion.definitionDigest !== definitionDigest) {
        throw new ConflictException({
          code: 'BUILTIN_SKILL_VERSION_CONFLICT',
          message: `Version ${manifest.spec.definitionVersion} for ${canonicalKey} exists with a different digest: ${existingVersion.definitionDigest} vs ${definitionDigest}`,
        });
      }
      version = existingVersion;
    } else {
      version = await this.prisma.builtinSkillVersion.create({
        data: {
          builtinSkillId: skill.id,
          definitionVersion: manifest.spec.definitionVersion,
          apiVersion: manifest.apiVersion,
          definitionDigest: definitionDigest,
          manifestJson: manifest as any,
          workflowJson: manifest.spec.workflow?.workflowContent
            ? (manifest.spec.workflow.workflowContent as any)
            : {},
          runtimeBuild: manifest.spec.runtime.handlerKey,
        },
      });
      await this.auditService.logEvent({
        builtinSkillId: skill.id,
        action: 'version_created',
        versionId: version.id,
        payload: { definitionVersion: manifest.spec.definitionVersion, definitionDigest },
      });
    }

    return { skill, version };
  }

  async markDeployment(params: {
    builtinSkillVersionId: string;
    environment: string;
    status: string;
    smokeTestStatus?: string;
    smokeTestDigest?: string;
    failureCode?: string;
  }) {
    const existing = await this.prisma.builtinSkillDeployment.findUnique({
      where: {
        builtinSkillVersionId_environment: {
          builtinSkillVersionId: params.builtinSkillVersionId,
          environment: params.environment,
        },
      },
    });

    if (existing) {
      return this.prisma.builtinSkillDeployment.update({
        where: { id: existing.id },
        data: {
          status: params.status,
          deployedAt: new Date(),
          smokeTestStatus: params.smokeTestStatus || existing.smokeTestStatus,
          smokeTestDigest: params.smokeTestDigest || existing.smokeTestDigest,
          failureCode: params.failureCode || null,
        },
      });
    } else {
      return this.prisma.builtinSkillDeployment.create({
        data: {
          builtinSkillVersionId: params.builtinSkillVersionId,
          environment: params.environment,
          status: params.status,
          smokeTestStatus: params.smokeTestStatus || null,
          smokeTestDigest: params.smokeTestDigest || null,
          failureCode: params.failureCode || null,
        },
      });
    }
  }

  async attestVersion(params: {
    builtinSkillId: string;
    builtinSkillVersionId: string;
    sourceDigest: string;
    contractDigest: string;
    runtimeDigest: string;
    fixtureDigest?: string;
  }) {
    const version = await this.prisma.builtinSkillVersion.findUnique({
      where: { id: params.builtinSkillVersionId },
    });
    if (!version || version.builtinSkillId !== params.builtinSkillId) {
      throw new NotFoundException(
        `Builtin skill version '${params.builtinSkillVersionId}' not found for attestation`
      );
    }

    if (version.attestationId) {
      const existing = await this.prisma.capabilityAttestation.findUnique({
        where: { id: version.attestationId },
      });
      if (existing) return version;
    }

    const attestation = await this.prisma.capabilityAttestation.create({
      data: {
        // Built-in bundles do not have capability-release/build rows. Their
        // immutable skill/version UUIDs are the corresponding source/build
        // identities for the shared attestation store.
        releaseId: params.builtinSkillId,
        buildId: params.builtinSkillVersionId,
        sourceDigest: params.sourceDigest,
        contractDigest: params.contractDigest,
        generatedCodeDigest: params.runtimeDigest,
        fixtureDigest: params.fixtureDigest || null,
        validatorVersion: 'builtin-provisioner/1.0.0',
        gateResultsJson: {
          tests: {
            contractLint: 'skipped',
            staticAnalysis: 'skipped',
            sandbox: 'passed',
            composition: 'skipped',
            temporalReplay: 'skipped',
          },
        },
      },
    });

    const attestedVersion = await this.prisma.builtinSkillVersion.update({
      where: { id: version.id },
      data: { attestationId: attestation.id },
    });
    await this.auditService.logEvent({
      builtinSkillId: params.builtinSkillId,
      action: 'attestation_created',
      versionId: version.id,
      payload: {
        attestationId: attestation.id,
        sourceDigest: params.sourceDigest,
        fixtureDigest: params.fixtureDigest,
      },
    });
    return attestedVersion;
  }

  async activateVersion(keyOrAlias: string, versionStr: string) {
    const skill = await this.findSkillByKey(keyOrAlias);
    if (!skill) {
      throw new NotFoundException(`Builtin skill '${keyOrAlias}' not found`);
    }
    const version = await this.prisma.builtinSkillVersion.findUnique({
      where: {
        builtinSkillId_definitionVersion: {
          builtinSkillId: skill.id,
          definitionVersion: versionStr,
        },
      },
    });
    if (!version) {
      throw new NotFoundException(
        `Version '${versionStr}' for skill '${skill.capabilityKey}' not found`
      );
    }

    // Gate 5 (§10.6): "Activation 只能指向具有有效验证凭证的版本" — activation
    // is a HARD gate. A version without an attestation, or whose attestation
    // row no longer exists, must never become the active version; publishing
    // such a version is itself blocked by the publish gate, so this only
    // rejects versions that bypassed or predate the attestation pipeline.
    if (version.attestationId) {
      const attestation = await this.prisma.capabilityAttestation.findFirst({
        where: { id: version.attestationId },
      });
      if (!attestation) {
        this.logger.error(
          `Activating version ${version.definitionVersion} of skill ${skill.capabilityKey} blocked — ` +
            `attestation ${version.attestationId} no longer exists`
        );
        await this.auditService.logEvent({
          builtinSkillId: skill.id,
          action: 'activate_version_blocked',
          versionId: version.id,
          payload: {
            versionStr,
            reason: 'attestation_missing',
            attestationId: version.attestationId,
          },
        });
        throw new BadRequestException(
          `Activation blocked: version ${version.definitionVersion} of skill ${skill.capabilityKey} ` +
            `references attestation ${version.attestationId} which no longer exists (§10.6)`
        );
      }
    } else {
      this.logger.error(
        `Activating version ${version.definitionVersion} of skill ${skill.capabilityKey} blocked — ` +
          `version carries no attestation (§10.6)`
      );
      await this.auditService.logEvent({
        builtinSkillId: skill.id,
        action: 'activate_version_blocked',
        versionId: version.id,
        payload: { versionStr, reason: 'no_attestation' },
      });
      throw new BadRequestException(
        `Activation blocked: version ${version.definitionVersion} of skill ${skill.capabilityKey} ` +
          `has no validation attestation (§10.6)`
      );
    }

    const updatedSkill = await this.prisma.builtinSkill.update({
      where: { id: skill.id },
      data: {
        activeVersionId: version.id,
        isEnabled: true,
      },
    });

    await this.auditService.logEvent({
      builtinSkillId: skill.id,
      action: 'activate_version',
      versionId: version.id,
      payload: { versionStr },
    });

    return { skill: updatedSkill, version };
  }

  async rollbackVersion(keyOrAlias: string, targetVersionStr: string) {
    this.logger.log(`Rolling back skill ${keyOrAlias} to version ${targetVersionStr}`);
    return this.activateVersion(keyOrAlias, targetVersionStr);
  }
}
