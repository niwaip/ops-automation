import { validateAiWorkflowDraftPlan } from '../src/modules/temporal-workflow/temporal-workflow-draft-plan-validation.helpers';

const deps = {
  pickFirstNonEmptyString: (...values: unknown[]) =>
    values.find((value): value is string => typeof value === 'string' && value.trim().length > 0) || '',
};

const activityResources: any[] = [
  {
    ref: 'builtin:structuredTransform',
    name: '固定规则转换',
    fn: 'structuredTransform',
    timeout: '90s',
    handler: 'api',
    config: {},
  },
  {
    ref: 'builtin:aiStructuredTransform',
    name: '遗留 AI 转换',
    fn: 'aiStructuredTransform',
    timeout: '90s',
    handler: 'api',
    config: {},
  },
];

function planWith(activityRef: string, version = 'v4.0.0'): any {
  return {
    version,
    steps: [{ id: 'step-1', name: '模型总结', activityRef, input: {} }],
  };
}

describe('Temporal Workflow model capability boundary', () => {
  it.each(['llmOperationActivity', 'builtin:llmOperation'])(
    'rejects %s because LLM Operation is not an Activity',
    (activityRef) => {
      const issues = validateAiWorkflowDraftPlan(
        planWith(activityRef),
        [...activityResources, { ref: activityRef } as any],
        deps,
      );

      expect(issues).toContainEqual(
        expect.stringContaining('模型能力必须作为独立 llm_operation 计划节点由控制面直接执行'),
      );
    },
  );

  it('rejects legacy aiStructuredTransform for new workflow versions', () => {
    const issues = validateAiWorkflowDraftPlan(
      planWith('builtin:aiStructuredTransform'),
      activityResources,
      deps,
    );

    expect(issues).toContainEqual(
      expect.stringContaining('不能迁移为另一种 Activity'),
    );
  });
});
