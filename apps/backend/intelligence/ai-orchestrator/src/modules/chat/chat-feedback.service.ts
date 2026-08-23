import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ControlPlaneClient } from '../../client/control-plane.client';
import { SessionService } from '../redis/session.service';
import { ChatOrchestratorService } from './chat-orchestrator.service';
import { AssistantFeedbackResponse, SetAssistantFeedbackDto } from './assistant-feedback.dto';

@Injectable()
export class ChatFeedbackService {
  constructor(
    private readonly sessionService: SessionService,
    private readonly chatOrchestratorService: ChatOrchestratorService,
    private readonly controlPlaneClient: ControlPlaneClient
  ) {}

  async set(
    sessionId: string,
    messageId: string,
    input: SetAssistantFeedbackDto,
    authorization?: string
  ): Promise<AssistantFeedbackResponse> {
    const resolved = await this.assertAssistantMessageOwner(
      sessionId,
      messageId,
      authorization,
      input.executionId
    );
    const response =
      await this.controlPlaneClient.persistAssistantFeedback<AssistantFeedbackResponse>(
        {
          sessionId,
          messageId: resolved.messageId,
          eventType: 'set',
          ...input,
        },
        {
          user: { userId: resolved.userId, userRoles: resolved.userRoles },
          authToken: authorization,
        }
      );
    return response;
  }

  async get(
    sessionId: string,
    messageId: string,
    authorization?: string,
    executionId?: string
  ): Promise<AssistantFeedbackResponse> {
    const resolved = await this.assertAssistantMessageOwner(
      sessionId,
      messageId,
      authorization,
      executionId
    );
    return this.controlPlaneClient.getAssistantFeedback<AssistantFeedbackResponse>(
      sessionId,
      resolved.messageId,
      {
        user: { userId: resolved.userId, userRoles: resolved.userRoles },
        authToken: authorization,
      }
    );
  }

  async clear(
    sessionId: string,
    messageId: string,
    authorization?: string,
    executionId?: string
  ): Promise<AssistantFeedbackResponse> {
    const resolved = await this.assertAssistantMessageOwner(
      sessionId,
      messageId,
      authorization,
      executionId
    );
    return this.controlPlaneClient.persistAssistantFeedback<AssistantFeedbackResponse>(
      {
        sessionId,
        messageId: resolved.messageId,
        eventType: 'clear',
      },
      {
        user: { userId: resolved.userId, userRoles: resolved.userRoles },
        authToken: authorization,
      }
    );
  }

  private async assertAssistantMessageOwner(
    sessionId: string,
    messageId: string,
    authorization?: string,
    executionId?: string
  ): Promise<{ userId: string; userRoles?: string[]; messageId: string }> {
    if (!sessionId.trim() || !messageId.trim()) {
      throw new BadRequestException('sessionId and messageId are required');
    }
    const identity = await this.chatOrchestratorService.resolveAuthenticatedUser(authorization);
    if (!identity.userId) {
      throw new UnauthorizedException('Authentication required');
    }
    const session = await this.sessionService.getChatSession(sessionId);
    if (!session) {
      throw new NotFoundException('Chat session not found');
    }
    if (session.session?.ownerUserId !== identity.userId) {
      throw new ForbiddenException('Chat session does not belong to current user');
    }
    const messageById = session.history.find((item) => item.id === messageId);
    const normalizedExecutionId = executionId?.trim();
    let message = messageById?.role === 'assistant' ? messageById : undefined;
    if (!message && !messageById && normalizedExecutionId) {
      // A resumed task can leave a waiting-input entry and a later terminal
      // entry with the same execution ID. The latest assistant result is the
      // one the user is evaluating.
      message = [...session.history]
        .reverse()
        .find(
          (item) =>
            item.role === 'assistant' && item.metadata?.executionId === normalizedExecutionId
        );
    }
    if (!message || message.role !== 'assistant') {
      throw new NotFoundException('Assistant message not found');
    }
    const resolvedMessageId = message.id?.trim();
    if (!resolvedMessageId) {
      throw new NotFoundException('Assistant message has no persistent ID');
    }
    return { userId: identity.userId, userRoles: identity.userRoles, messageId: resolvedMessageId };
  }
}
