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

import { RecorderDebugRollbackService } from './recorder-debug-rollback.service';
import type { RecorderStateStoreService } from './recorder-state-store.service';
import type { BrowserCommand } from '../../intent';
import type { RecorderDebugSession, RecorderDebugTurn } from '../recorder-debug.types';

const makeCommand = (overrides: Partial<BrowserCommand> & { executionIndex: number }): BrowserCommand => ({
  tool: overrides.tool ?? 'click',
  params: overrides.params ?? { target: 'btn-1' },
  description: overrides.description,
  locator: overrides.locator,
  sideEffectLevel: overrides.sideEffectLevel,
  executionIndex: overrides.executionIndex,
});

const makeAssistantTurn = (
  executionIndex: number | undefined,
  content = '执行了动作'
): RecorderDebugTurn => ({
  role: 'assistant',
  content,
  timestamp: `t-${executionIndex ?? 'x'}`,
  ...(typeof executionIndex === 'number' ? { executionIndex } : {}),
});

const makeSession = (overrides?: Partial<RecorderDebugSession>): RecorderDebugSession => ({
  sessionId: 's-1',
  runtimeSessionId: 'rt-1',
  backend: 'cli',
  browserInitialized: true,
  history: overrides?.history ?? [],
  executedCommands: overrides?.executedCommands ?? [],
  createdAt: '2026-07-03T00:00:00.000Z',
  updatedAt: '2026-07-03T00:00:00.000Z',
  nextExecutionIndex: overrides?.nextExecutionIndex ?? 4,
  revision: overrides?.revision ?? 5,
  ...(overrides?.loopDraft ? { loopDraft: overrides.loopDraft } : {}),
  ...(overrides?.pendingLoopCaptureStartCommandIndex !== undefined
    ? { pendingLoopCaptureStartCommandIndex: overrides.pendingLoopCaptureStartCommandIndex }
    : {}),
  ...(overrides?.stateSnapshots ? { stateSnapshots: overrides.stateSnapshots } : {}),
  ...(overrides?.lastObservation ? { lastObservation: overrides.lastObservation } : {}),
  ...(overrides?.currentPageUrl ? { currentPageUrl: overrides.currentPageUrl } : {}),
});

const mockStateStore = (overrides?: Partial<{
  restoreState: jest.Mock;
  cleanupAfter: jest.Mock;
  capturePreActionState: jest.Mock;
  getStateMeta: jest.Mock;
  cleanupAll: jest.Mock;
}>): RecorderStateStoreService =>
  ({
    restoreState:
      overrides?.restoreState ?? jest.fn().mockResolvedValue({ restored: true }),
    cleanupAfter: overrides?.cleanupAfter ?? jest.fn().mockResolvedValue({ cleanedCount: 0 }),
    capturePreActionState: overrides?.capturePreActionState ?? jest.fn().mockResolvedValue(undefined),
    getStateMeta: overrides?.getStateMeta ?? jest.fn().mockReturnValue(undefined),
    cleanupAll: overrides?.cleanupAll ?? jest.fn().mockResolvedValue({ cleanedCount: 0 }),
  } as any);

describe('RecorderDebugRollbackService', () => {
  describe('rollbackLastStep — happy path', () => {
    it('filters history and executedCommands by executionIndex, restores state, bumps nextExecutionIndex and revision', async () => {
      const session = makeSession({
        nextExecutionIndex: 4,
        revision: 5,
        history: [
          { role: 'user', content: 'go', timestamp: 'u1' },
          makeAssistantTurn(1),
          makeAssistantTurn(2),
          makeAssistantTurn(3),
        ],
        executedCommands: [
          makeCommand({ executionIndex: 1, tool: 'navigate', sideEffectLevel: 'read' }),
          makeCommand({ executionIndex: 2, tool: 'click', sideEffectLevel: 'read' }),
          makeCommand({ executionIndex: 3, tool: 'click', sideEffectLevel: 'read' }),
        ],
      });
      const stateStore = mockStateStore();
      const service = new RecorderDebugRollbackService(stateStore);

      const result = await service.rollbackLastStep({ session });

      expect(result.status).toBe('succeeded');
      if (result.status !== 'succeeded') return;
      expect(result.targetExecutionIndex).toBe(3);
      expect(result.rolledBackTurnCount).toBe(1);
      expect(result.rolledBackCommandCount).toBe(1);
      // User turn + first 2 assistant turns survive
      expect(session.history.filter((t) => t.role === 'assistant')).toHaveLength(2);
      expect(session.executedCommands).toHaveLength(2);
      expect(session.executedCommands.every((c) => (c.executionIndex || 0) < 3)).toBe(true);
      // Cursor rewound; revision bumped (rollback commit)
      expect(session.nextExecutionIndex).toBe(3);
      expect(session.revision).toBe(6);
      // Worker called for restore + cleanup
      expect(stateStore.restoreState).toHaveBeenCalledWith(expect.any(Object), 3);
      expect(stateStore.cleanupAfter).toHaveBeenCalledWith(expect.any(Object), 3);
    });

    it('returns noop when target is at or before the first execution', async () => {
      const session = makeSession({ nextExecutionIndex: 1, revision: 0 });
      const stateStore = mockStateStore();
      const service = new RecorderDebugRollbackService(stateStore);

      const result = await service.rollbackLastStep({ session });

      expect(result.status).toBe('noop');
      expect(stateStore.restoreState).not.toHaveBeenCalled();
    });

    it('preserves user/system turns and assistant turns without executionIndex', async () => {
      const session = makeSession({
        nextExecutionIndex: 3,
        history: [
          { role: 'user', content: 'u1', timestamp: 'u1' },
          makeAssistantTurn(1),
          { role: 'system', content: 'system note', timestamp: 's1' },
          // Assistant turn without executionIndex — pre-P0 turn, survives rollback
          { role: 'assistant', content: 'legacy answer', timestamp: 'legacy' },
          makeAssistantTurn(2),
        ],
        executedCommands: [
          makeCommand({ executionIndex: 1, sideEffectLevel: 'read' }),
          makeCommand({ executionIndex: 2, sideEffectLevel: 'read' }),
        ],
      });
      const stateStore = mockStateStore();
      const service = new RecorderDebugRollbackService(stateStore);

      const result = await service.rollbackLastStep({ session });

      expect(result.status).toBe('succeeded');
      // user + system + legacy assistant + assistant-1 survive; assistant-2 filtered
      expect(session.history).toHaveLength(4);
      expect(session.history.some((t) => t.role === 'assistant' && t.content === 'legacy answer')).toBe(true);
    });
  });

  describe('rollbackLastStep — side-effect confirmation flow', () => {
    it('returns requires_confirmation when persist-level side effect is in the rollback range and no confirmation is provided', async () => {
      // Rolling back step 3 (target=3, range=[3,3]) — step 3 is persist → warn
      const session = makeSession({
        nextExecutionIndex: 4,
        revision: 7,
        executedCommands: [
          makeCommand({ executionIndex: 1, sideEffectLevel: 'read' }),
          makeCommand({ executionIndex: 2, sideEffectLevel: 'read' }),
          makeCommand({
            executionIndex: 3,
            tool: 'click',
            description: '提交审批',
            sideEffectLevel: 'persist',
          }),
        ],
      });
      const stateStore = mockStateStore();
      const service = new RecorderDebugRollbackService(stateStore);

      const result = await service.rollbackLastStep({ session });

      expect(result.status).toBe('requires_confirmation');
      if (result.status !== 'requires_confirmation') return;
      expect(result.targetExecutionIndex).toBe(3);
      expect(result.sessionRevision).toBe(7);
      expect(result.sideEffectDigest).toMatch(/^[a-f0-9]+$/);
      expect(result.sideEffects).toHaveLength(1);
      expect(result.sideEffects[0]!.executionIndex).toBe(3);
      expect(result.sideEffects[0]!.classifiedLevel).toBe('persist');
      // No mutation should have happened
      expect(session.executedCommands).toHaveLength(3);
      expect(session.nextExecutionIndex).toBe(4);
      expect(session.revision).toBe(7);
      expect(stateStore.restoreState).not.toHaveBeenCalled();
    });

    it('proceeds with rollback when confirmation matches sessionRevision + sideEffectDigest', async () => {
      const session = makeSession({
        nextExecutionIndex: 4,
        revision: 7,
        executedCommands: [
          makeCommand({ executionIndex: 1, sideEffectLevel: 'read' }),
          makeCommand({ executionIndex: 2, sideEffectLevel: 'read' }),
          makeCommand({
            executionIndex: 3,
            tool: 'click',
            description: '提交审批',
            sideEffectLevel: 'persist',
          }),
        ],
      });
      const stateStore = mockStateStore();
      const service = new RecorderDebugRollbackService(stateStore);

      // First call to get the digest
      const preflight = await service.rollbackLastStep({ session });
      if (preflight.status !== 'requires_confirmation') {
        throw new Error('expected requires_confirmation');
      }

      const result = await service.rollbackLastStep({
        session,
        confirmation: {
          targetExecutionIndex: preflight.targetExecutionIndex,
          sessionRevision: preflight.sessionRevision,
          sideEffectDigest: preflight.sideEffectDigest,
        },
      });

      expect(result.status).toBe('succeeded');
      expect(session.nextExecutionIndex).toBe(3);
      expect(session.revision).toBe(8); // bumped after rollback commit
    });

    it('rejects confirmation when sessionRevision is stale (concurrency guard)', async () => {
      const session = makeSession({
        nextExecutionIndex: 4,
        revision: 7,
        executedCommands: [
          makeCommand({ executionIndex: 2, sideEffectLevel: 'read' }),
          makeCommand({
            executionIndex: 3,
            tool: 'click',
            description: '保存表单',
            sideEffectLevel: 'persist',
          }),
        ],
      });
      const stateStore = mockStateStore();
      const service = new RecorderDebugRollbackService(stateStore);

      // Get a valid digest at revision 7
      const preflight = await service.rollbackLastStep({ session });
      if (preflight.status !== 'requires_confirmation') {
        throw new Error('expected requires_confirmation');
      }

      // Simulate a concurrent chat commit that bumped revision to 8
      session.revision = 8;

      const result = await service.rollbackLastStep({
        session,
        confirmation: {
          targetExecutionIndex: preflight.targetExecutionIndex,
          sessionRevision: preflight.sessionRevision, // stale — 7, not 8
          sideEffectDigest: preflight.sideEffectDigest,
        },
      });

      expect(result.status).toBe('requires_confirmation');
      if (result.status !== 'requires_confirmation') return;
      // The new confirmation should carry the CURRENT revision
      expect(result.sessionRevision).toBe(8);
      expect(stateStore.restoreState).not.toHaveBeenCalled();
    });

    it('rejects confirmation when sideEffectDigest mismatched (side-effect set changed)', async () => {
      const session = makeSession({
        nextExecutionIndex: 4,
        revision: 7,
        executedCommands: [
          makeCommand({ executionIndex: 2, sideEffectLevel: 'read' }),
          makeCommand({
            executionIndex: 3,
            tool: 'click',
            description: '提交审批',
            sideEffectLevel: 'persist',
          }),
        ],
      });
      const stateStore = mockStateStore();
      const service = new RecorderDebugRollbackService(stateStore);

      const result = await service.rollbackLastStep({
        session,
        confirmation: {
          targetExecutionIndex: 3,
          sessionRevision: 7,
          sideEffectDigest: 'stale-digest-does-not-match',
        },
      });

      expect(result.status).toBe('requires_confirmation');
      expect(stateStore.restoreState).not.toHaveBeenCalled();
    });
  });

  describe('rollbackLastStep — side-effect classifier', () => {
    it('uses explicit sideEffectLevel tag when present', () => {
      const service = new RecorderDebugRollbackService(mockStateStore());
      const cmd = makeCommand({ executionIndex: 1, sideEffectLevel: 'mutate' });
      expect(service.classifySideEffectLevel(cmd).classifiedLevel).toBe('mutate');
    });

    it('matches persist keywords from description when sideEffectLevel is unset', () => {
      const service = new RecorderDebugRollbackService(mockStateStore());
      const cmd: BrowserCommand = {
        tool: 'click',
        params: { target: 'btn-submit' },
        description: '点击提交按钮',
        executionIndex: 1,
      };
      const result = service.classifySideEffectLevel(cmd);
      expect(result.classifiedLevel).toBe('persist');
      expect(result.matchedKeyword).toMatch(/提交|submit/i);
    });

    it('matches mutate keywords from params when sideEffectLevel is unset', () => {
      const service = new RecorderDebugRollbackService(mockStateStore());
      const cmd: BrowserCommand = {
        tool: 'fill',
        params: { target: 'name', value: '张三' },
        description: '填写姓名',
        executionIndex: 1,
      };
      expect(service.classifySideEffectLevel(cmd).classifiedLevel).toBe('mutate');
    });

    it('treats filter tab clicks as read-only instead of persist', () => {
      const service = new RecorderDebugRollbackService(mockStateStore());
      const cmd: BrowserCommand = {
        tool: 'click',
        params: { target: 'status-filter-pending' },
        description: "点击'保留中'筛选按钮，显示未批准的项目数据",
        locator: {
          role: 'button',
          name: '保留中',
          expression: "getByRole('button', { name: '保留中' })",
        },
        executionIndex: 3,
      };
      const result = service.classifySideEffectLevel(cmd);
      expect(result.classifiedLevel).toBe('read');
      expect(result.matchedKeyword).toMatch(/保留中|筛选/i);
    });

    it('does not require confirmation when rollback range only contains a filter-tab click', async () => {
      const session = makeSession({
        nextExecutionIndex: 4,
        revision: 7,
        executedCommands: [
          makeCommand({ executionIndex: 1, sideEffectLevel: 'read' }),
          makeCommand({ executionIndex: 2, sideEffectLevel: 'read' }),
          {
            tool: 'click',
            params: { target: 'status-filter-pending' },
            description: "点击'保留中'筛选按钮，显示未批准的项目数据",
            locator: {
              role: 'button',
              name: '保留中',
              expression: "getByRole('button', { name: '保留中' })",
            },
            executionIndex: 3,
          },
        ],
      });
      const stateStore = mockStateStore();
      const service = new RecorderDebugRollbackService(stateStore);

      const result = await service.rollbackLastStep({ session });

      expect(result.status).toBe('succeeded');
      expect(stateStore.restoreState).toHaveBeenCalledWith(expect.any(Object), 3);
    });

    it('defaults to persist when no tag and no keyword match (conservative)', () => {
      const service = new RecorderDebugRollbackService(mockStateStore());
      const cmd: BrowserCommand = {
        tool: 'click',
        params: { target: 'btn-1' },
        description: 'unknown action',
        executionIndex: 1,
      };
      expect(service.classifySideEffectLevel(cmd).classifiedLevel).toBe('persist');
    });
  });

  describe('rollbackLastStep — browser restore failure', () => {
    it('still rolls back history but returns status=failed when worker restore fails', async () => {
      const session = makeSession({
        nextExecutionIndex: 3,
        revision: 2,
        history: [makeAssistantTurn(1), makeAssistantTurn(2)],
        executedCommands: [
          makeCommand({ executionIndex: 1, sideEffectLevel: 'read' }),
          makeCommand({ executionIndex: 2, sideEffectLevel: 'read' }),
        ],
      });
      const stateStore = mockStateStore({
        restoreState: jest.fn().mockResolvedValue({
          restored: false,
          reason: 'state-file-not-found',
        }),
      });
      const service = new RecorderDebugRollbackService(stateStore);

      const result = await service.rollbackLastStep({ session });

      expect(result.status).toBe('failed');
      if (result.status !== 'failed') return;
      expect(result.reason).toBe('state-file-not-found');
      // History was still rolled back per doc §5.1 降级处理
      expect(session.history).toHaveLength(1);
      expect(session.executedCommands).toHaveLength(1);
      // Cursor and revision still advanced (rollback commit happened)
      expect(session.nextExecutionIndex).toBe(2);
      expect(session.revision).toBe(3);
    });

    it('returns status=failed when restoreState throws', async () => {
      const session = makeSession({
        nextExecutionIndex: 3,
        history: [makeAssistantTurn(1), makeAssistantTurn(2)],
        executedCommands: [
          makeCommand({ executionIndex: 1, sideEffectLevel: 'read' }),
          makeCommand({ executionIndex: 2, sideEffectLevel: 'read' }),
        ],
      });
      const stateStore = mockStateStore({
        restoreState: jest.fn().mockRejectedValue(new Error('network timeout')),
      });
      const service = new RecorderDebugRollbackService(stateStore);

      const result = await service.rollbackLastStep({ session });

      expect(result.status).toBe('failed');
      if (result.status !== 'failed') return;
      expect(result.reason).toContain('network timeout');
      expect(session.history).toHaveLength(1);
    });
  });

  // v4.1 P0 regression: Issue #2 — rollback didn't clear lastObservation or sync
  // currentPageUrl from the restore result. The next chat() call would reuse the
  // stale observation (describing the page AFTER the rolled-back step) within the
  // 5s TTL window, causing the AI to plan commands against a stale page snapshot.
  describe('rollbackLastStep — observation sync after rollback', () => {
    it('clears lastObservation and syncs currentPageUrl from browserRestore.url on success', async () => {
      const session = makeSession({
        nextExecutionIndex: 3,
        revision: 2,
        history: [makeAssistantTurn(1), makeAssistantTurn(2)],
        executedCommands: [
          makeCommand({ executionIndex: 1, sideEffectLevel: 'read' }),
          makeCommand({ executionIndex: 2, sideEffectLevel: 'read' }),
        ],
        lastObservation: {
          currentPageUrl: 'https://example.com/after-step-2',
          inputs: [],
          buttons: [],
          headings: [],
          links: [],
          suggestedParameters: [],
        } as any,
        currentPageUrl: 'https://example.com/after-step-2',
      });
      const stateStore = mockStateStore({
        restoreState: jest.fn().mockResolvedValue({
          restored: true,
          url: 'https://example.com/before-step-2',
        }),
      });
      const service = new RecorderDebugRollbackService(stateStore);

      const result = await service.rollbackLastStep({ session });

      expect(result.status).toBe('succeeded');
      // Stale observation must be cleared so tryReuseRecentObservation rejects it
      expect(session.lastObservation).toBeUndefined();
      // URL must be synced from the restore result, not left at the post-action URL
      expect(session.currentPageUrl).toBe('https://example.com/before-step-2');
    });

    it('clears stale pending disambiguation and risk confirmation together with observation state', async () => {
      const session = makeSession({
        nextExecutionIndex: 3,
        history: [makeAssistantTurn(1), makeAssistantTurn(2)],
        executedCommands: [
          makeCommand({ executionIndex: 1, sideEffectLevel: 'read' }),
          makeCommand({ executionIndex: 2, sideEffectLevel: 'read' }),
        ],
        lastObservation: {
          currentPageUrl: 'https://example.com/after-step-2',
          inputs: [],
          buttons: [],
          headings: [],
          links: [],
          suggestedParameters: [],
        } as any,
      });
      (session as any).pendingDisambiguation = {
        prompt: '你想点哪一个？',
        candidates: [{ label: '审批 1' }],
      };
      (session as any).pendingRiskConfirmation = {
        explanation: '继续执行高风险动作',
        commands: [makeCommand({ executionIndex: 2, sideEffectLevel: 'persist' })],
      };
      const stateStore = mockStateStore();
      const service = new RecorderDebugRollbackService(stateStore);

      const result = await service.rollbackLastStep({ session });

      expect(result.status).toBe('succeeded');
      expect(session.lastObservation).toBeUndefined();
      expect((session as any).pendingDisambiguation).toBeUndefined();
      expect((session as any).pendingRiskConfirmation).toBeUndefined();
    });

    it('clears lastObservation even when browser restore fails (history was still rolled back)', async () => {
      const session = makeSession({
        nextExecutionIndex: 3,
        history: [makeAssistantTurn(1), makeAssistantTurn(2)],
        executedCommands: [
          makeCommand({ executionIndex: 1, sideEffectLevel: 'read' }),
          makeCommand({ executionIndex: 2, sideEffectLevel: 'read' }),
        ],
        lastObservation: {
          currentPageUrl: 'https://example.com/after-step-2',
          inputs: [],
          buttons: [],
          headings: [],
          links: [],
          suggestedParameters: [],
        } as any,
        currentPageUrl: 'https://example.com/after-step-2',
      });
      const stateStore = mockStateStore({
        restoreState: jest.fn().mockResolvedValue({
          restored: false,
          reason: 'state-file-not-found',
        }),
      });
      const service = new RecorderDebugRollbackService(stateStore);

      const result = await service.rollbackLastStep({ session });

      expect(result.status).toBe('failed');
      // Even on failure, observation must be cleared — the history was still truncated,
      // so the stale observation no longer matches the session's logical state
      expect(session.lastObservation).toBeUndefined();
      // URL stays at the stale value when restore didn't provide a URL
      expect(session.currentPageUrl).toBe('https://example.com/after-step-2');
    });

    it('leaves currentPageUrl unchanged when browserRestore has no url field', async () => {
      const session = makeSession({
        nextExecutionIndex: 3,
        history: [makeAssistantTurn(1), makeAssistantTurn(2)],
        executedCommands: [
          makeCommand({ executionIndex: 1, sideEffectLevel: 'read' }),
          makeCommand({ executionIndex: 2, sideEffectLevel: 'read' }),
        ],
        currentPageUrl: 'https://example.com/original',
      });
      const stateStore = mockStateStore({
        restoreState: jest.fn().mockResolvedValue({ restored: true }),
      });
      const service = new RecorderDebugRollbackService(stateStore);

      await service.rollbackLastStep({ session });

      expect(session.lastObservation).toBeUndefined();
      expect(session.currentPageUrl).toBe('https://example.com/original');
    });
  });

  describe('rollbackLastStep — loop state cleanup', () => {
    it('clears pendingLoopCaptureStartCommandIndex when it points to a rolled-back execution', async () => {
      const session = makeSession({
        nextExecutionIndex: 4,
        pendingLoopCaptureStartCommandIndex: 3,
        executedCommands: [
          makeCommand({ executionIndex: 1, sideEffectLevel: 'read' }),
          makeCommand({ executionIndex: 2, sideEffectLevel: 'read' }),
          makeCommand({ executionIndex: 3, sideEffectLevel: 'read' }),
        ],
      });
      const stateStore = mockStateStore();
      const service = new RecorderDebugRollbackService(stateStore);

      await service.rollbackLastStep({ session });

      expect(session.pendingLoopCaptureStartCommandIndex).toBeUndefined();
    });

    it('clears loopDraft when its eachIteration references rolled-back executions', async () => {
      const session = makeSession({
        nextExecutionIndex: 4,
        loopDraft: {
          mode: 'repeat_until',
          target: { scope: 'current_list' },
          eachIteration: { capturedFromIndex: 2, capturedToIndex: 3, stepIds: ['s1', 's2'], stepCount: 2 },
        } as any,
        executedCommands: [
          makeCommand({ executionIndex: 1, sideEffectLevel: 'read' }),
          makeCommand({ executionIndex: 2, sideEffectLevel: 'read' }),
          makeCommand({ executionIndex: 3, sideEffectLevel: 'read' }),
        ],
      });
      const stateStore = mockStateStore();
      const service = new RecorderDebugRollbackService(stateStore);

      await service.rollbackLastStep({ session });

      expect(session.loopDraft).toBeUndefined();
    });
  });

  describe('rollbackLastStep — concurrency (revision invalidates stale data)', () => {
    it('bumps revision on successful rollback so stale pendingRecoverySuggestion entries are invalidated', async () => {
      // P1 will store pendingRecoverySuggestion with a sessionRevision snapshot;
      // for P0 we only need to verify the revision bump happens on rollback commit.
      const session = makeSession({
        nextExecutionIndex: 3,
        revision: 4,
        history: [makeAssistantTurn(1), makeAssistantTurn(2)],
        executedCommands: [
          makeCommand({ executionIndex: 1, sideEffectLevel: 'read' }),
          makeCommand({ executionIndex: 2, sideEffectLevel: 'read' }),
        ],
      });
      const stateStore = mockStateStore();
      const service = new RecorderDebugRollbackService(stateStore);

      const result = await service.rollbackLastStep({ session });

      expect(result.status).toBe('succeeded');
      expect(session.revision).toBe(5); // 4 -> 5
    });
  });
});
