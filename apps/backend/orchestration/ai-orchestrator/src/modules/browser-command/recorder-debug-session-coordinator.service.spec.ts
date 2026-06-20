jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
    NotFoundException: class extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'NotFoundException';
      }
    },
  }),
  { virtual: true }
);

jest.mock(
  '../redis/redis.service',
  () => ({
    RedisService: class {},
  }),
  { virtual: true }
);

import { RecorderDebugSessionCoordinatorService } from './recorder-debug-session-coordinator.service';
import { RecorderDebugSessionStoreService } from './recorder-debug-session-store.service';

describe('RecorderDebugSessionCoordinatorService', () => {
  const createService = (store?: RecorderDebugSessionStoreService) =>
    new RecorderDebugSessionCoordinatorService(
      store ||
        new RecorderDebugSessionStoreService({
          get: jest.fn(),
          set: jest.fn(),
          del: jest.fn(),
        } as any)
    );

  it('loadOrCreateSession should reuse persisted session and merge backend/runtime session id', async () => {
    const service = createService();
    jest.spyOn(service, 'loadSession').mockResolvedValue({
      sessionId: 'session-1',
      runtimeSessionId: 'runtime-old',
      backend: 'cli',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await expect(
      service.loadOrCreateSession({
        sessionId: 'session-1',
        request: {
          backend: 'mcp',
          runtimeSessionId: 'runtime-new',
        },
      })
    ).resolves.toEqual(
      expect.objectContaining({
        backend: 'mcp',
        runtimeSessionId: 'runtime-new',
      })
    );
  });

  it('getSessionOrThrow should throw when session does not exist', async () => {
    const service = createService();
    jest.spyOn(service, 'loadSession').mockResolvedValue(null);

    await expect(service.getSessionOrThrow('missing-session')).rejects.toThrow(
      'Recorder debug session missing-session not found'
    );
  });

  it('clearLoopDraft should delete loop draft and persist session', async () => {
    const service = createService();
    const saveSession = jest.spyOn(service, 'saveSession').mockResolvedValue(undefined);
    jest.spyOn(service, 'loadSession').mockResolvedValue({
      sessionId: 'session-1',
      runtimeSessionId: 'runtime-1',
      backend: 'cli',
      loopDraft: { mode: 'repeat_until' },
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await service.clearLoopDraft({
      sessionId: 'session-1',
      ttlSeconds: 300,
    });

    expect(saveSession).toHaveBeenCalledWith(
      expect.not.objectContaining({ loopDraft: expect.anything() }),
      300
    );
  });
});
