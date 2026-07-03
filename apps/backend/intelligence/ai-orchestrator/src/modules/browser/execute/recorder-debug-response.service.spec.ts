jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
  }),
  { virtual: true }
);

import { RecorderDebugResponseService } from './recorder-debug-response.service';
import { RecorderDebugOutcomeService } from './recorder-debug-outcome.service';
import { RecorderHistoryCompressionService } from './recorder';

describe('RecorderDebugResponseService', () => {
  const buildService = () =>
    new RecorderDebugResponseService(
      new RecorderDebugOutcomeService(),
      new RecorderHistoryCompressionService()
    );

  it('createAndRecordChatResponse should append assistant turn while returning chat response', () => {
    const service = buildService();
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
        outcomeVersion: 'v1',
        outcome: expect.objectContaining({
          kind: 'action',
        }),
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
        outcomeVersion: 'v1',
        outcome: expect.objectContaining({
          kind: 'action',
        }),
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
    const service = buildService();
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
    const service = buildService();
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
    expect(response.outcome).toEqual(
      expect.objectContaining({
        kind: 'answer',
      })
    );
  });

  it('finalizeSession compresses turns older than maxHistory while preserving the recent window intact', () => {
    const service = buildService();
    const session: any = {
      sessionId: 'session-compress',
      runtimeSessionId: 'runtime-compress',
      browserInitialized: true,
      currentPageUrl: 'https://example.com',
      history: [] as any[],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    // Push 25 turns, each with commands/execution/observation — fields that should be
    // dropped on the compressed (older) turns but kept on the recent ones.
    for (let i = 0; i < 25; i += 1) {
      session.history.push({
        role: 'assistant',
        content: `turn ${i}`,
        timestamp: new Date(2026, 0, 1, 0, 0, i).toISOString(),
        commands: [{ tool: 'click', params: { ref: `e${i}` } }],
        execution: { success: true, results: [{ data: `r${i}` }] },
        observation: {
          currentPageUrl: `https://example.com/p${i}`,
          inputs: [],
          buttons: [],
          headings: [],
          links: [],
          suggestedParameters: [],
        },
        outcomeVersion: 'v1',
        outcome: {
          kind: 'action',
          status: 'succeeded',
          intent: { userGoal: `goal ${i}` },
          evidence: {
            before: { inputs: [], buttons: [], headings: [], links: [], suggestedParameters: [] },
            after: { inputs: [], buttons: [], headings: [], links: [], suggestedParameters: [] },
            diff: { urlChanged: true },
            toolExecution: { success: true, commandCount: 1, executedCommandCount: 1 },
          },
          verification: { verifier: 'click', routeReason: 'actionType', level: 'page', success: true, confidence: 0.8, checks: [] },
          summary: { userVisible: `已点击 ${i}`, compact: `click ${i}` },
        },
      });
    }

    service.finalizeSession(session, 10);

    // Total length unchanged: 25 turns, no slicing (absolute cap = 30)
    expect(session.history.length).toBe(25);
    // First 15 turns compressed
    expect(session.history.slice(0, 15).every((t: any) => t.compressed === true)).toBe(true);
    // Last 10 turns uncompressed
    expect(session.history.slice(15).every((t: any) => t.compressed !== true)).toBe(true);
    // Compressed turn drops raw fields but keeps outcome summary
    const compressed = session.history[0];
    expect(compressed.commands).toBeUndefined();
    expect(compressed.execution).toBeUndefined();
    expect(compressed.observation).toBeUndefined();
    expect(compressed.outcome.evidence.before).toBeUndefined();
    expect(compressed.outcome.evidence.after).toBeUndefined();
    expect(compressed.outcome.evidence.diff).toBeDefined();
    expect(compressed.outcome.evidence.toolExecution).toBeDefined();
    expect(compressed.outcome.summary.userVisible).toBe('已点击 0');
    // Recent turn keeps everything
    const recent = session.history[24];
    expect(recent.commands).toBeDefined();
    expect(recent.execution).toBeDefined();
    expect(recent.observation).toBeDefined();
    expect(recent.outcome.evidence.before).toBeDefined();
    expect(recent.outcome.evidence.after).toBeDefined();
    expect(recent.compressed).toBeUndefined();
  });

  it('finalizeSession slices at 3x maxHistory when compressed history grows past the absolute cap', () => {
    const service = buildService();
    const session: any = {
      sessionId: 'session-slice',
      runtimeSessionId: 'runtime-slice',
      browserInitialized: true,
      history: [] as any[],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    for (let i = 0; i < 40; i += 1) {
      session.history.push({
        role: 'assistant',
        content: `turn ${i}`,
        timestamp: new Date(2026, 0, 1, 0, 0, i).toISOString(),
        outcome: {
          kind: 'action',
          status: 'succeeded',
          intent: { userGoal: `goal ${i}` },
          evidence: { diff: {}, toolExecution: { success: true, commandCount: 1, executedCommandCount: 1 } },
          verification: { verifier: 'click', routeReason: 'actionType', level: 'page', success: true, confidence: 0.8, checks: [] },
          summary: { userVisible: `已点击 ${i}`, compact: `click ${i}` },
        },
      });
    }

    // maxHistory = 10 → absolute cap = 30. 40 turns should be trimmed to 30.
    service.finalizeSession(session, 10);
    expect(session.history.length).toBe(30);
    // Oldest 10 turns dropped, remaining 20 compressed + 10 recent
    expect(session.history.slice(0, 20).every((t: any) => t.compressed === true)).toBe(true);
    expect(session.history.slice(20).every((t: any) => t.compressed !== true)).toBe(true);
    // Most recent content preserved
    expect(session.history[29].content).toBe('turn 39');
  });
});
