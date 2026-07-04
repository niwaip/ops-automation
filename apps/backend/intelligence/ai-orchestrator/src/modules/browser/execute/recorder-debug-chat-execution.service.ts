import { Injectable, Logger } from '@nestjs/common';
import type { BrowserCommandCandidate } from '../intent';
import type { BrowserExecuteResponse } from './recorder-debug.types';
import {
  BrowserExecutionControllerService,
  type BrowserExecutionControllerInput,
  type RecorderControlTokenStateLike,
  type RecorderDebugChatExecutionOutcome,
  type RecorderDebugExecutionSessionLike,
} from './browser-execution-controller.service';
import { RecorderStateStoreService } from './recorder/recorder-state-store.service';

export type {
  BrowserExecutionControllerInput,
  RecorderControlTokenStateLike,
  RecorderDebugChatExecutionOutcome,
  RecorderDebugExecutionSessionLike,
} from './browser-execution-controller.service';

/**
 * v4.1 P0 (doc §4.3.4): the execution编排层 owns pre-action state capture.
 * All execution entry points (RecorderDebugService.chat, RecorderDebugBranchFacade,
 * follow-up execution) route through this service, so they share the same capture
 * timing: BEFORE BrowserExecutionControllerService.executeAndResolve runs.
 *
 * The executionIndex attached to the outcome is later stamped onto the assistant
 * turn by RecorderDebugResponseService so rollback can filter turns by executionIndex.
 */
@Injectable()
export class RecorderDebugChatExecutionService {
  private readonly logger = new Logger(RecorderDebugChatExecutionService.name);

  constructor(
    private readonly browserExecutionControllerService: BrowserExecutionControllerService,
    private readonly recorderStateStoreService: RecorderStateStoreService
  ) {}

  splitNavigateThenActionMessage(
    effectiveMessage: string
  ): { navigateMessage: string; followUpMessage: string } | null {
    const lines = effectiveMessage
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      return null;
    }

    const navigateMessage = lines[0] || '';
    const followUpMessage = lines.slice(1).join('\n').trim();
    if (!followUpMessage) {
      return null;
    }
    if (!/(打开|进入|访问|前往|go to|open|visit|https?:\/\/|www\.)/i.test(navigateMessage)) {
      return null;
    }

    return {
      navigateMessage,
      followUpMessage,
    };
  }

  buildBrowserCommandParseContext<
    TSession extends Pick<RecorderDebugExecutionSessionLike, 'currentPageUrl' | 'backend'>,
  >(input: {
    session: TSession;
    observation: {
      text?: string;
      candidates?: BrowserCommandCandidate[];
      inputs: Array<Record<string, unknown>>;
      buttons: Array<Record<string, unknown>>;
    };
    controlTokenState: RecorderControlTokenStateLike;
    buildObservedElementDescriptions: (items: Array<Record<string, unknown>>) => string[];
    buildRecorderControlHints: (
      session: TSession,
      state: RecorderControlTokenStateLike
    ) => string[];
  }): Record<string, unknown> {
    return {
      currentPageUrl: input.session.currentPageUrl,
      backend: input.session.backend,
      lastObservationText: input.observation.text,
      availableInputs: input.buildObservedElementDescriptions(input.observation.inputs),
      availableButtons: input.buildObservedElementDescriptions(input.observation.buttons),
      availableCandidates: input.observation.candidates || [],
      controlHints: input.buildRecorderControlHints(input.session, input.controlTokenState),
    };
  }

  mergeBrowserExecuteResponses(
    first: BrowserExecuteResponse,
    second?: BrowserExecuteResponse
  ): BrowserExecuteResponse {
    if (!second) {
      return first;
    }

    const message = [first.message, second.message].filter(Boolean).join(' | ') || undefined;
    const merged: BrowserExecuteResponse = {
      success: first.success && second.success,
      results: [...(first.results || []), ...(second.results || [])],
      ...(message ? { message } : {}),
      steps: [...(first.steps || []), ...(second.steps || [])],
      executedCommands: [...(first.executedCommands || []), ...(second.executedCommands || [])],
    };

    if (!merged.steps?.length) {
      delete merged.steps;
    }
    if (!merged.executedCommands?.length) {
      delete merged.executedCommands;
    }

    return merged;
  }

  async executeAndResolve<TSession extends RecorderDebugExecutionSessionLike>(input: {
    session: TSession;
    /**
     * v4.1 P0 Issue #3: when the caller has already called prepareExecution() to
     * capture pre-action state (e.g. staged navigate in RecorderDebugService),
     * passing the assigned executionIndex here skips the second prepareExecution()
     * call so the whole staged flow shares one executionIndex. This prevents the
     * divergence where navigate commands get index N but the assistant turn gets
     * index N+1, causing rollback to delete the turn while leaving navigate commands.
     */
    preAssignedExecutionIndex?: number;
  } & BrowserExecutionControllerInput<TSession>): Promise<RecorderDebugChatExecutionOutcome> {
    // v4.1 P0 (doc §4.3.4): capture pre-action state BEFORE delegating to executeAndResolve.
    // Capture failure is logged as a warning but does NOT block execution — only rollback
    // integrity is degraded for this step. nextExecutionIndex defaults to 1 for sessions
    // created before P0 (back-compat).
    const executionIndex = input.preAssignedExecutionIndex ?? await this.prepareExecution(input.session);

    // Record command count before execution so we can stamp executionIndex onto the
    // commands that the controller pushes during executeAndResolve. Without this,
    // rollback's persist scan (findPersistSideEffectsBetween) and command filter
    // can't match commands to execution steps.
    const preExecutionCommandCount = input.session.executedCommands.length;
    const outcome = await this.browserExecutionControllerService.executeAndResolve(input);
    for (let i = preExecutionCommandCount; i < input.session.executedCommands.length; i++) {
      const cmd = input.session.executedCommands[i];
      if (cmd && typeof cmd.executionIndex !== 'number') {
        cmd.executionIndex = executionIndex;
      }
    }

    // Attach the executionIndex to the outcome so the caller (RecorderDebugService) can
    // stamp it onto the assistant turn via createAndRecordChatResponse.
    return {
      ...outcome,
      executionIndex,
    } as RecorderDebugChatExecutionOutcome & { executionIndex: number };
  }

  /**
   * Prepare for an execution step: assign the next executionIndex, bump the cursor,
   * and capture pre-action browser state via the worker. Used by executeAndResolve
   * AND by non-executeAndResolve paths (e.g. staged navigate in RecorderDebugService)
   * so that all execution entry points share the same capture + indexing.
   *
   * Returns the assigned executionIndex. Capture failure is logged but does NOT
   * block execution — only rollback integrity is degraded.
   */
  async prepareExecution(session: RecorderDebugExecutionSessionLike): Promise<number> {
    const executionIndex = this.readNextExecutionIndex(session);
    this.bumpNextExecutionIndex(session, executionIndex + 1);
    const statefulSession = this.coerceStatefulSession(session);
    if (statefulSession) {
      await this.recorderStateStoreService
        .capturePreActionState(statefulSession, executionIndex)
        .catch((error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `capturePreActionState threw for execution ${executionIndex}: ${errorMessage}. Continuing execution — rollback for this step will be unavailable.`
          );
        });
    } else {
      this.logger.debug(
        `Skipping pre-action state capture for execution ${executionIndex}: session missing sessionId/runtimeSessionId`
      );
    }
    return executionIndex;
  }

  /**
   * Stamp executionIndex onto commands at positions [fromIndex, length) in
   * session.executedCommands. Used by paths that push commands directly
   * (e.g. staged navigate) rather than through executeAndResolve.
   */
  stampExecutionIndex(
    session: RecorderDebugExecutionSessionLike,
    executionIndex: number,
    fromIndex: number
  ): void {
    for (let i = fromIndex; i < session.executedCommands.length; i++) {
      const cmd = session.executedCommands[i];
      if (cmd && typeof cmd.executionIndex !== 'number') {
        cmd.executionIndex = executionIndex;
      }
    }
  }

  private readNextExecutionIndex(session: RecorderDebugExecutionSessionLike): number {
    const sessionWithIndex = session as RecorderDebugExecutionSessionLike & {
      nextExecutionIndex?: number;
    };
    const idx = sessionWithIndex.nextExecutionIndex;
    return typeof idx === 'number' && Number.isFinite(idx) && idx >= 1 ? Math.floor(idx) : 1;
  }

  private bumpNextExecutionIndex(
    session: RecorderDebugExecutionSessionLike,
    nextValue: number
  ): void {
    const sessionWithIndex = session as RecorderDebugExecutionSessionLike & {
      nextExecutionIndex?: number;
    };
    sessionWithIndex.nextExecutionIndex = nextValue;
  }

  /**
   * RecorderDebugExecutionSessionLike has optional sessionId/runtimeSessionId, but state
   * capture requires both. Returns the ORIGINAL session reference (not a copy) so that
   * RecorderStateStoreService.attachMetaToSession mutates the real session object that
   * gets persisted to Redis — a copy would lose the stateSnapshots index.
   */
  private coerceStatefulSession(
    session: RecorderDebugExecutionSessionLike
  ): {
    sessionId: string;
    runtimeSessionId: string;
    backend?: 'cli' | 'chrome-devtools' | 'mcp';
    stateSnapshots?: Record<number, import('./recorder-debug.types').RecorderStateSnapshotMeta>;
  } | null {
    const s = session as RecorderDebugExecutionSessionLike & {
      sessionId?: string;
      runtimeSessionId?: string;
      backend?: 'cli' | 'chrome-devtools' | 'mcp';
      stateSnapshots?: Record<number, import('./recorder-debug.types').RecorderStateSnapshotMeta>;
    };
    if (typeof s.sessionId !== 'string' || !s.sessionId) return null;
    if (typeof s.runtimeSessionId !== 'string' || !s.runtimeSessionId) return null;
    // Return the original reference — attachMetaToSession must mutate THIS object,
    // not a transient copy, so stateSnapshots survives session save to Redis.
    return s as unknown as {
      sessionId: string;
      runtimeSessionId: string;
      backend?: 'cli' | 'chrome-devtools' | 'mcp';
      stateSnapshots?: Record<number, import('./recorder-debug.types').RecorderStateSnapshotMeta>;
    };
  }
}
