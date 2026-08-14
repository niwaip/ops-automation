import { StreamEventType } from '../react-engine/interfaces';
import { ChatConversationService } from './chat-conversation.service';

describe('ChatConversationService', () => {
  const createService = () => {
    const modelService = {
      getClient: jest.fn(),
      getModel: jest.fn(),
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
            reasoning: false,
            usage: { total_tokens: 3 },
            rateLimit: { remaining: 10 },
          },
        },
        {
          type: StreamEventType.SESSION_PATCH,
          sessionId: 'session-chat-1',
          content: '',
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
        expect.objectContaining({
          role: 'user',
          content: '帮我总结一下',
          metadata: {
            mode: 'chat',
          },
        }),
        expect.objectContaining({
          role: 'assistant',
          content: '这是总结结果',
          metadata: expect.objectContaining({
            mode: 'chat',
            showThinking: false,
            usage: { total_tokens: 3 },
            rateLimit: { remaining: 10 },
          }),
        }),
      ]),
      {
        modelId: 'preferred-chat-model',
        title: '帮我总结一下',
      }
    );
  });

  it('persists chat thinking blocks for history replay', async () => {
    const { service, modelService, sessionService, chatMediaService } = createService();
    sessionService.appendChatMessages.mockResolvedValue({
      session: {
        id: 'session-chat-think',
        title: '请分析一下',
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:02.000Z',
        modelId: 'preferred-chat-model',
      },
      history: [],
    });
    sessionService.getChatSession.mockResolvedValue({ history: [] });
    chatMediaService.buildMessageContent.mockResolvedValue('请分析一下');
    modelService.getClient.mockReturnValue({
      chatCompletion: jest.fn().mockResolvedValue({
        content: '<think>第一步\n第二步</think>最终结论',
        usage: { total_tokens: 8, completion_tokens_details: { reasoning_tokens: 3 } },
      }),
    });

    await service.chat({
      message: '请分析一下',
      sessionId: 'session-chat-think',
      config: {
        thinking: true,
      },
    });

    expect(sessionService.appendChatMessages).toHaveBeenCalledWith(
      'session-chat-think',
      expect.arrayContaining([
        expect.objectContaining({
          role: 'assistant',
          content: '最终结论',
          metadata: expect.objectContaining({
            mode: 'chat',
            showThinking: true,
            thoughtLogsSnapshot: ['第一步\n第二步'],
            usage: { total_tokens: 8, completion_tokens_details: { reasoning_tokens: 3 } },
          }),
        }),
      ]),
      {
        modelId: 'preferred-chat-model',
        title: '请分析一下',
      }
    );
  });

  it('passes native reasoning config when chat model supports reasoning', async () => {
    const { service, modelService, sessionService, chatMediaService } = createService();
    const chatCompletion = jest.fn().mockResolvedValue({
      content: '这是带推理能力的回复',
      usage: { total_tokens: 8, completion_tokens_details: { reasoning_tokens: 3 } },
    });

    modelService.getModel.mockResolvedValue({
      id: 'preferred-chat-model',
      name: 'deepseek-r1',
      provider: 'deepseek',
      status: 'active',
      config: {
        supports_reasoning: true,
        reasoning_effort: 'high',
      },
    });
    modelService.getClient.mockReturnValue({ chatCompletion });
    sessionService.appendChatMessages.mockResolvedValue({
      session: {
        id: 'session-chat-reasoning',
        title: '推理测试',
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:02.000Z',
        modelId: 'preferred-chat-model',
      },
      history: [],
    });
    sessionService.getChatSession.mockResolvedValue({ history: [] });
    chatMediaService.buildMessageContent.mockResolvedValue('请认真推理');

    await service.chat({
      message: '请认真推理',
      sessionId: 'session-chat-reasoning',
      config: {
        thinking: true,
        reasoning: true,
      },
    });

    expect(chatCompletion).toHaveBeenCalledWith({
      messages: expect.any(Array),
      reasoning: {
        enabled: true,
        effort: 'high',
      },
    });
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
          metadata: {
            mode: 'task',
            taskStatus: 'waiting_input',
          },
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
        metadata: {
          mode: 'task',
          taskStatus: 'waiting_input',
        },
      },
    ]);
  });

  it('persists task conversation into chat history and returns session patch', async () => {
    const { service, sessionService } = createService();
    sessionService.appendChatMessages.mockResolvedValue({
      session: {
        id: 'task-session-1',
        title: '帮我处理审批单',
        status: 'active',
        createdAt: '2026-07-05T00:00:00.000Z',
        updatedAt: '2026-07-05T00:00:03.000Z',
        modelId: 'task-model',
      },
      history: [],
    });

    await expect(
      service.persistTaskConversation({
        sessionId: 'task-session-1',
        userContent: '帮我处理审批单',
        modelId: 'task-model',
        terminalEvent: {
          type: StreamEventType.WAITING_INPUT,
          content: '请补充合同编号',
          data: {
            executionId: 'exec-1',
            status: 'waiting_input',
            missingInputs: [{ name: 'contractNo', description: '合同编号' }],
          },
        } as any,
      })
    ).resolves.toEqual({
      type: StreamEventType.SESSION_PATCH,
      sessionId: 'task-session-1',
      content: '',
      data: {
        title: '帮我处理审批单',
        status: 'active',
        updatedAt: '2026-07-05T00:00:03.000Z',
      },
    });

    expect(sessionService.appendChatMessages).toHaveBeenCalledWith(
      'task-session-1',
      [
        expect.objectContaining({
          role: 'user',
          content: '帮我处理审批单',
          metadata: {
            mode: 'task',
          },
        }),
        expect.objectContaining({
          role: 'assistant',
          content: '请补充合同编号',
          metadata: expect.objectContaining({
            mode: 'task',
            taskStatus: 'waiting_input',
            executionId: 'exec-1',
            executionStatus: 'waiting_input',
            finalSummary: '请补充合同编号',
            missingInputs: [{ name: 'contractNo', description: '合同编号' }],
          }),
        }),
      ],
      {
        modelId: 'task-model',
        title: '帮我处理审批单',
      }
    );
  });

  it('persists queued task result as running instead of completed', async () => {
    const { service, sessionService } = createService();
    sessionService.appendChatMessages.mockResolvedValue({
      session: {
        id: 'task-session-queued',
        title: '登录并且承认',
        status: 'active',
        createdAt: '2026-07-05T00:00:00.000Z',
        updatedAt: '2026-07-05T00:00:03.000Z',
        modelId: 'task-model',
      },
      history: [],
    });

    await service.persistTaskConversation({
      sessionId: 'task-session-queued',
      userContent: '登录并且承认',
      modelId: 'task-model',
      terminalEvent: {
        type: StreamEventType.RESULT,
        content: '任务已启动。执行单 ID: exec-queued',
        data: {
          executionId: 'exec-queued',
          status: 'queued',
          hasBusinessResult: false,
        },
      } as any,
    });

    expect(sessionService.appendChatMessages).toHaveBeenCalledWith(
      'task-session-queued',
      [
        expect.objectContaining({
          role: 'user',
          content: '登录并且承认',
          metadata: {
            mode: 'task',
          },
        }),
        expect.objectContaining({
          role: 'assistant',
          content: '任务已启动。执行单 ID: exec-queued',
          metadata: expect.objectContaining({
            mode: 'task',
            taskStatus: 'running',
            executionId: 'exec-queued',
            executionStatus: 'queued',
            finalSummary: '任务已启动。执行单 ID: exec-queued',
            hasBusinessResult: false,
          }),
        }),
      ],
      {
        modelId: 'task-model',
        title: '登录并且承认',
      }
    );
  });

  it('persists the normalized result contract for completed task history', async () => {
    const { service, sessionService } = createService();
    sessionService.appendChatMessages.mockResolvedValue({
      session: {
        id: 'task-session-result',
        status: 'active',
        createdAt: '2026-08-12T00:00:00.000Z',
        updatedAt: '2026-08-12T00:00:01.000Z',
      },
      history: [],
    });
    const businessData = {
      date: '2026-08-12',
      morning: { tempC: '26' },
      noon: { tempC: '28' },
      evening: { tempC: '27' },
    };
    const normalizedResult = {
      title: 'weather_query_workflow',
      structuredData: businessData,
      hasBusinessResult: true,
      artifacts: [],
      envelope: {
        result: { title: 'weather_query_workflow', businessData },
        presentation: { preferAiSummary: true },
      },
    };

    await service.persistTaskConversation({
      sessionId: 'task-session-result',
      userContent: '上海的天气怎么样',
      terminalEvent: {
        type: StreamEventType.RESULT,
        content: '上海今日天气已查询。',
        data: {
          executionId: 'exec-weather',
          status: 'succeeded',
          result: { result: { businessData } },
          normalizedResult,
          resultType: 'generic',
          resultTitle: 'weather_query_workflow',
          hasBusinessResult: true,
        },
      } as any,
    });

    expect(sessionService.appendChatMessages).toHaveBeenCalledWith(
      'task-session-result',
      expect.arrayContaining([
        expect.objectContaining({
          role: 'assistant',
          metadata: expect.objectContaining({
            normalizedResult,
            finalResultData: businessData,
            resultType: 'generic',
            resultTitle: 'weather_query_workflow',
          }),
        }),
      ]),
      expect.any(Object)
    );
  });
});
