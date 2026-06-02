import { StreamEventType } from '../react-engine/interfaces';
import { ChatConversationService } from './chat-conversation.service';

describe('ChatConversationService', () => {
  const createService = () => {
    const modelService = {
      getClient: jest.fn(),
      getPreferredDefaultModel: jest.fn(() => ({ id: 'preferred-chat-model' })),
      stripThinkingTags: jest.fn((value: string) => value.replace(/<think>[\s\S]*?<\/think>/g, '').trim()),
      callModelStreamWithMessages: jest.fn(),
    };
    const sessionService = {
      getChatSession: jest.fn(),
      appendChatMessages: jest.fn(),
    };
    const chatMediaService = {
      buildMessageContent: jest.fn(),
    };

    const service = new ChatConversationService(
      modelService as any,
      sessionService as any,
      chatMediaService as any,
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
      ],
    });
    expect(sessionService.appendChatMessages).toHaveBeenCalledWith(
      'session-chat-1',
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: '帮我总结一下' }),
        expect.objectContaining({ role: 'assistant', content: '这是总结结果' }),
      ]),
    );
  });
});
