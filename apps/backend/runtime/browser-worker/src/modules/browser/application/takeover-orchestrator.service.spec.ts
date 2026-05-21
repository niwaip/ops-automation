jest.mock('dockerode', () => jest.fn(() => ({})), { virtual: true });

import { TakeoverOrchestratorService } from './takeover-orchestrator.service';

describe('TakeoverOrchestratorService', () => {
  const createService = () => {
    const browserSessionService = {
      freeze: jest.fn().mockResolvedValue({}),
      resume: jest.fn().mockResolvedValue({}),
    };
    const browserCommandService = {
      inspectState: jest.fn().mockResolvedValue({
        pageUrl: 'https://example.com/dashboard',
        pageTitle: '控制台',
      }),
      executeCommands: jest.fn().mockResolvedValue({
        success: true,
        results: [
          {
            command: 'snapshot',
            snapshot: { path: '/tmp/runtime-1.yaml' },
            data: { path: '/tmp/runtime-1.yaml' },
          },
          {
            command: 'get_text',
            data: { text: '欢迎回来' },
          },
        ],
        steps: [
          {
            id: 'step-1',
            action: 'click',
            status: 'success',
            source: 'ai',
            backend: 'cli',
            timestamp: Date.now(),
          },
        ],
      }),
    };
    const recorderService = {
      startTakeoverRecording: jest.fn().mockResolvedValue({ sessionId: 'tk-1' }),
      stopTakeoverRecording: jest.fn().mockResolvedValue({
        rawScript: `await page.getByText('平台登录').click();`,
        recordedAt: '2026-05-20T10:00:00.000Z',
      }),
    };
    const parser = {
      parse: jest.fn().mockReturnValue([
        {
          id: 'patch_001',
          action: 'click',
          params: { text: '平台登录' },
          status: 'success',
          source: 'manual',
          backend: 'cli',
          timestamp: Date.now(),
        },
      ]),
    };
    const runtimeState = {
      runtimeSessionId: 'runtime-1',
      backend: 'cli',
      status: 'frozen',
      currentUrl: 'https://example.com/login',
      endpoints: {
        novnc: 'http://localhost:6080',
        cdp: 'ws://localhost:9222/devtools/browser/1',
      },
      updatedAt: new Date().toISOString(),
    };
    const registry = {
      get: jest.fn().mockReturnValue(runtimeState),
      patch: jest.fn(),
    };
    const workerService = {
      getWorkerByRuntimeSessionId: jest.fn().mockResolvedValue({
        endpoints: runtimeState.endpoints,
      }),
    };

    return {
      service: new TakeoverOrchestratorService(
        browserSessionService as any,
        browserCommandService as any,
        recorderService as any,
        parser as any,
        registry as any,
        workerService as any,
      ),
      browserSessionService,
      browserCommandService,
      recorderService,
      parser,
      registry,
    };
  };

  it('startTakeover freezes session and starts recorder', async () => {
    const { service, browserSessionService, recorderService, registry } = createService();

    const result = await service.startTakeover({
      runtimeSessionId: 'runtime-1',
      backend: 'cli',
      failedStepId: 'step-9',
      reason: 'AI step failed',
    });

    expect(browserSessionService.freeze).toHaveBeenCalledWith({
      runtimeSessionId: 'runtime-1',
      backend: 'cli',
      reason: 'AI step failed',
    });
    expect(recorderService.startTakeoverRecording).toHaveBeenCalledWith('runtime-1', {
      startUrl: 'https://example.com/login',
      reuseExistingPage: true,
    });
    expect(registry.patch).toHaveBeenCalledWith('runtime-1', expect.objectContaining({
      controlMode: 'HUMAN_CONTROL',
      takeoverStatus: 'recording',
      activeTakeoverSessionId: 'tk-1',
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      takeoverSessionId: 'tk-1',
      status: 'recording',
    }));
  });

  it('stopTakeover parses patch steps and captures observation', async () => {
    const { service, recorderService, parser, registry } = createService();
    await service.startTakeover({
      runtimeSessionId: 'runtime-1',
      backend: 'cli',
      reason: 'AI step failed',
    });

    const result = await service.stopTakeover({
      runtimeSessionId: 'runtime-1',
      takeoverSessionId: 'tk-1',
    });

    expect(recorderService.stopTakeoverRecording).toHaveBeenCalledWith('runtime-1');
    expect(parser.parse).toHaveBeenCalledWith(
      `await page.getByText('平台登录').click();`,
      expect.objectContaining({
        backend: 'cli',
        source: 'manual_takeover',
        runtimeSessionId: 'runtime-1',
      }),
    );
    expect(registry.patch).toHaveBeenCalledWith('runtime-1', expect.objectContaining({
      takeoverStatus: 'ready_to_resume',
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      status: 'ready_to_resume',
      observation: expect.objectContaining({
        currentPageUrl: 'https://example.com/dashboard',
        title: '控制台',
        text: '欢迎回来',
      }),
    }));
  });

  it('resumeTakeover resumes session and executes resume commands', async () => {
    const { service, browserSessionService, browserCommandService, registry } = createService();
    await service.startTakeover({
      runtimeSessionId: 'runtime-1',
      backend: 'cli',
    });

    const result = await service.resumeTakeover({
      runtimeSessionId: 'runtime-1',
      backend: 'cli',
      takeoverSessionId: 'tk-1',
      strategy: 'replace_failed_step',
      resumeCommands: [
        { tool: 'click', params: { text: '平台登录' }, description: '点击平台登录' },
      ],
    });

    expect(browserSessionService.resume).toHaveBeenCalledWith({
      runtimeSessionId: 'runtime-1',
      backend: 'cli',
    });
    expect(browserCommandService.executeCommands).toHaveBeenCalledWith(
      [
        { tool: 'click', params: { text: '平台登录' }, description: '点击平台登录' },
      ],
      expect.objectContaining({
        runtimeSessionId: 'runtime-1',
        backend: 'cli',
        includeSteps: true,
      }),
    );
    expect(registry.patch).toHaveBeenCalledWith('runtime-1', expect.objectContaining({
      controlMode: 'AGENT_RUNNING',
      takeoverStatus: 'resuming',
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      status: 'completed',
    }));
  });
});
