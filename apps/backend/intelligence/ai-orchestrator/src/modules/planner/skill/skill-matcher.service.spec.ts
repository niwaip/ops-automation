import axios from 'axios';
import { SkillMatcherService } from './skill-matcher.service';

jest.mock('axios');

describe('SkillMatcherService deterministic explicit routing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('matches a distinctive Skill name before calling the LLM matcher', async () => {
    const service = new SkillMatcherService({} as any);
    const result = await service.matchSkill({
      userInput: '用 bark 推送',
      userId: 'user-1',
      availableSkills: [
        {
          skillId: 'skill-bark',
          executableVersion: '2.1.0',
          skillName: 'Bark推送服务',
          description: '向用户设备推送消息',
          triggerKeywords: ['bark', '推送'],
          paramsSchema: {
            properties: {
              content: { type: 'string', description: '推送正文', required: true },
            },
            required: ['content'],
          },
        },
        {
          skillId: 'skill-email',
          skillName: '邮件推送服务',
          description: '发送邮件',
          triggerKeywords: ['邮件', '推送'],
          paramsSchema: { properties: {}, required: [] },
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        skillId: 'skill-bark',
        skillVersion: '2.1.0',
        confidence: 0.99,
        matchReason: 'deterministic_routing_signal',
      })
    );
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('routes a subject phrase through the shared deterministic contract', async () => {
    const service = new SkillMatcherService({} as any);
    const result = await service.matchSkill({
      userInput: '上海的天气',
      userId: 'user-1',
      availableSkills: [
        {
          skillId: 'weather',
          skillName: '天气查询',
          triggerKeywords: ['HTTP 请求'],
          paramsSchema: { properties: {}, required: [] },
        },
        {
          skillId: 'report',
          skillName: '报表查询',
          triggerKeywords: ['报表'],
          paramsSchema: { properties: {}, required: [] },
        },
      ],
    });

    expect(result?.skillId).toBe('weather');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('routes a generic retrieval request to web search when it is the visible search skill', async () => {
    const service = new SkillMatcherService({} as any);
    const result = await service.matchSkill({
      userInput: '检索 deepseek harness 的安装方法',
      userId: 'user-1',
      availableSkills: [
        {
          skillId: 'platform.search.web',
          executableVersion: '1.0.0',
          skillName: '内置联网搜索',
          description: '检索公开互联网中的最新网页与新闻信息',
          triggerKeywords: ['联网搜索', '检索', '查找资料', '搜索资料'],
          paramsSchema: {
            properties: {
              query: { type: 'string', description: '检索词', required: true },
            },
            required: ['query'],
          },
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        skillId: 'platform.search.web',
        confidence: 0.99,
        matchReason: 'deterministic_routing_signal',
      })
    );
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('routes a find-news request to the default web search skill', async () => {
    const service = new SkillMatcherService({} as any);
    const result = await service.matchSkill({
      userInput: '查找 openclaw 2 的新闻',
      userId: 'user-1',
      availableSkills: [
        {
          skillId: 'platform.search.web',
          executableVersion: '1.0.3',
          skillName: '内置联网搜索',
          description: '检索公开互联网中的最新网页与新闻信息',
          triggerKeywords: ['联网搜索', '检索', '搜索', '查找', '查询', '新闻'],
          paramsSchema: {
            properties: {
              query: { type: 'string', description: '检索词', required: true },
            },
            required: ['query'],
          },
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        skillId: 'platform.search.web',
        confidence: 0.99,
        matchReason: 'deterministic_routing_signal',
      })
    );
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('preserves provider unavailability as a retryable match outcome', async () => {
    const service = new SkillMatcherService({} as any);
    (axios.isAxiosError as unknown as jest.Mock).mockReturnValueOnce(true);
    (axios.post as jest.Mock).mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 503,
        data: { code: 'SKILL_MATCH_MODEL_UNAVAILABLE', retryable: true },
      },
    });

    await expect(
      service.matchSkillAttempt({
        userInput: '未知业务意图',
        userId: 'user-1',
        availableSkills: [
          {
            skillId: 'one',
            skillName: '合同生成',
            triggerKeywords: ['合同'],
            paramsSchema: { properties: {}, required: [] },
          },
        ],
      })
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'unavailable',
        code: 'SKILL_MATCH_MODEL_UNAVAILABLE',
        retryable: true,
      })
    );
  });

  it('does not resolve an ambiguous generic keyword as an explicit Skill', async () => {
    const service = new SkillMatcherService({} as any);
    (axios.post as jest.Mock).mockResolvedValueOnce({ data: { match: null } });

    await service.matchSkill({
      userInput: '推送',
      userId: 'user-1',
      availableSkills: [
        {
          skillId: 'skill-bark',
          skillName: 'Bark推送服务',
          triggerKeywords: ['推送'],
          paramsSchema: { properties: {}, required: [] },
        },
        {
          skillId: 'skill-email',
          skillName: '邮件推送服务',
          triggerKeywords: ['推送'],
          paramsSchema: { properties: {}, required: [] },
        },
      ],
    });

    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it('forwards custom modelId to platform skills match endpoint when provided', async () => {
    const service = new SkillMatcherService({} as any);
    (axios.post as jest.Mock).mockResolvedValueOnce({ data: { match: null } });

    await service.matchSkill({
      userInput: '未知业务意图',
      userId: 'user-1',
      modelId: 'custom-selected-model',
      availableSkills: [
        {
          skillId: 'skill-1',
          skillName: '普通技能',
          triggerKeywords: ['普通'],
          paramsSchema: { properties: {}, required: [] },
        },
      ],
    });

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/skills/match'),
      expect.objectContaining({
        modelId: 'custom-selected-model',
      }),
      expect.any(Object)
    );
  });
});
