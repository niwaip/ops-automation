import { ScopedMemoryService } from '../src/modules/experience-learning/scoped-memory.service';

describe('ScopedMemoryService', () => {
  it('passes only authorized organization, team and user scopes to precedence query', async () => {
    const prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ scopeType: 'user' }]) };
    const service = new ScopedMemoryService(prisma as any);
    await expect(
      service.resolve(
        { organizationId: 'org-1', teamIds: ['team-1'], userId: 'user-1' },
        'routing_preference',
        'daily_report'
      )
    ).resolves.toEqual({ scopeType: 'user' });
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("WHEN 'user' THEN 3"),
      'routing_preference',
      'daily_report',
      'user-1',
      ['team-1'],
      'org-1'
    );
  });

  it('increments version on an explicit governed upsert', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'memory-1', version: 2 }]),
    };
    const service = new ScopedMemoryService(prisma as any);
    await expect(
      service.upsert({
        scopeType: 'user',
        scopeId: 'user-1',
        kind: 'routing_preference',
        memoryKey: 'daily_report',
        value: { recipeId: 'recipe-1' },
        source: 'explicit',
      })
    ).resolves.toEqual({ id: 'memory-1', version: 2 });
  });

  it('derives organization and team scope from active governed memberships', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        { organizationId: 'org-1', teamIds: ['team-1', 'team-2'] },
      ]),
    };
    const service = new ScopedMemoryService(prisma as any);

    await expect(
      service.resolveTrustedScope({ userId: 'user-1', activeOrganizationId: 'org-1' })
    ).resolves.toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      teamIds: ['team-1', 'team-2'],
    });
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("membership.status = 'active'"),
      'user-1',
      'org-1'
    );
  });
});
