import { CaptureProfileResolverService } from './capture-profile-resolver.service';

const article = {
  schemaVersion: 'capture-profile/v1' as const,
  profile: 'article' as const,
  capture: { screenshot: true, html: true, snapshot: false, mainContent: true },
  limits: { htmlBytes: 1000, contentChars: 1000, tableCells: 10 },
};

describe('CaptureProfileResolverService', () => {
  it('uses only the alias matching the observed page', () => {
    const service = new CaptureProfileResolverService();
    expect(service.resolveForPage({
      profiles: [{ alias: 'news', match: { urlPattern: 'example\\.com/news' }, captureProfile: article }],
    }, { url: 'https://example.com/news/1', title: 'News' })).toEqual(article);
    expect(service.resolveForPage({
      profiles: [{ alias: 'news', match: { urlPattern: 'example\\.com/news' }, captureProfile: article }],
    }, { url: 'https://example.com/admin', title: 'Admin' })).toBeUndefined();
  });
});
