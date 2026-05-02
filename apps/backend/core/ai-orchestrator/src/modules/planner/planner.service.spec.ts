import { Test, TestingModule } from '@nestjs/testing';
import { PlannerService } from './planner.service';
import { RecognizerService } from '../recognizer/recognizer.service';
import { AvailableSkillDefinition, SkillMatchResult } from '../react-engine/interfaces';

describe('PlannerService - required inputs without hardcoded defaults', () => {
  let service: PlannerService;
  let recognizerService: RecognizerService;

  beforeEach(async () => {
    const mockRecognizer = {
      recognizeParams: jest.fn(),
    } as unknown as RecognizerService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlannerService,
        { provide: RecognizerService, useValue: mockRecognizer },
      ],
    }).compile();

    service = module.get<PlannerService>(PlannerService);
    recognizerService = module.get<RecognizerService>(RecognizerService);
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
});
