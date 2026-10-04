import { PlaywrightInspectionHandler } from './playwright-inspection.handler';

describe('recorder content capture', () => {
  it('does not capture the full page when the recorder explicitly disables main content', async () => {
    const reader = { extractMainTextFromHtml: jest.fn() };
    const handler = new PlaywrightInspectionHandler({} as any, {} as any, reader as any);
    const result = await handler.enrichResultArtifacts('session', {
      status: 'success', command: 'read_page', html: '<main>Approval</main>', data: { text: '17.8' },
    }, { captureScreenshot: false, captureProfile: { capture: { mainContent: false } } });
    expect(result.data?.text).toBe('17.8');
    expect(result.data?.mainContent).toBeUndefined();
    expect(reader.extractMainTextFromHtml).not.toHaveBeenCalled();
  });
  it('preserves a read field while separately capturing the full page within its limit', async () => {
    const reader = {
      readCurrentPageHtml: jest.fn().mockResolvedValue('<main>Approval #2 margin 17.8%</main>'),
      extractMainTextFromHtml: jest.fn().mockReturnValue('Approval #2 margin 17.8%'),
    };
    const handler = new PlaywrightInspectionHandler({} as any, {} as any, reader as any);
    const result = await handler.enrichResultArtifacts('session', {
      status: 'success', command: 'read_page', data: { text: '17.8' },
    }, { captureScreenshot: false, captureProfile: { capture: { html: true, mainContent: true }, limits: { contentChars: 20 } } });
    expect(result.data?.text).toBe('17.8');
    expect(result.data?.mainContent).toBe('Approval #2 margin 1');
    expect(result.screenshot).toBeUndefined();
  });
});
