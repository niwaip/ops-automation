import axios from 'axios';
import { SkillMatcherService } from './skill-matcher.service';

jest.mock('axios');

describe('SkillMatcherService deterministic explicit routing', () => {
  it('matches a distinctive Skill name before calling the LLM matcher', async () => {
    const service = new SkillMatcherService({} as any);
    const result = await service.matchSkill({
      userInput: '用 bark 推送',
      userId: 'user-1',
      availableSkills: [
        {
          skillId: 'skill-bark',
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
        confidence: 0.99,
        matchReason: 'deterministic_explicit_match',
      })
    );
    expect(axios.post).not.toHaveBeenCalled();
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
});
