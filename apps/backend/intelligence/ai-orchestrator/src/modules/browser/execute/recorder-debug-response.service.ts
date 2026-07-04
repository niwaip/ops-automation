import { Injectable } from '@nestjs/common';
import {
  RecorderControlTokenStateLike,
  RecorderLoopRuntimeStateLike,
} from '../loop';
import { RecorderDebugOutcomeService } from './recorder-debug-outcome.service';
// Direct import (not via ./recorder barrel) to avoid circular re-export:
//   recorder-debug-response.service -> ./recorder barrel -> ../recorder-debug-response.service
// The barrel's `export * from '../recorder-debug-response.service'` line creates a cycle
// that breaks SWC-emitted design:paramtypes metadata for the 2nd constructor param.
import { RecorderHistoryCompressionService } from './recorder/recorder-history-compression.service';

type RecorderDebugStatus = 'executed' | 'answer' | 'question' | 'completed';

type RecorderDebugSessionLike = {
  sessionId: string;
  runtimeSessionId: string;
  browserInitialized: boolean;
  currentPageUrl?: string;
  loopDraft?: any;
  pendingLoopCaptureStartCommandIndex?: number;
  history: any[];
  updatedAt: string;
  // v4.1 P0 (doc §5.2): version stamp, increments on chat/rollback/reset commit
  revision?: number;
  // v4.1 P0 (doc §4.3.4): monotonic execution counter, independent of history.length
  nextExecutionIndex?: number;
};

@Injectable()
export class RecorderDebugResponseService {
  constructor(
    private readonly recorderDebugOutcomeService: RecorderDebugOutcomeService,
    private readonly historyCompressionService: RecorderHistoryCompressionService
  ) {}

  createAndRecordChatResponse(input: {
    session: RecorderDebugSessionLike;
    reply: string;
    status: RecorderDebugStatus;
    userGoal?: string;
    beforeObservation?: any;
    observation?: any;
    commands?: any;
    execution?: any;
    exportArtifacts?: any;
    controlTokenState?: RecorderControlTokenStateLike;
    /**
     * v4.1 P0 (doc §4.3.4): executionIndex this assistant turn was produced by.
     * Stamped onto the turn so rollback can filter turns by executionIndex.
     * Undefined for non-execution turns (pure answer/question).
     */
    executionIndex?: number;
  }): any {
    const response = this.createChatResponse(input);
    this.pushAssistantTurn(input.session, {
      status: input.status,
      reply: input.reply,
      userGoal: input.userGoal,
      beforeObservation: input.beforeObservation,
      observation: input.observation,
      commands: input.commands,
      execution: input.execution,
      exportArtifacts: input.exportArtifacts,
      controlTokenState: input.controlTokenState,
      executionIndex: input.executionIndex,
    });
    return response;
  }

  createChatResponse(input: {
    session: Pick<
      RecorderDebugSessionLike,
      | 'sessionId'
      | 'runtimeSessionId'
      | 'browserInitialized'
      | 'currentPageUrl'
      | 'loopDraft'
      | 'pendingLoopCaptureStartCommandIndex'
    >;
    reply: string;
    status: RecorderDebugStatus;
    userGoal?: string;
    beforeObservation?: any;
    observation?: any;
    commands?: any;
    execution?: any;
    exportArtifacts?: any;
    controlTokenState?: RecorderControlTokenStateLike;
  }): any {
    const loopState = this.buildLoopState(input.session, input.controlTokenState);
    const outcome = this.recorderDebugOutcomeService.buildOutcome({
      status: input.status,
      reply: input.reply,
      userGoal: input.userGoal,
      beforeObservation: input.beforeObservation,
      observation: input.observation,
      commands: input.commands,
      execution: input.execution,
      exportArtifacts: input.exportArtifacts,
    });
    return {
      sessionId: input.session.sessionId,
      runtimeSessionId: input.session.runtimeSessionId,
      reply: input.reply,
      status: input.status,
      browserReady: input.session.browserInitialized,
      currentPageUrl: input.session.currentPageUrl,
      ...(input.observation ? { observation: input.observation } : {}),
      ...(input.commands ? { commands: input.commands } : {}),
      ...(input.execution ? { execution: input.execution } : {}),
      outcomeVersion: 'v1',
      outcome,
      ...(input.exportArtifacts ? { exportArtifacts: input.exportArtifacts } : {}),
      ...(input.session.loopDraft ? { loopDraft: input.session.loopDraft } : {}),
      ...(loopState ? { loopState } : {}),
    };
  }

  pushAssistantTurn(
    session: RecorderDebugSessionLike,
    input: {
      status?: RecorderDebugStatus;
      reply: string;
      userGoal?: string;
      beforeObservation?: any;
      observation?: any;
      commands?: any;
      execution?: any;
      exportArtifacts?: any;
      controlTokenState?: RecorderControlTokenStateLike;
      executionIndex?: number;
    }
  ): void {
    const loopState = this.buildLoopState(session, input.controlTokenState);
    const outcome = this.recorderDebugOutcomeService.buildOutcome({
      status: input.status || 'answer',
      reply: input.reply,
      userGoal: input.userGoal,
      beforeObservation: input.beforeObservation,
      observation: input.observation,
      commands: input.commands,
      execution: input.execution,
      exportArtifacts: input.exportArtifacts,
    });
    session.history.push({
      role: 'assistant',
      content: input.reply,
      timestamp: new Date().toISOString(),
      ...(input.commands ? { commands: input.commands } : {}),
      ...(input.execution ? { execution: input.execution } : {}),
      ...(input.observation ? { observation: input.observation } : {}),
      outcomeVersion: 'v1',
      outcome,
      ...(input.exportArtifacts ? { exportArtifacts: input.exportArtifacts } : {}),
      ...(session.loopDraft ? { loopDraft: session.loopDraft } : {}),
      ...(loopState ? { loopState } : {}),
      // v4.1 P0 (doc §4.3.4): stamp executionIndex on the turn so rollback can filter
      ...(typeof input.executionIndex === 'number'
        ? { executionIndex: input.executionIndex }
        : {}),
    });
    // v4.1 P0 (doc §5.2): chat commit increments session revision.
    // Used by P1 to invalidate stale pendingRecoverySuggestion entries.
    session.revision = (session.revision || 0) + 1;
  }

  finalizeSession(session: RecorderDebugSessionLike, maxHistory: number): void {
    // v4.1 §15: compress older turns to outcome summaries instead of dropping them outright.
    // The most recent `maxHistory` turns stay uncompressed for fresh context; older turns
    // are reduced to {role, content, timestamp, outcome (diff + toolExecution only)}.
    this.historyCompressionService.compressHistory(session.history, {
      retainRecentTurnCount: maxHistory,
    });
    // Absolute cap to prevent unbounded growth: keep last 3x maxHistory turns (recent +
    // compressed). Load-bearing turns (exportArtifacts / loopDraft / loopState) are
    // preserved by compressHistory and may survive past the slice boundary.
    const absoluteCap = Math.max(maxHistory * 3, maxHistory);
    if (session.history.length > absoluteCap) {
      session.history = session.history.slice(-absoluteCap);
    }
    session.updatedAt = new Date().toISOString();
  }

  private buildLoopState(
    session: Pick<RecorderDebugSessionLike, 'pendingLoopCaptureStartCommandIndex' | 'loopDraft'>,
    controlTokenState?: RecorderControlTokenStateLike
  ): RecorderLoopRuntimeStateLike | undefined {
    const hasLoopDraft = Boolean(session.loopDraft);
    const hasPendingCapture = typeof session.pendingLoopCaptureStartCommandIndex === 'number';
    const hasControlTokens = Boolean(controlTokenState?.rawTokens.length);
    if (!hasLoopDraft && !hasPendingCapture && !hasControlTokens) {
      return undefined;
    }

    return {
      rawTokens: controlTokenState?.rawTokens || [],
      ...(controlTokenState?.loopTargetScope
        ? { loopTargetScope: controlTokenState.loopTargetScope }
        : {}),
      hasLoopStart: Boolean(controlTokenState?.hasLoopStart),
      hasLoopEnd: Boolean(controlTokenState?.hasLoopEnd),
      hasConditionalBranch: Boolean(controlTokenState?.hasConditionalBranch),
      manualInterventionLabels: controlTokenState?.manualInterventionLabels || [],
      ...(hasPendingCapture
        ? {
            pendingLoopCaptureStartCommandIndex:
              session.pendingLoopCaptureStartCommandIndex as number,
          }
        : {}),
      isLoopCaptureActive: hasPendingCapture,
    };
  }
}
