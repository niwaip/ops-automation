import { BrowserRecordingExecutionPlanValidatorService } from './browser-recording-execution-plan-validator.service';
import { BROWSER_RUN_OUTPUT_V2_SCHEMA_DIGEST } from '@ops/backend-browser-execution-contract';

describe('BrowserRecordingExecutionPlanValidatorService', () => {
  const service = new BrowserRecordingExecutionPlanValidatorService();

  it('accepts a V2 browser output only when the root result is declared', () => {
    const result = service.validateForPublish({
      runtimeMetadata: {
        browserRunOutputContract: 'browser-run-output/v2',
        browserRunOutputContractDigest: BROWSER_RUN_OUTPUT_V2_SCHEMA_DIGEST,
        executionPlan: {
          executionPlanVersion: 'browser-recording-ir/v1',
          templateSteps: [{ stepId: 'open', action: 'goto' }],
          outputs: [{ name: 'browserRunOutput' }, { name: 'pageState' }],
          executionLimits: { maxCommandCount: 1 },
          trace: { recorderSessionId: 'session-1' },
        },
      },
    });

    expect(result.valid).toBe(true);
    expect(result.browserRunOutputV2).toBe(true);
    expect(result.outputNames).toEqual(['browserRunOutput', 'pageState']);
  });

  it('rejects a V2 declaration without the browserRunOutput root field', () => {
    const result = service.validateForPublish({
      runtimeMetadata: {
        browserRunOutputContract: 'browser-run-output/v2',
        browserRunOutputContractDigest: BROWSER_RUN_OUTPUT_V2_SCHEMA_DIGEST,
        executionPlan: {
          executionPlanVersion: 'browser-recording-ir/v1',
          templateSteps: [{ stepId: 'open', action: 'goto' }],
          outputs: [{ name: 'pageState' }],
          executionLimits: { maxCommandCount: 1 },
          trace: { recorderSessionId: 'session-1' },
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toContain('browser_run_output_not_declared');
  });
});
