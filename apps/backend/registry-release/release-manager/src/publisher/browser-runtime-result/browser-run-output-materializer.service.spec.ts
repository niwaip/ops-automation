import { BROWSER_RUN_OUTPUT_V2_SCHEMA_DIGEST, validateBrowserRunOutputV2 } from '@ops/backend-browser-execution-contract';
import { BrowserRunOutputMaterializerService } from './browser-run-output-materializer.service';

describe('BrowserRunOutputMaterializerService', () => {
  it('materializes a recovered navigation with page-linked evidence', () => {
    const service = new BrowserRunOutputMaterializerService();
    const output = service.materialize({
      executionId: 'execution-1',
      runtimeSessionId: 'session-1',
      backend: 'cli',
      outputNames: ['pageState'],
      state: {
        preserveRuntimeSession: false,
        startedAt: '2026-08-26T00:00:00.000Z',
        captureOrdinal: 0,
        attemptByStepId: { navigate: 1 },
        currentPageUrl: 'https://example.com/report',
        variables: {}, runtimeEvidence: {}, warnings: [{ code: 'NAVIGATION_TIMEOUT_RECOVERED', message: 'recovered', stepId: 'navigate' }], logs: [],
        stepResults: [{
          stepId: 'navigate', name: 'Open report', action: 'goto', attempt: 1, success: true, recovered: true,
          pageState: { pageUrl: 'https://example.com/report', pageTitle: 'Report', readyState: 'complete', observedAt: '2026-08-26T00:00:01.000Z' },
          artifacts: [{ id: 'artifact-1', type: 'browser_page_screenshot', url: '/browser/artifacts/a.png', mimeType: 'image/png', metadata: {} }],
        }],
      },
    });

    expect(output.run.contractDigest).toBe(BROWSER_RUN_OUTPUT_V2_SCHEMA_DIGEST);
    expect(output.run.status).toBe('completed_with_warnings');
    expect(output.steps[0]?.status).toBe('recovered');
    expect(output.pages[0]?.artifactIds).toEqual(['artifact-1']);
    expect(validateBrowserRunOutputV2(output)).toEqual({ valid: true, errors: [] });
  });
});
