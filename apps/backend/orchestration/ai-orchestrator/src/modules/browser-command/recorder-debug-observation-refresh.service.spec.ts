jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
  }),
  { virtual: true }
);

import { RecorderDebugObservationRefreshService } from './recorder-debug-observation-refresh.service';

describe('RecorderDebugObservationRefreshService', () => {
  it('observePageSafely should return fallback observation when observePage fails', async () => {
    const service = new RecorderDebugObservationRefreshService();
    const session = {
      sessionId: 'session-1',
      currentPageUrl: 'https://example.com/current',
    };
    const fallback = {
      currentPageUrl: 'https://example.com/fallback',
      text: 'fallback',
      inputs: [],
      buttons: [],
      headings: [],
      links: [],
      suggestedParameters: [],
    };
    const onObserveFailed = jest.fn();

    await expect(
      service.observePageSafely({
        session,
        fallback,
        observePage: jest.fn().mockRejectedValue(new Error('snapshot failed')),
        onObserveFailed,
      })
    ).resolves.toBe(fallback);

    expect(onObserveFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        session,
        errorMessage: 'snapshot failed',
        hasFallback: true,
      })
    );
  });

  it('refreshObservationAfterExecution should update persisted session with refreshed observation', async () => {
    const service = new RecorderDebugObservationRefreshService();
    const staleSession = {
      sessionId: 'session-1',
      currentPageUrl: 'https://example.com/old',
      lastObservation: {
        currentPageUrl: 'https://example.com/old',
        text: 'old',
        inputs: [],
        buttons: [],
        headings: [],
        links: [],
        suggestedParameters: [],
      },
      executedCommands: [{ tool: 'navigate', params: { url: 'https://example.com/old' } }],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const persistedSession = {
      ...staleSession,
      executedCommands: [
        { tool: 'navigate', params: { url: 'https://example.com/old' } },
        { tool: 'click', params: { text: '最新步骤' } },
      ],
    };
    const refreshedObservation = {
      currentPageUrl: 'https://example.com/latest',
      text: 'latest',
      inputs: [],
      buttons: [],
      headings: [],
      links: [],
      suggestedParameters: [],
    };
    const observePageSafely = jest.fn().mockResolvedValue(refreshedObservation);
    const loadSession = jest.fn().mockResolvedValue(persistedSession);
    const saveSession = jest.fn().mockResolvedValue(undefined);

    await service.refreshObservationAfterExecution({
      session: staleSession,
      observePageSafely,
      loadSession,
      saveSession,
    });

    expect(observePageSafely).toHaveBeenCalledWith(staleSession, staleSession.lastObservation);
    expect(loadSession).toHaveBeenCalledWith(staleSession.sessionId);
    expect(saveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: persistedSession.sessionId,
        currentPageUrl: refreshedObservation.currentPageUrl,
        lastObservation: refreshedObservation,
        executedCommands: persistedSession.executedCommands,
      })
    );
  });
});
