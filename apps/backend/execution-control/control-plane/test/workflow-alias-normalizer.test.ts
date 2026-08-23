import { normalizeWorkflowAlias } from '../src/modules/saved-skill/workflow-alias-normalizer';

describe('normalizeWorkflowAlias', () => {
  it('normalizes equivalent Chinese workflow requests to the same deterministic key', () => {
    expect(normalizeWorkflowAlias('查看微博的热点，然后给出总结，用 Bark 推送')).toBe(
      normalizeWorkflowAlias('查询微博热点并进行总结，最后通过 Bark 推送')
    );
  });

  it('preserves terminal action tokens used by hard routing filters', () => {
    expect(normalizeWorkflowAlias('每日微博摘要 Bark 推送')).toContain('bark');
  });

  it('returns an empty key for punctuation-only aliases', () => {
    expect(normalizeWorkflowAlias('，。！？')).toBe('');
  });
});
