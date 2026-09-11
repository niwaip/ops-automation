import { BrowserContentExtractionService } from '../content/browser-content-extraction.service';
import { BrowserContentQualityService } from '../content/browser-content-quality.service';
import { CaptureProfileResolverService } from '../content/capture-profile-resolver.service';
import { BrowserPostActionStateService } from './browser-post-action-state.service';
import { BrowserStepResultEnricherService } from './browser-step-result-enricher.service';

describe('BrowserStepResultEnricherService', () => {
  const captureProfile = {
    schemaVersion: 'capture-profile/v1',
    profile: 'article',
    capture: { screenshot: true, html: true, snapshot: false, mainContent: true },
    limits: { htmlBytes: 1_000_000, contentChars: 30_000, tableCells: 500 },
  };

  it('keeps evidence but fails a step whose requested main content is not ready', async () => {
    const evidenceCollector = {
      collect: jest.fn().mockResolvedValue({
        artifacts: [{ type: 'browser_page_html', id: 'html-1' }],
        warningCodes: [],
      }),
    };
    const service = new BrowserStepResultEnricherService(
      new BrowserPostActionStateService(),
      evidenceCollector as any,
      new BrowserContentExtractionService(),
      new CaptureProfileResolverService(),
      new BrowserContentQualityService()
    );

    const result = await service.enrich({
      dto: {
        executionId: 'execution-1',
        runtimeSessionId: 'session-1',
        stepId: 'step-1',
        action: 'navigate',
        target: 'https://example.com',
        captureProfile,
      },
      result: {
        success: true,
        shouldTakeover: false,
        output: {
          html: '<html><body><main><p>Request failed.</p></main></body></html>',
        },
      },
      inspect: async () => ({
        runtimeSessionId: 'session-1',
        pageUrl: 'https://example.com',
        readyState: 'complete',
      }),
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        executionState: 'failed',
        errorCode: 'CONTENT_NOT_READY',
        artifacts: [{ type: 'browser_page_html', id: 'html-1' }],
        warningCodes: expect.arrayContaining(['CONTENT_QUALITY_FAILED']),
      })
    );
    expect(result.postCheck?.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'main_content_chars', passed: false }),
      ])
    );
  });

  it('does not fail an interactive application step when mainContent is false even if page has few characters', async () => {
    const evidenceCollector = {
      collect: jest.fn().mockResolvedValue({
        artifacts: [{ type: 'browser_page_html', id: 'html-2' }],
        warningCodes: [],
      }),
    };
    const service = new BrowserStepResultEnricherService(
      new BrowserPostActionStateService(),
      evidenceCollector as any,
      new BrowserContentExtractionService(),
      new CaptureProfileResolverService(),
      new BrowserContentQualityService()
    );

    const appProfile = {
      schemaVersion: 'capture-profile/v1',
      profile: 'application',
      capture: { screenshot: true, html: true, snapshot: true, mainContent: false },
      limits: { htmlBytes: 1_000_000, contentChars: 30_000, tableCells: 500 },
    };

    const result = await service.enrich({
      dto: {
        executionId: 'execution-2',
        runtimeSessionId: 'session-2',
        stepId: 'step-2',
        action: 'goto',
        target: 'http://192.168.100.143:5174/login',
        captureProfile: appProfile,
      },
      result: {
        success: true,
        shouldTakeover: false,
        output: {
          html: '<html><body><div>OpsPilot AI Login</div></body></html>',
        },
      },
      inspect: async () => ({
        runtimeSessionId: 'session-2',
        pageUrl: 'http://192.168.100.143:5174/login',
        readyState: 'complete',
      }),
    });

    expect(result.success).toBe(true);
    expect(result.executionState).toBe('completed');
    expect(result.errorCode).toBeUndefined();
    expect(result.warningCodes).not.toContain('CONTENT_QUALITY_FAILED');
  });
});
