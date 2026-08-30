import type { CaptureProfileV1 } from '@ops/backend-browser-execution-contract';
import { BrowserContentQualityService } from './browser-content-quality.service';

describe('BrowserContentQualityService', () => {
  const service = new BrowserContentQualityService();
  const profile: CaptureProfileV1 = {
    schemaVersion: 'capture-profile/v1',
    profile: 'article',
    capture: { screenshot: true, html: true, snapshot: false, mainContent: true },
    limits: { htmlBytes: 1_000_000, contentChars: 30_000, tableCells: 500 },
  };

  it('rejects a short error-shell extraction before downstream processing', () => {
    expect(
      service.evaluate(
        {
          text: 'Request failed. Please retry.',
          profile: 'article',
          method: 'semantic-main',
          confidence: 0.35,
          fallbackLevel: 1,
          truncated: false,
          activeContentRemoved: false,
          suspectedPromptInjection: false,
        },
        profile
      )
    ).toEqual(expect.objectContaining({ passed: false, minChars: 80, actualConfidence: 0.35 }));
  });

  it('accepts content that meets a template-defined quality threshold', () => {
    const configured = {
      ...profile,
      quality: { minChars: 20, minConfidence: 0.3 },
    } as CaptureProfileV1 & { quality: { minChars: number; minConfidence: number } };
    expect(
      service.evaluate(
        {
          text: 'A concise but valid status report.',
          profile: 'article',
          method: 'semantic-main',
          confidence: 0.35,
          fallbackLevel: 1,
          truncated: false,
          activeContentRemoved: false,
          suspectedPromptInjection: false,
        },
        configured
      ).passed
    ).toBe(true);
  });
});
