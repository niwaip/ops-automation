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
  inferWorkflowInputParamType,
  normalizeAiDraftStepInput,
  normalizeDraftInputParams,
} from '../src/modules/temporal-workflow/temporal-workflow-draft.normalizers';
import { repairCommonDraftPlanIssues } from '../src/modules/temporal-workflow/temporal-workflow-draft-plan.helpers';
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
import { TemporalWorkflowDslValidationService } from '../src/workflow-registry/validation/temporal-workflow-dsl-validation.service';
import { TemporalWorkflowCodegenOrchestrationService } from '../src/workflow-registry/codegen/temporal-workflow-codegen-orchestration.service';
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
      workflowArtifactService
    );
    const workflowDslValidationService = new TemporalWorkflowDslValidationService(
      workflowSupportService
    );
    const workflowCodegenOrchestrationService = new TemporalWorkflowCodegenOrchestrationService(
      prisma as any,
      codegenService,
      workflowArtifactService,
      workflowSupportService
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
      activityCodegenService,
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
                {
                  name: '1. 访问页面',
                  type: 'browser',
                  timeout: '30s',
                  config: { action: 'goto', url: 'https://www.baidu.com' },
                },
                {
                  name: '2. 截图',
                  type: 'browser',
                  timeout: '30s',
                  config: { action: 'screenshot' },
                },
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
                {
                  name: '2. 输入关键字',
                  type: 'browser',
                  timeout: '30s',
                  config: { action: 'fill', selector: '#kw', value: '{keyword}' },
                },
                {
                  name: '3. 键盘按键',
                  type: 'browser',
                  timeout: '30s',
                  config: { action: 'press', selector: '#kw', value: 'Enter' },
                },
              ],
              sessionLifecycle: {
                initializeSession: false,
                cleanupSession: true,
              },
            },
          },
        ],
      } as any
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
    expect(result.code).toContain('phase_entry = {');
    expect(result.code).toContain('phase_results.append(phase_entry)');
    expect(result.code).toContain('"includeSteps": True');
    expect(result.code).toContain('requires_takeover = _should_require_takeover');
    expect(result.code).toContain('preserve_session = False');
    expect(result.code).toContain('if requires_takeover:');
    expect(result.code).toContain('preserve_session = True');
    expect(result.code).toContain('if cleanup_session and not preserve_session:');
  });

  it('generates deterministic browser loop workflow skeleton when loop draft metadata is present', async () => {
    const { service } = createService();

    const result = await service.generateWorkflowCode(
      {
        name: '循环审批工作流',
        workflowClassName: 'BrowserLoopApprovalWorkflow',
        workflowDefnName: '循环审批工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        sourceContext: {
          sourceType: 'browser_template',
          browserLoopDraft: {
            mode: 'repeat_until',
            maxIterations: 20,
            eachIteration: {
              stepIds: ['step_2', 'step_3'],
            },
            stopWhen: {
              conditionFn: '!String(value || "").includes("保留中")',
            },
          },
        },
        steps: [
          {
            id: 'step_1',
            name: '1. 页面打开',
            type: 'activity',
            activityRef: 'custom:browserTemplateRunLoop_01',
            activityName: '1. 页面打开',
            startToCloseTimeout: '60s',
          },
          {
            id: 'step_2',
            name: '2. 页面处理',
            type: 'activity',
            activityRef: 'custom:browserTemplateRunLoop_02',
            activityName: '2. 页面处理',
            startToCloseTimeout: '60s',
          },
        ],
      } as any,
      {
        activities: [
          {
            name: '1. 页面打开',
            fn: 'browserTemplateRunLoop_01',
            timeout: '60s',
            handler: 'browser',
            config: {
              loopSegment: 'pre_loop',
              steps: [
                {
                  name: '1. 打开页面',
                  type: 'browser',
                  timeout: '30s',
                  config: { action: 'goto', url: 'https://example.com/list', templateStepId: 'step_1' },
                },
              ],
              sessionLifecycle: {
                initializeSession: true,
                cleanupSession: false,
              },
            },
          },
          {
            name: '2. 页面处理',
            fn: 'browserTemplateRunLoop_02',
            timeout: '60s',
            handler: 'browser',
            config: {
              loopSegment: 'iteration',
              loopTemplate: true,
              steps: [
                {
                  name: '2. 读取状态',
                  type: 'browser',
                  timeout: '30s',
                  config: {
                    action: 'get_text',
                    originalAction: 'read_value',
                    selector: '[data-testid="status-value"]',
                    templateStepId: 'step_2',
                    outputVar: 'rowStatus',
                  },
                },
                {
                  name: '3. 条件判断',
                  type: 'browser',
                  timeout: '30s',
                  config: {
                    action: 'branch',
                    templateStepId: 'step_3',
                    branch: {
                      condition_fn: '!String(value || "").includes("保留中")',
                      on_match: 'stop',
                      on_mismatch: 'continue',
                    },
                  },
                },
              ],
              sessionLifecycle: {
                initializeSession: false,
                cleanupSession: true,
              },
            },
          },
        ],
      } as any
    );

    expect(result.success).toBe(true);
    expect(result.code).toContain('BROWSER_LOOP_DRAFT = {"mode":"repeat_until"');
    expect(result.code).toContain('while current_iteration <= max_iterations:');
    expect(result.code).toContain('iteration_phase_results = phase_results[iteration_start_index:]');
    expect(result.code).toContain('last_loop_value = self._extract_loop_value(iteration_phase_results)');
    expect(result.code).toContain('should_stop = self._evaluate_loop_stop(loop_stop_condition, last_loop_value)');
    expect(result.code).toContain('"loopState": loop_state');
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
      }
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
                  inputParams: [{ key: 'customerName', value: '', required: true }],
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
      } as any
    );

    expect(result.success).toBe(true);
    expect(result.code).toContain('"requestTimeoutSeconds": 240,');
    expect(result.code).toContain(
      'request_timeout_seconds = input_data.get("requestTimeoutSeconds")'
    );
    expect(result.code).toContain('default_request_timeout_seconds = 120');
    expect(result.code).toContain(
      'resolved_request_timeout_seconds = float(request_timeout_seconds)'
    );
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
      }
    );

    expect(result.success).toBe(true);
    expect(result.code).toContain('"responseMode": "bodyMap"');
    expect(result.code).toContain('"responseFieldMappings": {');
    expect(result.code).toContain('"weatherText": "current_condition.0.lang_zh.0.value"');
    expect(result.code).toContain('if response_mode == "bodyMap":');
    expect(result.code).toContain(
      'return {str(key): cls._extract_path(body, str(path)) for key, path in mappings.items()}'
    );
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
      }
    );

    expect(result.success).toBe(true);
    expect(result.code).toContain('STRUCTURED_TRANSFORM_CONFIG');
    expect(result.code).toContain('"contentType": "html"');
    expect(result.code).toContain('"instructionTemplate": "提取标题和摘要，返回 JSON"');
    expect(result.code).toContain('"outputMode": "json"');
    expect(result.code).toContain(
      'normalized_result = result.get("result") if isinstance(result, dict) and "result" in result else result'
    );
    expect(result.code).toContain('return self._build_workflow_result(normalized_result)');
    expect(result.code).toContain('"resultType": "generic"');
    expect(result.code).toContain('"summaryFormat": "plain_text"');
    expect(result.code).toContain('"detailFormat": "plain_text"');
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
      }
    );

    expect(result.success).toBe(true);
    expect(result.generationMode).toBe('deterministic');
    expect(result.code).toContain('HTTP_REQUEST_CONFIG');
    expect(result.code).toContain('STRUCTURED_TRANSFORM_CONFIG');
    expect(result.code).toContain('"contentTemplate": "{content}"');
    expect(result.code).toContain('"httpResult": http_result');
    expect(result.code).toContain(
      'http_result = self._normalize_http_result(http_result_raw, normalized_params)'
    );
    expect(result.code).toContain('transform_result = await workflow.execute_activity(');
    expect(result.code).toContain('固定规则结构化转换配置摘要');
    expect(result.code).toContain('"fieldMappings": {');
    expect(result.code).toContain('"fieldMappings": config.get("fieldMappings") or {}');
    expect(result.code).toContain('"textTemplate": str(config.get("textTemplate", "") or "")');
  });

  it('generates compiler-sealed Result Builder from v2Output identity fields (single step)', async () => {
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
            input: {
              __httpRequest: {
                method: 'GET',
                urlTemplate: 'https://api.weather.example.com/current',
                queryTemplate: {
                  city: '{city}',
                },
                responseMode: 'body',
                timeout: 20,
              },
            },
          },
        ],
        v2Output: {
          fields: {
            temp: {
              type: 'number',
              required: true,
              source: { step: 'step_1', path: '$.temperature' },
            },
          },
        },
      },
      {
        activities: [],
      }
    );

    expect(result.success).toBe(true);
    // v2 Result Builder: per-field extraction from the declared source step + JSON path
    expect(result.code).toContain(
      'def _build_workflow_result(cls, step_results: Dict[str, Any]) -> Dict[str, Any]:'
    );
    expect(result.code).toContain(
      '"temp": cls._extract_v2_path(step_results.get("step_1"), "$.temperature"),'
    );
    expect(result.code).toContain(
      'cls._assert_required_path(step_results.get("step_1"), "$.temperature", "temp")'
    );
    expect(result.code).toContain('"businessData": business_data,');
    expect(result.code).not.toContain('"businessData": raw_result,');
    // call site passes the step result dict instead of the raw passthrough
    expect(result.code).toContain(
      'return self._build_workflow_result({\n            "step_1": normalized_result,\n        })'
    );
    // legacy envelope raw_result unwrap is gone
    expect(result.code).not.toContain('business_data = raw_result');
  });

  it('applies length expression in compiler-sealed Result Builder', async () => {
    const { service } = createService();

    const result = await service.generateWorkflowCode(
      {
        name: '搜索统计工作流',
        workflowClassName: 'SearchStatsWorkflow',
        workflowDefnName: '搜索统计工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        steps: [
          {
            id: 'step_search',
            name: '执行搜索',
            type: 'activity',
            activityRef: 'builtin:httpRequest',
            activityName: 'httpRequest',
            input: {
              __httpRequest: {
                method: 'GET',
                urlTemplate: 'https://api.example.com/search',
                responseMode: 'body',
              },
            },
          },
        ],
        v2Output: {
          fields: {
            totalResults: {
              type: 'integer',
              required: true,
              source: {
                expression: {
                  kind: 'length',
                  source: { step: 'step_search', path: '$.results' },
                },
              },
            },
          },
        },
      },
      {
        activities: [],
      }
    );

    expect(result.success).toBe(true);
    expect(result.code).toContain(
      '"totalResults": len(cls._extract_v2_path(step_results.get("step_search"), "$.results") or []),'
    );
    expect(result.code).toContain(
      'cls._assert_required_path(step_results.get("step_search"), "$.results", "totalResults")'
    );
    // expression.source takes precedence over field.source
    expect(result.code).toContain('"step_search": normalized_result,');
  });

  it('generates runtime pre-execution assertions for required v2Output fields (§8.3)', async () => {
    const { service } = createService();

    const result = await service.generateWorkflowCode(
      {
        name: '字段守护工作流',
        workflowClassName: 'FieldGuardWorkflow',
        workflowDefnName: '字段守护工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        steps: [
          {
            id: 'step_1',
            name: '读取文件',
            type: 'activity',
            activityRef: 'builtin:fileRead',
            activityName: 'fileRead',
            input: {
              __fileRead: {
                path: '/tmp/a.txt',
              },
            },
          },
        ],
        v2Output: {
          fields: {
            content: {
              type: 'string',
              required: true,
              source: { step: 'step_1', path: '$.content' },
            },
          },
        },
      },
      {
        activities: [],
      }
    );

    expect(result.success).toBe(true);
    // 运行前断言：必填路径缺失 → ApplicationError（非重试），仍由编译器生成
    expect(result.code).toContain(
      'raise ApplicationError(f"缺少必填输出字段 \'{field_name}\'（路径 {path}）", non_retryable=True)'
    );
    expect(result.code).toContain(
      'cls._assert_required_path(step_results.get("step_1"), "$.content", "content")'
    );
  });

  it('fails closed at compile time on unresolvable v2Output fields (unknown source step §8.2 rule 3)', async () => {
    const { service } = createService();

    const result = await service.generateWorkflowCode(
      {
        name: '字段守护工作流',
        workflowClassName: 'FieldGuardWorkflow',
        workflowDefnName: '字段守护工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        steps: [
          {
            id: 'step_1',
            name: '读取文件',
            type: 'activity',
            activityRef: 'builtin:fileRead',
            activityName: 'fileRead',
            input: {
              __fileRead: {
                path: '/tmp/a.txt',
              },
            },
          },
        ],
        v2Output: {
          fields: {
            content: {
              type: 'string',
              required: true,
              source: { step: 'step_1', path: '$.content' },
            },
            mystery: {
              type: 'string',
              source: { step: 'step_404', path: '$.x' },
            },
          },
        },
      },
      {
        activities: [],
      }
    );

    // 未知 source step → 编译失败，不产出任何代码（无运行时 _missing_output_field 兜底）
    expect(result.success).toBe(false);
    expect(result.code).toBeUndefined();
    expect(result.error).toContain('mystery');
    expect(result.error).toContain('step_404');
  });

  it('compiles string_format expressions as str(extract) (§8.1)', async () => {
    const { service } = createService();

    const result = await service.generateWorkflowCode(
      {
        name: '字符串格式化工作流',
        workflowClassName: 'StringFormatWorkflow',
        workflowDefnName: '字符串格式化工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        steps: [
          {
            id: 'step_1',
            name: '读取文件',
            type: 'activity',
            activityRef: 'builtin:fileRead',
            activityName: 'fileRead',
            input: {
              __fileRead: {
                path: '/tmp/a.txt',
              },
            },
          },
        ],
        v2Output: {
          fields: {
            rawText: {
              type: 'string',
              source: {
                expression: { kind: 'string_format', source: { step: 'step_1', path: '$.content' } },
              },
            },
          },
        },
      },
      {
        activities: [],
      }
    );

    expect(result.success).toBe(true);
    expect(result.code).toContain(
      '"rawText": str(cls._extract_v2_path(step_results.get("step_1"), "$.content")),'
    );
  });

  describe('normalizeV2Output (§8.2 — expression.source precedence + schemaRef)', () => {
    const dsl = (fields: Record<string, any>) => ({
      name: '表达式来源工作流',
      taskQueue: 'SKILL_TASK_QUEUE',
      steps: [
        {
          id: 'step_1',
          name: '读取文件',
          type: 'activity' as const,
          activityRef: 'builtin:fileRead',
          activityName: 'fileRead',
          input: { __fileRead: { path: '/tmp/a.txt' } },
        },
      ],
      v2Output: { fields },
    });

    it('accepts expression-only source and normalizes its path', async () => {
      const { workflowNormalizationService } = createService();
      const result = await workflowNormalizationService.normalizeWorkflowDsl(
        dsl({
          count: {
            type: 'integer',
            required: true,
            source: {
              expression: { kind: 'length', source: { step: 'step_1', path: 'results' } },
            },
          },
        })
      );
      expect(result.v2Output?.fields?.count).toMatchObject({
        source: {
          expression: { kind: 'length', source: { step: 'step_1', path: '$.results' } },
        },
      });
    });

    it('rejects expression-only source with unknown step (§8.2 rule 3)', async () => {
      const { workflowNormalizationService } = createService();
      await expect(
        workflowNormalizationService.normalizeWorkflowDsl(
          dsl({
            count: {
              type: 'integer',
              source: { expression: { kind: 'length', source: { step: 'step_404', path: '$.x' } } },
            },
          })
        )
      ).rejects.toMatchObject({
        response: expect.objectContaining({ message: expect.stringContaining('step_404') }),
      });
    });

    it('rejects non-string schemaRef', async () => {
      const { workflowNormalizationService } = createService();
      await expect(
        workflowNormalizationService.normalizeWorkflowDsl({
          ...dsl({
            count: { type: 'integer', source: { step: 'step_1', path: '$.x' } },
          }),
          v2Output: {
            schemaRef: 42 as unknown as string, // 运行时防御：类型不允许但非法数据可能来自外部
            fields: { count: { type: 'integer', source: { step: 'step_1', path: '$.x' } } },
          },
        })
      ).rejects.toMatchObject({
        response: expect.objectContaining({ message: expect.stringContaining('schemaRef') }),
      });
    });
  });

  it('extracts v2Output fields from multiple source steps (http -> transform pipeline)', async () => {
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
        v2Output: {
          fields: {
            weatherText: {
              type: 'string',
              required: true,
              source: { step: 'step_transform', path: '$.weatherText' },
            },
            rawTemperature: {
              type: 'string',
              source: { step: 'step_http', path: '$.temperatureC' },
            },
          },
        },
      },
      {
        activities: [],
      }
    );

    expect(result.success).toBe(true);
    // 两个源步骤都被提取到同一 business_data
    expect(result.code).toContain(
      '"weatherText": cls._extract_v2_path(step_results.get("step_transform"), "$.weatherText"),'
    );
    expect(result.code).toContain(
      '"rawTemperature": cls._extract_v2_path(step_results.get("step_http"), "$.temperatureC"),'
    );
    // 调用点把两个步骤的结果变量一并传入 Result Builder
    expect(result.code).toContain(
      'return self._build_workflow_result({\n            "step_http": http_result,\n            "step_transform": normalized_result,\n        })'
    );
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
      (log: string) => logs.push(log)
    );

    expect(result.success).toBe(true);
    expect(result.generationMode).toBe('deterministic');
    expect(logs.some((item) => item.includes('准备生成 Workflow 代码流'))).toBe(true);
    expect(logs.some((item) => item.includes('命中固定模板编译路径'))).toBe(true);
  });

  it('includes WorkflowResultEnvelope output contract in AI codegen prompt', () => {
    const { codegenService } = createService();

    const prompt = (codegenService as any).buildWorkflowCodePrompt(
      {
        name: 'AI 输出测试工作流',
        workflowClassName: 'AiOutputWorkflow',
        workflowDefnName: 'AI 输出测试工作流',
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
      {
        activities: [],
      },
      undefined
    );

    expect(prompt).toContain('WorkflowResultEnvelope');
    expect(prompt).toContain(
      '最终返回值至少包含 `execution`、`trigger`、`result`、`artifacts`、`presentation` 五个顶层字段'
    );
    expect(prompt).toContain(
      'presentation.preferAiSummary`、`presentation.preferStructuredView`、`presentation.summaryFormat`、`presentation.detailFormat`'
    );
    expect(prompt).toContain(
      '请在 Workflow 类中实现 `_extract_summary()`、`_extract_detail_text()`、`_collect_artifacts()`、`_build_workflow_result()`'
    );
  });

  it('includes enum no-revalidation rule in AI codegen prompt', () => {
    const { codegenService } = createService();

    const prompt = (codegenService as any).buildWorkflowCodePrompt(
      {
        name: 'enum 参数工作流',
        workflowClassName: 'EnumWorkflow',
        workflowDefnName: 'enum 参数工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: {
          topic: {
            required: false,
            defaultValue: 'general',
            description: '搜索分类',
            enum: ['general', 'news', 'finance'],
          },
        },
        steps: [],
      },
      { activities: [] },
      undefined
    );

    expect(prompt).toContain('enum 参数禁止二次校验');
    expect(prompt).toContain('topic');
    expect(prompt).toContain('general');
  });

  it('strips forbidden enum whitelist check (two-line form) from generated Python code', () => {
    const { codegenService } = createService();

    const before = [
      'async def run(self, params: dict):',
      '    topic = params.get("topic", "general")',
      "    if topic not in ['general', 'news', 'finance']:",
      "        raise ApplicationError(\"topic 必须是 ['general', 'news', 'finance'] 之一，当前值: \" + str(topic), non_retryable=True)",
      '    return self._build_workflow_result(topic)',
      '',
    ].join('\n');

    const { code, stripped } = (codegenService as any).stripForbiddenEnumChecks(before);

    expect(stripped).toBe(true);
    expect(code).not.toContain('必须是');
    expect(code).not.toContain('ApplicationError');
    expect(code).toContain('topic = params.get("topic", "general")');
    expect(code).toContain('return self._build_workflow_result(topic)');
  });

  it('strips forbidden enum whitelist check (one-line form) from generated Python code', () => {
    const { codegenService } = createService();

    const before = [
      'async def run(self, params: dict):',
      '    topic = params.get("topic", "general")',
      "    if topic not in ['general', 'news', 'finance']: raise ApplicationError(\"topic 必须是 ['general', 'news', 'finance'] 之一\", non_retryable=True)",
      '    return self._build_workflow_result(topic)',
      '',
    ].join('\n');

    const { code, stripped } = (codegenService as any).stripForbiddenEnumChecks(before);

    expect(stripped).toBe(true);
    expect(code).not.toContain('必须是');
    expect(code).not.toContain('ApplicationError');
  });

  it('does not strip HTTP status code check that happens to use `not in`', () => {
    const { codegenService } = createService();

    const before = [
      'async def run(self, params: dict):',
      '    status = resp.status_code',
      '    if status not in [200, 201, 204]:',
      '        raise ApplicationError(f"HTTP {status} 请求失败", non_retryable=True)',
      '    return self._build_workflow_result(status)',
      '',
    ].join('\n');

    const { code, stripped } = (codegenService as any).stripForbiddenEnumChecks(before);

    expect(stripped).toBe(false);
    expect(code).toContain('if status not in [200, 201, 204]');
    expect(code).toContain('raise ApplicationError');
  });

  it('detects missing WorkflowResultEnvelope fields in generated code', () => {
    const { codegenService } = createService();

    const invalidCheck = (codegenService as any).validateGeneratedWorkflowOutputContract(`
from temporalio import workflow

@workflow.defn(name="BadWorkflow")
class BadWorkflow:
    async def run(self, params: dict):
        return {"summary": "done"}
`);
    expect(invalidCheck.success).toBe(false);
    expect(invalidCheck.error).toContain('execution');

    const validCheck = (codegenService as any).validateGeneratedWorkflowOutputContract(`
from temporalio import workflow

@workflow.defn(name="GoodWorkflow")
class GoodWorkflow:
    def _build_workflow_result(self, raw_result):
        return {
            "execution": {"status": "success"},
            "trigger": {"type": "manual"},
            "result": {"resultType": "generic", "title": "ok", "summary": "ok", "businessData": raw_result},
            "artifacts": [],
            "presentation": {"preferAiSummary": True, "preferStructuredView": False, "summaryFormat": "plain_text", "detailFormat": "plain_text", "detailText": "ok"},
        }

    async def run(self, params: dict):
        return self._build_workflow_result({"value": 1})
`);
    expect(validCheck.success).toBe(true);
  });

  it('auto-retries AI generation when workflow output contract is missing', async () => {
    const { codegenService } = createService();
    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          result: `
from temporalio import workflow

@workflow.defn(name="AiWorkflow")
class AiWorkflow:
    async def run(self, params: dict):
        return {"summary": "done"}
`,
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          result: `
from temporalio import workflow

@workflow.defn(name="AiWorkflow")
class AiWorkflow:
    def _build_workflow_result(self, raw_result):
        return {
            "execution": {"status": "success"},
            "trigger": {"type": "manual"},
            "result": {"resultType": "generic", "title": "AI 输出测试工作流", "summary": "done", "businessData": raw_result},
            "artifacts": [],
            "presentation": {"preferAiSummary": True, "preferStructuredView": False, "chatSummary": "done", "notificationSummary": "done", "summaryFormat": "plain_text", "detailText": "done", "detailFormat": "plain_text"},
        }

    async def run(self, params: dict):
        return self._build_workflow_result({"value": 1})
`,
        },
      } as any);

    const result = await codegenService.generateWorkflowCode(
      {
        name: 'AI 输出测试工作流',
        workflowClassName: 'AiWorkflow',
        workflowDefnName: 'AI 输出测试工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        steps: [],
      } as any,
      { activities: [] },
      undefined,
      true,
      {
        buildDeterministicWorkflowCode: () => null,
      }
    );

    expect(result.success).toBe(true);
    expect(result.generationMode).toBe('ai');
    expect(result.attempts).toBe(2);
    expect(result.autoRetried).toBe(true);
    expect(result.code).toContain('"execution": {"status": "success"}');
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it('generates deterministic code for new builtin fileRead activity', async () => {
    const { service } = createService();

    const result = await service.generateWorkflowCode(
      {
        name: '文件读取工作流',
        workflowClassName: 'FileReadWorkflow',
        workflowDefnName: '文件读取工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: {
          filePath: {
            required: true,
            description: '文件路径',
          },
        },
        steps: [
          {
            id: 'step_1',
            name: '读取文件',
            type: 'activity',
            activityRef: 'builtin:fileRead',
            activityName: 'fileRead',
            startToCloseTimeout: '60s',
            input: {
              __fileRead: {
                protocol: 'local',
                path: '{filePath}',
                encoding: 'utf-8',
                returnMode: 'text',
              },
            },
          },
        ],
      },
      {
        activities: [],
      }
    );

    expect(result.success).toBe(true);
    expect(result.generationMode).toBe('deterministic');
    expect(result.code).toContain('BUILTIN_CONFIG');
    expect(result.code).toContain('"protocol": "local"');
    expect(result.code).toContain('fileRead');
    expect(result.code).toContain('开始执行文件读取任务');
  });

  it('generates deterministic code for new builtin waitDelay activity with sleep optimization', async () => {
    const { service } = createService();

    const result = await service.generateWorkflowCode(
      {
        name: '等待延迟工作流',
        workflowClassName: 'WaitDelayWorkflow',
        workflowDefnName: '等待延迟工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        steps: [
          {
            id: 'step_1',
            name: '延迟等候',
            type: 'activity',
            activityRef: 'builtin:waitDelay',
            activityName: 'waitDelay',
            input: {
              __waitDelay: {
                duration: '5m',
                message: '等待 5 分钟',
              },
            },
          },
        ],
      },
      {
        activities: [],
      }
    );

    expect(result.success).toBe(true);
    expect(result.generationMode).toBe('deterministic');
    expect(result.code).toContain('BUILTIN_CONFIG');
    expect(result.code).toContain('workflow.sleep(timedelta(seconds=duration_seconds))');
  });

  it('generates universal linear workflow code for 3-step HTTP → Transform → DocumentRender chain', async () => {
    const { service } = createService();

    const result = await service.generateWorkflowCode(
      {
        name: '多步文档工作流',
        workflowClassName: 'MultiStepDocWorkflow',
        workflowDefnName: '多步文档工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: {
          city: { required: true, description: '城市名' },
          fileName: { required: true, description: '文件名' },
        },
        steps: [
          {
            id: 'step_1',
            name: '查询天气接口',
            type: 'activity',
            activityRef: 'builtin:httpRequest',
            activityName: 'httpRequest',
            startToCloseTimeout: '45s',
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
            name: '整理天气结果',
            type: 'activity',
            activityRef: 'builtin:structuredTransform',
            activityName: 'structuredTransform',
            startToCloseTimeout: '90s',
            input: {
              __structuredTransform: {
                contentType: 'json',
                instructionTemplate: '把天气结果整理为最终 JSON，保留温度和天气文本',
                outputMode: 'json',
                outputSchema: { weatherText: 'string', temperatureC: 'string' },
              },
            },
          },
          {
            id: 'step_3',
            name: '渲染文档',
            type: 'activity',
            activityRef: 'builtin:documentRender',
            activityName: 'documentRender',
            startToCloseTimeout: '120s',
            input: {
              templateId: 'weather-report',
              data: { weather: '{{step_2}}' },
            },
          },
        ],
      },
      {
        activities: [],
      }
    );

    expect(result.success).toBe(true);
    expect(result.generationMode).toBe('deterministic');
    // universal builder markers: per-step kind dispatch + runtime input resolver
    expect(result.code).toContain('STEP_KINDS = ["http","transform","generic"]');
    expect(result.code).toContain('STEP_CONFIGS = [');
    expect(result.code).toContain('_resolve_step_input');
    // all 3 activity blocks inlined (httpRequest / structuredTransform / documentRender)
    expect(result.code).toContain('async def httpRequest(');
    expect(result.code).toContain('async def structuredTransform(');
    expect(result.code).toContain('async def documentRender(');
    // sequential execution with per-step variables
    expect(result.code).toContain('raw_result_0 = await workflow.execute_activity(');
    expect(result.code).toContain('raw_result_1 = await workflow.execute_activity(');
    expect(result.code).toContain('raw_result_2 = await workflow.execute_activity(');
    expect(result.code).toContain('step_results["step_1"] = step_result_0');
    expect(result.code).toContain('step_results["step_3"] = step_result_2');
    // step result normalization (http body + transform inner result)
    expect(result.code).toContain('_normalize_step_result');
    expect(result.code).toContain('return raw_result.get("result") if isinstance(raw_result, dict) and "result" in raw_result else raw_result');
    // result builder return
    expect(result.code).toContain('return self._build_workflow_result(step_results)');
  });

  it('generates universal linear workflow code for 2-step heterogeneous fileRead → emailSend chain', async () => {
    const { service } = createService();

    const result = await service.generateWorkflowCode(
      {
        name: '文件通知工作流',
        workflowClassName: 'FileNotifyWorkflow',
        workflowDefnName: '文件通知工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: {
          filePath: { required: true, description: '文件路径' },
          toEmail: { required: true, description: '收件人' },
        },
        steps: [
          {
            id: 'step_1',
            name: '读取文件',
            type: 'activity',
            activityRef: 'builtin:fileRead',
            activityName: 'fileRead',
            startToCloseTimeout: '60s',
            input: {
              __fileRead: {
                protocol: 'local',
                path: '{filePath}',
                encoding: 'utf-8',
                returnMode: 'text',
              },
            },
          },
          {
            id: 'step_2',
            name: '发送邮件',
            type: 'activity',
            activityRef: 'builtin:emailSend',
            activityName: 'emailSend',
            startToCloseTimeout: '60s',
            input: {
              __emailSend: {
                to: '{toEmail}',
                subject: '文件内容通知',
                content: '{{step_1.content}}',
              },
            },
          },
        ],
      },
      {
        activities: [],
      }
    );

    expect(result.success).toBe(true);
    expect(result.generationMode).toBe('deterministic');
    expect(result.code).toContain('STEP_KINDS = ["generic","generic"]');
    expect(result.code).toContain('async def fileRead(');
    expect(result.code).toContain('async def emailSend(');
    expect(result.code).toContain('raw_result_0 = await workflow.execute_activity(');
    expect(result.code).toContain('raw_result_1 = await workflow.execute_activity(');
    // cross-step template ref kept in compiled config, resolved at runtime
    expect(result.code).toContain('"content": "{{step_1.content}}"');
    expect(result.code).toContain('"path": "{filePath}"');
    expect(result.code).toContain('return self._build_workflow_result(step_results)');
  });

  it('fills generatedCode via per-activity AI codegen during enrichment', async () => {
    const { workflowSupportService, activityCodegenService } = createService();
    jest
      .spyOn(activityCodegenService, 'generateCode')
      .mockResolvedValue({ success: true, code: 'async def searchKeyword(input_data):\n    return {"result": "ok"}\n' } as any);

    const workflowDsl = {
      name: '自定义搜索工作流',
      workflowClassName: 'CustomSearchWorkflow',
      workflowDefnName: '自定义搜索工作流',
      taskQueue: 'SKILL_TASK_QUEUE',
      inputParams: { keyword: { required: true, description: '关键词' } },
      steps: [
        {
          id: 'step_1',
          name: '搜索关键词',
          type: 'activity',
          activityName: '搜索关键词',
          startToCloseTimeout: '60s',
        },
      ],
    };
    const activityDsl = {
      activities: [
        {
          name: '搜索关键词',
          fn: 'searchKeyword',
          timeout: '60s',
          handler: 'api',
          config: { searchUrl: '{keyword}' },
        },
      ],
    };

    const enriched = await workflowSupportService.createEnrichedActivityDsl(
      workflowDsl as any,
      activityDsl as any
    );

    expect(activityCodegenService.generateCode).toHaveBeenCalledTimes(1);
    expect(activityCodegenService.generateCode).toHaveBeenCalledWith(
      expect.objectContaining({ name: '搜索关键词', fn: 'searchKeyword', handler: 'api' })
    );
    expect(enriched.activities[0].generatedCode).toContain('async def searchKeyword');
  });

  it('keeps generatedCode undefined when per-activity AI codegen fails, so deterministic builder falls back to null', async () => {
    const { workflowSupportService, activityCodegenService, builtinRegistry, workflowConfigService, workflowNormalizationService } =
      createService();
    jest
      .spyOn(activityCodegenService, 'generateCode')
      .mockResolvedValue({ success: false, error: 'AI 服务不可用' } as any);

    const workflowDsl = {
      name: '自定义两步工作流',
      workflowClassName: 'CustomTwoStepWorkflow',
      workflowDefnName: '自定义两步工作流',
      taskQueue: 'SKILL_TASK_QUEUE',
      inputParams: { keyword: { required: true, description: '关键词' } },
      steps: [
        {
          id: 'step_1',
          name: '搜索关键词',
          type: 'activity',
          activityName: '搜索关键词',
          startToCloseTimeout: '60s',
        },
        {
          id: 'step_2',
          name: '生成摘要',
          type: 'activity',
          activityName: '生成摘要',
          startToCloseTimeout: '60s',
        },
      ],
    };
    const activityDsl = {
      activities: [
        {
          name: '搜索关键词',
          fn: 'searchKeyword',
          timeout: '60s',
          handler: 'api',
          config: { searchUrl: '{keyword}' },
        },
        {
          name: '生成摘要',
          fn: 'summarizeResult',
          timeout: '60s',
          handler: 'api',
          config: {},
        },
      ],
    };

    const enriched = await workflowSupportService.createEnrichedActivityDsl(
      workflowDsl as any,
      activityDsl as any
    );
    expect(enriched.activities[0].generatedCode).toBeUndefined();

    const code = buildDeterministicWorkflowCodeForWorkflow(workflowDsl as any, enriched as any, {
      builtinActivityRegistry: builtinRegistry,
      workflowConfigService,
      workflowNormalizationService,
    });
    expect(code).toBeNull();
  });

  it('builds a simplified glue-only prompt when all activity code is already generated', () => {
    const { codegenService } = createService();
    const workflowDsl = {
      name: '胶水工作流',
      workflowClassName: 'GlueWorkflow',
      workflowDefnName: '胶水工作流',
      taskQueue: 'SKILL_TASK_QUEUE',
      steps: [{ id: 'step_1', name: '步骤一', type: 'activity', activityName: '活动一' }],
    };
    const activityDsl = {
      activities: [
        {
          name: '活动一',
          fn: 'customActivity',
          timeout: '60s',
          generatedCode: 'async def customActivity(input_data):\n    return {"result": "ok"}\n',
        },
      ],
    };

    const promptGlue = (codegenService as any).buildWorkflowCodePrompt(
      workflowDsl,
      activityDsl,
      undefined,
      true
    );
    expect(promptGlue).toContain('你的唯一任务是编写 Workflow 胶水代码');
    expect(promptGlue).toContain('仅编写 Workflow 胶水代码');
    expect(promptGlue).toContain('严禁修改已有 Activity 代码');
    expect(promptGlue).not.toContain('尚未实现，请根据 DSL 生成一个标准的 @activity.defn 实现');
    // 胶水模式下规则 1 被替换为「原样保留已有代码」
    expect(promptGlue).not.toContain('你的输出必须包含所有 Activity 的实现代码（已有的或新生成的）');

    const promptFull = (codegenService as any).buildWorkflowCodePrompt(
      workflowDsl,
      activityDsl,
      undefined,
      false
    );
    expect(promptFull).toContain('你的输出必须包含所有 Activity 的实现代码');
    expect(promptFull).not.toContain('你的唯一任务是编写 Workflow 胶水代码');
  });

  it('passes Gate 1 static analysis for universal linear builder output', async () => {
    const { service, codegenService } = createService();

    const workflowDsl = {
      name: '文件通知工作流',
      workflowClassName: 'FileNotifyWorkflow',
      workflowDefnName: '文件通知工作流',
      taskQueue: 'SKILL_TASK_QUEUE',
      inputParams: {
        filePath: { required: true, description: '文件路径' },
        toEmail: { required: true, description: '收件人' },
      },
      steps: [
        {
          id: 'step_1',
          name: '读取文件',
          type: 'activity',
          activityRef: 'builtin:fileRead',
          activityName: 'fileRead',
          startToCloseTimeout: '60s',
          input: {
            __fileRead: {
              protocol: 'local',
              path: '{filePath}',
              encoding: 'utf-8',
              returnMode: 'text',
            },
          },
        },
        {
          id: 'step_2',
          name: '发送邮件',
          type: 'activity',
          activityRef: 'builtin:emailSend',
          activityName: 'emailSend',
          startToCloseTimeout: '60s',
          input: {
            __emailSend: {
              to: '{toEmail}',
              subject: '文件内容通知',
              content: '{{step_1.content}}',
            },
          },
        },
      ],
    };
    const result = await service.generateWorkflowCode(workflowDsl as any, { activities: [] });
    expect(result.success).toBe(true);
    expect(result.generationMode).toBe('deterministic');

    const gate1 = (codegenService as any).validateGeneratedPythonCodeGate1(
      result.code,
      workflowDsl as any
    );
    expect(gate1.success).toBe(true);
    expect(gate1.violations).toHaveLength(0);
  });

  describe('Gate 1 AST static analysis (§10.2)', () => {
    const ENVELOPE_CLASS = `
from temporalio import workflow
from temporalio.exceptions import ApplicationError

@workflow.defn(name="Gate1Workflow")
class Gate1Workflow:
    @classmethod
    def _build_workflow_result(cls, raw_result):
        return {
            "execution": {"status": "success"},
            "trigger": {"type": "manual"},
            "result": {"resultType": "generic", "title": "ok", "summary": "ok", "businessData": raw_result},
            "artifacts": [],
            "presentation": {"preferAiSummary": True, "preferStructuredView": False, "summaryFormat": "plain_text", "detailFormat": "plain_text"},
        }
`;

    const gate1 = (code: string, workflowDsl?: any) => {
      const { codegenService } = createService();
      return (codegenService as any).validateGeneratedPythonCodeGate1(code, workflowDsl);
    };

    it('passes valid envelope-based workflow code', () => {
      const result = gate1(
        `${ENVELOPE_CLASS}
    async def run(self, params: dict):
        return self._build_workflow_result({"value": 1})
`
      );
      expect(result.success).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('rejects workflow.unsafe in workflow code (AST is authoritative, not regex)', () => {
      const result = gate1(
        `${ENVELOPE_CLASS}
    async def run(self, params: dict):
        if workflow.unsafe.is_replaying():
            return self._build_workflow_result({"value": 1})
        return self._build_workflow_result({"value": 2})
`
      );
      expect(result.success).toBe(false);
      expect(result.violations.some((v: any) => v.code === 'WORKFLOW_UNSAFE')).toBe(true);
    });

    it('rejects network calls in workflow code but allows them inside @activity.defn', () => {
      const networkInRun = gate1(
        `${ENVELOPE_CLASS}
    async def run(self, params: dict):
        response = requests.get("https://example.com")
        return self._build_workflow_result(response.json())
`
      );
      expect(networkInRun.success).toBe(false);
      expect(networkInRun.violations.some((v: any) => v.code === 'WORKFLOW_NETWORK')).toBe(true);

      const networkInActivity = gate1(`
import requests

from temporalio import activity, workflow
from temporalio.exceptions import ApplicationError

@activity.defn(name="fetchActivity")
async def fetch_activity(input_data: dict) -> dict:
    response = requests.get("https://example.com", timeout=10)
    return response.json()

${ENVELOPE_CLASS}
    async def run(self, params: dict):
        result = await workflow.execute_activity(fetch_activity, params, start_to_close_timeout=timedelta(seconds=30))
        return self._build_workflow_result(result)
`
      );
      expect(networkInActivity.success).toBe(true);
    });

    it('rejects system time and random usage in workflow code', () => {
      const timeInRun = gate1(
        `${ENVELOPE_CLASS}
    async def run(self, params: dict):
        time.sleep(1)
        return self._build_workflow_result({"value": random.randint(1, 10)})
`
      );
      expect(timeInRun.success).toBe(false);
      const codes = timeInRun.violations.map((v: any) => v.code);
      expect(codes).toContain('WORKFLOW_NON_DETERMINISTIC');
    });

    it('rejects file system access in workflow code', () => {
      const result = gate1(
        `${ENVELOPE_CLASS}
    async def run(self, params: dict):
        with open("/tmp/out.txt", "w") as f:
            f.write("x")
        return self._build_workflow_result({"value": 1})
`
      );
      expect(result.success).toBe(false);
      expect(result.violations.some((v: any) => v.code === 'WORKFLOW_FILE_IO')).toBe(true);
    });

    it('rejects imports outside the whitelist', () => {
      const result = gate1(`
import flask

${ENVELOPE_CLASS}
    async def run(self, params: dict):
        return self._build_workflow_result({"value": 1})
`);
      expect(result.success).toBe(false);
      expect(result.violations.some((v: any) => v.code === 'IMPORT_BANNED')).toBe(true);
    });

    it('rejects run() that does not return through Result Builder or envelope', () => {
      const result = gate1(`
${ENVELOPE_CLASS}
    async def run(self, params: dict):
        return {"summary": "done"}
`);
      expect(result.success).toBe(false);
      expect(result.violations.some((v: any) => v.code === 'RETURN_NOT_ENVELOPE')).toBe(true);
    });

    it('rejects invalid Python syntax with SYNTAX_ERROR', () => {
      const result = gate1(`
${ENVELOPE_CLASS}
    async def run(self, params: dict):
        broken =
`);
      expect(result.success).toBe(false);
      expect(result.violations.some((v: any) => v.code === 'SYNTAX_ERROR')).toBe(true);
    });

    it('enforces v2Output required fields are mapped in the Result Builder', () => {
      const dsl = {
        v2Output: {
          fields: {
            temp: { type: 'number', required: true, source: { step: 'step_1', path: '$.temperature' } },
          },
        },
      };
      const missingMapping = gate1(
        `${ENVELOPE_CLASS}
    async def run(self, params: dict):
        return self._build_workflow_result({"value": 1})
`,
        dsl
      );
      expect(missingMapping.success).toBe(false);
      expect(missingMapping.violations.some((v: any) => v.code === 'MISSING_V2_OUTPUT_FIELD')).toBe(true);

      const mapped = gate1(`
from temporalio import workflow
from temporalio.exceptions import ApplicationError

@workflow.defn(name="V2Workflow")
class V2Workflow:
    @classmethod
    def _build_workflow_result(cls, step_results):
        business_data = {"temp": step_results.get("step_1", {}).get("temperature")}
        return {
            "execution": {"status": "success"},
            "trigger": {"type": "manual"},
            "result": {"resultType": "generic", "title": "ok", "summary": "ok", "businessData": business_data},
            "artifacts": [],
            "presentation": {"preferAiSummary": True, "preferStructuredView": False, "summaryFormat": "plain_text", "detailFormat": "plain_text"},
        }

    async def run(self, params: dict):
        return self._build_workflow_result({})
`,
        dsl
      );
      expect(mapped.success).toBe(true);
    });

    it('repair context maps error codes to actionable guidance', () => {
      const { codegenService } = createService();
      const context = (codegenService as any).buildAstGate1RepairContext([
        { line: 5, code: 'WORKFLOW_NETWORK', message: "Workflow 代码禁止使用 'requests.post'" },
        { line: 9, code: 'WORKFLOW_NON_DETERMINISTIC', message: 'Workflow 代码禁止使用 time.sleep' },
      ]);
      expect(context).toContain('Gate 1 静态分析');
      expect(context).toContain('requests.post');
      expect(context).toContain('time.sleep');
      expect(context).toContain('封装在 @activity.defn 装饰的 Activity 函数中');
    });
  });
});
