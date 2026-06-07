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

import { ExecutionReconcileService } from './execution-reconcile.service';

describe('ExecutionReconcileService', () => {
  const createService = (modelService?: Record<string, unknown>) => new ExecutionReconcileService({
    getPreferredDefaultModel: jest.fn().mockReturnValue(null),
    callModel: jest.fn(),
    ...(modelService || {}),
  } as any);

  it('returns replan_from_current_state when observation indicates a new page stage', async () => {
    const service = createService();

    await expect(service.reconcile({
      sessionId: 'session-1',
      runtimeSessionId: 'runtime-1',
      failedCommand: {
        tool: 'click',
        params: { text: '登录' },
        description: '点击登录',
      },
      originalCommands: [
        { tool: 'navigate', params: { url: 'https://example.com/login' }, description: '打开登录页' },
        { tool: 'click', params: { text: '登录' }, description: '点击登录' },
      ],
      patchSteps: [
        { action: 'click', params: { text: '平台登录' }, source: 'manual' },
      ],
      observation: {
        currentPageUrl: 'https://example.com/dashboard',
        title: '控制台',
        text: '欢迎回来',
      },
    })).resolves.toEqual(expect.objectContaining({
      strategy: 'replan_from_current_state',
      resumeCommands: expect.arrayContaining([
        expect.objectContaining({ tool: 'snapshot' }),
        expect.objectContaining({ tool: 'get_text' }),
      ]),
    }));
  });

  it('returns replace_failed_step when patch steps directly match failed action', async () => {
    const service = createService();

    await expect(service.reconcile({
      sessionId: 'session-1',
      runtimeSessionId: 'runtime-1',
      failedCommand: {
        tool: 'click',
        params: { text: '登录' },
        description: '点击登录',
      },
      originalCommands: [
        { tool: 'navigate', params: { url: 'https://example.com/login' }, description: '打开登录页' },
        { tool: 'click', params: { text: '登录' }, description: '点击登录' },
        { tool: 'click', params: { text: '订单管理' }, description: '点击订单管理' },
      ],
      patchSteps: [
        { action: 'click', params: { text: '平台登录' }, source: 'manual' },
      ],
      observation: {
        currentPageUrl: 'https://example.com/login',
        title: '登录',
        text: '请输入账号密码',
      },
    })).resolves.toEqual(expect.objectContaining({
      strategy: 'replace_failed_step',
      resumeCommands: [
        expect.objectContaining({ tool: 'click', params: { text: '平台登录' } }),
        expect.objectContaining({ tool: 'click', params: { text: '订单管理' } }),
      ],
    }));
  });

  it('returns insert_patch_steps when manual steps are prerequisite fixes', async () => {
    const service = createService();

    await expect(service.reconcile({
      sessionId: 'session-1',
      runtimeSessionId: 'runtime-1',
      failedCommand: {
        tool: 'click',
        params: { text: '提交' },
        description: '点击提交',
      },
      originalCommands: [
        { tool: 'click', params: { text: '提交' }, description: '点击提交' },
        { tool: 'click', params: { text: '确认' }, description: '点击确认' },
      ],
      patchSteps: [
        { action: 'click', params: { text: '关闭弹窗' }, source: 'manual' },
        { action: 'click', params: { text: '展开菜单' }, source: 'manual' },
        { action: 'click', params: { text: '聚焦表单' }, source: 'manual' },
      ],
      observation: {
        currentPageUrl: 'https://example.com/form',
        title: '表单页',
        text: '请继续填写',
      },
    })).resolves.toEqual(expect.objectContaining({
      strategy: 'insert_patch_steps',
      resumeCommands: expect.arrayContaining([
        expect.objectContaining({ tool: 'click', params: { text: '关闭弹窗' } }),
        expect.objectContaining({ tool: 'click', params: { text: '提交' } }),
        expect.objectContaining({ tool: 'click', params: { text: '确认' } }),
      ]),
    }));
  });

  it('maps runtime locator.strategy patch steps into executable resume commands', async () => {
    const service = createService();

    await expect(service.reconcile({
      sessionId: 'session-1',
      runtimeSessionId: 'runtime-1',
      failedCommand: {
        tool: 'click',
        params: { text: '登录' },
        description: '点击登录',
      },
      originalCommands: [
        { tool: 'click', params: { text: '登录' }, description: '点击登录' },
        { tool: 'click', params: { text: '订单管理' }, description: '点击订单管理' },
      ],
      patchSteps: [
        {
          action: 'click',
          locator: {
            strategy: 'role',
            value: 'button',
            role: 'button',
            name: '平台登录',
          },
          source: 'manual_takeover',
        },
      ],
      observation: {
        currentPageUrl: 'https://example.com/login',
        title: '登录',
        text: '请输入账号密码',
      },
    })).resolves.toEqual(expect.objectContaining({
      strategy: 'replace_failed_step',
      resumeCommands: [
        expect.objectContaining({
          tool: 'click',
          params: { target: 'button[name="平台登录"]' },
        }),
        expect.objectContaining({ tool: 'click', params: { text: '订单管理' } }),
      ],
    }));
  });

  it('maps label, placeholder and testid patch locators into executable commands', async () => {
    const service = createService();

    await expect(service.reconcile({
      sessionId: 'session-1',
      runtimeSessionId: 'runtime-1',
      failedCommand: {
        tool: 'fill',
        params: { selector: '#login-form' },
        description: '填写登录信息',
      },
      originalCommands: [
        { tool: 'fill', params: { selector: '#login-form' }, description: '填写登录信息' },
      ],
      patchSteps: [
        {
          action: 'fill',
          locator: {
            strategy: 'label',
            value: '用户名',
          },
          params: { value: 'demo' },
          source: 'manual_takeover',
        },
        {
          action: 'fill',
          locator: {
            strategy: 'placeholder',
            value: '请输入密码',
          },
          params: { value: 'secret' },
          source: 'manual_takeover',
        },
        {
          action: 'click',
          locator: {
            strategy: 'testid',
            value: 'submit-login',
          },
          source: 'manual_takeover',
        },
      ],
      observation: {
        currentPageUrl: 'https://example.com/login',
        title: '登录',
        text: '请输入账号密码',
      },
    })).resolves.toEqual(expect.objectContaining({
      strategy: 'insert_patch_steps',
      resumeCommands: expect.arrayContaining([
        expect.objectContaining({
          tool: 'fill',
          params: { value: 'demo', target: 'label=用户名' },
        }),
        expect.objectContaining({
          tool: 'fill',
          params: { value: 'secret', target: 'placeholder=请输入密码' },
        }),
        expect.objectContaining({
          tool: 'click',
          params: { selector: '[data-testid="submit-login"]' },
        }),
      ]),
    }));
  });

  it('maps hover and latest-tab patch steps into executable resume commands', async () => {
    const service = createService();

    await expect(service.reconcile({
      sessionId: 'session-1',
      runtimeSessionId: 'runtime-1',
      failedCommand: {
        tool: 'hover',
        params: { text: '详情' },
        description: '悬停详情入口',
      },
      originalCommands: [
        { tool: 'hover', params: { text: '详情' }, description: '悬停详情入口' },
        { tool: 'click', params: { text: '继续处理' }, description: '点击继续处理' },
      ],
      patchSteps: [
        {
          action: 'switch_latest_tab',
          params: {},
          source: 'manual_takeover',
        },
        {
          action: 'hover',
          locator: {
            strategy: 'role',
            value: 'button',
            role: 'button',
            name: '详情',
          },
          source: 'manual_takeover',
        },
      ],
      observation: {
        currentPageUrl: 'https://example.com/detail',
        title: '详情页',
        text: '继续处理',
      },
    })).resolves.toEqual(expect.objectContaining({
      strategy: 'replace_failed_step',
      resumeCommands: [
        expect.objectContaining({
          tool: 'switch_latest_tab',
          params: {},
        }),
        expect.objectContaining({
          tool: 'hover',
          params: { target: 'button[name="详情"]' },
        }),
        expect.objectContaining({ tool: 'click', params: { text: '继续处理' } }),
      ],
    }));
  });
});
