import { PlanGeneratorService } from '../plan';
import { DeterministicParamResolverService } from '../params';
import { PlannerPlanDraftService } from './planner-plan-draft.service';

describe('PlannerPlanDraftService deterministic contract path', () => {
  it('skips parameter model recognition when the capability contract resolves all required input', async () => {
    const recognizerService = { recognizeParams: jest.fn() };
    const paramRecognizerService = {
      mergeRecognizedWithCollectedContext: jest.fn((recognized) => recognized),
      applyBilingualCompletionToRecognized: jest.fn(async (recognized) => recognized),
      buildRequiredInputs: jest.fn((_skill, recognized) => [
        {
          name: 'location',
          display_name: '城市',
          type: 'string',
          required: true,
          missing: !recognized.params.location,
          value: recognized.params.location,
          source: recognized.params.location ? 'user_input' : 'unresolved',
          confidence: recognized.field_confidences?.location,
        },
      ]),
    };
    const planSemanticService = {
      isDocumentTask: jest.fn().mockReturnValue(false),
      buildDocumentSemanticContext: jest.fn(({ requiredInputs }) => ({ requiredInputs })),
    };
    const service = new PlannerPlanDraftService(
      recognizerService as any,
      planSemanticService as any,
      new PlanGeneratorService(),
      paramRecognizerService as any,
      new DeterministicParamResolverService()
    );

    const result = await service.completePlanFromMatchPhase({
      request: { user_input: '请处理华东区' },
      matchPhase: {
        objective: '请处理华东区',
        hasVisibleSkills: true,
        matchedSkill: {
          skillId: 'regional-query',
          skillName: '区域查询',
          matchedKeywords: ['区域'],
          confidence: 0.99,
          collectedParams: {},
          missingParams: ['location'],
          paramsSchema: {
            properties: {
              location: {
                type: 'string',
                description: '区域',
                required: true,
                enum: ['east', 'north'],
                'x-enum-aliases': { east: ['华东区'], north: ['华北区'] },
              },
            },
            required: ['location'],
          },
        },
      },
    });

    expect(recognizerService.recognizeParams).not.toHaveBeenCalled();
    expect(result.required_inputs).toEqual([
      expect.objectContaining({ name: 'location', value: 'east', missing: false }),
    ]);
  });

  it('lets the latest waiting-input answer replace a stale collected array value', async () => {
    const content = [{ type: 'paragraph', text: '端到端验证' }];
    const recognizerService = {
      recognizeParams: jest.fn().mockResolvedValue({
        params: { content },
        confidence: 0.95,
        field_confidences: { content: 0.95 },
        uncertain_fields: [],
      }),
    };
    const paramRecognizerService = {
      mergeRecognizedWithCollectedContext: jest.fn((recognized, _schema, context) => ({
        ...recognized,
        params: { ...(context?.already_collected || {}), ...(recognized.params || {}) },
        field_confidences: {
          ...Object.fromEntries(Object.keys(context?.already_collected || {}).map((key) => [key, 1])),
          ...(recognized.field_confidences || {}),
        },
      })),
      resolveRecognizerFieldNamesForContext: jest.fn(() => ['content']),
      buildRecognizerParamsSchema: jest.fn((schema) => schema),
      buildRecognizerParamsSchemaProperties: jest.fn((properties) => properties),
      applyBilingualCompletionToRecognized: jest.fn(async (recognized) => recognized),
      buildRequiredInputs: jest.fn((_skill, recognized) => [
        {
          name: 'content',
          type: 'array',
          required: true,
          missing: !Array.isArray(recognized.params.content),
          value: recognized.params.content,
          source: 'user_input',
          confidence: recognized.field_confidences?.content,
        },
      ]),
    };
    const planSemanticService = {
      isDocumentTask: jest.fn().mockReturnValue(true),
      buildDocumentSemanticContext: jest.fn(({ requiredInputs }) => ({ requiredInputs })),
    };
    const service = new PlannerPlanDraftService(
      recognizerService as any,
      planSemanticService as any,
      new PlanGeneratorService(),
      paramRecognizerService as any,
      new DeterministicParamResolverService()
    );

    const result = await service.completePlanFromMatchPhase({
      request: {
        user_input: `content = ${JSON.stringify(content)}`,
        context: {
          mode: 'waiting_input_resume',
          missing_inputs: ['content'],
          already_collected: { content: '\"type\":\"paragraph\"' },
        },
      },
      matchPhase: {
        objective: `content = ${JSON.stringify(content)}`,
        hasVisibleSkills: true,
        matchedSkill: {
          skillId: 'platform.document.pdf-create',
          skillName: '内置 PDF 简单生成',
          matchedKeywords: ['PDF'],
          confidence: 0.99,
          collectedParams: {},
          missingParams: ['content'],
          paramsSchema: {
            properties: {
              content: { type: 'array', description: 'content', required: true },
            },
            required: ['content'],
          },
        },
      },
    } as any);

    expect(result.required_inputs).toEqual([
      expect.objectContaining({ name: 'content', value: content, missing: false }),
    ]);
    expect(result.steps.some((step) => step.kind === 'human_input')).toBe(false);
  });
});
