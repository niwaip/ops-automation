import { TaskPolicyReplayService } from '../src/modules/experience-learning/task-policy-replay.service';

describe('TaskPolicyReplayService', () => {
  const policy = {
    id: 'p1',
    digest: 'digest-1',
    status: 'draft',
    aliases: [
      { canonicalCommand: 'web_extract', alias: '打开网页', matchType: 'phrase', status: 'active' },
      { canonicalCommand: 'summarize', alias: '总结', matchType: 'phrase', status: 'active' },
    ],
    recipes: [{
      recipeKey: 'web_extract_then_summarize',
      requiredCommandsJson: ['web_extract', 'summarize'],
      stepsJson: [
        { ref: 'n1', kind: 'skill', role: 'web_extract', dependsOn: [] },
        { ref: 'n2', kind: 'llm_operation', role: 'summarize', dependsOn: ['n1'] },
      ],
      completionClaimsJson: ['summary_generated'],
    }],
    bindings: [{ capabilityRole: 'web_extract', capabilityId: 'platform.web.extract' }],
  };
  const prisma = {
    taskPolicySet: { findUnique: jest.fn().mockResolvedValue(policy) },
    taskPolicyAuditLog: { create: jest.fn(), findFirst: jest.fn() },
  } as any;
  const registry = {
    validateDefinition: jest.fn().mockReturnValue({ valid: true, errors: [] }),
  } as any;
  const service = new TaskPolicyReplayService(prisma, registry);

  beforeEach(() => jest.clearAllMocks());

  it('passes a generated golden case for a complete fixed command chain', async () => {
    await expect(service.run('p1', 'admin-1')).resolves.toMatchObject({
      passed: true,
      policyDigest: 'digest-1',
      gates: { golden: { total: 1, passedCases: 1, passRate: 1 } },
    });
    expect(prisma.taskPolicyAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'policy.replay.passed' }) })
    );
  });

  it('rejects publication if the passing replay belongs to an older digest', async () => {
    prisma.taskPolicyAuditLog.findFirst.mockResolvedValue({ detailJson: { policyDigest: 'old' } });
    await expect(service.assertPublishable('p1', 'digest-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TASK_POLICY_REPLAY_REQUIRED' }),
    });
  });
});
