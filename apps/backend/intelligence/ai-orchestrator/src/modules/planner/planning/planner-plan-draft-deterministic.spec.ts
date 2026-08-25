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
});
