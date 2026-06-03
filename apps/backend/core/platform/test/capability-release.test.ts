import axios from 'axios';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CapabilityReleaseService } from '../src/modules/capability-release/capability-release.service';
import { BridgeRecorderExportDTO } from '../src/modules/capability-release/interfaces';

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

    const service = new CapabilityReleaseService(
      prisma as any,
      {} as any,
      activityService as any,
      {} as any,
      skillService as any,
      toolCatalogService as any,
      {
        generateSkillDraft: jest.fn(),
      } as any, // capabilityReleaseSkillDraftService
      {
        publishSkill: jest.fn(),
        bridgeRecorderExport: jest.fn(),
      } as any, // capabilityReleasePublishService
      {
        deploy: jest.fn(),
      } as any, // capabilityReleaseDeploymentService
      {} as any, // activityService
    );

    return { service, prisma, skillService, toolCatalogService, activityService };
  };

  it('archives the release and deactivates its published skill', async () => {
    const { service, prisma } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-1',
      publishedSkillId: 'skill-1',
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);

    const result = await service.archiveCapability('release-1', 'user-1');

    expect(result).toEqual({ success: true, archivedId: 'release-1' });
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE capability_releases'),
      'release-1',
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE skill_configs'),
      'skill-1',
    );
    expect((service as any).insertAuditEvent).toHaveBeenCalledWith(
      'release-1',
      'published_skill_deactivated',
      'user-1',
      true,
      '归档 Release 时停用已发布 Skill: skill-1',
      { publishedSkillId: 'skill-1' },
    );
    expect((service as any).insertAuditEvent).toHaveBeenCalledWith(
      'release-1',
      'release_archived',
      'user-1',
      true,
      '归档 Capability',
    );
  });

  it('prefers declared temporal input param types over description heuristics', () => {
    const { service } = createService();

    const schema = (service as any).buildTemporalParamsSchema({
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
        installationCondition: expect.objectContaining({ type: 'string', displayName: '设备安装条件和乙方配合义务' }),
        'info.warrantyPeriod': expect.objectContaining({ type: 'number', displayName: '质保期月数' }),
        'info.includeInstall': expect.objectContaining({ type: 'string', displayName: '是否包含安装服务' }),
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
    const { service } = createService();

    const normalized = (service as any).buildSuggestedInputFromSchema({
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
    const { service } = createService();

    const smokeInput = (service as any).buildSmokeTestInput(
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
      'staging',
    );

    expect(smokeInput).toEqual(expect.objectContaining({
      startUrl: 'http://192.168.100.143:5173/',
      username: 'test',
      smokeTest: true,
      environment: 'staging',
    }));
  });

  it('prefers fixed source-level test input when building deploy smoke input', () => {
    const { service } = createService();

    const smokeInput = (service as any).buildSmokeTestInput(
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
      'staging',
    );

    expect(smokeInput).toEqual({
      contractNo: 'TSC-2026-0528-001',
      partyA: '上海链合智能科技有限公司',
      smokeTest: true,
      environment: 'staging',
    });
  });

  it('prefers environment-specific fixed test input over global test input', () => {
    const { service } = createService();

    const smokeInput = (service as any).buildSmokeTestInput(
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
      'staging',
    );

    expect(smokeInput).toEqual({
      contractNo: 'STAGING-001',
      verificationMode: 'smoke',
      smokeTest: true,
      environment: 'staging',
    });
  });

  it('omits empty placeholder defaults from published temporal params schema', () => {
    const { service } = createService();

    const schema = (service as any).buildTemporalParamsSchema({
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
      expect.not.objectContaining({ default: expect.anything() }),
    );
    expect(schema.properties.paymentStages).toEqual(
      expect.not.objectContaining({ default: expect.anything() }),
    );
    expect(schema.properties.timeout).toEqual(
      expect.objectContaining({ default: 30 }),
    );
  });

  it('keeps L1 presentation metadata in published temporal params schema without leaking policy fields', () => {
    const { service } = createService();

    const schema = (service as any).buildTemporalParamsSchema({
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
      }),
    );
    expect(schema.properties['paymentSchedule[].amount']).toEqual(
      expect.not.objectContaining({
        confirmationThreshold: expect.anything(),
      }),
    );
  });

  it('preserves temporal renderPath metadata and falls back to inputPolicy templateBinding', () => {
    const { service } = createService();

    const schema = (service as any).buildTemporalParamsSchema({
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
    const { service } = createService();

    const schema = (service as any).buildTemporalParamsSchema({
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
    const { service } = createService();

    const schema = (service as any).buildTemporalParamsSchema({
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
          required: false,
          default: {
            cn: '默认项目',
            jp: 'デフォルト案件',
          },
        }),
        'contract.signingDate': expect.objectContaining({
          required: false,
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
    const { service } = createService();

    const schema = (service as any).buildTemporalParamsSchema({
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
          required: true,
          renderPath: 'payment.bankAccount_cn',
        }),
      },
      required: ['payment.bankAccount'],
    });
  });

  it('lets workflow inputPolicy requiredMode override temporal inputParams required flags', () => {
    const { service } = createService();

    const schema = (service as any).buildTemporalParamsSchema({
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
          required: false,
        }),
        'contract.signingDate': expect.objectContaining({
          required: true,
        }),
      },
      required: ['contract.signingDate'],
    });
  });

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
              mappingHints: [
                { parameter: 'contract.partyA', path: '{d.contract.partyA_cn}' },
              ],
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
      },
    );

    expect(payload.apiEndpoints.runtimeMetadata).toEqual(
      expect.objectContaining({
        sourceType: 'execution_flow_template',
        mappingHints: [
          { parameter: 'contract.partyA', path: '{d.contract.partyA_cn}' },
        ],
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
      }),
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
              mappingHints: [
                { parameter: 'contract.partyA', path: '{d.contract.partyA_cn}' },
              ],
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
      },
    );

    expect(payload.apiEndpoints.runtimeMetadata).toEqual(
      expect.objectContaining({
        sourceType: 'temporal_workflow',
        mappingHints: [
          { parameter: 'contract.partyA', path: '{d.contract.partyA_cn}' },
        ],
        workflowInputPolicy: {
          params: {
            'contract.partyA': {
              requiredMode: 'always',
              templateBinding: 'contract.partyA_cn',
            },
          },
        },
      }),
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
      },
    );

    expect(payload.paramsSchema).toEqual(expect.objectContaining({
      properties: expect.objectContaining({
        'contract.partyA': expect.objectContaining({
          renderPath: ['contract.partyA_cn', 'contract.partyA_jp'],
        }),
        'payment.bankAccount': expect.objectContaining({
          renderPath: 'payment.bankAccount_cn',
        }),
      }),
    }));
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
      }),
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
    expect(schema.properties).toEqual(expect.objectContaining({
      'contract.partyA': expect.objectContaining({
        required: false,
      }),
      'contract.signingDate': expect.objectContaining({
        required: true,
      }),
    }));
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
    jest.spyOn(service as any, 'getReleaseOrThrow')
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
    expect(insertedParamsSchema.properties).toEqual(expect.objectContaining({
      'contract.partyA': expect.objectContaining({
        required: false,
      }),
      'contract.signingDate': expect.objectContaining({
        required: true,
      }),
    }));
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
    const { service, skillService } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-1',
      approvalStatus: 'approved',
      status: 'approved',
      currentSkillDraftId: 'draft-1',
      publishedSkillId: null,
    });
    jest.spyOn(service as any, 'getSkillDraftOrThrow').mockResolvedValue({
      id: 'draft-1',
      tools: ['api_call'],
      executionFlowTemplateIds: ['tpl-1'],
      draftPayload: {
        name: 'Test Draft',
        description: 'desc',
        tools: ['api_call'],
        executionFlowTemplateIds: ['tpl-1'],
      },
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
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
    expect((service as any).insertAuditEvent).toHaveBeenCalledWith(
      'release-1',
      'skill_publish_blocked_by_tool_validation',
      'user-1',
      false,
      '发布前工具校验失败',
      expect.objectContaining({
        toolValidation: expect.objectContaining({
          isValid: false,
        }),
      }),
    );
  });

  it('blocks publishing template workflows when document mappings are still empty', async () => {
    const { service, skillService } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-template-1',
      approvalStatus: 'approved',
      status: 'approved',
      sourceType: 'temporal_workflow',
      currentSkillDraftId: 'draft-template-1',
      publishedSkillId: null,
    });
    jest.spyOn(service as any, 'getSkillDraftOrThrow').mockResolvedValue({
      id: 'draft-template-1',
      tools: [],
      executionFlowTemplateIds: [],
      draftPayload: {
        name: '技术服务合同渲染技能',
        description: 'desc',
        tools: [],
      },
    });
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
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
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
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
    expect((service as any).insertAuditEvent).toHaveBeenCalledWith(
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
      }),
    );
  });

  it('normalizes legacy browser_execute tool names when publishing browser recording skills', async () => {
    const { service, skillService, prisma } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-browser-1',
      approvalStatus: 'approved',
      status: 'approved',
      sourceType: 'browser_recording',
      sourceName: 'Browser Skill',
      currentSkillDraftId: 'draft-browser-1',
      publishedSkillId: null,
    });
    jest.spyOn(service as any, 'getSkillDraftOrThrow').mockResolvedValue({
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
      },
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
    prisma.$queryRawUnsafe.mockResolvedValue([]);
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
      }),
    );
    expect(result).toEqual({
      release: expect.objectContaining({ id: 'release-browser-1' }),
      publishedSkillId: 'skill-browser-1',
    });
  });

  it('rejects publishing when release approval is pending', async () => {
    const { service } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
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
    const { service } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
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
    const { service } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow')
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
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {},
    });
    jest.spyOn(service as any, 'resolveBuildForValidation').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'finishDeployment').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'getDeploymentOrThrow').mockResolvedValue({
      id: 'deployment-1',
      releaseId: 'release-no-skill',
      status: 'succeeded',
      success: true,
    });

    const result = await service.deploy('release-no-skill', {}, 'user-1');

    expect((service as any).finishDeployment).toHaveBeenCalledWith(
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
      null,
      null,
    );
    expect(result).toEqual({
      release: expect.objectContaining({ id: 'release-no-skill', status: 'deployed' }),
      deployment: expect.objectContaining({ id: 'deployment-1', success: true }),
    });
  });

  it('rejects deploy when release is already deploying', async () => {
    const { service } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
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
    const { service } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow')
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
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        steps: [{ id: 'step_1', name: '打开页面' }],
        executionFlow: [{ id: 'flow-1', tool: { name: 'browser_step' } }],
      },
    });
    jest.spyOn(service as any, 'resolveBuildForValidation').mockResolvedValue({
      id: 'build-1',
    });
    jest.spyOn(service as any, 'shouldPreserveReleaseStatusDuringValidation').mockReturnValue(false);
    jest.spyOn(service as any, 'createValidationRecord').mockResolvedValue('validation-1');
    jest.spyOn(service as any, 'finishValidation').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'getValidationOrThrow').mockResolvedValue({
      id: 'validation-1',
      success: true,
      score: 100,
    });

    const result = await service.validateSandbox(
      'release-browser-validate-1',
      { testCases: ['通过 bing 查询mcp'] },
      'user-1',
    );

    expect((service as any).finishValidation).toHaveBeenCalledWith(
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
      false,
    );
    expect(result).toEqual({
      release: expect.objectContaining({ id: 'release-browser-validate-1' }),
      validation: expect.objectContaining({ id: 'validation-1' }),
    });
  });

  it('returns runtime tool policies from tool catalog metadata', async () => {
    const { service, prisma, skillService, toolCatalogService } = createService();

    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'release-row-1' }])
      .mockResolvedValueOnce([{ id: 'deployment-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-1',
      sourceType: 'execution_flow_template',
      lastDeploymentId: null,
    });
    jest.spyOn(service as any, 'mapDeployment').mockReturnValue({
      id: 'deployment-1',
      runtimeType: 'flow_runtime',
      environment: 'dev',
    });
    skillService.getSkillToolBindings.mockResolvedValue({
      validation: {
        effectiveTools: ['api_call', 'user_ask'],
      },
    });
    toolCatalogService.getCatalogItemsByNames.mockResolvedValue(
      new Map([
        ['api_call', {
          promptExposure: 'prompt_and_runtime',
          defaultRequiresConfirmation: false,
          defaultRequiresApproval: true,
          status: 'active',
        }],
        ['user_ask', {
          promptExposure: 'runtime_only',
          defaultRequiresConfirmation: false,
          defaultRequiresApproval: false,
          status: 'active',
        }],
      ]),
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
    const { service } = createService();

    const sourceTemplate = (service as any).extractExecutionFlowSourceTemplate({
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
            endpoint: '/api/carbone/render',
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

  it('executes published document skill via template render when templateId is available', async () => {
    const { service, prisma } = createService();

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'release-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-1',
      sourceType: 'execution_flow_template',
    });
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        category: 'document',
        sourceTemplate: {
          templateId: 'tpl-001',
          format: 'docx',
        },
      },
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
    mockedAxios.post.mockResolvedValue({
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
      },
    );

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://localhost:3009/studio/render',
      {
        templateId: 'tpl-001',
        data: {
          customerName: 'Alice',
        },
        outputFormat: 'docx',
      },
      {
        timeout: 120000,
      },
    );
    expect(result.runtime).toBe('document');
    expect(result.success).toBe(true);
    expect(result.downloadUrl).toBe('http://localhost:3009/studio/download/doc-1');
    expect(result.output).toEqual(
      expect.objectContaining({
        templateId: 'tpl-001',
        fileName: 'contract.docx',
        downloadUrl: 'http://localhost:3009/studio/download/doc-1',
      }),
    );
  });

  it('executes published document skill via render-with-skill fallback when templateId is unavailable', async () => {
    const { service, prisma } = createService();

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'release-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-1',
      sourceType: 'execution_flow_template',
    });
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        category: 'document',
        steps: [
          {
            type: 'api',
            api: {
              endpoint: '/api/carbone/render',
            },
          },
        ],
      },
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
    mockedAxios.post.mockResolvedValue({
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
      'user-1',
    );

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://localhost:3009/studio/render-with-skill',
      {
        skillId: 'skill-2',
        params: {
          customerName: 'Bob',
        },
        outputFormat: 'pdf',
      },
      {
        timeout: 120000,
      },
    );
    expect(result.runtime).toBe('document');
    expect(result.success).toBe(true);
    expect(result.downloadUrl).toBe('http://localhost:3009/studio/download/doc-2');
  });

  it('executes document skill and wraps non-object response from carbone engine', async () => {
    const { service, prisma } = createService();

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'release-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-1',
      sourceType: 'execution_flow_template',
    });
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        sourceTemplate: JSON.stringify({ templateId: 'tpl-1' }),
      },
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
    
    // Carbone engine returns a plain string for some reason (hypothetical)
    mockedAxios.post.mockResolvedValue({
      data: 'SUCCESS_STRING',
    } as any);

    const result = await service.executePublishedSkill(
      'skill-doc-string',
      {},
      'user-1',
    );

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ result: 'SUCCESS_STRING', templateId: 'tpl-1' });
  });

  it('executes temporal workflow and wraps string result into object', async () => {
    const { service, prisma, activityService } = createService();

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'release-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-1',
      sourceType: 'temporal_workflow',
    });
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        workflowDsl: {
          workflowClassName: 'WeatherWorkflow',
        },
      },
    });
    jest.spyOn(service as any, 'resolveTemporalExecutableBuildOrThrow').mockResolvedValue({
      id: 'build-1',
      generatedCode: 'PYTHON_CODE',
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
    
    jest.spyOn(activityService, 'executeCodeStreaming').mockImplementation(async (_code, _fn, _taskQueue, _input, onLog) => {
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
      'user-1',
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
      }),
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
    const { service, prisma, activityService } = createService();

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'release-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-1',
      sourceType: 'temporal_workflow',
    });
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        workflowDsl: {
          workflowClassName: 'RenderWorkflow',
        },
      },
    });
    jest.spyOn(service as any, 'resolveTemporalExecutableBuildOrThrow').mockResolvedValue({
      id: 'build-1',
      generatedCode: 'PYTHON_CODE',
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);

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
      'user-1',
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
    const { service, prisma, activityService } = createService();

    process.env.INTERNAL_API_SHARED_SECRET = 'internal-secret';
    mockedAxios.post.mockResolvedValue({ data: { ok: true } } as any);

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'release-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-1',
      sourceType: 'temporal_workflow',
    });
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        workflowDsl: {
          workflowClassName: 'LoginWorkflow',
        },
      },
    });
    jest.spyOn(service as any, 'resolveTemporalExecutableBuildOrThrow').mockResolvedValue({
      id: 'build-1',
      generatedCode: 'PYTHON_CODE',
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);

    jest.spyOn(activityService, 'executeCodeStreaming').mockImplementation(async (_code, _fn, _taskQueue, _input, onLog) => {
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
      },
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
      }),
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
      expect.any(Object),
    );
    expect(result.success).toBe(true);
  });

  it('executes published browser recording skill via browser worker with shared runtime session', async () => {
    const { service, prisma } = createService();

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'release-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-browser-runtime-1',
      sourceType: 'browser_recording',
    });
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
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
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { success: true, message: 'initialized' } } as any)
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
      },
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3004/browser/init',
      expect.objectContaining({
        backend: 'cli',
        runtimeSessionId: 'runtime-browser-1',
        initialUrl: 'https://www.bing.com',
      }),
      { timeout: 60000 },
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3004/browser/execute-step',
      expect.objectContaining({
        executionId: 'exec-browser-1',
        runtimeSessionId: 'runtime-browser-1',
        action: 'goto',
        target: 'https://www.bing.com',
        args: { url: 'https://www.bing.com' },
      }),
      { timeout: 120000 },
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3004/browser/execute-step',
      expect.objectContaining({
        executionId: 'exec-browser-1',
        runtimeSessionId: 'runtime-browser-1',
        action: 'smart_search',
        args: { query: 'mcp' },
      }),
      { timeout: 120000 },
    );
    expect(result).toEqual(
      expect.objectContaining({
        releaseId: 'release-browser-runtime-1',
        runtime: 'browser_recording',
        success: true,
      }),
    );
  });

  it('executes only the requested browser recording step without reinitializing an existing session', async () => {
    const { service, prisma } = createService();

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'release-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-browser-runtime-target-step',
      sourceType: 'browser_recording',
    });
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
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
              params: { target: '#submit' },
            },
          },
        ],
      },
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
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
      },
    );

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://localhost:3004/browser/execute-step',
      expect.objectContaining({
        executionId: 'exec-browser-target-step',
        runtimeSessionId: 'runtime-browser-target-step',
        stepId: 'step-system-target-step:step_3',
        action: 'click',
        target: '#submit',
      }),
      { timeout: 120000 },
    );
    expect(mockedAxios.post).not.toHaveBeenCalledWith(
      'http://localhost:3004/browser/init',
      expect.anything(),
      expect.anything(),
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
      }),
    );
  });

  it('normalizes waitForSelector browser recording steps into wait with selector args', async () => {
    const { service, prisma } = createService();

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'release-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-browser-runtime-wait-selector',
      sourceType: 'browser_recording',
    });
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
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
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { success: true, message: 'initialized' } } as any)
      .mockResolvedValueOnce({ data: { success: true, output: { status: 'selector-ready' } } } as any);

    const result = await service.executePublishedSkill(
      'skill-browser-runtime',
      {},
      'user-1',
      {
        executionId: 'exec-browser-wait-selector',
        stepId: 'step-system-wait-selector',
        runtimeSessionId: 'runtime-browser-wait-selector',
      },
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
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
      { timeout: 120000 },
    );
    expect(result).toEqual(
      expect.objectContaining({
        releaseId: 'release-browser-runtime-wait-selector',
        runtime: 'browser_recording',
        success: true,
      }),
    );
  });

  it('preserves browser recording runtime session when a failed step requires takeover', async () => {
    const { service, prisma } = createService();

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'release-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-browser-runtime-1',
      sourceType: 'browser_recording',
    });
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
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
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
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
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        releaseId: 'release-browser-runtime-1',
        runtime: 'browser_recording',
        success: false,
        error: 'click failed',
      }),
    );
    expect(mockedAxios.post).not.toHaveBeenCalledWith(
      'http://localhost:3004/browser/reset',
      expect.anything(),
      expect.anything(),
    );
  });

  it('bridges recorder export into release and skill draft', async () => {
    const { service, prisma } = createService();

    jest.spyOn(service as any, 'createCapability').mockResolvedValue({
      release: { id: 'release-bridge-1' },
    });
    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-bridge-1',
      sourceType: 'browser_recording',
    });
    jest.spyOn(service as any, 'getSkillDraftOrThrow').mockResolvedValue({
      id: 'draft-bridge-1',
      name: 'recorder-skill',
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);

    const result = await service.bridgeRecorderExport(
      {
        userGoal: '登录并查询报表',
        exportArtifacts: {
          guidance: 'g',
          commands: [{ tool: 'navigate', params: { url: 'https://example.com' } }],
          skillDraft: {
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
      'user-1',
    );

    expect((service as any).createCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'browser_recording',
        sourceName: 'recorder-skill',
      }),
      'user-1',
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
      'user-1',
    );
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
    const { service } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
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
      }),
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
    const { service } = createService();

    await expect(
      service.bridgeRecorderExport({
        userGoal: '登录并查询报表',
        exportArtifacts: {
          guidance: 'g',
          skillDraft: {
            name: 'recorder-skill',
          },
        },
      } as any),
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
    const { service } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({ id: 'release-1' });

    await expect(
      (service as any).getRollbackTargetOrThrow(
        { id: 'release-1', sourceId: 'src-1', sourceName: 's', sourceType: 'browser_recording' },
        'release-1',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'rollback_target_same_release',
        message: '不能回滚到当前 Release 自身',
      }),
    });
  });

  it('rejects rollback inference when current release has no source identifiers', async () => {
    const { service } = createService();

    await expect(
      (service as any).getRollbackTargetOrThrow(
        { id: 'release-1', sourceId: null, sourceName: null, sourceType: 'browser_recording' },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'rollback_source_identifier_missing',
        message: '当前 Release 缺少可用于推断回滚目标的源标识',
      }),
    });
  });
});
