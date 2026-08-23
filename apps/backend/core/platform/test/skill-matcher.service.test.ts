import axios from 'axios';
import { SkillConfigDto } from '../src/modules/skill/interfaces';
import { SkillMatcherService } from '../src/modules/skill/skill-matcher.service';

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
        matchReason: 'deterministic_explicit_match',
      })
    );
    expect(axios.post).not.toHaveBeenCalled();
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
      expect.objectContaining({ timeout: 15000 })
    );
  });
});
