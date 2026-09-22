import axios from 'axios';
import { PlanGeneratorService, PlanSemanticService } from './plan';
import {
  DeterministicParamResolverService,
  ParamBilingualService,
  ParamContextMergeService,
  ParamPolicyService,
  ParamRecognizerService,
  ParamRequiredInputPresentationService,
  ParamSchemaService,
  ParamValueService,
} from './params';
import { PlannerService } from './facade';
import { PlannerMatchPhaseService } from './intent';
import { PlannerPlanDraftService } from './planning';
import { SkillCacheService, SkillMatcherService } from './skill';
import { RecognizerService } from '../recognizer/recognizer.service';
import { AvailableSkillDefinition, SkillMatchResult } from '../react-engine/interfaces';

describe('PlannerService - required inputs without hardcoded defaults', () => {
  let service: PlannerService;
  let skillCacheService: SkillCacheService;
  let skillMatcherService: SkillMatcherService;
  let planSemanticService: PlanSemanticService;
  let planGeneratorService: PlanGeneratorService;
  let paramSchemaService: ParamSchemaService;
  let paramContextMergeService: ParamContextMergeService;
  let paramBilingualService: ParamBilingualService;
  let paramPolicyService: ParamPolicyService;
  let paramValueService: ParamValueService;
  let paramRequiredInputPresentationService: ParamRequiredInputPresentationService;
  let paramRecognizerService: ParamRecognizerService;
  let plannerMatchPhaseService: PlannerMatchPhaseService;
  let plannerPlanDraftService: PlannerPlanDraftService;
  let recognizerService: { recognizeParams: jest.Mock };
  let modelService: { callModel: jest.Mock };

  beforeEach(() => {
    recognizerService = {
      recognizeParams: jest.fn(),
    };
    modelService = {
      callModel: jest.fn(),
    };
    skillCacheService = new SkillCacheService();
    skillMatcherService = new SkillMatcherService(skillCacheService);
    planSemanticService = new PlanSemanticService();
    planGeneratorService = new PlanGeneratorService();
    paramSchemaService = new ParamSchemaService();
    paramContextMergeService = new ParamContextMergeService();
    paramBilingualService = new ParamBilingualService(modelService as any);
    paramPolicyService = new ParamPolicyService();
    paramValueService = new ParamValueService();
    paramRequiredInputPresentationService = new ParamRequiredInputPresentationService();
    paramRecognizerService = new ParamRecognizerService(
      paramSchemaService,
      paramContextMergeService,
      paramBilingualService,
      paramPolicyService,
      paramValueService,
      paramRequiredInputPresentationService
    );
    plannerMatchPhaseService = new PlannerMatchPhaseService(skillCacheService, skillMatcherService);
    plannerPlanDraftService = new PlannerPlanDraftService(
      recognizerService as unknown as RecognizerService,
      planSemanticService,
      planGeneratorService,
      paramRecognizerService,
      new DeterministicParamResolverService()
    );
    service = new PlannerService(plannerMatchPhaseService, plannerPlanDraftService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('hydrates render paths from runtime mapping hints before building execution snapshot', async () => {
    const skill: AvailableSkillDefinition = {
      skillId: 'document-contract-hydrated',
      skillName: 'documentContractHydratedService',
      description: 'Generate contract document with runtime mapping hints',
      triggerKeywords: ['合同'],
      paramsSchema: {
        properties: {
          'contract.partyA': {
            type: 'string',
            description: '甲方名称',
            required: true,
          } as any,
          'payment.bankAccount': {
            type: 'string',
            description: '收款账号',
            required: true,
          } as any,
        },
        required: ['contract.partyA', 'payment.bankAccount'],
      },
      templateId: 'tpl-contract-hydrated',
      carboneTemplateId: 'carbone-tpl-hydrated',
      carboneSkillId: 'carbone-skill-hydrated',
      executionFlowTemplateIds: ['flow-hydrated'],
      executionFlow: ['document_render'],
      apiEndpoints: {
        runtimeMetadata: {
          sourceType: 'document',
          mappingHints: [
            { parameter: 'contract.partyA_cn', path: '{d.contract.partyA_cn}' },
            { parameter: 'contract.partyA_jp', path: '{d.contract.partyA_jp}' },
            { parameter: 'payment.bankAccount_cn', path: '{d.payment.bankAccount_cn}' },
          ],
        },
      } as any,
      goal: 'Generate contract',
      expectedResult: 'Completed contract document',
      outputParams: undefined,
    };

    const match: SkillMatchResult = {
      skillId: skill.skillId,
      skillName: skill.skillName,
      matchedKeywords: ['合同'],
      confidence: 0.96,
      collectedParams: {},
      missingParams: [],
      paramsSchema: skill.paramsSchema,
      templateId: skill.templateId,
      carboneTemplateId: skill.carboneTemplateId,
      carboneSkillId: skill.carboneSkillId,
      executionFlowTemplateIds: skill.executionFlowTemplateIds,
      executionFlow: skill.executionFlow,
      apiEndpoints: skill.apiEndpoints,
      matchReason: 'test',
      goal: skill.goal,
      expectedResult: skill.expectedResult,
      outputParams: undefined,
    };

    jest
      .spyOn(plannerMatchPhaseService as any, 'loadAvailableSkills')
      .mockResolvedValue([skill] as AvailableSkillDefinition[]);
    const hydratedMatch = skillMatcherService.hydrateMatchedSkill(match, [skill]) || match;
    jest.spyOn(plannerMatchPhaseService as any, 'matchSkill').mockResolvedValue(hydratedMatch);
    jest.spyOn(recognizerService, 'recognizeParams').mockResolvedValue({
      params: {
        'contract.partyA': '甲方科技有限公司',
        'payment.bankAccount': '789456123012',
      },
      confidence: 0.95,
      field_confidences: {
        'contract.partyA': 0.98,
        'payment.bankAccount': 0.96,
      },
    });

    const plan = await service.generatePlan({
      request: {
        user_input: '帮我生成技术服务合同',
        user_id: 'u1',
        modelId: 'selected-model-id',
      } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    expect(hydratedMatch.paramsSchema.properties['contract.partyA']).toEqual(
      expect.objectContaining({
        renderPath: ['contract.partyA_cn', 'contract.partyA_jp'],
      })
    );
    const paramResolution =
      (plan.metadata?.execution_snapshot as any)?.normalizedInputJson?.paramResolution || {};
    expect(paramResolution['contract.partyA']).toEqual(
      expect.objectContaining({
        render_path: ['contract.partyA_cn', 'contract.partyA_jp'],
        final: true,
        value: '甲方科技有限公司',
      })
    );
    expect(paramResolution['payment.bankAccount']).toEqual(
      expect.objectContaining({
        render_path: 'payment.bankAccount_cn',
        final: true,
        value: '789456123012',
      })
    );
  });

  it('loads only the targeted skill when target_skill_id is provided', async () => {
    const axiosGet = jest.spyOn(axios, 'get').mockImplementation(async (url: string) => {
      if (url.endsWith('/skills/skill-contract')) {
        return {
          data: {
            id: 'skill-contract',
            name: 'contractService',
            description: 'Generate contract',
            triggerKeywords: ['合同'],
            paramsSchema: {
              properties: {
                'info.partyA': {
                  type: 'string',
                  description: '甲方名称',
                  required: true,
                },
              },
              required: ['info.partyA'],
            },
            apiEndpoints: {
              runtimeMetadata: {
                sourceType: 'document',
              },
            },
            executionFlowTemplateIds: [],
            executionFlow: ['document_render'],
            goal: 'Generate contract',
            expectedResult: 'Contract document',
          },
        } as any;
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    const axiosPost = jest.spyOn(axios, 'post');
    jest.spyOn(recognizerService, 'recognizeParams').mockResolvedValue({
      params: {},
      confidence: 0.9,
    });

    const plan = await service.generatePlan({
      request: {
        user_input: '补充甲方名称为星海智造科技有限公司',
        user_id: 'u1',
        modelId: 'selected-model-id',
        context: {
          mode: 'waiting_input_resume',
          target_skill_id: 'skill-contract',
        },
      } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    expect(plan.skill_match).toEqual(
      expect.objectContaining({
        skill_id: 'skill-contract',
        skill_name: 'contractService',
      })
    );
    expect(axiosGet).toHaveBeenCalledWith(
      expect.stringContaining('/skills/skill-contract'),
      expect.any(Object)
    );
    expect(axiosGet.mock.calls.filter(([url]) => String(url).endsWith('/skills'))).toHaveLength(0);
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it('caches available skills within the same planner instance without loading linked flow schemas', async () => {
    const axiosGet = jest.spyOn(axios, 'get').mockImplementation(async (url: string) => {
      if (url.endsWith('/skills')) {
        return {
          data: {
            skills: [
              {
                id: 'document-contract',
                name: 'documentContractService',
                description: 'Generate contract document',
                triggerKeywords: ['合同'],
                paramsSchema: {
                  properties: {
                    subject: {
                      type: 'string',
                      description: '合同主题',
                      required: true,
                    },
                  },
                  required: ['subject'],
                },
                executionFlowTemplateIds: ['flow-1'],
                apiEndpoints: {
                  runtimeMetadata: {
                    sourceType: 'document',
                  },
                },
              },
            ],
          },
        } as any;
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    const first = await (service as any).loadAvailableSkills('Bearer test', 'trace-1');
    const second = await (service as any).loadAvailableSkills('Bearer test', 'trace-2');

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0].paramsSchema.required).toEqual(['subject']);
    // First load queries unified catalog plus legacy /skills; second load is cached.
    expect(axiosGet).toHaveBeenCalledTimes(2);
    expect(axiosGet.mock.calls.filter(([url]) => String(url).endsWith('/skills'))).toHaveLength(1);
    expect(
      axiosGet.mock.calls.filter(([url]) => String(url).endsWith('/flows/flow-1'))
    ).toHaveLength(0);
  });

  it('hydrates API match results with local skill execution metadata when the match payload is sparse', async () => {
    const availableSkills: AvailableSkillDefinition[] = [
      {
        skillId: 'document-contract',
        skillName: 'documentContractService',
        description: 'Generate contract document',
        triggerKeywords: ['合同'],
        paramsSchema: {
          properties: {
            subject: {
              type: 'string',
              description: '合同主题',
              required: true,
            } as any,
          },
          required: ['subject'],
        },
        executionType: 'document',
        templateId: 'tpl-contract',
        carboneTemplateId: 'carbone-tpl-1',
        carboneSkillId: 'carbone-skill-1',
        executionFlowTemplateIds: ['flow-1'],
        executionFlow: ['document_render'],
        apiEndpoints: {
          runtimeMetadata: {
            sourceType: 'document',
          },
        } as any,
        goal: 'Generate contract',
        expectedResult: 'Completed contract document',
        outputParams: undefined,
      },
    ];
    jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        match: {
          skillId: 'document-contract',
          skillName: 'documentContractService',
          matchedKeywords: ['合同'],
          confidence: 0.92,
          collectedParams: {},
          missingParams: ['subject'],
          paramsSchema: {
            properties: {},
            required: [],
          },
        },
      },
    } as any);

    const matched = await (service as any).matchSkill(
      '帮我生成采购合同',
      'u1',
      'Bearer test',
      'trace-1',
      availableSkills,
      {}
    );

    expect(matched).toMatchObject({
      skillId: 'document-contract',
      executionType: 'document',
      executionFlow: ['document_render'],
      carboneTemplateId: 'carbone-tpl-1',
    });
    expect(matched?.paramsSchema.required).toEqual(['subject']);
  });

  it('preserves builtin artifact catalog metadata during Skill cache normalization', () => {
    const mapped = (skillCacheService as any).mapRawSkillDefinition({
      id: 'platform.document.markdown-artifact-writer',
      name: '内置 Markdown 文件生成',
      executionType: 'artifact',
      source: 'builtin_skill',
      supportsArtifact: true,
      paramsSchema: { properties: {}, required: [] },
      outputSchema: { properties: { artifact: { valueType: 'artifact_ref' } } },
    });

    expect(mapped).toMatchObject({
      executionType: 'artifact',
      source: 'builtin_skill',
      supportsArtifact: true,
    });
  });

  it('normalizes skill params schema without introducing linked flow fields', () => {
    const normalized = skillCacheService.normalizeParamsSchema({
      properties: {
        target: {
          type: 'string',
          description: '目标对象',
          required: false,
        },
        units: {
          type: 'string',
          description: '单位',
          required: false,
          default: 'metric',
        },
      },
      required: [],
    });

    expect(normalized.required).toEqual([]);
    expect(normalized.properties.target?.required).toBe(false);
    expect(normalized.properties.target?.description).toBe('目标对象');
    expect(normalized.properties.units?.required).toBe(false);
    expect(normalized.properties.units?.default).toBe('metric');
  });

  it('adds semantic grouping and removes loop markers for complex document plans', async () => {
    const skill: AvailableSkillDefinition = {
      skillId: 'document-contract',
      skillName: 'documentContractService',
      description: 'Generate contract document',
      triggerKeywords: ['合同', '采购'],
      paramsSchema: {
        properties: {
          '{#d.items}{/d.items}': {
            type: 'string',
            description: 'template loop marker',
            required: true,
          } as any,
          'items[].deviceName': {
            type: 'string',
            description: '设备名称',
            required: true,
          } as any,
          'items[].quantity': {
            type: 'number',
            description: '数量',
            required: true,
          } as any,
          'deliveryItems[].date': {
            type: 'string',
            description: '交付日期',
            required: true,
          } as any,
          'paymentSchedule[].amount': {
            type: 'number',
            description: '付款金额',
            required: true,
          } as any,
        },
        required: [
          '{#d.items}{/d.items}',
          'items[].deviceName',
          'items[].quantity',
          'deliveryItems[].date',
          'paymentSchedule[].amount',
        ],
      },
      templateId: 'tpl-contract',
      carboneTemplateId: 'carbone-tpl-1',
      carboneSkillId: 'carbone-skill-1',
      executionFlowTemplateIds: ['flow-1'],
      executionFlow: ['document_render'],
      apiEndpoints: {
        runtimeMetadata: {
          sourceType: 'document',
          matchSummary: '这是一个采购合同文档模板，需要按合同场景提取结构化参数。',
          paramCollectionGuidance: '优先从合同概述、采购明细和付款计划中提取字段。',
          dataExampleJson: {
            info: {
              contractNo: 'PC-2026-0178',
            },
            items: [
              {
                deviceName: '六轴工业机器人',
                quantity: 2,
              },
            ],
          },
        },
      } as any,
      goal: 'Generate contract',
      expectedResult: 'Completed contract document',
      outputParams: undefined,
    };

    const match: SkillMatchResult = {
      skillId: skill.skillId,
      skillName: skill.skillName,
      matchedKeywords: ['合同'],
      confidence: 0.95,
      collectedParams: {},
      missingParams: [
        '{#d.items}{/d.items}',
        'items[].deviceName',
        'items[].quantity',
        'deliveryItems[].date',
        'paymentSchedule[].amount',
      ],
      paramsSchema: skill.paramsSchema,
      templateId: skill.templateId,
      carboneTemplateId: skill.carboneTemplateId,
      carboneSkillId: skill.carboneSkillId,
      executionFlowTemplateIds: skill.executionFlowTemplateIds,
      executionFlow: skill.executionFlow,
      apiEndpoints: skill.apiEndpoints,
      matchReason: 'test',
      goal: skill.goal,
      expectedResult: skill.expectedResult,
      outputParams: undefined,
    };

    jest
      .spyOn(plannerMatchPhaseService as any, 'loadAvailableSkills')
      .mockResolvedValue([skill] as AvailableSkillDefinition[]);
    jest.spyOn(plannerMatchPhaseService as any, 'matchSkill').mockResolvedValue(match);
    jest.spyOn(recognizerService, 'recognizeParams').mockResolvedValue({
      params: {},
      confidence: 0.1,
    });

    const plan = await service.generatePlan({
      request: {
        user_input: '帮我生成采购合同',
        user_id: 'u1',
        modelId: 'selected-model-id',
      } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    expect(plan.required_inputs.some((item) => item.name === '{#d.items}{/d.items}')).toBe(false);
    expect(plan.semantic?.mode).toBe('complex_document');
    expect(plan.semantic?.complexity).toEqual(
      expect.objectContaining({
        totalFields: 4,
        requiredFields: 4,
        missingFields: 4,
        arrayGroups: 3,
      })
    );
    expect(plan.semantic?.groupedMissing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'items',
          label: '标的清单',
          kind: 'array_group',
        }),
        expect.objectContaining({
          key: 'deliveryItems',
          label: '交付计划',
          kind: 'array_group',
        }),
        expect.objectContaining({
          key: 'paymentSchedule',
          label: '付款计划',
          kind: 'array_group',
        }),
      ])
    );
    expect(recognizerService.recognizeParams).toHaveBeenCalledWith(
      expect.objectContaining({
        guide_context: expect.objectContaining({
          mode: 'document_skill',
          templateOverview: expect.stringContaining('采购合同文档模板'),
          paramCollectionGuidance: expect.stringContaining('采购明细'),
          outputExample: expect.objectContaining({
            info: expect.objectContaining({
              contractNo: 'PC-2026-0178',
            }),
          }),
        }),
      })
    );
  });

  it('treats temporal_workflow skills with template loop markers as document tasks', async () => {
    const skill: AvailableSkillDefinition = {
      skillId: 'purchase-contract',
      skillName: '采购合同渲染',
      description: 'Temporal workflow that renders document',
      triggerKeywords: ['采购合同'],
      paramsSchema: {
        properties: {
          '{#d.items}{/d.items}': {
            type: 'string',
            description: 'template loop marker',
            required: true,
          } as any,
          'items[].deviceName': {
            type: 'string',
            description: '设备名称',
            required: true,
          } as any,
          'deliveryItems[].date': {
            type: 'string',
            description: '交付日期',
            required: true,
          } as any,
        },
        required: ['{#d.items}{/d.items}', 'items[].deviceName', 'deliveryItems[].date'],
      },
      templateId: 'tpl-contract',
      carboneTemplateId: undefined,
      carboneSkillId: undefined,
      executionFlowTemplateIds: [],
      executionFlow: [],
      apiEndpoints: {
        runtimeMetadata: {
          sourceType: 'temporal_workflow',
        },
      } as any,
      goal: 'Render contract',
      expectedResult: 'Contract document',
      outputParams: undefined,
    };

    const match: SkillMatchResult = {
      skillId: skill.skillId,
      skillName: skill.skillName,
      matchedKeywords: ['采购合同'],
      confidence: 0.95,
      collectedParams: {},
      missingParams: skill.paramsSchema.required as string[],
      paramsSchema: skill.paramsSchema,
      templateId: skill.templateId,
      carboneTemplateId: undefined,
      carboneSkillId: undefined,
      executionFlowTemplateIds: [],
      executionFlow: [],
      apiEndpoints: skill.apiEndpoints,
      matchReason: 'test',
      goal: skill.goal,
      expectedResult: skill.expectedResult,
      outputParams: undefined,
    };

    jest
      .spyOn(plannerMatchPhaseService as any, 'loadAvailableSkills')
      .mockResolvedValue([skill] as AvailableSkillDefinition[]);
    jest.spyOn(plannerMatchPhaseService as any, 'matchSkill').mockResolvedValue(match);
    jest.spyOn(recognizerService, 'recognizeParams').mockResolvedValue({
      params: {},
      confidence: 0.1,
    });

    const plan = await service.generatePlan({
      request: { user_input: '创建采购合同', user_id: 'u1', modelId: 'selected-model-id' } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    expect(plan.semantic?.mode).toBe('complex_document');
    expect(plan.required_inputs.some((item) => item.name === '{#d.items}{/d.items}')).toBe(false);
    expect(plan.semantic?.groupedMissing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'items',
          kind: 'array_group',
        }),
      ])
    );
  });

  it('keeps previewReady true when only non-blocking groups are missing and cleans technical noise/types', async () => {
    const skill: AvailableSkillDefinition = {
      skillId: 'document-contract',
      skillName: 'documentContractService',
      description: 'Generate contract document',
      triggerKeywords: ['合同', '采购'],
      paramsSchema: {
        properties: {
          __rowIndex: {
            type: 'int',
            description: 'row index technical noise',
            required: true,
          } as any,
          '{#d.items}{/d.items}': {
            type: 'string',
            description: 'template loop marker',
            required: true,
          } as any,
          'items[].deviceName': {
            type: 'string',
            description: '设备名称',
            required: true,
          } as any,
          'items[].quantity': {
            type: 'int',
            description: '数量',
            required: true,
          } as any,
          'deliveryItems[].date': {
            type: 'string',
            description: '交付日期',
            required: true,
          } as any,
          'paymentSchedule[].amount': {
            type: 'number',
            description: '付款金额',
            required: true,
          } as any,
          isUrgent: {
            type: 'bool',
            description: '是否加急',
            required: true,
          } as any,
        },
        required: [
          '__rowIndex',
          '{#d.items}{/d.items}',
          'items[].deviceName',
          'items[].quantity',
          'deliveryItems[].date',
          'paymentSchedule[].amount',
          'isUrgent',
        ],
      },
      templateId: 'tpl-contract',
      carboneTemplateId: 'carbone-tpl-1',
      carboneSkillId: 'carbone-skill-1',
      executionFlowTemplateIds: ['flow-1'],
      executionFlow: ['document_render'],
      apiEndpoints: {
        runtimeMetadata: {
          sourceType: 'document',
        },
      } as any,
      goal: 'Generate contract',
      expectedResult: 'Completed contract document',
      outputParams: undefined,
    };

    const match: SkillMatchResult = {
      skillId: skill.skillId,
      skillName: skill.skillName,
      matchedKeywords: ['合同'],
      confidence: 0.95,
      collectedParams: {},
      missingParams: ['paymentSchedule[].amount'],
      paramsSchema: skill.paramsSchema,
      templateId: skill.templateId,
      carboneTemplateId: skill.carboneTemplateId,
      carboneSkillId: skill.carboneSkillId,
      executionFlowTemplateIds: skill.executionFlowTemplateIds,
      executionFlow: skill.executionFlow,
      apiEndpoints: skill.apiEndpoints,
      matchReason: 'test',
      goal: skill.goal,
      expectedResult: skill.expectedResult,
      outputParams: undefined,
    };

    jest
      .spyOn(plannerMatchPhaseService as any, 'loadAvailableSkills')
      .mockResolvedValue([skill] as AvailableSkillDefinition[]);
    jest.spyOn(plannerMatchPhaseService as any, 'matchSkill').mockResolvedValue(match);
    jest.spyOn(recognizerService, 'recognizeParams').mockResolvedValue({
      params: {
        'items[].deviceName': '设备A',
        'items[].quantity': 10,
        'deliveryItems[].date': '2026-05-14',
        isUrgent: false,
      },
      confidence: 0.92,
    });

    const plan = await service.generatePlan({
      request: {
        user_input: '帮我生成采购合同',
        user_id: 'u1',
        modelId: 'selected-model-id',
      } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    expect(plan.required_inputs.some((item) => item.name === '__rowIndex')).toBe(false);
    expect(plan.required_inputs.some((item) => item.name === '{#d.items}{/d.items}')).toBe(false);

    const quantity = plan.required_inputs.find((item) => item.name === 'items[].quantity');
    expect(quantity?.type).toBe('array');

    const urgent = plan.required_inputs.find((item) => item.name === 'isUrgent');
    expect(urgent?.type).toBe('boolean');
    expect(urgent?.missing).toBe(false);

    expect(plan.semantic?.mode).toBe('complex_document');
    expect(plan.semantic?.previewReady).toBe(true);
    expect(plan.semantic?.finalReady).toBe(false);
    expect(plan.semantic?.groupedMissing).toEqual([
      expect.objectContaining({
        key: 'paymentSchedule',
        kind: 'array_group',
        blocking: false,
      }),
    ]);
  });

  it('prefers schema-provided group labels and preview blocking policy over planner fallback rules', async () => {
    const skill: AvailableSkillDefinition = {
      skillId: 'document-contract',
      skillName: 'documentContractService',
      description: 'Generate contract document',
      triggerKeywords: ['合同', '采购'],
      paramsSchema: {
        properties: {
          'customSchedule[].amount': {
            type: 'number',
            description: '阶段金额',
            required: true,
            groupLabel: '里程碑付款',
            previewBlocking: false,
          } as any,
        },
        required: ['customSchedule[].amount'],
      },
      templateId: 'tpl-contract',
      carboneTemplateId: 'carbone-tpl-1',
      carboneSkillId: 'carbone-skill-1',
      executionFlowTemplateIds: ['flow-1'],
      executionFlow: ['document_render'],
      apiEndpoints: {
        runtimeMetadata: {
          sourceType: 'document',
        },
      } as any,
      goal: 'Generate contract',
      expectedResult: 'Completed contract document',
      outputParams: undefined,
    };

    const match: SkillMatchResult = {
      skillId: skill.skillId,
      skillName: skill.skillName,
      matchedKeywords: ['合同'],
      confidence: 0.95,
      collectedParams: {},
      missingParams: ['customSchedule[].amount'],
      paramsSchema: skill.paramsSchema,
      templateId: skill.templateId,
      carboneTemplateId: skill.carboneTemplateId,
      carboneSkillId: skill.carboneSkillId,
      executionFlowTemplateIds: skill.executionFlowTemplateIds,
      executionFlow: skill.executionFlow,
      apiEndpoints: skill.apiEndpoints,
      matchReason: 'test',
      goal: skill.goal,
      expectedResult: skill.expectedResult,
      outputParams: undefined,
    };

    jest
      .spyOn(plannerMatchPhaseService as any, 'loadAvailableSkills')
      .mockResolvedValue([skill] as AvailableSkillDefinition[]);
    jest.spyOn(plannerMatchPhaseService as any, 'matchSkill').mockResolvedValue(match);
    jest.spyOn(recognizerService, 'recognizeParams').mockResolvedValue({
      params: {},
      confidence: 0.9,
    });

    const plan = await service.generatePlan({
      request: {
        user_input: '帮我生成采购合同',
        user_id: 'u1',
        modelId: 'selected-model-id',
      } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    expect(plan.semantic?.groupedMissing).toEqual([
      expect.objectContaining({
        key: 'customSchedule',
        label: '里程碑付款',
        blocking: false,
      }),
    ]);
    expect(plan.semantic?.previewReady).toBe(true);
  });

  it('does not classify plain string fields with list-like suffixes as array groups', () => {
    expect(planSemanticService.extractArrayGroupKey('statusList', 'string')).toBeUndefined();
    expect(planSemanticService.extractArrayGroupKey('reportDetails', 'string')).toBeUndefined();
    expect(planSemanticService.extractArrayGroupKey('agendaItems', 'string')).toBeUndefined();
    expect(planSemanticService.extractArrayGroupKey('statusList', 'array')).toBe('statusList');
    expect(planSemanticService.extractArrayGroupKey('items[].name', 'string')).toBe('items');
  });

  it('falls back to concise Chinese labels when schema display name is still a machine path', async () => {
    const skill: AvailableSkillDefinition = {
      skillId: 'document-contract',
      skillName: 'documentContractService',
      description: 'Generate contract document',
      triggerKeywords: ['合同', '采购'],
      paramsSchema: {
        properties: {
          'info.partyA': {
            type: 'string',
            description: '采购方（甲方）名称，明确合同责任主体及付款义务承担方',
            required: true,
            displayName: 'info.partyA',
            groupLabel: '合同首页',
          } as any,
        },
        required: ['info.partyA'],
      },
      templateId: 'tpl-contract',
      carboneTemplateId: 'carbone-tpl-1',
      carboneSkillId: 'carbone-skill-1',
      executionFlowTemplateIds: ['flow-1'],
      executionFlow: ['document_render'],
      apiEndpoints: {
        runtimeMetadata: {
          sourceType: 'document',
        },
      } as any,
      goal: 'Generate contract',
      expectedResult: 'Completed contract document',
      outputParams: undefined,
    };

    const match: SkillMatchResult = {
      skillId: skill.skillId,
      skillName: skill.skillName,
      matchedKeywords: ['合同'],
      confidence: 0.95,
      collectedParams: {},
      missingParams: ['info.partyA'],
      paramsSchema: skill.paramsSchema,
      templateId: skill.templateId,
      carboneTemplateId: skill.carboneTemplateId,
      carboneSkillId: skill.carboneSkillId,
      executionFlowTemplateIds: skill.executionFlowTemplateIds,
      executionFlow: skill.executionFlow,
      apiEndpoints: skill.apiEndpoints,
      matchReason: 'test',
      goal: skill.goal,
      expectedResult: skill.expectedResult,
      outputParams: undefined,
    };

    jest
      .spyOn(plannerMatchPhaseService as any, 'loadAvailableSkills')
      .mockResolvedValue([skill] as AvailableSkillDefinition[]);
    jest.spyOn(plannerMatchPhaseService as any, 'matchSkill').mockResolvedValue(match);
    jest.spyOn(recognizerService, 'recognizeParams').mockResolvedValue({
      params: {},
      confidence: 0.9,
    });

    const plan = await service.generatePlan({
      request: {
        user_input: '帮我生成采购合同',
        user_id: 'u1',
        modelId: 'selected-model-id',
      } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    const partyA = plan.required_inputs.find((item) => item.name === 'info.partyA');
    expect(partyA?.display_name).toBe('采购方（甲方）名称');
  });

  it('strips purpose-oriented boilerplate from waiting input labels', async () => {
    const skill: AvailableSkillDefinition = {
      skillId: 'tech-service-contract',
      skillName: 'techServiceContractService',
      description: 'Generate tech service contract',
      triggerKeywords: ['技术服务合同'],
      paramsSchema: {
        properties: {
          delegated_party_name: {
            type: 'string',
            description: '用于渲染合同文本中的委托方名称占位符',
            required: true,
            displayName: 'delegated_party_name',
            groupLabel: '合同首页',
          } as any,
          final_payment_ratio: {
            type: 'number',
            description: '用于渲染尾款占总价的比例',
            required: true,
            groupLabel: '付款安排',
          } as any,
        },
        required: ['delegated_party_name', 'final_payment_ratio'],
      },
      templateId: 'tpl-tech-service',
      carboneTemplateId: 'carbone-tech-service',
      carboneSkillId: 'carbone-skill-tech-service',
      executionFlowTemplateIds: ['flow-tech-service'],
      executionFlow: ['document_render'],
      apiEndpoints: {
        runtimeMetadata: {
          sourceType: 'document',
        },
      } as any,
      goal: 'Generate contract',
      expectedResult: 'Completed contract document',
      outputParams: undefined,
    };

    const match: SkillMatchResult = {
      skillId: skill.skillId,
      skillName: skill.skillName,
      matchedKeywords: ['技术服务合同'],
      confidence: 0.95,
      collectedParams: {},
      missingParams: ['delegated_party_name', 'final_payment_ratio'],
      paramsSchema: skill.paramsSchema,
      templateId: skill.templateId,
      carboneTemplateId: skill.carboneTemplateId,
      carboneSkillId: skill.carboneSkillId,
      executionFlowTemplateIds: skill.executionFlowTemplateIds,
      executionFlow: skill.executionFlow,
      apiEndpoints: skill.apiEndpoints,
      matchReason: 'test',
      goal: skill.goal,
      expectedResult: skill.expectedResult,
      outputParams: undefined,
    };

    jest
      .spyOn(plannerMatchPhaseService as any, 'loadAvailableSkills')
      .mockResolvedValue([skill] as AvailableSkillDefinition[]);
    jest.spyOn(plannerMatchPhaseService as any, 'matchSkill').mockResolvedValue(match);
    jest.spyOn(recognizerService, 'recognizeParams').mockResolvedValue({
      params: {},
      confidence: 0.9,
    });

    const plan = await service.generatePlan({
      request: {
        user_input: '帮我生成技术服务合同',
        user_id: 'u1',
        modelId: 'selected-model-id',
      } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    const delegatedParty = plan.required_inputs.find(
      (item) => item.name === 'delegated_party_name'
    );
    const finalPaymentRatio = plan.required_inputs.find(
      (item) => item.name === 'final_payment_ratio'
    );

    expect(delegatedParty?.display_name).toBe('委托方名称');
    expect(finalPaymentRatio?.display_name).toBe('尾款占总价的比例');
  });
});
