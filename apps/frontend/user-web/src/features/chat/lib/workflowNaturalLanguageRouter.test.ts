import { describe, it, expect } from 'vitest';
import { extractContractEntities } from './workflowNaturalLanguageRouter';

describe('workflowNaturalLanguageRouter - extractContractEntities', () => {
  it('correctly extracts party A address without being overwritten by party B address or truncated', () => {
    const prompt =
      '请生成一份保密协议。甲方是北京测试科技公司，地址是北京王府井大街100号；乙方是上海实测智能公司，地址为上海浦东新区陆家嘴环路1000号。合作主题为人工智能大模型联合研发与商业化合作，保密期限3年。本协议仅用于系统测试。';

    const entities = extractContractEntities(prompt);

    expect(entities.counterpartyAddress).toBe('北京王府井大街100号');
    expect(entities.cooperationSubject).toBe('人工智能大模型联合研发与商业化合作');
    expect(entities.durationYears).toBe(3);
  });

  it('correctly identifies counterparty address when explicit prefix is used', () => {
    const prompt = '甲方测试公司，相对方地址位于北京市朝阳区酒仙桥路4号电子城，保密期限五年';
    const entities = extractContractEntities(prompt);

    expect(entities.counterpartyAddress).toContain('北京市朝阳区酒仙桥路4号');
    expect(entities.durationYears).toBe(5);
  });
});
