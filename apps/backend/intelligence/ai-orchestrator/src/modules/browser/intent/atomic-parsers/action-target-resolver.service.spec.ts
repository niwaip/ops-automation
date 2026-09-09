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

  it('resolves icon button with title into role locator', () => {
    const result = resolveActionIntentToLocator(
      {
        action: 'click',
        rawTarget: '在线客服',
        roleHint: 'button',
        source: 'action-parser',
      },
      {
        availableCandidates: [
          {
            candidateId: 'action_99',
            kind: 'action',
            label: '在线客服',
            title: '在线客服',
            summary: 'candidateId=action_99 | kind=action | role=button | title=在线客服',
            role: 'button',
            ref: 'e88',
            preferredLocator: {
              type: 'role',
              value: 'button[name="在线客服"]',
            },
          },
        ],
      }
    );

    expect(result).toEqual({
      locator: {
        type: 'role',
        value: 'button[name="在线客服"]',
      },
      matchedCandidateId: 'action_99',
      confidence: expect.any(Number),
      resolutionMode: 'preferred-locator',
    });
  });

  it('resolves floating chat trigger button for "打开悬浮对话框" and "打开悬浮框"', () => {
    const candidate = {
      candidateId: 'action_chat',
      kind: 'action' as const,
      label: '打开悬浮对话框',
      text: '打开悬浮对话框',
      title: '打开悬浮对话框',
      action: 'open-floating-chat',
      dataTestId: 'floating-chat-trigger',
      summary: 'candidateId=action_chat | kind=action | role=button | text=打开悬浮对话框',
      role: 'button',
      ref: 'e1257',
      preferredLocator: {
        type: 'css' as const,
        value: '[data-testid="floating-chat-trigger"]',
      },
    };

    const result1 = resolveActionIntentToLocator(
      {
        action: 'click',
        rawTarget: '打开悬浮对话框',
        roleHint: 'button',
        source: 'action-parser',
      },
      {
        availableCandidates: [candidate],
      }
    );

    expect(result1).toEqual({
      locator: {
        type: 'css',
        value: '[data-testid="floating-chat-trigger"]',
      },
      matchedCandidateId: 'action_chat',
      confidence: expect.any(Number),
      resolutionMode: 'preferred-locator',
    });

    const result2 = resolveActionIntentToLocator(
      {
        action: 'click',
        rawTarget: '打开悬浮框',
        roleHint: 'button',
        source: 'action-parser',
      },
      {
        availableCandidates: [candidate],
      }
    );

    expect(result2).toEqual({
      locator: {
        type: 'css',
        value: '[data-testid="floating-chat-trigger"]',
      },
      matchedCandidateId: 'action_chat',
      confidence: expect.any(Number),
      resolutionMode: 'preferred-locator',
    });
  });
});
