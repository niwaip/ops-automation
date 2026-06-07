import axios from 'axios';
import { PassThrough } from 'stream';
import { ControlPlaneClient } from './control-plane.client';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ControlPlaneClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...originalEnv,
      CONTROL_PLANE_URL: 'http://control-plane.test:3003',
      INTERNAL_API_SHARED_SECRET: 'secret-1',
      JWT_SECRET: 'jwt-fallback',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('normalizes base url and sends internal auth headers for user-scoped requests', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { id: 'execution-1' },
    } as never);

    const client = new ControlPlaneClient();

    await client.createExecution(
      { skillId: 'skill-1', input: { prompt: 'hello' } },
      {
        user: {
          userId: 'user-1',
          userRoles: ['employee', 'admin'],
        },
        extraHeaders: {
          'X-Trace-Id': 'trace-1',
        },
        timeout: 1500,
      },
    );

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://control-plane.test:3003/api/executions',
      { skillId: 'skill-1', input: { prompt: 'hello' } },
      {
        headers: {
          'X-Internal-Auth': 'secret-1',
          'X-User-Id': 'user-1',
          'X-User-Role': 'admin',
          'X-Trace-Id': 'trace-1',
        },
        timeout: 1500,
      },
    );
  });

  it('falls back to bearer auth when no internal user context is provided', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { ok: true },
    } as never);

    const client = new ControlPlaneClient();

    await client.triggerTakeover('execution-2', 'Need help', {
      authToken: 'Bearer token-1',
      timeout: 10000,
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://control-plane.test:3003/api/executions/execution-2/takeover',
      { reason: 'Need help' },
      {
        headers: {
          Authorization: 'Bearer token-1',
        },
        timeout: 10000,
      },
    );
  });

  it('requests event stream with responseType stream', async () => {
    const stream = new PassThrough();
    mockedAxios.get.mockResolvedValueOnce({
      data: stream,
    } as never);

    const client = new ControlPlaneClient();
    const result = await client.streamExecutionEvents('execution-3', {
      user: { userId: 'user-2', userRoles: ['employee'] },
    });

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'http://control-plane.test:3003/api/executions/execution-3/events/stream',
      {
        headers: {
          'X-Internal-Auth': 'secret-1',
          'X-User-Id': 'user-2',
          'X-User-Role': 'employee',
        },
        responseType: 'stream',
      },
    );
    expect(result).toBe(stream);
  });
});
