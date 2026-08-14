import axios from 'axios';
import { PlanGeneratorService, PlanSemanticService } from './plan';
import {
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
    plannerMatchPhaseService = new PlannerMatchPhaseService(
      skillCacheService,
      skillMatcherService
    );
    plannerPlanDraftService = new PlannerPlanDraftService(
      recognizerService as unknown as RecognizerService,
      planSemanticService,
      planGeneratorService,
      paramRecognizerService
    );
    service = new PlannerService(
      plannerMatchPhaseService,
      plannerPlanDraftService
    );
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
