import { SessionService } from './session.service';

describe('SessionService', () => {
  const createService = () => {
    const redisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
    };

    const service = new SessionService(redisService as any);

    return {
      service,
      redisService,
    };
  };

  it('appends chat messages and persists session metadata', async () => {
    const { service, redisService } = createService();
    redisService.get.mockResolvedValue(null);

    const result = await service.appendChatMessages(
      'session-1',
      [
        {
          role: 'user',
          content: '请帮我总结这个报告',
          timestamp: '2026-07-01T00:00:00.000Z',
        },
        {
          role: 'assistant',
          content: '这是报告总结',
          timestamp: '2026-07-01T00:00:01.000Z',
        },
      ],
      {
        modelId: 'gpt-4.1',
      }
    );

    expect(result.session).toEqual({
      id: 'session-1',
      title: '请帮我总结这个报告',
      modelId: 'gpt-4.1',
      status: 'active',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:01.000Z',
    });
    expect(result.history).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        role: 'user',
        content: '请帮我总结这个报告',
      }),
      expect.objectContaining({
        id: expect.any(String),
        role: 'assistant',
        content: '这是报告总结',
      }),
    ]);
    expect(redisService.set).toHaveBeenCalledWith(
      'chat_session:session-1',
      expect.any(String),
      expect.any(Number)
    );
  });

  it('lists normalized chat sessions in updated order', async () => {
    const { service, redisService } = createService();
    redisService.keys.mockResolvedValue(['chat_session:session-1', 'chat_session:session-2']);
    redisService.get.mockImplementation(async (key: string) => {
      if (key === 'chat_session:session-1') {
        return JSON.stringify({
          session: {
            id: 'session-1',
            title: '旧会话',
            status: 'active',
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:01:00.000Z',
          },
          history: [],
        });
      }
      if (key === 'chat_session:session-2') {
        return JSON.stringify({
          history: [
            {
              role: 'user',
              content: '新的会话',
              timestamp: '2026-07-01T00:02:00.000Z',
            },
          ],
        });
      }
      return null;
    });

    await expect(service.listChatSessions()).resolves.toEqual([
      {
        id: 'session-2',
        title: '新的会话',
        modelId: undefined,
        status: 'active',
        createdAt: '2026-07-01T00:02:00.000Z',
        updatedAt: '2026-07-01T00:02:00.000Z',
      },
      {
        id: 'session-1',
        title: '旧会话',
        modelId: undefined,
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:01:00.000Z',
      },
    ]);
  });
});
