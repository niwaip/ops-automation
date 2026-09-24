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
  inferWorkflowInputParamType,
  normalizeAiDraftStepInput,
  normalizeDraftInputParams,
} from '@ops/workflow-registry/temporal/temporal-workflow-draft.normalizers';
import { repairCommonDraftPlanIssues } from '@ops/workflow-registry/temporal/temporal-workflow-draft-plan.helpers';
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
import { BuiltinActivityRegistry } from '@ops/workflow-registry/temporal/builtin-activity.registry';
import { WorkflowSkeletonCompiler } from '@ops/workflow-registry/temporal/workflow-skeleton-compiler';

import { createService } from './temporal-workflow-codegen.test-helper';
jest.mock('axios');

describe('TemporalWorkflowCodegenService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes legacy outputParams before code generation and emits a sealed result builder', async () => {
    const { service } = createService();
    const result = await service.generateWorkflowCode(
      {
        name: 'Web Search',
        workflowClassName: 'WebSearchWorkflow',
        taskQueue: 'web-search-task-queue',
        steps: [
          {
            id: 'step_1',
            name: '搜索网页',
            type: 'activity',
            activityRef: 'builtin:httpRequest',
            activityName: 'httpRequest',
            input: {
              __httpRequest: {
                method: 'POST',
                urlTemplate: 'https://api.example.com/search',
                responseMode: 'body',
              },
            },
          },
        ],
        outputParams: {
          searchResults: { sourceStep: 'step_1', description: '搜索结果' },
        },
      },
      { activities: [] }
    );

    expect(result.success).toBe(true);
    expect(result.code).toContain('_extract_v2_path');
    expect(result.code).toContain(
      '"searchResults": cls._extract_v2_path(step_results.get("step_1"), "$.searchResults"),'
    );
    expect(result.code).not.toContain('business_data = raw_result');
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
    expect(result.code).toContain(
      'return raw_result.get("result") if isinstance(raw_result, dict) and "result" in raw_result else raw_result'
    );
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
      .mockResolvedValue({
        success: true,
        code: 'async def searchKeyword(input_data):\n    return {"result": "ok"}\n',
      } as any);

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
    const {
      workflowSupportService,
      activityCodegenService,
      builtinRegistry,
      workflowConfigService,
      workflowNormalizationService,
    } = createService();
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
    expect(promptGlue).not.toContain(
      '你的输出必须包含所有 Activity 的实现代码（已有的或新生成的）'
    );

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
});
