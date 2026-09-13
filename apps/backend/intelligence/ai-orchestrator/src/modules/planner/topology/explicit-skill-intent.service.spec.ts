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

  it('does not treat contract topic keywords or attached filename in system context as an explicit invocation', () => {
    const confidentialityCard: CompactCapabilityCardV1 = {
      id: '16fb88e9-ba9c-4ab7-b508-f23adb1a821a',
      kind: 'skill',
      displayName: 'ConfidentialityAgreementGenerationWorkflow',
      summary: '保密协议/保密合同自动化生成工作流',
      goals: [
        'workflow',
        'ConfidentialityAgreementGenerationWorkflow',
        '保密合同',
        '保密协议',
        '保密合同生成',
        '保密协议生成',
      ],
      inputs: {},
      outputs: {},
    };
    const comparatorCard: CompactCapabilityCardV1 = {
      id: 'platform.document.contract-comparator',
      kind: 'skill',
      displayName: '合同文档智能比对与红线审查',
      summary: '对比两份合同文档',
      goals: ['contract-comparator', '合同比对', '比较合同'],
      inputs: {},
      outputs: {},
    };

    const userPromptWithContext =
      '比较合同，给出风险评估\n[系统上下文：用户已上传附件 (保密合同_202609130205.docx, 保密合同_202609140205.docx)]';

    expect(
      service.findExplicitlyRequestedSkills(userPromptWithContext, [
        confidentialityCard,
        comparatorCard,
      ]),
    ).toEqual([]);
  });

  it('recognizes explicit invocations with 运行/执行/调用 prefixes', () => {
    expect(
      service.findExplicitlyRequestedSkills('请帮我运行 Bark推送服务', cards).map((c) => c.id),
    ).toEqual(['bark-push']);

    expect(
      service.findExplicitlyRequestedSkills('执行 Bark推送服务', cards).map((c) => c.id),
    ).toEqual(['bark-push']);
  });

  it('recognizes when prompt is exactly the capability display name', () => {
    expect(
      service.findExplicitlyRequestedSkills('Bark推送服务', cards).map((c) => c.id),
    ).toEqual(['bark-push']);
  });
});

