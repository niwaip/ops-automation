import {
  BROWSER_RUN_OUTPUT_V2_SCHEMA_DIGEST,
  validateBrowserRunOutputV2,
} from './index';

const createOutput = () => ({
  schemaVersion: 'browser-run-output/v2' as const,
  run: {
    executionId: 'execution-1', runtimeSessionId: 'session-1', backend: 'cli', status: 'completed' as const,
    startedAt: '2026-08-26T00:00:00.000Z', endedAt: '2026-08-26T00:00:01.000Z', finalPageId: 'page-1', contractDigest: BROWSER_RUN_OUTPUT_V2_SCHEMA_DIGEST,
  },
  summary: { totalSteps: 1, completedSteps: 1, recoveredSteps: 0, failedSteps: 0, skippedSteps: 0 },
  steps: [{ stepId: 'step-1', action: 'goto', status: 'completed' as const, attempt: 1 }],
  pages: [{ pageId: 'page-1', stepId: 'step-1', attempt: 1, captureReason: 'step_completed' as const, observedAt: '2026-08-26T00:00:01.000Z', artifactIds: [] }],
  artifacts: [], outputs: {}, warnings: [],
});

describe('validateBrowserRunOutputV2', () => {
  it('accepts the minimum complete output', () => expect(validateBrowserRunOutputV2(createOutput()).valid).toBe(true));
  it('rejects a missing final page', () => {
    const output = createOutput();
    output.run.finalPageId = 'missing';
    expect(validateBrowserRunOutputV2(output).valid).toBe(false);
  });
});
