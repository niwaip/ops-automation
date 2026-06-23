jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
  }),
  { virtual: true }
);

import { BrowserCommandLoginService } from './browser-command-login.service';

describe('BrowserCommandLoginService', () => {
  const service = new BrowserCommandLoginService();

  it('parses username and password login with submit target', () => {
    const result = service.parseLoginCommand(
      '用户名是 demo@example.com 密码是 pass123 登录',
      {},
      {
        resolveUrl: (input) => `https://${input}`,
        resolvePendingClickIntent: (_intent, _context, description) => ({
          tool: 'click',
          params: { text: '登录' },
          description,
        }),
      }
    );

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'fill',
          params: {
            selector: '用户名',
            value: 'demo@example.com',
          },
          description: '填写用户名',
        },
        {
          tool: 'fill',
          params: {
            selector: '密码',
            value: 'pass123',
          },
          description: '填写密码',
        },
        {
          tool: 'click',
          params: {
            text: '登录',
          },
          description: '点击登录',
        },
      ],
      explanation: '将依次填写用户名和密码，点击 登录',
    });
  });

  it('returns null when input is not login related', () => {
    const result = service.parseLoginCommand(
      '查看第一个订单详情',
      {},
      {
        resolveUrl: (input) => `https://${input}`,
        resolvePendingClickIntent: () => null,
      }
    );

    expect(result).toBeNull();
  });

  it('merges runtime login profile terms without changing deterministic command order', () => {
    const result = service.parseLoginCommand(
      '工号是 u001 口令是 pass123 继续登录',
      {},
      {
        resolveUrl: (input) => `https://${input}`,
        resolvePendingClickIntent: (_intent, _context, description) => ({
          tool: 'click',
          params: { text: '继续登录' },
          description,
        }),
      },
      {
        runtimeRules: [
          {
            id: 'rule-login-runtime',
            category: 'LOGIN',
            priority: 100,
            outputs: {
              profile_type: 'login_terms',
              credential_intent_terms: ['工号', '口令'],
              username_terms: ['工号'],
              password_terms: ['口令'],
              submit_intent_terms: ['继续登录'],
              submit_labels: ['继续登录'],
            },
          },
        ],
      }
    );

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'fill',
          params: {
            selector: '用户名',
            value: 'u001',
          },
          description: '填写用户名',
        },
        {
          tool: 'fill',
          params: {
            selector: '密码',
            value: 'pass123',
          },
          description: '填写密码',
        },
        {
          tool: 'click',
          params: {
            text: '继续登录',
          },
          description: '点击继续登录',
        },
      ],
      explanation: '将依次填写用户名和密码，点击 继续登录',
      parserMetadata: {
        login: {
          status: 'success',
          reason: undefined,
          filledFields: ['username', 'password'],
          missingFields: [],
          nextStepHint: undefined,
          matchedRuntimeRuleIds: ['rule-login-runtime'],
          usedRuntimeProfile: true,
        },
      },
    });
  });

  it('returns takeover_required when the page context exposes unsupported auth challenges', () => {
    const result = service.parseLoginCommandDetailed(
      '请帮我登录',
      {
        availableButtons: ['扫码登录'],
      },
      {
        resolveUrl: (input) => `https://${input}`,
        resolvePendingClickIntent: () => null,
      }
    );

    expect(result.status).toBe('takeover_required');
    expect(result.reason).toBe('login-unsupported-auth-challenge');
    expect(result.response).toEqual({
      success: false,
      commands: [],
      explanation: '当前页面包含不受支持的认证挑战，请切换为人工接管或改用受支持的登录方式',
      parserMetadata: {
        login: {
          status: 'takeover_required',
          reason: 'login-unsupported-auth-challenge',
          filledFields: [],
          matchedRuntimeRuleIds: [],
          usedRuntimeProfile: false,
        },
      },
    });
  });

  it('returns partial when the current page only exposes the first login step', () => {
    const result = service.parseLoginCommandDetailed(
      '用户名是 demo@example.com 密码是 pass123 next',
      {
        availableInputs: ['用户名'],
        availableButtons: ['Next'],
      },
      {
        resolveUrl: (input) => `https://${input}`,
        resolvePendingClickIntent: (_intent, _context, description) => ({
          tool: 'click',
          params: { text: 'Next' },
          description,
        }),
      }
    );

    expect(result.status).toBe('partial');
    expect(result.response).toEqual({
      success: true,
      commands: [
        {
          tool: 'fill',
          params: {
            selector: '用户名',
            value: 'demo@example.com',
          },
          description: '填写用户名',
        },
        {
          tool: 'click',
          params: {
            text: 'Next',
          },
          description: '点击Next',
        },
      ],
      explanation: '将依次填写用户名，点击 Next',
      parserMetadata: {
        login: {
          status: 'partial',
          reason: 'login-partial-step',
          filledFields: ['username'],
          missingFields: [],
          nextStepHint: '当前页面疑似只展示部分登录步骤，请等待下一步页面后继续补全剩余字段',
          matchedRuntimeRuleIds: [],
          usedRuntimeProfile: false,
        },
      },
    });
  });

  it('parses otp follow-up without inventing missing username or password', () => {
    const result = service.parseLoginCommand(
      '验证码是 123456 提交',
      {},
      {
        resolveUrl: (input) => `https://${input}`,
        resolvePendingClickIntent: (_intent, _context, description) => ({
          tool: 'click',
          params: { text: '提交' },
          description,
        }),
      }
    );

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'fill',
          params: {
            selector: '验证码',
            value: '123456',
          },
          description: '填写验证码',
        },
        {
          tool: 'click',
          params: {
            text: '提交',
          },
          description: '点击提交',
        },
      ],
      explanation: '将依次填写验证码，点击 提交',
    });
  });

  it('treats email plus next as a valid SSO first step', () => {
    const result = service.parseLoginCommandDetailed(
      '邮箱是 demo@example.com next',
      {
        availableInputs: ['email'],
        availableButtons: ['Next'],
      },
      {
        resolveUrl: (input) => `https://${input}`,
        resolvePendingClickIntent: (_intent, _context, description) => ({
          tool: 'click',
          params: { text: 'Next' },
          description,
        }),
      }
    );

    expect(result.status).toBe('success');
    expect(result.response).toEqual({
      success: true,
      commands: [
        {
          tool: 'fill',
          params: {
            selector: '用户名',
            value: 'demo@example.com',
          },
          description: '填写用户名',
        },
        {
          tool: 'click',
          params: {
            text: 'Next',
          },
          description: '点击Next',
        },
      ],
      explanation: '将依次填写用户名，点击 Next',
      parserMetadata: undefined,
    });
  });

  it('treats passkey challenge as unsupported auth takeover', () => {
    const result = service.parseLoginCommandDetailed(
      '请帮我登录',
      {
        availableButtons: ['Use Passkey'],
      },
      {
        resolveUrl: (input) => `https://${input}`,
        resolvePendingClickIntent: () => null,
      }
    );

    expect(result.status).toBe('takeover_required');
    expect(result.reason).toBe('login-unsupported-auth-challenge');
  });

  it('returns login-field-missing when credential labels exist but values are absent', () => {
    const result = service.parseLoginCommandDetailed(
      '用户名是 demo@example.com 密码；登录',
      {},
      {
        resolveUrl: (input) => `https://${input}`,
        resolvePendingClickIntent: () => null,
      }
    );

    expect(result).toEqual({
      status: 'profile_miss',
      response: null,
      reason: 'login-field-missing',
      missingFields: ['password'],
      matchedRuntimeRuleIds: [],
      usedRuntimeProfile: false,
    });
  });
});
