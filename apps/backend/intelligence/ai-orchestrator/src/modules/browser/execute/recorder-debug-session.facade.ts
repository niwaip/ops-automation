import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import type { RecorderDebugObservation } from './recorder-debug.types';
import { RecorderDebugObservationRefreshService } from '../observe';
import { RecorderDebugSessionCoordinatorService } from '../session';
import { RecorderLoopService } from '../loop';
import type {
  RecorderControlTokenStateLike,
  RecorderObservationLike,
  RecorderSessionLike,
} from '../loop';

interface BrowserInitResponse {
  success: boolean;
  message: string;
}

@Injectable()
export class RecorderDebugSessionFacade {
  private readonly logger = new Logger(RecorderDebugSessionFacade.name);

  constructor(
    private readonly recorderDebugSessionCoordinatorService: RecorderDebugSessionCoordinatorService,
    private readonly recorderDebugObservationRefreshService: RecorderDebugObservationRefreshService,
    private readonly recorderLoopService: RecorderLoopService
  ) {}

  async loadOrCreateSession<
    TSession extends {
      sessionId: string;
      runtimeSessionId: string;
      backend: string;
      currentPageUrl?: string;
      updatedAt: string;
    },
    TBackend extends string,
  >(input: {
    sessionId: string;
    request: {
      backend?: TBackend;
      runtimeSessionId?: string;
    };
  }): Promise<TSession> {
    return this.recorderDebugSessionCoordinatorService.loadOrCreateSession<TSession, TBackend>(input);
  }

  async loadSession<TSession>(sessionId: string): Promise<TSession | null> {
    return this.recorderDebugSessionCoordinatorService.loadSession<TSession>(sessionId);
  }

  async getSessionOrThrow<TSession>(sessionId: string): Promise<TSession> {
    return this.recorderDebugSessionCoordinatorService.getSessionOrThrow<TSession>(sessionId);
  }

  async saveSession<TSession extends { sessionId: string }>(
    session: TSession,
    ttlSeconds: number
  ): Promise<void> {
    await this.recorderDebugSessionCoordinatorService.saveSession(session, ttlSeconds);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.recorderDebugSessionCoordinatorService.deleteSession(sessionId);
  }

  async upsertLoopDraft<
    TLoopDraft,
    TSession extends {
      sessionId: string;
      runtimeSessionId: string;
      backend: string;
      currentPageUrl?: string;
      updatedAt: string;
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
    return this.recorderDebugSessionCoordinatorService.upsertLoopDraft<TLoopDraft, TSession>(input);
  }

  async clearLoopDraft(input: { sessionId: string; ttlSeconds: number }): Promise<void> {
    await this.recorderDebugSessionCoordinatorService.clearLoopDraft(input);
  }

  async ensureBrowserReady<
    TSession extends {
      sessionId: string;
      runtimeSessionId: string;
      backend: string;
      browserInitialized?: boolean;
    }
  >(input: {
    session: TSession;
    browserWorkerUrl: string;
    reportError: (error: {
      session: TSession;
      sourceStage: string;
      errorType: string;
      errorMessage: string;
    }) => Promise<void>;
  }): Promise<void> {
    if (input.session.browserInitialized) {
      return;
    }

    try {
      const response = await axios.post<BrowserInitResponse>(
        `${input.browserWorkerUrl}/browser/init`,
        {
          backend: input.session.backend,
          runtimeSessionId: input.session.runtimeSessionId,
          sessionPreferences: {
            mode: 'interactive',
            enableCodegen: true,
            headless: false,
          },
        },
        {
          timeout: 60000,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      input.session.browserInitialized = response.data.success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await input.reportError({
        session: input.session,
        sourceStage: 'browser-init',
        errorType: 'BROWSER_INIT_FAILED',
        errorMessage,
      });
      throw error;
    }
  }

  async observePageSafely<
    TSession extends {
      sessionId: string;
      currentPageUrl?: string;
      lastObservation?: RecorderDebugObservation;
      updatedAt?: string;
    },
  >(input: {
    session: TSession;
    fallback?: RecorderDebugObservation;
    preferCachedObservation?: boolean;
    observePage: (currentSession: TSession) => Promise<RecorderDebugObservation>;
    reportError: (error: {
      session: TSession;
      sourceStage: string;
      errorType: string;
      errorMessage: string;
      observation?: RecorderDebugObservation;
    }) => Promise<void>;
  }): Promise<RecorderDebugObservation> {
    return this.recorderDebugObservationRefreshService.observePageSafely({
      session: input.session,
      fallback: input.fallback,
      preferCachedObservation: input.preferCachedObservation,
      observePage: input.observePage,
      onObserveFailed: ({ session, errorMessage }) => {
        this.logger.warn(`observePage failed for session ${session.sessionId}: ${errorMessage}`);
        void input.reportError({
          session,
          sourceStage: 'observe-page',
          errorType: 'OBSERVE_PAGE_FAILED',
          errorMessage,
          observation: input.fallback,
        });
      },
    });
  }

  async refreshObservationAfterExecution<
    TSession extends {
      sessionId: string;
      currentPageUrl?: string;
      lastObservation?: RecorderDebugObservation;
      updatedAt?: string;
    },
  >(input: {
    session: TSession;
    ttlSeconds: number;
    observePageSafely: (
      currentSession: TSession,
      fallback?: RecorderDebugObservation
    ) => Promise<RecorderDebugObservation>;
    loadSession?: (sessionId: string) => Promise<TSession | null>;
    saveSession?: (session: TSession) => Promise<void>;
  }): Promise<void> {
    await this.recorderDebugObservationRefreshService.refreshObservationAfterExecution({
      session: input.session,
      observePageSafely: input.observePageSafely,
      loadSession:
        input.loadSession || (async (sessionId) => this.loadSession<TSession>(sessionId)),
      saveSession:
        input.saveSession || (async (session) => this.saveSession(session, input.ttlSeconds)),
    });
  }

  syncObservationToSession<
    TSession extends {
      currentPageUrl?: string;
      lastObservation?: RecorderDebugObservation;
    },
  >(session: TSession, observation: RecorderDebugObservation): void {
    session.lastObservation = observation;
    session.currentPageUrl = observation.currentPageUrl || session.currentPageUrl;
  }

  applyRecorderControlTokensBeforeExecution<
    TSession extends RecorderSessionLike,
    TState extends RecorderControlTokenStateLike,
    TObservation extends RecorderObservationLike,
  >(session: TSession, state: TState, observation?: TObservation): void {
    this.recorderLoopService.applyRecorderControlTokensBeforeExecution(session, state, observation);
  }

  applyRecorderControlTokensAfterExecution<
    TSession extends RecorderSessionLike,
    TState extends RecorderControlTokenStateLike,
  >(session: TSession, state: TState): void {
    this.recorderLoopService.applyRecorderControlTokensAfterExecution(session, state);
  }
}
