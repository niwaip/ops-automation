import axios from 'axios';
import { TemporalWorkflowActivityResolutionService } from '@ops/workflow-registry/temporal/temporal-workflow-activity-resolution.service';
import { TemporalWorkflowBrowserDraftService } from '@ops/workflow-registry/temporal/browser-bridge/temporal-workflow-browser-draft.service';
import { TemporalWorkflowCodegenService } from '@ops/workflow-registry/temporal/temporal-workflow-codegen.service';
import { ActivityCodegenService } from '@ops/workflow-registry/temporal/temporal-activity-codegen.service';
import { TemporalWorkflowService } from '@ops/workflow-registry/temporal/temporal-workflow.service';
import { TemporalWorkflowArtifactService } from '@ops/workflow-registry/workflow-template/temporal-workflow-artifact.service';
import { TemporalWorkflowConfigOrchestrationService } from '@ops/workflow-registry/workflow-template/temporal-workflow-config-orchestration.service';
import { TemporalWorkflowConfigService } from '@ops/workflow-registry/workflow-template/temporal-workflow-config.service';
import { TemporalWorkflowDraftOrchestrationService } from '@ops/workflow-registry/workflow-template/temporal-workflow-draft-orchestration.service';
import { TemporalWorkflowManagementService } from '@ops/workflow-registry/workflow-template/temporal-workflow-management.service';
import { TemporalWorkflowSessionOrchestrationService } from '@ops/workflow-registry/workflow-template/temporal-workflow-session-orchestration.service';
import { TemporalWorkflowSessionSupportFactoryService } from '@ops/workflow-registry/workflow-template/temporal-workflow-session-support-factory.service';
import { TemporalWorkflowTemplateService } from '@ops/workflow-registry/workflow-template/temporal-workflow-template.service';
import { buildDeterministicWorkflowCodeForWorkflow } from '@ops/workflow-registry/temporal/temporal-workflow-deterministic-builder';
import { TemporalWorkflowAiDraftService } from '@ops/workflow-registry/temporal/temporal-workflow-draft.service';
import {
  buildGenericAiDraftSampleValue,
  deriveV2OutputFromOutputParams,
  inferWorkflowInputParamType,
  normalizeAiDraftStepInput,
  normalizeDraftInputParams,
} from '@ops/workflow-registry/temporal/temporal-workflow-draft.normalizers';
import {
  repairCommonDraftPlanIssues,
  validateAiWorkflowDraftPlan,
} from '@ops/workflow-registry/temporal/temporal-workflow-draft-plan.helpers';
import { TemporalWorkflowNormalizationService } from '@ops/workflow-registry/temporal/temporal-workflow-normalization.service';
import { pickFirstNonEmptyString } from '@ops/workflow-registry/temporal/temporal-workflow-json.utils';
import { TemporalWorkflowSessionService } from '@ops/workflow-registry/temporal/temporal-workflow-session.service';
import { TemporalWorkflowSupportService } from '@ops/workflow-registry/temporal/temporal-workflow-support.service';
import {
  buildTemplateWorkflowParamSeeds,
  normalizeWorkflowInputParamType,
  normalizeWorkflowInputRenderPath,
} from '@ops/workflow-registry/temporal/temporal-workflow-template.helpers';
import { TemporalWorkflowValidationFacadeService } from '@ops/workflow-registry/temporal/temporal-workflow-validation-facade.service';
import { TemporalWorkflowValidationService } from '@ops/workflow-registry/temporal/temporal-workflow-validation.service';
import { TemporalWorkflowArtifactValidationService } from '@ops/workflow-registry/validation/temporal-workflow-artifact-validation.service';
import { TemporalWorkflowValidationContractService } from '@ops/workflow-registry/validation/temporal-workflow-validation-contract.service';
import { TemporalWorkflowDslValidationService } from '@ops/workflow-registry/validation/temporal-workflow-dsl-validation.service';
import { TemporalWorkflowCodegenOrchestrationService } from '@ops/workflow-registry/codegen/temporal-workflow-codegen-orchestration.service';
import {
  BuiltinActivityRegistry,
  HTTP_REQUEST_STEP_CONFIG_KEY,
  STRUCTURED_TRANSFORM_STEP_CONFIG_KEY,
} from '@ops/workflow-registry/temporal/builtin-activity.registry';

import { createService } from './temporal-workflow-draft.test-helper';
jest.mock('axios');

describe('TemporalWorkflowAiDraftService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

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

});
