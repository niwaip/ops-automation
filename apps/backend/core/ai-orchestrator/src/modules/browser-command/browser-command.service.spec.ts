jest.mock('@nestjs/common', () => ({
  Injectable: () => () => undefined,
  Logger: class {
    log() {}
    warn() {}
    error() {}
    debug() {}
  },
}), { virtual: true });

jest.mock('../model/model.service', () => ({
  ModelService: class {},
}), { virtual: true });

import { BrowserCommandService } from './browser-command.service';

describe('BrowserCommandService', () => {
  const createService = () => new BrowserCommandService({
    listModels: jest.fn().mockResolvedValue([]),
    callModel: jest.fn(),
  } as any);

  it('parses password-only login follow-up without inventing username', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '密码是 W#bo0hS8&uDm3I 然后 log on',
    });

    expect(result.success).toBe(true);
    expect(result.commands).toEqual([
      {
        tool: 'fill',
        params: {
          selector: '密码',
          value: 'W#bo0hS8&uDm3I',
        },
        description: '填写密码',
      },
      {
        tool: 'click',
        params: {
          text: 'Log On',
        },
        description: '点击Log On',
      },
    ]);
  });

  it('parses explicit username and password login in declared order', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '用户名是 demo@example.com 密码是 pass123 登录',
    });

    expect(result.success).toBe(true);
    expect(result.commands).toEqual([
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
    ]);
  });
});
