import { HabitLearningService } from '../src/modules/experience-learning/habit-learning.service';

describe('HabitLearningService', () => {
  const createService = () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(),
    };
    const autoActivation = { isEnabled: jest.fn().mockReturnValue(true) };
    return {
      prisma,
      autoActivation,
      service: new HabitLearningService(prisma as never, autoActivation as never),
    };
  };

  it('keeps personalization opt-in and user-scoped', async () => {
    const { prisma, service } = createService();
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([
        { recommendationEnabled: true, updatedAt: new Date('2026-08-23T00:00:00Z') },
      ])
      .mockResolvedValueOnce([]);

    const result = await service.updatePersonalization(
      '00000000-0000-0000-0000-000000000001',
      true
    );

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('user_personalization_preferences'),
      '00000000-0000-0000-0000-000000000001',
      true
    );
    expect(result.personalization).toEqual({
      recommendationEnabled: true,
      updatedAt: '2026-08-23T00:00:00.000Z',
    });
  });

  it('does not expose the raw owner id in administrator candidate lists', async () => {
    const { prisma, service } = createService();
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'candidate-1',
        ownerUserId: 'secret-user-id',
        userKey: 'a1b2c3d4e5f6',
        kind: 'workflow_reuse',
        status: 'shadow',
        riskLevel: 'external_commit',
        intentKey: '微博总结bark推送',
        savedSkillId: 'skill-1',
        savedVersion: 1,
        evidenceJson: {},
        reviewJson: {},
        shadowJson: { executedSideEffects: false },
        sourceRunId: 'run-1',
        policyVersion: 'habit-policy/v2',
        workflowName: '微博总结 Bark 推送',
        createdAt: new Date('2026-08-23T00:00:00Z'),
        updatedAt: new Date('2026-08-23T00:00:00Z'),
      },
    ]);

    const result = await service.listCandidates();

    expect(result.candidates[0]).not.toHaveProperty('ownerUserId');
    expect(result.candidates[0]).toMatchObject({
      userKey: 'a1b2c3d4e5f6',
      shadowJson: { executedSideEffects: false },
    });
  });

  it('reports AI auto-activation state without requiring administrator approval', async () => {
    const { prisma, autoActivation, service } = createService();
    prisma.$queryRawUnsafe.mockResolvedValue([]);
    const overview = await service.getOverview();
    expect(autoActivation.isEnabled).toHaveBeenCalled();
    expect(overview.activationEnabled).toBe(true);
  });
});
