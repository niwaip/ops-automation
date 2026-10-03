import { BrowserLegacyOutputAdapter } from './browser-legacy-output.adapter';

describe('BrowserLegacyOutputAdapter (Audit Fixes)', () => {
  const adapter = new BrowserLegacyOutputAdapter();

  it('preserves authentic runtime evidence including takeoverReason and branch decision without false approvals', () => {
    const inputState: any = {
      stepResults: [
        { stepId: 'step_9', action: 'branch', status: 'takeover_required', outcome: 'takeover' },
      ],
      variables: { grossProfitRate: 17.8 },
      runtimeEvidence: {
        takeoverReason: 'Gross margin 17.8% < 20%',
        lastBranchDecision: {
          condition: 'margin >= 20',
          result: 'takeover',
        },
      },
    };

    const output = adapter.build({
      runtimeSessionId: 'session-123',
      backend: 'cli',
      planValidation: {
        valid: true,
        errors: [],
        trace: {},
        degradedMode: false,
        executionPlanVersion: 'browser-recording-ir/v1',
      } as any,
      runtimeTrace: {},
      state: inputState,
    });

    const evidence = output.runtimeEvidence as any;
    expect(evidence.takeoverReason).toBe('Gross margin 17.8% < 20%');
    expect(evidence.lastBranchDecision.result).toBe('takeover');
    expect(evidence.lastBranchDecision.resolvedByHuman).toBeUndefined();
  });
});
