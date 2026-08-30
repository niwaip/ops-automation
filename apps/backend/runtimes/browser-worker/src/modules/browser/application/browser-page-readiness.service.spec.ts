import { BrowserPageReadinessService } from './browser-page-readiness.service';

describe('BrowserPageReadinessService', () => {
  const service = new BrowserPageReadinessService();

  it('uses generic DOM stability without site-specific selectors or messages', async () => {
    const execute = jest.fn().mockResolvedValue(
      JSON.stringify({
        ready: true,
        reason: 'stable',
        selectorCount: 0,
        observedContentChars: 320,
        elapsedMs: 900,
      })
    );

    const result = await service.wait({ action: 'navigate', execute });

    expect(result).toEqual(
      expect.objectContaining({ ready: true, required: false, reason: 'stable' })
    );
    const script = execute.mock.calls[0][0] as string;
    expect(script).toContain("waitForLoadState('networkidle'");
    expect(script).not.toContain('article');
    expect(script).not.toContain('列表加载失败');
    expect(script).not.toContain('重试');
  });

  it('treats a template-declared selector as a required readiness condition', async () => {
    const execute = jest.fn().mockResolvedValue(
      JSON.stringify({
        ready: false,
        reason: 'selector_timeout',
        selectorCount: 1,
        observedContentChars: 120,
        elapsedMs: 2000,
      })
    );

    const result = await service.wait({
      action: 'goto',
      captureProfile: {
        readiness: { selector: '[data-ready="true"]', minCount: 2, timeoutMs: 2000 },
      },
      execute,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ready: false,
        required: true,
        reason: 'selector_timeout',
        selector: '[data-ready="true"]',
        selectorCount: 1,
      })
    );
  });

  it('does not wait for non-page-changing actions', async () => {
    const execute = jest.fn();
    await expect(service.wait({ action: 'get_text', execute })).resolves.toEqual({
      ready: true,
      required: false,
      reason: 'not_applicable',
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
