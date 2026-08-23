import {
  canonicalizeIntent,
  matchSavedWorkflow,
  rankSavedWorkflows,
} from './saved-workflow-matcher';

describe('saved workflow matcher', () => {
  const savedWorkflow = {
    id: 'workflow-1',
    name: '查询微博热点并进行总结，最后通过 Bark 推送',
    version: '1',
    status: 'active',
    stepCount: 3,
  };

  it('matches semantically equivalent wording without an LLM call', () => {
    expect(canonicalizeIntent('查看微博的热点，然后给出总结，用bark推送')).toBe(
      canonicalizeIntent(savedWorkflow.name),
    );
    expect(
      matchSavedWorkflow('查看微博的热点，然后给出总结，用bark推送', [savedWorkflow]),
    ).toEqual({ workflow: savedWorkflow, score: 1, matchMethod: 'name' });
  });

  it('prefers the terminal Bark workflow over a similar two-step summary workflow', () => {
    expect(
      matchSavedWorkflow('查看微博的热点，然后给出总结，用bark推送', [
        savedWorkflow,
        {
          id: 'workflow-summary-only',
          name: '查询微博热点 并且进行总结',
          version: '1',
          status: 'active',
          stepCount: 2,
        },
      ])?.workflow.id,
    ).toBe('workflow-1');
  });

  it('does not match inactive, single-step, or unrelated workflows', () => {
    expect(
      matchSavedWorkflow('查看北京天气', [
        savedWorkflow,
        { ...savedWorkflow, id: 'disabled', status: 'disabled' },
        { ...savedWorkflow, id: 'single', stepCount: 1 },
      ]),
    ).toBeUndefined();
  });

  it('fails closed when two candidates are equally close', () => {
    expect(
      matchSavedWorkflow('查询微博热点并总结用bark推送', [
        savedWorkflow,
        { ...savedWorkflow, id: 'workflow-2', name: '查看微博热点并总结，然后 Bark 推送' },
      ]),
    ).toBeUndefined();
  });

  it('matches a user-confirmed alias without calling a model', () => {
    const withAlias = { ...savedWorkflow, aliases: ['每日微博摘要推送'] };
    expect(matchSavedWorkflow('每日微博摘要推送', [withAlias])).toEqual({
      workflow: withAlias,
      score: 0.99,
      matchMethod: 'alias',
    });
  });

  it('hard-filters workflows that do not contain an explicitly requested terminal action', () => {
    const ranking = rankSavedWorkflows('查询微博热点并总结，用 Bark 推送', [
      { ...savedWorkflow, id: 'summary', name: '查询微博热点并总结' },
      savedWorkflow,
    ]);
    expect(ranking.eligibleCount).toBe(1);
    expect(ranking.ranked.map((item) => item.workflow.id)).toEqual(['workflow-1']);
  });

  it('returns at most five deterministically ordered cards', () => {
    const ranking = rankSavedWorkflows(
      '查询微博热点并总结',
      Array.from({ length: 8 }, (_, index) => ({
        ...savedWorkflow,
        id: `workflow-${index}`,
        name: `查询微博热点并总结 ${index}`,
      })),
      10,
    );
    expect(ranking.ranked).toHaveLength(5);
  });
});
