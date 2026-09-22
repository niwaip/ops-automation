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
});
