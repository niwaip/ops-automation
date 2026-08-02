import { OutputNormalizerService } from '../src/modules/execution/plan-runtime/output-normalizer.service';

describe('OutputNormalizerService (§15.3 item 6)', () => {
  const service = new OutputNormalizerService();

  it('synthesizes canonical searchResults from top-level results', () => {
    const out = service.normalize({ results: [{ title: 'a' }] });
    expect(out?.searchResults).toEqual([{ title: 'a' }]);
    expect(out?.results).toEqual([{ title: 'a' }]);
  });

  it('synthesizes searchResults from nested result.results', () => {
    const out = service.normalize({ result: { results: [{ title: 'b' }] } });
    expect(out?.searchResults).toEqual([{ title: 'b' }]);
  });

  it('synthesizes searchResults from businessData.searchResults', () => {
    const out = service.normalize({ businessData: { searchResults: [{ title: 'c' }] } });
    expect(out?.searchResults).toEqual([{ title: 'c' }]);
  });

  it('surfaces nested result.businessData fields onto the top level', () => {
    const out = service.normalize({
      result: { businessData: { query: 'x', totalResults: 5 } },
    });
    expect(out?.query).toBe('x');
    expect(out?.totalResults).toBe(5);
  });

  it('never overwrites existing top-level keys during businessData surfacing', () => {
    const out = service.normalize({
      query: 'original',
      businessData: { query: 'nested', totalResults: 7 },
    });
    expect(out?.query).toBe('original');
    expect(out?.totalResults).toBe(7);
  });

  it('materializes legacy aliases only for expectedKeys that declare them', () => {
    const out = service.normalize({ searchResults: [{ title: 'd' }] }, ['results', 'news_item_list']);
    expect(out?.results).toEqual([{ title: 'd' }]);
    expect(out?.news_item_list).toEqual([{ title: 'd' }]);
    // 'data' not in expectedKeys → must not appear (protects strict V2 schemas)
    expect(out?.data).toBeUndefined();
  });

  it('does not synthesize legacy aliases without expectedKeys', () => {
    const out = service.normalize({ searchResults: [{ title: 'e' }] });
    expect(out?.results).toBeUndefined();
    expect(out?.news_item_list).toBeUndefined();
  });

  it('is a pure function: never mutates the input', () => {
    const input = { results: [{ title: 'f' }], result: { businessData: { query: 'g' } } };
    const snapshot = JSON.stringify(input);
    service.normalize(input, ['results']);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('returns undefined for null/undefined/primitive output', () => {
    expect(service.normalize(null)).toBeUndefined();
    expect(service.normalize(undefined)).toBeUndefined();
    expect(service.normalize('string' as any)).toBe('string' as any);
  });

  it('passes arrays through untouched', () => {
    expect(service.normalize([1, 2, 3] as any)).toEqual([1, 2, 3] as any);
  });

  it('keeps existing searchResults when present and synthesizes nothing conflicting', () => {
    const out = service.normalize({
      searchResults: [{ title: 'primary' }],
      results: [{ title: 'alias' }],
    });
    expect(out?.searchResults).toEqual([{ title: 'primary' }]);
  });
});
