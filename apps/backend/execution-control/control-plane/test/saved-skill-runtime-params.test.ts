import type { DeterministicPlanDraftV1 } from '@ops/backend-deterministic-plan';
import {
  buildSavedSkillRuntimeParamsSchema,
  configureSavedSkillExecution,
} from '../src/modules/saved-skill/saved-skill-runtime-params';

const createPlan = (): DeterministicPlanDraftV1 => ({
  schemaVersion: 'deterministic-plan/v1',
  plannerVersion: '1',
  catalogVersion: '1',
  planType: 'sequential',
  objective: '查询热点并总结',
  originalRequest: '查询 bilibili 热点并总结',
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
        topic: { source: 'literal', value: 'general' },
        limit: { source: 'user_input', path: 'filters.limit' },
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
      kind: 'llm_operation',
      title: '总结热点',
      dependsOn: ['search'],
      inputBindings: {
        items: { source: 'node_output', nodeId: 'search', path: 'searchResults' },
      },
      outputContract: { summary: 'string' },
      failurePolicy: 'abort',
      operationId: 'summarize_list',
      operationVersion: '1',
      operationDigest: 'sha256:operation',
      contractDigest: 'sha256:contract',
    },
  ],
  finalOutputs: [],
  requiredUserInputs: [],
});

describe('saved workflow runtime parameters', () => {
  it('exposes literal and user inputs as editable parameters but excludes node outputs', () => {
    const schema = buildSavedSkillRuntimeParamsSchema(createPlan(), {
      filters: { limit: 5 },
    }) as { properties: Record<string, Record<string, unknown>> };

    expect(schema.properties).toEqual(
      expect.objectContaining({
        query: expect.objectContaining({ default: 'bilibili热点' }),
        topic: expect.objectContaining({ default: 'general' }),
        limit: expect.objectContaining({ default: 5 }),
      })
    );
    expect(schema.properties.items).toBeUndefined();
  });

  it('applies overrides to a per-run plan without modifying the saved snapshot', () => {
    const plan = createPlan();
    const configured = configureSavedSkillExecution(
      plan,
      { filters: { limit: 5 } },
      { query: '微博热点', topic: 'news', limit: 20 }
    );

    expect(plan.nodes[0].inputBindings.query).toEqual({
      source: 'literal',
      value: 'bilibili热点',
    });
    expect(configured.planSnapshot.nodes[0].inputBindings).toEqual({
      query: { source: 'user_input', path: 'query' },
      topic: { source: 'user_input', path: 'topic' },
      limit: { source: 'user_input', path: 'filters.limit' },
    });
    expect(configured.planSnapshot.nodes[1].inputBindings.items).toEqual({
      source: 'node_output',
      nodeId: 'search',
      path: 'searchResults',
    });
    expect(configured.executionInput).toEqual({
      query: '微博热点',
      topic: 'news',
      filters: { limit: 20 },
    });
    expect(configured.unknownOverrideKeys).toEqual([]);
  });

  it('reports parameters that are not part of the frozen workflow contract', () => {
    const configured = configureSavedSkillExecution(createPlan(), {}, {
      query: '微博热点',
      previousResultText: '不应接受的历史结果',
    });

    expect(configured.unknownOverrideKeys).toEqual(['previousResultText']);
  });

  it('accepts the original nested user_input shape used by existing schedules', () => {
    const configured = configureSavedSkillExecution(
      createPlan(),
      { filters: { limit: 5 } },
      { filters: { limit: 30 } }
    );

    expect(configured.executionInput).toEqual({
      query: 'bilibili热点',
      topic: 'general',
      filters: { limit: 30 },
    });
    expect(configured.unknownOverrideKeys).toEqual([]);
  });
});
