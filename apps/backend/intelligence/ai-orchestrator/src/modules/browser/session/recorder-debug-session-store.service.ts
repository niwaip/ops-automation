import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

type RecorderDebugPersistedSessionLike = {
  sessionId: string;
};

@Injectable()
export class RecorderDebugSessionStoreService {
  constructor(private readonly redisService: RedisService) {}

  createEmptySession<TBackend extends string>(input: {
    sessionId: string;
    runtimeSessionId?: string;
    backend?: TBackend;
  }): {
    sessionId: string;
    runtimeSessionId: string;
    backend: TBackend | 'cli';
    browserInitialized: false;
    history: [];
    executedCommands: [];
    createdAt: string;
    updatedAt: string;
    nextExecutionIndex: number;
    revision: number;
  } {
    const now = new Date().toISOString();
    return {
      sessionId: input.sessionId,
      runtimeSessionId: input.runtimeSessionId || input.sessionId,
      backend: input.backend || 'cli',
      browserInitialized: false,
      history: [],
      executedCommands: [],
      createdAt: now,
      updatedAt: now,
      // v4.1 P0 (doc §4.3.4): executionIndex starts at 1; first pre-action capture is for execution 1
      nextExecutionIndex: 1,
      // v4.1 P0 (doc §5.2): revision starts at 0; increments on chat/rollback/reset commit
      revision: 0,
    };
  }

  async loadSession<TSession>(sessionId: string): Promise<TSession | null> {
    const raw = await this.redisService.get(this.getSessionKey(sessionId));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as TSession;
  }

  async saveSession<TSession extends RecorderDebugPersistedSessionLike>(
    session: TSession,
    ttlSeconds: number
  ): Promise<void> {
    await this.redisService.set(
      this.getSessionKey(session.sessionId),
      JSON.stringify(session),
      ttlSeconds
    );
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.redisService.del(this.getSessionKey(sessionId));
  }

  private getSessionKey(sessionId: string): string {
    return `recorder_debug_session:${sessionId}`;
  }
}
