import 'reflect-metadata';
import axios from 'axios';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  BridgeRecorderExportDTO,
} from '../../registry-release/release-manager/src/interfaces';
import { CapabilityReleaseAssistService } from '../../registry-release/release-manager/src/capability-release-assist.service';
import { CapabilityReleaseSkillDraftService } from '../../registry-release/release-manager/src/capability-release-skill-draft.service';
import {
  BrowserRecordingFlowNormalizerService,
} from '../../registry-release/release-manager/src/compiler/browser-recording-flow-normalizer.service';
import {
  BrowserRecordingRuntimeLoopPlannerService,
} from '../../registry-release/release-manager/src/compiler/browser-recording-runtime-loop-planner.service';
import {
  BrowserRecordingRuntimePlannerService,
} from '../../registry-release/release-manager/src/compiler/browser-recording-runtime-planner.service';
import {
  BrowserRecordingRuntimeStepBuilderService,
} from '../../registry-release/release-manager/src/compiler/browser-recording-runtime-step-builder.service';
import { CapabilityReleaseBrowserRecordingService } from '../../registry-release/release-manager/src/compiler/capability-release-browser-recording.service';
import {
  CapabilityReleaseBuildValidationService,
} from '../../registry-release/release-manager/src/compiler/capability-release-build-validation.service';
import {
  CapabilityReleaseRecorderBridgeCompilerService,
} from '../../registry-release/release-manager/src/compiler/capability-release-recorder-bridge-compiler.service';
import { CapabilityReleaseTemporalSchemaService } from '../../registry-release/release-manager/src/compiler/capability-release-temporal-schema.service';
import { BrowserRecordingActionPolicyService } from '../../registry-release/release-manager/src/validator/browser-recording-action-policy.service';
import {
  CapabilityReleasePublishValidatorService,
} from '../../registry-release/release-manager/src/validator/capability-release-publish-validator.service';
import { SchemaCompatibilityService } from '../../registry-release/release-manager/src/validator/schema-compatibility.service';
import { ContractLintService } from '../../registry-release/release-manager/src/validator/contract-lint.service';
import { CapabilityAttestationService } from '../../registry-release/release-manager/src/attestation/capability-attestation.service';
import { CapabilityFixtureService } from '../../registry-release/release-manager/src/fixture/capability-fixture.service';
import {
  CapabilityReleaseBrowserRuntimeExecutorService,
} from '../../registry-release/release-manager/src/publisher/capability-release-browser-runtime-executor.service';
import {
  CapabilityReleaseBrowserRuntimeLoopExecutorService,
} from '../../registry-release/release-manager/src/publisher/capability-release-browser-runtime-loop-executor.service';
import {
  CapabilityReleaseBrowserRuntimeResultService,
} from '../../registry-release/release-manager/src/publisher/capability-release-browser-runtime-result.service';
import {
  CapabilityReleaseBrowserRuntimeService,
} from '../../registry-release/release-manager/src/publisher/capability-release-browser-runtime.service';
import {
  CapabilityReleaseBrowserRuntimeStepExecutorService,
} from '../../registry-release/release-manager/src/publisher/capability-release-browser-runtime-step-executor.service';
import {
  CapabilityReleaseBrowserRuntimeSupportService,
} from '../../registry-release/release-manager/src/publisher/capability-release-browser-runtime-support.service';
import { BrowserPostStateReconcilerService } from '../../registry-release/release-manager/src/publisher/browser-runtime-result/browser-post-state-reconciler.service';
import { BrowserRuntimeStepResultStateService } from '../../registry-release/release-manager/src/publisher/browser-runtime-result/browser-runtime-step-result-state.service';
import { BrowserRunOutputMaterializerService } from '../../registry-release/release-manager/src/publisher/browser-runtime-result/browser-run-output-materializer.service';
import { BrowserLegacyOutputAdapter } from '../../registry-release/release-manager/src/publisher/browser-runtime-result/browser-legacy-output.adapter';
import {
  CapabilityReleaseDeploymentSmokeService,
} from '../../registry-release/release-manager/src/publisher/capability-release-deployment-smoke.service';
import {
  CapabilityReleaseDeploymentService,
} from '../../registry-release/release-manager/src/publisher/capability-release-deployment.service';
import {
  CapabilityReleaseDocumentRuntimeService,
} from '../../registry-release/release-manager/src/publisher/capability-release-document-runtime.service';
import {
  CapabilityReleasePublishService,
} from '../../registry-release/release-manager/src/publisher/capability-release-publish.service';
import {
  CapabilityReleasePublishWriterService,
} from '../../registry-release/release-manager/src/publisher/capability-release-publish-writer.service';
import {
  CapabilityReleaseRuntimeService,
} from '../../registry-release/release-manager/src/publisher/capability-release-runtime.service';
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

  it('archives the release and deactivates its published skill', async () => {
    const { service, prisma, releaseFacadeContextService } = createService();

    jest.spyOn((releaseFacadeContextService as any), 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-1',
      publishedSkillId: 'skill-1',
    });
    jest
      .spyOn((releaseFacadeContextService as any), 'insertAuditEvent')
      .mockResolvedValue(undefined);

    const result = await service.archiveCapability('release-1', 'user-1');

    expect(result).toEqual({ success: true, archivedId: 'release-1' });
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE capability_releases'),
      'release-1'
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE skill_configs'),
      'skill-1'
    );
    expect((releaseFacadeContextService as any).insertAuditEvent).toHaveBeenCalledWith(
      'release-1',
      'published_skill_deactivated',
      'user-1',
      true,
      '归档 Release 时停用已发布 Skill: skill-1',
      { publishedSkillId: 'skill-1' }
    );
    expect((releaseFacadeContextService as any).insertAuditEvent).toHaveBeenCalledWith(
      'release-1',
      'release_archived',
      'user-1',
      true,
      '归档 Capability',
      undefined
    );
  });

  it('delegates capability draft creation to release draft service', async () => {
    const { service, releaseDraftService, releaseFacadeContextService } = createService();
    const draftResult = {
      release: {
        id: 'release-create-1',
      },
      builds: [],
      validations: [],
    };

    jest
      .spyOn(releaseDraftService, 'createCapability')
      .mockResolvedValue(draftResult as any);

    const result = await service.createCapability(
      {
        sourceType: 'execution_flow_template',
        sourceId: 'template-1',
      },
      'user-1'
    );

    expect(releaseDraftService.createCapability).toHaveBeenCalledWith(
      {
        sourceType: 'execution_flow_template',
        sourceId: 'template-1',
      },
      'user-1',
      expect.objectContaining({
        getReleaseOrThrow: expect.any(Function),
        insertAuditEvent: expect.any(Function),
      })
    );
    expect(result).toBe(draftResult);
  });

  it('delegates current skill draft lookup to release query service', async () => {
    const { service, releaseQueryService, releaseFacadeContextService } = createService();
    const currentDraft = {
      id: 'draft-current-1',
      name: 'current draft',
    };

    jest.spyOn(releaseQueryService, 'getCurrentSkillDraft').mockResolvedValue(currentDraft as any);

    const result = await service.getCurrentSkillDraft('release-current-1');

    expect(releaseQueryService.getCurrentSkillDraft).toHaveBeenCalledWith(
      'release-current-1',
      expect.objectContaining({
        getReleaseOrThrow: expect.any(Function),
        getSkillDraftOrThrow: expect.any(Function),
      })
    );
    expect(result).toBe(currentDraft);
  });

  it('requires a real temporal build instead of reusing snapshot generated code', async () => {
    const { prisma, releaseFacadeContextService, temporalWorkflowService } = createService();

    prisma.$queryRawUnsafe.mockResolvedValueOnce([]);
    jest.spyOn(temporalWorkflowService, 'getArtifact').mockRejectedValue(
      new Error('当前 Release 缺少真实构建产物，请先执行一次构建 / 代码生成')
    );

    await expect(
      (releaseFacadeContextService as any).resolveTemporalExecutableBuildOrThrow(
        {
          id: 'release-1',
          currentBuildId: null,
          sourceId: 'workflow-1',
        },
        {
          id: 'snapshot-1',
          sourcePayload: {
            generatedCode: 'LEGACY_CODE',
          },
        },
        undefined,
        'user-1'
      )
    ).rejects.toThrow('当前 Release 缺少真实构建产物，请先执行一次构建 / 代码生成');

    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('prefers declared temporal input param types over description heuristics', () => {
    const { service, releaseFacadeContextService } = createService();

    const schema = (service as any).capabilityReleaseTemporalSchemaService.buildTemporalParamsSchema({
      inputParams: {
        'info.currency': {
          type: 'string',
          description: '合同金额币种，如 CNY、USD 等，用于统一财务数据展示格式',
          required: true,
          defaultValue: '',
          exampleValue: 'CNY',
        },
        installationCondition: {
          type: 'string',
          description: '设备安装条件和乙方配合义务，为顺利安装和验收提供操作指引',
          required: true,
          defaultValue: '',
          exampleValue: '甲方提供场地，乙方负责安装联调',
        },
        'info.warrantyPeriod': {
          type: 'number',
          description: '质保期月数，决定质保金退还时间节点计算',
          required: true,
          defaultValue: '',
          exampleValue: 24,
        },
        'info.includeInstall': {
          type: 'string',
          description: '是否包含安装服务，取值是/否，决定合同正文是否展示安装责任划分内容',
          required: true,
          defaultValue: '',
          exampleValue: '是',
        },
      },
    });

    expect(schema).toEqual({
      properties: expect.objectContaining({
        'info.currency': expect.objectContaining({ type: 'string', displayName: '合同金额币种' }),
        installationCondition: expect.objectContaining({
          type: 'string',
          displayName: '设备安装条件和乙方配合义务',
        }),
        'info.warrantyPeriod': expect.objectContaining({
          type: 'number',
          displayName: '质保期月数',
        }),
        'info.includeInstall': expect.objectContaining({
          type: 'string',
          displayName: '是否包含安装服务',
        }),
      }),
      required: expect.arrayContaining([
        'info.currency',
        'installationCondition',
        'info.warrantyPeriod',
        'info.includeInstall',
      ]),
    });
  });

  it('normalizes camelCase url smoke inputs into valid urls', () => {
    const { service, releaseFacadeContextService } = createService();

    const normalized = (service as any).capabilityReleaseTemporalSchemaService.buildSuggestedInputFromSchema({
      properties: {
        startUrl: {
          type: 'string',
        },
      },
    });

    expect(normalized).toEqual({
      startUrl: 'https://www.bing.com',
    });
  });

  it('prefers temporal workflow input defaults when building deploy smoke input', () => {
    const { service, releaseFacadeContextService } = createService();

    const smokeInput = (service as any).capabilityReleaseTemporalSchemaService.buildSmokeTestInput(
      {
        sourceType: 'temporal_workflow',
      },
      {
        sourcePayload: {
          workflowDsl: {
            inputParams: {
              startUrl: {
                type: 'string',
                required: true,
                defaultValue: 'http://192.168.100.143:5173/',
              },
              username: {
                type: 'string',
                required: true,
                defaultValue: 'test',
              },
            },
          },
          paramsSchema: {
            required: ['startUrl', 'username'],
            properties: {
              startUrl: {
                type: 'string',
                required: true,
                description: '起始页面地址',
              },
              username: {
                type: 'string',
                required: true,
                description: '登录用户名',
              },
            },
          },
        },
      },
      'staging'
    );

    expect(smokeInput).toEqual(
      expect.objectContaining({
        startUrl: 'http://192.168.100.143:5173/',
        username: 'test',
        smokeTest: true,
        environment: 'staging',
      })
    );
  });

  it('prefers fixed source-level test input when building deploy smoke input', () => {
    const { service, releaseFacadeContextService } = createService();

    const smokeInput = (service as any).capabilityReleaseTemporalSchemaService.buildSmokeTestInput(
      {
        sourceType: 'execution_flow_template',
      },
      {
        sourcePayload: {
          paramsSchema: {
            required: ['contractNo', 'partyA'],
            properties: {
              contractNo: { type: 'string', required: true, description: '合同编号' },
              partyA: { type: 'string', required: true, description: '甲方名称' },
            },
          },
          testInput: {
            contractNo: 'TSC-2026-0528-001',
            partyA: '上海链合智能科技有限公司',
          },
        },
      },
      'staging'
    );

    expect(smokeInput).toEqual({
      contractNo: 'TSC-2026-0528-001',
      partyA: '上海链合智能科技有限公司',
      smokeTest: true,
      environment: 'staging',
    });
  });

  it('prefers environment-specific fixed test input over global test input', () => {
    const { service, releaseFacadeContextService } = createService();

    const smokeInput = (service as any).capabilityReleaseTemporalSchemaService.buildSmokeTestInput(
      {
        sourceType: 'execution_flow_template',
      },
      {
        sourcePayload: {
          paramsSchema: {
            required: ['contractNo'],
            properties: {
              contractNo: { type: 'string', required: true, description: '合同编号' },
            },
          },
          testInput: {
            contractNo: 'GLOBAL-001',
          },
          deploymentProfiles: {
            staging: {
              testInput: {
                contractNo: 'STAGING-001',
                verificationMode: 'smoke',
              },
            },
          },
        },
      },
      'staging'
    );

    expect(smokeInput).toEqual({
      contractNo: 'STAGING-001',
      verificationMode: 'smoke',
      smokeTest: true,
      environment: 'staging',
    });
  });

  it('omits empty placeholder defaults from published temporal params schema', () => {
    const { service, releaseFacadeContextService } = createService();

    const schema = (service as any).capabilityReleaseTemporalSchemaService.buildTemporalParamsSchema({
      inputParams: {
        notes: {
          type: 'string',
          description: '补充说明',
          required: false,
          defaultValue: '',
        },
        paymentStages: {
          type: 'array',
          description: '付款阶段列表',
          required: false,
          defaultValue: [],
        },
        timeout: {
          type: 'number',
          description: '超时时间',
          required: false,
          defaultValue: 30,
        },
      },
    });

    expect(schema.properties.notes).toEqual(
      expect.not.objectContaining({ default: expect.anything() })
    );
    expect(schema.properties.paymentStages).toEqual(
      expect.not.objectContaining({ default: expect.anything() })
    );
    expect(schema.properties.timeout).toEqual(expect.objectContaining({ default: 30 }));
  });

  it('keeps L1 presentation metadata in published temporal params schema without leaking policy fields', () => {
    const { service, releaseFacadeContextService } = createService();

    const schema = (service as any).capabilityReleaseTemporalSchemaService.buildTemporalParamsSchema({
      inputParams: {
        'paymentSchedule[].amount': {
          type: 'number',
          description: '各付款阶段的应付金额',
          required: true,
          displayName: '付款金额',
          groupLabel: '付款计划',
          previewBlocking: false,
          semanticRole: 'payment_amount',
          extractionHints: ['付款节点金额', '每期应付金额'],
          confirmationThreshold: 0.82,
        },
      },
    });

    expect(schema).toEqual({
      properties: expect.objectContaining({
        'paymentSchedule[].amount': expect.objectContaining({
          type: 'number',
          displayName: '付款金额',
          groupLabel: '付款计划',
          semanticRole: 'payment_amount',
          extractionHints: ['付款节点金额', '每期应付金额'],
        }),
      }),
      required: ['paymentSchedule[].amount'],
    });
    expect(schema.properties['paymentSchedule[].amount']).toEqual(
      expect.not.objectContaining({
        previewBlocking: expect.anything(),
      })
    );
    expect(schema.properties['paymentSchedule[].amount']).toEqual(
      expect.not.objectContaining({
        confirmationThreshold: expect.anything(),
      })
    );
  });

  it('preserves temporal renderPath metadata and falls back to inputPolicy templateBinding', () => {
    const { service, releaseFacadeContextService } = createService();

    const schema = (service as any).capabilityReleaseTemporalSchemaService.buildTemporalParamsSchema({
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
    });

    expect(schema).toEqual({
      properties: expect.objectContaining({
        'contract.partyA': expect.objectContaining({
          renderPath: ['contract.partyA_cn', 'contract.partyA_jp'],
        }),
        'payment.bankAccount': expect.objectContaining({
          renderPath: 'payment.bankAccount_cn',
        }),
      }),
      required: ['contract.partyA', 'payment.bankAccount'],
    });
  });

  it('derives temporal optional defaults from localizedDefaultValue when plain defaultValue is empty', () => {
    const { service, releaseFacadeContextService } = createService();

    const schema = (service as any).capabilityReleaseTemporalSchemaService.buildTemporalParamsSchema({
      inputParams: {
        'contract.partyA': {
          type: 'string',
          description: '甲方名称',
          required: false,
          defaultValue: '',
          localizedDefaultValue: {
            cn: '阿',
            jp: 'ashi',
          },
          renderPath: ['contract.partyA_cn', 'contract.partyA_jp'],
        },
      },
      inputPolicy: {
        params: {
          'contract.partyA': {
            requiredMode: 'optional',
          },
        },
      },
    });

    expect(schema).toEqual({
      properties: {
        'contract.partyA': expect.objectContaining({
          type: 'string',
          renderPath: ['contract.partyA_cn', 'contract.partyA_jp'],
          default: {
            cn: '阿',
            jp: 'ashi',
          },
        }),
      },
      required: [],
    });
  });

  it('prefers workflow inputPolicy defaultValue when building temporal release params schema', () => {
    const { service, releaseFacadeContextService } = createService();

    const schema = (service as any).capabilityReleaseTemporalSchemaService.buildTemporalParamsSchema({
      inputParams: {
        'contract.projectName': {
          type: 'string',
          description: '项目名称',
          required: false,
        },
        'contract.signingDate': {
          type: 'date',
          description: '签署日期',
          required: true,
        },
      },
      inputPolicy: {
        params: {
          'contract.projectName': {
            requiredMode: 'optional',
            defaultValue: {
              cn: '默认项目',
              jp: 'デフォルト案件',
            },
          },
          'contract.signingDate': {
            requiredMode: 'optional',
            defaultValue: {
              cn: '2026-05-30',
              jp: '2026-05-30',
            },
          },
        },
      },
    });

    expect(schema).toEqual({
      properties: {
        'contract.projectName': expect.objectContaining({
          default: {
            cn: '默认项目',
            jp: 'デフォルト案件',
          },
        }),
        'contract.signingDate': expect.objectContaining({
          default: {
            cn: '2026-05-30',
            jp: '2026-05-30',
          },
        }),
      },
      required: [],
    });
  });

  it('does not infer bankAccount as number when deriving temporal release params schema', () => {
    const { service, releaseFacadeContextService } = createService();

    const schema = (service as any).capabilityReleaseTemporalSchemaService.buildTemporalParamsSchema({
      inputParams: {
        'payment.bankAccount': {
          description: '乙方指定的银行账户信息，包括开户行和账号',
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
    });

    expect(schema).toEqual({
      properties: {
        'payment.bankAccount': expect.objectContaining({
          type: 'string',
          renderPath: 'payment.bankAccount_cn',
        }),
      },
      required: ['payment.bankAccount'],
    });
  });

  it('lets workflow inputPolicy requiredMode override temporal inputParams required flags', () => {
    const { service, releaseFacadeContextService } = createService();

    const schema = (service as any).capabilityReleaseTemporalSchemaService.buildTemporalParamsSchema({
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
    });

    expect(schema).toEqual({
      properties: {
        'contract.partyA': expect.objectContaining({
          type: 'string',
        }),
        'contract.signingDate': expect.objectContaining({ type: 'string' }),
      },
      required: ['contract.signingDate'],
    });
  });

  it('preserves document runtime mapping metadata when building execution flow skill drafts', () => {
    const { service, releaseFacadeContextService } = createService();

    const payload = (service as any).capabilityReleaseSkillDraftService.buildSkillDraftPayload(
      {
        sourceType: 'execution_flow_template',
        sourceId: 'tpl-tech-service',
        releaseVersion: 3,
      },
      {
        sourcePayload: {
          name: '技术服务合同流程',
          description: '生成技术服务合同',
          goal: '生成合同',
          expectedResult: '输出可下载的合同文档',
          paramsSchema: {
            properties: {
              'contract.partyA': {
                type: 'string',
                description: '甲方名称',
              },
            },
            required: ['contract.partyA'],
          },
          executionFlowKeys: ['技术服务合同'],
          apiEndpoints: {
            runtimeMetadata: {
              mappingHints: [{ parameter: 'contract.partyA', path: '{d.contract.partyA_cn}' }],
              workflowInputPolicy: {
                params: {
                  'contract.partyA': {
                    requiredMode: 'always',
                    templateBinding: 'contract.partyA_cn',
                  },
                },
              },
              skillGuideMarkdown: 'guide',
              dataExampleJson: {
                contract: {
                  partyA_cn: '上海链合智能科技有限公司',
                },
              },
            },
          },
        },
      },
      {
        id: 'validation-1',
      }
    );

    expect(payload.apiEndpoints.runtimeMetadata).toEqual(
      expect.objectContaining({
        sourceType: 'execution_flow_template',
        mappingHints: [{ parameter: 'contract.partyA', path: '{d.contract.partyA_cn}' }],
        workflowInputPolicy: {
          params: {
            'contract.partyA': {
              requiredMode: 'always',
              templateBinding: 'contract.partyA_cn',
            },
          },
        },
        skillGuideMarkdown: 'guide',
        dataExampleJson: {
          contract: {
            partyA_cn: '上海链合智能科技有限公司',
          },
        },
      })
    );
  });

  it('preserves document runtime mapping metadata when building temporal workflow skill drafts', () => {
    const { service, releaseFacadeContextService } = createService();

    const payload = (service as any).capabilityReleaseSkillDraftService.buildSkillDraftPayload(
      {
        sourceType: 'temporal_workflow',
        sourceId: 'wf-tech-service',
        releaseVersion: 5,
      },
      {
        sourcePayload: {
          name: 'TechnicalServiceContractRenderingWorkflow',
          description: '生成技术服务合同工作流',
          goal: '生成合同',
          workflowDsl: {},
          activityDsl: {},
          paramsSchema: {
            properties: {
              'contract.partyA': {
                type: 'string',
                description: '甲方名称',
              },
            },
            required: ['contract.partyA'],
          },
          workflowSteps: [{ id: 'step-1', name: 'render' }],
          apiEndpoints: {
            runtimeMetadata: {
              mappingHints: [{ parameter: 'contract.partyA', path: '{d.contract.partyA_cn}' }],
              workflowInputPolicy: {
                params: {
                  'contract.partyA': {
                    requiredMode: 'always',
                    templateBinding: 'contract.partyA_cn',
                  },
                },
              },
            },
          },
        },
      },
      {
        id: 'validation-2',
      }
    );

    expect(payload.apiEndpoints.runtimeMetadata).toEqual(
      expect.objectContaining({
        sourceType: 'temporal_workflow',
        mappingHints: [{ parameter: 'contract.partyA', path: '{d.contract.partyA_cn}' }],
        workflowInputPolicy: {
          params: {
            'contract.partyA': {
              requiredMode: 'always',
              templateBinding: 'contract.partyA_cn',
            },
          },
        },
      })
    );
    expect(payload.executionFlowTemplateIds).toEqual(['wf-tech-service']);
  });

});
