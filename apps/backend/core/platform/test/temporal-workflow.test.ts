import axios from 'axios';
import { TemporalWorkflowAiDraftService } from '../src/modules/temporal/temporal-draft.service';
import { TemporalWorkflowService } from '../src/modules/temporal/temporal-workflow.service';
import { BuiltinActivityRegistry } from '../src/modules/temporal/builtin-activity.registry';

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
    };

    const builtinRegistry = new BuiltinActivityRegistry();
    const aiDraftService = new TemporalWorkflowAiDraftService(prisma as any, builtinRegistry);
    const service = new TemporalWorkflowService(prisma as any, builtinRegistry, aiDraftService);

    return { service, prisma, builtinRegistry, aiDraftService };
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

  it('registers dedicated builtin aiStructuredTransform activity', () => {
    const { builtinRegistry } = createService();

    const activity = builtinRegistry.getByKey('aiStructuredTransform');

    expect(activity).toEqual(expect.objectContaining({
      key: 'aiStructuredTransform',
      ref: 'builtin:aiStructuredTransform',
      fn: 'aiStructuredTransform',
    }));
  });

  it('generates deterministic code for builtin httpRequest with step-level config', async () => {
    const { service } = createService();

    const result = await service.generateWorkflowCode(
      {
        name: '天气查询工作流',
        workflowClassName: 'WeatherWorkflow',
        workflowDefnName: '天气查询工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: {
          city: {
            required: true,
            description: '城市名',
          },
        },
        steps: [
          {
            id: 'step_1',
            name: '查询天气接口',
            type: 'activity',
            activityRef: 'builtin:httpRequest',
            activityName: 'httpRequest',
            startToCloseTimeout: '45s',
            scheduleToCloseTimeout: '3m',
            heartbeatTimeout: '20s',
            input: {
              __httpRequest: {
                method: 'GET',
                urlTemplate: 'https://api.weather.example.com/current',
                queryTemplate: {
                  city: '{city}',
                },
                responseMode: 'bodyPath',
                responseBodyPath: 'data.current.temp',
                timeout: 20,
              },
            },
          },
        ],
      },
      {
        activities: [],
      },
    );

    expect(result.success).toBe(true);
    expect(result.code).toContain('https://api.weather.example.com/current');
    expect(result.code).toContain('"queryTemplate": {');
    expect(result.code).toContain('"city": "{city}"');
    expect(result.code).toContain('"responseMode": "bodyPath"');
    expect(result.code).toContain('"responseBodyPath": "data.current.temp"');
    expect(result.code).toContain('start_to_close_timeout=timedelta(seconds=45)');
    expect(result.code).toContain('schedule_to_close_timeout=timedelta(minutes=3)');
    expect(result.code).toContain('heartbeat_timeout=timedelta(seconds=20)');
  });

  it('generates deterministic code for builtin httpRequest bodyMap response mode', async () => {
    const { service } = createService();

    const result = await service.generateWorkflowCode(
      {
        name: '多字段天气工作流',
        workflowClassName: 'WeatherMapWorkflow',
        workflowDefnName: '多字段天气工作流',
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
                urlTemplate: 'https://wttr.in/shanghai?format=j1',
                responseMode: 'bodyMap',
                responseFieldMappings: {
                  weatherText: 'current_condition.0.lang_zh.0.value',
                  temperatureC: 'current_condition.0.temp_C',
                  feelsLikeC: 'current_condition.0.FeelsLikeC',
                },
              },
            },
          },
        ],
      },
      {
        activities: [],
      },
    );

    expect(result.success).toBe(true);
    expect(result.code).toContain('"responseMode": "bodyMap"');
    expect(result.code).toContain('"responseFieldMappings": {');
    expect(result.code).toContain('"weatherText": "current_condition.0.lang_zh.0.value"');
    expect(result.code).toContain('if response_mode == "bodyMap":');
    expect(result.code).toContain('return {str(key): cls._extract_path(body, str(path)) for key, path in mappings.items()}');
  });

  it('generates deterministic code for builtin structuredTransform with html extraction config', async () => {
    const { service } = createService();

    const result = await service.generateWorkflowCode(
      {
        name: '页面结构提取工作流',
        workflowClassName: 'HtmlTransformWorkflow',
        workflowDefnName: '页面结构提取工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: {
          html: {
            required: true,
            description: 'HTML 原文',
          },
        },
        steps: [
          {
            id: 'step_1',
            name: '提取页面结构',
            type: 'activity',
            activityRef: 'builtin:structuredTransform',
            activityName: 'structuredTransform',
            startToCloseTimeout: '90s',
            input: {
              __structuredTransform: {
                contentType: 'html',
                contentTemplate: '{html}',
                instructionTemplate: '提取标题和摘要，返回 JSON',
                outputMode: 'json',
                outputSchema: {
                  title: 'string',
                  summary: 'string',
                },
              },
            },
          },
        ],
      },
      {
        activities: [],
      },
    );

    expect(result.success).toBe(true);
    expect(result.code).toContain('STRUCTURED_TRANSFORM_CONFIG');
    expect(result.code).toContain('"contentType": "html"');
    expect(result.code).toContain('"instructionTemplate": "提取标题和摘要，返回 JSON"');
    expect(result.code).toContain('"outputMode": "json"');
    expect(result.code).toContain('return result.get("result") if isinstance(result, dict) and "result" in result else result');
  });

  it('generates deterministic code for builtin httpRequest -> structuredTransform pipeline', async () => {
    const { service } = createService();

    const result = await service.generateWorkflowCode(
      {
        name: '天气结构化工作流',
        workflowClassName: 'WeatherStructuredWorkflow',
        workflowDefnName: '天气结构化工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: {
          city: {
            required: true,
            description: '城市名',
          },
        },
        steps: [
          {
            id: 'step_http',
            name: '查询天气接口',
            type: 'activity',
            activityRef: 'builtin:httpRequest',
            activityName: 'httpRequest',
            startToCloseTimeout: '45s',
            input: {
              __httpRequest: {
                method: 'GET',
                urlTemplate: 'https://wttr.in/{city}',
                queryTemplate: {
                  format: 'j1',
                },
                responseMode: 'bodyMap',
                responseFieldMappings: {
                  weatherText: 'current_condition.0.lang_zh.0.value',
                  temperatureC: 'current_condition.0.temp_C',
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
            startToCloseTimeout: '90s',
            input: {
              __structuredTransform: {
                contentType: 'json',
                instructionTemplate: '把天气结果整理为最终 JSON，保留 weatherText 和 temperatureC',
                outputMode: 'json',
                outputSchema: {
                  weatherText: 'string',
                  temperatureC: 'string',
                },
              },
            },
          },
        ],
      },
      {
        activities: [],
      },
    );

    expect(result.success).toBe(true);
    expect(result.generationMode).toBe('deterministic');
    expect(result.code).toContain('HTTP_REQUEST_CONFIG');
    expect(result.code).toContain('STRUCTURED_TRANSFORM_CONFIG');
    expect(result.code).toContain('"contentTemplate": "{content}"');
    expect(result.code).toContain('"httpResult": http_result');
    expect(result.code).toContain('http_result = self._normalize_http_result(http_result_raw, normalized_params)');
    expect(result.code).toContain('transform_result = await workflow.execute_activity(');
    expect(result.code).toContain('固定规则结构化转换配置摘要');
    expect(result.code).toContain('"fieldMappings": {');
    expect(result.code).toContain('"fieldMappings": config.get("fieldMappings") or {}');
    expect(result.code).toContain('"textTemplate": str(config.get("textTemplate", "") or "")');
  });

  it('streams progress logs for deterministic workflow code generation', async () => {
    const { service } = createService();
    const logs: string[] = [];

    const result = await service.generateWorkflowCodeStreaming(
      {
        name: '天气结构化工作流',
        workflowClassName: 'WeatherStructuredWorkflow',
        workflowDefnName: '天气结构化工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: {
          city: {
            required: true,
            description: '城市名',
          },
        },
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
      undefined,
      (log) => logs.push(log),
    );

    expect(result.success).toBe(true);
    expect(result.generationMode).toBe('deterministic');
    expect(logs.some((item) => item.includes('准备生成 Workflow 代码流'))).toBe(true);
    expect(logs.some((item) => item.includes('命中固定模板编译路径'))).toBe(true);
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
      },
    );

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('重组嵌套 JSON 的固定规则 JSON 转换存在嵌套 outputSchema，但未提供 fieldMappings。请显式提供 fieldMappings，或改用 builtin:aiStructuredTransform。');
  });

  it('forces AI generation when forceAiGeneration is enabled', async () => {
    const { service } = createService();

    jest.spyOn(service as any, 'precompileGeneratedPython').mockReturnValue({ success: true });
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
      true,
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
      {},
    );

    expect(result.success).toBe(true);
    expect(result.config?.contentTemplate).toBe('{content}');
    expect(result.config?.contentType).toBe('json');
  });

  it('prefers AI regeneration over deterministic generation when errorContext is provided', async () => {
    const { service } = createService();

    jest.spyOn(service as any, 'buildDeterministicWorkflowCode').mockReturnValue('DETERMINISTIC_CODE');
    jest.spyOn(service as any, 'precompileGeneratedPython').mockReturnValue({ success: true });
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
      'Compilation Error: invalid syntax (activity.py, line 1)',
    );

    expect(mockedAxios.post).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.code).not.toBe('DETERMINISTIC_CODE');
    expect(result.code).toContain('class RepairedWorkflow');
    expect(result.autoRetried).toBe(false);
    expect(result.attempts).toBe(1);
  });

  it('rejects AI-generated code that fails python precompile check', async () => {
    const { service } = createService();

    jest.spyOn(service as any, 'buildDeterministicWorkflowCode').mockReturnValue(null);
    jest.spyOn(service as any, 'precompileGeneratedPython').mockReturnValue({
      success: false,
      error: 'SyntaxError: invalid syntax (generated_workflow.py, line 1)',
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
      'Compilation Error: invalid syntax (activity.py, line 1)',
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('未通过 Python 编译预检查');
    expect(result.error).toContain('SyntaxError: invalid syntax');
    expect(result.autoRetried).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('retries once with compile feedback when first AI code fails precompile', async () => {
    const { service } = createService();

    jest.spyOn(service as any, 'buildDeterministicWorkflowCode').mockReturnValue(null);
    jest.spyOn(service as any, 'precompileGeneratedPython')
      .mockReturnValueOnce({
        success: false,
        error: 'SyntaxError: invalid syntax (generated_workflow.py, line 1)',
      })
      .mockReturnValueOnce({
        success: true,
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
      'Compilation Error: invalid syntax (activity.py, line 1)',
    );

    expect(result.success).toBe(true);
    expect(result.code).toContain('class RecoveredWorkflow');
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(result.autoRetried).toBe(true);
    expect(result.attempts).toBe(2);
    const secondPromptPayload = mockedAxios.post.mock.calls[1]?.[1] as any;
    expect(String(secondPromptPayload?.prompt || '')).toContain('未通过 Python 编译预检查');
    expect(String(secondPromptPayload?.prompt || '')).toContain('SyntaxError: invalid syntax');
  });

  it('injects explicit RetryPolicy namespace guidance into AI workflow prompt', async () => {
    const { service } = createService();

    jest.spyOn(service as any, 'buildDeterministicWorkflowCode').mockReturnValue(null);
    jest.spyOn(service as any, 'precompileGeneratedPython').mockReturnValue({ success: true });
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
      '执行错误: 需要重新生成',
    );

    const promptPayload = mockedAxios.post.mock.calls[0]?.[1] as any;
    expect(String(promptPayload?.prompt || '')).toContain('from temporalio.common import RetryPolicy');
    expect(String(promptPayload?.prompt || '')).toContain('严禁使用 `activity.RetryPolicy(...)`');
    expect(String(promptPayload?.prompt || '')).toContain('不要写 `if workflow.unsafe.is_replaying()`');
  });

  it('retries once when first AI code uses invalid activity.RetryPolicy namespace', async () => {
    const { service } = createService();

    jest.spyOn(service as any, 'buildDeterministicWorkflowCode').mockReturnValue(null);
    jest.spyOn(service as any, 'precompileGeneratedPython').mockReturnValue({ success: true });
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
      '执行错误: Compilation Error: module temporalio.activity has no attribute RetryPolicy',
    );

    expect(result.success).toBe(true);
    expect(result.autoRetried).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.code).not.toContain('activity.RetryPolicy');
    const secondPromptPayload = mockedAxios.post.mock.calls[1]?.[1] as any;
    expect(String(secondPromptPayload?.prompt || '')).toContain('违反 Temporal Python SDK 约束');
    expect(String(secondPromptPayload?.prompt || '')).toContain('activity.RetryPolicy');
  });

  it('retries once when first AI code uses workflow.unsafe', async () => {
    const { service } = createService();

    jest.spyOn(service as any, 'buildDeterministicWorkflowCode').mockReturnValue(null);
    jest.spyOn(service as any, 'precompileGeneratedPython').mockReturnValue({ success: true });
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
      '执行错误: Compilation Error: module temporalio.workflow has no attribute unsafe',
    );

    expect(result.success).toBe(true);
    expect(result.autoRetried).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.code).not.toContain('workflow.unsafe');
    const secondPromptPayload = mockedAxios.post.mock.calls[1]?.[1] as any;
    expect(String(secondPromptPayload?.prompt || '')).toContain('workflow.unsafe');
    expect(String(secondPromptPayload?.prompt || '')).toContain('违反 Temporal Python SDK 约束');
    expect(String(secondPromptPayload?.prompt || '')).toContain('删除所有 `workflow.unsafe`');
    expect(String(secondPromptPayload?.prompt || '')).toContain('不要为了“历史回放安全”手动判断 replay');
  });

  it('optimizes builtin httpRequest into bodyMap when AI returns multi-field mappings', async () => {
    const { service } = createService();

    jest.spyOn(service, 'previewHttpRequestConfig').mockResolvedValue({
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
    jest.spyOn(service as any, 'requestAiOptimizedHttpConfig').mockResolvedValue({
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
      '提取天气描述、气温和体感温度',
    );

    expect(result.success).toBe(true);
    expect(result.optimizedConfig).toEqual(expect.objectContaining({
      responseMode: 'bodyMap',
      responseBodyPath: '',
      responseFieldMappings: {
        weatherText: 'current_condition.0.lang_zh.0.value',
        temperatureC: 'current_condition.0.temp_C',
        feelsLikeC: 'current_condition.0.FeelsLikeC',
      },
    }));
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
    expect(draft.sourceContext).toEqual(expect.objectContaining({
      sourceType: 'text',
      userDescription: '创建一个天气查询工作流，输入城市名返回天气信息',
    }));
    expect(draft.workflowDsl.steps[0].activityRef).toBe('builtin:httpRequest');
    expect(draft.workflowDsl.sourceContext).toEqual(expect.objectContaining({
      sourceType: 'text',
    }));
    expect(draft.activityDsl.activities[0].fn).toBe('httpRequest');
    expect(draft.activityDsl.activities[0].handler).toBe('api');
    expect(mockedAxios.post).toHaveBeenCalled();
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
    const { service } = createService();

    const fixedResult = (service as any).normalizeAiDraftStepInput(
      {
        __structuredTransform: {
          outputMode: 'text',
          fieldMappings: {
            summary: 'summary',
            adviceText: 'adviceText',
          },
        },
      },
      'builtin:structuredTransform',
      '生成通知文本',
      '把结果格式化为纯文本消息',
      'builtin:httpRequest',
    );
    const aiResult = (service as any).normalizeAiDraftStepInput(
      {
        __structuredTransform: {},
      },
      'builtin:aiStructuredTransform',
      '生成摘要',
      '请输出结构化摘要',
      'builtin:httpRequest',
    );

    expect(fixedResult.__structuredTransform.textTemplate).toBe('Summary: {summary}\nAdvice Text: {adviceText}');
    expect(fixedResult.__structuredTransform.fieldMappings).toEqual({
      summary: 'summary',
      adviceText: 'adviceText',
    });
    expect(aiResult.__structuredTransform.outputMode).toBe('json');
    expect(aiResult.__structuredTransform.outputSchema).toEqual({
      summary: 'string',
    });
    expect(String(aiResult.__structuredTransform.instructionTemplate || '')).toContain('按 outputSchema 返回结构化 JSON');
    expect(String(aiResult.__structuredTransform.instructionTemplate || '')).toContain('summary');
  });

  it('infers default output schema fields from explicit field names in instructions', () => {
    const { service } = createService();

    const aiResult = (service as any).normalizeAiDraftStepInput(
      {
        __structuredTransform: {
          instructionTemplate: '输出字段: userName, userEmail, accountStatus',
        },
      },
      'builtin:aiStructuredTransform',
      '提取用户资料',
      '请从输入中提取用户资料，返回字段 userName、userEmail、accountStatus',
      'builtin:httpRequest',
    );

    expect(aiResult.__structuredTransform.outputMode).toBe('json');
    expect(aiResult.__structuredTransform.outputSchema).toEqual({
      userName: 'string',
      userEmail: 'string',
      accountStatus: 'string',
    });
    expect(String(aiResult.__structuredTransform.instructionTemplate || '')).toContain('userName');
    expect(String(aiResult.__structuredTransform.instructionTemplate || '')).toContain('accountStatus');
  });

  it('resolves httpRequest -> structuredTransform draft from preview sample before materialization', async () => {
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
    jest.spyOn(service, 'optimizeHttpRequestConfig').mockResolvedValue({
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
    jest.spyOn(service, 'generateStructuredTransformConfig').mockResolvedValue({
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

    expect(service.optimizeHttpRequestConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        urlTemplate: 'https://wttr.in/{city}',
      }),
      expect.objectContaining({
        city: 'sample_city',
      }),
      expect.stringContaining('ASCII'),
    );
    expect(service.generateStructuredTransformConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        weatherText: '晴',
        temperatureC: '24',
      }),
      expect.stringContaining('ASCII'),
      expect.any(Object),
    );
    expect((draft.workflowDsl.steps[0].input as any).__httpRequest.responseMode).toBe('bodyMap');
    expect((draft.workflowDsl.steps[1].input as any).__structuredTransform.textTemplate).toContain('Weather: {weatherText}');
    expect((draft.warnings || []).some((item) => item.includes('真实响应样本'))).toBe(true);
  });

  it('builds generic sample inputs instead of hardcoded domain values', () => {
    const { service } = createService();

    const callbackUrl = (service as any).buildGenericAiDraftSampleValue('callbackUrl', '回调地址', '');
    const pageSize = (service as any).buildGenericAiDraftSampleValue('pageSize', '分页大小', '');
    const enabled = (service as any).buildGenericAiDraftSampleValue('enabled', '是否启用', '');

    expect(callbackUrl).toBe('https://example.com/callbackurl');
    expect(pageSize).toBe(1);
    expect(enabled).toBe(true);
  });

  it('preserves template placeholders even before workflow input params are fully declared', () => {
    const { service } = createService();

    const normalizedHttpConfig = (service as any).normalizeHttpRequestConfig({
      urlTemplate: 'https://wttr.in/{city}',
      queryTemplate: {
        lang: '{lang}',
      },
    });
    const normalizedTransformConfig = (service as any).normalizeStructuredTransformConfig({
      textTemplate: '{city}今天天气如下：当前温度{celsius}℃',
      fieldMappings: {
        celsius: 'current.temp',
      },
    });

    expect(normalizedHttpConfig.urlTemplate).toBe('https://wttr.in/{city}');
    expect(normalizedHttpConfig.queryTemplate).toEqual({ lang: '{lang}' });
    expect(normalizedTransformConfig.textTemplate).toBe('{city}今天天气如下：当前温度{celsius}℃');
  });

  it('serializes object contextTemplate without destroying placeholders', () => {
    const { service } = createService();

    const normalizedTransformConfig = (service as any).normalizeStructuredTransformConfig({
      contextTemplate: {
        city: '{city}',
        meta: {
          format: '{format}',
        },
      },
    });

    expect(normalizedTransformConfig.contextTemplate).toBe('{"city":"{city}","meta":{"format":"{format}"}}');
  });

  it('auto-repairs common bodyMap and fixed text transform contract issues in AI draft plan', () => {
    const { aiDraftService } = createService();

    const repaired = (aiDraftService as any).repairCommonDraftPlanIssues({
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
              textTemplate: '城市：{nearest_area.0.areaName.0.value}\n温度：{current_condition.0.temp_C}°C\n请求城市：{city}',
            },
          },
        },
      ],
    });

    const transformConfig = repaired.steps[1].input.__structuredTransform;
    expect(transformConfig.textTemplate).toContain('{city}');
    expect(transformConfig.textTemplate).toContain('{temperature}');
    expect(transformConfig.textTemplate).not.toContain('{nearest_area.0.areaName.0.value}');
    expect(transformConfig.textTemplate).not.toContain('{current_condition.0.temp_C}');
    expect(transformConfig.fieldMappings).toEqual(expect.objectContaining({
      city: 'city',
      temperature: 'temperature',
    }));
    expect(repaired.warnings.join('\n')).toContain('fieldMappings');
  });

  it('auto-fills blank fieldMappings from bodyMap aliases during AI draft repair', () => {
    const { aiDraftService } = createService();

    const repaired = (aiDraftService as any).repairCommonDraftPlanIssues({
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
    });

    const transformConfig = repaired.steps[1].input.__structuredTransform;
    expect(transformConfig.fieldMappings).toEqual({
      city: 'city',
      temperature: 'temperature',
    });
    expect(repaired.warnings.join('\n')).toContain('空 fieldMapping');
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
      },
    );

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('整理天气结果 的 fieldMappings 存在空映射: city。空字符串会导致运行时把整块 content 回填到该字段，请显式填写来源路径、别名或删除这些字段。');
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
      await (aiDraftService as any).analyzeAiWorkflowDraft(
        '查询天气',
        '',
        '',
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
          parseJsonFromAiContent: (content: string) => JSON.parse(content),
        },
      );
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ timeout: 420000 }),
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
    const { service } = createService();

    const normalizedInputParams = (service as any).normalizeDraftInputParams(
      {
        lang: {
          description: '语言',
          defaultValue: 'zh',
        },
      },
      [
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
    );

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
        source: 'merged',
        type: 'string',
        exampleValue: 'sample_lang',
      },
    });
  });

  it('resolves httpRequest -> aiStructuredTransform -> structuredTransform sequentially from observed samples', async () => {
    const { service, prisma } = createService();

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
    jest.spyOn(service, 'optimizeHttpRequestConfig').mockResolvedValue({
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
    jest.spyOn(service as any, 'generateAiStructuredTransformDraftConfig').mockResolvedValue({
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
    jest.spyOn(service, 'generateStructuredTransformConfig').mockResolvedValue({
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

    expect(service.optimizeHttpRequestConfig).toHaveBeenCalledTimes(1);
    expect((service as any).generateAiStructuredTransformDraftConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        weatherText: '晴',
        temperatureC: '24',
        humidity: '70',
      }),
      expect.stringContaining('AI 归纳天气'),
      expect.any(Object),
    );
    expect(service.generateStructuredTransformConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: '晴，24C，湿度 70%',
        advice: '适合外出，可正常安排活动',
      }),
      expect.stringContaining('格式化最终天气文本'),
      expect.any(Object),
    );
    expect((draft.workflowDsl.steps[0].input as any).__httpRequest.responseMode).toBe('bodyMap');
    expect((draft.workflowDsl.steps[1].input as any).__structuredTransform.instructionTemplate).toContain('出行建议');
    expect((draft.workflowDsl.steps[2].input as any).__structuredTransform.textTemplate).toContain('Summary: {summary}');
    expect((draft.warnings || []).some((item) => item.includes('AI 转换配置'))).toBe(true);
  });

  it('repairs AI draft once when builtin structuredTransform config is incomplete', async () => {
    const { service, prisma } = createService();

    prisma.activity.findMany.mockResolvedValue([]);
    jest.spyOn(service, 'optimizeHttpRequestConfig').mockResolvedValue({
      success: false,
      error: 'skip optimize in repair test',
    });
    jest.spyOn(service, 'previewHttpRequestConfig').mockResolvedValue({
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
              { activityRef: 'builtin:structuredTransform', name: '结构化转换', timeout: '90s', config: {} },
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
                    instructionTemplate: '请根据输入天气结果整理为类似 wttr.in 风格的 ASCII 纯文本天气信息，只返回纯文本，不要 JSON。',
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
              { activityRef: 'builtin:structuredTransform', name: '结构化转换', timeout: '90s', config: {} },
            ],
          }),
        },
      } as any);

    const draft = await service.generateAiWorkflowDraft({
      description: '查询城市今天天气并格式化输出类似 wttr.in 风格的 ASCII 天气信息',
    });

    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(service.optimizeHttpRequestConfig).toHaveBeenCalled();
    expect(draft.workflowDsl.steps[1].activityRef).toBe('builtin:structuredTransform');
    expect((draft.workflowDsl.steps[1].input as any).__structuredTransform.outputMode).toBe('text');
  });

  it('injects repeated builtin step guidance into workflow code prompt', async () => {
    const { service } = createService();

    jest.spyOn(service as any, 'buildDeterministicWorkflowCode').mockReturnValue(null);
    jest.spyOn(service as any, 'precompileGeneratedPython').mockReturnValue({ success: true });
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
      { activities: [] },
    );

    const promptPayload = mockedAxios.post.mock.calls[0]?.[1] as any;
    expect(String(promptPayload?.prompt || '')).toContain('【已确认的内置步骤约束（请重复遵守）】');
    expect(String(promptPayload?.prompt || '')).toContain('这是 builtin:structuredTransform 步骤');
    expect(String(promptPayload?.prompt || '')).toContain('最终返回必须是纯文本');
  });

  it('creates persistent AI draft session and returns current draft/messages', async () => {
    const { service, prisma } = createService();
    const now = new Date('2025-05-03T10:00:00.000Z');

    prisma.activity.findMany.mockResolvedValue([]);
    prisma.chatSession.create.mockResolvedValue({
      id: 'session-1',
    });
    prisma.chatSession.findUnique.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      title: '天气草稿会话',
      modelId: 'temporal-workflow-draft',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: 'message-1',
          sessionId: 'session-1',
          role: 'user',
          content: '创建一个天气查询工作流',
          metadata: { kind: 'temporal_workflow_draft_prompt' },
          createdAt: now,
        },
        {
          id: 'message-2',
          sessionId: 'session-1',
          role: 'assistant',
          content: '已生成初始工作流草稿',
          metadata: {
            kind: 'temporal_workflow_draft_result',
            draft: {
              name: '天气查询工作流',
              description: '根据城市查询天气',
              taskQueue: 'SKILL_TASK_QUEUE',
              workflowDsl: {
                name: '天气查询工作流',
                taskQueue: 'SKILL_TASK_QUEUE',
                steps: [
                  {
                    id: 'step_1',
                    name: '查询天气接口',
                    type: 'activity',
                    activityRef: 'builtin:httpRequest',
                    activityName: 'HTTP 请求',
                  },
                ],
              },
              activityDsl: {
                activities: [
                  {
                    name: 'HTTP 请求',
                    fn: 'httpRequest',
                    timeout: '30s',
                    handler: 'api',
                    config: {},
                  },
                ],
              },
              warnings: [],
            },
          },
          createdAt: now,
        },
      ],
    });
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

    const session = await service.createAiDraftSession({
      title: '天气草稿会话',
      description: '创建一个天气查询工作流',
    }, 'user-1');

    expect(prisma.chatSession.create).toHaveBeenCalled();
    expect(session.sessionId).toBe('session-1');
    expect(session.currentDraft?.name).toBe('天气查询工作流');
    expect(session.messages).toHaveLength(2);
  });

  it('refines persistent AI draft session using last assistant draft', async () => {
    const { service, prisma } = createService();
    const now = new Date('2025-05-03T10:00:00.000Z');

    const initialSession = {
      id: 'session-2',
      userId: 'user-1',
      title: '天气草稿会话',
      modelId: 'temporal-workflow-draft',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: 'message-1',
          sessionId: 'session-2',
          role: 'assistant',
          content: '已生成初始工作流草稿',
          metadata: {
            kind: 'temporal_workflow_draft_result',
            draft: {
              name: '天气查询工作流',
              description: '根据城市查询天气',
              taskQueue: 'SKILL_TASK_QUEUE',
              workflowDsl: {
                name: '天气查询工作流',
                taskQueue: 'SKILL_TASK_QUEUE',
                steps: [
                  {
                    id: 'step_1',
                    name: '查询天气接口',
                    type: 'activity',
                    activityRef: 'builtin:httpRequest',
                    activityName: 'HTTP 请求',
                  },
                ],
              },
              activityDsl: {
                activities: [
                  {
                    name: 'HTTP 请求',
                    fn: 'httpRequest',
                    timeout: '30s',
                    handler: 'api',
                    config: {},
                  },
                ],
              },
              warnings: [],
            },
          },
          createdAt: now,
        },
      ],
    };
    prisma.chatSession.findUnique.mockResolvedValue(initialSession);
    prisma.chatSession.update.mockResolvedValue({ id: 'session-2' });
    jest.spyOn(service, 'refineAiWorkflowDraft').mockResolvedValue({
      name: '天气查询工作流',
      description: '根据城市查询天气并返回结构化结果',
      taskQueue: 'SKILL_TASK_QUEUE',
      workflowDsl: {
        name: '天气查询工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        outputParams: {
          result: {
            description: '结构化天气结果',
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
          },
        ],
      },
      activityDsl: {
        activities: [
          {
            name: 'HTTP 请求',
            fn: 'httpRequest',
            timeout: '30s',
            handler: 'api',
            config: {},
          },
        ],
      },
      warnings: [],
    });
    prisma.chatSession.findUnique
      .mockResolvedValueOnce(initialSession)
      .mockResolvedValueOnce({
        id: 'session-2',
        userId: 'user-1',
        title: '天气草稿会话',
        modelId: 'temporal-workflow-draft',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        messages: [
          {
            id: 'message-1',
            sessionId: 'session-2',
            role: 'assistant',
            content: '已生成初始工作流草稿',
            metadata: { kind: 'temporal_workflow_draft_result', draft: { name: '天气查询工作流', description: '根据城市查询天气', taskQueue: 'SKILL_TASK_QUEUE', workflowDsl: { name: '天气查询工作流', taskQueue: 'SKILL_TASK_QUEUE', steps: [{ id: 'step_1', name: '查询天气接口', type: 'activity', activityRef: 'builtin:httpRequest', activityName: 'HTTP 请求' }] }, activityDsl: { activities: [{ name: 'HTTP 请求', fn: 'httpRequest', timeout: '30s', handler: 'api', config: {} }] }, warnings: [] } },
            createdAt: now,
          },
          {
            id: 'message-2',
            sessionId: 'session-2',
            role: 'user',
            content: '请增加结构化输出字段',
            metadata: { kind: 'temporal_workflow_draft_refine_prompt' },
            createdAt: now,
          },
          {
            id: 'message-3',
            sessionId: 'session-2',
            role: 'assistant',
            content: '已更新工作流草稿',
            metadata: {
              kind: 'temporal_workflow_draft_result',
              draft: {
                name: '天气查询工作流',
                description: '根据城市查询天气并返回结构化结果',
                taskQueue: 'SKILL_TASK_QUEUE',
                workflowDsl: {
                  name: '天气查询工作流',
                  taskQueue: 'SKILL_TASK_QUEUE',
                  outputParams: {
                    result: {
                      description: '结构化天气结果',
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
                    },
                  ],
                },
                activityDsl: {
                  activities: [
                    {
                      name: 'HTTP 请求',
                      fn: 'httpRequest',
                      timeout: '30s',
                      handler: 'api',
                      config: {},
                    },
                  ],
                },
                warnings: [],
              },
            },
            createdAt: now,
          },
        ],
      });

    const session = await service.refineAiDraftSession({
      sessionId: 'session-2',
      userPrompt: '请增加结构化输出字段',
    }, 'user-1');

    expect(prisma.chatSession.update).toHaveBeenCalled();
    expect(session.currentDraft?.description).toContain('结构化结果');
    expect(session.messages).toHaveLength(3);
  });

  it('lists persistent AI draft sessions with draft summary', async () => {
    const { service, prisma } = createService();
    const now = new Date('2025-05-03T10:00:00.000Z');

    prisma.chatSession.findMany.mockResolvedValue([
      {
        id: 'session-3',
        userId: 'user-1',
        title: '天气草稿会话',
        modelId: 'temporal-workflow-draft',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        messages: [
          {
            id: 'message-1',
            sessionId: 'session-3',
            role: 'assistant',
            content: '已生成初始工作流草稿',
            metadata: {
              kind: 'temporal_workflow_draft_result',
              draft: {
                name: '天气查询工作流',
                description: '根据城市查询天气',
                taskQueue: 'SKILL_TASK_QUEUE',
                workflowDsl: {
                  name: '天气查询工作流',
                  taskQueue: 'SKILL_TASK_QUEUE',
                  steps: [],
                },
                activityDsl: { activities: [] },
                warnings: [],
              },
            },
            createdAt: now,
          },
        ],
      },
    ]);

    const sessions = await service.listAiDraftSessions('user-1');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual(expect.objectContaining({
      sessionId: 'session-3',
      currentDraftName: '天气查询工作流',
      currentDraftDescription: '根据城市查询天气',
      messageCount: 1,
    }));
  });
});
