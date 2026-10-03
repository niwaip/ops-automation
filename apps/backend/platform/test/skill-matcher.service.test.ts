import axios from 'axios';
import {
  SkillConfigDto,
  SkillMatcherService,
  SkillContrastiveCompilerService,
} from '@ops/skill-registry/registry';

jest.mock('axios');

function skill(index: number, overrides: Partial<SkillConfigDto> = {}): SkillConfigDto {
  return {
    id: `skill-${index}`,
    name: `能力${index}`,
    description: `能力${index}的简短描述`,
    triggerKeywords: [`关键词${index}`],
    paramsSchema: { properties: {}, required: [] },
    executionFlowTemplateIds: [],
    executionFlow: [],
    tools: [],
    isActive: true,
    isPublished: true,
    ...overrides,
  };
}

describe('platform SkillMatcherService progressive disclosure', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves a distinctive explicit capability without a model call', async () => {
    const service = new SkillMatcherService();
    const result = await service.matchSkillWithAI('用 bark 推送', 'user-1', async () => [
      skill(1, { name: 'Bark推送服务', triggerKeywords: ['bark', '推送'] }),
      skill(2, { name: '邮件推送服务', triggerKeywords: ['邮件', '推送'] }),
    ]);

    expect(result).toEqual(
      expect.objectContaining({
        skillName: 'Bark推送服务',
        matchReason: 'deterministic_routing_signal',
      })
    );
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('uses a generic derived routing signal without a model call', async () => {
    const service = new SkillMatcherService();
    const result = await service.matchSkillWithAI('上海的天气', 'user-1', async () => [
      skill(1, { name: '天气查询', triggerKeywords: ['HTTP 请求'] }),
      skill(2, { name: '报表查询', triggerKeywords: ['报表'] }),
    ]);

    expect(result).toEqual(
      expect.objectContaining({
        skillName: '天气查询',
        matchReason: 'deterministic_routing_signal',
      })
    );
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('routes a legacy compound browser skill name by a distinctive phrase without a model call', async () => {
    const service = new SkillMatcherService();
    const result = await service.matchSkillWithAI('打开网页', 'user-1', async () => [
      skill(1, {
        name: '打开网页 总结信息',
        triggerKeywords: ['打开网页 总结信息'],
      }),
    ]);

    expect(result).toEqual(
      expect.objectContaining({
        skillName: '打开网页 总结信息',
        matchReason: 'deterministic_routing_signal',
      })
    );
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('reports model unavailability instead of a false no-match result', async () => {
    (axios.post as jest.Mock).mockRejectedValueOnce(new Error('provider unavailable'));
    const service = new SkillMatcherService();

    await expect(
      service.matchSkillWithAI('无法确定的业务请求', 'user-1', async () => [skill(1)])
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SKILL_MATCH_MODEL_UNAVAILABLE', retryable: true }),
    });
  });

  it('discloses at most five short candidate cards to the matcher model', async () => {
    (axios.post as jest.Mock).mockResolvedValueOnce({
      data: { result: '{"matchedSkill":null,"confidence":0,"reason":"none"}' },
    });
    const service = new SkillMatcherService();
    const skills = Array.from({ length: 9 }, (_, index) =>
      skill(index, {
        description: `${'长描述'.repeat(150)}-${index}`,
      })
    );

    await service.matchSkillWithAI('查找一个没有显式名称的能力', 'user-1', async () => skills);

    const request = (axios.post as jest.Mock).mock.calls[0][1] as { prompt: string };
    expect((request.prompt.match(/<skill>/g) || []).length).toBe(5);
    expect(request.prompt).not.toContain('长描述'.repeat(150));
    expect((axios.post as jest.Mock).mock.calls[0][2]).toEqual(
      expect.objectContaining({ timeout: 45000 })
    );
  });

  it('forwards custom modelId to ai-orchestrator model call when provided', async () => {
    (axios.post as jest.Mock).mockResolvedValueOnce({
      data: { result: '{"matchedSkill":null,"confidence":0,"reason":"none"}' },
    });
    const service = new SkillMatcherService();

    await service.matchSkillWithAI(
      '查找一个没有显式名称的能力',
      'user-1',
      async () => [skill(1)],
      'custom-model-deepseek'
    );

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/ai/model/call'),
      expect.objectContaining({
        modelId: 'custom-model-deepseek',
      }),
      expect.objectContaining({ timeout: 45000 })
    );
  });

  it('short-circuits guide/inquiry queries like "deepseek harness的安装方法" without calling AI', async () => {
    const service = new SkillMatcherService();
    const skills = [
      skill(1, {
        name: '登录并且调用ai',
        description: '登录系统并调用AI助手进行智能问答',
        triggerKeywords: ['登录调用ai'],
      }),
    ];

    const result = await service.matchSkillWithAI(
      'deepseek harness的安装方法',
      'user-1',
      async () => skills
    );

    expect(result).toBeNull();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('filters out skills matching negativeKeywords from candidates', async () => {
    const service = new SkillMatcherService();
    const skills = [
      skill(1, {
        name: '自动系统配置',
        description: '自动配置生产服务器',
        triggerKeywords: ['自动配置'],
        apiEndpoints: {
          runtimeMetadata: {
            negativeKeywords: ['配置教程', '配置指南'],
          },
        },
      }),
    ];

    const result = await service.matchSkillWithAI(
      '自动配置教程',
      'user-1',
      async () => skills
    );

    expect(result).toBeNull();
    expect(axios.post).not.toHaveBeenCalled();
  });

  describe('SkillContrastiveCompilerService compiled disambiguation', () => {
    let compiler: SkillContrastiveCompilerService;
    let matcher: SkillMatcherService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        skillConfig: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
      };
      compiler = new SkillContrastiveCompilerService(mockPrisma);
      matcher = new SkillMatcherService();
    });

    const userSkills: SkillConfigDto[] = [
      skill(1, {
        id: 'skill-login-ai',
        name: '登录并且调用ai',
        description: '登录指定的业务系统并调用智能AI问答助手完成业务流',
        triggerKeywords: ['登录', '调用ai'],
      }),
      skill(2, {
        id: 'skill-kb-search',
        name: '知识库检索',
        description: '在企业专属知识库中检索业务问答文档与规范',
        triggerKeywords: ['知识库', '文档检索'],
      }),
    ];

    it('Case 1: User asks "deepseek harness的安装方法" -> zero-token rejection, 0 browser sessions allocated', async () => {
      const profiles = await compiler.compileSkills(userSkills);
      // Hydrate compiled metadata onto skills
      const compiledSkills = userSkills.map((s) => {
        const p = profiles.get(s.id);
        return {
          ...s,
          apiEndpoints: {
            runtimeMetadata: {
              routingAliases: p?.positiveSignals,
              negativeKeywords: p?.negativeSignals,
            },
          },
        };
      });

      const result = await matcher.matchSkillWithAI(
        'deepseek harness的安装方法',
        'user-1',
        async () => compiledSkills
      );

      expect(result).toBeNull();
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('Case 2: User asks "登录并且调用ai" -> matches deterministically via compiled positive signals with 0 LLM calls', async () => {
      const profiles = await compiler.compileSkills(userSkills);
      const compiledSkills = userSkills.map((s) => {
        const p = profiles.get(s.id);
        return {
          ...s,
          apiEndpoints: {
            runtimeMetadata: {
              routingAliases: p?.positiveSignals,
              negativeKeywords: p?.negativeSignals,
            },
          },
        };
      });

      const result = await matcher.matchSkillWithAI(
        '登录并且调用ai',
        'user-1',
        async () => compiledSkills
      );

      expect(result).not.toBeNull();
      expect(result?.skillName).toBe('登录并且调用ai');
      expect(result?.confidence).toBe(0.99);
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('Case 3: Peer conflict isolation - user asks "知识库检索" -> matches KB skill, login skill is blocked by negative keywords', async () => {
      const profiles = await compiler.compileSkills(userSkills);
      const compiledSkills = userSkills.map((s) => {
        const p = profiles.get(s.id);
        return {
          ...s,
          apiEndpoints: {
            runtimeMetadata: {
              routingAliases: p?.positiveSignals,
              negativeKeywords: p?.negativeSignals,
            },
          },
        };
      });

      const result = await matcher.matchSkillWithAI(
        '知识库检索',
        'user-1',
        async () => compiledSkills
      );

      expect(result).not.toBeNull();
      expect(result?.skillName).toBe('知识库检索');
      expect(result?.confidence).toBe(0.99);
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('Case 4: Employee permission isolation - different employees see different skill sets with customized contrastive features', async () => {
      // Enterprise Skill Catalog
      const opsSkill = skill(10, {
        id: 'skill-ops-restart',
        name: '重启生产服务器',
        description: '对指定运维集群中的生产服务器执行安全重启操作',
        triggerKeywords: ['重启服务器', '运维重启'],
      });
      const hrSkill = skill(20, {
        id: 'skill-hr-salary',
        name: '查询员工薪资',
        description: '财务与HR部门专属功能，查看员工当月薪酬与发放记录',
        triggerKeywords: ['员工薪资', '薪酬查询'],
      });

      // Employee Alice (Ops): Only has opsSkill
      const aliceSkills = [opsSkill];
      const aliceProfiles = await compiler.compileSkills(aliceSkills);
      const aliceHydrated = aliceSkills.map((s) => ({
        ...s,
        apiEndpoints: {
          runtimeMetadata: {
            routingAliases: aliceProfiles.get(s.id)?.positiveSignals,
            negativeKeywords: aliceProfiles.get(s.id)?.negativeSignals,
          },
        },
      }));

      // Employee Bob (HR): Only has hrSkill
      const bobSkills = [hrSkill];
      const bobProfiles = await compiler.compileSkills(bobSkills);
      const bobHydrated = bobSkills.map((s) => ({
        ...s,
        apiEndpoints: {
          runtimeMetadata: {
            routingAliases: bobProfiles.get(s.id)?.positiveSignals,
            negativeKeywords: bobProfiles.get(s.id)?.negativeSignals,
          },
        },
      }));

      // Mock model fallback: if model is asked about unrelated candidate, it returns null
      (axios.post as jest.Mock).mockResolvedValue({
        data: { result: '{"matchedSkill":null,"confidence":0}' },
      });

      // 1. Alice asks to query salary -> not permitted, returns null (cannot match HR skill)
      const aliceAttempt = await matcher.matchSkillWithAI(
        '查询员工薪资',
        'alice-ops',
        async () => aliceHydrated
      );
      expect(aliceAttempt).toBeNull();

      // 2. Alice asks to restart server -> permitted and matches deterministically (0 Token)
      const aliceOpsMatch = await matcher.matchSkillWithAI(
        '重启生产服务器',
        'alice-ops',
        async () => aliceHydrated
      );
      expect(aliceOpsMatch).not.toBeNull();
      expect(aliceOpsMatch?.skillName).toBe('重启生产服务器');

      // 3. Bob asks to restart server -> not permitted, returns null (0 Token, no side-effect)
      const bobAttempt = await matcher.matchSkillWithAI(
        '重启生产服务器',
        'bob-hr',
        async () => bobHydrated
      );
      expect(bobAttempt).toBeNull();

      // 4. Bob asks to query salary -> permitted and matches deterministically (0 Token)
      const bobHrMatch = await matcher.matchSkillWithAI(
        '查询员工薪资',
        'bob-hr',
        async () => bobHydrated
      );
      expect(bobHrMatch).not.toBeNull();
      expect(bobHrMatch?.skillName).toBe('查询员工薪资');

      // Authorized operations match deterministically with 0 LLM tokens
      expect(aliceOpsMatch?.matchReason).toBe('deterministic_routing_signal');
      expect(bobHrMatch?.matchReason).toBe('deterministic_routing_signal');
    });
  });
});
