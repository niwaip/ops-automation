import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { computePlanHash, type DeterministicPlanDraftV1 } from '@ops/backend-deterministic-plan';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeSavedSkillInput } from './saved-skill-input-sanitizer';

interface SavedSkillVersionRow {
  skill_id: string;
  owner_user_id: string;
  status: string;
  version: number;
  plan_snapshot_json: Record<string, unknown>;
  fixed_input_json: Record<string, unknown>;
  plan_hash: string;
  input_hash: string;
}

@Injectable()
export class SavedSkillResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForExecution(
    ownerUserId: string,
    skillId: string,
    skillVersion?: string
  ): Promise<null | {
    skillId: string;
    version: string;
    planSnapshot: Record<string, unknown>;
    fixedInput: Record<string, unknown>;
    planHash: string;
    inputHash: string;
  }> {
    const ownership = await this.findOwnership(skillId);
    if (!ownership) {
      return null;
    }
    if (ownership.owner_user_id !== ownerUserId) {
      throw new ForbiddenException('Saved workflow does not belong to the current user');
    }
    if (ownership.status !== 'active') {
      throw new ForbiddenException(`Saved workflow is not active (status=${ownership.status})`);
    }
    if (!skillVersion || !/^\d+$/.test(skillVersion)) {
      throw new ForbiddenException('Saved workflow requires an exact numeric skillVersion');
    }

    const rows = await this.prisma.$queryRawUnsafe<SavedSkillVersionRow[]>(
      `SELECT s.id AS skill_id,
              s.owner_user_id,
              s.status,
              v.version,
              v.plan_snapshot_json,
              v.fixed_input_json,
              v.plan_hash,
              v.input_hash
         FROM user_saved_skills s
         JOIN user_saved_skill_versions v ON v.skill_id = s.id
        WHERE s.id = $1::uuid
          AND s.owner_user_id = $2::uuid
          AND v.version = $3
        LIMIT 1`,
      skillId,
      ownerUserId,
      Number(skillVersion)
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException(`Saved workflow version ${skillVersion} not found`);
    }
    const actualPlanHash = computePlanHash(
      row.plan_snapshot_json as unknown as DeterministicPlanDraftV1
    );
    if (actualPlanHash !== row.plan_hash) {
      throw new BadRequestException('Saved workflow plan snapshot hash mismatch');
    }
    const actualInputHash = sanitizeSavedSkillInput(row.fixed_input_json).inputHash;
    if (actualInputHash !== row.input_hash) {
      throw new BadRequestException('Saved workflow fixed input hash mismatch');
    }
    return {
      skillId: row.skill_id,
      version: String(row.version),
      planSnapshot: row.plan_snapshot_json,
      fixedInput: row.fixed_input_json,
      planHash: row.plan_hash,
      inputHash: row.input_hash,
    };
  }

  private async findOwnership(
    skillId: string
  ): Promise<{ owner_user_id: string; status: string } | null> {
    if (!this.looksLikeUuid(skillId)) {
      return null;
    }
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ owner_user_id: string; status: string }>
    >(
      `SELECT owner_user_id, status
         FROM user_saved_skills
        WHERE id = $1::uuid
        LIMIT 1`,
      skillId
    );
    return rows[0] || null;
  }

  private looksLikeUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    );
  }
}
