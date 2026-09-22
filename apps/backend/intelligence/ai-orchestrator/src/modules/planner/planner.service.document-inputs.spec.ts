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

  it('treats empty document arrays and null-only date arrays as missing inputs instead of executable values', async () => {
    const skill: AvailableSkillDefinition = {
      skillId: 'purchase-contract',
      skillName: '采购合同文档生成',
      description: '生成采购合同文档',
      triggerKeywords: ['采购合同'],
      paramsSchema: {
        properties: {
          'items[].code': {
            type: 'string',
            description: '设备物料编码',
          } as any,
          'items[].spec': {
            type: 'string',
            description: '设备规格型号',
          } as any,
          'deliveryItems[].arrivalDate': {
            type: 'date',
            description: '计划到货日期',
          } as any,
          'items[].name': {
            type: 'string',
            description: '设备名称',
          } as any,
        },
        required: ['items[].code', 'items[].spec', 'deliveryItems[].arrivalDate', 'items[].name'],
      },
      templateId: 'tpl-purchase-contract',
      carboneTemplateId: 'tpl-purchase-contract',
      carboneSkillId: 'carbone-skill-purchase-contract',
      executionFlowTemplateIds: [],
      executionFlow: [],
      apiEndpoints: undefined,
      goal: 'Generate purchase contract document',
      expectedResult: 'Generated purchase contract document',
      outputParams: undefined,
    };

    const match: SkillMatchResult = {
      skillId: skill.skillId,
      skillName: skill.skillName,
      matchedKeywords: ['采购合同'],
      confidence: 0.95,
      collectedParams: {},
      missingParams: ['items[].code', 'items[].spec', 'deliveryItems[].arrivalDate'],
      paramsSchema: skill.paramsSchema,
      templateId: skill.templateId,
      carboneTemplateId: skill.carboneTemplateId,
      carboneSkillId: skill.carboneSkillId,
      executionFlowTemplateIds: [],
      executionFlow: [],
      apiEndpoints: undefined,
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
        'items[].code': [],
        'items[].spec': [],
        'deliveryItems[].arrivalDate': [null],
        'items[].name': ['六轴机械臂'],
      },
      confidence: 0.91,
    });

    const plan = await service.generatePlan({
      request: { user_input: '生成采购合同', user_id: 'u1', modelId: 'selected-model-id' } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    const code = plan.required_inputs.find((i) => i.name === 'items[].code');
    const spec = plan.required_inputs.find((i) => i.name === 'items[].spec');
    const arrivalDate = plan.required_inputs.find((i) => i.name === 'deliveryItems[].arrivalDate');
    const name = plan.required_inputs.find((i) => i.name === 'items[].name');

    expect(code?.missing).toBe(true);
    expect(code?.value).toBeUndefined();
    expect(code?.source).toBe('unresolved');
    expect(spec?.missing).toBe(true);
    expect(spec?.value).toBeUndefined();
    expect(arrivalDate?.missing).toBe(true);
    expect(arrivalDate?.value).toBeUndefined();
    expect(name?.missing).toBe(false);
    expect(name?.value).toEqual(['六轴机械臂']);

    expect(plan.steps.some((step) => step.kind === 'human_input')).toBe(true);
  });

  it('marks partially filled document array groups as missing until row counts are aligned', async () => {
    const skill: AvailableSkillDefinition = {
      skillId: 'purchase-contract',
      skillName: '采购合同文档生成',
      description: '生成采购合同文档',
      triggerKeywords: ['采购合同'],
      paramsSchema: {
        properties: {
          'items[].name': {
            type: 'string',
            description: '设备名称',
          } as any,
          'items[].unit': {
            type: 'string',
            description: '计量单位',
          } as any,
          'items[].unit_price': {
            type: 'number',
            description: '含税单价',
          } as any,
        },
        required: ['items[].name', 'items[].unit', 'items[].unit_price'],
      },
      templateId: 'tpl-purchase-contract',
      carboneTemplateId: 'tpl-purchase-contract',
      carboneSkillId: 'carbone-skill-purchase-contract',
      executionFlowTemplateIds: [],
      executionFlow: [],
      apiEndpoints: undefined,
      goal: 'Generate purchase contract document',
      expectedResult: 'Generated purchase contract document',
      outputParams: undefined,
    };

    const match: SkillMatchResult = {
      skillId: skill.skillId,
      skillName: skill.skillName,
      matchedKeywords: ['采购合同'],
      confidence: 0.95,
      collectedParams: {},
      missingParams: ['items[].unit_price'],
      paramsSchema: skill.paramsSchema,
      templateId: skill.templateId,
      carboneTemplateId: skill.carboneTemplateId,
      carboneSkillId: skill.carboneSkillId,
      executionFlowTemplateIds: [],
      executionFlow: [],
      apiEndpoints: undefined,
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
        'items[].name': ['六轴机械臂', '视觉检测系统', 'PLC 控制柜'],
        'items[].unit': ['台', '套', '套'],
        'items[].unit_price': [120000],
      },
      confidence: 0.93,
    });

    const plan = await service.generatePlan({
      request: { user_input: '生成采购合同', user_id: 'u1', modelId: 'selected-model-id' } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    const unitPrice = plan.required_inputs.find((i) => i.name === 'items[].unit_price');
    const name = plan.required_inputs.find((i) => i.name === 'items[].name');

    expect(unitPrice?.value).toEqual([120000]);
    expect(unitPrice?.source).toBe('user_input');
    expect(unitPrice?.missing).toBe(true);
    expect(unitPrice?.needs_confirmation).toBe(true);
    expect(unitPrice?.missing_reason).toBe('partial_group');
    expect(unitPrice?.description).toContain('当前仅识别 1/3 条');
    expect(unitPrice?.description).toContain('同组数组条数尚未对齐');
    expect(name?.missing).toBe(false);
  });

  it('keeps optional loop columns non-blocking when omitted from an otherwise complete required loop', async () => {
    const skill: AvailableSkillDefinition = {
      skillId: 'purchase-contract',
      skillName: '采购合同文档生成',
      description: '生成采购合同文档',
      triggerKeywords: ['采购合同'],
      paramsSchema: {
        properties: {
          'items[].code': { type: 'string', description: '设备物料编码' } as any,
          'items[].name': { type: 'string', description: '设备名称' } as any,
          'items[].spec': { type: 'string', description: '设备规格型号' } as any,
          'items[].quantity': { type: 'number', description: '采购数量' } as any,
          'items[].subtotal': { type: 'number', description: '小计金额' } as any,
          'items[].unit': { type: 'string', description: '设备单位', default: '' } as any,
          'items[].unit_price': { type: 'number', description: '设备单价', default: '' } as any,
        },
        required: [
          'items[].code',
          'items[].name',
          'items[].spec',
          'items[].quantity',
          'items[].subtotal',
        ],
      },
      templateId: 'tpl-purchase-contract',
      carboneTemplateId: 'tpl-purchase-contract',
      carboneSkillId: 'carbone-skill-purchase-contract',
      executionFlowTemplateIds: [],
      executionFlow: [],
      apiEndpoints: undefined,
      goal: 'Generate purchase contract document',
      expectedResult: 'Generated purchase contract document',
      outputParams: undefined,
    };

    const match: SkillMatchResult = {
      skillId: skill.skillId,
      skillName: skill.skillName,
      matchedKeywords: ['采购合同'],
      confidence: 0.95,
      collectedParams: {},
      missingParams: [],
      paramsSchema: skill.paramsSchema,
      templateId: skill.templateId,
      carboneTemplateId: skill.carboneTemplateId,
      carboneSkillId: skill.carboneSkillId,
      executionFlowTemplateIds: [],
      executionFlow: [],
      apiEndpoints: undefined,
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
        'items[].code': ['A001', 'B002'],
        'items[].name': ['六轴机械臂', '视觉检测系统'],
        'items[].spec': ['XR-6A', 'VS-900'],
        'items[].quantity': [2, 1],
        'items[].subtotal': [240000, 80000],
      },
      confidence: 0.95,
    });

    const plan = await service.generatePlan({
      request: { user_input: '生成采购合同', user_id: 'u1', modelId: 'selected-model-id' } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    const unit = plan.required_inputs.find((i) => i.name === 'items[].unit');
    const unitPrice = plan.required_inputs.find((i) => i.name === 'items[].unit_price');

    expect(unit?.required).toBe(false);
    expect(unit?.value).toBeUndefined();
    expect(unit?.source).toBe('unresolved');
    expect(unit?.missing).toBe(false);
    expect(unit?.missing_reason).toBeUndefined();
    expect(unitPrice?.required).toBe(false);
    expect(unitPrice?.value).toBeUndefined();
    expect(unitPrice?.source).toBe('unresolved');
    expect(unitPrice?.missing).toBe(false);
    expect(unitPrice?.missing_reason).toBeUndefined();
    expect(plan.steps.some((step) => step.kind === 'human_input')).toBe(false);
  });

  it('does not block execution for low-confidence optional loop values when preview blocking is not enabled', async () => {
    const skill: AvailableSkillDefinition = {
      skillId: 'purchase-contract',
      skillName: '采购合同文档生成',
      description: '生成采购合同文档',
      triggerKeywords: ['采购合同'],
      paramsSchema: {
        properties: {
          subject: { type: 'string', description: '采购范围' } as any,
          'paymentSchedule[].paymentStage': {
            type: 'string',
            description: '付款阶段标识',
          } as any,
        },
        required: ['subject'],
      },
      templateId: 'tpl-purchase-contract',
      carboneTemplateId: 'tpl-purchase-contract',
      carboneSkillId: 'carbone-skill-purchase-contract',
      executionFlowTemplateIds: [],
      executionFlow: [],
      apiEndpoints: undefined,
      goal: 'Generate purchase contract document',
      expectedResult: 'Generated purchase contract document',
      outputParams: undefined,
    };

    const match: SkillMatchResult = {
      skillId: skill.skillId,
      skillName: skill.skillName,
      matchedKeywords: ['采购合同'],
      confidence: 0.95,
      collectedParams: {},
      missingParams: [],
      paramsSchema: skill.paramsSchema,
      templateId: skill.templateId,
      carboneTemplateId: skill.carboneTemplateId,
      carboneSkillId: skill.carboneSkillId,
      executionFlowTemplateIds: [],
      executionFlow: [],
      apiEndpoints: undefined,
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
        subject: '采购机械臂并安装',
        'paymentSchedule[].paymentStage': ['2026-06-20'],
      },
      confidence: 0.93,
      field_confidences: {
        subject: 1,
        'paymentSchedule[].paymentStage': 0,
      },
      uncertain_fields: ['paymentSchedule[].paymentStage'],
    });

    const plan = await service.generatePlan({
      request: { user_input: '生成采购合同', user_id: 'u1', modelId: 'selected-model-id' } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    const paymentStage = plan.required_inputs.find(
      (i) => i.name === 'paymentSchedule[].paymentStage'
    );

    expect(paymentStage?.required).toBe(false);
    expect(paymentStage?.value).toEqual(['2026-06-20']);
    expect(paymentStage?.needs_confirmation).toBe(false);
    expect(paymentStage?.missing).toBe(false);
    expect(paymentStage?.missing_reason).toBeUndefined();
    expect(plan.steps.some((step) => step.kind === 'human_input')).toBe(false);
  });

  it('asks for confirmation when the overall recognition confidence is too low', async () => {
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
      .spyOn(plannerMatchPhaseService as any, 'loadAvailableSkills')
      .mockResolvedValue([skill] as AvailableSkillDefinition[]);
    jest.spyOn(plannerMatchPhaseService as any, 'matchSkill').mockResolvedValue(match);

    jest.spyOn(recognizerService, 'recognizeParams').mockResolvedValue({
      params: {
        target: '工业产值',
      },
      confidence: 0.3,
    });

    const plan = await service.generatePlan({
      request: { user_input: '帮我查工业产值', user_id: 'u1', modelId: 'selected-model-id' } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    const target = plan.required_inputs.find((i) => i.name === 'target');
    expect(target?.value).toBe('工业产值');
    expect(target?.missing).toBe(true);
    expect(target?.needs_confirmation).toBe(true);
    expect(target?.missing_reason).toBe('overall_low_confidence');
  });

  it('does not let low overall confidence override a high-confidence field value', async () => {
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
      .spyOn(plannerMatchPhaseService as any, 'loadAvailableSkills')
      .mockResolvedValue([skill] as AvailableSkillDefinition[]);
    jest.spyOn(plannerMatchPhaseService as any, 'matchSkill').mockResolvedValue(match);
    jest.spyOn(recognizerService, 'recognizeParams').mockResolvedValue({
      params: {
        target: '工业产值',
      },
      confidence: 0.3,
      field_confidences: {
        target: 0.96,
      },
    });

    const plan = await service.generatePlan({
      request: { user_input: '帮我查工业产值', user_id: 'u1', modelId: 'selected-model-id' } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    const target = plan.required_inputs.find((i) => i.name === 'target');
    expect(target?.value).toBe('工业产值');
    expect(target?.missing).toBe(false);
    expect(target?.needs_confirmation).toBe(false);
    expect(target?.missing_reason).toBeUndefined();
  });

  it('fills bilingual *_cn/*_jp params during the planner recognition phase', async () => {
    const skill: AvailableSkillDefinition = {
      skillId: 'document-contract',
      skillName: 'documentContractService',
      description: 'Generate contract document',
      triggerKeywords: ['合同'],
      paramsSchema: {
        properties: {
          acceptance_days_cn: {
            type: 'number',
            description: '验收期限天数（中文）',
          } as any,
          acceptance_days_jp: {
            type: 'number',
            description: '验收期限天数（日文）',
          } as any,
          contract_partyA_cn: {
            type: 'string',
            description: '委托方名称（中文）',
          } as any,
          contract_partyA_jp: {
            type: 'string',
            description: '委托方名称（日文）',
          } as any,
        },
        required: [
          'acceptance_days_cn',
          'acceptance_days_jp',
          'contract_partyA_cn',
          'contract_partyA_jp',
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
      confidence: 0.9,
      collectedParams: {},
      missingParams: [],
      paramsSchema: skill.paramsSchema,
      templateId: skill.templateId,
      carboneTemplateId: skill.carboneTemplateId,
      carboneSkillId: skill.carboneSkillId,
      executionFlowTemplateIds: skill.executionFlowTemplateIds || [],
      executionFlow: skill.executionFlow || [],
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
        acceptance_days_cn: 30,
        contract_partyA_cn: '广州日产通商贸易有限公司',
      },
      confidence: 0.92,
      field_confidences: {
        acceptance_days_cn: 0.95,
        contract_partyA_cn: 0.97,
      },
    });
    modelService.callModel.mockResolvedValue({
      content: JSON.stringify({
        contract_partyA_jp: '広州日産通商貿易有限公司',
      }),
      usage: undefined,
    });

    const plan = await service.generatePlan({
      request: {
        user_input: '创建技术服务合同 验收期限为30天，委托方名称为广州日产通商贸易有限公司',
        user_id: 'u1',
        modelId: 'selected-model-id',
      } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    const acceptanceCn = plan.required_inputs.find((i) => i.name === 'acceptance_days_cn');
    const acceptanceJp = plan.required_inputs.find((i) => i.name === 'acceptance_days_jp');
    const partyACn = plan.required_inputs.find((i) => i.name === 'contract_partyA_cn');
    const partyAJp = plan.required_inputs.find((i) => i.name === 'contract_partyA_jp');

    expect(acceptanceCn?.missing).toBe(false);
    expect(acceptanceJp?.missing).toBe(false);
    expect(acceptanceJp?.value).toBe(30);
    expect(partyACn?.missing).toBe(false);
    expect(partyAJp?.missing).toBe(false);
    expect(partyAJp?.value).toBe('広州日産通商貿易有限公司');
    expect(modelService.callModel).toHaveBeenCalledTimes(1);
  });

  it('fills bilingual *_cn/*_en params during the planner recognition phase', async () => {
    const skill: AvailableSkillDefinition = {
      skillId: 'document-contract-en',
      skillName: 'documentContractServiceEn',
      description: 'Generate contract document (CN/EN)',
      triggerKeywords: ['合同'],
      paramsSchema: {
        properties: {
          contract_partyA_cn: {
            type: 'string',
            description: '委托方名称（中文）',
          } as any,
          contract_partyA_en: {
            type: 'string',
            description: '委托方名称（英文）',
          } as any,
          acceptance_days_cn: {
            type: 'number',
            description: '验收期限天数（中文）',
          } as any,
          acceptance_days_en: {
            type: 'number',
            description: '验收期限天数（英文）',
          } as any,
        },
        required: [
          'acceptance_days_cn',
          'acceptance_days_en',
          'contract_partyA_cn',
          'contract_partyA_en',
        ],
      },
      templateId: 'tpl-contract-en',
      carboneTemplateId: 'carbone-tpl-en',
      carboneSkillId: 'carbone-skill-en',
      executionFlowTemplateIds: ['flow-en'],
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
      confidence: 0.9,
      collectedParams: {},
      missingParams: [],
      paramsSchema: skill.paramsSchema,
      templateId: skill.templateId,
      carboneTemplateId: skill.carboneTemplateId,
      carboneSkillId: skill.carboneSkillId,
      executionFlowTemplateIds: skill.executionFlowTemplateIds || [],
      executionFlow: skill.executionFlow || [],
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
        acceptance_days_cn: 30,
        contract_partyA_cn: '广州日产通商贸易有限公司',
      },
      confidence: 0.92,
      field_confidences: {
        acceptance_days_cn: 0.95,
        contract_partyA_cn: 0.97,
      },
    });
    modelService.callModel.mockResolvedValue({
      content: JSON.stringify({
        contract_partyA_en: 'Guangzhou Nissan Trading Co., Ltd.',
      }),
      usage: undefined,
    });

    const plan = await service.generatePlan({
      request: {
        user_input: '创建技术服务合同 验收期限为30天，委托方名称为广州日产通商贸易有限公司',
        user_id: 'u1',
        modelId: 'selected-model-id',
      } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    const acceptanceCn = plan.required_inputs.find((i) => i.name === 'acceptance_days_cn');
    const acceptanceEn = plan.required_inputs.find((i) => i.name === 'acceptance_days_en');
    const partyACn = plan.required_inputs.find((i) => i.name === 'contract_partyA_cn');
    const partyAEn = plan.required_inputs.find((i) => i.name === 'contract_partyA_en');

    expect(acceptanceCn?.missing).toBe(false);
    expect(acceptanceEn?.missing).toBe(false);
    expect(acceptanceEn?.value).toBe(30);
    expect(partyACn?.missing).toBe(false);
    expect(partyAEn?.missing).toBe(false);
    expect(partyAEn?.value).toBe('Guangzhou Nissan Trading Co., Ltd.');
    expect(modelService.callModel).toHaveBeenCalledTimes(1);
  });

  it('respects schema-provided confirmation threshold before asking user to confirm', async () => {
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
            confirmationThreshold: 0.9,
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
      .spyOn(plannerMatchPhaseService as any, 'loadAvailableSkills')
      .mockResolvedValue([skill] as AvailableSkillDefinition[]);
    jest.spyOn(plannerMatchPhaseService as any, 'matchSkill').mockResolvedValue(match);
    jest.spyOn(recognizerService, 'recognizeParams').mockResolvedValue({
      params: {
        target: '工业产值',
      },
      confidence: 0.92,
      field_confidences: {
        target: 0.82,
      },
    });

    const plan = await service.generatePlan({
      request: { user_input: '帮我查工业产值', user_id: 'u1', modelId: 'selected-model-id' } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    const target = plan.required_inputs.find((i) => i.name === 'target');
    expect(target?.confirmation_threshold).toBe(0.9);
    expect(target?.missing).toBe(true);
    expect(target?.missing_reason).toBe('low_confidence');
  });

  it('passes semantic and display metadata through to recognizer for real planner execution', async () => {
    const skill: AvailableSkillDefinition = {
      skillId: 'document-contract',
      skillName: 'documentContractService',
      description: 'Generate contract document',
      triggerKeywords: ['合同', '采购'],
      paramsSchema: {
        properties: {
          'paymentSchedule[].amount': {
            type: 'number',
            description: '付款金额',
            required: true,
            semanticRole: 'payment_amount',
            extractionHints: ['付款节点金额', '每期应付金额'],
            displayName: '付款金额',
            groupLabel: '付款计划',
            renderPath: 'payment.schedule.amount',
            previewBlocking: false,
            confirmationThreshold: 0.82,
          } as any,
        },
        required: ['paymentSchedule[].amount'],
      },
      templateId: 'tpl-contract',
      carboneTemplateId: 'carbone-tpl-1',
      carboneSkillId: 'carbone-skill-1',
      executionFlowTemplateIds: ['flow-1'],
      executionFlow: ['document_render'],
      apiEndpoints: {
        runtimeMetadata: {
          sourceType: 'document',
          workflowInputPolicy: {
            params: {
              'paymentSchedule[].amount': {
                templateBinding: 'contract.payment.amount',
              },
            },
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

    expect(recognizerService.recognizeParams).toHaveBeenCalledWith(
      expect.objectContaining({
        params_schema: {
          properties: {
            'paymentSchedule[].amount': expect.objectContaining({
              semanticRole: 'payment_amount',
              extractionHints: ['付款节点金额', '每期应付金额'],
              displayName: '付款金额',
              groupLabel: '付款计划',
              previewBlocking: false,
              confirmationThreshold: 0.82,
            }),
          },
          required: ['paymentSchedule[].amount'],
        },
      })
    );
    const amountResolution = (plan.metadata?.execution_snapshot as any)?.normalizedInputJson
      ?.paramResolution?.['paymentSchedule[].amount'];
    expect(amountResolution).toEqual(
      expect.objectContaining({
        display_name: '付款金额',
        group_label: '付款计划',
        render_path: 'payment.schedule.amount',
        template_binding: 'contract.payment.amount',
      })
    );
    expect(amountResolution?.displayName).toBeUndefined();
    expect(amountResolution?.groupLabel).toBeUndefined();
    expect(amountResolution?.previewBlocking).toBeUndefined();
  });
});
