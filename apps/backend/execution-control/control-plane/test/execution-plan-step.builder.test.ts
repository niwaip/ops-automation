import { buildPlannedExecutionSteps } from '../src/modules/execution/step-runner/planning/execution-plan-step.builder';

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
      }
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
      }
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
      undefined
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
    const result = buildPlannedExecutionSteps('execution-4', { url: '   ' }, undefined);

    expect(result.bootstrapUrl).toBeUndefined();
    expect(result.steps).toEqual([]);
  });

  it('skips bootstrap goto when planner mode is direct skill execution', () => {
    const result = buildPlannedExecutionSteps(
      'execution-5',
      {
        plannerMode: 'skill',
        url: 'https://example.com',
      },
      {
        steps: [
          {
            id: 'plan-step-5',
            title: 'Execute skill',
            description: 'Run matched skill directly',
            kind: 'skill',
            status: 'planned',
          },
        ],
      }
    );

    expect(result.bootstrapUrl).toBeUndefined();
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({
      executionId: 'execution-5',
      stepIndex: 1,
      name: 'Execute skill',
      type: 'system',
      action: 'execute_skill',
      targetJson: { plannerStepId: 'plan-step-5', plannerKind: 'skill' },
    });
  });

  it('adds bootstrap phase metadata and planner phase metadata to generated steps', () => {
    const { steps, bootstrapUrl } = buildPlannedExecutionSteps(
      'execution-6',
      {
        plannerMode: 'fallback',
        url: 'https://example.com/login',
      },
      {
        steps: [
          {
            id: 'login-skill',
            title: '登录并进入主页',
            description: '执行登录技能',
            kind: 'skill',
            status: 'planned',
          },
        ],
      }
    );

    expect(bootstrapUrl).toBe('https://example.com/login');
    expect(steps).toHaveLength(2);
    expect(steps[0].targetJson).toEqual(
      expect.objectContaining({
        phaseKey: 'phase_bootstrap_navigation',
        phaseName: 'Open target page',
        phaseType: 'browser_navigation',
      })
    );
    expect(steps[1].targetJson).toEqual(
      expect.objectContaining({
        phaseKey: 'phase_01_login_skill',
        phaseName: '登录并进入主页',
        phaseType: 'system_skill',
      })
    );
    expect(steps[1].inputJson).toEqual(
      expect.objectContaining({
        phaseKey: 'phase_01_login_skill',
        phaseName: '登录并进入主页',
        phaseType: 'system_skill',
      })
    );
  });

  it('preserves browser phase commands and recovery config on planned execution steps', () => {
    const { steps } = buildPlannedExecutionSteps(
      'execution-7',
      {
        plannerMode: 'skill',
      },
      {
        steps: [
          {
            id: 'plan-step-browser-phase',
            title: '执行登录阶段',
            description: '复用模板中的登录 phase commands',
            kind: 'tool',
            status: 'planned',
            phase_key: 'phase_login',
            phase_name: '登录阶段',
            phase_type: 'browser_phase',
            commands: [
              {
                step_id: 'cmd-fill-username',
                capability_type: 'browser_step',
                action: 'fill',
                input: {
                  target: 'username-input',
                  value: '${username}',
                },
                metadata: {
                  source: 'template_step',
                },
              },
              {
                step_id: 'cmd-click-submit',
                action: 'click',
                input: {
                  target: 'submit-button',
                },
              },
            ],
            precheck: {
              selectorExists: '#login-form',
            },
            postcheck: {
              pageUrlIncludes: '/dashboard',
            },
            recovery_policy: {
              max_auto_retries: 2,
              allow_ai_recovery: true,
              allow_human_takeover: true,
              model_id: 'gpt-5.4',
            },
          },
        ],
      }
    );

    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      stepIndex: 1,
      type: 'system',
      action: 'execute_browser_phase',
      targetJson: {
        plannerStepId: 'plan-step-browser-phase',
        plannerKind: 'tool',
        phaseKey: 'phase_login',
        phaseName: '登录阶段',
        phaseType: 'browser_phase',
        precheck: {
          selectorExists: '#login-form',
        },
        postcheck: {
          pageUrlIncludes: '/dashboard',
        },
        recoveryPolicy: {
          maxAutoRetries: 2,
          allowAiRecovery: true,
          allowHumanTakeover: true,
          modelId: 'gpt-5.4',
        },
      },
      inputJson: {
        description: '复用模板中的登录 phase commands',
        plannerStatus: 'planned',
      },
    });
    expect(steps[0].targetJson).toEqual(
      expect.objectContaining({
        commands: [
          {
            stepId: 'cmd-fill-username',
            capabilityType: 'browser.step',
            action: 'fill',
            input: {
              target: 'username-input',
              value: '${username}',
            },
            metadata: {
              source: 'template_step',
            },
          },
          {
            stepId: 'cmd-click-submit',
            capabilityType: 'browser.step',
            action: 'click',
            input: {
              target: 'submit-button',
            },
          },
        ],
      })
    );
  });
});
