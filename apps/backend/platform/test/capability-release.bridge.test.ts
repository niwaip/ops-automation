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

  it('bridges recorder export into release and skill draft', async () => {
    const { service, prisma, releaseDraftService, releaseFacadeContextService } = createService();

    jest.spyOn(releaseDraftService, 'createCapability').mockResolvedValue({
      release: { id: 'release-bridge-1' },
    } as any);
    jest.spyOn(releaseFacadeContextService as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-bridge-1',
      sourceType: 'browser_recording',
    });
    jest.spyOn(releaseFacadeContextService as any, 'getSkillDraftOrThrow').mockResolvedValue({
      id: 'draft-bridge-1',
      name: 'recorder-skill',
    });
    jest.spyOn(releaseFacadeContextService as any, 'insertAuditEvent').mockResolvedValue(undefined);

    const result = await service.bridgeRecorderExport(
      {
        userGoal: '登录并查询报表',
        exportArtifacts: {
          guidance: 'g',
          commands: [{ tool: 'navigate', params: { url: 'https://example.com' } }],
          templateSteps: [{ action: 'fill', params: { value: '${username}' } }],
          loopDraft: {
            type: 'collection',
            variableName: 'items',
          },
          loopPlanPreview: [{ label: 'items[*]' }],
          skillDraft: {
            executionPlan: {
              version: 'v1',
            },
            publishPayload: {
              name: 'recorder-skill',
              description: 'desc',
              triggerKeywords: ['报表查询'],
              paramsSchema: { properties: {}, required: [] },
              executionFlowTemplateIds: [],
              executionFlow: [
                {
                  id: 'step-1',
                  type: 'tool',
                  tool: { name: 'browser_step' },
                  config: { executionPlan: { commands: [] } },
                },
              ],
              tools: ['browser_step'],
              apiEndpoints: { runtimeMetadata: { sourceType: 'browser_recording' } },
            },
          },
        },
      },
      'user-1'
    );
    const insertedApiEndpoints = JSON.parse(prisma.$executeRawUnsafe.mock.calls[0][10]);
    const insertedDraftPayload = JSON.parse(prisma.$executeRawUnsafe.mock.calls[0][11]);

    expect(releaseDraftService.createCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'browser_recording',
        sourceName: 'recorder-skill',
      }),
      'user-1',
      expect.objectContaining({
        getReleaseOrThrow: expect.any(Function),
        insertAuditEvent: expect.any(Function),
      })
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO skill_drafts'),
      expect.any(String),
      'release-bridge-1',
      'browser_recording',
      'recorder-skill',
      'desc',
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      'user-1'
    );
    expect(insertedApiEndpoints.runtimeMetadata).toEqual(
      expect.objectContaining({
        sourceType: 'browser_recording',
        templateSteps: [{ action: 'fill', params: { value: '${username}' } }],
        loopDraft: {
          type: 'collection',
          variableName: 'items',
        },
        loopPlanPreview: [{ label: 'items[*]' }],
        executionPlan: expect.objectContaining({
          version: 'v1',
          templateSteps: [{ action: 'fill', params: { value: '${username}' } }],
          loopDraft: {
            type: 'collection',
            variableName: 'items',
          },
        }),
      })
    );
    expect(insertedDraftPayload.apiEndpoints.runtimeMetadata.executionPlan).toEqual(
      expect.objectContaining({
        version: 'v1',
        templateSteps: [{ action: 'fill', params: { value: '${username}' } }],
        loopDraft: {
          type: 'collection',
          variableName: 'items',
        },
      })
    );
    expect(insertedDraftPayload.loopPlanPreview).toEqual([{ label: 'items[*]' }]);
    expect(result).toEqual({
      release: {
        id: 'release-bridge-1',
        sourceType: 'browser_recording',
      },
      skillDraft: {
        id: 'draft-bridge-1',
        name: 'recorder-skill',
      },
      bridgeMode: 'browser_recording_native',
    });
  });

  it('rejects bridge when target release type is not browser_recording', async () => {
    const { service, releaseFacadeContextService } = createService();

    jest.spyOn(releaseFacadeContextService as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-2',
      sourceType: 'temporal_workflow',
    });

    await expect(
      service.bridgeRecorderExport({
        releaseId: 'release-2',
        exportArtifacts: {
          skillDraft: {
            publishPayload: {
              name: 'bad-bridge',
            },
          },
        },
      })
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'invalid_release_type',
        message: 'bridge 仅支持 browser_recording 类型 release',
        expected: 'browser_recording',
        actual: 'temporal_workflow',
      }),
    });
  });

  it('rejects bridge when publishPayload is missing', async () => {
    const { service, releaseFacadeContextService } = createService();

    await expect(
      service.bridgeRecorderExport({
        userGoal: '登录并查询报表',
        exportArtifacts: {
          guidance: 'g',
          skillDraft: {
            name: 'recorder-skill',
          },
        },
      } as any)
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'missing_publish_payload',
        message: '缺少 exportArtifacts.skillDraft.publishPayload',
      }),
    });
  });

  it('validates bridge DTO: releaseId must be uuid', () => {
    const dto = plainToInstance(BridgeRecorderExportDTO, {
      releaseId: 'not-a-uuid',
      exportArtifacts: {
        skillDraft: {
          publishPayload: {
            name: 'recorder-skill',
          },
        },
      },
    });

    const errors = validateSync(dto);
    const hasReleaseIdError = errors.some((error) => error.property === 'releaseId');
    expect(hasReleaseIdError).toBe(true);
  });

  it('validates bridge DTO: exportArtifacts is required', () => {
    const dto = plainToInstance(BridgeRecorderExportDTO, {
      userGoal: '登录并查询报表',
    });

    const errors = validateSync(dto);
    const hasExportArtifactsError = errors.some((error) => error.property === 'exportArtifacts');
    expect(hasExportArtifactsError).toBe(true);
  });

  it('rejects rollback target when target release equals current release', async () => {
    const { service, releaseFacadeContextService } = createService();

    jest
      .spyOn(releaseFacadeContextService as any, 'getReleaseOrThrow')
      .mockResolvedValue({ id: 'release-1' });

    await expect(
      ((service as any).capabilityReleaseDeploymentService as any).getRollbackTargetOrThrow(
        { id: 'release-1', sourceId: 'src-1', sourceName: 's', sourceType: 'browser_recording' },
        'release-1',
        releaseFacadeContextService.createDeploymentAccessors()
      )
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'rollback_target_same_release',
        message: '不能回滚到当前 Release 自身',
      }),
    });
  });

  it('rejects rollback inference when current release has no source identifiers', async () => {
    const { service, releaseFacadeContextService } = createService();

    await expect(
      ((service as any).capabilityReleaseDeploymentService as any).getRollbackTargetOrThrow(
        {
          id: 'release-1',
          sourceId: null,
          sourceName: null,
          sourceType: 'browser_recording',
        },
        undefined,
        releaseFacadeContextService.createDeploymentAccessors()
      )
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'rollback_source_identifier_missing',
        message: '当前 Release 缺少可用于推断回滚目标的源标识',
      }),
    });
  });
});
