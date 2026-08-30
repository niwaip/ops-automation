import {
  validateCaptureProfileV1,
  validateContentRefV1,
  validateOpsReportProjectionV1,
} from './content-contract.validator';

describe('P1 content contracts', () => {
  it('validates an article capture profile and rejects raw main-content extraction', () => {
    const profile = {
      schemaVersion: 'capture-profile/v1',
      profile: 'article',
      capture: { screenshot: true, html: true, snapshot: false, mainContent: true },
      limits: { htmlBytes: 1000, contentChars: 1000, tableCells: 0 },
      readiness: {
        waitUntil: 'networkidle',
        timeoutMs: 8000,
        stableMs: 750,
        selector: 'main',
        minCount: 1,
      },
      quality: { minChars: 80, minConfidence: 0.35 },
    };
    expect(validateCaptureProfileV1(profile).valid).toBe(true);
    expect(
      validateCaptureProfileV1({
        ...profile,
        profile: 'raw',
        capture: { ...profile.capture, mainContent: true },
      }).valid
    ).toBe(false);
    expect(validateCaptureProfileV1({ ...profile, readiness: { timeoutMs: -1 } }).valid).toBe(
      false
    );
    expect(validateCaptureProfileV1({ ...profile, quality: { minConfidence: 2 } }).valid).toBe(
      false
    );
  });

  it('requires integrity and untrusted-content safety on a content reference', () => {
    const content = {
      schemaVersion: 'content-ref/v1',
      contentId: 'content-1',
      resultRefId: 'ref-1',
      pageId: 'page-1',
      sourceUrl: 'https://example.com',
      finalUrl: 'https://example.com',
      mediaType: 'text/markdown',
      extraction: {
        profile: 'article',
        method: 'readability',
        confidence: 0.9,
        fallbackLevel: 0,
        extractedAt: '2026-08-26T00:00:00Z',
      },
      integrity: { sha256: 'a'.repeat(64), chars: 10, bytes: 10, truncated: false },
      safety: {
        activeContentRemoved: true,
        suspectedPromptInjection: false,
        untrustedExternalContent: true,
      },
      preview: 'content',
    };
    expect(validateContentRefV1(content).valid).toBe(true);
    expect(
      validateContentRefV1({
        ...content,
        safety: { ...content.safety, untrustedExternalContent: false },
      }).valid
    ).toBe(false);
  });

  it('accepts the stable ops-report projection envelope', () => {
    expect(
      validateOpsReportProjectionV1({
        schemaVersion: 'ops-report-projection/v1',
        execution: {
          executionId: 'e1',
          skillId: 's1',
          startedAt: 'a',
          endedAt: 'b',
          status: 'recovered',
        },
        target: { entryUrl: 'https://example.com' },
        summary: {
          totalSteps: 1,
          succeededSteps: 1,
          failedSteps: 0,
          skippedSteps: 0,
          loopIterations: 0,
        },
        checks: [],
        incidents: [],
        evidence: [],
        declaredOutputs: {},
      }).valid
    ).toBe(true);
  });
});
