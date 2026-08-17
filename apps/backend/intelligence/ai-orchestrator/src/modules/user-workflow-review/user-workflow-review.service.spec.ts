import { UserWorkflowReviewService } from './user-workflow-review.service';
import type { ModelService } from '../model/model.service';
import type { ReviewUserWorkflowDto } from './user-workflow-review.dto';

describe('UserWorkflowReviewService', () => {
  const request: ReviewUserWorkflowDto = {
    sourceExecutionId: 'execution-1',
    planSnapshot: { nodes: [{ nodeId: 'search' }, { nodeId: 'summary' }] },
    fixedInput: { keyword: '微博热点' },
    businessResult: { summary: 'ok' },
  };

  it('returns a read-only normalized review result', async () => {
    const callModel = jest.fn().mockResolvedValue({
      content: JSON.stringify({
        decision: 'pass',
        summary: '可以无人值守执行',
        issues: [],
        planSnapshot: { nodes: [] },
      }),
    });
    const modelService = {
      getDefaultModel: jest.fn().mockReturnValue({ id: 'model-1', name: 'review-model' }),
      callModel,
    } as unknown as ModelService;
    const service = new UserWorkflowReviewService(modelService);

    await expect(service.review(request)).resolves.toMatchObject({
      decision: 'pass',
      summary: '可以无人值守执行',
      planChanged: false,
      model: 'review-model',
      issues: [],
    });
    expect(callModel).toHaveBeenCalledWith(
      'model-1',
      expect.stringContaining('禁止重新规划'),
      'reasoning'
    );
  });

  it('degrades to warning when no model is available', async () => {
    const modelService = {
      getDefaultModel: jest.fn().mockReturnValue(undefined),
    } as unknown as ModelService;
    const service = new UserWorkflowReviewService(modelService);

    await expect(service.review(request)).resolves.toMatchObject({
      decision: 'warning',
      planChanged: false,
      issues: [expect.objectContaining({ code: 'AI_REVIEW_MODEL_UNAVAILABLE' })],
    });
  });

  it('does not block user save solely because the model call failed', async () => {
    const modelService = {
      getDefaultModel: jest.fn().mockReturnValue({ id: 'model-1', name: 'review-model' }),
      callModel: jest.fn().mockRejectedValue(new Error('timeout')),
    } as unknown as ModelService;
    const service = new UserWorkflowReviewService(modelService);

    await expect(service.review(request)).resolves.toMatchObject({
      decision: 'warning',
      planChanged: false,
      issues: [expect.objectContaining({ code: 'AI_REVIEW_FAILED' })],
    });
  });
});
