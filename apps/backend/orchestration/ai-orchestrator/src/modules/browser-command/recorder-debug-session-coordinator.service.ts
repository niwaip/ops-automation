import { Injectable, NotFoundException } from '@nestjs/common';
import { RecorderDebugSessionStoreService } from './recorder-debug-session-store.service';

type RecorderDebugSessionLike = {
  sessionId: string;
  runtimeSessionId: string;
  backend: string;
  currentPageUrl?: string;
  updatedAt: string;
};

@Injectable()
export class RecorderDebugSessionCoordinatorService {
  constructor(
    private readonly recorderDebugSessionStoreService: RecorderDebugSessionStoreService
  ) {}

  async loadOrCreateSession<
    TSession extends RecorderDebugSessionLike,
    TBackend extends string,
  >(input: {
    sessionId: string;
    request: {
      runtimeSessionId?: string;
      backend?: TBackend;
    };
  }): Promise<TSession> {
    const existing = await this.loadSession<TSession>(input.sessionId);
    if (existing) {
      existing.backend = input.request.backend || existing.backend;
      existing.runtimeSessionId = input.request.runtimeSessionId || existing.runtimeSessionId;
      return existing;
    }

    return this.recorderDebugSessionStoreService.createEmptySession({
      sessionId: input.sessionId,
      runtimeSessionId: input.request.runtimeSessionId,
      backend: input.request.backend,
    }) as unknown as TSession;
  }

  async loadSession<TSession>(sessionId: string): Promise<TSession | null> {
    return this.recorderDebugSessionStoreService.loadSession<TSession>(sessionId);
  }

  async saveSession<TSession extends { sessionId: string }>(
    session: TSession,
    ttlSeconds: number
  ): Promise<void> {
    await this.recorderDebugSessionStoreService.saveSession(session, ttlSeconds);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.recorderDebugSessionStoreService.deleteSession(sessionId);
  }

  async getSessionOrThrow<TSession>(sessionId: string): Promise<TSession> {
    const session = await this.loadSession<TSession>(sessionId);
    if (!session) {
      throw new NotFoundException(`Recorder debug session ${sessionId} not found`);
    }
    return session;
  }

  async clearLoopDraft<
    TSession extends { sessionId: string; loopDraft?: unknown; updatedAt: string },
  >(input: { sessionId: string; ttlSeconds: number }): Promise<void> {
    const session = await this.loadSession<TSession>(input.sessionId);
    if (!session) {
      return;
    }
    delete session.loopDraft;
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session, input.ttlSeconds);
  }

  async upsertLoopDraft<
    TLoopDraft,
    TSession extends RecorderDebugSessionLike & {
      loopDraft?: TLoopDraft;
    },
  >(input: {
    request: {
      sessionId?: string;
      runtimeSessionId?: string;
      backend?: string;
      loopDraft: TLoopDraft;
    };
    ttlSeconds: number;
    normalizeLoopDraft: (loopDraft: TLoopDraft, fallbackPageUrl?: string) => TLoopDraft;
  }): Promise<{
    sessionId: string;
    runtimeSessionId: string;
    loopDraft: TLoopDraft;
  }> {
    const sessionId = input.request.sessionId || `recorder-debug-${Date.now()}`;
    const session = await this.loadOrCreateSession<TSession, string>({
      sessionId,
      request: {
        backend: input.request.backend,
        runtimeSessionId: input.request.runtimeSessionId,
      },
    });
    const loopDraft = input.normalizeLoopDraft(input.request.loopDraft, session.currentPageUrl);

    session.loopDraft = loopDraft;
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session, input.ttlSeconds);

    return {
      sessionId: session.sessionId,
      runtimeSessionId: session.runtimeSessionId,
      loopDraft,
    };
  }
}
