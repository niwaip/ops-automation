import axios from 'axios';
import { TemporalWorkflowActivityResolutionService } from '../src/modules/temporal-workflow/temporal-workflow-activity-resolution.service';
import { TemporalWorkflowBrowserDraftService } from '../src/modules/temporal-workflow/browser-bridge/temporal-workflow-browser-draft.service';
import { TemporalWorkflowCodegenService } from '../src/modules/temporal-workflow/temporal-workflow-codegen.service';
import { ActivityCodegenService } from '../src/modules/temporal-workflow/temporal-activity-codegen.service';
import { TemporalWorkflowService } from '../src/modules/temporal-workflow/temporal-workflow.service';
import { TemporalWorkflowArtifactService } from '../src/workflow-registry/workflow-template/temporal-workflow-artifact.service';
import { TemporalWorkflowConfigOrchestrationService } from '../src/workflow-registry/workflow-template/temporal-workflow-config-orchestration.service';
import { TemporalWorkflowConfigService } from '../src/workflow-registry/workflow-template/temporal-workflow-config.service';
import { TemporalWorkflowDraftOrchestrationService } from '../src/workflow-registry/workflow-template/temporal-workflow-draft-orchestration.service';
import { TemporalWorkflowManagementService } from '../src/workflow-registry/workflow-template/temporal-workflow-management.service';
import { TemporalWorkflowSessionOrchestrationService } from '../src/workflow-registry/workflow-template/temporal-workflow-session-orchestration.service';
import { TemporalWorkflowSessionSupportFactoryService } from '../src/workflow-registry/workflow-template/temporal-workflow-session-support-factory.service';
import { TemporalWorkflowTemplateService } from '../src/workflow-registry/workflow-template/temporal-workflow-template.service';
import { buildDeterministicWorkflowCodeForWorkflow } from '../src/modules/temporal-workflow/temporal-workflow-deterministic-builder';
import { TemporalWorkflowAiDraftService } from '../src/modules/temporal-workflow/temporal-workflow-draft.service';
import {
  buildGenericAiDraftSampleValue,
  deriveV2OutputFromOutputParams,
  inferWorkflowInputParamType,
  normalizeAiDraftStepInput,
  normalizeDraftInputParams,
} from '../src/modules/temporal-workflow/temporal-workflow-draft.normalizers';
import {
  repairCommonDraftPlanIssues,
  validateAiWorkflowDraftPlan,
} from '../src/modules/temporal-workflow/temporal-workflow-draft-plan.helpers';
import { TemporalWorkflowNormalizationService } from '../src/modules/temporal-workflow/temporal-workflow-normalization.service';
import { pickFirstNonEmptyString } from '../src/modules/temporal-workflow/temporal-workflow-json.utils';
import { TemporalWorkflowSessionService } from '../src/modules/temporal-workflow/temporal-workflow-session.service';
import { TemporalWorkflowSupportService } from '../src/modules/temporal-workflow/temporal-workflow-support.service';
import {
  buildTemplateWorkflowParamSeeds,
  normalizeWorkflowInputParamType,
  normalizeWorkflowInputRenderPath,
} from '../src/modules/temporal-workflow/temporal-workflow-template.helpers';
import { TemporalWorkflowValidationFacadeService } from '../src/modules/temporal-workflow/temporal-workflow-validation-facade.service';
import { TemporalWorkflowValidationService } from '../src/modules/temporal-workflow/temporal-workflow-validation.service';
import { TemporalWorkflowArtifactValidationService } from '../src/workflow-registry/validation/temporal-workflow-artifact-validation.service';
import { TemporalWorkflowValidationContractService } from '../src/workflow-registry/validation/temporal-workflow-validation-contract.service';
import { TemporalWorkflowDslValidationService } from '../src/workflow-registry/validation/temporal-workflow-dsl-validation.service';
import { TemporalWorkflowCodegenOrchestrationService } from '../src/workflow-registry/codegen/temporal-workflow-codegen-orchestration.service';
import {
  BuiltinActivityRegistry,
  HTTP_REQUEST_STEP_CONFIG_KEY,
  STRUCTURED_TRANSFORM_STEP_CONFIG_KEY,
} from '../src/modules/temporal-workflow/builtin-activity.registry';

jest.mock('axios');

describe('TemporalWorkflowAiDraftService', () => {
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
        findMany: jest.fn().mockResolvedValue([]),
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
      builtinRegistry
    );
    const aiDraftService = new TemporalWorkflowAiDraftService(prisma as any, builtinRegistry);
    const browserDraftService = new TemporalWorkflowBrowserDraftService();
    const codegenService = new TemporalWorkflowCodegenService();
    const sessionService = new TemporalWorkflowSessionService(
      prisma as any,
      workflowNormalizationService
    );
    const validationService = new TemporalWorkflowValidationService();
    const activityResolutionService = new TemporalWorkflowActivityResolutionService(
      prisma as any,
      builtinRegistry
    );
    const workflowConfigService = new TemporalWorkflowConfigService();
    const workflowTemplateService = new TemporalWorkflowTemplateService();
    const workflowArtifactService = new TemporalWorkflowArtifactService(prisma as any);
    const workflowConfigOrchestrationService = new TemporalWorkflowConfigOrchestrationService(
      workflowConfigService
    );
    const workflowManagementService = new TemporalWorkflowManagementService(
      prisma as any,
      workflowNormalizationService,
      workflowArtifactService
    );
    const activityCodegenService = new ActivityCodegenService();
    const workflowSupportService = new TemporalWorkflowSupportService(
      builtinRegistry,
      aiDraftService,
      activityResolutionService,
      workflowConfigService,
      workflowNormalizationService,
      activityCodegenService
    );
    const workflowDraftOrchestrationService = new TemporalWorkflowDraftOrchestrationService(
      aiDraftService,
      browserDraftService,
      workflowSupportService,
      workflowTemplateService
    );
    const workflowSessionSupportFactoryService = new TemporalWorkflowSessionSupportFactoryService(
      workflowSupportService
    );
    const workflowSessionOrchestrationService = new TemporalWorkflowSessionOrchestrationService(
      sessionService,
      workflowSessionSupportFactoryService
    );
    const validationFacade = new TemporalWorkflowValidationFacadeService(validationService);
    const workflowArtifactValidationService = new TemporalWorkflowArtifactValidationService(
      prisma as any,
      validationFacade,
      workflowArtifactService,
      new TemporalWorkflowValidationContractService()
    );
    const workflowDslValidationService = new TemporalWorkflowDslValidationService(
      workflowSupportService
    );
    const workflowCodegenOrchestrationService = new TemporalWorkflowCodegenOrchestrationService(
      prisma as any,
      codegenService,
      workflowArtifactService,
      workflowSupportService,
      workflowNormalizationService
    );
    const service = new TemporalWorkflowService(
      workflowCodegenOrchestrationService,
      workflowArtifactService,
      workflowConfigOrchestrationService,
      workflowDraftOrchestrationService,
      workflowManagementService,
      workflowSessionOrchestrationService,
      workflowArtifactValidationService,
      workflowDslValidationService
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
      workflowArtifactService,
      workflowSupportService,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects fixed structuredTransform json config that relies on nested outputSchema without fieldMappings', async () => {
    const { service } = createService();

    const result = await service.validate(
      {
        name: '无效固定规则转换',
        workflowClassName: 'InvalidFixedTransformWorkflow',
        workflowDefnName: '无效固定规则转换',
        taskQueue: 'SKILL_TASK_QUEUE',
        steps: [
          {
            id: 'step_transform',
            name: '重组嵌套 JSON',
            type: 'activity',
            activityRef: 'builtin:structuredTransform',
            activityName: 'structuredTransform',
            input: {
              __structuredTransform: {
                contentType: 'json',
                contentTemplate: '{content}',
                instructionTemplate: '请把输入重组为嵌套 JSON',
                outputMode: 'json',
                outputSchema: {
                  location: {
                    city: 'string',
                  },
                },
                contextTemplate: '',
                fieldMappings: {},
                textTemplate: '',
              },
            },
          },
        ],
      },
      {
        activities: [],
      }
    );

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      '重组嵌套 JSON 的固定规则 JSON 转换存在嵌套 outputSchema，但未提供 fieldMappings。请显式提供 fieldMappings，或改用 builtin:aiStructuredTransform。'
    );
  });

  it('forces AI generation when forceAiGeneration is enabled', async () => {
    const { service, codegenService } = createService();

    jest
      .spyOn(codegenService as any, 'runPythonAstGateCheck')
      .mockReturnValue({ success: true, errors: [] });
    mockedAxios.post.mockResolvedValue({
      data: {
        result: [
          '```python',
          'from temporalio import workflow',
          '',
          '@workflow.defn(name="AI天气工作流")',
          'class AiWeatherWorkflow:',
          '    @workflow.run',
          '    async def run(self, params: dict):',
          '        return {"mode": "ai"}',
          '```',
        ].join('\n'),
      },
    } as any);

    const result = await service.generateWorkflowCode(
      {
        name: '天气结构化工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        steps: [
          {
            id: 'step_http',
            name: '查询天气接口',
            type: 'activity',
            activityRef: 'builtin:httpRequest',
            activityName: 'httpRequest',
            input: {
              __httpRequest: {
                method: 'GET',
                urlTemplate: 'https://wttr.in/{city}',
              },
            },
          },
          {
            id: 'step_transform',
            name: '整理天气结果',
            type: 'activity',
            activityRef: 'builtin:structuredTransform',
            activityName: 'structuredTransform',
            input: {
              __structuredTransform: {
                contentType: 'json',
                instructionTemplate: '把天气结果整理为最终 JSON',
                outputMode: 'json',
              },
            },
          },
        ],
      },
      {
        activities: [],
      },
      undefined,
      true
    );

    expect(result.success).toBe(true);
    expect(result.generationMode).toBe('ai');
    expect(result.code).toContain('class AiWeatherWorkflow');
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('normalizes AI generated structuredTransform config to use placeholder contentTemplate', async () => {
    const { service } = createService();

    mockedAxios.post.mockResolvedValue({
      data: {
        result: JSON.stringify({
          contentType: 'json',
          contentTemplate: 'json',
          instructionTemplate: '提取天气信息',
          outputMode: 'json',
          outputSchema: {
            weatherText: 'string',
          },
        }),
      },
    } as any);

    const result = await service.generateStructuredTransformConfig(
      { weatherText: '晴', temperatureC: '20' },
      '请提取天气信息',
      {}
    );

    expect(result.success).toBe(true);
    expect(result.config?.contentTemplate).toBe('{content}');
    expect(result.config?.contentType).toBe('json');
  });

  it('prefers AI regeneration over deterministic generation when errorContext is provided', async () => {
    const { service, codegenService, workflowSupportService } = createService();

    jest
      .spyOn(workflowSupportService, 'buildDeterministicWorkflowCode')
      .mockReturnValue('DETERMINISTIC_CODE');
    jest
      .spyOn(codegenService as any, 'runPythonAstGateCheck')
      .mockReturnValue({ success: true, errors: [] });
    mockedAxios.post.mockResolvedValue({
      data: {
        result: [
          '```python',
          'from temporalio import workflow',
          '',
          '@workflow.defn(name="修复版工作流")',
          'class RepairedWorkflow:',
          '    async def run(self, params: dict):',
          '        return {"ok": True}',
          '```',
        ].join('\n'),
      },
    } as any);

    const result = await service.generateWorkflowCode(
      {
        name: '修复版工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        steps: [
          {
            id: 'step_1',
            name: '请求接口',
            type: 'activity',
            activityRef: 'builtin:httpRequest',
            activityName: 'httpRequest',
            input: {
              __httpRequest: {
                method: 'GET',
                urlTemplate: 'https://wttr.in/{city}',
              },
            },
          },
        ],
      },
      { activities: [] },
      'Compilation Error: invalid syntax (activity.py, line 1)'
    );

    expect(mockedAxios.post).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.code).not.toBe('DETERMINISTIC_CODE');
    expect(result.code).toContain('class RepairedWorkflow');
    expect(result.autoRetried).toBe(false);
    expect(result.attempts).toBe(1);
  });

  it('rejects AI-generated code that fails python precompile check', async () => {
    const { service, codegenService, workflowSupportService } = createService();

    jest.spyOn(workflowSupportService, 'buildDeterministicWorkflowCode').mockReturnValue(null);
    jest.spyOn(codegenService as any, 'runPythonAstGateCheck').mockReturnValue({
      success: false,
      errors: [
        {
          line: 1,
          code: 'SYNTAX_ERROR',
          message: 'SyntaxError: invalid syntax (generated_workflow.py, line 1)',
        },
      ],
    });
    mockedAxios.post.mockResolvedValue({
      data: {
        result: [
          '```python',
          'from temporalio import workflow',
          '',
          '@workflow.defn(name="损坏工作流")',
          'class BrokenWorkflow:',
          '    async def run(self, params: dict):',
          '        broken =',
          '        return {"ok": False}',
          '```',
        ].join('\n'),
      },
    } as any);

    const result = await service.generateWorkflowCode(
      {
        name: '损坏工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        steps: [
          {
            id: 'step_1',
            name: '提取结构',
            type: 'activity',
            activityRef: 'builtin:structuredTransform',
            activityName: 'structuredTransform',
            input: {
              __structuredTransform: {
                contentType: 'text',
                contentTemplate: '{content}',
                instructionTemplate: '提取信息',
                outputMode: 'json',
              },
            },
          },
        ],
      },
      { activities: [] },
      'Compilation Error: invalid syntax (activity.py, line 1)'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('未通过 Gate 1 静态分析');
    expect(result.error).toContain('SyntaxError: invalid syntax');
    expect(result.autoRetried).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('retries once with compile feedback when first AI code fails Gate 1', async () => {
    const { service, codegenService, workflowSupportService } = createService();

    jest.spyOn(workflowSupportService, 'buildDeterministicWorkflowCode').mockReturnValue(null);
    jest
      .spyOn(codegenService as any, 'runPythonAstGateCheck')
      .mockReturnValueOnce({
        success: false,
        errors: [
          {
            line: 1,
            code: 'SYNTAX_ERROR',
            message: 'SyntaxError: invalid syntax (generated_workflow.py, line 1)',
          },
        ],
      })
      .mockReturnValueOnce({
        success: true,
        errors: [],
      });
    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          result: [
            '```python',
            'from temporalio import workflow',
            '',
            '@workflow.defn(name="第一次损坏")',
            'class BrokenWorkflow:',
            '    async def run(self, params: dict):',
            '        broken =',
            '        return {"ok": False}',
            '```',
          ].join('\n'),
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          result: [
            '```python',
            'from temporalio import workflow',
            '',
            '@workflow.defn(name="第二次修复")',
            'class RecoveredWorkflow:',
            '    async def run(self, params: dict):',
            '        return {"ok": True}',
            '```',
          ].join('\n'),
        },
      } as any);

    const result = await service.generateWorkflowCode(
      {
        name: '自动重试工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        steps: [
          {
            id: 'step_1',
            name: '提取结构',
            type: 'activity',
            activityRef: 'builtin:structuredTransform',
            activityName: 'structuredTransform',
            input: {
              __structuredTransform: {
                contentType: 'text',
                contentTemplate: '{content}',
                instructionTemplate: '提取信息',
                outputMode: 'json',
              },
            },
          },
        ],
      },
      { activities: [] },
      'Compilation Error: invalid syntax (activity.py, line 1)'
    );

    expect(result.success).toBe(true);
    expect(result.code).toContain('class RecoveredWorkflow');
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(result.autoRetried).toBe(true);
    expect(result.attempts).toBe(2);
    const secondPromptPayload = mockedAxios.post.mock.calls[1]?.[1] as any;
    expect(String(secondPromptPayload?.prompt || '')).toContain('未通过 Gate 1 静态分析');
    expect(String(secondPromptPayload?.prompt || '')).toContain('SyntaxError: invalid syntax');
  });

  it('injects explicit RetryPolicy namespace guidance into AI workflow prompt', async () => {
    const { service, codegenService, workflowSupportService } = createService();

    jest.spyOn(workflowSupportService, 'buildDeterministicWorkflowCode').mockReturnValue(null);
    jest
      .spyOn(codegenService as any, 'runPythonAstGateCheck')
      .mockReturnValue({ success: true, errors: [] });
    mockedAxios.post.mockResolvedValue({
      data: {
        result: [
          '```python',
          'from temporalio import workflow',
          '',
          '@workflow.defn(name="天气查询工作流")',
          'class WeatherWorkflow:',
          '    async def run(self, params: dict):',
          '        return {"ok": True}',
          '```',
        ].join('\n'),
      },
    } as any);

    await service.generateWorkflowCode(
      {
        name: '天气查询工作流',
        workflowClassName: 'WeatherWorkflow',
        taskQueue: 'SKILL_TASK_QUEUE',
        steps: [
          {
            id: 'step_1',
            name: '查询天气',
            type: 'activity',
            activityRef: 'builtin:httpRequest',
            activityName: 'httpRequest',
            input: {
              __httpRequest: {
                method: 'GET',
                urlTemplate: 'https://wttr.in/{city}',
                queryTemplate: { format: 'j1' },
              },
            },
          },
        ],
      },
      { activities: [] },
      '执行错误: 需要重新生成'
    );

    const promptPayload = mockedAxios.post.mock.calls[0]?.[1] as any;
    expect(String(promptPayload?.prompt || '')).toContain(
      'from temporalio.common import RetryPolicy'
    );
    expect(String(promptPayload?.prompt || '')).toContain('严禁使用 `activity.RetryPolicy(...)`');
    expect(String(promptPayload?.prompt || '')).toContain(
      '不要写 `if workflow.unsafe.is_replaying()`'
    );
  });

  it('retries once when first AI code uses invalid activity.RetryPolicy namespace', async () => {
    const { service, codegenService, workflowSupportService } = createService();

    jest.spyOn(workflowSupportService, 'buildDeterministicWorkflowCode').mockReturnValue(null);
    jest
      .spyOn(codegenService as any, 'runPythonAstGateCheck')
      .mockReturnValueOnce({
        success: false,
        errors: [
          {
            line: 9,
            code: 'WORKFLOW_SDK_API',
            message: "Workflow 代码禁止使用 'activity.RetryPolicy'（外部副作用/非确定性操作必须封装在 @activity.defn Activity 中）。",
          },
        ],
      })
      .mockReturnValueOnce({
        success: true,
        errors: [],
      });
    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          result: [
            '```python',
            'from datetime import timedelta',
            'from temporalio import activity, workflow',
            '',
            '@workflow.defn(name="天气查询工作流")',
            'class WeatherWorkflow:',
            '    async def run(self, params: dict):',
            '        return await workflow.execute_activity(',
            '            httpRequest,',
            '            {"url": "https://wttr.in/shanghai?format=j1"},',
            '            start_to_close_timeout=timedelta(seconds=30),',
            '            retry_policy=activity.RetryPolicy(maximum_attempts=2),',
            '        )',
            '```',
          ].join('\n'),
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          result: [
            '```python',
            'from datetime import timedelta',
            'from temporalio import workflow',
            'from temporalio.common import RetryPolicy',
            '',
            '@workflow.defn(name="天气查询工作流")',
            'class WeatherWorkflow:',
            '    async def run(self, params: dict):',
            '        return {"ok": True}',
            '```',
          ].join('\n'),
        },
      } as any);

    const result = await service.generateWorkflowCode(
      {
        name: '天气查询工作流',
        workflowClassName: 'WeatherWorkflow',
        taskQueue: 'SKILL_TASK_QUEUE',
        steps: [
          {
            id: 'step_1',
            name: '查询天气',
            type: 'activity',
            activityRef: 'builtin:httpRequest',
            activityName: 'httpRequest',
            input: {
              __httpRequest: {
                method: 'GET',
                urlTemplate: 'https://wttr.in/{city}',
                queryTemplate: { format: 'j1' },
              },
            },
          },
        ],
      },
      { activities: [] },
      '执行错误: Compilation Error: module temporalio.activity has no attribute RetryPolicy'
    );

    expect(result.success).toBe(true);
    expect(result.autoRetried).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.code).not.toContain('activity.RetryPolicy');
    const secondPromptPayload = mockedAxios.post.mock.calls[1]?.[1] as any;
    expect(String(secondPromptPayload?.prompt || '')).toContain('RetryPolicy 属于 temporalio.common');
    expect(String(secondPromptPayload?.prompt || '')).toContain('activity.RetryPolicy');
  });

  it('retries once when first AI code uses workflow.unsafe', async () => {
    const { service, codegenService, workflowSupportService } = createService();

    jest.spyOn(workflowSupportService, 'buildDeterministicWorkflowCode').mockReturnValue(null);
    jest
      .spyOn(codegenService as any, 'runPythonAstGateCheck')
      .mockReturnValueOnce({
        success: false,
        errors: [
          {
            line: 6,
            code: 'WORKFLOW_UNSAFE',
            message: "Workflow 代码禁止使用 'workflow.unsafe.is_replaying'（外部副作用/非确定性操作必须封装在 @activity.defn Activity 中）。",
          },
        ],
      })
      .mockReturnValueOnce({
        success: true,
        errors: [],
      });
    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          result: [
            '```python',
            'from temporalio import workflow',
            '',
            '@workflow.defn(name="天气查询工作流")',
            'class WeatherWorkflow:',
            '    async def run(self, params: dict):',
            '        return workflow.unsafe.is_replaying()',
            '```',
          ].join('\n'),
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          result: [
            '```python',
            'from temporalio import workflow',
            '',
            '@workflow.defn(name="天气查询工作流")',
            'class WeatherWorkflow:',
            '    async def run(self, params: dict):',
            '        return {"ok": True}',
            '```',
          ].join('\n'),
        },
      } as any);

    const result = await service.generateWorkflowCode(
      {
        name: '天气查询工作流',
        workflowClassName: 'WeatherWorkflow',
        taskQueue: 'SKILL_TASK_QUEUE',
        steps: [
          {
            id: 'step_1',
            name: '查询天气',
            type: 'activity',
            activityRef: 'builtin:httpRequest',
            activityName: 'httpRequest',
            input: {
              __httpRequest: {
                method: 'GET',
                urlTemplate: 'https://wttr.in/{city}',
              },
            },
          },
        ],
      },
      { activities: [] },
      '执行错误: Compilation Error: module temporalio.workflow has no attribute unsafe'
    );

    expect(result.success).toBe(true);
    expect(result.autoRetried).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.code).not.toContain('workflow.unsafe');
    const secondPromptPayload = mockedAxios.post.mock.calls[1]?.[1] as any;
    expect(String(secondPromptPayload?.prompt || '')).toContain('workflow.unsafe');
    expect(String(secondPromptPayload?.prompt || '')).toContain('未通过 Gate 1 静态分析');
    expect(String(secondPromptPayload?.prompt || '')).toContain('删除 workflow.unsafe');
    expect(String(secondPromptPayload?.prompt || '')).toContain('不要手动判断 is_replaying');
  });

  it('optimizes builtin httpRequest into bodyMap when AI returns multi-field mappings', async () => {
    const { service, workflowConfigService } = createService();

    jest.spyOn(workflowConfigService, 'previewHttpRequestConfig').mockResolvedValue({
      success: true,
      baseConfig: {
        method: 'GET',
        urlTemplate: 'https://wttr.in/shanghai?format=j1',
        queryTemplate: {},
        headersTemplate: {},
        jsonTemplate: {},
        dataTemplate: {},
        timeout: 30,
        responseMode: 'body',
        responseBodyPath: '',
        responseFieldMappings: {},
      },
      resolvedRequest: {
        method: 'GET',
        url: 'https://wttr.in/shanghai?format=j1',
      },
      previewResponse: {
        body: {
          current_condition: [
            {
              temp_C: '24',
              FeelsLikeC: '26',
              windspeedKmph: '11',
              lang_zh: [{ value: '晴' }],
            },
          ],
        },
      },
    });
    jest.spyOn(workflowConfigService as any, 'requestAiOptimizedHttpConfig').mockResolvedValue({
      responseMode: 'bodyMap',
      responseBodyPath: 'body.current_condition.0.temp_C',
      responseFieldMappings: {
        weatherText: 'body.current_condition.0.lang_zh.0.value',
        temperatureC: 'body.current_condition.0.temp_C',
        feelsLikeC: 'body.current_condition.0.FeelsLikeC',
      },
      reason: '需要多个字段，所以直接返回结构化对象',
    });

    const result = await service.optimizeHttpRequestConfig(
      {
        method: 'GET',
        urlTemplate: 'https://wttr.in/shanghai?format=j1',
      },
      {},
      '提取天气描述、气温和体感温度'
    );

    expect(result.success).toBe(true);
    expect(result.optimizedConfig).toEqual(
      expect.objectContaining({
        responseMode: 'bodyMap',
        responseBodyPath: '',
        responseFieldMappings: {
          weatherText: 'current_condition.0.lang_zh.0.value',
          temperatureC: 'current_condition.0.temp_C',
          feelsLikeC: 'current_condition.0.FeelsLikeC',
        },
      })
    );
    expect(result.explanation).toBe('需要多个字段，所以直接返回结构化对象');
  });

  it('generates AI draft constrained to registered activities', async () => {
    const { service, prisma } = createService();

    prisma.activity.findMany.mockResolvedValue([]);
    mockedAxios.post.mockResolvedValue({
      data: {
        result: JSON.stringify({
          workflowName: '天气查询工作流',
          workflowDescription: '根据城市查询天气',
          workflowClassName: 'WeatherLookupWorkflow',
          workflowDefnName: '天气查询工作流',
          taskQueue: 'SKILL_TASK_QUEUE',
          inputParams: {
            city: {
              description: '城市名',
              required: true,
              defaultValue: '',
            },
            topic: {
              description: '搜索类别',
              required: false,
              defaultValue: 'general',
              enum: ['general', 'news', 'finance'],
              type: 'string',
              exampleValue: 'news',
            },
          },
          outputParams: {
            result: {
              description: '天气结果',
              sourceStep: 'step_1',
            },
          },
          steps: [
            {
              id: 'step_1',
              name: '查询天气接口',
              type: 'activity',
              activityRef: 'builtin:httpRequest',
              activityName: 'HTTP 请求',
              startToCloseTimeout: '30s',
              input: {
                __httpRequest: {
                  method: 'GET',
                  urlTemplate: 'https://wttr.in/{city}?format=j1',
                  queryTemplate: {},
                  headersTemplate: {},
                  jsonTemplate: {},
                  dataTemplate: {},
                  timeout: 20,
                  responseMode: 'body',
                  responseBodyPath: '',
                  responseFieldMappings: {},
                },
              },
            },
          ],
          activities: [
            {
              activityRef: 'builtin:httpRequest',
              name: 'HTTP 请求',
              timeout: '30s',
              retryPolicy: {
                maxRetries: 2,
                backoffMs: 1000,
              },
              config: {},
            },
          ],
        }),
      },
    } as any);

    const draft = await service.generateAiWorkflowDraft({
      description: '创建一个天气查询工作流，输入城市名返回天气信息',
    });

    expect(draft.name).toBe('天气查询工作流');
    expect(draft.sourceContext).toEqual(
      expect.objectContaining({
        sourceType: 'text',
        userDescription: '创建一个天气查询工作流，输入城市名返回天气信息',
      })
    );
    expect(draft.workflowDsl.steps[0].activityRef).toBe('builtin:httpRequest');
    expect(draft.workflowDsl.sourceContext).toEqual(
      expect.objectContaining({
        sourceType: 'text',
      })
    );
    expect(draft.activityDsl.activities[0].fn).toBe('httpRequest');
    expect(draft.activityDsl.activities[0].handler).toBe('api');
    expect(draft.workflowDsl.inputParams?.topic).toEqual(
      expect.objectContaining({
        defaultValue: 'general',
        enum: ['general', 'news', 'finance'],
        exampleValue: 'news',
      })
    );
    expect(mockedAxios.post).toHaveBeenCalled();
    const promptPayload = mockedAxios.post.mock.calls[0]?.[1] as any;
    expect(String(promptPayload?.prompt || '')).toContain('必须在对应 inputParams 参数上输出 enum 数组');
  });

  it('materializes weather formatted AI draft with complete structuredTransform config', async () => {
    const { service, prisma } = createService();

    prisma.activity.findMany.mockResolvedValue([]);
    mockedAxios.post.mockResolvedValue({
      data: {
        result: JSON.stringify({
          workflowName: 'weather-query-workflow-formatted',
          workflowDescription: '查询城市今天天气并格式化输出类似 wttr.in 风格的 ASCII 天气信息',
          workflowClassName: 'WeatherQueryWorkflow',
          workflowDefnName: 'weather-query-workflow-formatted',
          taskQueue: 'SKILL_TASK_QUEUE',
          inputParams: {
            city: {
              description: '城市名',
              required: true,
              defaultValue: '',
            },
          },
          outputParams: {
            result: {
              description: 'ASCII 天气文本',
              sourceStep: 'step_2',
            },
          },
          steps: [
            {
              id: 'step_1',
              name: '查询天气接口',
              type: 'activity',
              activityRef: 'builtin:httpRequest',
              activityName: 'HTTP 请求',
              startToCloseTimeout: '30s',
              input: {
                __httpRequest: {
                  method: 'GET',
                  urlTemplate: 'https://wttr.in/{city}?format=j1',
                  timeout: 20,
                  responseMode: 'bodyMap',
                  responseFieldMappings: {
                    weatherText: 'current_condition.0.lang_zh.0.value',
                    temperatureC: 'current_condition.0.temp_C',
                    feelsLikeC: 'current_condition.0.FeelsLikeC',
                    humidity: 'current_condition.0.humidity',
                  },
                },
              },
            },
            {
              id: 'step_2',
              name: '格式化天气文本',
              type: 'activity',
              activityRef: 'builtin:structuredTransform',
              activityName: '结构化转换',
              startToCloseTimeout: '90s',
              input: {
                __structuredTransform: {},
              },
            },
          ],
          activities: [
            {
              activityRef: 'builtin:httpRequest',
              name: 'HTTP 请求',
              timeout: '30s',
              retryPolicy: {
                maxRetries: 2,
                backoffMs: 1000,
              },
              config: {},
            },
            {
              activityRef: 'builtin:structuredTransform',
              name: '结构化转换',
              timeout: '90s',
              retryPolicy: {
                maxRetries: 2,
                backoffMs: 1000,
              },
              config: {},
            },
          ],
        }),
      },
    } as any);

    const draft = await service.generateAiWorkflowDraft({
      description: '查询城市今天天气并格式化输出类似 wttr.in 风格的 ASCII 天气信息',
    });

    const transformStep = draft.workflowDsl.steps[1];
    const transformConfig = (transformStep.input || {}).__structuredTransform || {};
    expect(transformStep.activityRef).toBe('builtin:structuredTransform');
    expect(transformConfig.contentTemplate).toBe('{content}');
    expect(transformConfig.contentType).toBe('json');
    expect(transformConfig.outputMode).toBe('text');
    expect(String(transformConfig.textTemplate || '')).toBe('{content}');
    expect(transformConfig.fieldMappings).toEqual({});
  });

  it('normalizes transform defaults using generic rules instead of domain-specific templates', () => {
    const { workflowConfigService, workflowNormalizationService } = createService();

    const fixedResult = normalizeAiDraftStepInput({
      rawInput: {
        __structuredTransform: {
          outputMode: 'text',
          fieldMappings: {
            summary: 'summary',
            adviceText: 'adviceText',
          },
        },
      },
      activityRef: 'builtin:structuredTransform',
      stepName: '生成通知文本',
      workflowIntentText: '把结果格式化为纯文本消息',
      previousActivityRef: 'builtin:httpRequest',
      sanitizeJsonValue: <T>(value: T) => workflowNormalizationService.sanitizeJsonValue(value),
      normalizeStructuredTransformConfig: (config, placeholderKeys) =>
        workflowConfigService.normalizeStructuredTransformConfig(config, placeholderKeys),
    });
    const aiResult = normalizeAiDraftStepInput({
      rawInput: {
        __structuredTransform: {},
      },
      activityRef: 'builtin:aiStructuredTransform',
      stepName: '生成摘要',
      workflowIntentText: '请输出结构化摘要',
      previousActivityRef: 'builtin:httpRequest',
      sanitizeJsonValue: <T>(value: T) => workflowNormalizationService.sanitizeJsonValue(value),
      normalizeStructuredTransformConfig: (config, placeholderKeys) =>
        workflowConfigService.normalizeStructuredTransformConfig(config, placeholderKeys),
    });

    expect(fixedResult.__structuredTransform.textTemplate).toBe(
      'Summary: {summary}\nAdvice Text: {adviceText}'
    );
    expect(fixedResult.__structuredTransform.fieldMappings).toEqual({
      summary: 'summary',
      adviceText: 'adviceText',
    });
    expect(aiResult.__structuredTransform.outputMode).toBe('json');
    expect(aiResult.__structuredTransform.outputSchema).toEqual({
      summary: 'string',
    });
    expect(String(aiResult.__structuredTransform.instructionTemplate || '')).toContain(
      '按 outputSchema 返回结构化 JSON'
    );
    expect(String(aiResult.__structuredTransform.instructionTemplate || '')).toContain('summary');
  });

  it('infers default output schema fields from explicit field names in instructions', () => {
    const { workflowConfigService, workflowNormalizationService } = createService();

    const aiResult = normalizeAiDraftStepInput({
      rawInput: {
        __structuredTransform: {
          instructionTemplate: '输出字段: userName, userEmail, accountStatus',
        },
      },
      activityRef: 'builtin:aiStructuredTransform',
      stepName: '提取用户资料',
      workflowIntentText: '请从输入中提取用户资料，返回字段 userName、userEmail、accountStatus',
      previousActivityRef: 'builtin:httpRequest',
      sanitizeJsonValue: <T>(value: T) => workflowNormalizationService.sanitizeJsonValue(value),
      normalizeStructuredTransformConfig: (config, placeholderKeys) =>
        workflowConfigService.normalizeStructuredTransformConfig(config, placeholderKeys),
    });

    expect(aiResult.__structuredTransform.outputMode).toBe('json');
    expect(aiResult.__structuredTransform.outputSchema).toEqual({
      userName: 'string',
      userEmail: 'string',
      accountStatus: 'string',
    });
    expect(String(aiResult.__structuredTransform.instructionTemplate || '')).toContain('userName');
    expect(String(aiResult.__structuredTransform.instructionTemplate || '')).toContain(
      'accountStatus'
    );
  });

  it('resolves httpRequest -> structuredTransform draft from preview sample before materialization', async () => {
    const { service, prisma, workflowConfigService } = createService();

    prisma.activity.findMany.mockResolvedValue([]);
    mockedAxios.post.mockResolvedValue({
      data: {
        result: JSON.stringify({
          workflowName: 'weather-query-workflow-formatted',
          workflowDescription: '查询城市今天天气并格式化输出类似 wttr.in 风格的 ASCII 天气信息',
          workflowClassName: 'WeatherQueryWorkflow',
          workflowDefnName: 'weather-query-workflow-formatted',
          taskQueue: 'SKILL_TASK_QUEUE',
          inputParams: {
            city: {
              description: '城市名',
              required: true,
              defaultValue: '',
            },
          },
          outputParams: {
            result: {
              description: 'ASCII 天气文本',
              sourceStep: 'step_2',
            },
          },
          steps: [
            {
              id: 'step_1',
              name: '查询天气接口',
              type: 'activity',
              activityRef: 'builtin:httpRequest',
              activityName: 'HTTP 请求',
              startToCloseTimeout: '30s',
              input: {
                __httpRequest: {
                  method: 'GET',
                  urlTemplate: 'https://wttr.in/{city}',
                  queryTemplate: {
                    format: 'j1',
                  },
                  headersTemplate: {},
                  jsonTemplate: {},
                  dataTemplate: {},
                  timeout: 20,
                  responseMode: 'body',
                  responseBodyPath: '',
                  responseFieldMappings: {},
                },
              },
            },
            {
              id: 'step_2',
              name: '格式化天气文本',
              type: 'activity',
              activityRef: 'builtin:structuredTransform',
              activityName: '结构化转换',
              startToCloseTimeout: '90s',
              input: {
                __structuredTransform: {
                  contentType: 'json',
                  contentTemplate: '{content}',
                  outputMode: 'text',
                  outputSchema: {},
                  contextTemplate: '',
                  fieldMappings: {},
                  textTemplate: '',
                },
              },
            },
          ],
          activities: [
            {
              activityRef: 'builtin:httpRequest',
              name: 'HTTP 请求',
              timeout: '30s',
              config: {},
            },
            {
              activityRef: 'builtin:structuredTransform',
              name: '结构化转换',
              timeout: '90s',
              config: {},
            },
          ],
        }),
      },
    } as any);
    jest.spyOn(workflowConfigService, 'optimizeHttpRequestConfig').mockResolvedValue({
      success: true,
      optimizedConfig: {
        method: 'GET',
        urlTemplate: 'https://wttr.in/{city}',
        queryTemplate: {
          format: 'j1',
        },
        headersTemplate: {},
        jsonTemplate: {},
        dataTemplate: {},
        timeout: 20,
        responseMode: 'bodyMap',
        responseBodyPath: '',
        responseFieldMappings: {
          weatherText: 'current_condition.0.lang_zh.0.value',
          temperatureC: 'current_condition.0.temp_C',
        },
      },
      previewResponse: {
        body: {
          current_condition: [
            {
              temp_C: '24',
              lang_zh: [{ value: '晴' }],
            },
          ],
        },
      },
    });
    jest.spyOn(workflowConfigService, 'generateStructuredTransformConfig').mockResolvedValue({
      success: true,
      config: {
        contentType: 'json',
        contentTemplate: '{content}',
        outputMode: 'text',
        outputSchema: {},
        contextTemplate: '',
        fieldMappings: {
          weatherText: 'weatherText',
          temperatureC: 'temperatureC',
        },
        textTemplate: 'Weather: {weatherText}\nTemp: {temperatureC} C',
      },
    });

    const draft = await service.generateAiWorkflowDraft({
      description: '查询城市今天天气并格式化输出类似 wttr.in 风格的 ASCII 天气信息',
    });

    expect(workflowConfigService.optimizeHttpRequestConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        urlTemplate: 'https://wttr.in/{city}',
      }),
      expect.objectContaining({
        city: 'sample_city',
      }),
      expect.stringContaining('ASCII')
    );
    expect(workflowConfigService.generateStructuredTransformConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        weatherText: '晴',
        temperatureC: '24',
      }),
      expect.stringContaining('ASCII'),
      expect.any(Object)
    );
    expect((draft.workflowDsl.steps[0].input as any).__httpRequest.responseMode).toBe('bodyMap');
    expect((draft.workflowDsl.steps[1].input as any).__structuredTransform.textTemplate).toContain(
      'Weather: {weatherText}'
    );
    expect((draft.warnings || []).some((item: string) => item.includes('真实响应样本'))).toBe(true);
  });

  it('builds generic sample inputs instead of hardcoded domain values', () => {
    const { workflowNormalizationService } = createService();
    const buildWorkflowSemanticHint = (...values: unknown[]) =>
      workflowNormalizationService.buildWorkflowSemanticHint(...values);

    const callbackUrl = buildGenericAiDraftSampleValue({
      key: 'callbackUrl',
      description: '回调地址',
      referenceUrl: '',
      buildWorkflowSemanticHint,
    });
    const pageSize = buildGenericAiDraftSampleValue({
      key: 'pageSize',
      description: '分页大小',
      referenceUrl: '',
      buildWorkflowSemanticHint,
    });
    const enabled = buildGenericAiDraftSampleValue({
      key: 'enabled',
      description: '是否启用',
      referenceUrl: '',
      buildWorkflowSemanticHint,
    });

    expect(callbackUrl).toBe('https://example.com/callbackurl');
    expect(pageSize).toBe(1);
    expect(enabled).toBe(true);
  });

  it('keeps source and english localized variants for canonical template params', () => {
    const { workflowNormalizationService } = createService();

    const seeds = buildTemplateWorkflowParamSeeds({
      template: {
        id: 'tpl-bilingual-en',
        fileName: 'contract.docx',
        suggestions: [
          {
            suggestedName: 'projectName',
            originalText: '项目名称（中文）',
            details: { description: '项目名称（中文）' },
          },
          {
            suggestedName: 'projectName_en',
            originalText: '项目名称（英文）',
            details: { description: '项目名称（英文）' },
          },
        ],
        templateAssetManifest: {
          assetVersion: '1',
          fieldCount: 2,
          languageProfile: {
            sourceLanguage: 'zh',
            targetLanguages: ['en'],
          },
          templateFieldSpecs: [
            {
              fieldId: 'projectName',
              description: '项目名称',
              required: true,
              type: 'string',
            },
          ],
          renderPlan: {
            bindings: [
              {
                fieldId: 'projectName',
                variablePath: 'd.projectName',
                required: true,
              },
              {
                fieldId: 'projectName',
                variablePath: 'd.projectName_en',
                required: true,
              },
            ],
          },
        },
      },
      skill: {
        id: 'skill-bilingual-en',
        parameters: [
          {
            name: 'projectName',
            required: true,
            dataType: 'string',
            displayName: '项目名称（中文）',
          },
          {
            name: 'projectName_en',
            required: true,
            dataType: 'string',
            displayName: '项目名称（英文）',
          },
        ],
      },
      pickFirstNonEmptyString,
      uniqueVariables: (variables) => Array.from(new Set(variables)),
      buildWorkflowSemanticHint: (...values) =>
        workflowNormalizationService.buildWorkflowSemanticHint(...values),
    });

    expect(seeds).toHaveLength(1);
    expect(seeds[0]).toEqual(
      expect.objectContaining({
        key: 'projectName',
        displayName: '项目名称',
        localizedVariants: ['zh', 'en'],
        renderPath: ['projectName', 'projectName_en'],
      })
    );
  });

  it('preserves template placeholders even before workflow input params are fully declared', () => {
    const { workflowConfigService } = createService();

    const normalizedHttpConfig = workflowConfigService.normalizeHttpRequestConfig({
      urlTemplate: 'https://wttr.in/{city}',
      queryTemplate: {
        lang: '{lang}',
      },
    });
    const normalizedTransformConfig = workflowConfigService.normalizeStructuredTransformConfig({
      textTemplate: '{city}今天天气如下：当前温度{celsius}℃',
      fieldMappings: {
        celsius: 'current.temp',
      },
    });

    expect(normalizedHttpConfig.urlTemplate).toBe('https://wttr.in/{city}');
    expect(normalizedHttpConfig.queryTemplate).toEqual({ lang: '{lang}' });
    expect(normalizedTransformConfig.textTemplate).toBe('{city}今天天气如下：当前温度{celsius}℃');
  });

  it('keeps bankAccount typed as string when inferring workflow input params', () => {
    const { workflowNormalizationService } = createService();
    const buildWorkflowSemanticHint = (...values: unknown[]) =>
      workflowNormalizationService.buildWorkflowSemanticHint(...values);

    expect(
      inferWorkflowInputParamType({
        key: 'payment.bankAccount',
        description: '乙方指定的银行账户信息，包括开户行和账号',
        defaultValue: '',
        exampleValue: '乙方指定银行帐号为',
        buildWorkflowSemanticHint,
      })
    ).toBe('string');
    expect(
      normalizeWorkflowInputParamType(undefined, 'payment.bankAccount', buildWorkflowSemanticHint)
    ).toBe('string');
    expect(
      buildGenericAiDraftSampleValue({
        key: 'payment.bankAccount',
        description: '乙方指定的银行账户信息，包括开户行和账号',
        referenceUrl: '',
        buildWorkflowSemanticHint,
      })
    ).toBe('sample_payment_bankaccount');
  });

  it('serializes object contextTemplate without destroying placeholders', () => {
    const { workflowConfigService } = createService();

    const normalizedTransformConfig = workflowConfigService.normalizeStructuredTransformConfig({
      contextTemplate: {
        city: '{city}',
        meta: {
          format: '{format}',
        },
      },
    });

    expect(normalizedTransformConfig.contextTemplate).toBe(
      '{"city":"{city}","meta":{"format":"{format}"}}'
    );
  });

  it('auto-repairs common bodyMap and fixed text transform contract issues in AI draft plan', () => {
    const { aiDraftService } = createService();

    const repaired = repairCommonDraftPlanIssues(
      {
        workflowName: '天气查询',
        inputParams: {
          city: {
            description: '城市',
            required: true,
            defaultValue: '',
          },
        },
        steps: [
          {
            id: 'step_1',
            name: '查询天气接口',
            type: 'activity',
            activityRef: 'builtin:httpRequest',
            input: {
              __httpRequest: {
                method: 'GET',
                urlTemplate: 'https://wttr.in/{city}',
                responseMode: 'bodyMap',
                responseFieldMappings: {
                  city: 'nearest_area.0.areaName.0.value',
                  temperature: 'current_condition.0.temp_C',
                },
              },
            },
          },
          {
            id: 'step_2',
            name: '格式化天气文本',
            type: 'activity',
            activityRef: 'builtin:structuredTransform',
            input: {
              __structuredTransform: {
                contentType: 'json',
                contentTemplate: '{content}',
                outputMode: 'text',
                outputSchema: {
                  result: 'string',
                },
                contextTemplate: '',
                fieldMappings: {},
                textTemplate:
                  '城市：{nearest_area.0.areaName.0.value}\n温度：{current_condition.0.temp_C}°C\n请求城市：{city}',
              },
            },
          },
        ],
      },
      {
        pickFirstNonEmptyString: (...values) =>
          (aiDraftService as any).pickFirstNonEmptyString(...values),
      }
    );

    const transformConfig = (repaired.steps?.[1]?.input as any).__structuredTransform;
    expect(transformConfig.textTemplate).toContain('{city}');
    expect(transformConfig.textTemplate).toContain('{temperature}');
    expect(transformConfig.textTemplate).not.toContain('{nearest_area.0.areaName.0.value}');
    expect(transformConfig.textTemplate).not.toContain('{current_condition.0.temp_C}');
    expect(transformConfig.fieldMappings).toEqual(
      expect.objectContaining({
        city: 'city',
        temperature: 'temperature',
      })
    );
    expect((repaired.warnings || []).join('\n')).toContain('fieldMappings');
  });

  it('auto-fills blank fieldMappings from bodyMap aliases during AI draft repair', () => {
    const { aiDraftService } = createService();

    const repaired = repairCommonDraftPlanIssues(
      {
        workflowName: '天气查询',
        inputParams: {
          city: {
            description: '城市',
            required: true,
            defaultValue: '',
          },
        },
        steps: [
          {
            id: 'step_1',
            name: '查询天气接口',
            type: 'activity',
            activityRef: 'builtin:httpRequest',
            input: {
              __httpRequest: {
                method: 'GET',
                urlTemplate: 'https://wttr.in/{city}',
                responseMode: 'bodyMap',
                responseFieldMappings: {
                  city: 'nearest_area.0.areaName.0.value',
                  temperature: 'current_condition.0.temp_C',
                },
              },
            },
          },
          {
            id: 'step_2',
            name: '整理天气结果',
            type: 'activity',
            activityRef: 'builtin:structuredTransform',
            input: {
              __structuredTransform: {
                contentType: 'json',
                contentTemplate: '{content}',
                outputMode: 'json',
                outputSchema: {
                  city: 'string',
                  temperature: 'string',
                },
                contextTemplate: '',
                fieldMappings: {
                  city: '',
                  temperature: '',
                },
                textTemplate: '',
              },
            },
          },
        ],
      },
      {
        pickFirstNonEmptyString: (...values) =>
          (aiDraftService as any).pickFirstNonEmptyString(...values),
      }
    );

    const transformConfig = (repaired.steps?.[1]?.input as any).__structuredTransform;
    expect(transformConfig.fieldMappings).toEqual({
      city: 'city',
      temperature: 'temperature',
    });
    expect((repaired.warnings || []).join('\n')).toContain('空 fieldMapping');
  });

  it('rejects fixed structuredTransform configs with blank fieldMappings', async () => {
    const { service } = createService();

    const result = await service.validate(
      {
        name: '空映射工作流',
        workflowClassName: 'BlankFieldMappingWorkflow',
        workflowDefnName: '空映射工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        steps: [
          {
            id: 'step_http',
            name: '查询天气接口',
            type: 'activity',
            activityRef: 'builtin:httpRequest',
            activityName: 'httpRequest',
            input: {
              __httpRequest: {
                method: 'GET',
                urlTemplate: 'https://wttr.in/{city}',
                responseMode: 'bodyMap',
                responseFieldMappings: {
                  city: 'nearest_area.0.areaName.0.value',
                  temperature: 'current_condition.0.temp_C',
                },
              },
            },
          },
          {
            id: 'step_transform',
            name: '整理天气结果',
            type: 'activity',
            activityRef: 'builtin:structuredTransform',
            activityName: 'structuredTransform',
            input: {
              __structuredTransform: {
                contentType: 'json',
                contentTemplate: '{content}',
                instructionTemplate: '整理天气结果',
                outputMode: 'json',
                outputSchema: {
                  city: 'string',
                  temperature: 'string',
                },
                contextTemplate: '',
                fieldMappings: {
                  city: '',
                  temperature: 'temperature',
                },
                textTemplate: '',
              },
            },
          },
        ],
      },
      {
        activities: [],
      }
    );

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      '整理天气结果 的 fieldMappings 存在空映射: city。空字符串会导致运行时把整块 content 回填到该字段，请显式填写来源路径、别名或删除这些字段。'
    );
  });

  it('uses configurable timeout for AI draft generation', async () => {
    const { aiDraftService } = createService();
    const originalTimeout = process.env.TEMPORAL_WORKFLOW_AI_DRAFT_TIMEOUT_MS;
    process.env.TEMPORAL_WORKFLOW_AI_DRAFT_TIMEOUT_MS = '420000';
    mockedAxios.post.mockResolvedValue({
      data: {
        result: JSON.stringify({
          workflowName: 'weather-query',
          workflowDescription: 'desc',
          workflowClassName: 'WeatherQueryWorkflow',
          workflowDefnName: 'weather-query',
          taskQueue: 'SKILL_TASK_QUEUE',
          steps: [
            {
              id: 'step_1',
              name: '查询天气',
              type: 'activity',
              activityRef: 'builtin:httpRequest',
              input: {
                __httpRequest: {
                  method: 'GET',
                  urlTemplate: 'https://wttr.in/{city}',
                  responseMode: 'body',
                },
              },
            },
          ],
          activities: [
            {
              activityRef: 'builtin:httpRequest',
              name: 'HTTP 请求',
              timeout: '30s',
              config: {},
            },
          ],
        }),
      },
    } as any);

    try {
      await (aiDraftService as any).analyzeAiWorkflowDraft({
        description: '查询天气',
        referenceUrl: '',
        referenceExcerpt: '',
        activityResources: [
          {
            ref: 'builtin:httpRequest',
            name: 'HTTP 请求',
            fn: 'httpRequest',
            timeout: '30s',
            handler: 'api',
            config: {},
          },
        ],
        knownActivityRefs: new Set(['builtin:httpRequest']),
        support: {
          parseJsonFromAiContent: (content: string) => JSON.parse(content),
        },
      });
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ timeout: 420000 })
      );
    } finally {
      if (originalTimeout === undefined) {
        delete process.env.TEMPORAL_WORKFLOW_AI_DRAFT_TIMEOUT_MS;
      } else {
        process.env.TEMPORAL_WORKFLOW_AI_DRAFT_TIMEOUT_MS = originalTimeout;
      }
    }
  });

  it('merges workflow input params from step placeholders and keeps defaulted params optional by default', () => {
    const { workflowConfigService, workflowNormalizationService } = createService();

    const normalizedInputParams = normalizeDraftInputParams({
      inputParams: {
        lang: {
          description: '语言',
          defaultValue: 'zh',
          enum: ['zh', ' en ', 'zh'],
          exampleValue: 'en',
        },
      },
      steps: [
        {
          id: 'step_1',
          name: '查询天气接口',
          type: 'activity',
          activityRef: 'builtin:httpRequest',
          input: {
            __httpRequest: {
              urlTemplate: 'https://wttr.in/{city}',
              queryTemplate: {
                lang: '{lang}',
              },
            },
          },
        },
        {
          id: 'step_2',
          name: '格式化天气文本',
          type: 'activity',
          activityRef: 'builtin:structuredTransform',
          input: {
            __structuredTransform: {
              textTemplate: '{city}今天天气如下：当前温度{celsius}℃',
              fieldMappings: {
                celsius: 'current.temp',
              },
            },
          },
        },
      ],
      pickFirstNonEmptyString,
      collectTemplateVariables: (value, target) =>
        workflowConfigService.collectTemplateVariables(value, target),
      normalizeWorkflowInputRenderPath,
      buildWorkflowSemanticHint: (...values) =>
        workflowNormalizationService.buildWorkflowSemanticHint(...values),
    });

    expect(normalizedInputParams).toEqual({
      city: {
        description: 'city 参数',
        required: true,
        defaultValue: '',
        source: 'inferred_from_template',
        type: 'string',
        exampleValue: 'sample_city',
      },
      lang: {
        description: '语言',
        required: false,
        defaultValue: 'zh',
        enum: ['zh', 'en'],
        source: 'merged',
        type: 'string',
        exampleValue: 'en',
      },
    });
  });

  it('does not infer step references like step_1 or step_2.emails as workflow input params', () => {
    const { workflowConfigService, workflowNormalizationService } = createService();

    const normalizedInputParams = normalizeDraftInputParams({
      inputParams: {
        maxCount: {
          description: '拉取数量',
          required: false,
          defaultValue: '10',
        },
      },
      steps: [
        {
          id: 'step_1',
          name: '拉取未读邮件',
          type: 'activity',
          activityRef: 'builtin:emailFetchUnread',
          input: {
            __emailFetchUnread: {
              maxCount: '{maxCount}',
            },
          },
        },
        {
          id: 'step_2',
          name: '沉淀入 GTD 收件箱',
          type: 'activity',
          activityRef: 'builtin:inboxCollect',
          input: {
            __inboxCollect: {
              items: '{step_1.emails}',
              sourceType: '{sourceType}',
            },
          },
        },
        {
          id: 'step_3',
          name: '干预网关',
          type: 'activity',
          activityRef: 'builtin:executionInterventionGate',
          input: {
            __executionInterventionGate: {
              previousStepResults: {
                fetch: '{step_1}',
                inbox: '{step_2}',
              },
            },
          },
        },
      ],
      pickFirstNonEmptyString,
      collectTemplateVariables: (value, target) =>
        workflowConfigService.collectTemplateVariables(value, target),
      normalizeWorkflowInputRenderPath,
      buildWorkflowSemanticHint: (...values) =>
        workflowNormalizationService.buildWorkflowSemanticHint(...values),
    });

    expect(normalizedInputParams).toBeDefined();
    expect(Object.keys(normalizedInputParams || {}).sort()).toEqual(['maxCount', 'sourceType']);
    expect(normalizedInputParams?.step_1).toBeUndefined();
    expect(normalizedInputParams?.step_2).toBeUndefined();
    expect(normalizedInputParams?.step_3).toBeUndefined();
  });

  it('rejects enum defaults and examples outside the declared candidates', () => {
    const issues = validateAiWorkflowDraftPlan(
      {
        inputParams: {
          topic: {
            description: '搜索类别',
            required: false,
            defaultValue: 'other',
            enum: ['general', 'news', 'finance'],
            type: 'string',
            exampleValue: 'everything',
          },
        },
        steps: [
          {
            id: 'step_1',
            name: '搜索',
            type: 'activity',
            activityRef: 'builtin:httpRequest',
            input: {
              __httpRequest: {
                urlTemplate: 'https://example.com/search',
              },
            },
          },
        ],
      },
      [
        {
          ref: 'builtin:httpRequest',
          name: 'HTTP 请求',
          fn: 'httpRequest',
          timeout: '30s',
          handler: 'api',
          config: {},
        },
      ],
      {
        pickFirstNonEmptyString: (...values) => pickFirstNonEmptyString(...values) || '',
        buildWorkflowSemanticHint: (...values) => values.filter(Boolean).join(' '),
      }
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        '输入参数 topic 的 defaultValue 必须属于 enum。',
        '输入参数 topic 的 exampleValue 必须属于 enum。',
      ])
    );
  });

  it('resolves httpRequest -> aiStructuredTransform -> structuredTransform sequentially from observed samples', async () => {
    const { service, prisma, workflowConfigService } = createService();

    prisma.activity.findMany.mockResolvedValue([]);
    mockedAxios.post.mockResolvedValue({
      data: {
        result: JSON.stringify({
          workflowName: 'weather-query-ai-chain',
          workflowDescription: '查询天气后先做 AI 归纳，再格式化最终文本',
          workflowClassName: 'WeatherQueryAiChainWorkflow',
          workflowDefnName: 'weather-query-ai-chain',
          taskQueue: 'SKILL_TASK_QUEUE',
          inputParams: {
            city: {
              description: '城市名',
              required: true,
              defaultValue: '',
            },
          },
          outputParams: {
            result: {
              description: '最终天气文本',
              sourceStep: 'step_3',
            },
          },
          steps: [
            {
              id: 'step_1',
              name: '查询天气接口',
              type: 'activity',
              activityRef: 'builtin:httpRequest',
              activityName: 'HTTP 请求',
              input: {
                __httpRequest: {
                  method: 'GET',
                  urlTemplate: 'https://wttr.in/{city}',
                  queryTemplate: {
                    format: 'j1',
                  },
                  headersTemplate: {},
                  jsonTemplate: {},
                  dataTemplate: {},
                  timeout: 20,
                  responseMode: 'body',
                  responseBodyPath: '',
                  responseFieldMappings: {},
                },
              },
            },
            {
              id: 'step_2',
              name: 'AI 归纳天气',
              type: 'activity',
              activityRef: 'builtin:aiStructuredTransform',
              activityName: 'AI 结构化转换',
              input: {
                __structuredTransform: {
                  contentType: 'json',
                  contentTemplate: '{content}',
                  instructionTemplate: '',
                  outputMode: 'json',
                  outputSchema: {},
                  contextTemplate: '',
                },
              },
            },
            {
              id: 'step_3',
              name: '格式化最终天气文本',
              type: 'activity',
              activityRef: 'builtin:structuredTransform',
              activityName: '结构化转换',
              input: {
                __structuredTransform: {
                  contentType: 'json',
                  contentTemplate: '{content}',
                  outputMode: 'text',
                  outputSchema: {},
                  contextTemplate: '',
                  fieldMappings: {},
                  textTemplate: '',
                },
              },
            },
          ],
          activities: [
            {
              activityRef: 'builtin:httpRequest',
              name: 'HTTP 请求',
              timeout: '30s',
              config: {},
            },
            {
              activityRef: 'builtin:aiStructuredTransform',
              name: 'AI 结构化转换',
              timeout: '90s',
              config: {},
            },
            {
              activityRef: 'builtin:structuredTransform',
              name: '结构化转换',
              timeout: '90s',
              config: {},
            },
          ],
        }),
      },
    } as any);
    jest.spyOn(workflowConfigService, 'optimizeHttpRequestConfig').mockResolvedValue({
      success: true,
      optimizedConfig: {
        method: 'GET',
        urlTemplate: 'https://wttr.in/{city}',
        queryTemplate: {
          format: 'j1',
        },
        headersTemplate: {},
        jsonTemplate: {},
        dataTemplate: {},
        timeout: 20,
        responseMode: 'bodyMap',
        responseBodyPath: '',
        responseFieldMappings: {
          weatherText: 'current_condition.0.lang_zh.0.value',
          temperatureC: 'current_condition.0.temp_C',
          humidity: 'current_condition.0.humidity',
        },
      },
      previewResponse: {
        body: {
          current_condition: [
            {
              temp_C: '24',
              humidity: '70',
              lang_zh: [{ value: '晴' }],
            },
          ],
        },
      },
    });
    jest
      .spyOn(workflowConfigService, 'generateAiStructuredTransformDraftConfig')
      .mockResolvedValue({
        success: true,
        config: {
          contentType: 'json',
          contentTemplate: '{content}',
          instructionTemplate: '请根据天气信息生成简短总结和出行建议，按 outputSchema 返回 JSON。',
          outputMode: 'json',
          outputSchema: {
            summary: 'string',
            advice: 'string',
          },
          contextTemplate: '',
        },
        sampleOutput: {
          summary: '晴，24C，湿度 70%',
          advice: '适合外出，可正常安排活动',
        },
      });
    jest.spyOn(workflowConfigService, 'generateStructuredTransformConfig').mockResolvedValue({
      success: true,
      config: {
        contentType: 'json',
        contentTemplate: '{content}',
        outputMode: 'text',
        outputSchema: {},
        contextTemplate: '',
        fieldMappings: {
          summary: 'summary',
          advice: 'advice',
        },
        textTemplate: 'Summary: {summary}\nAdvice: {advice}',
      },
    });

    const draft = await service.generateAiWorkflowDraft({
      description: '查询天气后先做 AI 归纳，再格式化最终文本',
    });

    expect(workflowConfigService.optimizeHttpRequestConfig).toHaveBeenCalledTimes(1);
    expect(workflowConfigService.generateAiStructuredTransformDraftConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        weatherText: '晴',
        temperatureC: '24',
        humidity: '70',
      }),
      expect.stringContaining('AI 归纳天气'),
      expect.any(Object)
    );
    expect(workflowConfigService.generateStructuredTransformConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: '晴，24C，湿度 70%',
        advice: '适合外出，可正常安排活动',
      }),
      expect.stringContaining('格式化最终天气文本'),
      expect.any(Object)
    );
    expect((draft.workflowDsl.steps[0].input as any).__httpRequest.responseMode).toBe('bodyMap');
    expect(
      (draft.workflowDsl.steps[1].input as any).__structuredTransform.instructionTemplate
    ).toContain('出行建议');
    expect((draft.workflowDsl.steps[2].input as any).__structuredTransform.textTemplate).toContain(
      'Summary: {summary}'
    );
    expect((draft.warnings || []).some((item: string) => item.includes('AI 转换配置'))).toBe(true);
  });

  it('repairs AI draft once when builtin structuredTransform config is incomplete', async () => {
    const { service, prisma, workflowConfigService } = createService();

    prisma.activity.findMany.mockResolvedValue([]);
    jest.spyOn(workflowConfigService, 'optimizeHttpRequestConfig').mockResolvedValue({
      success: false,
      error: 'skip optimize in repair test',
    });
    jest.spyOn(workflowConfigService, 'previewHttpRequestConfig').mockResolvedValue({
      success: false,
      error: 'skip preview in repair test',
    });
    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          result: JSON.stringify({
            workflowName: 'weather-query-workflow-formatted',
            workflowDescription: '查询城市今天天气并格式化输出类似 wttr.in 风格的 ASCII 天气信息',
            workflowClassName: 'WeatherQueryWorkflow',
            workflowDefnName: 'weather-query-workflow-formatted',
            taskQueue: 'SKILL_TASK_QUEUE',
            inputParams: {
              city: { description: '城市名', required: true, defaultValue: '' },
            },
            steps: [
              {
                id: 'step_1',
                name: '查询天气接口',
                type: 'activity',
                activityRef: 'builtin:httpRequest',
                activityName: 'HTTP 请求',
                input: {
                  __httpRequest: {
                    method: 'GET',
                    urlTemplate: 'https://wttr.in/{city}',
                    queryTemplate: { format: 'j1' },
                  },
                },
              },
              {
                id: 'step_2',
                name: '格式化天气文本',
                type: 'activity',
                activityRef: 'builtin:structuredTransform',
                activityName: '结构化转换',
                input: {
                  __structuredTransform: {},
                },
              },
            ],
            activities: [
              { activityRef: 'builtin:httpRequest', name: 'HTTP 请求', timeout: '30s', config: {} },
              {
                activityRef: 'builtin:structuredTransform',
                name: '结构化转换',
                timeout: '90s',
                config: {},
              },
            ],
          }),
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          result: JSON.stringify({
            workflowName: 'weather-query-workflow-formatted',
            workflowDescription: '查询城市今天天气并格式化输出类似 wttr.in 风格的 ASCII 天气信息',
            workflowClassName: 'WeatherQueryWorkflow',
            workflowDefnName: 'weather-query-workflow-formatted',
            taskQueue: 'SKILL_TASK_QUEUE',
            inputParams: {
              city: { description: '城市名', required: true, defaultValue: '' },
            },
            outputParams: {
              result: { description: 'ASCII 天气文本', sourceStep: 'step_2' },
            },
            steps: [
              {
                id: 'step_1',
                name: '查询天气接口',
                type: 'activity',
                activityRef: 'builtin:httpRequest',
                activityName: 'HTTP 请求',
                input: {
                  __httpRequest: {
                    method: 'GET',
                    urlTemplate: 'https://wttr.in/{city}',
                    queryTemplate: { format: 'j1' },
                    responseMode: 'body',
                  },
                },
              },
              {
                id: 'step_2',
                name: '格式化天气文本',
                type: 'activity',
                activityRef: 'builtin:structuredTransform',
                activityName: '结构化转换',
                input: {
                  __structuredTransform: {
                    contentType: 'json',
                    contentTemplate: '{content}',
                    instructionTemplate:
                      '请根据输入天气结果整理为类似 wttr.in 风格的 ASCII 纯文本天气信息，只返回纯文本，不要 JSON。',
                    outputMode: 'text',
                    outputSchema: {},
                    contextTemplate: '',
                    fieldMappings: {
                      result: 'result',
                    },
                    textTemplate: 'Summary: {result}',
                  },
                },
              },
            ],
            activities: [
              { activityRef: 'builtin:httpRequest', name: 'HTTP 请求', timeout: '30s', config: {} },
              {
                activityRef: 'builtin:structuredTransform',
                name: '结构化转换',
                timeout: '90s',
                config: {},
              },
            ],
          }),
        },
      } as any);

    const draft = await service.generateAiWorkflowDraft({
      description: '查询城市今天天气并格式化输出类似 wttr.in 风格的 ASCII 天气信息',
    });

    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(workflowConfigService.optimizeHttpRequestConfig).toHaveBeenCalled();
    expect(draft.workflowDsl.steps[1].activityRef).toBe('builtin:structuredTransform');
    expect((draft.workflowDsl.steps[1].input as any).__structuredTransform.outputMode).toBe('text');
  });

  it('injects repeated builtin step guidance into workflow code prompt', async () => {
    const { service, codegenService, workflowSupportService } = createService();

    jest.spyOn(workflowSupportService, 'buildDeterministicWorkflowCode').mockReturnValue(null);
    jest
      .spyOn(codegenService as any, 'runPythonAstGateCheck')
      .mockReturnValue({ success: true, errors: [] });
    mockedAxios.post.mockResolvedValue({
      data: {
        result: [
          'from temporalio import workflow',
          '',
          '@workflow.defn(name="天气查询工作流")',
          'class WeatherQueryWorkflow:',
          '    async def run(self, params: dict):',
          '        return "ok"',
        ].join('\n'),
      },
    } as any);

    await service.generateWorkflowCode(
      {
        name: '天气查询工作流',
        workflowClassName: 'WeatherQueryWorkflow',
        workflowDefnName: '天气查询工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        steps: [
          {
            id: 'step_1',
            name: '查询天气接口',
            type: 'activity',
            activityRef: 'builtin:httpRequest',
            activityName: 'httpRequest',
            input: {
              __httpRequest: {
                method: 'GET',
                urlTemplate: 'https://wttr.in/{city}',
                queryTemplate: { format: 'j1' },
                responseMode: 'body',
              },
            },
          },
          {
            id: 'step_2',
            name: '格式化天气文本',
            type: 'activity',
            activityRef: 'builtin:structuredTransform',
            activityName: 'structuredTransform',
            input: {
              __structuredTransform: {
                contentType: 'json',
                contentTemplate: '{content}',
                instructionTemplate: '请整理为 ASCII 纯文本天气结果',
                outputMode: 'text',
                outputSchema: {},
              },
            },
          },
        ],
      },
      { activities: [] }
    );

    const promptPayload = mockedAxios.post.mock.calls[0]?.[1] as any;
    expect(String(promptPayload?.prompt || '')).toContain('【已确认的内置步骤约束（请重复遵守）】');
    expect(String(promptPayload?.prompt || '')).toContain('这是 builtin:structuredTransform 步骤');
    expect(String(promptPayload?.prompt || '')).toContain('最终返回必须是纯文本');
  });

  describe('deriveV2OutputFromOutputParams (P1-C §8.3)', () => {
  const transformStep = (overrides: Record<string, any> = {}) => ({
    id: 'step_1',
    name: '整理结果',
    type: 'activity' as const,
    activityRef: 'builtin:structuredTransform',
    activityName: 'structuredTransform',
    input: {
      [STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]: {
        contentType: 'json',
        outputMode: 'json',
        outputSchema: { summary: 'string', temperature: 'number' },
        ...overrides,
      },
    },
  });

  it('derives fields for transform JSON outputSchema keys with $. paths', () => {
    const v2Output = deriveV2OutputFromOutputParams({
      outputParams: {
        summary: { description: '摘要', sourceStep: 'step_1' },
        temperature: { sourceStep: 'step_1' },
        mystery: { sourceStep: 'step_1' }, // not in outputSchema → skipped
      },
      steps: [transformStep()],
    });
    expect(v2Output).toBeDefined();
    expect(Object.keys(v2Output!.fields!)).toEqual(['summary', 'temperature']);
    expect(v2Output!.fields!.summary).toEqual({
      type: 'string',
      required: false,
      source: { step: 'step_1', path: '$.summary' },
      description: '摘要',
    });
    expect(v2Output!.fields!.temperature.type).toBe('number');
  });

  it('derives a scalar $ path for text-mode transform steps', () => {
    const v2Output = deriveV2OutputFromOutputParams({
      outputParams: { text: { sourceStep: 'step_1' } },
      steps: [transformStep({ outputMode: 'text' })],
    });
    expect(v2Output!.fields!.text).toEqual({
      type: 'string',
      required: false,
      source: { step: 'step_1', path: '$' },
    });
  });

  it('derives HTTP output fields for full, bodyMap, and normalized body modes', () => {
    const httpStep = (responseMode: string, responseFieldMappings: Record<string, any> = {}) => ({
      id: 'step_1',
      name: '请求接口',
      type: 'activity' as const,
      activityRef: 'builtin:httpRequest',
      activityName: 'httpRequest',
      input: {
        [HTTP_REQUEST_STEP_CONFIG_KEY]: {
          responseMode,
          responseFieldMappings,
        },
      },
    });
    const fullMode = deriveV2OutputFromOutputParams({
      outputParams: { body: { sourceStep: 'step_1' }, statusCode: { sourceStep: 'step_1' }, mystery: { sourceStep: 'step_1' } },
      steps: [httpStep('full')],
    });
    expect(Object.keys(fullMode!.fields!)).toEqual(['body', 'statusCode']);
    expect(fullMode!.fields!.body.source).toEqual({ step: 'step_1', path: '$.body' });

    const bodyMapMode = deriveV2OutputFromOutputParams({
      outputParams: { temperature: { sourceStep: 'step_1' }, mystery: { sourceStep: 'step_1' } },
      steps: [httpStep('bodyMap', { temperature: '$.current.temp' })],
    });
    expect(Object.keys(bodyMapMode!.fields!)).toEqual(['temperature']);

    const defaultBodyMode = deriveV2OutputFromOutputParams({
      outputParams: { result: { sourceStep: 'step_1' } },
      steps: [httpStep('body')],
    });
    expect(defaultBodyMode).toEqual({
      fields: {
        result: {
          type: undefined,
          required: false,
          source: { step: 'step_1', path: '$.result' },
        },
      },
    });
  });

  it('skips unknown steps, missing sourceStep, and empty outputParams', () => {
    const customStep = {
      id: 'step_1',
      name: '自定义步骤',
      type: 'activity' as const,
      activityRef: 'custom:abc',
      activityName: 'custom',
      input: {},
    };
    expect(
      deriveV2OutputFromOutputParams({
        outputParams: { result: { sourceStep: 'step_1' } },
        steps: [customStep],
      })
    ).toBeUndefined();
    expect(
      deriveV2OutputFromOutputParams({
        outputParams: { result: { sourceStep: 'step_404' } },
        steps: [transformStep()],
      })
    ).toBeUndefined();
    expect(deriveV2OutputFromOutputParams({ outputParams: {}, steps: [transformStep()] })).toBeUndefined();
    expect(deriveV2OutputFromOutputParams({ steps: [transformStep()] })).toBeUndefined();
  });

  it('flows through generateAiWorkflowDraft into workflowDsl.v2Output (compiler-sealed)', async () => {
    const { service } = createService();

    mockedAxios.post.mockResolvedValue({
      data: {
        result: JSON.stringify({
          workflowName: '天气结果整理工作流',
          workflowDescription: '根据城市查询并整理天气',
          workflowClassName: 'WeatherStructuredWorkflow',
          workflowDefnName: '天气结果整理工作流',
          taskQueue: 'SKILL_TASK_QUEUE',
          inputParams: {
            city: { description: '城市名', required: true, defaultValue: '' },
          },
          outputParams: {
            temperature: { description: '当前温度', sourceStep: 'step_1' },
            summary: { description: '天气摘要', sourceStep: 'step_1' },
            mystery: { sourceStep: 'step_1' },
          },
          steps: [
            {
              id: 'step_1',
              name: '整理天气结果',
              type: 'activity',
              activityRef: 'builtin:structuredTransform',
              activityName: 'structuredTransform',
              startToCloseTimeout: '90s',
              input: {
                [STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]: {
                  contentType: 'json',
                  contentTemplate: '{content}',
                  instructionTemplate: '整理天气',
                  outputMode: 'json',
                  outputSchema: { temperature: 'number', summary: 'string' },
                },
              },
            },
          ],
          activities: [
            {
              activityRef: 'builtin:structuredTransform',
              name: '结构化转换',
              timeout: '90s',
              retryPolicy: { maxRetries: 2, backoffMs: 1000 },
              config: {},
            },
          ],
        }),
      },
    } as any);

    const draft = await service.generateAiWorkflowDraft({
      description: '创建一个整理天气结果的工作流',
    });

    expect(draft.workflowDsl.v2Output).toBeDefined();
    expect(Object.keys(draft.workflowDsl.v2Output!.fields!)).toEqual(['temperature', 'summary']);
    expect(draft.workflowDsl.v2Output!.fields!.temperature).toMatchObject({
      type: 'number',
      required: false,
      source: { step: 'step_1', path: '$.temperature' },
    });
    expect(draft.workflowDsl.v2Output!.fields!.summary).toMatchObject({
      type: 'string',
      required: false,
      source: { step: 'step_1', path: '$.summary' },
    });
    // AI-declared but unprovable field must NOT leak into the sealed output
    expect(draft.workflowDsl.v2Output!.fields!.mystery).toBeUndefined();
  });

  it('seals the normalized default output mapping when the AI declared no outputParams', async () => {
    const { service } = createService();

    mockedAxios.post.mockResolvedValue({
      data: {
        result: JSON.stringify({
          workflowName: '无输出声明工作流',
          workflowDescription: '没有声明输出参数',
          workflowClassName: 'NoOutputWorkflow',
          workflowDefnName: '无输出声明工作流',
          taskQueue: 'SKILL_TASK_QUEUE',
          inputParams: {},
          steps: [
            {
              id: 'step_1',
              name: '整理结果',
              type: 'activity',
              activityRef: 'builtin:structuredTransform',
              activityName: 'structuredTransform',
              startToCloseTimeout: '90s',
              input: {
                [STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]: {
                  contentType: 'json',
                  contentTemplate: '{content}',
                  instructionTemplate: '整理结果',
                  outputMode: 'json',
                  outputSchema: { result: 'string' },
                },
              },
            },
          ],
          activities: [
            {
              activityRef: 'builtin:structuredTransform',
              name: '结构化转换',
              timeout: '90s',
              retryPolicy: { maxRetries: 2, backoffMs: 1000 },
              config: {},
            },
          ],
        }),
      },
    } as any);

    const draft = await service.generateAiWorkflowDraft({
      description: '创建一个不声明输出的工作流',
    });

    expect(draft.workflowDsl.v2Output).toEqual({
      dataPath: '$.result.businessData',
      fields: {
        result: {
          description: '工作流输出结果',
          required: true,
          source: { step: 'step_1', path: '$.result.result' },
        },
      },
    });
    expect(draft.workflowDsl.outputParams).toEqual({
      result: { description: '工作流输出结果', sourceStep: 'step_1' },
    });
  });
  });
});
