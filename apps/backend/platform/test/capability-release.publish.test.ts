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

  it('derives temporal workflow runtime mapping metadata from workflowDsl when draft payload lacks runtime metadata', () => {
    const { service, releaseFacadeContextService } = createService();

    const payload = (service as any).capabilityReleaseSkillDraftService.buildSkillDraftPayload(
      {
        sourceType: 'temporal_workflow',
        sourceId: 'wf-tech-service',
        releaseVersion: 6,
      },
      {
        sourcePayload: {
          name: 'TechnicalServiceContractRenderingWorkflow',
          description: '生成技术服务合同工作流',
          goal: '生成合同',
          workflowDsl: {
            inputParams: {
              'contract.partyA': {
                type: 'string',
                description: '甲方名称',
                required: true,
                renderPath: ['contract.partyA_cn', 'contract.partyA_jp'],
              },
              'payment.bankAccount': {
                type: 'string',
                description: '收款账号',
                required: true,
              },
            },
            inputPolicy: {
              params: {
                'payment.bankAccount': {
                  templateBinding: 'payment.bankAccount_cn',
                },
              },
            },
          },
          activityDsl: {},
          paramsSchema: {
            properties: {
              'contract.partyA': {
                type: 'string',
                description: '甲方名称',
              },
              'payment.bankAccount': {
                type: 'string',
                description: '收款账号',
              },
            },
            required: ['contract.partyA', 'payment.bankAccount'],
          },
          workflowSteps: [{ id: 'step-1', name: 'render' }],
        },
      },
      {
        id: 'validation-3',
      }
    );

    expect(payload.paramsSchema).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          'contract.partyA': expect.objectContaining({
            renderPath: ['contract.partyA_cn', 'contract.partyA_jp'],
          }),
          'payment.bankAccount': expect.objectContaining({
            renderPath: 'payment.bankAccount_cn',
          }),
        }),
      })
    );
    expect(payload.apiEndpoints.runtimeMetadata).toEqual(
      expect.objectContaining({
        sourceType: 'temporal_workflow',
        mappingHints: expect.arrayContaining([
          { parameter: 'contract.partyA', path: 'contract.partyA_cn' },
          { parameter: 'contract.partyA', path: 'contract.partyA_jp' },
          { parameter: 'payment.bankAccount', path: 'payment.bankAccount_cn' },
        ]),
        workflowInputPolicy: {
          params: {
            'payment.bankAccount': {
              templateBinding: 'payment.bankAccount_cn',
            },
          },
        },
      })
    );
  });

  it('drops stale raw required fields when workflow inputPolicy downgrades temporal params to optional', () => {
    const { service, releaseFacadeContextService } = createService();

    const schema = (
      service as any
    ).capabilityReleaseTemporalSchemaService.resolveEffectiveTemporalParamsSchema({
      workflowDsl: {
        inputParams: {
          'contract.partyA': {
            type: 'string',
            description: '甲方名称',
            required: true,
          },
          'contract.signingDate': {
            type: 'string',
            description: '签署日期',
            required: true,
          },
        },
        inputPolicy: {
          params: {
            'contract.partyA': {
              requiredMode: 'optional',
            },
            'contract.signingDate': {
              requiredMode: 'always',
            },
          },
        },
      },
      activityDsl: {},
      paramsSchema: {
        properties: {
          'contract.partyA': {
            type: 'string',
            description: '甲方名称',
          },
          'contract.signingDate': {
            type: 'string',
            description: '签署日期',
          },
        },
        required: ['contract.partyA', 'contract.signingDate'],
      },
    });

    expect(schema.required).toEqual(['contract.signingDate']);
    expect(schema.properties).toEqual(
      expect.objectContaining({
        'contract.partyA': expect.objectContaining({ type: 'string' }),
        'contract.signingDate': expect.objectContaining({ type: 'string' }),
      })
    );
  });

  it('falls back to concise description labels when declared displayName is still machine-like', () => {
    const { service, releaseFacadeContextService } = createService();

    const schema = (
      service as any
    ).capabilityReleaseTemporalSchemaService.buildTemporalParamsSchema({
      inputParams: {
        'info.partyA': {
          type: 'string',
          displayName: 'info.partyA',
          description: '采购方（甲方）名称，明确合同责任主体及付款义务承担方',
          required: true,
        },
        'deliveryItems[].location': {
          type: 'string',
          displayName: 'deliveryItems[].location',
          description: '设备交付的地理位置，为物流运输、到场签收及安装调试提供地点信息',
          required: false,
        },
      },
    });

    expect(schema).toEqual({
      properties: expect.objectContaining({
        'info.partyA': expect.objectContaining({ displayName: '采购方（甲方）名称' }),
        'deliveryItems[].location': expect.objectContaining({ displayName: '设备交付的地理位置' }),
      }),
      required: ['info.partyA'],
    });
  });

  it('persists generateSkillDraft paramsSchema using workflow inputPolicy requiredMode for temporal releases', async () => {
    const { service, prisma, releaseFacadeContextService } = createService();

    prisma.$executeRawUnsafe.mockResolvedValue(undefined);
    jest
      .spyOn(releaseFacadeContextService as any, 'getReleaseOrThrow')
      .mockResolvedValueOnce({
        id: 'release-temporal-1',
        sourceType: 'temporal_workflow',
        sourceId: 'wf-contract-1',
        releaseVersion: 8,
      })
      .mockResolvedValueOnce({
        id: 'release-temporal-1',
        sourceType: 'temporal_workflow',
        sourceId: 'wf-contract-1',
        releaseVersion: 8,
        currentSkillDraftId: 'draft-generated-1',
        status: 'pending_approval',
        approvalStatus: 'pending',
      });
    jest.spyOn(releaseFacadeContextService as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-temporal-1',
      sourcePayload: {
        name: '技术服务合同渲染工作流',
        description: '根据合同要素生成文档',
        goal: '生成技术服务合同',
        workflowDsl: {
          inputParams: {
            'contract.partyA': {
              type: 'string',
              description: '甲方名称',
              required: true,
            },
            'contract.signingDate': {
              type: 'string',
              description: '签署日期',
              required: true,
            },
          },
          inputPolicy: {
            params: {
              'contract.partyA': {
                requiredMode: 'optional',
                templateBinding: 'contract.partyA_cn',
              },
              'contract.signingDate': {
                requiredMode: 'always',
                templateBinding: 'contract.signingDate_cn',
              },
            },
          },
        },
        activityDsl: {
          activities: [],
        },
        paramsSchema: {
          properties: {
            'contract.partyA': {
              type: 'string',
              description: '甲方名称',
            },
            'contract.signingDate': {
              type: 'string',
              description: '签署日期',
            },
          },
          required: ['contract.partyA', 'contract.signingDate'],
        },
        workflowSteps: [{ id: 'render', name: '渲染合同' }],
      },
    });
    jest
      .spyOn(releaseFacadeContextService as any, 'getLatestSuccessfulValidationOrThrow')
      .mockResolvedValue({
        id: 'validation-1',
        buildId: 'build-1',
        resultSnapshot: null,
      });
    jest.spyOn(releaseFacadeContextService as any, 'getSkillDraftOrThrow').mockResolvedValue({
      id: 'draft-generated-1',
      paramsSchema: {
        required: ['contract.signingDate'],
      },
      draftPayload: {},
    });
    jest.spyOn(releaseFacadeContextService as any, 'insertAuditEvent').mockResolvedValue(undefined);

    const result = await service.generateSkillDraft('release-temporal-1', {}, 'user-1');

    const insertedParamsSchema = JSON.parse(prisma.$executeRawUnsafe.mock.calls[0][9]);
    expect(insertedParamsSchema.required).toEqual(['contract.signingDate']);
    expect(insertedParamsSchema.properties).toEqual(
      expect.objectContaining({
        'contract.partyA': expect.objectContaining({ type: 'string' }),
        'contract.signingDate': expect.objectContaining({ type: 'string' }),
      })
    );
    expect(result).toEqual({
      release: expect.objectContaining({
        id: 'release-temporal-1',
        currentSkillDraftId: 'draft-generated-1',
      }),
      skillDraft: expect.objectContaining({
        id: 'draft-generated-1',
        paramsSchema: {
          required: ['contract.signingDate'],
        },
      }),
    });
  });

  it('blocks publishing when tool validation fails', async () => {
    const { service, skillService, releaseFacadeContextService } = createService();

    jest.spyOn(releaseFacadeContextService as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-1',
      approvalStatus: 'approved',
      status: 'approved',
      currentSkillDraftId: 'draft-1',
      publishedSkillId: null,
    });
    jest.spyOn(releaseFacadeContextService as any, 'getSkillDraftOrThrow').mockResolvedValue({
      id: 'draft-1',
      tools: ['api_call'],
      executionFlowTemplateIds: ['tpl-1'],
      draftPayload: {
        name: 'Test Draft',
        description: 'desc',
        tools: ['api_call'],
        executionFlowTemplateIds: ['tpl-1'],
        outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
      },
    });
    jest.spyOn(releaseFacadeContextService as any, 'insertAuditEvent').mockResolvedValue(undefined);
    skillService.validateSkillToolsPayload.mockResolvedValue({
      isValid: false,
      declaredTools: ['api_call'],
      inferredTools: [],
      effectiveTools: ['api_call'],
      missingTools: [],
      disabledTools: ['api_call'],
      forbiddenSkillTools: [],
      undeclaredFlowTools: [],
      messages: [
        {
          code: 'tool_disabled',
          toolName: 'api_call',
          severity: 'error',
          message: '工具 "api_call" 当前已被禁用',
        },
      ],
    });

    await expect(service.publishSkill('release-1', {}, 'user-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'skill_publish_tool_validation_failed',
        message: '发布前工具校验失败',
      }),
    });
    expect((releaseFacadeContextService as any).insertAuditEvent).toHaveBeenCalledWith(
      'release-1',
      'skill_publish_blocked_by_tool_validation',
      'user-1',
      false,
      '发布前工具校验失败',
      expect.objectContaining({
        toolValidation: expect.objectContaining({
          isValid: false,
        }),
      })
    );
  });

  it('blocks publishing template workflows when document mappings are still empty', async () => {
    const { service, skillService, releaseFacadeContextService } = createService();

    jest.spyOn(releaseFacadeContextService as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-template-1',
      approvalStatus: 'approved',
      status: 'approved',
      sourceType: 'temporal_workflow',
      currentSkillDraftId: 'draft-template-1',
      publishedSkillId: null,
    });
    jest.spyOn(releaseFacadeContextService as any, 'getSkillDraftOrThrow').mockResolvedValue({
      id: 'draft-template-1',
      tools: [],
      executionFlowTemplateIds: [],
      draftPayload: {
        name: '技术服务合同渲染技能',
        description: 'desc',
        tools: [],
        outputSchema: {
          type: 'object',
          properties: { contractText: { type: 'string' } },
          required: ['contractText'],
        },
      },
    });
    jest.spyOn(releaseFacadeContextService as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      sourcePayload: {
        sourceTemplate: {
          templateId: 'tpl-tech-service',
          fileName: 'technical-service-contract.docx',
        },
        workflowDsl: {
          inputParams: {
            'contract.partyA': {
              type: 'string',
              description: '甲方名称',
              required: true,
            },
          },
        },
        activityDsl: {
          activities: [],
        },
      },
    });
    jest.spyOn(releaseFacadeContextService as any, 'insertAuditEvent').mockResolvedValue(undefined);
    skillService.validateSkillToolsPayload.mockResolvedValue({
      isValid: true,
      declaredTools: [],
      inferredTools: [],
      effectiveTools: [],
      missingTools: [],
      disabledTools: [],
      forbiddenSkillTools: [],
      undeclaredFlowTools: [],
      messages: [],
    });

    await expect(service.publishSkill('release-template-1', {}, 'user-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'temporal_document_mapping_not_ready',
        message: '当前模板工作流缺少显式 renderPath/templateBinding，暂不允许发布',
        mappingReadiness: expect.objectContaining({
          applicable: true,
          mappedInputCount: 0,
          renderPathParamCount: 0,
          templateBindingParamCount: 0,
        }),
      }),
    });
    expect((releaseFacadeContextService as any).insertAuditEvent).toHaveBeenCalledWith(
      'release-template-1',
      'skill_publish_blocked_by_document_mapping',
      'user-1',
      false,
      '发布前阻断：模板工作流缺少显式 renderPath/templateBinding',
      expect.objectContaining({
        mappingReadiness: expect.objectContaining({
          applicable: true,
          mappedInputCount: 0,
        }),
      })
    );
  });

  it('normalizes legacy browser_execute tool names when publishing browser recording skills', async () => {
    const { service, skillService, prisma, releaseFacadeContextService } = createService();

    jest.spyOn(releaseFacadeContextService as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-browser-1',
      approvalStatus: 'approved',
      status: 'approved',
      sourceType: 'browser_recording',
      sourceName: 'Browser Skill',
      currentSkillDraftId: 'draft-browser-1',
      publishedSkillId: null,
    });
    jest.spyOn(releaseFacadeContextService as any, 'getSkillDraftOrThrow').mockResolvedValue({
      id: 'draft-browser-1',
      tools: ['skill_match', 'browser_execute'],
      executionFlowTemplateIds: [],
      draftPayload: {
        name: 'Browser Skill',
        description: 'desc',
        tools: ['skill_match', 'browser_execute'],
        executionFlow: [
          {
            id: 'step-1',
            type: 'tool',
            tool: { name: 'browser_execute' },
            config: { executionPlan: { commands: [] } },
          },
        ],
        executionFlowTemplateIds: [],
        outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
      },
    });
    jest
      .spyOn(releaseFacadeContextService as any, 'getCurrentSnapshotOrThrow')
      .mockResolvedValue({ id: 'snapshot-1', payload: {} });
    jest.spyOn(releaseFacadeContextService as any, 'insertAuditEvent').mockResolvedValue(undefined);
    // §10.3 fixture gate: a publish must clear with a complete fixture set
    prisma.$queryRawUnsafe.mockImplementation((sql: string) =>
      sql.includes('capability_fixtures')
        ? Promise.resolve([
            { fixture_type: 'input', count: 1 },
            { fixture_type: 'output', count: 1 },
            { fixture_type: 'negative', count: 1 },
          ])
        : Promise.resolve([])
    );
    skillService.validateSkillToolsPayload.mockResolvedValue({
      isValid: true,
      declaredTools: ['skill_match', 'browser_step'],
      inferredTools: ['browser_step'],
      effectiveTools: ['skill_match', 'browser_step'],
      missingTools: [],
      disabledTools: [],
      forbiddenSkillTools: [],
      undeclaredFlowTools: [],
      messages: [],
    });
    skillService.createSkill.mockResolvedValue({ id: 'skill-browser-1' });

    const result = await service.publishSkill('release-browser-1', {}, 'user-1');

    expect(skillService.validateSkillToolsPayload).toHaveBeenCalledWith({
      tools: ['skill_match', 'browser_step'],
      executionFlow: [
        expect.objectContaining({
          tool: expect.objectContaining({ name: 'browser_step' }),
        }),
      ],
      executionFlowTemplateIds: [],
    });
    expect(skillService.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: ['skill_match', 'browser_step'],
        executionFlow: [
          expect.objectContaining({
            tool: expect.objectContaining({ name: 'browser_step' }),
          }),
        ],
      })
    );
    expect(result).toEqual({
      release: expect.objectContaining({ id: 'release-browser-1' }),
      publishedSkillId: 'skill-browser-1',
    });
  });

  it('blocks publishing when the §10.3 fixture set is incomplete (hard gate)', async () => {
    const { service, skillService, prisma, releaseFacadeContextService } = createService();

    jest.spyOn(releaseFacadeContextService as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-no-fixtures-1',
      approvalStatus: 'approved',
      status: 'approved',
      sourceType: 'browser_recording',
      sourceName: 'Browser Skill',
      currentSkillDraftId: 'draft-no-fixtures-1',
      publishedSkillId: null,
    });
    jest.spyOn(releaseFacadeContextService as any, 'getSkillDraftOrThrow').mockResolvedValue({
      id: 'draft-no-fixtures-1',
      tools: [],
      executionFlowTemplateIds: [],
      draftPayload: {
        name: 'No Fixtures Skill',
        description: 'desc',
        tools: [],
        outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
      },
    });
    jest.spyOn(releaseFacadeContextService as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      payload: {},
    });
    const auditSpy = jest
      .spyOn(releaseFacadeContextService as any, 'insertAuditEvent')
      .mockResolvedValue(undefined);
    prisma.$queryRawUnsafe.mockResolvedValue([]); // no fixtures stored yet
    skillService.validateSkillToolsPayload.mockResolvedValue({
      isValid: true,
      declaredTools: [],
      inferredTools: [],
      effectiveTools: [],
      missingTools: [],
      disabledTools: [],
      forbiddenSkillTools: [],
      undeclaredFlowTools: [],
      messages: [],
    });

    await expect(service.publishSkill('release-no-fixtures-1', {}, 'user-1')).rejects.toMatchObject(
      {
        response: expect.objectContaining({
          code: 'fixture_validation_failed',
          message: expect.stringContaining('缺少必要 Fixture'),
        }),
      }
    );
    expect(auditSpy).toHaveBeenCalledWith(
      'release-no-fixtures-1',
      'fixture_validation_failed',
      'user-1',
      false,
      expect.stringContaining('Fixture 门禁'),
      expect.objectContaining({ errors: expect.any(Array) })
    );
    expect(skillService.createSkill).not.toHaveBeenCalled();
  });

  it('blocks the publish and records an attestation_failed audit event when Gate 5 attestation fails (§10.6)', async () => {
    const { service, skillService, prisma, releaseFacadeContextService } = createService();

    jest.spyOn(releaseFacadeContextService as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-attest-fail-1',
      approvalStatus: 'approved',
      status: 'approved',
      sourceType: 'browser_recording',
      sourceName: 'Attestation Skill',
      currentSkillDraftId: 'draft-attest-fail-1',
      currentBuildId: 'build-attest-1',
      publishedSkillId: null,
    });
    jest.spyOn(releaseFacadeContextService as any, 'getSkillDraftOrThrow').mockResolvedValue({
      id: 'draft-attest-fail-1',
      tools: [],
      executionFlowTemplateIds: [],
      draftPayload: {
        name: 'Attestation Skill',
        description: 'desc',
        tools: [],
        outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
      },
    });
    jest.spyOn(releaseFacadeContextService as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      payload: {},
    });
    const auditSpy = jest
      .spyOn(releaseFacadeContextService as any, 'insertAuditEvent')
      .mockResolvedValue(undefined);
    // §10.3 fixture gate: a publish must clear with a complete fixture set
    prisma.$queryRawUnsafe.mockImplementation((sql: string) =>
      sql.includes('capability_fixtures')
        ? Promise.resolve([
            { fixture_type: 'input', count: 1 },
            { fixture_type: 'output', count: 1 },
            { fixture_type: 'negative', count: 1 },
          ])
        : Promise.resolve([])
    );
    // §15.4 item 5: the compatibility diff is persisted onto the build before Gate 5
    prisma.$executeRawUnsafe.mockResolvedValue(undefined);
    skillService.validateSkillToolsPayload.mockResolvedValue({
      isValid: true,
      declaredTools: [],
      inferredTools: [],
      effectiveTools: [],
      missingTools: [],
      disabledTools: [],
      forbiddenSkillTools: [],
      undeclaredFlowTools: [],
      messages: [],
    });
    skillService.createSkill.mockResolvedValue({ id: 'skill-attest-1' });
    // Gate 5 (§10.6) is a HARD gate: a failing attestation blocks the publish.
    // The failure is recorded as an audit event (fix ⑨) before the block.
    jest
      .spyOn(CapabilityAttestationService.prototype, 'buildAttestation')
      .mockRejectedValue(new Error('boom'));

    await expect(service.publishSkill('release-attest-fail-1', {}, 'user-1')).rejects.toMatchObject(
      {
        response: expect.objectContaining({
          code: 'attestation_failed',
          message: expect.stringContaining('boom'),
        }),
      }
    );
    expect(skillService.createSkill).not.toHaveBeenCalled();
    // The failure is recorded as an audit event before blocking the publish
    expect(auditSpy).toHaveBeenCalledWith(
      'release-attest-fail-1',
      'attestation_failed',
      'user-1',
      false,
      expect.stringContaining('发布被阻断'),
      expect.objectContaining({ buildId: 'build-attest-1', error: 'boom' })
    );
  });

  it('rejects publishing when release approval is pending', async () => {
    const { service, releaseFacadeContextService } = createService();

    jest.spyOn(releaseFacadeContextService as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-pending',
      approvalStatus: 'pending',
      status: 'pending_approval',
      currentSkillDraftId: 'draft-1',
    });

    await expect(service.publishSkill('release-pending', {}, 'user-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'release_approval_pending',
        message: '当前 Release 尚未审批通过',
      }),
    });
  });

  it('rejects publishing when release approval is rejected', async () => {
    const { service, releaseFacadeContextService } = createService();

    jest.spyOn(releaseFacadeContextService as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-rejected',
      approvalStatus: 'rejected',
      status: 'draft',
      currentSkillDraftId: 'draft-1',
    });

    await expect(service.publishSkill('release-rejected', {}, 'user-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'release_approval_rejected',
        message: '当前 Release 审批未通过，请调整草案后重新提交',
      }),
    });
  });

  it('allows pre-publish deploy for non-temporal releases to validate runtime wiring', async () => {
    const { service, releaseFacadeContextService } = createService();

    jest
      .spyOn(releaseFacadeContextService as any, 'getReleaseOrThrow')
      .mockResolvedValueOnce({
        id: 'release-no-skill',
        sourceType: 'browser_recording',
        publishedSkillId: null,
        status: 'approved',
        sourceId: 'template-1',
      })
      .mockResolvedValueOnce({
        id: 'release-no-skill',
        sourceType: 'browser_recording',
        publishedSkillId: null,
        status: 'deployed',
        sourceId: 'template-1',
      });
    jest.spyOn(releaseFacadeContextService as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {},
    });
    jest
      .spyOn((service as any).capabilityReleaseBuildValidationService, 'resolveBuildForValidation')
      .mockResolvedValue(undefined);
    jest
      .spyOn((service as any).capabilityReleaseDeploymentService, 'finishDeployment')
      .mockResolvedValue(undefined);
    jest.spyOn(releaseFacadeContextService as any, 'insertAuditEvent').mockResolvedValue(undefined);
    jest.spyOn(releaseFacadeContextService as any, 'getBuildOrThrow').mockResolvedValue({
      id: 'build-1',
      releaseId: 'release-no-skill',
      status: 'succeeded',
    });
    jest
      .spyOn(
        (service as any).capabilityReleaseDeploymentService.capabilityReleaseDeploymentSmokeService,
        'runPostDeploySmokeTest'
      )
      .mockResolvedValue({
        success: true,
        score: 100,
        logs: [],
        validationId: 'validation-smoke-1',
        errorSummary: null,
      });
    jest.spyOn(releaseFacadeContextService as any, 'getDeploymentOrThrow').mockResolvedValue({
      id: 'deployment-1',
      releaseId: 'release-no-skill',
      status: 'succeeded',
      success: true,
    });

    const result = await service.deploy('release-no-skill', {}, 'user-1');

    expect(
      (service as any).capabilityReleaseDeploymentService.finishDeployment
    ).toHaveBeenCalledWith(
      expect.any(String),
      'release-no-skill',
      'deployed',
      'succeeded',
      true,
      expect.arrayContaining([
        expect.stringContaining('当前尚未发布 Skill，本次部署用于验证运行链路与参数'),
      ]),
      expect.objectContaining({
        publishedSkillId: null,
        prePublishDeploy: true,
        sourceTemplateId: 'template-1',
      }),
      'template-runtime://template-1',
      'template-1',
      null,
      'validation-smoke-1',
      null
    );
    expect(result).toEqual({
      release: expect.objectContaining({ id: 'release-no-skill', status: 'deployed' }),
      deployment: expect.objectContaining({ id: 'deployment-1', success: true }),
    });
  });

  it('rejects deploy when release is already deploying', async () => {
    const { service, releaseFacadeContextService } = createService();

    jest.spyOn(releaseFacadeContextService as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-deploying',
      sourceType: 'browser_recording',
      publishedSkillId: 'skill-1',
      status: 'deploying',
    });

    await expect(service.deploy('release-deploying', {}, 'user-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'release_deploying',
        message: '当前 Release 正在部署中',
      }),
    });
  });

  it('uses snapshot validation for browser recording sandbox validation', async () => {
    const { service, releaseFacadeContextService } = createService();

    jest
      .spyOn(releaseFacadeContextService as any, 'getReleaseOrThrow')
      .mockResolvedValueOnce({
        id: 'release-browser-validate-1',
        sourceType: 'browser_recording',
        status: 'draft',
      })
      .mockResolvedValueOnce({
        id: 'release-browser-validate-1',
        sourceType: 'browser_recording',
        status: 'draft_ready',
      });
    jest.spyOn(releaseFacadeContextService as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        steps: [{ id: 'step_1', name: '打开页面' }],
        executionFlow: [{ id: 'flow-1', tool: { name: 'browser_step' } }],
      },
    });
    jest
      .spyOn((service as any).capabilityReleaseBuildValidationService, 'resolveBuildForValidation')
      .mockResolvedValue({
        id: 'build-1',
      });
    jest
      .spyOn(
        (service as any).capabilityReleaseBuildValidationService,
        'shouldPreserveReleaseStatusDuringValidation'
      )
      .mockReturnValue(false);
    jest
      .spyOn((service as any).capabilityReleaseBuildValidationService, 'createValidationRecord')
      .mockResolvedValue('validation-1');
    jest
      .spyOn((service as any).capabilityReleaseBuildValidationService, 'finishValidation')
      .mockResolvedValue(undefined);
    jest.spyOn(releaseFacadeContextService as any, 'insertAuditEvent').mockResolvedValue(undefined);
    jest.spyOn(releaseFacadeContextService as any, 'getValidationOrThrow').mockResolvedValue({
      id: 'validation-1',
      success: true,
      score: 100,
    });

    const result = await service.validateSandbox(
      'release-browser-validate-1',
      { testCases: ['通过 bing 查询mcp'] },
      'user-1'
    );

    expect(
      (service as any).capabilityReleaseBuildValidationService.finishValidation
    ).toHaveBeenCalledWith(
      'validation-1',
      'release-browser-validate-1',
      'draft_ready',
      true,
      100,
      expect.arrayContaining([
        '开始执行浏览器录制快照静态验证...',
        expect.stringContaining('通过 bing 查询mcp'),
      ]),
      expect.objectContaining({
        mode: 'static_snapshot_validation',
        testCases: ['通过 bing 查询mcp'],
      }),
      null,
      false
    );
    expect(result).toEqual({
      release: expect.objectContaining({ id: 'release-browser-validate-1' }),
      validation: expect.objectContaining({ id: 'validation-1' }),
    });
  });

  it('applies the Gate 2 output schema check on the streaming sandbox path (fix ⑦)', async () => {
    const { service, activityService, releaseFacadeContextService } = createService();

    jest.spyOn(releaseFacadeContextService as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-stream-gate2-1',
      sourceType: 'temporal_workflow',
      status: 'validating',
    });
    jest.spyOn(releaseFacadeContextService as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        workflowDsl: {},
        activityDsl: {},
        contracts: {
          output: {
            schema: {
              type: 'object',
              additionalProperties: true,
              properties: { topic: { type: 'string', enum: ['news'] } },
            },
          },
        },
      },
    });
    jest
      .spyOn(releaseFacadeContextService as any, 'resolveTemporalExecutableBuildOrThrow')
      .mockResolvedValue({ id: 'build-1', generatedCode: 'PYTHON_CODE' });
    jest.spyOn(releaseFacadeContextService as any, 'insertAuditEvent').mockResolvedValue(undefined);
    jest.spyOn(releaseFacadeContextService as any, 'getValidationOrThrow').mockResolvedValue({
      id: 'validation-1',
      success: false,
      score: 40,
    });
    jest
      .spyOn((service as any).capabilityReleaseBuildValidationService, 'createValidationRecord')
      .mockResolvedValue('validation-1');
    const finishSpy = jest
      .spyOn((service as any).capabilityReleaseBuildValidationService, 'finishValidation')
      .mockResolvedValue(undefined);
    (activityService as any).validateWorkflowRealStreaming = jest.fn().mockResolvedValue({
      success: true,
      score: 100,
      result: { businessData: { topic: 'ghost' } },
      error: null,
      traceback: null,
      logs: [],
    });

    const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
    await service.validateSandboxStream(
      'release-stream-gate2-1',
      { fn: 'main', input: {} },
      'user-1',
      undefined,
      (event, payload) => events.push({ event, payload })
    );

    // The runtime passed, but Gate 2 rejects the enum-violating businessData
    // — the stream path must fail the validation exactly like validateSandbox.
    expect(finishSpy).toHaveBeenCalledWith(
      'validation-1',
      'release-stream-gate2-1',
      'validation_failed',
      false,
      40,
      expect.arrayContaining([expect.stringContaining('[Gate 2 Output Schema Violation]')]),
      expect.objectContaining({
        result: expect.objectContaining({ businessData: { topic: 'ghost' } }),
      }),
      expect.stringContaining('OUTPUT_SCHEMA_VIOLATION')
    );
    expect(
      events.some(
        (e) =>
          e.event === 'log' && String(e.payload.message).includes('Gate 2 Output Schema Violation')
      )
    ).toBe(true);
  });

  it('Gate 2 honors the contract dataPath instead of the hardcoded envelope path (fix ⑤)', async () => {
    const { service, activityService, releaseFacadeContextService } = createService();

    jest.spyOn(releaseFacadeContextService as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-stream-gate2-datapath-1',
      sourceType: 'temporal_workflow',
      status: 'validating',
    });
    jest.spyOn(releaseFacadeContextService as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        workflowDsl: {},
        activityDsl: {},
        contracts: {
          output: {
            dataPath: '$.data', // 契约声明业务数据在 $.data，而不是默认 envelope 路径
            schema: {
              type: 'object',
              additionalProperties: true,
              properties: { topic: { type: 'string', enum: ['news'] } },
            },
          },
        },
      },
    });
    jest
      .spyOn(releaseFacadeContextService as any, 'resolveTemporalExecutableBuildOrThrow')
      .mockResolvedValue({ id: 'build-1', generatedCode: 'PYTHON_CODE' });
    jest.spyOn(releaseFacadeContextService as any, 'insertAuditEvent').mockResolvedValue(undefined);
    jest.spyOn(releaseFacadeContextService as any, 'getValidationOrThrow').mockResolvedValue({
      id: 'validation-1',
      success: false,
      score: 40,
    });
    jest
      .spyOn((service as any).capabilityReleaseBuildValidationService, 'createValidationRecord')
      .mockResolvedValue('validation-1');
    const finishSpy = jest
      .spyOn((service as any).capabilityReleaseBuildValidationService, 'finishValidation')
      .mockResolvedValue(undefined);
    (activityService as any).validateWorkflowRealStreaming = jest.fn().mockResolvedValue({
      success: true,
      score: 100,
      // 若用硬编码 $.result.businessData → 提取 undefined → 回退整个 result
      // → {result,error,traceback,fn} 对 {properties:{topic}} 不违规（additionalProperties 默认 true）
      // → Gate 2 放行；用契约 dataPath $.data → {topic:'ghost'} 违反 enum → 阻断。
      result: { data: { topic: 'ghost' } },
      error: null,
      traceback: null,
      logs: [],
    });

    const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
    await service.validateSandboxStream(
      'release-stream-gate2-datapath-1',
      { fn: 'main', input: {} },
      'user-1',
      undefined,
      (event, payload) => events.push({ event, payload })
    );

    expect(finishSpy).toHaveBeenCalledWith(
      'validation-1',
      'release-stream-gate2-datapath-1',
      'validation_failed',
      false,
      40,
      expect.arrayContaining([expect.stringContaining('[Gate 2 Output Schema Violation]')]),
      expect.objectContaining({
        result: expect.objectContaining({ data: expect.objectContaining({ topic: 'ghost' }) }),
      }),
      expect.stringContaining('OUTPUT_SCHEMA_VIOLATION')
    );
  });

  it('Gate 2 keeps legitimate falsy businessData (0) instead of falling back to the whole result (fix ⑤)', async () => {
    const { service, activityService, releaseFacadeContextService } = createService();

    jest.spyOn(releaseFacadeContextService as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-stream-gate2-falsy-1',
      sourceType: 'temporal_workflow',
      status: 'validating',
    });
    jest.spyOn(releaseFacadeContextService as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        workflowDsl: {},
        activityDsl: {},
        contracts: {
          output: {
            schema: { type: 'integer' },
          },
        },
      },
    });
    jest
      .spyOn(releaseFacadeContextService as any, 'resolveTemporalExecutableBuildOrThrow')
      .mockResolvedValue({ id: 'build-1', generatedCode: 'PYTHON_CODE' });
    jest.spyOn(releaseFacadeContextService as any, 'insertAuditEvent').mockResolvedValue(undefined);
    jest.spyOn(releaseFacadeContextService as any, 'getValidationOrThrow').mockResolvedValue({
      id: 'validation-2',
      success: false,
      score: 40,
    });
    jest
      .spyOn((service as any).capabilityReleaseBuildValidationService, 'createValidationRecord')
      .mockResolvedValue('validation-2');
    const finishSpy = jest
      .spyOn((service as any).capabilityReleaseBuildValidationService, 'finishValidation')
      .mockResolvedValue(undefined);
    (activityService as any).validateWorkflowRealStreaming = jest.fn().mockResolvedValue({
      success: true,
      score: 100,
      // 旧代码 `extracted || resultSnapshot`：0 触发整体回退 → 用 envelope(object)
      // 校验 {type: integer} 误报违规；falsy-safe 后直接校验业务值 0 → Gate 2 通过。
      result: { businessData: 0 },
      error: null,
      traceback: null,
      logs: [],
    });

    const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
    await service.validateSandboxStream(
      'release-stream-gate2-falsy-1',
      { fn: 'main', input: {} },
      'user-1',
      undefined,
      (event, payload) => events.push({ event, payload })
    );

    expect(finishSpy).toHaveBeenCalledWith(
      'validation-2',
      'release-stream-gate2-falsy-1',
      'draft_ready',
      true,
      100,
      expect.any(Array),
      expect.objectContaining({
        result: expect.objectContaining({ businessData: 0 }),
      }),
      null
    );
    expect(
      events.some((e) => e.event === 'log' && String(e.payload.message).includes('Gate 2'))
    ).toBe(false);
  });
});
