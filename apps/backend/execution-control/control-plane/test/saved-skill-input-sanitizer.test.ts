import { sanitizeSavedSkillInput } from '../src/modules/saved-skill/saved-skill-input-sanitizer';

describe('sanitizeSavedSkillInput', () => {
  it('removes runtime-only identifiers while preserving reusable input', () => {
    const result = sanitizeSavedSkillInput({
      market: 'CN',
      executionId: 'execution-1',
      nested: { traceId: 'trace-1', keyword: '微博热点' },
      __internal: true,
    });

    expect(result.value).toEqual({
      market: 'CN',
      nested: { keyword: '微博热点' },
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'TRANSIENT_INPUT_REMOVED', severity: 'warning' }),
      ])
    );
    expect(result.inputHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('blocks plaintext secrets but permits reference identifiers', () => {
    const result = sanitizeSavedSkillInput({
      apiKey: 'plaintext',
      credentialRef: 'credential://weibo-reader',
    });

    expect(result.value).toEqual({ credentialRef: 'credential://weibo-reader' });
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'SENSITIVE_INPUT_BLOCKED', severity: 'error' })
    );
  });

  it('produces the same hash regardless of object key order', () => {
    const left = sanitizeSavedSkillInput({ a: 1, nested: { y: 2, x: 1 } });
    const right = sanitizeSavedSkillInput({ nested: { x: 1, y: 2 }, a: 1 });

    expect(left.inputHash).toBe(right.inputHash);
  });
});
