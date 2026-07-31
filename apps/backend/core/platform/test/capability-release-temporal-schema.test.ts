import axios from 'axios';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BridgeRecorderExportDTO } from '../../../registry-release/release-manager/src/interfaces';
import { CapabilityReleaseTemporalSchemaService } from '../../../registry-release/release-manager/src/compiler/capability-release-temporal-schema.service';

jest.mock('axios');

describe('CapabilityReleaseTemporalSchemaService', () => {
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

    const service = new CapabilityReleaseTemporalSchemaService();

    return { service, prisma, skillService, toolCatalogService, activityService };
  };
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

  it('preserves temporal input enums and uses the first candidate for smoke input fallback', () => {
    const { service } = createService();

    const schema = (service as any).buildTemporalParamsSchema({
      inputParams: {
        topic: {
          type: 'string',
          description: '搜索类别',
          required: false,
          defaultValue: 'general',
          enum: ['general', ' news ', 'finance', 'general'],
          exampleValue: 'news',
        },
      },
    });

    expect(schema).toEqual({
      properties: {
        topic: expect.objectContaining({
          type: 'string',
          required: false,
          default: 'general',
          enum: ['general', 'news', 'finance'],
        }),
      },
      required: [],
    });

    expect(
      (service as any).buildSuggestedInputFromSchema({
        properties: {
          topic: {
            type: 'string',
            default: 'other',
            enum: ['general', 'news', 'finance'],
          },
        },
      })
    ).toEqual({ topic: 'general' });
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
      expect.not.objectContaining({ default: expect.anything() })
    );
    expect(schema.properties.paymentStages).toEqual(
      expect.not.objectContaining({ default: expect.anything() })
    );
    expect(schema.properties.timeout).toEqual(expect.objectContaining({ default: 30 }));
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
      })
    );
    expect(schema.properties['paymentSchedule[].amount']).toEqual(
      expect.not.objectContaining({
        confirmationThreshold: expect.anything(),
      })
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
});
