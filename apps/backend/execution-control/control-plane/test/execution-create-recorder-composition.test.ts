import { ExecutionCreateService } from '../src/modules/execution/creation/execution-create.service';

describe('ExecutionCreateService recorder composition expansion', () => {
  const previousFlag = process.env.COMPOSITE_BROWSER_PLAN_ENABLED;

  afterEach(() => {
    if (previousFlag === undefined) delete process.env.COMPOSITE_BROWSER_PLAN_ENABLED;
    else process.env.COMPOSITE_BROWSER_PLAN_ENABLED = previousFlag;
  });

  it('expands a single deterministic browser node into its published post-processing plan', async () => {
    process.env.COMPOSITE_BROWSER_PLAN_ENABLED = 'true';
    const planning = {
      loadPublishedRecorderComposition: jest.fn().mockResolvedValue({
        skillVersion: '3',
        outputNames: ['article_content'],
        composition: {
          outputDeclarations: [{ name: 'article_content', kind: 'content' }],
          postProcessingSteps: [{ id: 'summarize', type: 'llm_operation' }],
        },
      }),
    };
    const compiler = {
      compile: jest.fn().mockResolvedValue({
        schemaVersion: 'deterministic-plan/v1',
        plannerVersion: 'compiler',
        catalogVersion: 'v1',
        planType: 'sequential',
        objective: 'open and summarize',
        originalRequest: 'open and summarize',
        status: 'validated',
        nodes: [
          { nodeId: 'browser_recording', kind: 'skill', inputBindings: {} },
          { nodeId: 'summarize', kind: 'llm_operation', dependsOn: ['browser_recording'] },
        ],
        finalOutputs: [{ fromNodeId: 'summarize', fromNodeOutput: 'summary' }],
        planHash: 'stale-hash',
      }),
    };
    const service = new ExecutionCreateService(
      {} as never,
      planning as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      compiler as never,
    );
    const plan = {
      schemaVersion: 'deterministic-plan/v1',
      plannerVersion: 'planner',
      catalogVersion: 'v1',
      planType: 'single',
      objective: 'open and summarize',
      originalRequest: 'open and summarize',
      status: 'validated',
      nodes: [{
        nodeId: 'browser',
        kind: 'skill',
        title: '打开网页',
        skillId: 'browser-skill',
        skillVersion: '3',
        inputBindings: { startUrl: { source: 'literal', value: 'https://example.com' } },
      }],
      finalOutputs: [],
    };

    const expanded = await (service as any).expandSinglePublishedRecorderComposition(plan);

    expect(expanded.nodes).toHaveLength(2);
    expect(expanded.nodes[0].inputBindings).toEqual(plan.nodes[0].inputBindings);
    expect(expanded.finalOutputs[0].fromNodeId).toBe('summarize');
    expect(expanded.planHash).toBeUndefined();
  });
});
