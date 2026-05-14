import { PlannerService } from './planner.service';
import { RecognizerService } from '../recognizer/recognizer.service';
import { AvailableSkillDefinition, SkillMatchResult } from '../react-engine/interfaces';

describe('PlannerService - required inputs without hardcoded defaults', () => {
  let service: PlannerService;
  let recognizerService: { recognizeParams: jest.Mock };

  beforeEach(() => {
    recognizerService = {
      recognizeParams: jest.fn(),
    };
    service = new PlannerService(recognizerService as unknown as RecognizerService);
  });

  it('marks required params as missing and applies defaults only to optional params', async () => {
    const skill: AvailableSkillDefinition = {
      skillId: 'generic-query',
      skillName: 'genericQueryService',
      description: 'Query external data by target',
      triggerKeywords: ['查询', '检索'],
      paramsSchema: {
        properties: {
          target: {
            type: 'string',
            description: '查询目标',
            default: 'default-target',
          } as any,
          units: {
            type: 'string',
            description: '单位',
            default: 'metric',
          } as any,
        },
        required: ['target'],
      },
      templateId: 'tpl-generic-query',
      carboneTemplateId: undefined,
      carboneSkillId: undefined,
      executionFlowTemplateIds: [],
      executionFlow: [],
      apiEndpoints: undefined,
      goal: 'Get current external data',
      expectedResult: 'Current result for the requested target',
      outputParams: undefined,
    };

    const match: SkillMatchResult = {
      skillId: skill.skillId,
      skillName: skill.skillName,
      matchedKeywords: ['查询'],
      confidence: 0.9,
      collectedParams: {},
      missingParams: ['target'],
      paramsSchema: skill.paramsSchema,
      templateId: skill.templateId,
      carboneTemplateId: undefined,
      carboneSkillId: undefined,
      executionFlowTemplateIds: [],
      executionFlow: [],
      apiEndpoints: undefined,
      matchReason: 'test',
      goal: skill.goal,
      expectedResult: skill.expectedResult,
      outputParams: undefined,
    };

    jest
      .spyOn(service as any, 'loadAvailableSkills')
      .mockResolvedValue([skill] as AvailableSkillDefinition[]);
    jest.spyOn(service as any, 'matchSkill').mockResolvedValue(match);

    jest.spyOn(recognizerService, 'recognizeParams').mockResolvedValue({
      params: {},
      confidence: 0.2,
    });

    const plan = await service.generatePlan({
      request: { user_input: '帮我查一下这个目标的数据', user_id: 'u1', modelId: 'selected-model-id' } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    const draft = plan;
    const target = draft.required_inputs.find((i) => i.name === 'target');
    const units = draft.required_inputs.find((i) => i.name === 'units');

    expect(target).toBeDefined();
    expect(target?.required).toBe(true);
    expect(target?.value).toBeUndefined();
    expect(target?.missing).toBe(true);
    expect(target?.source).toBe('unresolved');

    expect(units).toBeDefined();
    expect(units?.required).toBe(false);
    expect(units?.value).toBe('metric');
    expect(units?.missing).toBe(false);
    expect(units?.source).toBe('default');

    const collectStep = draft.steps.find((s) => s.kind === 'human_input');
    expect(collectStep).toBeDefined();
    expect(draft.risk_summary.requires_human_review).toBe(false);
    expect(recognizerService.recognizeParams).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'selected-model-id',
      }),
    );
  });

  it('merges required inputs from linked execution flow template schema without hardcoding', () => {
    const merged = (service as any).mergeParamsSchemas(
      {
        properties: {
          target: {
            type: 'string',
            description: '目标对象',
            required: false,
          },
        },
        required: [],
      },
      {
        properties: {
          target: {
            type: 'string',
            description: '目标对象标识',
            required: true,
          },
          units: {
            type: 'string',
            description: '单位',
            required: false,
            default: 'metric',
          },
        },
        required: ['target'],
      },
    );

    expect(merged.required).toEqual(['target']);
    expect(merged.properties.target.required).toBe(true);
    expect(merged.properties.target.description).toBe('目标对象');
    expect(merged.properties.units.required).toBe(false);
    expect(merged.properties.units.default).toBe('metric');
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
      executionFlow: ['generate_parameters', 'document_render'],
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
      .spyOn(service as any, 'loadAvailableSkills')
      .mockResolvedValue([skill] as AvailableSkillDefinition[]);
    jest.spyOn(service as any, 'matchSkill').mockResolvedValue(match);
    jest.spyOn(recognizerService, 'recognizeParams').mockResolvedValue({
      params: {},
      confidence: 0.1,
    });

    const plan = await service.generatePlan({
      request: { user_input: '帮我生成采购合同', user_id: 'u1', modelId: 'selected-model-id' } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    expect(plan.required_inputs.some((item) => item.name === '{#d.items}{/d.items}')).toBe(false);
    expect(plan.semantic?.mode).toBe('complex_document');
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
      ]),
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
        required: [
          '{#d.items}{/d.items}',
          'items[].deviceName',
          'deliveryItems[].date',
        ],
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
      .spyOn(service as any, 'loadAvailableSkills')
      .mockResolvedValue([skill] as AvailableSkillDefinition[]);
    jest.spyOn(service as any, 'matchSkill').mockResolvedValue(match);
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
      ]),
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
          '__rowIndex': {
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
      executionFlow: ['generate_parameters', 'document_render'],
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
      .spyOn(service as any, 'loadAvailableSkills')
      .mockResolvedValue([skill] as AvailableSkillDefinition[]);
    jest.spyOn(service as any, 'matchSkill').mockResolvedValue(match);
    jest.spyOn(recognizerService, 'recognizeParams').mockResolvedValue({
      params: {
        'items[].deviceName': '设备A',
        'items[].quantity': 10,
        'deliveryItems[].date': '2026-05-14',
        isUrgent: false,
      },
      confidence: 0.2,
    });

    const plan = await service.generatePlan({
      request: { user_input: '帮我生成采购合同', user_id: 'u1', modelId: 'selected-model-id' } as any,
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
});
