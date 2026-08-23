import { HabitAutoActivationService } from '../src/modules/experience-learning/habit-auto-activation.service';
import type { HabitCandidateRow } from '../src/modules/experience-learning/habit-learning.types';

describe('HabitAutoActivationService', () => {
  const originalActivationFlag = process.env.HABIT_LEARNING_ACTIVATION_ENABLED;
  const candidate: HabitCandidateRow = {
    id: '00000000-0000-0000-0000-000000000010',
    ownerUserId: '00000000-0000-0000-0000-000000000001',
    kind: 'workflow_reuse',
    status: 'shadow',
    riskLevel: 'external_commit',
    intentKey: '微博总结bark推送',
    savedSkillId: '00000000-0000-0000-0000-000000000020',
    savedVersion: 1,
    evidenceJson: { explicitUserSave: true, planHash: 'plan-hash' },
    reviewJson: {
      decision: 'pass',
      reusedExactVersionReview: true,
      planChanged: false,
    },
    shadowJson: { executedSideEffects: false },
    sourceRunId: '00000000-0000-0000-0000-000000000030',
    policyVersion: 'habit-policy/v2',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createService = () => {
    const tx = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
    const prisma = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    return { prisma, tx, service: new HabitAutoActivationService(prisma as never) };
  };

  afterEach(() => {
    if (originalActivationFlag === undefined) {
      delete process.env.HABIT_LEARNING_ACTIVATION_ENABLED;
    } else {
      process.env.HABIT_LEARNING_ACTIVATION_ENABLED = originalActivationFlag;
    }
  });

  it('automatically activates an exact saved version after its AI review passes', async () => {
    const { prisma, tx, service } = createService();
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ aiReviewJson: { decision: 'pass' } }]);

    const result = await service.activateIfAiApproved(candidate);

    expect(result).toEqual({ activated: true, reason: 'activated' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_habits'),
      expect.any(String),
      candidate.ownerUserId,
      'workflow_reuse',
      candidate.intentKey,
      candidate.savedSkillId,
      1,
      expect.any(String),
      candidate.id,
      'plan-hash'
    );
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'active'"),
      expect.stringContaining('administratorApprovalRequired'),
      candidate.id
    );
  });

  it('does not activate warning reviews', async () => {
    const { prisma, service } = createService();
    const result = await service.activateIfAiApproved({
      ...candidate,
      reviewJson: { ...candidate.reviewJson, decision: 'warning' },
    });

    expect(result).toEqual({ activated: false, reason: 'review_not_passed' });
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('supports an explicit enterprise kill switch without changing the default', async () => {
    process.env.HABIT_LEARNING_ACTIVATION_ENABLED = 'false';
    const { prisma, service } = createService();

    expect(service.isEnabled()).toBe(false);
    await expect(service.activateIfAiApproved(candidate)).resolves.toEqual({
      activated: false,
      reason: 'disabled',
    });
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('reconciles previously approved shadow candidates without administrator action', async () => {
    const { prisma, service } = createService();
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([candidate])
      .mockResolvedValueOnce([{ aiReviewJson: { decision: 'pass' } }]);

    await expect(service.activatePendingAiApproved()).resolves.toEqual({
      considered: 1,
      activated: 1,
      failed: 0,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
