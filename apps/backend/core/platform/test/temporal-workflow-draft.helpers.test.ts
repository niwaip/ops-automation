import {
  buildAnalyzeAiWorkflowDraftPrompt,
  buildAnalyzeAiWorkflowRefinementPrompt,
  buildRepairAiWorkflowDraftPlanPrompt,
} from '../src/modules/temporal-workflow/temporal-workflow-draft.helpers';

const activityResources: any[] = [];

describe('Temporal Workflow prompt capability boundary', () => {
  it('keeps model operations out of generated Workflow Activities', () => {
    const prompt = buildAnalyzeAiWorkflowDraftPrompt({
      description: '搜索后总结',
      referenceUrl: '',
      referenceExcerpt: '',
      activityResources,
    });

    expect(prompt).toContain('AI 理解/分类/摘要/归纳属于独立 llm_operation');
    expect(prompt).toContain('禁止生成 builtin:llmOperation');
  });

  it('repairs model work into a control-plane node rather than an Activity', () => {
    const prompt = buildRepairAiWorkflowDraftPlanPrompt({
      currentPlan: {
        workflowName: 'Test',
        workflowDescription: 'Test',
        workflowClassName: 'TestWorkflow',
        workflowDefnName: 'test_workflow',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: {},
        outputParams: {},
        steps: [],
        activities: [],
        warnings: [],
      },
      issues: [],
      description: 'Test',
      referenceUrl: '',
      referenceExcerpt: '',
      activityResources,
    });

    expect(prompt).toContain('不得把它修复为任何 Activity');
    expect(prompt).toContain('上层确定性计划单独组合 llm_operation');
  });

  it('applies the same boundary during refinement', () => {
    const prompt = buildAnalyzeAiWorkflowRefinementPrompt({
      currentWorkflowDsl: { name: 'Test', inputParams: {}, outputParams: {}, steps: [] },
      userPrompt: '添加总结',
      activityResources,
    });

    expect(prompt).toContain('AI 语义操作（语义理解、摘要、归纳、模糊分类等）不是 Activity');
    expect(prompt).toContain('控制面按冻结的 llm_operation 版本直接执行');
  });
});
