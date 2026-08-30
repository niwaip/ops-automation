import { BrowserStepEvidenceCollectorService } from './browser-step-evidence-collector.service';

describe('BrowserStepEvidenceCollectorService selective capture', () => {
  it('collects only the result kinds enabled by the browser step', async () => {
    const artifactFactory = {
      fromExistingFile: jest.fn().mockResolvedValue({ id: 'file', type: 'screenshot' }),
      fromHtml: jest.fn().mockResolvedValue({ id: 'html', type: 'html' }),
    };
    const service = new BrowserStepEvidenceCollectorService(artifactFactory as any);

    const result = await service.collect({
      dto: {
        executionId: 'execution-1', runtimeSessionId: 'session-1', stepId: 'step_2', attempt: 1,
        captureProfile: {
          capture: { screenshot: false, html: true, snapshot: false, mainContent: false },
        },
      } as any,
      result: {
        success: true,
        shouldTakeover: false,
        output: {
          html: '<main>正文</main>',
          data: { screenshotPath: '/tmp/screenshot.png' },
          snapshot: { path: '/tmp/snapshot.json' },
        },
      },
    });

    expect(artifactFactory.fromHtml).toHaveBeenCalledTimes(1);
    expect(artifactFactory.fromExistingFile).not.toHaveBeenCalled();
    expect(result.artifacts).toEqual([{ id: 'html', type: 'html' }]);
  });
});
