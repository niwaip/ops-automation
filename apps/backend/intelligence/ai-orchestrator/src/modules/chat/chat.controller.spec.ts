import { ChatController } from './chat.controller';
import { StreamEventType } from '../react-engine/interfaces';

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
    userSandboxDispatcherService = {};
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
