import axios from 'axios';
import { TemporalWorkflowActivityResolutionService } from '../src/modules/temporal-workflow/temporal-workflow-activity-resolution.service';
import { TemporalWorkflowBrowserDraftService } from '../src/modules/temporal-workflow/temporal-workflow-browser-draft.service';
import { TemporalWorkflowCodegenService } from '../src/modules/temporal-workflow/temporal-workflow-codegen.service';
import { TemporalWorkflowConfigService } from '../src/modules/temporal-workflow/temporal-workflow-config.service';
import { buildDeterministicWorkflowCodeForWorkflow } from '../src/modules/temporal-workflow/temporal-workflow-deterministic-builder';
import { TemporalWorkflowAiDraftService } from '../src/modules/temporal-workflow/temporal-workflow-draft.service';
import {
  buildGenericAiDraftSampleValue,
  inferWorkflowInputParamType,
  normalizeAiDraftStepInput,
  normalizeDraftInputParams,
} from '../src/modules/temporal-workflow/temporal-workflow-draft.normalizers';
import { repairCommonDraftPlanIssues } from '../src/modules/temporal-workflow/temporal-workflow-draft-plan.helpers';
import { TemporalWorkflowNormalizationService } from '../src/modules/temporal-workflow/temporal-workflow-normalization.service';
import { pickFirstNonEmptyString } from '../src/modules/temporal-workflow/temporal-workflow-service.utils';
import { TemporalWorkflowSessionService } from '../src/modules/temporal-workflow/temporal-workflow-session.service';
import { TemporalWorkflowSupportService } from '../src/modules/temporal-workflow/temporal-workflow-support.service';
import { TemporalWorkflowService } from '../src/modules/temporal-workflow/temporal-workflow.service';
import {
  buildTemplateWorkflowParamSeeds,
  normalizeWorkflowInputParamType,
  normalizeWorkflowInputRenderPath,
} from '../src/modules/temporal-workflow/temporal-workflow-template.helpers';
import { TemporalWorkflowTemplateService } from '../src/modules/temporal-workflow/temporal-workflow-template.service';
import { TemporalWorkflowValidationService } from '../src/modules/temporal-workflow/temporal-workflow-validation.service';
import { BuiltinActivityRegistry } from '../src/modules/temporal-workflow/builtin-activity.registry';

jest.mock('axios');

describe('TemporalWorkflowService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  const createService = () => {
    const prisma = {
      temporalWorkflow: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      chatSession: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      activity: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
      skillConfig: {
        findUnique: jest.fn(),
      },
    };

    const builtinRegistry = new BuiltinActivityRegistry();
    const workflowNormalizationService = new TemporalWorkflowNormalizationService(
      prisma as any,
      builtinRegistry,
    );
    const aiDraftService = new TemporalWorkflowAiDraftService(prisma as any, builtinRegistry);
    const browserDraftService = new TemporalWorkflowBrowserDraftService();
    const codegenService = new TemporalWorkflowCodegenService();
    const sessionService = new TemporalWorkflowSessionService(
      prisma as any,
      workflowNormalizationService,
    );
    const validationService = new TemporalWorkflowValidationService();
    const activityResolutionService = new TemporalWorkflowActivityResolutionService(
      prisma as any,
      builtinRegistry,
    );
    const workflowConfigService = new TemporalWorkflowConfigService();
    const workflowTemplateService = new TemporalWorkflowTemplateService();
    const workflowSupportService = new TemporalWorkflowSupportService(
      builtinRegistry,
      aiDraftService,
      activityResolutionService,
      workflowConfigService,
      workflowNormalizationService,
    );
    const service = new TemporalWorkflowService(
      prisma as any,
      aiDraftService,
      browserDraftService,
      codegenService,
      sessionService,
      validationService,
      workflowConfigService,
      workflowNormalizationService,
      workflowTemplateService,
      workflowSupportService,
    );

    return {
      service,
      prisma,
      builtinRegistry,
      aiDraftService,
      browserDraftService,
      codegenService,
      sessionService,
      validationService,
      activityResolutionService,
      workflowConfigService,
      workflowNormalizationService,
      workflowTemplateService,
      workflowSupportService,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes legacy builtin activityName into builtin activityRef on create', async () => {
    const { service, prisma } = createService();

    prisma.temporalWorkflow.create.mockImplementation(async ({ data }) => ({
      id: 'workflow-1',
      name: data.name,
      description: data.description,
      taskQueue: data.taskQueue,
      workflowDsl: data.workflowDsl,
      activityDsl: data.activityDsl,
      generatedCode: data.generatedCode,
      isActive: data.isActive,
      deployedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await service.create({
      name: '模板工作流',
      taskQueue: 'SKILL_TASK_QUEUE',
      workflowDsl: {
        name: '模板工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        steps: [
          {
            id: 'step_1',
            name: '渲染文档',
            type: 'activity',
            activityName: 'documentRender',
          },
        ],
      },
      activityDsl: {
        activities: [],
      },
    });

    expect(prisma.temporalWorkflow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowDsl: expect.objectContaining({
            steps: [
              expect.objectContaining({
                activityRef: 'builtin:documentRender',
                activityName: 'documentRender',
              }),
            ],
          }),
        }),
      }),
    );
  });

  it('normalizes legacy custom activityName into custom activityRef on create', async () => {
    const { service, prisma } = createService();

    prisma.activity.findUnique.mockResolvedValue({
      id: 'activity-custom-1',
      name: '天气查询',
      fn: 'weatherLookup',
      timeout: '60s',
      retryPolicy: null,
      handler: 'api',
      config: {},
      generatedCode: 'print("ok")',
    });

    prisma.temporalWorkflow.create.mockImplementation(async ({ data }) => ({
      id: 'workflow-2',
      name: data.name,
      description: data.description,
      taskQueue: data.taskQueue,
      workflowDsl: data.workflowDsl,
      activityDsl: data.activityDsl,
      generatedCode: data.generatedCode,
      isActive: data.isActive,
      deployedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await service.create({
      name: '自定义工作流',
      taskQueue: 'SKILL_TASK_QUEUE',
      workflowDsl: {
        name: '自定义工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        steps: [
          {
            id: 'step_1',
            name: '调用天气查询',
            type: 'activity',
            activityName: '天气查询',
          },
        ],
      },
      activityDsl: {
        activities: [
          {
            name: '天气查询',
            fn: 'weatherLookup',
            timeout: '60s',
            handler: 'api',
            config: {},
          },
        ],
      },
    });

    expect(prisma.temporalWorkflow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowDsl: expect.objectContaining({
            steps: [
              expect.objectContaining({
                activityRef: 'custom:activity-custom-1',
                activityName: '天气查询',
              }),
            ],
          }),
        }),
      }),
    );
  });

  it('normalizes legacy builtin httpRequest activityName into builtin activityRef on create', async () => {
    const { service, prisma } = createService();

    prisma.temporalWorkflow.create.mockImplementation(async ({ data }) => ({
      id: 'workflow-3',
      name: data.name,
      description: data.description,
      taskQueue: data.taskQueue,
      workflowDsl: data.workflowDsl,
      activityDsl: data.activityDsl,
      generatedCode: data.generatedCode,
      isActive: data.isActive,
      deployedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await service.create({
      name: 'HTTP 工作流',
      taskQueue: 'SKILL_TASK_QUEUE',
      workflowDsl: {
        name: 'HTTP 工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        steps: [
          {
            id: 'step_1',
            name: '请求接口',
            type: 'activity',
            activityName: 'httpRequest',
          },
        ],
      },
      activityDsl: {
        activities: [],
      },
    });

    expect(prisma.temporalWorkflow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowDsl: expect.objectContaining({
            steps: [
              expect.objectContaining({
                activityRef: 'builtin:httpRequest',
                activityName: 'httpRequest',
              }),
            ],
          }),
        }),
      }),
    );
  });

  it('materializes workflow inputPolicy from inputParams and normalizes explicit overrides on create', async () => {
    const { service, prisma } = createService();

    prisma.temporalWorkflow.create.mockImplementation(async ({ data }) => ({
      id: 'workflow-policy-1',
      name: data.name,
      description: data.description,
      taskQueue: data.taskQueue,
      workflowDsl: data.workflowDsl,
      activityDsl: data.activityDsl,
      generatedCode: data.generatedCode,
      isActive: data.isActive,
      deployedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await service.create({
      name: '策略工作流',
      taskQueue: 'SKILL_TASK_QUEUE',
      workflowDsl: {
        name: '策略工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: {
          username: {
            type: 'string',
            required: true,
            defaultValue: 'demo-user',
            description: '登录用户名',
          },
          region: {
            type: 'string',
            required: false,
            description: '区域',
          },
        },
        inputPolicy: {
          params: {
            username: {
              requiredMode: 'conditional',
              templateBinding: 'account.username',
              valueSourcePriority: [' user_input ', '', 'external'],
              confirmationThreshold: 2,
            },
          },
        },
        steps: [
          {
            id: 'step_1',
            name: '渲染文档',
            type: 'activity',
            activityName: 'documentRender',
          },
        ],
      },
      activityDsl: {
        activities: [],
      },
    });

    expect(prisma.temporalWorkflow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowDsl: expect.objectContaining({
            inputPolicy: {
              params: {
                username: {
                  enabled: true,
                  requiredMode: 'conditional',
                  defaultValue: 'demo-user',
                  templateBinding: 'account.username',
                  valueSourcePriority: ['user_input', 'external'],
                  confirmationThreshold: 1,
                },
                region: {
                  enabled: true,
                  requiredMode: 'optional',
                },
              },
            },
          }),
        }),
      }),
    );
  });

  it('keeps inputPolicy aligned with latest inputParams required and localized defaults on update', async () => {
    const { service, prisma } = createService();

    prisma.temporalWorkflow.findUnique.mockResolvedValue({
      id: 'workflow-policy-2',
      name: '策略工作流',
      description: null,
      taskQueue: 'SKILL_TASK_QUEUE',
      workflowDsl: {
        name: '策略工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: {
          'contract.partyA': {
            type: 'string',
            required: true,
            defaultValue: '',
            renderPath: ['contract.partyA_cn', 'contract.partyA_jp'],
          },
        },
        inputPolicy: {
          params: {
            'contract.partyA': {
              enabled: true,
              requiredMode: 'always',
            },
          },
        },
        steps: [],
      },
      activityDsl: { activities: [] },
      generatedCode: null,
      isActive: true,
      deployedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.temporalWorkflow.update.mockImplementation(async ({ data }) => ({
      id: 'workflow-policy-2',
      name: data.name ?? '策略工作流',
      description: data.description ?? null,
      taskQueue: data.taskQueue ?? 'SKILL_TASK_QUEUE',
      workflowDsl: data.workflowDsl,
      activityDsl: data.activityDsl ?? { activities: [] },
      generatedCode: data.generatedCode ?? null,
      isActive: data.isActive ?? true,
      deployedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await service.update('workflow-policy-2', {
      workflowDsl: {
        name: '策略工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: {
          'contract.partyA': {
            type: 'string',
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
              enabled: true,
              requiredMode: 'always',
            },
          },
        },
        steps: [],
      },
    });

    expect(prisma.temporalWorkflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowDsl: expect.objectContaining({
            inputPolicy: {
              params: {
                'contract.partyA': {
                  enabled: true,
                  requiredMode: 'optional',
                  defaultValue: {
                    cn: '阿',
                    jp: 'ashi',
                  },
                },
              },
            },
          }),
        }),
      }),
    );
  });

  it('rejects workflow inputPolicy keys that are not declared in the source skill schema', async () => {
    const { service, prisma } = createService();

    prisma.skillConfig.findUnique.mockResolvedValue({
      paramsSchema: {
        properties: {
          username: { type: 'string', description: '登录用户名' },
        },
      },
    });

    await expect(service.create({
      name: '非法策略工作流',
      taskQueue: 'SKILL_TASK_QUEUE',
      workflowDsl: {
        name: '非法策略工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        sourceContext: {
          sourceTemplate: {
            skillId: 'skill-1',
          },
        },
        inputParams: {
          username: {
            type: 'string',
            required: true,
          },
        },
        inputPolicy: {
          params: {
            password: {
              requiredMode: 'always',
            },
          },
        },
        steps: [
          {
            id: 'step_1',
            name: '渲染文档',
            type: 'activity',
            activityName: 'documentRender',
          },
        ],
      },
      activityDsl: {
        activities: [],
      },
    })).rejects.toThrow('workflowDsl.inputPolicy.params 包含未注册参数: password');
  });

  it('rejects illegal strategy fields inside workflow inputPolicy param entries', async () => {
    const { service } = createService();

    await expect(service.create({
      name: '非法策略字段工作流',
      taskQueue: 'SKILL_TASK_QUEUE',
      workflowDsl: {
        name: '非法策略字段工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: {
          username: {
            type: 'string',
            required: true,
          },
        },
        inputPolicy: {
          params: {
            username: {
              required: true,
            } as any,
          },
        },
        steps: [
          {
            id: 'step_1',
            name: '渲染文档',
            type: 'activity',
            activityName: 'documentRender',
          },
        ],
      },
      activityDsl: {
        activities: [],
      },
    })).rejects.toThrow('workflowDsl.inputPolicy.params.username 包含非法字段: required');
  });

  it('rejects workflow inputPolicy defaultValue that does not match the declared param type', async () => {
    const { service } = createService();

    await expect(service.create({
      name: '非法默认值工作流',
      taskQueue: 'SKILL_TASK_QUEUE',
      workflowDsl: {
        name: '非法默认值工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: {
          retryCount: {
            type: 'number',
            required: false,
          },
        },
        inputPolicy: {
          params: {
            retryCount: {
              defaultValue: '3',
            },
          },
        },
        steps: [
          {
            id: 'step_1',
            name: '渲染文档',
            type: 'activity',
            activityName: 'documentRender',
          },
        ],
      },
      activityDsl: {
        activities: [],
      },
    })).rejects.toThrow('workflowDsl.inputPolicy.params.retryCount.defaultValue 与参数类型 number 不兼容');
  });

  it('accepts localized workflow inputPolicy defaultValue when each localized value matches the declared type', async () => {
    const { service, prisma } = createService();

    prisma.temporalWorkflow.findUnique.mockResolvedValue({
      id: 'workflow-policy-localized',
      name: '多语言默认值工作流',
      description: null,
      taskQueue: 'SKILL_TASK_QUEUE',
      workflowDsl: {
        name: '多语言默认值工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: {
          'contract.partyA': {
            type: 'string',
            required: false,
            defaultValue: '',
            renderPath: ['contract.partyA_cn', 'contract.partyA_jp'],
          },
        },
        inputPolicy: {
          params: {
            'contract.partyA': {
              enabled: true,
              requiredMode: 'optional',
            },
          },
        },
        steps: [],
      },
      activityDsl: { activities: [] },
      generatedCode: null,
      isActive: true,
      deployedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.temporalWorkflow.update.mockImplementation(async ({ data }) => ({
      id: 'workflow-policy-localized',
      name: data.name ?? '多语言默认值工作流',
      description: data.description ?? null,
      taskQueue: data.taskQueue ?? 'SKILL_TASK_QUEUE',
      workflowDsl: data.workflowDsl,
      activityDsl: data.activityDsl ?? { activities: [] },
      generatedCode: data.generatedCode ?? null,
      isActive: data.isActive ?? true,
      deployedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await expect(service.update('workflow-policy-localized', {
      workflowDsl: {
        name: '多语言默认值工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: {
          'contract.partyA': {
            type: 'string',
            required: false,
            defaultValue: '',
            renderPath: ['contract.partyA_cn', 'contract.partyA_jp'],
          },
        },
        inputPolicy: {
          params: {
            'contract.partyA': {
              enabled: true,
              requiredMode: 'optional',
              defaultValue: {
                cn: '阿',
                jp: 'ashi',
              },
            },
          },
        },
        steps: [],
      },
    })).resolves.toEqual(expect.objectContaining({
      id: 'workflow-policy-localized',
    }));

    expect(prisma.temporalWorkflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowDsl: expect.objectContaining({
            inputPolicy: {
              params: {
                'contract.partyA': expect.objectContaining({
                  defaultValue: {
                    cn: '阿',
                    jp: 'ashi',
                  },
                }),
              },
            },
          }),
        }),
      }),
    );
  });

  it('generates required-param validation with the workflow class name for single custom activities', () => {
    const { workflowSupportService } = createService();

    const workflowDsl = {
      name: '登录并进入登录',
      workflowClassName: 'LoginWorkflow',
      workflowDefnName: '登录并进入登录',
      taskQueue: 'SKILL_TASK_QUEUE',
      inputParams: {
        username: { required: true },
        password: { required: true },
      },
      steps: [
        {
          id: 'step_1',
          name: '执行登录 Activity',
          type: 'activity' as const,
          activityName: 'LoginActivity',
          startToCloseTimeout: '60s',
        },
      ],
    };

    const activityDsl = {
      activities: [
        {
          name: 'LoginActivity',
          fn: 'run_login_activity',
          timeout: '60s',
          handler: 'script' as const,
          config: {},
          generatedCode: 'async def run_login_activity(activity_input: dict) -> dict:\n    return activity_input',
        },
      ],
    };

    const code = workflowSupportService.buildDeterministicWorkflowCode(workflowDsl, activityDsl);

    expect(code).toContain(
      'missing_params = [key for key in required_params if LoginWorkflow._is_missing(activity_input.get(key))]',
    );
    expect(code).not.toContain('cls._is_missing(activity_input.get(key))');
  });

  it('registers dedicated builtin aiStructuredTransform activity', () => {
    const { builtinRegistry } = createService();

    const activity = builtinRegistry.getByKey('aiStructuredTransform');

    expect(activity).toEqual(expect.objectContaining({
      key: 'aiStructuredTransform',
      ref: 'builtin:aiStructuredTransform',
      fn: 'aiStructuredTransform',
    }));
  });

  it('passes timeout through to workflow validation worker', async () => {
    const { service } = createService();

    mockedAxios.post.mockResolvedValue({
      data: {
        success: true,
        result: {
          success: true,
          output: { ok: true },
        },
      },
    } as any);

    const result = await service.validateWorkflowReal(
      'print("ok")',
      'BrowserTemplateWorkflow',
      { startUrl: 'http://127.0.0.1:5173/' },
      'SKILL_TASK_QUEUE',
      '300s',
    );

    expect(result.success).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/validate-workflow'),
      expect.objectContaining({
        code: 'print("ok")',
        fn_name: 'BrowserTemplateWorkflow',
        input_data: {
          startUrl: 'http://127.0.0.1:5173/',
          runtimeSessionId: expect.stringMatching(/^workflow-validate-/),
          workflowId: expect.stringMatching(/^workflow-validate-/),
        },
        task_queue: 'SKILL_TASK_QUEUE',
        timeout: '300s',
      }),
      expect.objectContaining({
        timeout: expect.any(Number),
      }),
    );
  });

  it('repairs legacy artifact metadata when listing workflows', async () => {
    const { service, prisma } = createService();
    const updatedAt = new Date('2026-06-03T05:13:46.886Z');
    const legacyWorkflow = {
      id: 'workflow-legacy-1',
      name: '中日双语技术服务合同生成工作流',
      description: 'legacy workflow row',
      taskQueue: 'SKILL_TASK_QUEUE',
      workflowDsl: {
        name: '中日双语技术服务合同生成工作流',
        workflowClassName: 'Template1febbc18Workflow',
        taskQueue: 'SKILL_TASK_QUEUE',
        steps: [],
      },
      activityDsl: { activities: [] },
      generatedCode: 'print("legacy artifact")',
      artifactVersion: 0,
      artifactHash: null,
      validationStatus: null,
      validationScore: 0,
      validationResultJson: {
        success: true,
        score: 98,
      },
      validatedAt: null,
      isActive: true,
      deployedAt: null,
      createdAt: updatedAt,
      updatedAt,
    } as any;
    const repairedWorkflow = {
      ...legacyWorkflow,
      artifactVersion: 1,
      artifactHash: 'sha256:dbc8a18fe702cc1bd6edde3f1a11a1f332a572a0cfe22d753a3475dd5456ca5d',
      validationStatus: 'validated',
      validationScore: 98,
      validatedAt: updatedAt,
    };

    prisma.temporalWorkflow.findMany.mockResolvedValue([legacyWorkflow]);
    prisma.temporalWorkflow.update.mockResolvedValue(repairedWorkflow);

    const result = await service.findAll();

    expect(prisma.temporalWorkflow.update).toHaveBeenCalledWith({
      where: { id: 'workflow-legacy-1' },
      data: expect.objectContaining({
        artifactVersion: 1,
        artifactHash: expect.stringMatching(/^sha256:/),
        validationStatus: 'validated',
        validationScore: 98,
        validatedAt: updatedAt,
      }),
    });
    expect(result[0]).toEqual(expect.objectContaining({
      id: 'workflow-legacy-1',
      artifactVersion: 1,
      artifactHash: repairedWorkflow.artifactHash,
      validationStatus: 'validated',
      validationScore: 98,
      validatedAt: updatedAt,
    }));
  });
});
