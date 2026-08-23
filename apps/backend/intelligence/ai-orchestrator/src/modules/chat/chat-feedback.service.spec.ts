import { ChatFeedbackService } from './chat-feedback.service';
import { ControlPlaneClient } from '../../client/control-plane.client';
import { ChatOrchestratorService } from './chat-orchestrator.service';
import { SessionService } from '../redis/session.service';

describe('ChatFeedbackService', () => {
  const executionId = '11111111-1111-4111-8111-111111111111';

  const createService = () => {
    const sessionService = {
      getChatSession: jest.fn().mockResolvedValue({
        session: { ownerUserId: 'user-1' },
        history: [
          {
            id: 'user-message',
            role: 'user',
            content: '查询热点',
            timestamp: '2026-08-23T00:00:00Z',
          },
          {
            id: 'waiting-assistant-message',
            role: 'assistant',
            content: '等待补充输入',
            timestamp: '2026-08-23T00:00:01Z',
            metadata: { executionId, taskStatus: 'waiting_input' },
          },
          {
            id: 'persisted-assistant-message',
            role: 'assistant',
            content: '总结结果',
            timestamp: '2026-08-23T00:00:02Z',
            metadata: { executionId },
          },
        ],
      }),
    };
    const chatOrchestratorService = {
      resolveAuthenticatedUser: jest.fn().mockResolvedValue({
        userId: 'user-1',
        userRoles: ['user'],
      }),
    };
    const controlPlaneClient = {
      persistAssistantFeedback: jest.fn().mockResolvedValue({ feedback: null }),
      getAssistantFeedback: jest.fn().mockResolvedValue({ feedback: null }),
    };

    return {
      service: new ChatFeedbackService(
        sessionService as unknown as SessionService,
        chatOrchestratorService as unknown as ChatOrchestratorService,
        controlPlaneClient as unknown as ControlPlaneClient
      ),
      controlPlaneClient,
    };
  };

  it('resolves a stream message id to the persisted assistant id by execution id', async () => {
    const { service, controlPlaneClient } = createService();

    await service.set(
      'session-1',
      'stream-message-id',
      { eventId: 'event-1', rating: 'negative', reasonCode: 'other', executionId },
      'Bearer token'
    );

    expect(controlPlaneClient.persistAssistantFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        messageId: 'persisted-assistant-message',
        executionId,
      }),
      expect.anything()
    );
  });

  it('uses the same canonical id when reading feedback', async () => {
    const { service, controlPlaneClient } = createService();

    await service.get('session-1', 'stream-message-id', 'Bearer token', executionId);

    expect(controlPlaneClient.getAssistantFeedback).toHaveBeenCalledWith(
      'session-1',
      'persisted-assistant-message',
      expect.anything()
    );
  });
});
