import type { DeterministicPlanDraftV1 } from '@ops/backend-deterministic-plan';
import {
  projectSavedSkillFixedInput,
  projectSavedSkillStepInputs,
} from '../src/modules/saved-skill/saved-skill-fixed-input';

const createPlan = (): DeterministicPlanDraftV1 => ({
  schemaVersion: 'deterministic-plan/v1',
  plannerVersion: '1',
  catalogVersion: '1',
  planType: 'sequential',
  objective: '查询热点并总结',
  originalRequest: '查询热点并总结',
  status: 'frozen',
  nodes: [
    {
      nodeId: 'search',
      sequence: 1,
      kind: 'skill',
      title: '查询热点',
      dependsOn: [],
      inputBindings: {
        query: { source: 'literal', value: 'bilibili热点' },
      },
      outputContract: { searchResults: 'news_item_list' },
      failurePolicy: 'abort',
      skillId: 'web-search',
      skillVersion: '1',
      runtimeType: 'api',
    },
    {
      nodeId: 'summary',
      sequence: 2,
      kind: 'skill',
      title: '总结',
      dependsOn: ['search'],
      inputBindings: {
        items: { source: 'node_output', nodeId: 'search', path: 'searchResults' },
      },
      outputContract: { summary: 'string' },
      failurePolicy: 'abort',
      skillId: 'summary',
      skillVersion: '1',
      runtimeType: 'api',
    },
  ],
  finalOutputs: [],
  requiredUserInputs: [],
});

describe('projectSavedSkillFixedInput', () => {
  it('does not duplicate plan literals or runtime node outputs as fixed parameters', () => {
    const result = projectSavedSkillFixedInput(createPlan(), {
      prompt: '查询 bilibili热点 并且进行总结',
      previousResultText: '上一次摘要正文',
      previousResultTitle: '上一次摘要标题',
    });

    expect(result.value).toEqual({});
    expect(result.issues).toEqual([]);
  });

  it('keeps only paths explicitly referenced by user_input bindings', () => {
    const plan = createPlan();
    plan.nodes[0].inputBindings = {
      market: { source: 'user_input', path: 'market' },
      limit: { source: 'user_input', path: '$.filters.limit' },
      topic: { source: 'literal', value: 'general' },
    };

    const result = projectSavedSkillFixedInput(plan, {
      market: 'CN',
      filters: { limit: 10, ignored: true },
      prompt: '查询热点',
      previousResultText: '运行结果',
    });

    expect(result.value).toEqual({ market: 'CN', filters: { limit: 10 } });
  });

  it('removes chat runtime context when the whole input is referenced', () => {
    const plan = createPlan();
    plan.nodes[0].inputBindings = {
      request: { source: 'user_input', path: '$' },
    };

    const result = projectSavedSkillFixedInput(plan, {
      prompt: '查询热点',
      previousResultText: '运行结果',
      previousResultTitle: '运行标题',
      executionId: 'transient',
    });

    expect(result.value).toEqual({ prompt: '查询热点' });
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'TRANSIENT_INPUT_REMOVED',
      'TRANSIENT_INPUT_REMOVED',
      'TRANSIENT_INPUT_REMOVED',
    ]);
  });

  it('warns and omits a referenced value that was not present', () => {
    const plan = createPlan();
    plan.nodes[0].inputBindings = {
      market: { source: 'user_input', path: 'market' },
    };

    const result = projectSavedSkillFixedInput(plan, {});

    expect(result.value).toEqual({});
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'REFERENCED_USER_INPUT_MISSING',
        severity: 'warning',
        path: '$.market',
      }),
    ]);
  });

  it('shows literal and explicit user inputs by step but excludes node outputs', () => {
    const plan = createPlan();
    plan.nodes[0].inputBindings.market = { source: 'user_input', path: 'market' };

    expect(projectSavedSkillStepInputs(plan, { market: 'CN' })).toEqual([
      {
        nodeId: 'search',
        sequence: 1,
        title: '查询热点',
        parameters: { query: 'bilibili热点', market: 'CN' },
      },
    ]);
  });
});
