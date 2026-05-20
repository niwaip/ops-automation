jest.mock('@nestjs/common', () => ({
  Injectable: () => () => undefined,
  Logger: class {
    log() {}
    warn() {}
    error() {}
    debug() {}
  },
}), { virtual: true });

jest.mock('./browser-command.service', () => ({
  BrowserCommandService: class {},
}), { virtual: true });

jest.mock('../model/model.service', () => ({
  ModelService: class {},
}), { virtual: true });

jest.mock('../redis/redis.service', () => ({
  RedisService: class {},
}), { virtual: true });

import { RecorderDebugService } from './recorder-debug.service';

describe('RecorderDebugService', () => {
  const createService = (overrides?: {
    browserCommandService?: Record<string, unknown>;
    modelService?: Record<string, unknown>;
    redisService?: Record<string, unknown>;
  }) => new RecorderDebugService(
    (overrides?.browserCommandService || {}) as any,
    (overrides?.modelService || {}) as any,
    (overrides?.redisService || {}) as any,
  );

  it('rewriteCommandWithSnapshotRefs should match button text with filler words removed', () => {
    const service = createService();
    const rewritten = (service as any).rewriteCommandWithSnapshotRefs(
      {
        tool: 'click',
        params: { text: 'RAM登录' },
        description: '点击 RAM 登录',
      },
      {
        nodes: [
          {
            ref: 'e10',
            role: 'button',
            name: '登录',
            line: '- button "登录" [ref=e10]',
          },
          {
            ref: 'e11',
            role: 'button',
            name: 'RAM 用户登录',
            line: '- button "RAM 用户登录" [ref=e11]',
          },
        ],
      },
    );

    expect(rewritten).toEqual(expect.objectContaining({
      params: expect.objectContaining({
        text: 'RAM登录',
        target: 'button[name="RAM 用户登录"]',
      }),
    }));
  });

  it('rewriteCommandWithSnapshotRefs should keep original target when only generic node matches', () => {
    const service = createService();
    const originalCommand = {
      tool: 'click',
      params: { text: 'RAM登录' },
      description: '点击 RAM 登录',
    };
    const rewritten = (service as any).rewriteCommandWithSnapshotRefs(
      originalCommand,
      {
        nodes: [
          {
            ref: 'e10',
            role: 'generic',
            name: '登录',
            line: '- generic "登录" [ref=e10]',
          },
          {
            ref: 'e11',
            role: 'generic',
            name: 'RAM 用户登录',
            line: '- generic "RAM 用户登录" [ref=e11]',
          },
        ],
      },
    );

    expect(rewritten).toEqual(originalCommand);
  });

  it('chat should prioritize executable commands over observation wording', async () => {
    const parsedCommands = [
      {
        tool: 'fill',
        params: { selector: '密码', value: 'secret' },
        description: '填写密码',
      },
      {
        tool: 'click',
        params: { text: 'Log On' },
        description: '点击 Log On',
      },
    ];
    const parseCommand = jest.fn().mockResolvedValue({
      success: true,
      commands: parsedCommands,
      explanation: '将依次填写密码，点击 Log On',
    });
    const service = createService({
      browserCommandService: { parseCommand },
    });
    const session = {
      sessionId: 'recorder-debug-1',
      runtimeSessionId: 'runtime-1',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: 'https://signin.aliyun.com',
      lastObservation: undefined,
      history: [],
      executedCommands: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const observation = {
      currentPageUrl: 'https://signin.aliyun.com',
      text: 'Log On page',
      title: 'Sign In',
      inputs: [{ label: '密码' }],
      buttons: [{ text: 'Log On' }],
      headings: [],
      links: [],
      suggestedParameters: [],
    };
    const execution = {
      success: true,
      results: [],
      steps: [],
      executedCommands: [
        {
          tool: 'fill',
          params: { selector: '密码', value: 'secret', target: 'e115' },
          description: '填写密码',
        },
      ],
    };

    jest.spyOn(service as any, 'loadOrCreateSession').mockResolvedValue(session);
    jest.spyOn(service as any, 'ensureBrowserReady').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'observePageSafely').mockResolvedValue(observation);
    const executeBrowserCommandsSpy = jest
      .spyOn(service as any, 'executeBrowserCommands')
      .mockResolvedValue(execution);
    const describePageSpy = jest
      .spyOn(service as any, 'describePage')
      .mockResolvedValue('observation answer');
    jest.spyOn(service as any, 'saveSession').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'refreshObservationAfterExecution').mockResolvedValue(undefined);

    const response = await service.chat({
      sessionId: session.sessionId,
      runtimeSessionId: session.runtimeSessionId,
      backend: 'cli',
      message: '输入密码 secret 然后点击 Log On',
    });

    expect(response.status).toBe('executed');
    expect(response.commands).toEqual(parsedCommands);
    expect(executeBrowserCommandsSpy).toHaveBeenCalledWith(
      session,
      expect.arrayContaining([
        expect.objectContaining({ tool: 'fill' }),
        expect.objectContaining({ tool: 'click' }),
      ]),
      { appendDefaultWait: true },
    );
    expect(describePageSpy).not.toHaveBeenCalled();
  });

  it('chat should return disambiguation options when strict mode click matches multiple elements', async () => {
    const parsedCommands = [
      {
        tool: 'click',
        params: { text: '登录' },
        description: '点击登录',
      },
    ];
    const parseCommand = jest.fn().mockResolvedValue({
      success: true,
      commands: parsedCommands,
      explanation: '点击页面上的登录按钮',
    });
    const service = createService({
      browserCommandService: { parseCommand },
    });
    const session = {
      sessionId: 'recorder-debug-ambiguous',
      runtimeSessionId: 'runtime-ambiguous',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: 'https://www.minimaxi.com',
      lastObservation: undefined,
      history: [],
      executedCommands: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const observation = {
      currentPageUrl: 'https://www.minimaxi.com',
      text: 'MiniMax',
      title: 'MiniMax',
      inputs: [],
      buttons: [
        { ref: 'e1203', text: '平台登录', role: 'link' },
        { ref: 'e1080', text: '平台登录', role: 'link' },
      ],
      headings: [],
      links: [],
      suggestedParameters: [],
    };
    const execution = {
      success: false,
      results: [],
      message: 'One or more CLI commands failed. First failure: click: Error: strict mode violation',
      steps: [
        { status: 'success', action: 'snapshot', params: {} },
        {
          status: 'error',
          action: 'click',
          params: { text: '登录', target: 'link[name="平台登录"]' },
          error: { message: 'Error: strict mode violation: locator matched 2 elements' },
        },
      ],
    };

    jest.spyOn(service as any, 'loadOrCreateSession').mockResolvedValue(session);
    jest.spyOn(service as any, 'ensureBrowserReady').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'observePageSafely').mockResolvedValue(observation);
    jest.spyOn(service as any, 'executeBrowserCommands').mockResolvedValue(execution);
    jest.spyOn(service as any, 'saveSession').mockResolvedValue(undefined);

    const response = await service.chat({
      sessionId: session.sessionId,
      runtimeSessionId: session.runtimeSessionId,
      backend: 'cli',
      message: '点击登录',
    });

    expect(response.status).toBe('question');
    expect(response.reply).toContain('请直接回复 `选1` 或 `选2` 继续');
    expect(response.reply).toContain('ref=e1203');
    expect(response.reply).toContain('ref=e1080');
    expect((session as any).pendingDisambiguation).toEqual(expect.objectContaining({
      targetLabel: '平台登录',
      candidates: expect.arrayContaining([
        expect.objectContaining({ index: 1, ref: 'e1203' }),
        expect.objectContaining({ index: 2, ref: 'e1080' }),
      ]),
    }));
  });

  it('chat should execute selected disambiguation candidate when user replies with option number', async () => {
    const parseCommand = jest.fn();
    const service = createService({
      browserCommandService: { parseCommand },
    });
    const session = {
      sessionId: 'recorder-debug-select',
      runtimeSessionId: 'runtime-select',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: 'https://www.minimaxi.com',
      lastObservation: undefined,
      history: [],
      executedCommands: [],
      pendingDisambiguation: {
        command: {
          tool: 'click',
          params: { text: '登录' },
          description: '点击登录',
        },
        targetLabel: '平台登录',
        candidates: [
          { index: 1, ref: 'e1203', text: '平台登录', role: 'link' },
          { index: 2, ref: 'e1080', text: '平台登录', role: 'link' },
        ],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const observation = {
      currentPageUrl: 'https://www.minimaxi.com',
      text: 'MiniMax',
      title: 'MiniMax',
      inputs: [],
      buttons: [],
      headings: [],
      links: [],
      suggestedParameters: [],
    };
    const execution = {
      success: true,
      results: [],
      steps: [],
      executedCommands: [
        {
          tool: 'click',
          params: { text: '登录', target: 'e1080' },
          description: '点击登录',
        },
      ],
    };

    jest.spyOn(service as any, 'loadOrCreateSession').mockResolvedValue(session);
    jest.spyOn(service as any, 'ensureBrowserReady').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'observePageSafely').mockResolvedValue(observation);
    const executeBrowserCommandsSpy = jest
      .spyOn(service as any, 'executeBrowserCommands')
      .mockResolvedValue(execution);
    jest.spyOn(service as any, 'saveSession').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'refreshObservationAfterExecution').mockResolvedValue(undefined);

    const response = await service.chat({
      sessionId: session.sessionId,
      runtimeSessionId: session.runtimeSessionId,
      backend: 'cli',
      message: '选2',
    });

    expect(parseCommand).not.toHaveBeenCalled();
    expect(response.status).toBe('executed');
    expect(response.commands).toEqual([
      expect.objectContaining({
        tool: 'click',
        params: expect.objectContaining({ target: 'e1080' }),
      }),
    ]);
    expect(executeBrowserCommandsSpy).toHaveBeenCalledWith(
      session,
      [expect.objectContaining({
        tool: 'click',
        params: expect.objectContaining({ target: 'e1080' }),
      })],
      { appendDefaultWait: true },
    );
  });

  it('refreshObservationAfterExecution should preserve newer executed commands from persisted session', async () => {
    const service = createService();
    const persistedSession = {
      sessionId: 'session-1',
      runtimeSessionId: 'runtime-1',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: 'https://old.example.com',
      lastObservation: {
        currentPageUrl: 'https://old.example.com',
        text: 'old',
        inputs: [],
        buttons: [],
        headings: [],
        links: [],
        suggestedParameters: [],
      },
      history: [],
      executedCommands: [
        { tool: 'navigate', params: { url: 'https://first.example.com' } },
        { tool: 'click', params: { text: 'second-step' } },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const staleSession = {
      ...persistedSession,
      currentPageUrl: 'https://first.example.com',
      executedCommands: [
        { tool: 'navigate', params: { url: 'https://first.example.com' } },
      ],
    };
    const refreshedObservation = {
      currentPageUrl: 'https://latest.example.com',
      text: 'latest',
      inputs: [],
      buttons: [],
      headings: [],
      links: [],
      suggestedParameters: [],
    };

    const loadSessionSpy = jest
      .spyOn(service as any, 'loadSession')
      .mockResolvedValue(persistedSession);
    const observePageSafelySpy = jest
      .spyOn(service as any, 'observePageSafely')
      .mockResolvedValue(refreshedObservation);
    const saveSessionSpy = jest
      .spyOn(service as any, 'saveSession')
      .mockResolvedValue(undefined);

    await (service as any).refreshObservationAfterExecution(staleSession);

    expect(observePageSafelySpy).toHaveBeenCalledWith(staleSession, staleSession.lastObservation);
    expect(loadSessionSpy).toHaveBeenCalledWith(staleSession.sessionId);
    expect(saveSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: persistedSession.sessionId,
        currentPageUrl: refreshedObservation.currentPageUrl,
        lastObservation: refreshedObservation,
        executedCommands: persistedSession.executedCommands,
      }),
    );
  });

  it('parseSnapshotNodes should attach nearby field labels to textbox nodes', () => {
    const service = createService();
    const nodes = (service as any).parseSnapshotNodes(`
- generic [ref=e111]:
  - generic [ref=e113]: "*Password"
  - generic [ref=e114]:
    - generic [ref=e115]:
      - textbox [active] [ref=e116]
    `);

    expect(nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ref: 'e116',
        role: 'textbox',
        contextLabel: 'Password',
      }),
    ]));
  });

  it('rewriteCommandWithSnapshotRefs should resolve password fill via nearby snapshot label', () => {
    const service = createService();
    const snapshotNodes = (service as any).parseSnapshotNodes(`
- generic [ref=e111]:
  - generic [ref=e113]: "*Password"
  - generic [ref=e114]:
    - generic [ref=e115]:
      - textbox [active] [ref=e116]
    `);

    const rewritten = (service as any).rewriteCommandWithSnapshotRefs(
      {
        tool: 'fill',
        params: { selector: '密码', value: 'secret' },
        description: '填写密码',
      },
      { nodes: snapshotNodes },
    );

    expect(rewritten).toEqual(expect.objectContaining({
      params: expect.objectContaining({
        selector: '密码',
        target: 'e116',
      }),
    }));
  });

  it('rewriteCommandWithSnapshotRefs should not map generic textbox selector to unrelated password field', () => {
    const service = createService();
    const snapshotNodes = (service as any).parseSnapshotNodes(`
- generic [ref=e111]:
  - generic [ref=e113]: "*Password"
  - generic [ref=e114]:
    - generic [ref=e115]:
      - textbox [active] [ref=e116]
    `);
    const originalCommand = {
      tool: 'fill',
      params: { selector: 'textbox', value: 'yangye' },
      description: '填写用户名',
    };

    const rewritten = (service as any).rewriteCommandWithSnapshotRefs(
      originalCommand,
      { nodes: snapshotNodes },
    );

    expect(rewritten).toEqual(originalCommand);
  });
});
