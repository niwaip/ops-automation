import axios from 'axios';
import { BrowserRecordingActionPolicyService } from '../../../registry-release/release-manager/src/validator/browser-recording-action-policy.service';
import { BrowserRecordingExecutionPlanValidatorService } from '../../../registry-release/release-manager/src/validator/browser-recording-execution-plan-validator.service';
import { CapabilityReleaseBrowserRuntimeExecutorService } from '../../../registry-release/release-manager/src/publisher/capability-release-browser-runtime-executor.service';
import { CapabilityReleaseBrowserRuntimeLoopExecutorService } from '../../../registry-release/release-manager/src/publisher/capability-release-browser-runtime-loop-executor.service';
import { CapabilityReleaseBrowserRuntimeResultService } from '../../../registry-release/release-manager/src/publisher/capability-release-browser-runtime-result.service';
import { CapabilityReleaseBrowserRuntimeService } from '../../../registry-release/release-manager/src/publisher/capability-release-browser-runtime.service';
import { CapabilityReleaseBrowserRuntimeStepExecutorService } from '../../../registry-release/release-manager/src/publisher/capability-release-browser-runtime-step-executor.service';
import { CapabilityReleaseBrowserRuntimeSupportService } from '../../../registry-release/release-manager/src/publisher/capability-release-browser-runtime-support.service';
import { BrowserPostStateReconcilerService } from '../../../registry-release/release-manager/src/publisher/browser-runtime-result/browser-post-state-reconciler.service';
import { BrowserRuntimeStepResultStateService } from '../../../registry-release/release-manager/src/publisher/browser-runtime-result/browser-runtime-step-result-state.service';
import { BrowserRunOutputMaterializerService } from '../../../registry-release/release-manager/src/publisher/browser-runtime-result/browser-run-output-materializer.service';
import { BrowserLegacyOutputAdapter } from '../../../registry-release/release-manager/src/publisher/browser-runtime-result/browser-legacy-output.adapter';
import { CapabilityReleaseDocumentRuntimeService } from '../../../registry-release/release-manager/src/publisher/capability-release-document-runtime.service';
import { CapabilityReleaseRuntimeService, type CapabilityReleaseRuntimeAccessors } from '../../../registry-release/release-manager/src/publisher/capability-release-runtime.service';
import { ReleaseRuntimeBindingService } from '../../../registry-release/release-manager/src/publisher/release-runtime-binding.service';

jest.mock('axios');

describe('CapabilityReleaseRuntimeService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  const createService = () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(),
    };
    const activityService = {
      executeCodeInTemporalSandbox: jest.fn(),
      executeCodeStreaming: jest.fn(),
    };
    const browserRecordingActionPolicyService = new BrowserRecordingActionPolicyService();
    const browserRecordingExecutionPlanValidatorService = {
      validateForRuntime: jest.fn().mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
        degradedMode: false,
        degradeReason: null,
        executionPlanVersion: 'browser-recording-ir/v1',
        trace: {
          recorderSessionId: 'recorder-session-test',
          exportArtifactId: 'artifact-test',
        },
      }),
    };
    const capabilityReleaseBrowserRecordingService = {
      buildRuntimePlan: jest.fn(),
    };
    const capabilityReleaseSkillDraftService = {
      extractExecutionFlowSourceTemplate: jest.fn(),
    };
    const releaseRuntimeBindingService = {
      getPublishedSkillRuntimeContext: jest.fn(),
      getReleaseByPublishedSkillOrThrow: jest.fn(),
    };

    const browserSessionBroker = {
      acquire: jest.fn().mockImplementation(async (input: { runtimeSessionId?: string }) => ({
        runtimeSessionId:
          input.runtimeSessionId || '11111111-1111-4111-8111-111111111111',
        ownedByRuntime: !input.runtimeSessionId,
      })),
      closeOwnedQuietly: jest.fn().mockResolvedValue(undefined),
      freeze: jest.fn().mockResolvedValue(undefined),
    };
    const capabilityReleaseBrowserRuntimeSupportService =
      new CapabilityReleaseBrowserRuntimeSupportService(browserSessionBroker as any);
    const browserRuntimeStepResultStateService = new BrowserRuntimeStepResultStateService();
    const capabilityReleaseBrowserRuntimeStepExecutorService =
      new CapabilityReleaseBrowserRuntimeStepExecutorService(
        browserRecordingActionPolicyService as BrowserRecordingActionPolicyService,
        capabilityReleaseBrowserRuntimeSupportService,
        new BrowserPostStateReconcilerService(),
        browserRuntimeStepResultStateService
      );
    const capabilityReleaseBrowserRuntimeLoopExecutorService =
      new CapabilityReleaseBrowserRuntimeLoopExecutorService(
        capabilityReleaseBrowserRuntimeStepExecutorService,
        capabilityReleaseBrowserRuntimeSupportService,
        browserRuntimeStepResultStateService
      );
    const capabilityReleaseBrowserRuntimeResultService =
      new CapabilityReleaseBrowserRuntimeResultService(
        new BrowserRunOutputMaterializerService(),
        new BrowserLegacyOutputAdapter()
      );
    const capabilityReleaseBrowserRuntimeExecutorService =
      new CapabilityReleaseBrowserRuntimeExecutorService(
        capabilityReleaseBrowserRuntimeStepExecutorService,
        capabilityReleaseBrowserRuntimeLoopExecutorService
      );
    const capabilityReleaseBrowserRuntimeService = new CapabilityReleaseBrowserRuntimeService(
      browserRecordingExecutionPlanValidatorService as unknown as BrowserRecordingExecutionPlanValidatorService,
      capabilityReleaseBrowserRecordingService as any,
      capabilityReleaseBrowserRuntimeExecutorService,
      capabilityReleaseBrowserRuntimeResultService,
      capabilityReleaseBrowserRuntimeSupportService,
      browserSessionBroker as any
    );
    const service = new CapabilityReleaseRuntimeService(
      activityService as any,
      releaseRuntimeBindingService as unknown as ReleaseRuntimeBindingService,
      new CapabilityReleaseDocumentRuntimeService(capabilityReleaseSkillDraftService as any),
      capabilityReleaseBrowserRuntimeService
    );

    const accessors: CapabilityReleaseRuntimeAccessors = {
      getCurrentSnapshotOrThrow: jest.fn(),
      resolveTemporalExecutableBuildOrThrow: jest.fn(),
      resolveWorkflowFnOrThrow: jest.fn(),
      insertAuditEvent: jest.fn().mockResolvedValue(undefined),
    };

    return {
      service,
      prisma,
      browserRecordingExecutionPlanValidatorService,
      capabilityReleaseBrowserRecordingService,
      capabilityReleaseSkillDraftService,
      releaseRuntimeBindingService,
      browserSessionBroker,
      accessors,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CARBONE_SERVICE_URL;
    delete process.env.CARBONE_EXTERNAL_URL;
    delete process.env.DOCKER_ENV;
    delete process.env.NODE_ENV;
    delete process.env.HOST_IP;
    delete process.env.EXTERNAL_HOST;
  });

  it('posts to render-resolved with templateId when template binding is available', async () => {
    const { service, accessors, releaseRuntimeBindingService } = createService();

    releaseRuntimeBindingService.getReleaseByPublishedSkillOrThrow.mockResolvedValue({
      id: 'release-1',
      sourceType: 'execution_flow_template',
    });
    (accessors.getCurrentSnapshotOrThrow as jest.Mock).mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        sourceTemplate: {
          templateId: 'tpl-001',
          format: 'docx',
        },
      },
    });
    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Skill not found',
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          downloadUrl: '/studio/download/doc-1',
          fileName: 'contract.docx',
          format: 'docx',
        },
      } as any);

    const result = await service.executePublishedSkill(
      'published-skill-1',
      {
        data: {
          customerName: 'Alice',
        },
      },
      'user-1',
      undefined,
      accessors
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3009/studio/generate-render-data-with-skill',
      {
        publishedSkillId: 'published-skill-1',
        templateId: 'tpl-001',
        skillId: undefined,
        simulatedData: {
          customerName: 'Alice',
        },
        outputFormat: 'docx',
      },
      {
        timeout: 120000,
      }
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3009/studio/render-resolved',
      {
        publishedSkillId: 'published-skill-1',
        templateId: 'tpl-001',
        skillId: undefined,
        data: {
          customerName: 'Alice',
        },
        outputFormat: 'docx',
      },
      {
        timeout: 120000,
      }
    );
    expect(result.success).toBe(true);
    expect(result.output).toEqual(
      expect.objectContaining({
        templateId: 'tpl-001',
        downloadUrl: 'http://localhost:3009/studio/download/doc-1',
      })
    );
  });

  it('delegates published skill runtime context resolution to runtime binding service', async () => {
    const { service, releaseRuntimeBindingService } = createService();

    releaseRuntimeBindingService.getPublishedSkillRuntimeContext.mockResolvedValue({
      publishedSkillId: 'skill-ctx-1',
      releaseId: 'release-ctx-1',
      sourceType: 'execution_flow_template',
      runtimeType: 'flow_runtime',
      runtimeSource: 'deployment',
      allowedToolNames: ['api_call'],
      toolPolicies: [],
      environment: 'dev',
      deploymentId: 'deployment-ctx-1',
    });

    const result = await service.getPublishedSkillRuntimeContext('skill-ctx-1');

    expect(releaseRuntimeBindingService.getPublishedSkillRuntimeContext).toHaveBeenCalledWith(
      'skill-ctx-1'
    );
    expect(result).toEqual(
      expect.objectContaining({
        releaseId: 'release-ctx-1',
        runtimeType: 'flow_runtime',
        runtimeSource: 'deployment',
      })
    );
  });

  it('posts both templateId and source skillId to render-resolved when both bindings exist', async () => {
    const { service, accessors, releaseRuntimeBindingService } = createService();

    releaseRuntimeBindingService.getReleaseByPublishedSkillOrThrow.mockResolvedValue({
      id: 'release-1',
      sourceType: 'execution_flow_template',
    });
    (accessors.getCurrentSnapshotOrThrow as jest.Mock).mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        sourceTemplate: {
          templateId: 'tpl-002',
          skillId: 'carbone-skill-2',
          format: 'docx',
        },
      },
    });
    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          success: true,
          renderResolvedRequest: {
            publishedSkillId: 'published-skill-2',
            templateId: 'tpl-002',
            skillId: 'carbone-skill-2',
            data: {
              contract: {
                customerName: 'Bob',
              },
            },
            outputFormat: 'docx',
          },
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          downloadUrl: '/studio/download/doc-2',
          fileName: 'resolved.docx',
          format: 'docx',
        },
      } as any);

    const result = await service.executePublishedSkill(
      'published-skill-2',
      {
        data: {
          customerName: 'Bob',
        },
      },
      'user-1',
      undefined,
      accessors
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3009/studio/generate-render-data-with-skill',
      {
        publishedSkillId: 'published-skill-2',
        templateId: 'tpl-002',
        skillId: 'carbone-skill-2',
        simulatedData: {
          customerName: 'Bob',
        },
        outputFormat: 'docx',
      },
      {
        timeout: 120000,
      }
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3009/studio/render-resolved',
      {
        publishedSkillId: 'published-skill-2',
        templateId: 'tpl-002',
        skillId: 'carbone-skill-2',
        data: {
          contract: {
            customerName: 'Bob',
          },
        },
        outputFormat: 'docx',
      },
      {
        timeout: 120000,
      }
    );
    expect(result.output).toEqual(
      expect.objectContaining({
        templateId: 'tpl-002',
        skillId: 'carbone-skill-2',
        downloadUrl: 'http://localhost:3009/studio/download/doc-2',
      })
    );
  });

  it('posts source skillId to render-resolved when templateId is unavailable', async () => {
    const { service, accessors, releaseRuntimeBindingService } = createService();

    releaseRuntimeBindingService.getReleaseByPublishedSkillOrThrow.mockResolvedValue({
      id: 'release-1',
      sourceType: 'execution_flow_template',
    });
    (accessors.getCurrentSnapshotOrThrow as jest.Mock).mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        sourceTemplate: {
          skillId: 'carbone-skill-3',
        },
      },
    });
    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Skill not found',
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          downloadUrl: '/studio/download/doc-3',
          fileName: 'fallback.pdf',
          format: 'pdf',
        },
      } as any);

    const result = await service.executePublishedSkill(
      'published-skill-3',
      {
        params: {
          customerName: 'Carol',
        },
        outputFormat: 'pdf',
      },
      'user-1',
      undefined,
      accessors
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3009/studio/generate-render-data-with-skill',
      {
        publishedSkillId: 'published-skill-3',
        templateId: undefined,
        skillId: 'carbone-skill-3',
        simulatedData: {
          customerName: 'Carol',
        },
        outputFormat: 'pdf',
      },
      {
        timeout: 120000,
      }
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3009/studio/render-resolved',
      {
        publishedSkillId: 'published-skill-3',
        templateId: undefined,
        skillId: 'carbone-skill-3',
        data: {
          customerName: 'Carol',
        },
        outputFormat: 'pdf',
      },
      {
        timeout: 120000,
      }
    );
    expect(result.success).toBe(true);
    expect(result.output).toEqual(
      expect.objectContaining({
        skillId: 'carbone-skill-3',
        downloadUrl: 'http://localhost:3009/studio/download/doc-3',
      })
    );
  });

  it('forwards localized render context and output name to render-resolved', async () => {
    const { service, accessors, releaseRuntimeBindingService } = createService();

    releaseRuntimeBindingService.getReleaseByPublishedSkillOrThrow.mockResolvedValue({
      id: 'release-1',
      sourceType: 'execution_flow_template',
    });
    (accessors.getCurrentSnapshotOrThrow as jest.Mock).mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        sourceTemplate: {
          templateId: 'tpl-004',
          format: 'docx',
          outputName: '技术服务合同',
          sourceLanguage: 'zh',
          targetLanguages: ['ja', 'en'],
        },
      },
    });
    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          success: true,
          renderResolvedRequest: {
            publishedSkillId: 'published-skill-4',
            templateId: 'tpl-004',
            data: {
              localized: {
                partyA: '甲方公司',
              },
            },
            outputFormat: 'docx',
            outputName: '技术服务合同',
            sourceLanguage: 'zh',
            targetLanguages: ['ja', 'en'],
            prepareLocalizedRenderData: true,
          },
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          downloadUrl: '/studio/download/doc-4',
          fileName: 'localized.docx',
          format: 'docx',
        },
      } as any);

    await service.executePublishedSkill(
      'published-skill-4',
      {
        data: {
          partyA: '甲方公司',
        },
      },
      'user-1',
      undefined,
      accessors
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3009/studio/generate-render-data-with-skill',
      {
        publishedSkillId: 'published-skill-4',
        templateId: 'tpl-004',
        skillId: undefined,
        simulatedData: {
          partyA: '甲方公司',
        },
        outputFormat: 'docx',
        outputName: '技术服务合同',
        sourceLanguage: 'zh',
        targetLanguages: ['ja', 'en'],
        prepareLocalizedRenderData: true,
      },
      {
        timeout: 120000,
      }
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3009/studio/render-resolved',
      {
        publishedSkillId: 'published-skill-4',
        templateId: 'tpl-004',
        skillId: undefined,
        data: {
          localized: {
            partyA: '甲方公司',
          },
        },
        outputFormat: 'docx',
        outputName: '技术服务合同',
        sourceLanguage: 'zh',
        targetLanguages: ['ja', 'en'],
        prepareLocalizedRenderData: true,
      },
      {
        timeout: 120000,
      }
    );
  });

  it('returns takeover_required when published browser recording template branch mismatches', async () => {
    const { service, accessors, capabilityReleaseBrowserRecordingService, releaseRuntimeBindingService, browserSessionBroker } =
      createService();

    releaseRuntimeBindingService.getReleaseByPublishedSkillOrThrow.mockResolvedValue({
      id: 'release-browser-1',
      sourceType: 'browser_recording',
    });
    (accessors.getCurrentSnapshotOrThrow as jest.Mock).mockResolvedValue({
      id: 'snapshot-browser-1',
      sourcePayload: {},
    });
    capabilityReleaseBrowserRecordingService.buildRuntimePlan.mockReturnValue({
      backend: 'cli',
      sessionPreferences: {
        mode: 'agent',
        enableCodegen: false,
        headless: false,
      },
      runtimeSteps: [
        {
          id: 'step_read',
          name: '读取毛利率',
          action: 'read_value',
          target: '#detail-gross-margin',
          args: {
            selector: '#detail-gross-margin',
            method: 'innerText',
          },
          outputVar: 'grossMarginRaw',
          description: '读取毛利率',
        },
        {
          id: 'step_branch',
          name: '根据毛利率阈值判断',
          action: 'branch',
          branch: {
            conditionFn:
              '(ctx) => Number(String(ctx.grossMarginRaw || "").replace(/[^0-9.]+/g, "")) >= 20',
            onMatch: 'continue',
            onMismatch: 'takeover',
            takeoverReason: '低于阈值需要人工介入',
            description: '根据毛利率阈值判断',
          },
          description: '根据毛利率阈值判断',
        },
      ],
      runtimeStepsToExecute: [
        {
          id: 'step_read',
          name: '读取毛利率',
          action: 'read_value',
          target: '#detail-gross-margin',
          args: {
            selector: '#detail-gross-margin',
            method: 'innerText',
          },
          outputVar: 'grossMarginRaw',
          description: '读取毛利率',
        },
        {
          id: 'step_branch',
          name: '根据毛利率阈值判断',
          action: 'branch',
          branch: {
            conditionFn:
              '(ctx) => Number(String(ctx.grossMarginRaw || "").replace(/[^0-9.]+/g, "")) >= 20',
            onMatch: 'continue',
            onMismatch: 'takeover',
            takeoverReason: '低于阈值需要人工介入',
            description: '根据毛利率阈值判断',
          },
          description: '根据毛利率阈值判断',
        },
      ],
      targetRuntimeStep: null,
      loopPlan: null,
      initialUrl: 'http://192.168.100.143/',
    });
    mockedAxios.post
      .mockResolvedValueOnce({ data: { success: true, message: 'initialized' } } as any)
      .mockResolvedValueOnce({
        data: {
          success: true,
          snapshotId: 'snapshot-branch-1',
          output: {
            text: '### Result\n17.8%\n### Ran Playwright code',
          },
        },
      } as any)
      .mockResolvedValueOnce({ data: { success: true } } as any);

    const result = await service.executePublishedSkill(
      'published-skill-browser-1',
      {},
      'user-1',
      {
        executionId: 'execution-browser-1',
        stepId: 'phase-browser-1',
      },
      accessors
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3004/browser/init',
      expect.objectContaining({
        backend: 'cli',
        runtimeSessionId: '11111111-1111-4111-8111-111111111111',
      }),
      { timeout: 60000 }
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3004/browser/execute-step',
      expect.objectContaining({
        executionId: 'execution-browser-1',
        action: 'get_text',
        target: '#detail-gross-margin',
        args: {
          selector: '#detail-gross-margin',
          method: 'innerText',
        },
      }),
      { timeout: 120000 }
    );
    expect(browserSessionBroker.freeze).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      '低于阈值需要人工介入'
    );
    expect(result).toEqual(
      expect.objectContaining({
        releaseId: 'release-browser-1',
        publishedSkillId: 'published-skill-browser-1',
        runtime: 'browser_recording',
        status: 'takeover_required',
        success: false,
        requiresTakeover: true,
        takeoverReason: '低于阈值需要人工介入',
        output: expect.objectContaining({
          backend: 'cli',
          variables: {
            grossMarginRaw: '17.8%',
          },
          stepResults: [
            expect.objectContaining({
              stepId: 'step_read',
              action: 'read_value',
              text: '17.8%',
            }),
            expect.objectContaining({
              stepId: 'step_branch',
              action: 'branch',
              takeover: true,
              takeoverReason: '低于阈值需要人工介入',
            }),
          ],
        }),
      })
    );
    expect(mockedAxios.post).not.toHaveBeenCalledWith(
      'http://localhost:3004/browser/reset',
      expect.anything(),
      expect.anything()
    );
  });

  it('requires takeover before executing high-risk browser recording actions at runtime', async () => {
    const { service, accessors, capabilityReleaseBrowserRecordingService, releaseRuntimeBindingService, browserSessionBroker } =
      createService();

    releaseRuntimeBindingService.getReleaseByPublishedSkillOrThrow.mockResolvedValue({
      id: 'release-browser-risk-1',
      sourceType: 'browser_recording',
    });
    (accessors.getCurrentSnapshotOrThrow as jest.Mock).mockResolvedValue({
      id: 'snapshot-browser-risk-1',
      sourcePayload: {},
    });
    capabilityReleaseBrowserRecordingService.buildRuntimePlan.mockReturnValue({
      backend: 'cli',
      sessionPreferences: {
        mode: 'agent',
        enableCodegen: false,
        headless: false,
      },
      runtimeSteps: [
        {
          id: 'step_approve',
          name: '执行承认',
          action: 'click',
          target: 'text=承认',
          description: '点击承认按钮',
        },
      ],
      runtimeStepsToExecute: [
        {
          id: 'step_approve',
          name: '执行承认',
          action: 'click',
          target: 'text=承认',
          description: '点击承认按钮',
        },
      ],
      targetRuntimeStep: null,
      loopPlan: null,
      initialUrl: 'http://localhost/list',
    });
    mockedAxios.post
      .mockResolvedValueOnce({ data: { success: true, message: 'initialized' } } as any)
      .mockResolvedValueOnce({ data: { success: true } } as any);

    const result = await service.executePublishedSkill(
      'published-skill-browser-risk-1',
      {},
      'user-1',
      {
        executionId: 'execution-browser-risk-1',
        stepId: 'phase-browser-risk-1',
      },
      accessors
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3004/browser/init',
      expect.objectContaining({
        backend: 'cli',
        runtimeSessionId: '11111111-1111-4111-8111-111111111111',
      }),
      { timeout: 60000 }
    );
    expect(browserSessionBroker.freeze).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.stringContaining('需要人工接管')
    );
    expect(mockedAxios.post).not.toHaveBeenCalledWith(
      'http://localhost:3004/browser/execute-step',
      expect.anything(),
      expect.anything()
    );
    expect(result).toEqual(
      expect.objectContaining({
        releaseId: 'release-browser-risk-1',
        publishedSkillId: 'published-skill-browser-risk-1',
        runtime: 'browser_recording',
        status: 'takeover_required',
        success: false,
        requiresTakeover: true,
        takeoverReason: expect.stringContaining('需要人工接管'),
        output: expect.objectContaining({
          backend: 'cli',
          runtimeEvidence: expect.objectContaining({
            currentStepId: 'step_approve',
            currentRiskLevel: 'confirm',
            riskReason: '运行时动作包含审批/提交/删除/下载等高风险语义',
          }),
          stepResults: [
            expect.objectContaining({
              stepId: 'step_approve',
              action: 'click',
              takeover: true,
              riskLevel: 'confirm',
            }),
          ],
        }),
      })
    );
  });

  it('blocks forbidden browser recording actions before runtime execution', async () => {
    const { service, accessors, capabilityReleaseBrowserRecordingService, releaseRuntimeBindingService } =
      createService();

    releaseRuntimeBindingService.getReleaseByPublishedSkillOrThrow.mockResolvedValue({
      id: 'release-browser-risk-2',
      sourceType: 'browser_recording',
    });
    (accessors.getCurrentSnapshotOrThrow as jest.Mock).mockResolvedValue({
      id: 'snapshot-browser-risk-2',
      sourcePayload: {},
    });
    capabilityReleaseBrowserRecordingService.buildRuntimePlan.mockReturnValue({
      backend: 'cli',
      sessionPreferences: {
        mode: 'agent',
        enableCodegen: false,
        headless: false,
      },
      runtimeSteps: [
        {
          id: 'step_eval',
          name: '执行脚本',
          action: 'evaluate',
          description: '执行任意脚本',
        },
      ],
      runtimeStepsToExecute: [
        {
          id: 'step_eval',
          name: '执行脚本',
          action: 'evaluate',
          description: '执行任意脚本',
        },
      ],
      targetRuntimeStep: null,
      loopPlan: null,
      initialUrl: 'http://localhost/list',
    });
    mockedAxios.post
      .mockResolvedValueOnce({ data: { success: true, message: 'initialized' } } as any)
      .mockResolvedValueOnce({ data: { success: true } } as any);

    const result = await service.executePublishedSkill(
      'published-skill-browser-risk-2',
      {},
      'user-1',
      {
        executionId: 'execution-browser-risk-2',
        stepId: 'phase-browser-risk-2',
      },
      accessors
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3004/browser/init',
      expect.objectContaining({
        backend: 'cli',
        runtimeSessionId: '11111111-1111-4111-8111-111111111111',
      }),
      { timeout: 60000 }
    );
    expect(mockedAxios.post).not.toHaveBeenCalledWith(
      'http://localhost:3004/browser/execute-step',
      expect.anything(),
      expect.anything()
    );
    expect(mockedAxios.post).not.toHaveBeenCalledWith(
      'http://localhost:3004/browser/reset',
      expect.anything(),
      expect.anything()
    );
    expect(result).toEqual(
      expect.objectContaining({
        releaseId: 'release-browser-risk-2',
        publishedSkillId: 'published-skill-browser-risk-2',
        runtime: 'browser_recording',
        status: 'blocked',
        success: false,
        output: expect.objectContaining({
          backend: 'cli',
          runtimeEvidence: expect.objectContaining({
            currentStepId: 'step_eval',
            currentRiskLevel: 'forbidden',
            riskReason: '不允许执行未授权运行时动作: evaluate',
          }),
          stepResults: [
            expect.objectContaining({
              stepId: 'step_eval',
              action: 'evaluate',
              blocked: true,
              riskLevel: 'forbidden',
            }),
          ],
        }),
        error: '运行时阻断高风险动作: 不允许执行未授权运行时动作: evaluate',
      })
    );
  });

  it('executes browser recording loop plan until stop condition is satisfied', async () => {
    const { service, accessors, capabilityReleaseBrowserRecordingService, releaseRuntimeBindingService } =
      createService();

    releaseRuntimeBindingService.getReleaseByPublishedSkillOrThrow.mockResolvedValue({
      id: 'release-browser-loop-1',
      sourceType: 'browser_recording',
    });
    (accessors.getCurrentSnapshotOrThrow as jest.Mock).mockResolvedValue({
      id: 'snapshot-browser-loop-1',
      sourcePayload: {},
    });
    capabilityReleaseBrowserRecordingService.buildRuntimePlan.mockReturnValue({
      backend: 'cli',
      sessionPreferences: {
        mode: 'agent',
        enableCodegen: false,
        headless: false,
      },
      runtimeSteps: [
        {
          id: 'step_nav',
          name: '打开列表页',
          action: 'goto',
          target: 'http://localhost/list',
          args: { url: 'http://localhost/list' },
        },
        {
          id: 'step_detail',
          name: '打开详情',
          action: 'click',
          target: ':nth-match([data-ai-action="detail"], 1)',
        },
        {
          id: 'step_approve',
          name: '进入下一条',
          action: 'click',
          target: 'text=下一条',
        },
      ],
      runtimeStepsToExecute: [
        {
          id: 'step_nav',
          name: '打开列表页',
          action: 'goto',
          target: 'http://localhost/list',
          args: { url: 'http://localhost/list' },
        },
        {
          id: 'step_detail',
          name: '打开详情',
          action: 'click',
          target: ':nth-match([data-ai-action="detail"], 1)',
        },
        {
          id: 'step_approve',
          name: '进入下一条',
          action: 'click',
          target: 'text=下一条',
        },
      ],
      loopPlan: {
        mode: 'repeat_until',
        maxIterations: 5,
        onNoProgress: 'takeover',
        preLoopSteps: [
          {
            id: 'step_nav',
            name: '打开列表页',
            action: 'goto',
            target: 'http://localhost/list',
            args: { url: 'http://localhost/list' },
          },
        ],
        iterationSteps: [
          {
            id: 'step_detail',
            name: '打开详情',
            action: 'click',
            target: ':nth-match([data-ai-action="detail"], 1)',
          },
          {
            id: 'step_approve',
            name: '进入下一条',
            action: 'click',
            target: 'text=下一条',
          },
        ],
        postLoopSteps: [],
        stopWhen: {
          read: {
            type: 'count',
            step: {
              id: 'loop_stop_read',
              name: '读取循环终止信号',
              action: 'read_value',
              target: '.pending-count',
              args: { selector: '.pending-count' },
            },
          },
          conditionFn: 'Number(value || 0) === 0',
          description: '待处理数量为 0 时结束',
        },
      },
      targetRuntimeStep: null,
      initialUrl: 'http://localhost/list',
    });

    mockedAxios.post
      .mockResolvedValueOnce({ data: { success: true, message: 'initialized' } } as any)
      .mockResolvedValueOnce({
        data: { success: true, snapshotId: 'snapshot-nav-1', output: {} },
      } as any)
      .mockResolvedValueOnce({
        data: {
          success: true,
          snapshotId: 'snapshot-stop-before-1',
          output: { text: '### Result\n2\n### Ran Playwright code' },
        },
      } as any)
      .mockResolvedValueOnce({
        data: { success: true, snapshotId: 'snapshot-detail-1', output: {} },
      } as any)
      .mockResolvedValueOnce({
        data: { success: true, snapshotId: 'snapshot-approve-1', output: {} },
      } as any)
      .mockResolvedValueOnce({
        data: {
          success: true,
          snapshotId: 'snapshot-stop-after-1',
          output: { text: '### Result\n1\n### Ran Playwright code' },
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          success: true,
          snapshotId: 'snapshot-stop-before-2',
          output: { text: '### Result\n1\n### Ran Playwright code' },
        },
      } as any)
      .mockResolvedValueOnce({
        data: { success: true, snapshotId: 'snapshot-detail-2', output: {} },
      } as any)
      .mockResolvedValueOnce({
        data: { success: true, snapshotId: 'snapshot-approve-2', output: {} },
      } as any)
      .mockResolvedValueOnce({
        data: {
          success: true,
          snapshotId: 'snapshot-stop-after-2',
          output: { text: '### Result\n0\n### Ran Playwright code' },
        },
      } as any)
      .mockResolvedValueOnce({ data: { success: true } } as any);

    const result = await service.executePublishedSkill(
      'published-skill-browser-loop-1',
      {},
      'user-1',
      {
        executionId: 'execution-browser-loop-1',
        stepId: 'phase-browser-loop-1',
      },
      accessors
    );

    expect(result).toEqual(
      expect.objectContaining({
        releaseId: 'release-browser-loop-1',
        publishedSkillId: 'published-skill-browser-loop-1',
        runtime: 'browser_recording',
        success: true,
        output: expect.objectContaining({
          backend: 'cli',
          stepResults: expect.arrayContaining([
            expect.objectContaining({
              stepId: 'step_nav',
              action: 'goto',
              snapshotId: 'snapshot-nav-1',
            }),
            expect.objectContaining({
              stepId: 'loop_stop_read:before:1',
              action: 'loop_stop_read',
              text: '2',
            }),
            expect.objectContaining({ stepId: 'step_detail', action: 'click' }),
            expect.objectContaining({ stepId: 'step_approve', action: 'click' }),
            expect.objectContaining({
              stepId: 'loop_stop_read:after:2',
              action: 'loop_stop_read',
              text: '0',
            }),
          ]),
        }),
      })
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3004/browser/execute-step',
      expect.objectContaining({
        action: 'get_text',
        target: '.pending-count',
      }),
      { timeout: 120000 }
    );
    expect(mockedAxios.post).not.toHaveBeenCalledWith(
      'http://localhost:3004/browser/freeze',
      expect.anything(),
      expect.anything()
    );
    expect(mockedAxios.post).toHaveBeenLastCalledWith(
      'http://localhost:3004/browser/reset',
      expect.objectContaining({
        backend: 'cli',
        runtimeSessionId: expect.stringMatching(/^capability-runtime-/),
      }),
      { timeout: 30000 }
    );
  });
});
