import { RuntimeStepRequestFactory } from '../src/modules/execution/runtime-step-request.factory';

describe('RuntimeStepRequestFactory', () => {
  const factory = new RuntimeStepRequestFactory();

  it('builds a browser goto request with resolved capability id and policy context', () => {
    const request = factory.buildBrowserGotoRequest({
      execution: {
        id: 'execution-1',
        skillId: 'skill-1',
        riskLevel: 'L2',
        requiresApproval: true,
        normalizedInputJson: {
          capabilityMatch: {
            capabilityId: 'published-skill-1',
          },
        },
      },
      stepId: 'step-1',
      runtimeSessionId: 'runtime-1',
      url: 'https://example.com',
      executionMode: 'bootstrap',
    });

    expect(request).toEqual({
      requestId: 'execution-1:step-1',
      executionId: 'execution-1',
      stepId: 'step-1',
      runtimeType: 'browser',
      runtimeSessionId: 'runtime-1',
      skillId: 'skill-1',
      publishedSkillId: 'published-skill-1',
      capabilityType: 'browser.step',
      action: 'goto',
      input: {
        target: 'https://example.com',
      },
      policyContext: {
        riskLevel: 'L2',
        requiresApproval: true,
      },
      metadata: {
        executionMode: 'bootstrap',
      },
    });
  });

  it('builds a skill runtime request from normalized input and skill version', () => {
    const request = factory.buildSkillRuntimeRequest({
      execution: {
        id: 'execution-2',
        skillId: 'skill-2',
        skillVersion: 'v4',
        riskLevel: 'L1',
        requiresApproval: false,
        normalizedInputJson: {
          input: {
            name: 'Chain',
          },
          skillMatch: {
            skill_id: 'published-skill-2',
          },
        },
      },
      stepId: 'step-2',
      runtimeSessionId: 'runtime-2',
      step: {
        name: '8. wait',
        action: 'wait',
        stepIndex: 8,
      },
    });

    expect(request).toEqual({
      requestId: 'execution-2:step-2',
      executionId: 'execution-2',
      stepId: 'step-2',
      runtimeType: 'custom',
      runtimeSessionId: 'runtime-2',
      skillId: 'skill-2',
      publishedSkillId: 'published-skill-2',
      capabilityType: 'skill.runtime',
      action: 'execute',
      input: {
        name: 'Chain',
      },
      policyContext: {
        riskLevel: 'L1',
        requiresApproval: false,
      },
      metadata: {
        capabilityVersion: 'v4',
        executionStepName: '8. wait',
        executionStepAction: 'wait',
        executionStepIndex: 8,
      },
    });
  });

  it('merges execution step metadata with phase metadata for skill runtime requests', () => {
    const request = factory.buildSkillRuntimeRequest({
      execution: {
        id: 'execution-6',
        skillId: 'skill-6',
        skillVersion: 'v7',
        riskLevel: 'L1',
        requiresApproval: false,
        normalizedInputJson: {
          input: {
            username: 'chain',
          },
          capabilityMatch: {
            capabilityId: 'published-skill-6',
          },
        },
      },
      stepId: 'step-6',
      runtimeSessionId: 'runtime-6',
      phaseMetadata: {
        phaseKey: 'phase_09_step_9',
        phaseName: '9. 输入密码后等待',
        phaseType: 'activity',
      },
      step: {
        name: '9. wait',
        action: 'wait',
        step_index: 9,
      },
    });

    expect(request).toEqual({
      requestId: 'execution-6:step-6',
      executionId: 'execution-6',
      stepId: 'step-6',
      runtimeType: 'custom',
      runtimeSessionId: 'runtime-6',
      skillId: 'skill-6',
      publishedSkillId: 'published-skill-6',
      capabilityType: 'skill.runtime',
      action: 'execute',
      input: {
        username: 'chain',
      },
      policyContext: {
        riskLevel: 'L1',
        requiresApproval: false,
      },
      metadata: {
        capabilityVersion: 'v7',
        executionStepName: '9. wait',
        executionStepAction: 'wait',
        executionStepIndex: 9,
        phaseKey: 'phase_09_step_9',
        phaseName: '9. 输入密码后等待',
        phaseType: 'activity',
      },
    });
  });

  it('builds a document runtime request when execution runtimeType is document', () => {
    const request = factory.buildSkillRuntimeRequest({
      execution: {
        id: 'execution-4',
        skillId: 'skill-4',
        skillVersion: 'v5',
        runtimeType: 'document',
        riskLevel: 'L0',
        requiresApproval: false,
        normalizedInputJson: {
          input: {
            data: {
              customerName: 'Alice',
            },
            outputFormat: 'pdf',
          },
          skillMatch: {
            skill_id: 'published-skill-4',
          },
        },
      },
      stepId: 'step-4',
      runtimeSessionId: 'runtime-4',
    });

    expect(request).toEqual({
      requestId: 'execution-4:step-4',
      executionId: 'execution-4',
      stepId: 'step-4',
      runtimeType: 'document',
      runtimeSessionId: 'runtime-4',
      skillId: 'skill-4',
      publishedSkillId: 'published-skill-4',
      capabilityType: 'document.render',
      action: 'render',
      input: {
        data: {
          customerName: 'Alice',
        },
        outputFormat: 'pdf',
      },
      policyContext: {
        riskLevel: 'L0',
        requiresApproval: false,
      },
      metadata: {
        capabilityVersion: 'v5',
      },
    });
  });

  it('builds a workflow runtime request when execution runtimeType is workflow', () => {
    const request = factory.buildSkillRuntimeRequest({
      execution: {
        id: 'execution-5',
        skillId: 'skill-5',
        skillVersion: 'v6',
        runtimeType: 'workflow',
        riskLevel: 'L1',
        requiresApproval: false,
        normalizedInputJson: {
          input: {
            orderId: 'ORDER-1',
          },
          capabilityMatch: {
            capabilityId: 'published-skill-5',
          },
        },
      },
      stepId: 'step-5',
      runtimeSessionId: 'runtime-5',
    });

    expect(request).toEqual({
      requestId: 'execution-5:step-5',
      executionId: 'execution-5',
      stepId: 'step-5',
      runtimeType: 'workflow',
      runtimeSessionId: 'runtime-5',
      skillId: 'skill-5',
      publishedSkillId: 'published-skill-5',
      capabilityType: 'workflow.run',
      action: 'run',
      input: {
        orderId: 'ORDER-1',
      },
      policyContext: {
        riskLevel: 'L1',
        requiresApproval: false,
      },
      metadata: {
        capabilityVersion: 'v6',
      },
    });
  });

  it('returns null for skill runtime requests when capability id cannot be resolved', () => {
    const request = factory.buildSkillRuntimeRequest({
      execution: {
        id: 'execution-3',
        normalizedInputJson: {},
        inputJson: {
          foo: 'bar',
        },
      },
      stepId: 'step-3',
      runtimeSessionId: 'runtime-3',
    });

    expect(request).toBeNull();
  });
});
