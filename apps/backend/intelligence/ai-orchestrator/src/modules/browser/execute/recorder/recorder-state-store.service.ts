import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getBrowserWorkerUrl } from '../../../../config/service-endpoints';
import type { RecorderStateSnapshotMeta } from '../recorder-debug.types';

/**
 * v4.1 P0 (doc §9.2.2): orchestrator-side state index + worker API caller.
 *
 * Boundary:
 * - This service does NOT read worker container files directly.
 * - It maintains the `sessionId + executionIndex -> stateHandle + metadata` index,
 *   persisted on `session.stateSnapshots` so it survives orchestrator restart.
 * - It calls worker HTTP API (/browser/state/capture, /restore, /cleanup-after, /cleanup-all)
 *   via BROWSER_WORKER_URL — same pattern as executeBrowserCommandBatch.
 *
 * stateHandle is opaque to this service; worker owns the actual file path under
 * PLAYWRIGHT_CLI_ARTIFACT_DIR/recorder-state/{runtimeSessionId}/{executionIndex}.json.
 */

type StatefulRecorderSession = {
  sessionId: string;
  runtimeSessionId: string;
  backend?: 'cli' | 'chrome-devtools' | 'mcp';
  stateSnapshots?: Record<number, RecorderStateSnapshotMeta>;
};

type CaptureResponse = {
  stateHandle: string;
  url?: string;
  capturedAt: string;
};

type RestoreResponse = {
  restored: boolean;
  partial?: boolean;
  reason?: string;
  url?: string;
};

type CleanupResponse = {
  cleanedCount: number;
};

@Injectable()
export class RecorderStateStoreService {
  private readonly logger = new Logger(RecorderStateStoreService.name);
  private readonly browserWorkerUrl = getBrowserWorkerUrl();
  private readonly requestTimeoutMs = parseInt(
    process.env.RECORDER_STATE_STORE_TIMEOUT_MS || '30000',
    10
  );

  /**
   * Capture pre-action state for execution N. Called by the execution orchestration
   * layer BEFORE executeAndResolve runs (doc §4.3.4).
   *
   * Failure semantics: capture failure is logged as a warning but does NOT block
   * execution — the recorder can still proceed; only rollback integrity is degraded.
   * Returns undefined on failure so the caller can detect missing state.
   */
  async capturePreActionState(
    session: StatefulRecorderSession,
    executionIndex: number
  ): Promise<RecorderStateSnapshotMeta | undefined> {
    // v4.1 P0 Issue #1: only playwright-cli backend uses recorder state capture.
    // chrome-devtools and mcp backends manage browser state via their own mechanisms
    // (CDP session / MCP protocol) and have no CLI session to snapshot. Calling the
    // worker's /browser/state/capture endpoint for them would route to playwrightCliAdapter
    // which would either grab the wrong context or fail with "no CLI session".
    if (session.backend && session.backend !== 'cli') {
      return undefined;
    }
    const captureUrl = `${this.browserWorkerUrl}/browser/state/capture`;
    try {
      const response = await axios.post<CaptureResponse>(
        captureUrl,
        {
          runtimeSessionId: session.runtimeSessionId,
          executionIndex,
        },
        {
          timeout: this.requestTimeoutMs,
          headers: { 'Content-Type': 'application/json' },
        }
      );
      const meta: RecorderStateSnapshotMeta = {
        executionIndex,
        stateHandle: response.data.stateHandle,
        runtimeSessionId: session.runtimeSessionId,
        ...(response.data.url ? { url: response.data.url } : {}),
        capturedAt: response.data.capturedAt,
      };
      this.attachMetaToSession(session, meta);
      return meta;
    } catch (error) {
      // v4.1 P0 diagnostic: surface the exact failure cause so users can identify
      // missing worker endpoints (404), worker crashes (502), or network issues.
      const axiosError = error as { response?: { status?: number; data?: unknown }; code?: string };
      const httpStatus = axiosError?.response?.status;
      const errorBody = axiosError?.response?.data;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `capturePreActionState failed for session ${session.sessionId} execution ${executionIndex}: ${errorMessage}. ` +
          `URL=${captureUrl} runtimeSessionId=${session.runtimeSessionId} ` +
          `httpStatus=${httpStatus ?? 'N/A'} errorCode=${axiosError?.code ?? 'N/A'} ` +
          `responseBody=${errorBody ? JSON.stringify(errorBody).slice(0, 300) : 'N/A'}. ` +
          `Rollback integrity for this step will be degraded — verify the browser-worker is running with /browser/state/* endpoints deployed.`
      );
      return undefined;
    }
  }

  /**
   * Read previously captured metadata for a given execution step.
   * Returns undefined if no capture was made (e.g. capture failed, or pre-dates P0).
   */
  getStateMeta(
    session: StatefulRecorderSession,
    executionIndex: number
  ): RecorderStateSnapshotMeta | undefined {
    return session.stateSnapshots?.[executionIndex];
  }

  /**
   * Restore browser state for a given execution step via worker API.
   * Returns the worker's restore result. Caller is responsible for handling
   * `partial: true` and surfacing the appropriate user-visible message.
   */
  async restoreState(
    session: StatefulRecorderSession,
    executionIndex: number
  ): Promise<RestoreResponse> {
    // v4.1 P0 Issue #1: skip restore for non-CLI backends — they have no captured state
    // to restore from. Return success so rollback proceeds (history truncation still
    // happens; only browser state restore is skipped).
    if (session.backend && session.backend !== 'cli') {
      return { restored: true, reason: 'backend-does-not-use-state-capture' };
    }
    const meta = this.getStateMeta(session, executionIndex);
    if (!meta) {
      // v4.1 P0 diagnostic: log available captures so users can see whether captures
      // were never made (undefined stateSnapshots) or made for wrong indices.
      const availableKeys = session.stateSnapshots
        ? Object.keys(session.stateSnapshots).map(Number).sort((a, b) => a - b)
        : [];
      this.logger.warn(
        `restoreState: no captured state for execution ${executionIndex} on session ${session.sessionId}. ` +
          `stateSnapshots=${session.stateSnapshots ? `present(${availableKeys.join(',')})` : 'undefined'}. ` +
          `This means capturePreActionState was never called or failed for this step — ` +
          `check earlier logs for "capturePreActionState failed" warnings.`
      );
      return {
        restored: false,
        reason: 'no-captured-state-for-execution',
      };
    }
    try {
      const response = await axios.post<RestoreResponse>(
        `${this.browserWorkerUrl}/browser/state/restore`,
        {
          runtimeSessionId: session.runtimeSessionId,
          stateHandle: meta.stateHandle,
        },
        {
          timeout: this.requestTimeoutMs,
          headers: { 'Content-Type': 'application/json' },
        }
      );
      // Update metadata with restore outcome (partial/reason) so callers can introspect
      if (response.data.partial || response.data.reason) {
        this.attachMetaToSession(session, {
          ...meta,
          ...(response.data.partial ? { partial: response.data.partial } : {}),
          ...(response.data.reason ? { reason: response.data.reason } : {}),
        });
      }
      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `restoreState failed for session ${session.sessionId} execution ${executionIndex}: ${errorMessage}`
      );
      return {
        restored: false,
        reason: `restore-request-failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Notify worker to clean up state files at and after the given executionIndex.
   * Also prunes the in-session metadata index for those entries.
   */
  async cleanupAfter(
    session: StatefulRecorderSession,
    executionIndex: number
  ): Promise<CleanupResponse> {
    let cleanedCount = 0;
    try {
      const response = await axios.post<CleanupResponse>(
        `${this.browserWorkerUrl}/browser/state/cleanup-after`,
        {
          runtimeSessionId: session.runtimeSessionId,
          executionIndex,
        },
        {
          timeout: this.requestTimeoutMs,
          headers: { 'Content-Type': 'application/json' },
        }
      );
      cleanedCount = response.data.cleanedCount;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `cleanupAfter failed for session ${session.sessionId} execution ${executionIndex}: ${errorMessage}`
      );
    }
    this.pruneSessionIndex(session, executionIndex);
    return { cleanedCount };
  }

  /**
   * Notify worker to clean up ALL state files for this session.
   * Used on session reset / destroy.
   */
  async cleanupAll(session: StatefulRecorderSession): Promise<CleanupResponse> {
    let cleanedCount = 0;
    try {
      const response = await axios.post<CleanupResponse>(
        `${this.browserWorkerUrl}/browser/state/cleanup-all`,
        {
          runtimeSessionId: session.runtimeSessionId,
        },
        {
          timeout: this.requestTimeoutMs,
          headers: { 'Content-Type': 'application/json' },
        }
      );
      cleanedCount = response.data.cleanedCount;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `cleanupAll failed for session ${session.sessionId}: ${errorMessage}`
      );
    }
    session.stateSnapshots = undefined;
    return { cleanedCount };
  }

  private attachMetaToSession(
    session: StatefulRecorderSession,
    meta: RecorderStateSnapshotMeta
  ): void {
    if (!session.stateSnapshots) {
      session.stateSnapshots = {};
    }
    session.stateSnapshots[meta.executionIndex] = meta;
  }

  private pruneSessionIndex(
    session: StatefulRecorderSession,
    executionIndex: number
  ): void {
    if (!session.stateSnapshots) return;
    for (const key of Object.keys(session.stateSnapshots)) {
      const idx = Number(key);
      if (Number.isFinite(idx) && idx >= executionIndex) {
        delete session.stateSnapshots[idx];
      }
    }
    if (Object.keys(session.stateSnapshots).length === 0) {
      session.stateSnapshots = undefined;
    }
  }
}
