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
      .spyOn(plannerMatchPhaseService as any, 'loadAvailableSkills')
      .mockResolvedValue([skill] as AvailableSkillDefinition[]);
    jest.spyOn(plannerMatchPhaseService as any, 'matchSkill').mockResolvedValue(match);

    jest.spyOn(recognizerService, 'recognizeParams').mockResolvedValue({
      params: {},
      confidence: 0.2,
    });

    const plan = await service.generatePlan({
      request: {
        user_input: '帮我查一下这个目标的数据',
        user_id: 'u1',
        modelId: 'selected-model-id',
      } as any,
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
    expect(plan.metadata?.execution_snapshot).toEqual({
      normalizedInputJson: {
        input: {
          units: 'metric',
        },
        paramResolution: {
          target: expect.objectContaining({
            value: null,
            source: 'unresolved',
            required: true,
            missing: true,
            confirmed: false,
          }),
          units: expect.objectContaining({
            value: 'metric',
            source: 'default',
            required: false,
            missing: false,
            confirmed: true,
          }),
        },
        requiredInputs: expect.any(Array),
      },
    });

    const collectStep = draft.steps.find((s) => s.kind === 'human_input');
    expect(collectStep).toBeDefined();
    expect(draft.risk_summary.requires_human_review).toBe(false);
    expect(recognizerService.recognizeParams).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'selected-model-id',
        guide_context: undefined,
        params_schema: expect.objectContaining({
          properties: expect.objectContaining({
            target: expect.not.objectContaining({
              default: expect.anything(),
            }),
            units: expect.not.objectContaining({
              default: expect.anything(),
            }),
          }),
        }),
      })
    );
  });

  it('prefers workflow input policy over deprecated schema strategy fields', async () => {
    const skill: AvailableSkillDefinition = {
      skillId: 'document-contract',
      skillName: 'documentContractService',
      description: 'Generate contract document',
      triggerKeywords: ['合同'],
      paramsSchema: {
        properties: {
          target: {
            type: 'string',
            description: '合同主体',
            required: true,
            default: 'schema-target',
            previewBlocking: true,
            confirmationThreshold: 0.2,
          } as any,
          notes: {
            type: 'string',
            description: '备注',
            default: 'schema-notes',
          } as any,
        },
        required: ['target'],
      },
      templateId: 'tpl-contract',
      carboneTemplateId: undefined,
      carboneSkillId: undefined,
      executionFlowTemplateIds: ['flow-1'],
      executionFlow: ['document_render'],
      apiEndpoints: {
        runtimeMetadata: {
          sourceType: 'document',
          workflowInputPolicy: {
            params: {
              target: {
                enabled: true,
                requiredMode: 'optional',
                defaultValue: 'workflow-target',
                valueSourcePriority: ['user_input', 'workflow_default'],
                confirmationThreshold: 0.95,
                previewBlocking: false,
              },
              notes: {
                enabled: false,
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
      confidence: 0.9,
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
      outputParams: skill.outputParams,
    };

    jest
      .spyOn(plannerMatchPhaseService as any, 'loadAvailableSkills')
      .mockResolvedValue([skill] as AvailableSkillDefinition[]);
    const hydratedMatch = skillMatcherService.hydrateMatchedSkill(match, [skill]) || match;
    jest.spyOn(plannerMatchPhaseService as any, 'matchSkill').mockResolvedValue(hydratedMatch);
    jest.spyOn(recognizerService, 'recognizeParams').mockResolvedValue({
      params: {},
      confidence: 0.9,
    });

    const plan = await service.generatePlan({
      request: { user_input: '帮我生成合同', user_id: 'u1', modelId: 'selected-model-id' } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    const target = plan.required_inputs.find((item) => item.name === 'target');
    expect(target).toEqual(
      expect.objectContaining({
        required: false,
        required_mode: 'optional',
        value: 'workflow-target',
        source: 'workflow_default',
        source_priority: ['user_input', 'workflow_default'],
        missing: false,
        confirmation_threshold: 0.95,
        preview_blocking: false,
      })
    );
    expect(plan.required_inputs.some((item) => item.name === 'notes')).toBe(false);
    expect(plan.metadata?.execution_snapshot).toEqual({
      normalizedInputJson: expect.objectContaining({
        input: {
          target: 'workflow-target',
        },
        paramResolution: {
          target: expect.objectContaining({
            source: 'workflow_default',
            required: false,
            requiredMode: 'optional',
            valueSourcePriority: ['user_input', 'workflow_default'],
            final: true,
          }),
        },
        requiredInputs: expect.any(Array),
      }),
    });
  });

  it('normalizes workflow defaults to their declared JSON Schema scalar type', async () => {
    const skill: AvailableSkillDefinition = {
      skillId: 'typed-default-query',
      skillName: 'typedDefaultQuery',
      description: 'Query with a typed limit',
      triggerKeywords: ['query'],
      paramsSchema: {
        properties: {
          limit: { type: 'integer', description: 'Maximum result count' } as any,
        },
        required: [],
      },
      templateId: 'typed-default-query',
      carboneTemplateId: undefined,
      carboneSkillId: undefined,
      executionFlowTemplateIds: [],
      executionFlow: [],
      apiEndpoints: {
        runtimeMetadata: {
          sourceType: 'temporal_workflow',
          workflowInputPolicy: {
            params: {
              limit: { enabled: true, requiredMode: 'optional', defaultValue: '10' },
            },
          },
        },
      } as any,
      goal: 'Query',
      expectedResult: 'Results',
      outputParams: undefined,
    };
    const match: SkillMatchResult = {
      skillId: skill.skillId,
      skillName: skill.skillName,
      matchedKeywords: ['query'],
      confidence: 0.9,
      collectedParams: {},
      missingParams: [],
      paramsSchema: skill.paramsSchema,
      executionFlowTemplateIds: [],
      executionFlow: [],
      apiEndpoints: skill.apiEndpoints,
      matchReason: 'test',
      goal: skill.goal,
      expectedResult: skill.expectedResult,
      outputParams: undefined,
    };

    jest.spyOn(plannerMatchPhaseService as any, 'loadAvailableSkills').mockResolvedValue([skill]);
    jest.spyOn(plannerMatchPhaseService as any, 'matchSkill').mockResolvedValue(match);
    jest.spyOn(recognizerService, 'recognizeParams').mockResolvedValue({
      params: {},
      confidence: 0.9,
    });

    const plan = await service.generatePlan({
      request: { user_input: 'query', user_id: 'u1', modelId: 'selected-model-id' } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-typed-default',
    });

    expect(plan.required_inputs.find((item) => item.name === 'limit')).toEqual(
      expect.objectContaining({ value: 10, source: 'workflow_default' })
    );
  });

  it('does not treat empty placeholder defaults as meaningful optional values', async () => {
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
          notes: {
            type: 'string',
            description: '备注',
            default: '',
          } as any,
          signDate: {
            type: 'date',
            description: '签订日期',
            default: '',
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
      confidence: 0.95,
    });

    const plan = await service.generatePlan({
      request: { user_input: '帮我查工业产值', user_id: 'u1', modelId: 'selected-model-id' } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    const notes = plan.required_inputs.find((i) => i.name === 'notes');
    const signDate = plan.required_inputs.find((i) => i.name === 'signDate');

    expect(notes?.required).toBe(false);
    expect(notes?.value).toBeUndefined();
    expect(notes?.source).toBe('unresolved');
    expect(notes?.missing).toBe(false);
    expect(signDate?.value).toBeUndefined();
    expect(signDate?.source).toBe('unresolved');
    expect(signDate?.missing).toBe(false);
  });

  it('keeps required fields unresolved even if deprecated auto-fill context is present', async () => {
    const skill: AvailableSkillDefinition = {
      skillId: 'skill-contract',
      skillName: 'contractService',
      description: 'Generate contract',
      triggerKeywords: ['合同'],
      paramsSchema: {
        properties: {
          partyA: {
            type: 'string',
            description: '甲方名称',
            required: true,
          } as any,
          amount: {
            type: 'number',
            description: '合同金额',
            required: true,
          } as any,
        },
        required: ['partyA', 'amount'],
      },
      templateId: 'tpl-contract',
      carboneTemplateId: 'tpl-contract',
      carboneSkillId: 'carbone-contract',
      executionFlowTemplateIds: [],
      executionFlow: ['document_render'],
      apiEndpoints: {
        runtimeMetadata: {
          sourceType: 'document',
        },
      } as any,
      goal: 'Generate contract',
      expectedResult: 'Contract document',
      outputParams: undefined,
    };

    const match: SkillMatchResult = {
      skillId: skill.skillId,
      skillName: skill.skillName,
      matchedKeywords: ['合同'],
      confidence: 0.95,
      collectedParams: {},
      missingParams: ['partyA', 'amount'],
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
        user_input: '直接端对端生成合同',
        user_id: 'u1',
        modelId: 'selected-model-id',
        context: {
          auto_fill_missing_required: true,
        },
      } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-deprecated-autofill',
    });

    const partyA = plan.required_inputs.find((item) => item.name === 'partyA');
    const amount = plan.required_inputs.find((item) => item.name === 'amount');

    expect(partyA?.value).toBeUndefined();
    expect(partyA?.missing).toBe(true);
    expect(partyA?.source).toBe('unresolved');
    expect(amount?.value).toBeUndefined();
    expect(amount?.missing).toBe(true);
    expect(amount?.source).toBe('unresolved');
  });

  it('locks waiting_input resume to the provided target skill instead of re-matching skills', async () => {
    const skills: AvailableSkillDefinition[] = [
      {
        skillId: 'skill-contract',
        skillName: 'contractService',
        description: 'Generate contract',
        triggerKeywords: ['合同'],
        paramsSchema: {
          properties: {
            'info.partyA': {
              type: 'string',
              description: '甲方名称',
              required: true,
            } as any,
          },
          required: ['info.partyA'],
        },
        templateId: 'tpl-contract',
        carboneTemplateId: 'tpl-contract',
        carboneSkillId: 'carbone-contract',
        executionFlowTemplateIds: [],
        executionFlow: ['document_render'],
        apiEndpoints: {
          runtimeMetadata: {
            sourceType: 'document',
          },
        } as any,
        goal: 'Generate contract',
        expectedResult: 'Contract document',
        outputParams: undefined,
      },
      {
        skillId: 'skill-invoice',
        skillName: 'invoiceService',
        description: 'Generate invoice',
        triggerKeywords: ['发票'],
        paramsSchema: {
          properties: {
            invoiceTitle: {
              type: 'string',
              description: '发票抬头',
              required: true,
            } as any,
          },
          required: ['invoiceTitle'],
        },
        templateId: 'tpl-invoice',
        carboneTemplateId: undefined,
        carboneSkillId: undefined,
        executionFlowTemplateIds: [],
        executionFlow: ['document_render'],
        apiEndpoints: undefined,
        goal: 'Generate invoice',
        expectedResult: 'Invoice data',
        outputParams: undefined,
      },
    ];

    const matched = await (service as any).matchSkill(
      '补充甲方名称为星海智造科技有限公司',
      'u1',
      'Bearer test',
      'trace-1',
      skills,
      {
        mode: 'waiting_input_resume',
        target_skill_id: 'skill-contract',
      }
    );

    expect(matched).toMatchObject({
      skillId: 'skill-contract',
      skillName: 'contractService',
      matchReason: 'target_skill_context',
      confidence: 1,
    });
    expect(matched?.paramsSchema.required).toEqual(['info.partyA']);
  });

  it('merges already collected waiting_input params with the latest recognition result', async () => {
    const skill: AvailableSkillDefinition = {
      skillId: 'skill-contract',
      skillName: 'contractService',
      description: 'Generate contract',
      triggerKeywords: ['合同'],
      paramsSchema: {
        properties: {
          'info.partyA': {
            type: 'string',
            description: '甲方名称',
            required: true,
          } as any,
          signDate: {
            type: 'date',
            description: '签署日期',
            required: true,
          } as any,
        },
        required: ['info.partyA', 'signDate'],
      },
      templateId: 'tpl-contract',
      carboneTemplateId: 'tpl-contract',
      carboneSkillId: 'carbone-contract',
      executionFlowTemplateIds: [],
      executionFlow: ['document_render'],
      apiEndpoints: {
        runtimeMetadata: {
          sourceType: 'document',
        },
      } as any,
      goal: 'Generate contract',
      expectedResult: 'Contract document',
      outputParams: undefined,
    };

    const match: SkillMatchResult = {
      skillId: skill.skillId,
      skillName: skill.skillName,
      matchedKeywords: ['合同'],
      confidence: 0.95,
      collectedParams: {},
      missingParams: ['signDate'],
      paramsSchema: skill.paramsSchema,
      templateId: skill.templateId,
      carboneTemplateId: skill.carboneTemplateId,
      carboneSkillId: skill.carboneSkillId,
      executionFlowTemplateIds: [],
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
        signDate: '2026-06-01',
      },
      confidence: 0.92,
    });

    const plan = await service.generatePlan({
      request: {
        user_input: '签署日期改成2026-06-01',
        user_id: 'u1',
        modelId: 'selected-model-id',
        context: {
          mode: 'waiting_input_resume',
          target_skill_id: 'skill-contract',
          missing_inputs: ['signDate'],
          already_collected: {
            'info.partyA': '星海智造科技有限公司',
          },
        },
      } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    const partyA = plan.required_inputs.find((i) => i.name === 'info.partyA');
    const signDate = plan.required_inputs.find((i) => i.name === 'signDate');

    expect(partyA?.value).toBe('星海智造科技有限公司');
    expect(partyA?.missing).toBe(false);
    expect(partyA?.confidence).toBe(1);
    expect(signDate?.value).toBe('2026-06-01');
    expect(signDate?.missing).toBe(false);
    expect(plan.steps.some((step) => step.kind === 'human_input')).toBe(false);
    expect(recognizerService.recognizeParams).toHaveBeenCalledWith(
      expect.objectContaining({
        params_schema: {
          properties: {
            'info.partyA': expect.any(Object),
            signDate: expect.any(Object),
          },
          required: ['signDate'],
        },
      })
    );
  });

  it('completes multi-turn parameter collection end-to-end across first turn and resume turn', async () => {
    const skill: AvailableSkillDefinition = {
      skillId: 'skill-contract',
      skillName: 'contractService',
      description: 'Generate contract',
      triggerKeywords: ['合同'],
      paramsSchema: {
        properties: {
          'info.partyA': {
            type: 'string',
            description: '甲方名称',
            required: true,
          } as any,
          signDate: {
            type: 'date',
            description: '签署日期',
            required: true,
          } as any,
          amount: {
            type: 'number',
            description: '合同总金额',
          } as any,
        },
        required: ['info.partyA', 'signDate'],
      },
      templateId: 'tpl-contract',
      carboneTemplateId: 'tpl-contract',
      carboneSkillId: 'carbone-contract',
      executionFlowTemplateIds: [],
      executionFlow: ['document_render'],
      apiEndpoints: {
        runtimeMetadata: {
          sourceType: 'document',
        },
      } as any,
      goal: 'Generate contract',
      expectedResult: 'Contract document',
      outputParams: undefined,
    };

    const match: SkillMatchResult = {
      skillId: skill.skillId,
      skillName: skill.skillName,
      matchedKeywords: ['合同'],
      confidence: 0.95,
      collectedParams: {},
      missingParams: ['info.partyA', 'signDate'],
      paramsSchema: skill.paramsSchema,
      templateId: skill.templateId,
      carboneTemplateId: skill.carboneTemplateId,
      carboneSkillId: skill.carboneSkillId,
      executionFlowTemplateIds: [],
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
    jest
      .spyOn(recognizerService, 'recognizeParams')
      .mockResolvedValueOnce({
        params: {
          'info.partyA': '星海智造科技有限公司',
        },
        confidence: 0.93,
      })
      .mockResolvedValueOnce({
        params: {
          signDate: '2026-06-01',
        },
        confidence: 0.94,
      });

    const firstPlan = await service.generatePlan({
      request: {
        user_input: '生成合同，甲方是星海智造科技有限公司',
        user_id: 'u1',
        modelId: 'selected-model-id',
      } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    const firstPartyA = firstPlan.required_inputs.find((i) => i.name === 'info.partyA');
    const firstSignDate = firstPlan.required_inputs.find((i) => i.name === 'signDate');
    expect(firstPartyA?.value).toBe('星海智造科技有限公司');
    expect(firstPartyA?.missing).toBe(false);
    expect(firstSignDate?.missing).toBe(true);
    expect(firstPlan.steps.some((step) => step.kind === 'human_input')).toBe(true);

    const secondPlan = await service.generatePlan({
      request: {
        user_input: '签署日期是2026-06-01',
        user_id: 'u1',
        modelId: 'selected-model-id',
        context: {
          mode: 'waiting_input_resume',
          target_skill_id: 'skill-contract',
          original_objective: '生成合同，甲方是星海智造科技有限公司',
          missing_inputs: ['signDate'],
          already_collected: {
            'info.partyA': firstPartyA?.value,
          },
        },
      } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    const secondPartyA = secondPlan.required_inputs.find((i) => i.name === 'info.partyA');
    const secondSignDate = secondPlan.required_inputs.find((i) => i.name === 'signDate');
    expect(secondPartyA?.value).toBe('星海智造科技有限公司');
    expect(secondPartyA?.missing).toBe(false);
    expect(secondSignDate?.value).toBe('2026-06-01');
    expect(secondSignDate?.missing).toBe(false);
    expect(secondPlan.steps.some((step) => step.kind === 'human_input')).toBe(false);
    expect(secondPlan.metadata?.execution_snapshot).toEqual({
      normalizedInputJson: {
        input: {
          'info.partyA': '星海智造科技有限公司',
          signDate: '2026-06-01',
        },
        paramResolution: {
          'info.partyA': expect.objectContaining({
            value: '星海智造科技有限公司',
            source: 'user_input',
            required: true,
            missing: false,
            confirmed: true,
          }),
          signDate: expect.objectContaining({
            value: '2026-06-01',
            source: 'user_input',
            required: true,
            missing: false,
            confirmed: true,
          }),
          amount: expect.objectContaining({
            value: null,
            source: 'unresolved',
            required: false,
            missing: false,
            confirmed: true,
          }),
        },
        requiredInputs: expect.any(Array),
        semantic: expect.objectContaining({
          finalReady: true,
        }),
      },
    });

    const firstRecognizeCall = recognizerService.recognizeParams.mock.calls[0]?.[0];
    const secondRecognizeCall = recognizerService.recognizeParams.mock.calls[1]?.[0];
    expect(Object.keys(firstRecognizeCall.params_schema.properties)).toEqual([
      'info.partyA',
      'signDate',
      'amount',
    ]);
    expect(Object.keys(secondRecognizeCall.params_schema.properties)).toEqual([
      'signDate',
      'info.partyA',
    ]);
    expect(secondRecognizeCall.params_schema.required).toEqual(['signDate']);
  });

  it('does not treat placeholder-like recognized strings as meaningful filled inputs', async () => {
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
          notes: {
            type: 'string',
            description: '备注',
          } as any,
          'items[].unit': {
            type: 'string',
            description: '设备单位',
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
        notes: '暂无数据',
        'items[].unit': ['无', '台'],
      },
      confidence: 0.91,
    });

    const plan = await service.generatePlan({
      request: {
        user_input: '帮我查工业产值，单位是台',
        user_id: 'u1',
        modelId: 'selected-model-id',
      } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    const notes = plan.required_inputs.find((i) => i.name === 'notes');
    const unit = plan.required_inputs.find((i) => i.name === 'items[].unit');

    expect(notes?.value).toBeUndefined();
    expect(notes?.source).toBe('unresolved');
    expect(notes?.missing).toBe(false);
    expect(unit?.value).toEqual(['台']);
    expect(unit?.source).toBe('user_input');
    expect(unit?.missing).toBe(false);
  });

  it('keeps low-confidence recognized values as candidates and asks user to confirm them', async () => {
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
          region: {
            type: 'string',
            description: '区域',
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
        target: '华东区域工业数据',
      },
      confidence: 0.92,
      field_confidences: {
        target: 0.48,
      },
      uncertain_fields: ['target'],
    });

    const plan = await service.generatePlan({
      request: {
        user_input: '帮我查一下华东区域工业数据',
        user_id: 'u1',
        modelId: 'selected-model-id',
      } as any,
      userId: 'u1',
      authToken: 'Bearer test',
      traceId: 'trace-1',
    });

    const target = plan.required_inputs.find((i) => i.name === 'target');
    expect(target).toBeDefined();
    expect(target?.value).toBe('华东区域工业数据');
    expect(target?.missing).toBe(true);
    expect(target?.needs_confirmation).toBe(true);
    expect(target?.missing_reason).toBe('low_confidence');
    expect(target?.description).toContain('请确认或改写');
  });

});
