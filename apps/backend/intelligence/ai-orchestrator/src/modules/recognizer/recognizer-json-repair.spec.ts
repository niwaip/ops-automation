import { extractJsonCandidate, tryParseOrRepairJson } from './recognizer-json-repair';

describe('recognizer-json-repair', () => {
  describe('tryParseOrRepairJson', () => {
    it('returns direct valid JSON untouched', () => {
      const input = '{"name": "test", "count": 1}';
      expect(tryParseOrRepairJson(input)).toBe(input);
      expect(JSON.parse(tryParseOrRepairJson(input)!)).toEqual({ name: 'test', count: 1 });
    });

    it('repairs leading double braces with single closing brace (real incident: {{"a":"b"})', () => {
      const input = '{"partyA.name":"豆包有限公司", "cooperation.subject":"AI模型开发"}';
      const malformed = '{' + input; // {{"partyA.name":...}
      const repaired = tryParseOrRepairJson(malformed);
      expect(repaired).toBeDefined();
      expect(JSON.parse(repaired!)).toEqual({
        'partyA.name': '豆包有限公司',
        'cooperation.subject': 'AI模型开发',
      });
    });

    it('repairs leading double braces with double closing braces ({{"a":"b"}})', () => {
      const malformed = '{{"partyA.name":"豆包有限公司", "duration":3}}';
      const repaired = tryParseOrRepairJson(malformed);
      expect(repaired).toBeDefined();
      expect(JSON.parse(repaired!)).toEqual({
        'partyA.name': '豆包有限公司',
        duration: 3,
      });
    });

    it('repairs trailing commas', () => {
      const malformed = '{"a": 1, "b": "hello",}';
      const repaired = tryParseOrRepairJson(malformed);
      expect(repaired).toBeDefined();
      expect(JSON.parse(repaired!)).toEqual({ a: 1, b: 'hello' });
    });

    it('repairs unclosed curly braces due to truncation', () => {
      const malformed = '{"partyA.name":"豆包有限公司", "nested":{"city":"Beijing"';
      const repaired = tryParseOrRepairJson(malformed);
      expect(repaired).toBeDefined();
      expect(JSON.parse(repaired!)).toEqual({
        'partyA.name': '豆包有限公司',
        nested: { city: 'Beijing' },
      });
    });

    it('returns undefined for non-JSON text', () => {
      expect(tryParseOrRepairJson('抱歉，我无法识别相关参数。')).toBeUndefined();
      expect(tryParseOrRepairJson('')).toBeUndefined();
    });
  });

  describe('extractJsonCandidate', () => {
    it('extracts from markdown code fences even when malformed with {{', () => {
      const response = '```json\n{{"partyA.name":"豆包有限公司", "year":2026}\n```';
      const candidate = extractJsonCandidate(response);
      expect(candidate).toBeDefined();
      expect(JSON.parse(candidate!)).toEqual({
        'partyA.name': '豆包有限公司',
        year: 2026,
      });
    });

    it('extracts and repairs when surrounded by conversational text', () => {
      const response =
        '好的，已为您识别出如下参数：\n{{"partyA.name":"豆包有限公司", "partyA.address":"北京王府井大街1000号"}\n请确认以上信息。';
      const candidate = extractJsonCandidate(response);
      expect(candidate).toBeDefined();
      expect(JSON.parse(candidate!)).toEqual({
        'partyA.name': '豆包有限公司',
        'partyA.address': '北京王府井大街1000号',
      });
    });
  });
});
