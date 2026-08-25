import { CandidateRecipeService } from '../src/modules/experience-learning/candidate-recipe.service';

describe('CandidateRecipeService', () => {
  const service = new CandidateRecipeService({} as any);

  it('requires enough shadow evidence before approval', () => {
    expect(
      service.canPromote(
        { status: 'shadow', riskLevel: 'L0', shadowRuns: 19, shadowPasses: 19 },
        'approved'
      ).allowed
    ).toBe(false);
    expect(
      service.canPromote(
        { status: 'shadow', riskLevel: 'L0', shadowRuns: 20, shadowPasses: 19 },
        'approved'
      ).allowed
    ).toBe(true);
  });

  it('creates a versioned candidate under an advisory transaction lock', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'recipe-1', status: 'candidate', version: 1 }]),
    };
    const prisma = {
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
    };
    const transactionalService = new CandidateRecipeService(prisma as any);

    await expect(
      transactionalService.createCandidate({
        scopeType: 'user',
        scopeId: '00000000-0000-0000-0000-000000000001',
        intentFingerprint: 'a'.repeat(64),
        topologyDigest: 'b'.repeat(64),
        recipe: { nodes: [] },
        riskLevel: 'L0',
      })
    ).resolves.toEqual({ id: 'recipe-1', status: 'candidate', version: 1 });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      expect.stringContaining('user:00000000')
    );
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("'candidate'"),
      expect.any(String),
      'user',
      '00000000-0000-0000-0000-000000000001',
      'a'.repeat(64),
      'b'.repeat(64),
      JSON.stringify({ nodes: [] }),
      'L0'
    );
  });

  it('requires explicit approval and stricter evidence for active', () => {
    expect(
      service.canPromote(
        { status: 'canary', riskLevel: 'L2', shadowRuns: 50, shadowPasses: 50 },
        'active'
      ).allowed
    ).toBe(false);
    expect(
      service.canPromote(
        {
          status: 'canary',
          riskLevel: 'L2',
          shadowRuns: 50,
          shadowPasses: 49,
          approvedBy: 'admin-1',
        },
        'active'
      ).allowed
    ).toBe(true);
  });

  it('locks, validates and updates a promotion in one transaction', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        {
          status: 'shadow',
          riskLevel: 'L1',
          shadowRuns: 20,
          shadowPasses: 20,
          approvedBy: null,
        },
      ]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
    };
    const transactionalService = new CandidateRecipeService(prisma as any);

    await expect(
      transactionalService.promote(
        '00000000-0000-0000-0000-000000000001',
        'approved',
        '00000000-0000-0000-0000-000000000002'
      )
    ).resolves.toMatchObject({ status: 'approved', passRate: 1 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRawUnsafe.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
