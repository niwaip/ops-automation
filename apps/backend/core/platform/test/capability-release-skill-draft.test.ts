import axios from 'axios';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CapabilityReleaseSkillDraftService } from '../src/modules/capability-release/capability-release-skill-draft.service';
import { CapabilityReleaseTemporalSchemaService } from '../src/modules/capability-release/capability-release-temporal-schema.service';
import { BridgeRecorderExportDTO } from '../src/modules/capability-release/interfaces';

jest.mock('axios');

describe('CapabilityReleaseSkillDraftService', () => {
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

  const createService = () => {
    const prisma = {
      $executeRawUnsafe: jest.fn(),
      $queryRawUnsafe: jest.fn(),
    };
    const activityService = {
      executeCodeInTemporalSandbox: jest.fn(),
      executeCodeStreaming: jest.fn(),
    };
    const skillService = {
      validateSkillToolsPayload: jest.fn(),
      createSkill: jest.fn(),
      getSkillToolBindings: jest.fn(),
    };
    const toolCatalogService = {
      getCatalogItemsByNames: jest.fn(),
    };

    const temporalSchemaService = new CapabilityReleaseTemporalSchemaService();
    const service = new CapabilityReleaseSkillDraftService(prisma as any, temporalSchemaService);

    return { service, prisma, skillService, toolCatalogService, activityService };
  };
  it('preserves document runtime mapping metadata when building execution flow skill drafts', () => {
    const { service } = createService();

    const payload = (service as any).buildSkillDraftPayload(
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
    const { service } = createService();

    const payload = (service as any).buildSkillDraftPayload(
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

  it('derives temporal workflow runtime mapping metadata from workflowDsl when draft payload lacks runtime metadata', () => {
    const { service } = createService();

    const payload = (service as any).buildSkillDraftPayload(
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
    const { service } = createService();

    const schema = (service as any).resolveEffectiveTemporalParamsSchema({
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
        'contract.partyA': expect.objectContaining({
          required: false,
        }),
        'contract.signingDate': expect.objectContaining({
          required: true,
        }),
      })
    );
  });

  it('falls back to concise description labels when declared displayName is still machine-like', () => {
    const { service } = createService();

    const schema = (service as any).buildTemporalParamsSchema({
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
    const { service, prisma } = createService();

    prisma.$executeRawUnsafe.mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'getReleaseOrThrow')
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
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
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
    jest.spyOn(service as any, 'getLatestSuccessfulValidationOrThrow').mockResolvedValue({
      id: 'validation-1',
      buildId: 'build-1',
      resultSnapshot: null,
    });
    jest.spyOn(service as any, 'getSkillDraftOrThrow').mockResolvedValue({
      id: 'draft-generated-1',
      paramsSchema: {
        required: ['contract.signingDate'],
      },
      draftPayload: {},
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);

    const result = await service.generateSkillDraft('release-temporal-1', {}, 'user-1');

    const insertedParamsSchema = JSON.parse(prisma.$executeRawUnsafe.mock.calls[0][9]);
    expect(insertedParamsSchema.required).toEqual(['contract.signingDate']);
    expect(insertedParamsSchema.properties).toEqual(
      expect.objectContaining({
        'contract.partyA': expect.objectContaining({
          required: false,
        }),
        'contract.signingDate': expect.objectContaining({
          required: true,
        }),
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
});
