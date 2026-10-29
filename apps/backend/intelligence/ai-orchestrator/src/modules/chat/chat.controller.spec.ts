import { ChatController } from './chat.controller';
import { StreamEventType } from '../react-engine/interfaces';
import * as authGuard from '../../common/guards/ai-auth.guard';

describe('ChatController - slash commands persistence', () => {
  let controller: ChatController;
  let chatConversationService: any;
  let chatMediaService: any;
  let chatOrchestratorService: any;
  let chatFeedbackService: any;
  let userSandboxDispatcherService: any;
  let workspaceArtifactService: any;

  beforeEach(() => {
    chatConversationService = {
      listSessions: jest.fn(),
      getChatHistory: jest.fn(),
      deleteSession: jest.fn(),
      clearAllSessions: jest.fn(),
      persistConversation: jest.fn().mockResolvedValue({
        id: 'session-123',
        title: '快捷指令帮助',
        status: 'active',
        updatedAt: '2026-10-15T15:00:00.000Z',
      }),
      buildSessionPatchEvent: jest.fn().mockImplementation((sessionId, session) => ({
        type: StreamEventType.SESSION_PATCH,
        sessionId,
        content: '',
        data: {
          title: session?.title,
          status: session?.status || 'active',
          updatedAt: session?.updatedAt,
        },
      })),
      streamChat: jest.fn(),
      chat: jest.fn(),
    };
    chatMediaService = {
      resolveUploadedFiles: jest.fn().mockResolvedValue([]),
    };
    chatOrchestratorService = {
      resolveAuthenticatedUser: jest.fn().mockResolvedValue({
        userId: 'law01',
        organizationId: 'org-test',
        userRoles: ['member'],
      }),
      chatStream: jest.fn(),
    };
    chatFeedbackService = {};
    userSandboxDispatcherService = {
      dispatchPersonalSandbox: jest.fn(),
    };
    workspaceArtifactService = {};

    controller = new ChatController(
      chatConversationService,
      chatMediaService,
      chatOrchestratorService,
      chatFeedbackService,
      userSandboxDispatcherService,
      workspaceArtifactService
    );
  });

  it('returns and persists /pdf help over SSE without generating or leaving a heartbeat', async () => {
    jest.useFakeTimers();
    try {
      const chunks: string[] = [];
      const res: any = {
        setHeader: jest.fn(),
        write: jest.fn((chunk: string) => chunks.push(chunk)),
        end: jest.fn(),
      };
      await controller.chatStream(
        { message: '/pdf', sessionId: 'pdf-help', config: { mode: 'chat' } },
        { headers: { authorization: 'Bearer test-token' } } as any,
        res
      );
      const events = chunks.map((chunk) => JSON.parse(chunk.slice(6).trim()));
      expect(events.map((event) => event.type)).toEqual(['session_patch', 'observation', 'done']);
      expect(events[1].content).toContain('handout.pdf');
      expect(chatConversationService.persistConversation).toHaveBeenCalledWith(
        expect.objectContaining({ userContent: '/pdf', assistantContent: events[1].content })
      );
      expect(userSandboxDispatcherService.dispatchPersonalSandbox).not.toHaveBeenCalled();
      expect(chatConversationService.streamChat).not.toHaveBeenCalled();
      expect(chatMediaService.resolveUploadedFiles).not.toHaveBeenCalled();
      expect(res.end).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns /pdf help in non-streaming chat without model generation', async () => {
    const result = await controller.chat(
      { message: ' /pdf ', config: { mode: 'chat' } },
      { headers: { authorization: 'Bearer test-token' } } as any
    );
    expect(result.response).toContain('PDF 生成与排版帮助');
    expect(chatConversationService.persistConversation).toHaveBeenCalledTimes(1);
    expect(chatConversationService.chat).not.toHaveBeenCalled();
    expect(userSandboxDispatcherService.dispatchPersonalSandbox).not.toHaveBeenCalled();
  });

  it('also returns /pdf help for an authenticated internal chat request', async () => {
    const verifySecret = jest.spyOn(authGuard, 'verifyInternalSecret').mockReturnValue(true);
    try {
      const result = await controller.internalChat(
        { message: '/pdf', config: { mode: 'chat' } },
        { headers: { 'x-internal-auth': 'test-secret', 'x-user-id': 'law01' } } as any
      );
      expect(result.response).toContain('handout.pdf');
      expect(chatConversationService.persistConversation).toHaveBeenCalledTimes(1);
      expect(chatConversationService.chat).not.toHaveBeenCalled();
      expect(userSandboxDispatcherService.dispatchPersonalSandbox).not.toHaveBeenCalled();
    } finally {
      verifySecret.mockRestore();
    }
  });

  it('persists conversation and emits session patch when /help command is received in chatStream', async () => {
    const writtenData: string[] = [];
    const mockRes: any = {
      setHeader: jest.fn(),
      write: jest.fn((chunk: string) => writtenData.push(chunk)),
      end: jest.fn(),
    };
    const mockReq: any = {
      headers: { authorization: 'Bearer test-token' },
      on: jest.fn(),
    };
    const body: any = {
      message: '/help',
      sessionId: 'chat-session-1792047040333-vmsjb00s',
      clientMessageId: 'user-msg-001',
      clientAssistantMessageId: 'asst-msg-001',
      config: { mode: 'task' },
    };

    await controller.chatStream(body, mockReq, mockRes);

    expect(chatConversationService.persistConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'chat-session-1792047040333-vmsjb00s',
        userContent: '/help',
        assistantContent: expect.stringContaining('企业工作能力（当前已就绪）'),
        ownerUserId: 'law01',
        clientMessageId: 'user-msg-001',
        clientAssistantMessageId: 'asst-msg-001',
      })
    );

    expect(mockRes.end).toHaveBeenCalled();
    const joined = writtenData.join('');
    expect(joined).toContain('session_patch');
    expect(joined).toContain('快捷指令帮助');
    expect(joined).toContain('observation');
    expect(joined).toContain('Stream completed');
  });

  it('persists conversation when /help command is received in non-streaming chat', async () => {
    const mockReq: any = {
      headers: { authorization: 'Bearer test-token' },
    };
    const body: any = {
      message: '/help',
      sessionId: 'chat-session-sync-001',
      clientMessageId: 'user-msg-sync',
      clientAssistantMessageId: 'asst-msg-sync',
      config: { mode: 'task' },
    };

    const res = await controller.chat(body, mockReq);

    expect(chatConversationService.persistConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'chat-session-sync-001',
        userContent: '/help',
        assistantContent: expect.stringContaining('企业工作能力（当前已就绪）'),
        ownerUserId: 'law01',
        clientMessageId: 'user-msg-sync',
        clientAssistantMessageId: 'asst-msg-sync',
      })
    );
    expect(res.response).toContain('快捷指令帮助');
  });
});
