import { CapabilityReleaseService } from '../src/modules/capability-release/capability-release.service';

describe('CapabilityReleaseService', () => {
  const createService = () => {
    const prisma = {
      $executeRawUnsafe: jest.fn(),
    };

    const service = new CapabilityReleaseService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { service, prisma };
  };

  it('archives the release and deactivates its published skill', async () => {
    const { service, prisma } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-1',
      publishedSkillId: 'skill-1',
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);

    const result = await service.archiveRelease('release-1', 'user-1');

    expect(result).toEqual({ success: true, archivedId: 'release-1' });
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE capability_releases'),
      'release-1',
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE skill_configs'),
      'skill-1',
    );
    expect((service as any).insertAuditEvent).toHaveBeenCalledWith(
      'release-1',
      'published_skill_deactivated',
      'user-1',
      true,
      '归档 Release 时停用已发布 Skill: skill-1',
      { publishedSkillId: 'skill-1' },
    );
    expect((service as any).insertAuditEvent).toHaveBeenCalledWith(
      'release-1',
      'release_archived',
      'user-1',
      true,
      '归档 Capability Release',
    );
  });
});
