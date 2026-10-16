import {
  containsRoutingAlias,
  hasRoutingSignal,
  createBuiltinRoutingPolicySnapshot,
  isOccurrenceNegated,
} from './routing-policy.matcher';

describe('routing-policy.matcher negation handling', () => {
  const policy = createBuiltinRoutingPolicySnapshot();

  describe('isOccurrenceNegated', () => {
    it('detects Chinese negation prefixes', () => {
      const text = '请不要搜索任何内容';
      const idx = text.indexOf('搜索');
      expect(isOccurrenceNegated(text, idx)).toBe(true);
    });

    it('detects "无需", "不用", "禁止", "切勿"', () => {
      for (const prefix of ['无需', '不用', '禁止', '切勿', '别']) {
        const text = `${prefix}联网检索`;
        const idx = text.indexOf('检索');
        expect(isOccurrenceNegated(text, idx)).toBe(true);
      }
    });

    it('returns false when no negation prefix is present', () => {
      const text = '请帮我搜索Python最新版本';
      const idx = text.indexOf('搜索');
      expect(isOccurrenceNegated(text, idx)).toBe(false);
    });
  });

  describe('containsRoutingAlias', () => {
    it('returns false when all occurrences are negated', () => {
      expect(containsRoutingAlias('不要搜索，也不要读取工作空间', '搜索')).toBe(false);
      expect(containsRoutingAlias('无需联网，不用查询', '查询')).toBe(false);
      expect(containsRoutingAlias('禁止搜索任何外网资料', '搜索')).toBe(false);
    });

    it('returns true when a non-negated occurrence exists alongside a negated one', () => {
      expect(containsRoutingAlias('不要搜索Java，请搜索Python官方文档', '搜索')).toBe(true);
    });

    it('returns true for normal affirmative utterances', () => {
      expect(containsRoutingAlias('搜索最新的科技新闻', '搜索')).toBe(true);
      expect(containsRoutingAlias('查找北京今天天气', '查找')).toBe(true);
    });
  });

  describe('hasRoutingSignal', () => {
    it('does not trigger search signal on negated search prompt', () => {
      const prompt = '不要联网，不要搜索，也不要读取工作空间。只计算以下虚构销售数据：A店120元，B店80元。返回总额及占比。';
      expect(hasRoutingSignal(prompt, 'search', policy)).toBe(false);
    });

    it('triggers search signal on affirmative search prompt', () => {
      const prompt = '搜索Python官方最新稳定版本是什么？';
      expect(hasRoutingSignal(prompt, 'search', policy)).toBe(true);
    });
  });
});
