import { StreamEventType } from '../react-engine/interfaces';
import { ChatConversationService } from './chat-conversation.service';

describe('ChatConversationService', () => {
  const createService = () => {
    const modelService = {
      getClient: jest.fn(),
      getPreferredDefaultModel: jest.fn(() => ({ id: 'preferred-chat-model' })),
      stripThinkingTags: jest.fn((value: string) =>
        value.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      ),
      callModelStreamWithMessages: jest.fn(),
    };
    const sessionService = {
      getChatSession: jest.fn(),
      appendChatMessages: jest.fn(),
      listChatSessions: jest.fn(),
    };
    const chatMediaService = {
      buildMessageContent: jest.fn(),
    };

    const service = new ChatConversationService(
      modelService as any,
      sessionService as any,
      chatMediaService as any
    );

    return {
      service,
      modelService,
      sessionService,
      chatMediaService,
    };
  };

  it('returns non-stream chat response and persists history', async () => {
    const { service, modelService, sessionService, chatMediaService } = createService();
    sessionService.appendChatMessages.mockResolvedValue({
      session: {
        id: 'session-chat-1',
        title: '帮我总结一下',
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:02.000Z',
        modelId: 'preferred-chat-model',
      },
      history: [],
    });
    sessionService.getChatSession.mockResolvedValue({
      history: [
        {
          role: 'assistant',
          content: '你好',
        },
      ],
    });
    chatMediaService.buildMessageContent.mockResolvedValue('帮我总结一下');
    modelService.getClient.mockReturnValue({
      chatCompletion: jest.fn().mockResolvedValue({
        content: '<think>internal</think>这是总结结果',
        usage: { total_tokens: 3 },
        rateLimit: { remaining: 10 },
      }),
    });

    const result = await service.chat({
      message: '帮我总结一下',
      sessionId: 'session-chat-1',
      config: {
        thinking: false,
      },
    });

    expect(result).toEqual({
      response: '这是总结结果',
      events: [
        {
          type: StreamEventType.RESULT,
          content: '这是总结结果',
          data: {
            sessionId: 'session-chat-1',
            mode: 'chat',
            thinking: false,
            usage: { total_tokens: 3 },
            rateLimit: { remaining: 10 },
          },
        },
        {
          type: StreamEventType.SESSION_PATCH,
          sessionId: 'session-chat-1',
          content: 'Session updated',
          data: {
            title: '帮我总结一下',
            status: 'active',
            updatedAt: '2026-07-01T00:00:02.000Z',
          },
        },
      ],
    });
    expect(sessionService.appendChatMessages).toHaveBeenCalledWith(
      'session-chat-1',
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: '帮我总结一下' }),
        expect.objectContaining({ role: 'assistant', content: '这是总结结果' }),
      ]),
      {
        modelId: 'preferred-chat-model',
        title: '帮我总结一下',
      }
    );
  });

  it('lists sessions from session service', async () => {
    const { service, sessionService } = createService();
    sessionService.listChatSessions.mockResolvedValue([
      {
        id: 'session-1',
        title: '采购合同',
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:01:00.000Z',
      },
    ]);

    await expect(service.listSessions()).resolves.toEqual([
      {
        id: 'session-1',
        title: '采购合同',
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:01:00.000Z',
      },
    ]);
  });

  it('maps chat history to frontend shape', async () => {
    const { service, sessionService } = createService();
    sessionService.getChatSession.mockResolvedValue({
      history: [
        {
          id: 'msg-1',
          role: 'user',
          content: '你好',
          timestamp: '2026-07-01T00:00:00.000Z',
        },
        {
          role: 'assistant',
          content: '你好，有什么可以帮你？',
          timestamp: '2026-07-01T00:00:01.000Z',
        },
      ],
    });

    await expect(service.getChatHistory('session-2')).resolves.toEqual([
      {
        id: 'msg-1',
        sessionId: 'session-2',
        role: 'user',
        content: '你好',
        timestamp: '2026-07-01T00:00:00.000Z',
      },
      {
        id: 'session-2-1',
        sessionId: 'session-2',
        role: 'assistant',
        content: '你好，有什么可以帮你？',
        timestamp: '2026-07-01T00:00:01.000Z',
      },
    ]);
  });
});
