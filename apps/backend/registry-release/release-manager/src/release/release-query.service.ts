import { Inject, Injectable } from '@nestjs/common';
import type { ReleaseManagerPrismaPort } from '../platform-runtime.ports';
import { RELEASE_MANAGER_PRISMA } from '../platform-runtime.tokens';
import {
  mapCapabilityAuditEvent,
  mapCapabilityBuild,
  mapCapabilityDeployment,
  mapCapabilityRelease,
  mapCapabilitySkillDraft,
  mapCapabilitySourceSnapshot,
  mapCapabilityValidation,
} from '../capability-release.mapper';
import {
  CapabilityReleaseDTO,
  CapabilityReleaseDetailDTO,
  SkillDraftDTO,
} from '../interfaces';

type ExceptionLike = Error & {
  name: string;
  status: number;
  response: string | Record<string, unknown>;
};

function createNotFoundException(response: string | Record<string, unknown>): ExceptionLike {
  const message = typeof response === 'string' ? response : String(response.message ?? 'Not Found');
  const error = new Error(message) as ExceptionLike;
  error.name = 'NotFoundException';
  error.status = 404;
  error.response = response;
  return error;
}

export interface CapabilityReleaseQueryAccessors {
  getReleaseOrThrow(id: string): Promise<CapabilityReleaseDTO>;
  getSkillDraftOrThrow(id: string): Promise<SkillDraftDTO>;
}

@Injectable()
export class ReleaseQueryService {
  constructor(@Inject(RELEASE_MANAGER_PRISMA) private readonly prisma: ReleaseManagerPrismaPort) {}

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

  async getCapabilityDetail(
    id: string,
    accessors: CapabilityReleaseQueryAccessors
  ): Promise<CapabilityReleaseDetailDTO> {
    const release = await accessors.getReleaseOrThrow(id);
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
      (snapshot) => snapshot.id === release.currentSourceSnapshotId
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

  async getPublishedCapabilityDetail(
    id: string,
    accessors: CapabilityReleaseQueryAccessors
  ): Promise<CapabilityReleaseDetailDTO> {
    const release = await accessors.getReleaseOrThrow(id);
    const isVisible =
      Boolean(release.publishedSkillId) ||
      ['published', 'deployed', 'rolled_back'].includes(release.status) ||
      ['running', 'succeeded', 'deployed', 'rolled_back'].includes(release.deploymentStatus);

    if (!isVisible) {
      throw createNotFoundException('该 Release 尚未进入发布中心');
    }

    return this.getCapabilityDetail(id, accessors);
  }

  async getCurrentSkillDraft(
    id: string,
    accessors: CapabilityReleaseQueryAccessors
  ): Promise<SkillDraftDTO> {
    const release = await accessors.getReleaseOrThrow(id);
    if (!release.currentSkillDraftId) {
      throw createNotFoundException('当前 Release 没有 Skill 草案');
    }
    return accessors.getSkillDraftOrThrow(release.currentSkillDraftId);
  }
}
