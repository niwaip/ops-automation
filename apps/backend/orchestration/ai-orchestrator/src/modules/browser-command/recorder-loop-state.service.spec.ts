jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
  }),
  { virtual: true }
);

import { RecorderLoopStateService } from './recorder-loop-state.service';

describe('RecorderLoopStateService', () => {
  it('parses manual intervention token metadata into generic signal config', () => {
    const service = new RecorderLoopStateService();

    const state = service.extractRecorderControlTokens(
      '[人工介入:MFA认证|behavior=optional_takeover_if_present|selector=body|method=attribute|attribute=data-auth-stage|expect=mfa|precheck=true|fallbackPattern=mfa,otp]'
    );

    expect(state.manualInterventionLabels).toEqual(['MFA认证']);
    expect(state.manualInterventions).toEqual([
      {
        label: 'MFA认证',
        behavior: 'optional_takeover_if_present',
        signal: {
          selector: 'body',
          method: 'attribute',
          attribute: 'data-auth-stage',
          expectedValue: 'mfa',
          fallbackPattern: 'mfa|otp',
          precheckBeforeRecordedCommands: true,
        },
      },
    ]);
  });
});
