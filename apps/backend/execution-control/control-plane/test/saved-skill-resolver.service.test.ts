import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SavedSkillResolverService } from '../src/modules/saved-skill/saved-skill-resolver.service';
import { computePlanHash } from '@ops/backend-deterministic-plan';
import { sanitizeSavedSkillInput } from '../src/modules/saved-skill/saved-skill-input-sanitizer';

const SKILL_ID = 'c1f6d59f-1c56-4a31-9e31-8e2553cbf180';
const OWNER_ID = '16a2c274-416c-46d2-9f0c-2cb8b53ace39';

describe('SavedSkillResolverService', () => {
  it('returns null for an ordinary non-saved skill id', async () => {
    const prisma = { $queryRawUnsafe: jest.fn() } as any;
    const service = new SavedSkillResolverService(prisma);

    await expect(service.resolveForExecution(OWNER_ID, 'builtin.news', undefined)).resolves.toBeNull();
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('requires ownership and an exact version', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([
        { owner_user_id: OWNER_ID, status: 'active' },
      ]),
    } as any;
    const service = new SavedSkillResolverService(prisma);

    await expect(service.resolveForExecution('another-user', SKILL_ID, '1')).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('resolves the immutable snapshot for the requested owner and version', async () => {
    const planSnapshot = {
      schemaVersion: 'deterministic-plan/v1' as const,
      plannerVersion: '1',
      catalogVersion: '1',
      planType: 'sequential' as const,
      objective: '微博热点总结',
      originalRequest: '查看微博热点并总结',
      status: 'frozen' as const,
      nodes: [],
      finalOutputs: [],
    };
    const fixedInput = { market: 'CN' };
    const prisma = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ owner_user_id: OWNER_ID, status: 'active' }])
        .mockResolvedValueOnce([
          {
            skill_id: SKILL_ID,
            owner_user_id: OWNER_ID,
            status: 'active',
            version: 2,
            plan_snapshot_json: planSnapshot,
            fixed_input_json: fixedInput,
            plan_hash: computePlanHash(planSnapshot),
            input_hash: sanitizeSavedSkillInput(fixedInput).inputHash,
          },
        ]),
    } as any;
    const service = new SavedSkillResolverService(prisma);

    await expect(service.resolveForExecution(OWNER_ID, SKILL_ID, '2')).resolves.toEqual({
      skillId: SKILL_ID,
      version: '2',
      planSnapshot,
      fixedInput,
      planHash: computePlanHash(planSnapshot),
      inputHash: sanitizeSavedSkillInput(fixedInput).inputHash,
    });
  });

  it('rejects an unavailable saved workflow version', async () => {
    const prisma = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ owner_user_id: OWNER_ID, status: 'active' }])
        .mockResolvedValueOnce([]),
    } as any;
    const service = new SavedSkillResolverService(prisma);

    await expect(service.resolveForExecution(OWNER_ID, SKILL_ID, '9')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
