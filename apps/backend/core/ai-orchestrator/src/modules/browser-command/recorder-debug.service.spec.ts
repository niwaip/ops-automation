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
  const createService = () => new RecorderDebugService(
    {} as any,
    {} as any,
    {} as any,
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
});
