import { isResultRefV1, projectResultFields } from './index';

describe('result ref contract', () => {
  it('projects only explicitly requested fields', () => {
    expect(
      projectResultFields({ report: { title: 'Q3', secret: 'hidden' }, count: 2 }, [
        'report.title',
        'count',
      ])
    ).toEqual({ 'report.title': 'Q3', count: 2 });
  });

  it('rejects prototype and unbounded projections', () => {
    expect(() => projectResultFields({}, ['__proto__.polluted'])).toThrow('Unsafe');
    expect(() =>
      projectResultFields(
        {},
        Array.from({ length: 33 }, (_, i) => `f${i}`)
      )
    ).toThrow('exceeds');
  });

  it('recognizes the versioned reference envelope', () => {
    expect(
      isResultRefV1({
        schemaVersion: 'result-ref/v1',
        id: 'ref-1',
        executionId: 'execution-1',
        schemaDigest: 'abc',
        sizeBytes: 12,
      })
    ).toBe(true);
  });
});
