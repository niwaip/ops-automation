import { applyGate2OutputSchemaValidation } from '@ops/release-manager/compiler/capability-release-validation.helpers';

describe('sandbox validation output envelope', () => {
  const snapshot = { sourcePayload: { outputSchema: {
    type: 'object', required: ['result'], additionalProperties: false,
    properties: { result: { type: 'object' } },
  } } } as any;

  it('validates business data inside the worker envelope without treating checkpoint fields as business fields', () => {
    const result = applyGate2OutputSchemaValidation(snapshot, { result: {
      success: true, logs: [], result: { execution: { status: 'success' },
        result: { businessData: { result: { status: 'completed' } } },
        phaseResults: [{ stepId: 'step_8' }], variables: { grossProfitRate: '17.8' },
      },
    } }, 100);
    expect(result).toEqual({ success: true, score: 100, errorSummary: null });
  });

  it('still rejects unexpected business fields inside that envelope', () => {
    const result = applyGate2OutputSchemaValidation(snapshot, { result: {
      success: true, logs: [], result: { result: { businessData: { result: {}, unexpected: true } } },
    } }, 100);
    expect(result.success).toBe(false);
    expect(result.errorSummary).toContain('additional properties');
  });
});
