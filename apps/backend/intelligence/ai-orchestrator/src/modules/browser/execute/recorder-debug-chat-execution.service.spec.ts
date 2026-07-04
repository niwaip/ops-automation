jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
    Logger: class {
      warn() {}
      debug() {}
      log() {}
      error() {}
    },
  }),
  { virtual: true }
);

import { BrowserExecutionControllerService } from './browser-execution-controller.service';
import { RecorderDebugChatExecutionService } from './recorder-debug-chat-execution.service';
import { RecorderStateStoreService } from './recorder/recorder-state-store.service';

describe('RecorderDebugChatExecutionService', () => {
  it('delegates executeAndResolve to BrowserExecutionControllerService and captures pre-action state', async () => {
    const expected = {
      kind: 'completed',
      reply: 'ok',
      execution: { success: true },
      nextObservation: { currentPageUrl: 'https://example.com' },
    } as any;
    const browserExecutionControllerService = {
      executeAndResolve: jest.fn().mockResolvedValue(expected),
    } as unknown as BrowserExecutionControllerService;
    const capturePreActionState = jest.fn().mockResolvedValue({
      executionIndex: 1,
      stateHandle: 'rw:rt-1:1',
      runtimeSessionId: 'rt-1',
      capturedAt: '2026-07-03T00:00:00.000Z',
    });
    const recorderStateStoreService = {
      capturePreActionState,
    } as unknown as RecorderStateStoreService;
    const service = new RecorderDebugChatExecutionService(
      browserExecutionControllerService,
      recorderStateStoreService
    );
    const input: any = {
      session: {
        sessionId: 's-1',
        runtimeSessionId: 'rt-1',
        executedCommands: [],
        nextExecutionIndex: 1,
      },
      effectiveMessage: '点击登录',
      parsed: { success: true, commands: [], explanation: '点击登录' },
      observation: { currentPageUrl: 'https://example.com' },
      controlTokenState: {
        cleanedMessage: '点击登录',
        rawTokens: [],
        hasLoopStart: false,
        hasLoopEnd: false,
        hasConditionalBranch: false,
        manualInterventions: [],
        manualInterventionLabels: [],
      },
      executeBrowserCommands: jest.fn(),
      observePageSafely: jest.fn(),
      mergeObservationWithExecution: jest.fn(),
      applyRecorderControlTokensAfterExecution: jest.fn(),
    };

    const result = await service.executeAndResolve(input);

    // Pre-action state was captured for execution 1 BEFORE delegation
    expect(capturePreActionState).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's-1', runtimeSessionId: 'rt-1' }),
      1
    );
    // nextExecutionIndex was bumped to 2 so the next execution uses slot 2
    expect(input.session.nextExecutionIndex).toBe(2);
    // Delegation happened
    expect(browserExecutionControllerService.executeAndResolve).toHaveBeenCalledWith(input);
    // Outcome carries the executionIndex so the caller can stamp it on the assistant turn
    expect(result).toEqual(expect.objectContaining({ ...expected, executionIndex: 1 }));
  });

  it('continues execution when capturePreActionState throws (degraded rollback only)', async () => {
    const expected = {
      kind: 'completed',
      reply: 'ok',
      execution: { success: true },
      nextObservation: { currentPageUrl: 'https://example.com' },
    } as any;
    const browserExecutionControllerService = {
      executeAndResolve: jest.fn().mockResolvedValue(expected),
    } as unknown as BrowserExecutionControllerService;
    const capturePreActionState = jest
      .fn()
      .mockRejectedValue(new Error('worker unreachable'));
    const recorderStateStoreService = {
      capturePreActionState,
    } as unknown as RecorderStateStoreService;
    const service = new RecorderDebugChatExecutionService(
      browserExecutionControllerService,
      recorderStateStoreService
    );
    const input: any = {
      session: {
        sessionId: 's-1',
        runtimeSessionId: 'rt-1',
        executedCommands: [],
        nextExecutionIndex: 1,
      },
      effectiveMessage: '点击登录',
      parsed: { success: true, commands: [], explanation: '点击登录' },
      observation: { currentPageUrl: 'https://example.com' },
      controlTokenState: {
        cleanedMessage: '点击登录',
        rawTokens: [],
        hasLoopStart: false,
        hasLoopEnd: false,
        hasConditionalBranch: false,
        manualInterventions: [],
        manualInterventionLabels: [],
      },
      executeBrowserCommands: jest.fn(),
      observePageSafely: jest.fn(),
      mergeObservationWithExecution: jest.fn(),
      applyRecorderControlTokensAfterExecution: jest.fn(),
    };

    const result = await service.executeAndResolve(input);

    // Capture was attempted
    expect(capturePreActionState).toHaveBeenCalled();
    // Execution still proceeded
    expect(browserExecutionControllerService.executeAndResolve).toHaveBeenCalledWith(input);
    // Outcome still carries executionIndex
    expect(result).toEqual(expect.objectContaining({ executionIndex: 1 }));
  });

  it('skips state capture when session lacks runtimeSessionId', async () => {
    const expected = { kind: 'completed', reply: 'ok' } as any;
    const browserExecutionControllerService = {
      executeAndResolve: jest.fn().mockResolvedValue(expected),
    } as unknown as BrowserExecutionControllerService;
    const capturePreActionState = jest.fn();
    const recorderStateStoreService = {
      capturePreActionState,
    } as unknown as RecorderStateStoreService;
    const service = new RecorderDebugChatExecutionService(
      browserExecutionControllerService,
      recorderStateStoreService
    );
    const input: any = {
      // No runtimeSessionId — capture should be skipped, not throw
      session: { sessionId: 's-1', executedCommands: [], nextExecutionIndex: 1 },
      effectiveMessage: 'x',
      parsed: { success: true, commands: [], explanation: 'x' },
      observation: {
        inputs: [],
        buttons: [],
        headings: [],
        links: [],
        suggestedParameters: [],
      },
      controlTokenState: {
        cleanedMessage: 'x',
        rawTokens: [],
        hasLoopStart: false,
        hasLoopEnd: false,
        hasConditionalBranch: false,
        manualInterventions: [],
        manualInterventionLabels: [],
      },
      executeBrowserCommands: jest.fn(),
      observePageSafely: jest.fn(),
      mergeObservationWithExecution: jest.fn(),
      applyRecorderControlTokensAfterExecution: jest.fn(),
    };

    await service.executeAndResolve(input);

    expect(capturePreActionState).not.toHaveBeenCalled();
    expect(browserExecutionControllerService.executeAndResolve).toHaveBeenCalled();
  });

  // v4.1 P0 regression: Issue #1 — coerceStatefulSession used to return a NEW object,
  // so attachMetaToSession mutated a transient copy. The stateSnapshots index was lost
  // and rollback could never find captured state. This test verifies the original
  // session reference is mutated.
  it('writes stateSnapshots onto the ORIGINAL session object (not a copy)', async () => {
    const browserExecutionControllerService = {
      executeAndResolve: jest.fn().mockResolvedValue({ kind: 'completed', reply: 'ok' }),
    } as unknown as BrowserExecutionControllerService;
    // Simulate the real attachMetaToSession behavior: mutate the session argument in place
    const capturePreActionState = jest.fn().mockImplementation(async (session: any, idx: number) => {
      if (!session.stateSnapshots) session.stateSnapshots = {};
      session.stateSnapshots[idx] = {
        executionIndex: idx,
        stateHandle: `rw:${session.runtimeSessionId}:${idx}`,
        runtimeSessionId: session.runtimeSessionId,
        capturedAt: '2026-07-03T00:00:00.000Z',
      };
    });
    const recorderStateStoreService = {
      capturePreActionState,
    } as unknown as RecorderStateStoreService;
    const service = new RecorderDebugChatExecutionService(
      browserExecutionControllerService,
      recorderStateStoreService
    );
    const input: any = {
      session: {
        sessionId: 's-1',
        runtimeSessionId: 'rt-1',
        executedCommands: [],
        nextExecutionIndex: 1,
        // stateSnapshots intentionally absent — capture should create it on THIS object
      },
      effectiveMessage: 'x',
      parsed: { success: true, commands: [], explanation: 'x' },
      observation: {
        inputs: [],
        buttons: [],
        headings: [],
        links: [],
        suggestedParameters: [],
      },
      controlTokenState: {
        cleanedMessage: 'x',
        rawTokens: [],
        hasLoopStart: false,
        hasLoopEnd: false,
        hasConditionalBranch: false,
        manualInterventions: [],
        manualInterventionLabels: [],
      },
      executeBrowserCommands: jest.fn(),
      observePageSafely: jest.fn(),
      mergeObservationWithExecution: jest.fn(),
      applyRecorderControlTokensAfterExecution: jest.fn(),
    };

    await service.executeAndResolve(input);

    // The ORIGINAL session object must carry stateSnapshots — if coerceStatefulSession
    // returned a copy, this would be undefined and rollback would fail with no-captured-state.
    expect(input.session.stateSnapshots).toBeDefined();
    expect(input.session.stateSnapshots[1]).toEqual(
      expect.objectContaining({
        executionIndex: 1,
        stateHandle: 'rw:rt-1:1',
        runtimeSessionId: 'rt-1',
      })
    );
  });

  // v4.1 P0 regression: Issue #2 — executedCommands were never tagged with executionIndex.
  // The controller pushed commands without it, so rollback's persist scan and command
  // filter couldn't match commands to steps. This test verifies executionIndex is stamped
  // onto commands pushed during executeAndResolve.
  it('stamps executionIndex onto commands pushed by the controller during executeAndResolve', async () => {
    const browserExecutionControllerService = {
      executeAndResolve: jest.fn().mockImplementation(async (input: any) => {
        // Simulate the real controller pushing commands to session.executedCommands
        input.session.executedCommands.push(
          { tool: 'click', params: { target: 'btn-1' } },
          { tool: 'fill', params: { target: 'name', value: '张三' } }
        );
        return { kind: 'completed', reply: 'ok', execution: { success: true } };
      }),
    } as unknown as BrowserExecutionControllerService;
    const recorderStateStoreService = {
      capturePreActionState: jest.fn().mockResolvedValue(undefined),
    } as unknown as RecorderStateStoreService;
    const service = new RecorderDebugChatExecutionService(
      browserExecutionControllerService,
      recorderStateStoreService
    );
    const input: any = {
      session: {
        sessionId: 's-1',
        runtimeSessionId: 'rt-1',
        executedCommands: [],
        nextExecutionIndex: 5,
      },
      effectiveMessage: 'x',
      parsed: { success: true, commands: [], explanation: 'x' },
      observation: {
        inputs: [],
        buttons: [],
        headings: [],
        links: [],
        suggestedParameters: [],
      },
      controlTokenState: {
        cleanedMessage: 'x',
        rawTokens: [],
        hasLoopStart: false,
        hasLoopEnd: false,
        hasConditionalBranch: false,
        manualInterventions: [],
        manualInterventionLabels: [],
      },
      executeBrowserCommands: jest.fn(),
      observePageSafely: jest.fn(),
      mergeObservationWithExecution: jest.fn(),
      applyRecorderControlTokensAfterExecution: jest.fn(),
    };

    await service.executeAndResolve(input);

    // Both commands pushed by the controller must carry executionIndex=5.
    // Without this, rollback's filter (cmd.executionIndex || 0) < targetIndex would
    // evaluate to 0 < target (always true) and never remove any command.
    expect(input.session.executedCommands).toHaveLength(2);
    expect(input.session.executedCommands[0].executionIndex).toBe(5);
    expect(input.session.executedCommands[1].executionIndex).toBe(5);
    // nextExecutionIndex was bumped to 6
    expect(input.session.nextExecutionIndex).toBe(6);
  });

  // v4.1 P0 regression: prepareExecution + stampExecutionIndex are used by the staged
  // navigate path (which bypasses executeAndResolve). Verify they work standalone.
  it('prepareExecution assigns executionIndex + captures state; stampExecutionIndex tags commands', async () => {
    const capturePreActionState = jest.fn().mockImplementation(async (session: any, idx: number) => {
      if (!session.stateSnapshots) session.stateSnapshots = {};
      session.stateSnapshots[idx] = { executionIndex: idx, stateHandle: `rw:rt-1:${idx}` };
    });
    const recorderStateStoreService = {
      capturePreActionState,
    } as unknown as RecorderStateStoreService;
    const browserExecutionControllerService = {} as unknown as BrowserExecutionControllerService;
    const service = new RecorderDebugChatExecutionService(
      browserExecutionControllerService,
      recorderStateStoreService
    );
    const session: any = {
      sessionId: 's-1',
      runtimeSessionId: 'rt-1',
      executedCommands: [],
      nextExecutionIndex: 3,
    };

    // Simulate staged navigate: prepare → push commands → stamp
    const idx = await service.prepareExecution(session);
    expect(idx).toBe(3);
    expect(session.nextExecutionIndex).toBe(4);
    expect(session.stateSnapshots[3]).toBeDefined();

    const prePushCount = session.executedCommands.length;
    session.executedCommands.push({ tool: 'navigate', params: { url: 'https://example.com' } });
    service.stampExecutionIndex(session, idx, prePushCount);

    expect(session.executedCommands[0].executionIndex).toBe(3);
  });

  // v4.1 P0 Issue #3 regression: staged navigate + follow-up must share one
  // executionIndex so rollback doesn't delete the assistant turn while leaving
  // navigate commands orphaned. The caller calls prepareExecution() for the navigate,
  // then passes the assigned index as preAssignedExecutionIndex to executeAndResolve
  // for the follow-up — skipping the second prepareExecution() call.
  it('executeAndResolve with preAssignedExecutionIndex skips prepareExecution and reuses the index', async () => {
    const capturePreActionState = jest.fn().mockImplementation(async (session: any, idx: number) => {
      if (!session.stateSnapshots) session.stateSnapshots = {};
      session.stateSnapshots[idx] = { executionIndex: idx, stateHandle: `rw:rt-1:${idx}` };
    });
    const recorderStateStoreService = {
      capturePreActionState,
    } as unknown as RecorderStateStoreService;
    const browserExecutionControllerService = {
      executeAndResolve: jest.fn().mockImplementation(async (input: any) => {
        // Simulate the controller pushing follow-up commands
        input.session.executedCommands.push(
          { tool: 'click', params: { target: 'btn-1' } },
          { tool: 'fill', params: { target: 'name', value: '张三' } }
        );
        return { kind: 'completed', reply: 'ok', execution: { success: true } };
      }),
    } as unknown as BrowserExecutionControllerService;
    const service = new RecorderDebugChatExecutionService(
      browserExecutionControllerService,
      recorderStateStoreService
    );

    const session: any = {
      sessionId: 's-1',
      runtimeSessionId: 'rt-1',
      executedCommands: [],
      nextExecutionIndex: 3,
    };

    // Step 1: staged navigate calls prepareExecution → index=3, cursor bumped to 4
    const navigateIndex = await service.prepareExecution(session);
    expect(navigateIndex).toBe(3);
    expect(session.nextExecutionIndex).toBe(4);

    // Navigate commands pushed + stamped with index 3
    session.executedCommands.push({ tool: 'navigate', params: { url: 'https://example.com' } });
    service.stampExecutionIndex(session, navigateIndex, 0);
    expect(session.executedCommands[0].executionIndex).toBe(3);

    // Step 2: follow-up executeAndResolve with preAssignedExecutionIndex=3
    // prepareExecution should NOT be called again — capturePreActionState call count stays at 1
    const captureCallCountBefore = capturePreActionState.mock.calls.length;
    const result = await service.executeAndResolve({
      session,
      effectiveMessage: 'click button',
      parsed: { success: true, commands: [], explanation: 'click' },
      observation: {
        inputs: [],
        buttons: [],
        headings: [],
        links: [],
        suggestedParameters: [],
      },
      controlTokenState: {
        cleanedMessage: 'click button',
        rawTokens: [],
        hasLoopStart: false,
        hasLoopEnd: false,
        hasConditionalBranch: false,
        manualInterventions: [],
        manualInterventionLabels: [],
      },
      executeBrowserCommands: jest.fn(),
      observePageSafely: jest.fn(),
      mergeObservationWithExecution: jest.fn(),
      applyRecorderControlTokensAfterExecution: jest.fn(),
      preAssignedExecutionIndex: navigateIndex,
    });

    // prepareExecution was NOT called again (no second capture)
    expect(capturePreActionState.mock.calls.length).toBe(captureCallCountBefore);
    // nextExecutionIndex stays at 4 (not bumped to 5)
    expect(session.nextExecutionIndex).toBe(4);
    // Follow-up commands stamped with the SAME index (3), not a new one
    expect(session.executedCommands).toHaveLength(3);
    expect(session.executedCommands[1].executionIndex).toBe(3);
    expect(session.executedCommands[2].executionIndex).toBe(3);
    // Outcome carries the pre-assigned index
    expect(result).toEqual(expect.objectContaining({ executionIndex: 3 }));
  });
});
