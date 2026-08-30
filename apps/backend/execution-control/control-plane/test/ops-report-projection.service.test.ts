import { OpsReportProjectionService } from '../src/modules/execution/plan-runtime/ops-report-projection.service';

describe('OpsReportProjectionService', () => {
  it('creates deterministic report input from browser V2 output', () => {
    const output = new OpsReportProjectionService().project({ skillId: 'ops-check', entryUrl: 'https://ops.example.com', browser: {
      schemaVersion: 'browser-run-output/v2', run: { executionId: 'e1', runtimeSessionId: 's1', backend: 'cli', status: 'completed_with_warnings', startedAt: 'a', endedAt: 'b', contractDigest: 'digest' },
      summary: { totalSteps: 1, completedSteps: 0, recoveredSteps: 1, failedSteps: 0, skippedSteps: 0 },
      steps: [{ stepId: 'open', action: 'goto', status: 'recovered', attempt: 1 }], pages: [], artifacts: [], outputs: {}, warnings: [{ code: 'NAVIGATION_TIMEOUT_RECOVERED', message: 'recovered', stepId: 'open' }],
    } });
    expect(output.execution.status).toBe('recovered');
    expect(output.checks[0]?.status).toBe('pass');
  });
});
