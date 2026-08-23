import type { CompactCapabilityCardV1 } from '@ops/backend-deterministic-plan';
import { ExplicitSkillIntentService } from './explicit-skill-intent.service';

describe('ExplicitSkillIntentService', () => {
  const service = new ExplicitSkillIntentService();
  const cards: CompactCapabilityCardV1[] = [
    {
      id: 'web-search',
      kind: 'skill',
      displayName: 'WebSearchWorkflow',
      summary: '搜索网络内容',
      goals: ['search'],
      inputs: { query: 'string' },
      outputs: { results: 'news_item_list' },
    },
    {
      id: 'bark-push',
      kind: 'skill',
      displayName: 'Bark推送服务',
      summary: '推送内容到设备',
      goals: ['push', 'Bark推送服务'],
      inputs: { content: 'string' },
      outputs: { code: 'integer' },
    },
  ];

  it('recognizes a capability explicitly invoked by name', () => {
    expect(
      service.findExplicitlyRequestedSkills(
        '查询微博热点并总结，最后用 Bark 进行推送',
        cards,
      ).map((card) => card.id),
    ).toEqual(['bark-push']);
  });

  it('does not treat a brand mentioned only as search subject as an invocation', () => {
    expect(
      service.findExplicitlyRequestedSkills('查询 Bark 的最新新闻并总结', cards),
    ).toEqual([]);
  });
});
