import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { BuiltinSkillManifest } from '@ops/backend-builtin-skill-contract';
import { BuiltinSkillAuditService } from '../audit/builtin-skill-audit.service';

const ALIAS_MAP: Record<string, string> = {
  'markdown_artifact_writer': 'platform.document.markdown-artifact-writer',
};

@Injectable()
export class BuiltinSkillRegistryService {
  private readonly logger = new Logger(BuiltinSkillRegistryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: BuiltinSkillAuditService,
  ) {}

  resolveCanonicalKey(keyOrAlias: string): string {
    return ALIAS_MAP[keyOrAlias] || keyOrAlias;
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
      throw new NotFoundException(`Active version ID '${skill.activeVersionId}' for skill '${skill.capabilityKey}' not found`);
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
          isEnabled: manifest.spec.planner?.enabled ?? skill.isEnabled,
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
          workflowJson: manifest.spec.workflow?.workflowContent ? (manifest.spec.workflow.workflowContent as any) : {},
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
      throw new NotFoundException(`Version '${versionStr}' for skill '${skill.capabilityKey}' not found`);
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
