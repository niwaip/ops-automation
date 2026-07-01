import { Inject, Injectable } from '@nestjs/common';
import type { ReleaseManagerPrismaPort } from '../platform-runtime.ports';
import { RELEASE_MANAGER_PRISMA } from '../platform-runtime.tokens';
import { CapabilityReleaseDTO } from '../interfaces';

export interface CapabilityReleaseLifecycleAccessors {
  getReleaseOrThrow(id: string): Promise<CapabilityReleaseDTO>;
  insertAuditEvent(
    releaseId: string,
    eventType: string,
    actorId: string | undefined,
    success: boolean,
    summary: string,
    details?: Record<string, unknown> | null
  ): Promise<void>;
}

@Injectable()
export class ReleaseLifecycleService {
  constructor(@Inject(RELEASE_MANAGER_PRISMA) private readonly prisma: ReleaseManagerPrismaPort) {}

  async archiveCapability(
    id: string,
    userId: string | undefined,
    accessors: CapabilityReleaseLifecycleAccessors
  ): Promise<{ success: true; archivedId: string }> {
    const release = await accessors.getReleaseOrThrow(id);

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET source_status = 'archived',
           archived_at = now(),
           updated_at = now()
       WHERE id = $1::uuid`,
      id
    );

    if (release.publishedSkillId) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE skill_configs
         SET is_active = false,
             updated_at = now()
         WHERE id = $1::uuid`,
        release.publishedSkillId
      );
      await accessors.insertAuditEvent(
        id,
        'published_skill_deactivated',
        userId,
        true,
        `归档 Release 时停用已发布 Skill: ${release.publishedSkillId}`,
        { publishedSkillId: release.publishedSkillId }
      );
    }

    await accessors.insertAuditEvent(id, 'release_archived', userId, true, '归档 Capability');
    return { success: true, archivedId: id };
  }
}
