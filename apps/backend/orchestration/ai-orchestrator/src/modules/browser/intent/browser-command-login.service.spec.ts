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
});
