import { Inject, Injectable } from '@nestjs/common';
import type {
  ReleaseManagerPrismaPort,
  ReleaseManagerSkillServicePort,
} from '../platform-runtime.ports';
import {
  RELEASE_MANAGER_PRISMA,
  RELEASE_MANAGER_SKILL_SERVICE,
} from '../platform-runtime.tokens';
import {
  CapabilityReleaseDTO,
  SkillDraftDTO,
} from '../interfaces';
import { CapabilityReleasePublishWriterService } from './capability-release-publish-writer.service';

type PublishNormalizedDraftParams = {
  release: CapabilityReleaseDTO;
  draft: SkillDraftDTO;
  normalizedDraftPayload: Record<string, unknown>;
};

type PublishNormalizedDraftResult = {
  publishedSkillId: string;
  previousPublishedSkillIdDeactivated: string | null;
};

@Injectable()
export class CapabilityReleaseSkillPublisherService {
  constructor(
    @Inject(RELEASE_MANAGER_PRISMA) private readonly prisma: ReleaseManagerPrismaPort,
    @Inject(RELEASE_MANAGER_SKILL_SERVICE)
    private readonly skillService: ReleaseManagerSkillServicePort,
    private readonly capabilityReleasePublishWriterService: CapabilityReleasePublishWriterService
  ) {}

  async publishNormalizedDraft(
    params: PublishNormalizedDraftParams
  ): Promise<PublishNormalizedDraftResult> {
    const { release, draft } = params;
    const payload = { ...params.normalizedDraftPayload };
    if (typeof payload.description === 'string' && payload.description.length > 500) {
      payload.description = `${payload.description.slice(0, 497)}...`;
    }

    const baseName =
      (typeof payload.name === 'string' && payload.name.trim()) ||
      release.sourceName ||
      `Skill-${release.id.slice(0, 8)}`;
    payload.name = await this.ensureUniqueSkillName(String(baseName), release.id);

    const created = await this.skillService.createSkill(payload as any);
    const publishedSkillId = created.id;
    const previousPublishedSkillId = release.publishedSkillId || null;

    if (previousPublishedSkillId && previousPublishedSkillId !== publishedSkillId) {
      await this.capabilityReleasePublishWriterService.deactivatePublishedSkill(
        previousPublishedSkillId
      );
    }

    await this.capabilityReleasePublishWriterService.finalizePublishedSkill(
      release.id,
      draft.id,
      publishedSkillId,
      release.approvalStatus === 'not_required' ? 'not_required' : 'approved'
    );

    return {
      publishedSkillId,
      previousPublishedSkillIdDeactivated:
        previousPublishedSkillId && previousPublishedSkillId !== publishedSkillId
          ? previousPublishedSkillId
          : null,
    };
  }

  private async ensureUniqueSkillName(baseName: string, releaseId: string): Promise<string> {
    let finalName = baseName;
    const nameExists = async (name: string) => {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM skill_configs WHERE name = $1 LIMIT 1`,
        name
      );
      return Boolean(rows[0]?.id);
    };

    if (!(await nameExists(finalName))) {
      return finalName;
    }

    const baseCandidate = `${baseName}-${releaseId.slice(0, 8)}`;
    finalName = baseCandidate;
    let suffix = 1;
    while (await nameExists(finalName)) {
      finalName = `${baseCandidate}-${suffix}`;
      suffix += 1;
      if (suffix > 1000) {
        return `${baseCandidate}-${Date.now()}`;
      }
    }
    return finalName;
  }
}
