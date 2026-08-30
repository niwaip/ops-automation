import { BrowserPostActionStateService } from './browser-post-action-state.service';

describe('BrowserPostActionStateService', () => {
  const service = new BrowserPostActionStateService();

  it('marks a failed navigation as ambiguous when the target URL is actually reached', async () => {
    const output = await service.observe({
      dto: {
        executionId: 'execution-1', runtimeSessionId: 'session-1', stepId: 'step-1', action: 'goto', target: 'https://example.com/report',
      },
      result: { success: false, shouldTakeover: false, errorCode: 'STEP_EXECUTION_ERROR' },
      inspect: async () => ({ runtimeSessionId: 'session-1', pageUrl: 'https://example.com/report', readyState: 'complete' }),
    });

    expect(output.executionState).toBe('ambiguous');
    expect(output.postCheck?.targetReached).toBe(true);
  });

  it('keeps a failed navigation failed when the page remains on a browser error page', async () => {
    const output = await service.observe({
      dto: {
        executionId: 'execution-1', runtimeSessionId: 'session-1', stepId: 'step-1', action: 'goto', target: 'https://example.com/report',
      },
      result: { success: false, shouldTakeover: false, errorCode: 'STEP_EXECUTION_ERROR' },
      inspect: async () => ({ runtimeSessionId: 'session-1', pageUrl: 'chrome-error://chromewebdata/', readyState: 'complete' }),
    });

    expect(output.executionState).toBe('failed');
    expect(output.postCheck?.targetReached).toBe(false);
  });
});
