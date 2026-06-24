jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
  }),
  { virtual: true }
);

import { RecorderDebugResponseService } from './recorder-debug-response.service';

describe('RecorderDebugResponseService', () => {
  it('createAndRecordChatResponse should append assistant turn while returning chat response', () => {
    const service = new RecorderDebugResponseService();
    const session: any = {
      sessionId: 'session-1',
      runtimeSessionId: 'runtime-1',
      browserInitialized: true,
      currentPageUrl: 'https://example.com',
      loopDraft: {
        mode: 'repeat_until',
        target: { scope: 'current_list', currentPageUrl: 'https://example.com' },
      },
      pendingLoopCaptureStartCommandIndex: 0,
      history: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const response = service.createAndRecordChatResponse({
      session,
      reply: '已执行完成',
      status: 'executed',
      observation: { currentPageUrl: 'https://example.com' },
      commands: [{ tool: 'click', params: { text: '登录' } }],
      execution: { success: true, results: [] },
      controlTokenState: {
        cleanedMessage: '',
        rawTokens: ['[循环开始]'],
        hasLoopStart: true,
        hasLoopEnd: false,
        hasConditionalBranch: false,
        manualInterventions: [],
        manualInterventionLabels: [],
      },
    });

    expect(response).toEqual(
      expect.objectContaining({
        sessionId: 'session-1',
        runtimeSessionId: 'runtime-1',
        reply: '已执行完成',
        status: 'executed',
        browserReady: true,
        loopDraft: expect.objectContaining({
          target: expect.objectContaining({ scope: 'current_list' }),
        }),
        loopState: expect.objectContaining({
          rawTokens: ['[循环开始]'],
          hasLoopStart: true,
          isLoopCaptureActive: true,
          pendingLoopCaptureStartCommandIndex: 0,
        }),
      })
    );
    expect(session.history).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: '已执行完成',
        commands: [{ tool: 'click', params: { text: '登录' } }],
        loopDraft: expect.objectContaining({
          target: expect.objectContaining({ scope: 'current_list' }),
        }),
        loopState: expect.objectContaining({
          rawTokens: ['[循环开始]'],
          hasLoopStart: true,
          isLoopCaptureActive: true,
        }),
      }),
    ]);
  });

  it('createAndRecordChatResponse should preserve candidate-first locator metadata in commands', () => {
    const service = new RecorderDebugResponseService();
    const session: any = {
      sessionId: 'session-2',
      runtimeSessionId: 'runtime-2',
      browserInitialized: true,
      currentPageUrl: 'https://example.com/login',
      history: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const commands = [
      {
        tool: 'click',
        params: { target: 'e-login' },
        description: '点击登录',
        locator: {
          strategy: 'ref',
          value: 'e-login',
          generatedBy: 'candidate-first',
          confidence: 0.98,
          matchedCandidateId: 'action_1',
          resolutionMode: 'preferred-locator',
        },
      },
    ];

    const response = service.createAndRecordChatResponse({
      session,
      reply: '已执行 candidate-first 点击',
      status: 'executed',
      observation: { currentPageUrl: 'https://example.com/login' },
      commands,
      execution: { success: true, results: [] },
    });

    expect(response.commands).toEqual(commands);
    expect(session.history).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: '已执行 candidate-first 点击',
        commands,
      }),
    ]);
  });

  it('createAndRecordChatResponse should expose existing loop capture state even without new control tokens', () => {
    const service = new RecorderDebugResponseService();
    const session: any = {
      sessionId: 'session-3',
      runtimeSessionId: 'runtime-3',
      browserInitialized: true,
      currentPageUrl: 'https://example.com/list',
      loopDraft: {
        mode: 'repeat_until',
        target: { scope: 'current_list' },
        eachIteration: {
          capturedFromIndex: 1,
          capturedToIndex: 3,
          stepIds: ['recorded_step_2', 'recorded_step_3', 'recorded_step_4'],
          stepCount: 3,
        },
      },
      history: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const response = service.createAndRecordChatResponse({
      session,
      reply: '已记录循环结束',
      status: 'answer',
    });

    expect(response.loopDraft).toEqual(
      expect.objectContaining({
        eachIteration: expect.objectContaining({
          stepCount: 3,
        }),
      })
    );
    expect(response.loopState).toEqual(
      expect.objectContaining({
        rawTokens: [],
        hasLoopStart: false,
        hasLoopEnd: false,
        isLoopCaptureActive: false,
      })
    );
  });
});
