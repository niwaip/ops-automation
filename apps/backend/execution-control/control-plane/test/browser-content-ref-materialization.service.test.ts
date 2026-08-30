import { DeterministicPlanSchedulerService } from '../src/modules/execution/plan-runtime/deterministic-plan-scheduler.service';

describe('browser content candidate materialization', () => {
  const original = process.env.BROWSER_CONTENT_REF_ENABLED;

  beforeEach(() => {
    process.env.BROWSER_CONTENT_REF_ENABLED = 'true';
  });

  afterAll(() => {
    process.env.BROWSER_CONTENT_REF_ENABLED = original;
  });

  it('replaces a transient candidate with a ContentRef while retaining the V2 page evidence', async () => {
    const resultRefs = { enabled: true, create: jest.fn().mockResolvedValue({ id: 'result-ref-1' }) };
    const service = new DeterministicPlanSchedulerService(
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, undefined as any, resultRefs as any,
    );
    const output = await (service as any).materializeContentRefs('execution-1', 'browser-step', {
      browserRunOutput: { pages: [{ stepId: 'capture', pageId: 'page-1' }] },
      page_content: { text: 'transient value' },
      contentCandidates: [{
        sourceStepId: 'capture', outputName: 'page_content', sourceUrl: 'https://example.com/',
        finalUrl: 'https://example.com/', text: 'Example body', profile: 'article',
        method: 'visible-text', confidence: 0.8, fallbackLevel: 1, truncated: false,
        activeContentRemoved: true, suspectedPromptInjection: false,
      }],
    });

    expect(resultRefs.create).toHaveBeenCalledWith(expect.objectContaining({
      executionId: 'execution-1', producerStepId: 'browser-step',
    }));
    expect(output.contentCandidates).toBeUndefined();
    expect(output.page_content).toEqual(expect.objectContaining({
      schemaVersion: 'content-ref/v1', resultRefId: 'result-ref-1', pageId: 'page-1',
    }));
    expect(output.browserRunOutput.pages[0].content).toBe(output.page_content);
  });
});
