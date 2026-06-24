import { resolveActionIntentToLocator } from './action-target-resolver.service';

describe('resolveActionIntentToLocator', () => {
  it('prefers stable locator over duplicate region action candidate for login submit', () => {
    const result = resolveActionIntentToLocator(
      {
        action: 'click',
        rawTarget: '登录',
        roleHint: 'button',
        semanticHint: 'submit',
        source: 'login-parser',
      },
      {
        availableCandidates: [
          {
            candidateId: 'action_5',
            kind: 'action',
            label: 'ログイン',
            summary: 'candidateId=action_5 | kind=action | role=button | label=ログイン | text=ログイン',
            role: 'button',
            text: 'ログイン',
          },
          {
            candidateId: 'action_6',
            kind: 'action',
            label: 'ログイン',
            summary:
              'candidateId=action_6 | kind=action | ref=e16 | role=button | label=ログイン | text=ログイン',
            ref: 'e16',
            role: 'button',
            text: 'ログイン',
            preferredLocator: {
              type: 'ref',
              value: 'e16',
            },
          },
          {
            candidateId: 'action_10',
            kind: 'action',
            label: 'ログイン',
            summary:
              'candidateId=action_10 | kind=action | role=button | region=login-form | regionType=form | label=ログイン | text=ログイン',
            role: 'button',
            text: 'ログイン',
            region: {
              name: 'login-form',
              type: 'form',
            },
          },
        ],
      }
    );

    expect(result).toEqual({
      locator: {
        type: 'ref',
        value: 'e16',
      },
      matchedCandidateId: 'action_6',
      confidence: 0.9,
      resolutionMode: 'preferred-locator',
    });
  });
});
