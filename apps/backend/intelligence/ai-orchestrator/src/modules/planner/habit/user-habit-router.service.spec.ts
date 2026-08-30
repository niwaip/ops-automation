import { UserHabitRouterService } from './user-habit-router.service';

describe('UserHabitRouterService', () => {
  let service: UserHabitRouterService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      $queryRawUnsafe: jest.fn(),
    };
    service = new UserHabitRouterService(mockPrisma);
  });

  it('returns none when userId or userRequest is missing or no habits exist', async () => {
    expect(await service.evaluateHabit(undefined, '测试')).toEqual({ type: 'none', confidence: 0 });
    expect(await service.evaluateHabit('user-1', '')).toEqual({ type: 'none', confidence: 0 });

    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);
    expect(await service.evaluateHabit('user-1', '测试请求')).toEqual({ type: 'none', confidence: 0 });
  });

  it('triggers exact 0-token topology reuse when habit matches with high confidence', async () => {
    const habitRecord = {
      id: 'habit-1',
      ownerUserId: 'user-1',
      kind: 'workflow_reuse',
      status: 'active',
      intentKey: '打开网页查正文总结',
      savedSkillId: 'skill-saved-1',
      savedVersion: 1,
      valueJson: { name: '打开网页获取正文并进行总结' },
    };

    const planSnapshot = {
      objective: '打开网页获取正文并进行总结',
      nodes: [
        { kind: 'skill', skillId: 'skill-web', dependsOn: [] },
        { kind: 'llm_operation', operationId: 'summarize_text', dependsOn: ['n1'] },
      ],
      finalOutputs: [{ isArtifact: false }],
    };

    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([habitRecord])
      .mockResolvedValueOnce([{ planSnapshotJson: planSnapshot }]);

    const result = await service.evaluateHabit('user-1', '打开网页查正文总结');

    expect(result.type).toBe('exact_topology');
    expect(result.confidence).toBe(0.99);
    expect(result.topology).toBeDefined();
    expect(result.topology?.nodes).toHaveLength(2);
    expect(result.topology?.matchDecision).toBe('matched');
  });

  it('provides an exemplar when request is partially similar to a user habit', async () => {
    const habitRecord = {
      id: 'habit-2',
      ownerUserId: 'user-1',
      kind: 'workflow_reuse',
      status: 'active',
      intentKey: '搜索热点并总结',
      savedSkillId: null,
      savedVersion: null,
      valueJson: {},
    };

    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([habitRecord]);

    const result = await service.evaluateHabit('user-1', '搜索科技新闻并总结');

    expect(result.type).toBe('exemplar');
    expect(result.confidence).toBeGreaterThanOrEqual(0.3);
    expect(result.exemplarPrompt).toContain('搜索热点并总结');
  });
});
