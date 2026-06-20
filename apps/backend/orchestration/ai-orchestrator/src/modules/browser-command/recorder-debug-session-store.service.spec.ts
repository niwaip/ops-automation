jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
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

import { RecorderDebugSessionStoreService } from './recorder-debug-session-store.service';

describe('RecorderDebugSessionStoreService', () => {
  const createService = (redisService?: Record<string, unknown>) =>
    new RecorderDebugSessionStoreService({
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      ...(redisService || {}),
    } as any);

  it('creates an empty session with default backend and runtime session id', () => {
    const service = createService();

    expect(
      service.createEmptySession({
        sessionId: 'session-1',
      })
    ).toEqual(
      expect.objectContaining({
        sessionId: 'session-1',
        runtimeSessionId: 'session-1',
        backend: 'cli',
        browserInitialized: false,
        history: [],
        executedCommands: [],
      })
    );
  });

  it('loads a persisted session from redis', async () => {
    const persisted = { sessionId: 'session-1', runtimeSessionId: 'runtime-1' };
    const get = jest.fn().mockResolvedValue(JSON.stringify(persisted));
    const service = createService({ get });

    await expect(service.loadSession('session-1')).resolves.toEqual(persisted);
    expect(get).toHaveBeenCalledWith('recorder_debug_session:session-1');
  });

  it('returns null when redis has no persisted session', async () => {
    const service = createService({
      get: jest.fn().mockResolvedValue(null),
    });

    await expect(service.loadSession('session-404')).resolves.toBeNull();
  });

  it('persists session payload with ttl', async () => {
    const set = jest.fn().mockResolvedValue(undefined);
    const service = createService({ set });
    const session = { sessionId: 'session-1', history: [] };

    await service.saveSession(session, 3600);

    expect(set).toHaveBeenCalledWith(
      'recorder_debug_session:session-1',
      JSON.stringify(session),
      3600
    );
  });

  it('deletes session payload by redis key', async () => {
    const del = jest.fn().mockResolvedValue(undefined);
    const service = createService({ del });

    await service.deleteSession('session-1');

    expect(del).toHaveBeenCalledWith('recorder_debug_session:session-1');
  });
});
