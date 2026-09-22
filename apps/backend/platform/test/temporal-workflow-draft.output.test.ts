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
        outputParams: {
          body: { sourceStep: 'step_1' },
          statusCode: { sourceStep: 'step_1' },
          mystery: { sourceStep: 'step_1' },
        },
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
      expect(
        deriveV2OutputFromOutputParams({ outputParams: {}, steps: [transformStep()] })
      ).toBeUndefined();
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
