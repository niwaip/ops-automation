import 'reflect-metadata';
import axios from 'axios';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BridgeRecorderExportDTO } from '../../registry-release/release-manager/src/interfaces';
import { CapabilityReleaseAssistService } from '../../registry-release/release-manager/src/capability-release-assist.service';
import { CapabilityReleaseSkillDraftService } from '../../registry-release/release-manager/src/capability-release-skill-draft.service';
import { BrowserRecordingFlowNormalizerService } from '../../registry-release/release-manager/src/compiler/browser-recording-flow-normalizer.service';
import { BrowserRecordingRuntimeLoopPlannerService } from '../../registry-release/release-manager/src/compiler/browser-recording-runtime-loop-planner.service';
import { BrowserRecordingRuntimePlannerService } from '../../registry-release/release-manager/src/compiler/browser-recording-runtime-planner.service';
import { BrowserRecordingRuntimeStepBuilderService } from '../../registry-release/release-manager/src/compiler/browser-recording-runtime-step-builder.service';
import { CapabilityReleaseBrowserRecordingService } from '../../registry-release/release-manager/src/compiler/capability-release-browser-recording.service';
import { CapabilityReleaseBuildValidationService } from '../../registry-release/release-manager/src/compiler/capability-release-build-validation.service';
import { CapabilityReleaseRecorderBridgeCompilerService } from '../../registry-release/release-manager/src/compiler/capability-release-recorder-bridge-compiler.service';
import { CapabilityReleaseTemporalSchemaService } from '../../registry-release/release-manager/src/compiler/capability-release-temporal-schema.service';
import { BrowserRecordingActionPolicyService } from '../../registry-release/release-manager/src/validator/browser-recording-action-policy.service';
import { CapabilityReleasePublishValidatorService } from '../../registry-release/release-manager/src/validator/capability-release-publish-validator.service';
import { SchemaCompatibilityService } from '../../registry-release/release-manager/src/validator/schema-compatibility.service';
import { ContractLintService } from '../../registry-release/release-manager/src/validator/contract-lint.service';
import { CapabilityAttestationService } from '../../registry-release/release-manager/src/attestation/capability-attestation.service';
import { CapabilityFixtureService } from '../../registry-release/release-manager/src/fixture/capability-fixture.service';
import { CapabilityReleaseBrowserRuntimeExecutorService } from '../../registry-release/release-manager/src/publisher/capability-release-browser-runtime-executor.service';
import { CapabilityReleaseBrowserRuntimeLoopExecutorService } from '../../registry-release/release-manager/src/publisher/capability-release-browser-runtime-loop-executor.service';
import { CapabilityReleaseBrowserRuntimeResultService } from '../../registry-release/release-manager/src/publisher/capability-release-browser-runtime-result.service';
import { CapabilityReleaseBrowserRuntimeService } from '../../registry-release/release-manager/src/publisher/capability-release-browser-runtime.service';
import { CapabilityReleaseBrowserRuntimeStepExecutorService } from '../../registry-release/release-manager/src/publisher/capability-release-browser-runtime-step-executor.service';
import { CapabilityReleaseBrowserRuntimeSupportService } from '../../registry-release/release-manager/src/publisher/capability-release-browser-runtime-support.service';
import { BrowserPostStateReconcilerService } from '../../registry-release/release-manager/src/publisher/browser-runtime-result/browser-post-state-reconciler.service';
import { BrowserRuntimeStepResultStateService } from '../../registry-release/release-manager/src/publisher/browser-runtime-result/browser-runtime-step-result-state.service';
import { BrowserRunOutputMaterializerService } from '../../registry-release/release-manager/src/publisher/browser-runtime-result/browser-run-output-materializer.service';
import { BrowserLegacyOutputAdapter } from '../../registry-release/release-manager/src/publisher/browser-runtime-result/browser-legacy-output.adapter';
import { CapabilityReleaseDeploymentSmokeService } from '../../registry-release/release-manager/src/publisher/capability-release-deployment-smoke.service';
import { CapabilityReleaseDeploymentService } from '../../registry-release/release-manager/src/publisher/capability-release-deployment.service';
import { CapabilityReleaseDocumentRuntimeService } from '../../registry-release/release-manager/src/publisher/capability-release-document-runtime.service';
import { CapabilityReleasePublishService } from '../../registry-release/release-manager/src/publisher/capability-release-publish.service';
import { CapabilityReleasePublishWriterService } from '../../registry-release/release-manager/src/publisher/capability-release-publish-writer.service';
import { CapabilityReleaseRuntimeService } from '../../registry-release/release-manager/src/publisher/capability-release-runtime.service';
import { CapabilityReleaseSkillPublisherService } from '../../registry-release/release-manager/src/publisher/capability-release-skill-publisher.service';
import { ReleaseRuntimeBindingService } from '../../registry-release/release-manager/src/publisher/release-runtime-binding.service';
import {
  ReleaseAccessorBindingsService,
  ReleaseAccessorDepsService,
  ReleaseAccessorSourceService,
  ReleaseFacadeAccessorFactoryService,
  ReleaseAccessorFactoryService,
  ReleaseAuditAccessorDepsService,
  ReleaseDraftQueryBridgeService,
  ReleaseFacadeAccessorsService,
  ReleaseDraftQuerySourceService,
  ReleaseFacadeAccessorBindingsService,
  ReleaseFacadeContextService,
  ReleaseLifecycleService,
  ReleaseManagementAccessorSourceService,
  ReleaseManagementFacadeContextService,
  ReleaseManagementFacadeAccessorsService,
  ReleaseQueryService,
  ReleaseRuntimeAccessorFactoryService,
  ReleaseRuntimeAccessorSourceService,
  ReleaseRuntimeFacadeContextService,
  ReleaseRuntimeFacadeAccessorsService,
  ReleaseRuntimeAccessorBindingsService,
  ReleaseSupportAccessorDepsService,
  ReleaseSupportService,
} from '../../registry-release/release-manager/src/release';
import {
  CapabilityReleaseManifestService,
  CapabilityReleaseService,
} from '../../registry-release/release-manager/src/release';

import { createService } from './capability-release.test-helper';
jest.mock('axios');

describe('CapabilityReleaseService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CARBONE_SERVICE_URL;
    delete process.env.CARBONE_EXTERNAL_URL;
    delete process.env.DOCKER_ENV;
    delete process.env.NODE_ENV;
    delete process.env.HOST_IP;
    delete process.env.EXTERNAL_HOST;
  });

  it('returns runtime tool policies from tool catalog metadata', async () => {
    const { service, prisma, skillService, toolCatalogService, releaseFacadeContextService } =
      createService();

    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([
        {
          id: 'release-1',
          source_type: 'execution_flow_template',
          source_status: 'ready',
          release_version: 1,
          status: 'published',
          approval_status: 'approved',
          deployment_status: 'succeeded',
          current_source_snapshot_id: null,
          current_build_id: null,
          latest_successful_build_id: null,
          latest_validation_id: null,
          latest_successful_validation_id: null,
          current_skill_draft_id: null,
          published_skill_id: 'skill-1',
          last_deployment_id: null,
          last_deployment_environment: null,
          rollback_of_release_id: null,
          created_by: null,
          created_at: new Date('2026-01-01T00:00:00.000Z'),
          updated_at: new Date('2026-01-01T00:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'deployment-1',
          release_id: 'release-1',
          published_skill_id: 'skill-1',
          environment: 'dev',
          runtime_type: 'flow_runtime',
          artifact_uri: null,
          artifact_hash: null,
          worker_version: null,
          reload_strategy: null,
          request_payload_json: null,
          result_snapshot_json: null,
          logs_json: '[]',
          status: 'succeeded',
          success: true,
          smoke_validation_id: null,
          rollback_target_release_id: null,
          started_at: null,
          finished_at: null,
          created_by: null,
          created_at: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
    skillService.getSkillToolBindings.mockResolvedValue({
      validation: {
        effectiveTools: ['api_call', 'user_ask'],
      },
    });
    toolCatalogService.getCatalogItemsByNames.mockResolvedValue(
      new Map([
        [
          'api_call',
          {
            promptExposure: 'prompt_and_runtime',
            defaultRequiresConfirmation: false,
            defaultRequiresApproval: true,
            status: 'active',
          },
        ],
        [
          'user_ask',
          {
            promptExposure: 'runtime_only',
            defaultRequiresConfirmation: false,
            defaultRequiresApproval: false,
            status: 'active',
          },
        ],
      ])
    );

    const result = await service.getPublishedSkillRuntimeContext('skill-1');

    expect(result.allowedToolNames).toEqual(['api_call', 'user_ask']);
    expect(result.toolPolicies).toEqual([
      {
        name: 'api_call',
        promptExposure: 'prompt_and_runtime',
        defaultRequiresConfirmation: false,
        defaultRequiresApproval: true,
        status: 'active',
      },
      {
        name: 'user_ask',
        promptExposure: 'runtime_only',
        defaultRequiresConfirmation: false,
        defaultRequiresApproval: false,
        status: 'active',
      },
    ]);
  });

  it('extracts document source template metadata from execution flow payload', () => {
    const { service, releaseFacadeContextService } = createService();

    const sourceTemplate = (
      service as any
    ).capabilityReleaseSkillDraftService.extractExecutionFlowSourceTemplate({
      category: 'document',
      paramsSchema: {
        properties: {
          customerName: { type: 'string' },
          amount: { type: 'number' },
        },
      },
      steps: [
        {
          type: 'api',
          name: '渲染文档',
          api: {
            endpoint: '/api/carbone/render-resolved',
            body: {
              templateId: 'tpl-contract',
              outputFormat: 'pdf',
            },
          },
        },
      ],
    });

    expect(sourceTemplate).toEqual({
      templateId: 'tpl-contract',
      skillId: undefined,
      fileName: undefined,
      format: 'pdf',
      variableCount: 2,
    });
  });

  it('executes published document skill via render-resolved when templateId is available', async () => {
    const { service, releaseRuntimeBindingService, releaseFacadeContextService } = createService();

    jest
      .spyOn(releaseRuntimeBindingService, 'getReleaseByPublishedSkillOrThrow')
      .mockResolvedValue({
        id: 'release-1',
        sourceType: 'execution_flow_template',
      } as any);
    jest.spyOn(releaseFacadeContextService as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        category: 'document',
        sourceTemplate: {
          templateId: 'tpl-001',
          format: 'docx',
        },
      },
    });
    jest.spyOn(releaseFacadeContextService as any, 'insertAuditEvent').mockResolvedValue(undefined);
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
      'skill-1',
      {
        data: {
          customerName: 'Alice',
        },
      },
      'user-1',
      {
        executionId: 'exec-1',
        stepId: 'step-1',
      }
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3009/studio/generate-render-data-with-skill',
      {
        publishedSkillId: 'skill-1',
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
        publishedSkillId: 'skill-1',
        templateId: 'tpl-001',
        data: {
          customerName: 'Alice',
        },
        outputFormat: 'docx',
      },
      {
        timeout: 120000,
      }
    );
    expect(result.runtime).toBe('document');
    expect(result.success).toBe(true);
    expect(result.downloadUrl).toBe('http://localhost:3009/studio/download/doc-1');
    expect(result.output).toEqual(
      expect.objectContaining({
        templateId: 'tpl-001',
        fileName: 'contract.docx',
        downloadUrl: 'http://localhost:3009/studio/download/doc-1',
      })
    );
  });

  it('executes published document skill via render-resolved when only source skillId is available', async () => {
    const { service, releaseRuntimeBindingService, releaseFacadeContextService } = createService();

    jest
      .spyOn(releaseRuntimeBindingService, 'getReleaseByPublishedSkillOrThrow')
      .mockResolvedValue({
        id: 'release-1',
        sourceType: 'execution_flow_template',
      } as any);
    jest.spyOn(releaseFacadeContextService as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        category: 'document',
        sourceTemplate: {
          skillId: 'carbone-skill-2',
        },
        steps: [
          {
            type: 'api',
            api: {
              endpoint: '/api/carbone/render-resolved',
            },
          },
        ],
      },
    });
    jest.spyOn(releaseFacadeContextService as any, 'insertAuditEvent').mockResolvedValue(undefined);
    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Skill not found',
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          downloadUrl: '/studio/download/doc-2',
          fileName: 'fallback.docx',
          format: 'docx',
        },
      } as any);

    const result = await service.executePublishedSkill(
      'skill-2',
      {
        params: {
          customerName: 'Bob',
        },
        outputFormat: 'pdf',
      },
      'user-1'
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3009/studio/generate-render-data-with-skill',
      {
        publishedSkillId: 'skill-2',
        templateId: undefined,
        skillId: 'carbone-skill-2',
        simulatedData: {
          customerName: 'Bob',
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
        publishedSkillId: 'skill-2',
        skillId: 'carbone-skill-2',
        data: {
          customerName: 'Bob',
        },
        outputFormat: 'pdf',
      },
      {
        timeout: 120000,
      }
    );
    expect(result.runtime).toBe('document');
    expect(result.success).toBe(true);
    expect(result.downloadUrl).toBe('http://localhost:3009/studio/download/doc-2');
  });

  it('executes document skill and wraps non-object response from carbone engine', async () => {
    const { service, releaseRuntimeBindingService, releaseFacadeContextService } = createService();

    jest
      .spyOn(releaseRuntimeBindingService, 'getReleaseByPublishedSkillOrThrow')
      .mockResolvedValue({
        id: 'release-1',
        sourceType: 'execution_flow_template',
      } as any);
    jest.spyOn(releaseFacadeContextService as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        sourceTemplate: JSON.stringify({ templateId: 'tpl-1' }),
      },
    });
    jest.spyOn(releaseFacadeContextService as any, 'insertAuditEvent').mockResolvedValue(undefined);

    // Carbone engine returns a plain string for some reason (hypothetical)
    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Skill not found',
        },
      } as any)
      .mockResolvedValueOnce({
        data: 'SUCCESS_STRING',
      } as any);

    const result = await service.executePublishedSkill('skill-doc-string', {}, 'user-1');

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ result: 'SUCCESS_STRING', templateId: 'tpl-1' });
  });

  it('executes temporal workflow and wraps string result into object', async () => {
    const { service, activityService, releaseRuntimeBindingService, releaseFacadeContextService } =
      createService();

    jest
      .spyOn(releaseRuntimeBindingService, 'getReleaseByPublishedSkillOrThrow')
      .mockResolvedValue({
        id: 'release-1',
        sourceType: 'temporal_workflow',
      } as any);
    jest.spyOn(releaseFacadeContextService as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        workflowDsl: {
          workflowClassName: 'WeatherWorkflow',
        },
      },
    });
    jest
      .spyOn(releaseFacadeContextService as any, 'resolveTemporalExecutableBuildOrThrow')
      .mockResolvedValue({
        id: 'build-1',
        generatedCode: 'PYTHON_CODE',
      });
    jest.spyOn(releaseFacadeContextService as any, 'insertAuditEvent').mockResolvedValue(undefined);

    jest
      .spyOn(activityService, 'executeCodeStreaming')
      .mockImplementation(async (_code, _fn, _taskQueue, _input, onLog) => {
        onLog('[2026-05-16T00:00:00.000Z] 启动工作流: WeatherWorkflow');
        return {
          success: true,
          result: '上海天气：晴，25度',
          workflowId: 'workflow-1',
        };
      });

    const result = await service.executePublishedSkill(
      'skill-temporal',
      { city: 'shanghai' },
      'user-1'
    );

    expect(activityService.executeCodeStreaming).toHaveBeenCalledWith(
      'PYTHON_CODE',
      'WeatherWorkflow',
      'SKILL_TASK_QUEUE',
      expect.objectContaining({
        city: 'shanghai',
        runtimeSessionId: expect.stringMatching(/^capability-runtime-/),
        workflowId: expect.stringMatching(/^capability-runtime-/),
      }),
      expect.any(Function),
      expect.objectContaining({
        preferSandboxStreaming: true,
      })
    );
    expect(result.success).toBe(true);
    expect(result.runtimeSessionId).toMatch(/^capability-runtime-/);
    expect(result.output).toEqual({
      result: '上海天气：晴，25度',
      temporalLink: 'http://localhost:8088/namespaces/default/workflows/workflow-1',
    });
    expect(result.result).toEqual({
      result: '上海天气：晴，25度',
      temporalLink: 'http://localhost:8088/namespaces/default/workflows/workflow-1',
    });
    expect(result.temporalWorkflowId).toBe('workflow-1');
  });

  it('treats rendered temporal workflow output as success', async () => {
    const { service, activityService, releaseRuntimeBindingService, releaseFacadeContextService } =
      createService();

    jest
      .spyOn(releaseRuntimeBindingService, 'getReleaseByPublishedSkillOrThrow')
      .mockResolvedValue({
        id: 'release-1',
        sourceType: 'temporal_workflow',
      } as any);
    jest.spyOn(releaseFacadeContextService as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        workflowDsl: {
          workflowClassName: 'RenderWorkflow',
        },
      },
    });
    jest
      .spyOn(releaseFacadeContextService as any, 'resolveTemporalExecutableBuildOrThrow')
      .mockResolvedValue({
        id: 'build-1',
        generatedCode: 'PYTHON_CODE',
      });
    jest.spyOn(releaseFacadeContextService as any, 'insertAuditEvent').mockResolvedValue(undefined);

    jest.spyOn(activityService, 'executeCodeStreaming').mockResolvedValue({
      success: true,
      result: {
        status: 'rendered',
        fileName: '保密协议.docx',
        downloadUrl: 'http://localhost:3009/studio/download/doc-1',
      },
      workflowId: 'workflow-rendered-1',
    });

    const result = await service.executePublishedSkill(
      'skill-temporal',
      { contractNo: 'NDA-001' },
      'user-1'
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('completed');
    expect(result.output).toEqual({
      status: 'rendered',
      fileName: '保密协议.docx',
      downloadUrl: 'http://localhost:3009/studio/download/doc-1',
      temporalLink: 'http://localhost:8088/namespaces/default/workflows/workflow-rendered-1',
    });
  });

  it('pushes workflow activity progress to control-plane while executing temporal workflow', async () => {
    const { service, activityService, releaseRuntimeBindingService, releaseFacadeContextService } =
      createService();

    process.env.INTERNAL_API_SHARED_SECRET = 'internal-secret';
    mockedAxios.post.mockResolvedValue({ data: { ok: true } } as any);

    jest
      .spyOn(releaseRuntimeBindingService, 'getReleaseByPublishedSkillOrThrow')
      .mockResolvedValue({
        id: 'release-1',
        sourceType: 'temporal_workflow',
      } as any);
    jest.spyOn(releaseFacadeContextService as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        workflowDsl: {
          workflowClassName: 'LoginWorkflow',
        },
      },
    });
    jest
      .spyOn(releaseFacadeContextService as any, 'resolveTemporalExecutableBuildOrThrow')
      .mockResolvedValue({
        id: 'build-1',
        generatedCode: 'PYTHON_CODE',
      });
    jest.spyOn(releaseFacadeContextService as any, 'insertAuditEvent').mockResolvedValue(undefined);

    jest
      .spyOn(activityService, 'executeCodeStreaming')
      .mockImplementation(async (_code, _fn, _taskQueue, _input, onLog) => {
        onLog('[2026-05-16T00:00:01.000Z] 执行浏览器 Phase Activity: 1. 页面打开');
        onLog('[2026-05-16T00:00:02.000Z] 执行浏览器 Phase Activity: 2. 页面处理');
        return {
          success: true,
          result: { ok: true },
          workflowId: 'workflow-2',
        };
      });

    const result = await service.executePublishedSkill(
      'skill-temporal',
      { city: 'shanghai' },
      'user-1',
      {
        executionId: 'execution-1',
        runtimeSessionId: 'runtime-1',
        phaseKey: 'phase_01_execute_skill',
      }
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3003/api/executions/execution-1/phases/progress',
      {
        parentPhaseKey: 'phase_01_execute_skill',
        activityOrder: 1,
        activityName: '1. 页面打开',
        runtimeSessionId: 'runtime-1',
      },
      expect.objectContaining({
        timeout: 10000,
        headers: expect.objectContaining({
          'x-internal-auth': 'internal-secret',
          'x-user-id': 'user-1',
        }),
      })
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3003/api/executions/execution-1/phases/progress',
      {
        parentPhaseKey: 'phase_01_execute_skill',
        activityOrder: 2,
        activityName: '2. 页面处理',
        runtimeSessionId: 'runtime-1',
      },
      expect.any(Object)
    );
    expect(result.success).toBe(true);
  });

  it('executes published browser recording skill via browser worker with shared runtime session', async () => {
    const { service, releaseRuntimeBindingService, releaseFacadeContextService } = createService();

    jest
      .spyOn(releaseRuntimeBindingService, 'getReleaseByPublishedSkillOrThrow')
      .mockResolvedValue({
        id: 'release-browser-runtime-1',
        sourceType: 'browser_recording',
      } as any);
    jest.spyOn(releaseFacadeContextService as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-browser-1',
      sourcePayload: {
        executionFlow: [
          {
            id: 'step_1',
            name: '1. navigate',
            tool: { name: 'browser_step' },
            input: {
              action: 'navigate',
              params: { url: '${url}' },
            },
          },
          {
            id: 'step_2',
            name: '2. smart_search',
            tool: { name: 'browser_step' },
            input: {
              action: 'smart_search',
              params: { query: '${query}' },
            },
          },
        ],
      },
    });
    jest.spyOn(releaseFacadeContextService as any, 'insertAuditEvent').mockResolvedValue(undefined);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { success: true, output: { status: 'navigated' } } } as any)
      .mockResolvedValueOnce({ data: { success: true, output: { status: 'searched' } } } as any);

    const result = await service.executePublishedSkill(
      'skill-browser-runtime',
      {
        url: 'https://www.bing.com',
        query: 'mcp',
      },
      'user-1',
      {
        executionId: 'exec-browser-1',
        stepId: 'step-system-1',
        runtimeSessionId: 'runtime-browser-1',
      }
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3004/browser/execute-step',
      expect.objectContaining({
        executionId: 'exec-browser-1',
        runtimeSessionId: 'runtime-browser-1',
        action: 'goto',
        target: 'https://www.bing.com',
        args: { url: 'https://www.bing.com' },
      }),
      { timeout: 120000 }
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3004/browser/execute-step',
      expect.objectContaining({
        executionId: 'exec-browser-1',
        runtimeSessionId: 'runtime-browser-1',
        action: 'smart_search',
        args: { query: 'mcp' },
      }),
      { timeout: 120000 }
    );
    expect(result).toEqual(
      expect.objectContaining({
        releaseId: 'release-browser-runtime-1',
        runtime: 'browser_recording',
        success: true,
      })
    );
  });

  it('executes only the requested browser recording step without reinitializing an existing session', async () => {
    const { service, releaseRuntimeBindingService, releaseFacadeContextService } = createService();

    jest
      .spyOn(releaseRuntimeBindingService, 'getReleaseByPublishedSkillOrThrow')
      .mockResolvedValue({
        id: 'release-browser-runtime-target-step',
        sourceType: 'browser_recording',
      } as any);
    jest.spyOn(releaseFacadeContextService as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-browser-target-step',
      sourcePayload: {
        executionFlow: [
          {
            id: 'step_1',
            name: '1. navigate',
            tool: { name: 'browser_step' },
            input: {
              action: 'navigate',
              params: { url: '${url}' },
            },
          },
          {
            id: 'step_2',
            name: '2. fill',
            tool: { name: 'browser_step' },
            input: {
              action: 'fill',
              params: { selector: '#username', value: '${username}' },
            },
          },
          {
            id: 'step_3',
            name: '3. click',
            tool: { name: 'browser_step' },
            input: {
              action: 'click',
              params: { target: '#login-button' },
            },
          },
        ],
      },
    });
    jest.spyOn(releaseFacadeContextService as any, 'insertAuditEvent').mockResolvedValue(undefined);
    mockedAxios.post.mockResolvedValueOnce({
      data: { success: true, output: { status: 'clicked' } },
    } as any);

    const result = await service.executePublishedSkill(
      'skill-browser-runtime',
      {
        url: 'https://www.bing.com',
        username: 'chain',
      },
      'user-1',
      {
        executionId: 'exec-browser-target-step',
        stepId: 'step-system-target-step',
        runtimeSessionId: 'runtime-browser-target-step',
        metadata: {
          executionStepName: '3. click',
          executionStepIndex: 3,
        },
      }
    );

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://localhost:3004/browser/execute-step',
      expect.objectContaining({
        executionId: 'exec-browser-target-step',
        runtimeSessionId: 'runtime-browser-target-step',
        stepId: 'step-system-target-step:step_3',
        action: 'click',
        target: '#login-button',
      }),
      { timeout: 120000 }
    );
    expect(mockedAxios.post).not.toHaveBeenCalledWith(
      'http://localhost:3004/browser/init',
      expect.anything(),
      expect.anything()
    );
    expect(result).toEqual(
      expect.objectContaining({
        releaseId: 'release-browser-runtime-target-step',
        runtime: 'browser_recording',
        success: true,
        output: expect.objectContaining({
          runtimeSessionId: 'runtime-browser-target-step',
          stepResults: [
            expect.objectContaining({
              stepId: 'step_3',
              name: '3. click',
              action: 'click',
            }),
          ],
        }),
      })
    );
  });

  it('normalizes waitForSelector browser recording steps into wait with selector args', async () => {
    const { service, releaseRuntimeBindingService, releaseFacadeContextService } = createService();

    jest
      .spyOn(releaseRuntimeBindingService, 'getReleaseByPublishedSkillOrThrow')
      .mockResolvedValue({
        id: 'release-browser-runtime-wait-selector',
        sourceType: 'browser_recording',
      } as any);
    jest.spyOn(releaseFacadeContextService as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-browser-wait-selector',
      sourcePayload: {
        executionFlow: [
          {
            id: 'step_1',
            name: '1. waitForSelector',
            tool: { name: 'browser_step' },
            input: {
              action: 'waitForSelector',
              params: {
                selector: 'textbox[name="Enter username"]',
                timeoutMs: 15000,
              },
            },
          },
        ],
      },
    });
    jest.spyOn(releaseFacadeContextService as any, 'insertAuditEvent').mockResolvedValue(undefined);
    mockedAxios.post.mockResolvedValueOnce({
      data: { success: true, output: { status: 'selector-ready' } },
    } as any);

    const result = await service.executePublishedSkill('skill-browser-runtime', {}, 'user-1', {
      executionId: 'exec-browser-wait-selector',
      stepId: 'step-system-wait-selector',
      runtimeSessionId: 'runtime-browser-wait-selector',
    });

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3004/browser/execute-step',
      expect.objectContaining({
        executionId: 'exec-browser-wait-selector',
        runtimeSessionId: 'runtime-browser-wait-selector',
        action: 'wait',
        target: 'role=textbox[name="Enter username"]',
        args: {
          duration: 15000,
          selector: 'textbox[name="Enter username"]',
        },
      }),
      { timeout: 120000 }
    );
    expect(result).toEqual(
      expect.objectContaining({
        releaseId: 'release-browser-runtime-wait-selector',
        runtime: 'browser_recording',
        success: true,
      })
    );
  });

  it('preserves browser recording runtime session when a failed step requires takeover', async () => {
    const { service, releaseRuntimeBindingService, releaseFacadeContextService } = createService();

    jest
      .spyOn(releaseRuntimeBindingService, 'getReleaseByPublishedSkillOrThrow')
      .mockResolvedValue({
        id: 'release-browser-runtime-1',
        sourceType: 'browser_recording',
      } as any);
    jest.spyOn(releaseFacadeContextService as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-browser-1',
      sourcePayload: {
        executionFlow: [
          {
            id: 'step_1',
            name: '1. navigate',
            tool: { name: 'browser_step' },
            input: {
              action: 'navigate',
              params: { url: '${url}' },
            },
          },
          {
            id: 'step_2',
            name: '2. click',
            tool: { name: 'browser_step' },
            input: {
              action: 'click',
              params: { target: 'role=menuitem[name="play-circle Executions"]' },
            },
          },
        ],
      },
    });
    jest.spyOn(releaseFacadeContextService as any, 'insertAuditEvent').mockResolvedValue(undefined);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { success: true, message: 'initialized' } } as any)
      .mockResolvedValueOnce({ data: { success: true, output: { status: 'navigated' } } } as any)
      .mockResolvedValueOnce({
        data: {
          success: false,
          errorMessage: 'click failed',
          shouldTakeover: true,
          takeoverReason: '页面未进入预期状态',
        },
      } as any);

    const result = await service.executePublishedSkill(
      'skill-browser-runtime',
      {
        url: 'https://www.bing.com',
      },
      'user-1',
      {
        executionId: 'exec-browser-2',
        stepId: 'step-system-2',
      }
    );

    expect(result).toEqual(
      expect.objectContaining({
        releaseId: 'release-browser-runtime-1',
        runtime: 'browser_recording',
        success: false,
        error: 'click failed',
      })
    );
    expect(mockedAxios.post).not.toHaveBeenCalledWith(
      'http://localhost:3004/browser/reset',
      expect.anything(),
      expect.anything()
    );
  });
});
