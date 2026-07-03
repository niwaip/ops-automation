import { Injectable } from '@nestjs/common';
import type { RecorderDebugObservation } from '../execute/recorder-debug.types';

type RecorderDebugObservationRefreshSession = {
  sessionId: string;
  currentPageUrl?: string;
  lastObservation?: RecorderDebugObservation;
  updatedAt?: string;
};

@Injectable()
export class RecorderDebugObservationRefreshService {
  private readonly observationReuseTtlMs = parseInt(
    process.env.RECORDER_DEBUG_OBSERVATION_REUSE_TTL_MS || '5000',
    10
  );

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
    preferCachedObservation?: boolean;
    observePage: (session: TSession) => Promise<RecorderDebugObservation>;
    onObserveFailed?: (context: {
      session: TSession;
      errorMessage: string;
      hasFallback: boolean;
    }) => void;
  }): Promise<RecorderDebugObservation> {
    if (input.preferCachedObservation) {
      const reusableObservation = this.tryReuseRecentObservation(input.session, input.fallback);
      if (reusableObservation) {
        return reusableObservation;
      }
    }

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

  private tryReuseRecentObservation<TSession extends RecorderDebugObservationRefreshSession>(
    session: TSession,
    fallback?: RecorderDebugObservation
  ): RecorderDebugObservation | undefined {
    if (fallback) {
      return undefined;
    }

    const lastObservation = session.lastObservation;
    if (!lastObservation) {
      return undefined;
    }

    const reuseEligibility = lastObservation.reuseEligibility || lastObservation.page?.reuseEligibility;
    if (reuseEligibility !== 'fresh') {
      return undefined;
    }

    const staleReason = lastObservation.staleReason || lastObservation.page?.staleReason;
    if (staleReason) {
      return undefined;
    }

    const capturedAt = lastObservation.capturedAt || lastObservation.page?.capturedAt;
    if (!capturedAt) {
      return undefined;
    }
    const capturedAtMs = Date.parse(capturedAt);
    if (!Number.isFinite(capturedAtMs)) {
      return undefined;
    }
    if (Date.now() - capturedAtMs > this.observationReuseTtlMs) {
      return undefined;
    }

    const observationUrl = lastObservation.currentPageUrl || lastObservation.page?.url;
    if (session.currentPageUrl && observationUrl && session.currentPageUrl !== observationUrl) {
      return undefined;
    }

    return lastObservation;
  }
}
