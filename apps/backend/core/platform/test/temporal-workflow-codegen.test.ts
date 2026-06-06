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

describe('TemporalWorkflowCodegenService', () => {
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

  it('generates deterministic browser phase workflow code that reuses runtime session across activities', async () => {
    const { service } = createService();

    const result = await service.generateWorkflowCode(
      {
        name: 'browser_recording_打开百度_搜索mcp',
        workflowClassName: 'BrowserBaiduSearchWorkflow',
        workflowDefnName: 'browser_recording_打开百度_搜索mcp',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: {
          keyword: {
            required: true,
            defaultValue: '',
            description: '搜索关键字',
            type: 'string',
          },
        },
        steps: [
          {
            id: 'step_1',
            name: '1. 页面打开',
            type: 'activity',
            activityRef: 'custom:browserTemplateRun000001_01',
            activityName: '1. 页面打开',
            startToCloseTimeout: '60s',
          },
          {
            id: 'step_2',
            name: '2. 页面处理',
            type: 'activity',
            activityRef: 'custom:browserTemplateRun000001_02',
            activityName: '2. 页面处理',
            startToCloseTimeout: '90s',
          },
        ],
      } as any,
      {
        activities: [
          {
            name: '1. 页面打开',
            fn: 'browserTemplateRun000001_01',
            timeout: '60s',
            handler: 'browser',
            config: {
              steps: [
                { name: '1. 访问页面', type: 'browser', timeout: '30s', config: { action: 'goto', url: 'https://www.baidu.com' } },
                { name: '2. 截图', type: 'browser', timeout: '30s', config: { action: 'screenshot' } },
              ],
              sessionLifecycle: {
                initializeSession: true,
                cleanupSession: false,
              },
            },
          },
          {
            name: '2. 页面处理',
            fn: 'browserTemplateRun000001_02',
            timeout: '90s',
            handler: 'browser',
            config: {
              steps: [
                { name: '2. 输入关键字', type: 'browser', timeout: '30s', config: { action: 'fill', selector: '#kw', value: '{keyword}' } },
                { name: '3. 键盘按键', type: 'browser', timeout: '30s', config: { action: 'press', selector: '#kw', value: 'Enter' } },
              ],
              sessionLifecycle: {
                initializeSession: false,
                cleanupSession: true,
              },
            },
          },
        ],
      } as any,
    );

    expect(result.code).toContain('/browser/init');
    expect(result.code).toContain('/browser/execute');
    expect(result.code).toContain('initialize_session = True');
    expect(result.code).toContain('initialize_session = False');
    expect(result.code).toContain('cleanup_session = False');
    expect(result.code).toContain('cleanup_session = True');
    expect(result.code).toContain('"tool": "navigate"');
    expect(result.code).toContain('if action in ("fill", "type", "type_text"):');
    expect(result.code).toContain('"tool": "press_key"');
    expect(result.code).toContain('缺少必需参数');
    expect(result.code).toContain('first_failed_command=');
    expect(result.code).toContain('shared_activity_input["runtimeSessionId"] = runtime_session_id');
    expect(result.code).not.toContain('workflow.info()');
    expect(result.code).toContain('artifact_refs = []');
    expect(result.code).toContain('snapshot = item.get("snapshot")');
    expect(result.code).toContain('artifact_path = data.get("path") or data.get("screenshotPath")');
    expect(result.code).toContain('"artifacts": artifact_refs');
    expect(result.code).toContain('phase_results.append({');
    expect(result.code).toContain('"includeSteps": True');
    expect(result.code).toContain('requires_takeover = _should_require_takeover');
    expect(result.code).toContain('preserve_session = False');
    expect(result.code).toContain('if requires_takeover:');
    expect(result.code).toContain('preserve_session = True');
    expect(result.code).toContain('if cleanup_session and not preserve_session:');
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

  it('generates deterministic code for custom carbone activity with step timeout override', async () => {
    const { service } = createService();

    const result = await service.generateWorkflowCode(
      {
        name: '合同渲染工作流',
        workflowClassName: 'ContractRenderWorkflow',
        workflowDefnName: '合同渲染工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: {
          customerName: {
            required: true,
            description: '客户名称',
          },
        },
        steps: [
          {
            id: 'step_1',
            name: '渲染合同',
            type: 'activity',
            activityRef: 'custom:contract-render',
            activityName: '合同渲染 Activity',
            startToCloseTimeout: '4m',
          },
        ],
      } as any,
      {
        activities: [
          {
            id: 'contract-render',
            activityRef: 'custom:contract-render',
            name: '合同渲染 Activity',
            fn: 'contractRenderActivity',
            timeout: '2m',
            handler: 'carbone',
            config: {
              templateId: 'tpl-contract',
              steps: [
                {
                  type: 'carbone',
                  inputParams: [
                    { key: 'customerName', value: '', required: true },
                  ],
                  config: {
                    templateId: 'tpl-contract',
                    format: 'docx',
                    outputName: '合同文件',
                  },
                },
              ],
            },
          },
        ],
      } as any,
    );

    expect(result.success).toBe(true);
    expect(result.code).toContain('"requestTimeoutSeconds": 240,');
    expect(result.code).toContain('request_timeout_seconds = input_data.get("requestTimeoutSeconds")');
    expect(result.code).toContain('default_request_timeout_seconds = 120');
    expect(result.code).toContain('resolved_request_timeout_seconds = float(request_timeout_seconds)');
    expect(result.code).toContain('timeout=resolved_request_timeout_seconds');
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
      (log: string) => logs.push(log),
    );

    expect(result.success).toBe(true);
    expect(result.generationMode).toBe('deterministic');
    expect(logs.some((item) => item.includes('准备生成 Workflow 代码流'))).toBe(true);
    expect(logs.some((item) => item.includes('命中固定模板编译路径'))).toBe(true);
  });

});
