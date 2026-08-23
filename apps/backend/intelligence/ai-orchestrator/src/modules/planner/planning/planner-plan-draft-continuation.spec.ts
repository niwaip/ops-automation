import { PlanGeneratorService } from '../plan/plan-generator.service';
import { PlannerPlanDraftService } from './planner-plan-draft.service';

describe('PlannerPlanDraftService single-Skill continuation', () => {
  it('marks projected previous-result input as external and records its provenance', async () => {
    const recognizerService = {
      recognizeParams: jest.fn().mockResolvedValue({
        params: {},
        confidence: 0.9,
        uncertain_fields: ['content'],
      }),
    };
    const planSemanticService = {
      isDocumentTask: jest.fn().mockReturnValue(false),
      buildDocumentSemanticContext: jest.fn(({ requiredInputs }) => ({ requiredInputs })),
    };
    const paramRecognizerService = {
      buildRecognizerParamsSchema: jest.fn().mockReturnValue({
        properties: { content: { type: 'string' } },
        required: ['content'],
      }),
      mergeRecognizedWithCollectedContext: jest.fn((recognized) => recognized),
      applyBilingualCompletionToRecognized: jest.fn(async (recognized) => recognized),
      buildRequiredInputs: jest.fn((_matchedSkill, recognized) => [
        {
          name: 'content',
          type: 'string',
          required: true,
          missing: !recognized.params.content,
          source: recognized.params.content ? 'user_input' : 'unresolved',
          value: recognized.params.content,
        },
      ]),
    };
    const service = new PlannerPlanDraftService(
      recognizerService as any,
      planSemanticService as any,
      new PlanGeneratorService(),
      paramRecognizerService as any
    );

    const result = await service.completePlanFromMatchPhase({
      request: {
        user_input: 'bark推送',
        context: {
          mode: 'single_step_continuation',
          previous_result: {
            executionId: 'execution-summary-1',
            structuredData: { summary: '# 安装摘要' },
            detailText: '{"summary":"# 安装摘要"}',
          },
        },
      },
      matchPhase: {
        objective: 'bark推送',
        hasVisibleSkills: true,
        matchedSkill: {
          skillId: 'skill-bark',
          skillName: 'Bark推送服务',
          matchedKeywords: ['bark', '推送'],
          confidence: 0.99,
          collectedParams: {},
          missingParams: ['content'],
          paramsSchema: {
            properties: {
              content: {
                type: 'string',
                description: '推送正文',
                required: true,
              },
            },
            required: ['content'],
          },
        },
      },
    });

    expect(result.required_inputs).toEqual([
      expect.objectContaining({
        name: 'content',
        value: '# 安装摘要',
        source: 'external',
        missing: false,
        confidence: 1,
      }),
    ]);
    expect(result.metadata?.previous_result_continuation).toEqual({
      applied: true,
      sourceExecutionId: 'execution-summary-1',
      projectedFields: ['content'],
    });
    expect(recognizerService.recognizeParams).not.toHaveBeenCalled();
    expect((result.metadata?.debug as { notes?: string[] } | undefined)?.notes).toEqual(
      expect.arrayContaining([expect.stringContaining('已跳过 LLM 参数识别')])
    );
  });
});
