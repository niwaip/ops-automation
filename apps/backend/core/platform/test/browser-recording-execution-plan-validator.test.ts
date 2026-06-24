import { BrowserRecordingExecutionPlanValidatorService } from '../src/release-manager/validator';

describe('BrowserRecordingExecutionPlanValidatorService', () => {
  const service = new BrowserRecordingExecutionPlanValidatorService();

  it('should report duplicate step ids and missing branch variables for bridge payload', () => {
    const result = service.validateForBridge({
      paramsSchema: {
        properties: {
          knownVar: { type: 'string' },
        },
      },
      apiEndpoints: {
        runtimeMetadata: {
          executionPlan: {
            executionPlanVersion: 'browser-recording-ir/v1',
            templateSteps: [
              {
                step_id: 'step_1',
                action: 'read_value',
                output_var: 'knownVar',
              },
              {
                step_id: 'step_1',
                action: 'branch',
                branch: {
                  condition_fn: '(ctx) => Boolean(ctx.missingVar)',
                },
              },
            ],
            outputs: [],
            executionLimits: {},
            trace: {},
          },
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate_step_id' }),
        expect.objectContaining({ code: 'branch_variable_missing' }),
      ])
    );
  });

  it('should mark runtime as degraded when legacy executionFlow fallback is used', () => {
    const result = service.validateForRuntime({
      executionFlow: [
        {
          id: 'legacy_step',
          tool: { name: 'browser_step' },
        },
      ],
      runtimeMetadata: {},
    });

    expect(result.valid).toBe(true);
    expect(result.degradedMode).toBe(true);
    expect(result.degradeReason).toBe('legacy_execution_plan_fallback');
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'legacy_execution_plan_fallback' })])
    );
  });
});
