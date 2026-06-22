import { Logger } from '@nestjs/common';
import { RuntimeStepRequestFactory } from '../src/modules/execution/step-runner/runtime-step-request.factory';

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

  it('omits execution step targeting metadata for browser skill runtime requests', () => {
    const request = factory.buildSkillRuntimeRequest({
      execution: {
        id: 'execution-browser-1',
        skillId: 'skill-browser-1',
        skillVersion: 'v9',
        runtimeType: 'custom',
        riskLevel: 'L0',
        requiresApproval: false,
        normalizedInputJson: {
          runtimeSourceType: 'browser_recording',
          input: {
            username: 'admin',
          },
          capabilityMatch: {
            capabilityId: 'published-browser-skill-1',
          },
        },
      },
      stepId: 'step-browser-1',
      runtimeSessionId: 'runtime-browser-1',
      phaseMetadata: {
        phaseKey: 'phase_01_execute_selected_skill',
        phaseName: '执行浏览器技能',
        phaseType: 'system_skill',
      },
      step: {
        name: '1. 页面打开',
        action: 'execute_skill',
        stepIndex: 1,
      },
    });

    expect(request).toEqual({
      requestId: 'execution-browser-1:step-browser-1',
      executionId: 'execution-browser-1',
      stepId: 'step-browser-1',
      runtimeType: 'custom',
      runtimeSessionId: 'runtime-browser-1',
      skillId: 'skill-browser-1',
      publishedSkillId: 'published-browser-skill-1',
      capabilityType: 'skill.runtime',
      action: 'execute',
      input: {
        username: 'admin',
      },
      policyContext: {
        riskLevel: 'L0',
        requiresApproval: false,
      },
      metadata: {
        capabilityVersion: 'v9',
        phaseKey: 'phase_01_execute_selected_skill',
        phaseName: '执行浏览器技能',
        phaseType: 'system_skill',
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

  it('maps document paramResolution bindings into input.data for document runtime requests', () => {
    const request = factory.buildSkillRuntimeRequest({
      execution: {
        id: 'execution-7',
        skillId: 'skill-7',
        skillVersion: 'v8',
        runtimeType: 'document',
        riskLevel: 'L0',
        requiresApproval: false,
        normalizedInputJson: {
          input: {
            contractNo: 'HT-2026-001',
            customerName: 'Alice',
            outputFormat: 'pdf',
            data: {
              existing: 'keep-me',
            },
          },
          paramResolution: {
            contractNo: {
              final: true,
              value: 'HT-2026-001',
              template_binding: 'contract.no',
            },
            customerName: {
              final: true,
              value: 'Alice',
              render_path: 'party.customerName',
            },
          },
          skillMatch: {
            skill_id: 'published-skill-7',
          },
        },
      },
      stepId: 'step-7',
      runtimeSessionId: 'runtime-7',
    });

    expect(request).toEqual({
      requestId: 'execution-7:step-7',
      executionId: 'execution-7',
      stepId: 'step-7',
      runtimeType: 'document',
      runtimeSessionId: 'runtime-7',
      skillId: 'skill-7',
      publishedSkillId: 'published-skill-7',
      capabilityType: 'document.render',
      action: 'render',
      input: {
        outputFormat: 'pdf',
        data: {
          existing: 'keep-me',
          contract: {
            no: 'HT-2026-001',
          },
          party: {
            customerName: 'Alice',
          },
        },
      },
      policyContext: {
        riskLevel: 'L0',
        requiresApproval: false,
      },
      metadata: {
        capabilityVersion: 'v8',
      },
    });
  });

  it('fans out multi-path bindings and preserves array rows for document runtime requests', () => {
    const request = factory.buildSkillRuntimeRequest({
      execution: {
        id: 'execution-7b',
        skillId: 'skill-7b',
        skillVersion: 'v8',
        runtimeType: 'document',
        riskLevel: 'L0',
        requiresApproval: false,
        normalizedInputJson: {
          input: {
            partyA: 'Party A Global Ltd',
            outputFormat: 'docx',
          },
          paramResolution: {
            partyA: {
              final: true,
              value: 'Party A Global Ltd',
              render_path: ['contract.partyA_cn', 'contract.partyA_jp'],
            },
            'items[].productName': {
              final: true,
              value: ['MES Upgrade', 'Cloud Gateway'],
              render_path: ['items[].productName_cn', 'items[].productName_jp'],
            },
            'items[].quantity': {
              final: true,
              value: [2, 1],
              render_path: ['items[].quantity_cn', 'items[].quantity_jp'],
            },
          },
          skillMatch: {
            skill_id: 'published-skill-7b',
          },
        },
      },
      stepId: 'step-7b',
      runtimeSessionId: 'runtime-7b',
    });

    expect(request?.input).toEqual({
      outputFormat: 'docx',
      data: {
        contract: {
          partyA_cn: 'Party A Global Ltd',
          partyA_jp: 'Party A Global Ltd',
        },
        items: [
          {
            productName_cn: 'MES Upgrade',
            productName_jp: 'MES Upgrade',
            quantity_cn: 2,
            quantity_jp: 2,
          },
          {
            productName_cn: 'Cloud Gateway',
            productName_jp: 'Cloud Gateway',
            quantity_cn: 1,
            quantity_jp: 1,
          },
        ],
      },
    });
  });

  it('logs a warning when document paramResolution entries exist but none can be mapped', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const request = factory.buildSkillRuntimeRequest({
      execution: {
        id: 'execution-8',
        skillId: 'skill-8',
        skillVersion: 'v9',
        runtimeType: 'document',
        riskLevel: 'L0',
        requiresApproval: false,
        normalizedInputJson: {
          input: {
            contractNo: 'HT-2026-002',
            outputFormat: 'docx',
          },
          paramResolution: {
            contractNo: {
              final: false,
              value: 'HT-2026-002',
              render_path: 'contract.no',
            },
            customerName: {
              final: true,
              value: 'Alice',
            },
          },
          skillMatch: {
            skill_id: 'published-skill-8',
          },
        },
      },
      stepId: 'step-8',
      runtimeSessionId: 'runtime-8',
    });

    expect(request?.input).toEqual({
      contractNo: 'HT-2026-002',
      outputFormat: 'docx',
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Document runtime payload resolved zero mapped fields for execution execution-8'
      )
    );

    warnSpy.mockRestore();
  });

  it('maps bilingual object values onto localized render paths for document runtime requests', () => {
    const request = factory.buildSkillRuntimeRequest({
      execution: {
        id: 'execution-8b',
        skillId: 'skill-8b',
        skillVersion: 'v10',
        runtimeType: 'document',
        riskLevel: 'L0',
        requiresApproval: false,
        normalizedInputJson: {
          input: {
            outputFormat: 'docx',
          },
          paramResolution: {
            'contract.signingDate': {
              final: true,
              value: {
                cn: '2026-05-28',
                jp: '2026-05-28',
              },
              render_path: ['contract.signingDate_cn', 'contract.signingDate_jp'],
            },
            'contract.projectName': {
              final: true,
              value: {
                cn: 'MES Upgrade Integration Project',
                jp: 'MES Upgrade Integration Project',
              },
              render_path: ['contract.projectName_cn', 'contract.projectName_jp'],
            },
          },
          skillMatch: {
            skill_id: 'published-skill-8b',
          },
        },
      },
      stepId: 'step-8b',
      runtimeSessionId: 'runtime-8b',
    });

    expect(request?.input).toEqual({
      outputFormat: 'docx',
      data: {
        contract: {
          signingDate_cn: '2026-05-28',
          signingDate_jp: '2026-05-28',
          projectName_cn: 'MES Upgrade Integration Project',
          projectName_jp: 'MES Upgrade Integration Project',
        },
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
