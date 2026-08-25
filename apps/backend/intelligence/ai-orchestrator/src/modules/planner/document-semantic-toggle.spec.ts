/* eslint-disable @typescript-eslint/no-var-requires -- modules are reloaded around feature-toggle changes */
describe('PlannerService document semantic bypass toggle', () => {
  const buildSkill = () => ({
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
        },
        '{#d.items}{/d.items}': {
          type: 'string',
          description: 'template loop marker',
          required: true,
        },
        'items[].deviceName': {
          type: 'string',
          description: '设备名称',
          required: true,
        },
        'items[].quantity': {
          type: 'int',
          description: '数量',
          required: true,
        },
        'deliveryItems[].date': {
          type: 'string',
          description: '交付日期',
          required: true,
        },
        'paymentSchedule[].amount': {
          type: 'number',
          description: '付款金额',
          required: true,
        },
      },
      required: [
        '__rowIndex',
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
      },
    },
    goal: 'Generate contract',
    expectedResult: 'Completed contract document',
    outputParams: undefined,
  });

  const buildMatch = (skill: any) => ({
    skillId: skill.skillId,
    skillName: skill.skillName,
    matchedKeywords: ['合同'],
    confidence: 0.95,
    collectedParams: {},
    missingParams: skill.paramsSchema.required,
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
  });

  it('does not classify a Temporal workflow as a document merely because it has template ids', () => {
    jest.resetModules();
    const { PlanSemanticService } = require('./plan');
    const service = new PlanSemanticService();

    expect(
      service.isDocumentTask({
        executionType: 'document',
        executionFlowTemplateIds: ['temporal-workflow-template'],
        apiEndpoints: {
          runtimeMetadata: { sourceType: 'temporal_workflow' },
        },
        paramsSchema: { properties: {} },
      } as any)
    ).toBe(false);
  });

  it('falls back to field-level required_inputs when semantic grouping is disabled', async () => {
    const originalValue = process.env.DOCUMENT_SEMANTIC_SUBAGENT_ENABLED;
    process.env.DOCUMENT_SEMANTIC_SUBAGENT_ENABLED = 'false';
    jest.resetModules();

    const { PlannerService } = require('./facade');
    const { PlannerMatchPhaseService } = require('./intent');
    const { PlannerPlanDraftService } = require('./planning');
    const { PlanGeneratorService, PlanSemanticService } = require('./plan');
    const {
      DeterministicParamResolverService,
      ParamBilingualService,
      ParamContextMergeService,
      ParamPolicyService,
      ParamRecognizerService,
      ParamRequiredInputPresentationService,
      ParamSchemaService,
      ParamValueService,
    } = require('./params');
    const { SkillCacheService, SkillMatcherService } = require('./skill');
    const recognizerService = { recognizeParams: jest.fn() };
    const modelService = { callModel: jest.fn() };
    const skillCacheService = new SkillCacheService();
    const paramSchemaService = new ParamSchemaService();
    const paramContextMergeService = new ParamContextMergeService();
    const paramBilingualService = new ParamBilingualService(modelService as any);
    const paramPolicyService = new ParamPolicyService();
    const paramValueService = new ParamValueService();
    const paramRequiredInputPresentationService = new ParamRequiredInputPresentationService();
    const plannerMatchPhaseService = new PlannerMatchPhaseService(
      skillCacheService,
      new SkillMatcherService(skillCacheService)
    );
    const plannerPlanDraftService = new PlannerPlanDraftService(
      recognizerService as any,
      new PlanSemanticService(),
      new PlanGeneratorService(),
      new ParamRecognizerService(
        paramSchemaService,
        paramContextMergeService,
        paramBilingualService,
        paramPolicyService,
        paramValueService,
        paramRequiredInputPresentationService
      ),
      new DeterministicParamResolverService()
    );
    const service = new PlannerService(plannerMatchPhaseService, plannerPlanDraftService);

    const skill = buildSkill();
    const match = buildMatch(skill);

    jest.spyOn(plannerMatchPhaseService as any, 'loadAvailableSkills').mockResolvedValue([skill]);
    jest.spyOn(plannerMatchPhaseService as any, 'matchSkill').mockResolvedValue(match);
    jest
      .spyOn(recognizerService, 'recognizeParams')
      .mockResolvedValue({ params: {}, confidence: 0.1 });

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

    expect(plan.semantic).toBeUndefined();
    expect(
      plan.required_inputs.some((item: { name: string }) => item.name === '{#d.items}{/d.items}')
    ).toBe(false);
    expect(plan.required_inputs.some((item: { name: string }) => item.name === '__rowIndex')).toBe(
      false
    );

    process.env.DOCUMENT_SEMANTIC_SUBAGENT_ENABLED = originalValue;
  });
});
