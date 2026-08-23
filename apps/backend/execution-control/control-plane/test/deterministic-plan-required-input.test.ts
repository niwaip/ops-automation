import {
  getMissingDeterministicPlanInputs,
  materializeDeterministicPlanInput,
} from '../src/modules/execution/plan-runtime/deterministic-plan-required-input';

describe('deterministic plan required input', () => {
  const plan = {
    requiredUserInputs: [
      {
        name: 'n1.type',
        targetField: 'type',
        nodeId: 'n1_热榜查询',
        inputPath: 'planInputs.n1.type',
        type: 'string',
        prompt: '请输入热榜平台',
        missing: true,
      },
    ],
  } as never;

  it('normalizes plan requirements into execution input requirements', () => {
    expect(getMissingDeterministicPlanInputs(plan)).toEqual([
      expect.objectContaining({
        name: 'n1.type',
        inputPath: 'planInputs.n1.type',
        required: true,
        missing: true,
        source: 'unresolved',
      }),
    ]);
  });

  it('materializes a submitted value at the frozen user_input binding path', () => {
    expect(
      materializeDeterministicPlanInput({ prompt: '原始任务' }, plan, {
        'n1.type': 'weibo',
      }),
    ).toEqual({
      prompt: '原始任务',
      planInputs: { n1: { type: 'weibo' } },
    });
  });
});
