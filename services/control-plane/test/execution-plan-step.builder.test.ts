import { buildPlannedExecutionSteps } from '../src/modules/execution/execution-plan-step.builder';

describe('execution-plan-step.builder', () => {
  it('builds bootstrap and planner steps in order', () => {
    const result = buildPlannedExecutionSteps(
      'execution-1',
      { url: 'https://example.com' },
      {
        steps: [
          {
            id: 'plan-step-1',
            title: 'Collect missing input',
            description: 'Ask for city',
            kind: 'human_input',
            status: 'planned',
          },
          {
            id: 'plan-step-2',
            title: 'Execute matched skill',
            description: 'Run the selected capability',
            kind: 'skill',
            status: 'planned',
          },
        ],
      },
    );

    expect(result.bootstrapUrl).toBe('https://example.com');
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0]).toMatchObject({
      executionId: 'execution-1',
      stepIndex: 1,
      name: 'Open target page',
      type: 'browser_action',
      status: 'pending',
      action: 'goto',
      targetJson: { url: 'https://example.com', source: 'phase1_bootstrap' },
      inputJson: { url: 'https://example.com' },
    });
    expect(result.steps[1]).toMatchObject({
      executionId: 'execution-1',
      stepIndex: 2,
      name: 'Collect missing input',
      type: 'input_collection',
      status: 'pending',
      action: 'collect_input',
      targetJson: { plannerStepId: 'plan-step-1', plannerKind: 'human_input' },
      inputJson: { description: 'Ask for city', plannerStatus: 'planned' },
    });
    expect(result.steps[2]).toMatchObject({
      executionId: 'execution-1',
      stepIndex: 3,
      name: 'Execute matched skill',
      type: 'system',
      status: 'pending',
      action: 'execute_skill',
      targetJson: { plannerStepId: 'plan-step-2', plannerKind: 'skill' },
      inputJson: { description: 'Run the selected capability', plannerStatus: 'planned' },
    });
  });

  it('prefers explicit planner tool name and supports execution steps without bootstrap', () => {
    const result = buildPlannedExecutionSteps(
      'execution-2',
      {},
      {
        steps: [
          {
            id: 'plan-step-3',
            title: 'Invoke workflow tool',
            description: 'Use a named planner tool',
            kind: 'tool',
            tool_name: 'tool.execute.custom',
            status: 'planned',
          },
          {
            id: 'plan-step-4',
            title: 'Run nested execution',
            description: 'Delegate to another plan',
            kind: 'execution',
            status: 'planned',
          },
        ],
      },
    );

    expect(result.bootstrapUrl).toBeUndefined();
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]).toMatchObject({
      stepIndex: 1,
      type: 'system',
      action: 'tool.execute.custom',
      targetJson: { plannerStepId: 'plan-step-3', plannerKind: 'tool' },
    });
    expect(result.steps[1]).toMatchObject({
      stepIndex: 2,
      type: 'system',
      action: 'execute_plan',
      targetJson: { plannerStepId: 'plan-step-4', plannerKind: 'execution' },
    });
  });

  it('trims bootstrap url before creating the browser step', () => {
    const result = buildPlannedExecutionSteps(
      'execution-3',
      { url: '  https://example.com/path  ' },
      undefined,
    );

    expect(result.bootstrapUrl).toBe('https://example.com/path');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({
      stepIndex: 1,
      type: 'browser_action',
      action: 'goto',
      targetJson: { url: 'https://example.com/path', source: 'phase1_bootstrap' },
      inputJson: { url: 'https://example.com/path' },
    });
  });

  it('does not create any planned steps when bootstrap url is blank and planner steps are absent', () => {
    const result = buildPlannedExecutionSteps(
      'execution-4',
      { url: '   ' },
      undefined,
    );

    expect(result.bootstrapUrl).toBeUndefined();
    expect(result.steps).toEqual([]);
  });
});
