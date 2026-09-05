import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';
import { ReActState, ChatMessage, ExecutionContext } from '../react-engine/interfaces';

export interface SessionData {
  state: ReActState;
  history: ChatMessage[];
  context: Partial<ExecutionContext>;
}

export interface ChatSessionData {
  session?: {
    id: string;
    ownerUserId?: string;
    title?: string;
    modelId?: string;
    status: 'active' | 'archived';
    channel?: string;
    createdAt: string;
    updatedAt: string;
  };
  history: Array<{
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
  }>;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly taskSessionTTL = parseInt(process.env.TASK_SESSION_TTL_SECONDS || '86400', 10);
  private readonly chatSessionTTL = parseInt(process.env.CHAT_SESSION_TTL_SECONDS || '259200', 10);
  private readonly chatSessionMaxMessages = parseInt(
    process.env.CHAT_SESSION_MAX_MESSAGES || '20',
    10
  );
  private readonly chatSessionCleanupStrategy = (
    process.env.CHAT_SESSION_CLEANUP_STRATEGY || 'sliding_window'
  ).toLowerCase();

  constructor(private readonly redisService: RedisService) {}

  private getSessionKey(sessionId: string): string {
    return `session:${sessionId}`;
  }

  private getChatSessionKey(sessionId: string): string {
    return `chat_session:${sessionId}`;
  }

  private getDefaultChatSessionMeta(
    sessionId: string,
    existing?: ChatSessionData['session']
  ): NonNullable<ChatSessionData['session']> {
    const now = new Date().toISOString();
    const resolvedChannel =
      existing?.channel ||
      (sessionId.startsWith('wechat:')
        ? 'wechat'
        : sessionId.startsWith('dingtalk:')
          ? 'dingtalk'
          : sessionId.startsWith('feishu:') || sessionId.startsWith('lark:')
            ? 'feishu'
            : 'local');
    return {
      id: sessionId,
      ownerUserId: existing?.ownerUserId,
      status: 'active',
      channel: resolvedChannel,
      createdAt: existing?.createdAt || now,
      updatedAt: existing?.updatedAt || existing?.createdAt || now,
      title: existing?.title,
      modelId: existing?.modelId,
    };
  }

  private createMessageId(
    sessionId: string,
    message: ChatSessionData['history'][number],
    index: number
  ): string {
    const safeTimestamp = (message.timestamp || new Date().toISOString()).replace(/[^0-9TZ]/g, '');
    return `${sessionId}-${safeTimestamp}-${index}`;
  }

  private buildChatSessionTitle(
    existingTitle: string | undefined,
    history: ChatSessionData['history']
  ): string | undefined {
    if (existingTitle?.trim()) {
      return existingTitle.trim();
    }
    const firstUserMessage = history.find((message) => message.role === 'user');
    const normalized = firstUserMessage?.content?.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return undefined;
    }
    return normalized.slice(0, 24);
  }

  private normalizeChatSession(
    sessionId: string,
    data: ChatSessionData | null
  ): ChatSessionData | null {
    if (!data) {
      return null;
    }

    const history = (data.history || []).map((message, index) => ({
      ...message,
      id: message.id || this.createMessageId(sessionId, message, index),
    }));
    const baseSession = this.getDefaultChatSessionMeta(sessionId, data.session);
    const firstTimestamp = history[0]?.timestamp;
    const lastTimestamp = history[history.length - 1]?.timestamp;

    return {
      history,
      session: {
        ...baseSession,
        channel: data.session?.channel || baseSession.channel,
        createdAt: data.session?.createdAt || firstTimestamp || baseSession.createdAt,
        updatedAt: data.session?.updatedAt || lastTimestamp || baseSession.updatedAt,
        title: this.buildChatSessionTitle(data.session?.title, history),
        modelId: data.session?.modelId,
      },
    };
  }

  private cleanupChatHistory(history: ChatSessionData['history']): ChatSessionData['history'] {
    if (this.chatSessionMaxMessages <= 0 || history.length <= this.chatSessionMaxMessages) {
      return history;
    }

    if (this.chatSessionCleanupStrategy === 'reset_on_limit') {
      this.logger.debug(
        `Chat history exceeds limit ${this.chatSessionMaxMessages}, reset by strategy reset_on_limit`
      );
      return [];
    }

    // default strategy: sliding_window
    return history.slice(-this.chatSessionMaxMessages);
  }

  async saveSession(sessionId: string, data: SessionData): Promise<void> {
    try {
      const key = this.getSessionKey(sessionId);
      await this.redisService.set(key, JSON.stringify(data), this.taskSessionTTL);
      this.logger.debug(`Saved session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to save session ${sessionId}:`, error);
    }
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      const key = this.getSessionKey(sessionId);
      const data = await this.redisService.get(key);
      if (!data) return null;
      return JSON.parse(data);
    } catch (error) {
      this.logger.error(`Failed to get session ${sessionId}:`, error);
      return null;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      const key = this.getSessionKey(sessionId);
      await this.redisService.del(key);
      this.logger.debug(`Deleted session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to delete session ${sessionId}:`, error);
    }
  }

  async getChatSession(sessionId: string): Promise<ChatSessionData | null> {
    try {
      const key = this.getChatSessionKey(sessionId);
      const data = await this.redisService.get(key);
      if (!data) return null;
      return this.normalizeChatSession(sessionId, JSON.parse(data) as ChatSessionData);
    } catch (error) {
      this.logger.error(`Failed to get chat session ${sessionId}:`, error);
      return null;
    }
  }

  async saveChatSession(sessionId: string, data: ChatSessionData): Promise<void> {
    try {
      const key = this.getChatSessionKey(sessionId);
      const normalized = this.normalizeChatSession(sessionId, data);
      if (!normalized) {
        return;
      }
      const cleanedData: ChatSessionData = {
        session: {
          ...this.getDefaultChatSessionMeta(sessionId, normalized.session),
          ...normalized.session,
          title: this.buildChatSessionTitle(normalized.session?.title, normalized.history),
        },
        history: this.cleanupChatHistory(normalized.history || []),
      };
      if (cleanedData.history.length > 0) {
        const firstHistoryMessage = cleanedData.history[0];
        cleanedData.session = {
          ...cleanedData.session!,
          createdAt:
            cleanedData.session?.createdAt ||
            firstHistoryMessage?.timestamp ||
            new Date().toISOString(),
          updatedAt:
            cleanedData.history[cleanedData.history.length - 1]?.timestamp ||
            cleanedData.session!.updatedAt,
        };
      }
      await this.redisService.set(key, JSON.stringify(cleanedData), this.chatSessionTTL);
      this.logger.debug(`Saved chat session ${sessionId}, history=${cleanedData.history.length}`);
    } catch (error) {
      this.logger.error(`Failed to save chat session ${sessionId}:`, error);
    }
  }

  async appendChatMessages(
    sessionId: string,
    messages: ChatSessionData['history'],
    sessionPatch?: Partial<NonNullable<ChatSessionData['session']>>
  ): Promise<ChatSessionData> {
    const loaded = await this.getChatSession(sessionId);
    const existing =
      sessionPatch?.ownerUserId && loaded?.session?.ownerUserId !== sessionPatch.ownerUserId
        ? null
        : loaded;
    const normalizedMessages = messages.map((message, index) => ({
      ...message,
      id:
        message.id ||
        this.createMessageId(sessionId, message, (existing?.history?.length || 0) + index),
    }));
    const merged = [...(existing?.history || []), ...normalizedMessages];
    const cleanedHistory = this.cleanupChatHistory(merged);
    const baseSession = this.getDefaultChatSessionMeta(sessionId, existing?.session);
    const next: ChatSessionData = {
      session: {
        ...baseSession,
        ...sessionPatch,
        createdAt:
          existing?.session?.createdAt || cleanedHistory[0]?.timestamp || baseSession.createdAt,
        updatedAt:
          cleanedHistory[cleanedHistory.length - 1]?.timestamp ||
          sessionPatch?.updatedAt ||
          baseSession.updatedAt,
        title: this.buildChatSessionTitle(
          sessionPatch?.title || existing?.session?.title,
          cleanedHistory
        ),
      },
      history: this.cleanupChatHistory(merged),
    };
    await this.saveChatSession(sessionId, next);
    return next;
  }

  async listChatSessions(
    ownerUserId?: string
  ): Promise<Array<NonNullable<ChatSessionData['session']>>> {
    try {
      const keys = await this.redisService.keys(this.getChatSessionKey('*'));
      const sessions = await Promise.all(
        keys.map(async (key) => {
          const sessionId = key.replace(/^chat_session:/, '');
          const data = await this.getChatSession(sessionId);
          return data?.session || null;
        })
      );
      return sessions
        .filter((item): item is NonNullable<ChatSessionData['session']> => Boolean(item))
        .filter((item) => !ownerUserId || item.ownerUserId === ownerUserId)
        .sort(
          (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
        );
    } catch (error) {
      this.logger.error('Failed to list chat sessions:', error);
      return [];
    }
  }

  async deleteChatSession(sessionId: string): Promise<void> {
    try {
      const key = this.getChatSessionKey(sessionId);
      await this.redisService.del(key);
      this.logger.debug(`Deleted chat session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to delete chat session ${sessionId}:`, error);
    }
  }
}
