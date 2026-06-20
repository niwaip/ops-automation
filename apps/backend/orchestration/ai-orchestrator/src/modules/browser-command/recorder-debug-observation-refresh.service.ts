import { Injectable } from '@nestjs/common';
import type { RecorderDebugObservation } from './recorder-debug.service';

type RecorderDebugObservationRefreshSession = {
  sessionId: string;
  currentPageUrl?: string;
  lastObservation?: RecorderDebugObservation;
  updatedAt?: string;
};

@Injectable()
export class RecorderDebugObservationRefreshService {
  buildFallbackObservation(
    session: Pick<RecorderDebugObservationRefreshSession, 'currentPageUrl'>
  ): RecorderDebugObservation {
    return {
      currentPageUrl: session.currentPageUrl,
      title: undefined,
      text: '',
      inputs: [],
      buttons: [],
      rows: [],
      regions: [],
      candidates: [],
      candidateTrace: [],
      headings: [],
      links: [],
      suggestedParameters: [],
    };
  }

  async observePageSafely<TSession extends RecorderDebugObservationRefreshSession>(input: {
    session: TSession;
    fallback?: RecorderDebugObservation;
    observePage: (session: TSession) => Promise<RecorderDebugObservation>;
    onObserveFailed?: (context: {
      session: TSession;
      errorMessage: string;
      hasFallback: boolean;
    }) => void;
  }): Promise<RecorderDebugObservation> {
    try {
      return await input.observePage(input.session);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      input.onObserveFailed?.({
        session: input.session,
        errorMessage,
        hasFallback: Boolean(input.fallback),
      });
      if (input.fallback) {
        return input.fallback;
      }
      return this.buildFallbackObservation(input.session);
    }
  }

  async refreshObservationAfterExecution<
    TSession extends RecorderDebugObservationRefreshSession,
  >(input: {
    session: TSession;
    observePageSafely: (
      session: TSession,
      fallback?: RecorderDebugObservation
    ) => Promise<RecorderDebugObservation>;
    loadSession: (sessionId: string) => Promise<TSession | null>;
    saveSession: (session: TSession) => Promise<void>;
  }): Promise<void> {
    const refreshedObservation = await input.observePageSafely(
      input.session,
      input.session.lastObservation
    );
    const latestSession = await input.loadSession(input.session.sessionId);
    const sessionToUpdate = latestSession || input.session;
    sessionToUpdate.lastObservation = refreshedObservation;
    sessionToUpdate.currentPageUrl =
      refreshedObservation.currentPageUrl || sessionToUpdate.currentPageUrl;
    sessionToUpdate.updatedAt = new Date().toISOString();
    await input.saveSession(sessionToUpdate);
  }
}
