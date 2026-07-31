jest.mock('axios');
jest.mock('../../../../config/service-endpoints', () => ({
  getBrowserWorkerUrl: () => 'http://browser-worker.test',
}));

import axios from 'axios';
import { RecorderStateStoreService } from './recorder-state-store.service';
import type { RecorderStateSnapshotMeta } from '../recorder-debug.types';

describe('RecorderStateStoreService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;
  let service: RecorderStateStoreService;

  const makeSession = (overrides?: Partial<{
    sessionId: string;
    runtimeSessionId: string;
    backend: 'cli' | 'chrome-devtools' | 'mcp';
    stateSnapshots: Record<number, RecorderStateSnapshotMeta>;
  }>) => ({
    sessionId: overrides?.sessionId ?? 's-1',
    runtimeSessionId: overrides?.runtimeSessionId ?? 'rt-1',
    backend: overrides?.backend ?? 'cli',
    ...(overrides?.stateSnapshots ? { stateSnapshots: overrides.stateSnapshots } : {}),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RecorderStateStoreService();
  });

  describe('capturePreActionState', () => {
    it('calls worker /browser/state/capture and persists metadata on session.stateSnapshots', async () => {
      const session = makeSession();
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          stateHandle: 'rw:rt-1:5',
          url: 'https://erp.example.com/list',
          capturedAt: '2026-07-03T10:00:00.000Z',
        },
      } as any);

      const meta = await service.capturePreActionState(session, 5);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://browser-worker.test/browser/state/capture',
        { runtimeSessionId: 'rt-1', executionIndex: 5 },
        expect.objectContaining({
          timeout: expect.any(Number),
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(meta).toEqual({
        executionIndex: 5,
        stateHandle: 'rw:rt-1:5',
        runtimeSessionId: 'rt-1',
        url: 'https://erp.example.com/list',
        capturedAt: '2026-05-15T00:00:00.000Z',
      } as any);
      expect(session.stateSnapshots?.[5]).toEqual(meta);
    });

    it('returns undefined on capture failure (does NOT throw — execution must proceed)', async () => {
      const session = makeSession();
      mockedAxios.post.mockRejectedValueOnce(new Error('worker unreachable'));

      const meta = await service.capturePreActionState(session, 7);

      expect(meta).toBeUndefined();
      // No metadata should have been written
      expect(session.stateSnapshots).toBeUndefined();
    });

    // v4.1 P0 Issue #1: non-CLI backends don't use playwright CLI state capture.
    // Calling the worker endpoint would route to playwrightCliAdapter which has no
    // CLI session for chrome-devtools/mcp sessions — would error or grab wrong context.
    it('skips capture for chrome-devtools backend (no CLI session to snapshot)', async () => {
      const session = makeSession({ backend: 'chrome-devtools' });

      const meta = await service.capturePreActionState(session, 5);

      expect(meta).toBeUndefined();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('skips capture for mcp backend', async () => {
      const session = makeSession({ backend: 'mcp' });

      const meta = await service.capturePreActionState(session, 5);

      expect(meta).toBeUndefined();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe('restoreState', () => {
    it('returns restored=false when no captured metadata exists for the execution step', async () => {
      const session = makeSession();
      const result = await service.restoreState(session, 5);
      expect(result).toEqual({ restored: false, reason: 'no-captured-state-for-execution' });
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('calls worker /browser/state/restore with the stored stateHandle and surfaces partial flag', async () => {
      const session = makeSession({
        stateSnapshots: {
          5: {
            executionIndex: 5,
            stateHandle: 'rw:rt-1:5',
            runtimeSessionId: 'rt-1',
            capturedAt: '2026-07-03T10:00:00.000Z',
          },
        },
      });
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          restored: true,
          partial: true,
          reason: 'localStorage-partial',
          url: 'https://erp.example.com/list',
        },
      } as any);

      const result = await service.restoreState(session, 5);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://browser-worker.test/browser/state/restore',
        { runtimeSessionId: 'rt-1', stateHandle: 'rw:rt-1:5' },
        expect.any(Object)
      );
      expect(result).toEqual({
        restored: true,
        partial: true,
        reason: 'localStorage-partial',
        url: 'https://erp.example.com/list',
      });
      // Metadata updated with partial/reason so callers can introspect
      expect(session.stateSnapshots?.[5]?.partial).toBe(true);
      expect(session.stateSnapshots?.[5]?.reason).toBe('localStorage-partial');
    });

    it('returns restored=false with reason when worker request throws', async () => {
      const session = makeSession({
        stateSnapshots: {
          5: {
            executionIndex: 5,
            stateHandle: 'rw:rt-1:5',
            runtimeSessionId: 'rt-1',
            capturedAt: '2026-07-03T10:00:00.000Z',
          },
        },
      });
      mockedAxios.post.mockRejectedValueOnce(new Error('connection refused'));

      const result = await service.restoreState(session, 5);

      expect(result.restored).toBe(false);
      expect(result.reason).toContain('connection refused');
    });

    // v4.1 P0 Issue #1: non-CLI backends have no captured state to restore from.
    // Return success so rollback proceeds (history truncation still happens; only
    // browser state restore is skipped).
    it('returns success no-op for chrome-devtools backend (no state to restore)', async () => {
      const session = makeSession({
        backend: 'chrome-devtools',
        stateSnapshots: {
          5: {
            executionIndex: 5,
            stateHandle: 'rw:rt-1:5',
            runtimeSessionId: 'rt-1',
            capturedAt: '2026-07-03T10:00:00.000Z',
          },
        },
      });

      const result = await service.restoreState(session, 5);

      expect(result).toEqual({ restored: true, reason: 'backend-does-not-use-state-capture' });
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe('cleanupAfter', () => {
    it('calls worker /browser/state/cleanup-after and prunes session index for entries >= executionIndex', async () => {
      const session = makeSession({
        stateSnapshots: {
          3: {
            executionIndex: 3,
            stateHandle: 'rw:rt-1:3',
            runtimeSessionId: 'rt-1',
            capturedAt: 't-3',
          },
          4: {
            executionIndex: 4,
            stateHandle: 'rw:rt-1:4',
            runtimeSessionId: 'rt-1',
            capturedAt: 't-4',
          },
          5: {
            executionIndex: 5,
            stateHandle: 'rw:rt-1:5',
            runtimeSessionId: 'rt-1',
            capturedAt: 't-5',
          },
        },
      });
      mockedAxios.post.mockResolvedValueOnce({ data: { cleanedCount: 2 } } as any);

      const result = await service.cleanupAfter(session, 4);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://browser-worker.test/browser/state/cleanup-after',
        { runtimeSessionId: 'rt-1', executionIndex: 4 },
        expect.any(Object)
      );
      expect(result).toEqual({ cleanedCount: 2 });
      // Index 3 survives; 4 and 5 pruned
      expect(session.stateSnapshots?.[3]).toBeDefined();
      expect(session.stateSnapshots?.[4]).toBeUndefined();
      expect(session.stateSnapshots?.[5]).toBeUndefined();
    });

    it('still prunes session index when worker request fails', async () => {
      const session = makeSession({
        stateSnapshots: {
          4: {
            executionIndex: 4,
            stateHandle: 'rw:rt-1:4',
            runtimeSessionId: 'rt-1',
            capturedAt: 't-4',
          },
        },
      });
      mockedAxios.post.mockRejectedValueOnce(new Error('worker offline'));

      const result = await service.cleanupAfter(session, 4);

      expect(result).toEqual({ cleanedCount: 0 });
      expect(session.stateSnapshots?.[4]).toBeUndefined();
      // Index object becomes undefined when empty
      expect(session.stateSnapshots).toBeUndefined();
    });
  });

  describe('cleanupAll', () => {
    it('calls worker /browser/state/cleanup-all and clears session.stateSnapshots', async () => {
      const session = makeSession({
        stateSnapshots: {
          1: {
            executionIndex: 1,
            stateHandle: 'rw:rt-1:1',
            runtimeSessionId: 'rt-1',
            capturedAt: 't-1',
          },
        },
      });
      mockedAxios.post.mockResolvedValueOnce({ data: { cleanedCount: 1 } } as any);

      const result = await service.cleanupAll(session);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://browser-worker.test/browser/state/cleanup-all',
        { runtimeSessionId: 'rt-1' },
        expect.any(Object)
      );
      expect(result).toEqual({ cleanedCount: 1 });
      expect(session.stateSnapshots).toBeUndefined();
    });
  });

  describe('getStateMeta', () => {
    it('returns metadata for a previously captured step', () => {
      const session = makeSession({
        stateSnapshots: {
          5: {
            executionIndex: 5,
            stateHandle: 'rw:rt-1:5',
            runtimeSessionId: 'rt-1',
            capturedAt: 't-5',
          },
        },
      });
      expect(service.getStateMeta(session, 5)?.stateHandle).toBe('rw:rt-1:5');
    });

    it('returns undefined for a step with no captured state', () => {
      const session = makeSession();
      expect(service.getStateMeta(session, 99)).toBeUndefined();
    });
  });
});
