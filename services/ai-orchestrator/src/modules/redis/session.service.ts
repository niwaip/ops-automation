import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';
import { ReActState, ChatMessage, ExecutionContext } from '../react-engine/interfaces';

export interface SessionData {
  state: ReActState;
  history: ChatMessage[];
  context: Partial<ExecutionContext>;
}

export interface ChatSessionData {
  history: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly taskSessionTTL = parseInt(process.env.TASK_SESSION_TTL_SECONDS || '86400', 10);
  private readonly chatSessionTTL = parseInt(process.env.CHAT_SESSION_TTL_SECONDS || '259200', 10);
  private readonly chatSessionMaxMessages = parseInt(process.env.CHAT_SESSION_MAX_MESSAGES || '20', 10);
  private readonly chatSessionCleanupStrategy =
    (process.env.CHAT_SESSION_CLEANUP_STRATEGY || 'sliding_window').toLowerCase();

  constructor(private readonly redisService: RedisService) {}

  private getSessionKey(sessionId: string): string {
    return `session:${sessionId}`;
  }

  private getChatSessionKey(sessionId: string): string {
    return `chat_session:${sessionId}`;
  }

  private cleanupChatHistory(
    history: ChatSessionData['history'],
  ): ChatSessionData['history'] {
    if (this.chatSessionMaxMessages <= 0 || history.length <= this.chatSessionMaxMessages) {
      return history;
    }

    if (this.chatSessionCleanupStrategy === 'reset_on_limit') {
      this.logger.debug(
        `Chat history exceeds limit ${this.chatSessionMaxMessages}, reset by strategy reset_on_limit`,
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
      return JSON.parse(data) as ChatSessionData;
    } catch (error) {
      this.logger.error(`Failed to get chat session ${sessionId}:`, error);
      return null;
    }
  }

  async saveChatSession(sessionId: string, data: ChatSessionData): Promise<void> {
    try {
      const key = this.getChatSessionKey(sessionId);
      const cleanedData: ChatSessionData = {
        history: this.cleanupChatHistory(data.history || []),
      };
      await this.redisService.set(key, JSON.stringify(cleanedData), this.chatSessionTTL);
      this.logger.debug(`Saved chat session ${sessionId}, history=${cleanedData.history.length}`);
    } catch (error) {
      this.logger.error(`Failed to save chat session ${sessionId}:`, error);
    }
  }

  async appendChatMessages(
    sessionId: string,
    messages: ChatSessionData['history'],
  ): Promise<ChatSessionData> {
    const existing = await this.getChatSession(sessionId);
    const merged = [...(existing?.history || []), ...messages];
    const next: ChatSessionData = {
      history: this.cleanupChatHistory(merged),
    };
    await this.saveChatSession(sessionId, next);
    return next;
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
