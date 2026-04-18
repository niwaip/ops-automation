import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';
import { ReActState, ChatMessage, ExecutionContext } from '../react-engine/interfaces';

export interface SessionData {
  state: ReActState;
  history: ChatMessage[];
  context: Partial<ExecutionContext>;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly TTL = 60 * 60 * 24; // 24 hours

  constructor(private readonly redisService: RedisService) {}

  private getSessionKey(sessionId: string): string {
    return `session:${sessionId}`;
  }

  async saveSession(sessionId: string, data: SessionData): Promise<void> {
    try {
      const key = this.getSessionKey(sessionId);
      await this.redisService.set(key, JSON.stringify(data), this.TTL);
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
}
