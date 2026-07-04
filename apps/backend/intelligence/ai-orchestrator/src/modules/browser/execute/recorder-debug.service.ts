import { Injectable } from '@nestjs/common';
import { getBrowserWorkerUrl } from '../../../config/service-endpoints';
import { BrowserSemanticsClient } from '../../../client/browser-semantics.client';
import type { BrowserCommand, BrowserCommandCandidate } from '../intent';
import { BrowserCommandService } from '../intent';
import {
  ExecutionReconcileService,
  ReconcileAfterTakeoverRequest,
  ReconcileAfterTakeoverResponse,
} from './execution-reconcile.service';
import { RecorderExportAssemblyService } from '../export';
import {
  RecorderLoopService,
  RecorderManualInterventionToken,
} from '../loop';
import { RecorderDebugChatSupportService } from './recorder-debug-chat-support.service';
import { RecorderDebugBranchFacade } from './recorder-debug-branch.facade';
import { RecorderDebugChatExecutionService } from './recorder-debug-chat-execution.service';
import { RecorderDebugChatFlowService } from './recorder-debug-chat-flow.service';
import { RecorderDebugExecutionService } from './recorder-debug-execution.service';
import type {
  BrowserExecuteResponse,
  RecorderDebugChatRequest,
  RecorderDebugChatResponse,
  RecorderDebugExportArtifacts,
  RecorderDebugObservation,
  RecorderDebugSession,
  RecorderLoopDraft,
  RecorderLoopDraftRequest,
} from './recorder-debug.types';
import {
  RecorderObservationService,
  SnapshotNode,
  SnapshotResolutionState,
} from '../observe';
import { RecorderDebugResponseService } from './recorder-debug-response.service';
import { RecorderDebugObservationFacade } from './recorder-debug-observation.facade';
import { RecorderDebugSessionFacade } from './recorder-debug-session.facade';
import {
  RecorderDebugRollbackService,
  type RollbackResult,
} from './recorder/recorder-debug-rollback.service';
import { RecorderStateStoreService } from './recorder/recorder-state-store.service';

export type RecorderDebugBackend = 'cli' | 'chrome-devtools' | 'mcp';
export type RecorderDebugTurnRole = 'user' | 'assistant' | 'system';

interface RecorderControlTokenState {
  cleanedMessage: string;
  rawTokens: string[];
  loopTargetScope?: 'current_list' | 'current_table' | 'current_cards';
  hasLoopStart: boolean;
  hasLoopEnd: boolean;
  hasConditionalBranch: boolean;
  manualInterventions: RecorderManualInterventionToken[];
  manualInterventionLabels: string[];
}

@Injectable()
export class RecorderDebugService {
  private readonly browserWorkerUrl = getBrowserWorkerUrl();
  private readonly sessionTtlSeconds = parseInt(
    process.env.CHAT_SESSION_TTL_SECONDS || '259200',
    10
  );
  private readonly maxHistory = parseInt(process.env.CHAT_SESSION_MAX_MESSAGES || '20', 10);

  constructor(
    private readonly browserCommandService: BrowserCommandService,
    private readonly browserSemanticsClient: BrowserSemanticsClient,
    private readonly recorderDebugBranchFacade: RecorderDebugBranchFacade,
    private readonly recorderDebugSessionFacade: RecorderDebugSessionFacade,
    private readonly executionReconcileService: ExecutionReconcileService,
    private readonly recorderLoopService: RecorderLoopService,
    private readonly recorderExportAssemblyService: RecorderExportAssemblyService,
    private readonly recorderDebugChatSupportService: RecorderDebugChatSupportService,
    private readonly recorderDebugChatFlowService: RecorderDebugChatFlowService,
    private readonly recorderDebugChatExecutionService: RecorderDebugChatExecutionService,
    private readonly recorderDebugExecutionService: RecorderDebugExecutionService,
    private readonly recorderDebugResponseService: RecorderDebugResponseService,
    private readonly recorderDebugObservationFacade: RecorderDebugObservationFacade,
    private readonly recorderObservationService: RecorderObservationService,
    private readonly recorderDebugRollbackService: RecorderDebugRollbackService,
    private readonly recorderStateStoreService: RecorderStateStoreService
  ) {}

  async chat(request: RecorderDebugChatRequest): Promise<RecorderDebugChatResponse> {
    const rawMessage = request.message.trim();
    if (!rawMessage) {
      throw new Error('Message is required');
    }
    const controlTokenState = this.extractRecorderControlTokens(rawMessage);

    const sessionId = request.sessionId || `recorder-debug-${Date.now()}`;
    const session = await this.loadOrCreateSession(sessionId, request);

    session.history.push({
      role: 'user',
      content: rawMessage,
      timestamp: new Date().toISOString(),
    });

    await this.ensureBrowserReady(session);
    const observation = await this.observePageSafely(session, undefined, {
      preferCachedObservation: true,
    });
    this.recorderDebugSessionFacade.syncObservationToSession(session, observation);
    this.recorderDebugSessionFacade.applyRecorderControlTokensBeforeExecution(
      session,
      controlTokenState,
      observation
    );

    const effectiveMessage = controlTokenState.cleanedMessage.trim();
    if (!effectiveMessage && controlTokenState.rawTokens.length > 0) {
      this.recorderDebugSessionFacade.applyRecorderControlTokensAfterExecution(
        session,
        controlTokenState
      );
      const reply = this.buildControlTokenAckReply(session, controlTokenState);
      const response = this.recorderDebugResponseService.createAndRecordChatResponse({
        session,
        reply,
        status: 'answer',
        userGoal: rawMessage,
        beforeObservation: observation,
        observation,
        controlTokenState,
      });
      this.recorderDebugResponseService.finalizeSession(session, this.maxHistory);
      await this.saveSession(session);
      return response;
    }

    if (controlTokenState.hasConditionalBranch) {
      const response = await this.handleConditionalBranchChat({
        session,
        observation,
        effectiveMessage,
        controlTokenState,
      });
      this.recorderDebugResponseService.finalizeSession(session, this.maxHistory);
      await this.saveSession(session);
      if (response.status === 'executed' && response.execution?.success) {
        void this.refreshObservationAfterExecution(session);
      }
      return response;
    }

    const stagedNavigateResponse = await this.tryHandleNavigateThenActionChat({
      session,
      observation,
      effectiveMessage,
      controlTokenState,
      request,
    });
    if (stagedNavigateResponse) {
      this.recorderDebugResponseService.finalizeSession(session, this.maxHistory);
      await this.saveSession(session);
      if (
        stagedNavigateResponse.status === 'executed' &&
        stagedNavigateResponse.execution?.success
      ) {
        void this.refreshObservationAfterExecution(session);
      }
      return stagedNavigateResponse;
    }

    const flow = await this.recorderDebugChatFlowService.resolveFlow({
      session,
      observation,
      effectiveMessage,
      availableInputs: this.buildObservedElementDescriptions(observation.inputs),
      availableButtons: this.buildObservedElementDescriptions(observation.buttons),
      controlHints: this.buildRecorderControlHints(session, controlTokenState),
      parseCommand: async (parseRequest) => this.browserCommandService.parseCommand(parseRequest),
    });
    const parsed = flow.parsed;

    let response: RecorderDebugChatResponse;
    if (flow.kind === 'export') {
      const exportArtifacts =
        (await this.recorderExportAssemblyService.buildExportArtifacts(
          session,
          effectiveMessage
        )) as unknown as RecorderDebugExportArtifacts;
      response = this.recorderDebugResponseService.createAndRecordChatResponse({
        session,
        reply: '已根据当前对话与执行历史生成 CLI 脚本和内部 skill 草稿。',
        status: 'completed',
        userGoal: effectiveMessage,
        beforeObservation: observation,
        observation,
        exportArtifacts,
        controlTokenState,
      });
    } else if (flow.kind === 'blocked' || flow.kind === 'confirmation_required') {
      response = this.recorderDebugResponseService.createAndRecordChatResponse({
        session,
        reply: flow.reply,
        status: 'question',
        userGoal: effectiveMessage,
        beforeObservation: observation,
        observation,
        commands: parsed.commands,
        controlTokenState,
      });
    } else if (flow.kind === 'execute') {
      const executionOutcome = await this.recorderDebugChatExecutionService.executeAndResolve({
        session,
        effectiveMessage,
        parsed,
        observation,
        controlTokenState,
        executeBrowserCommands: async (currentSession, commands, options) =>
          this.executeBrowserCommands(currentSession, commands, options),
        observePageSafely: async (currentSession, fallback) =>
          this.observePageSafely(currentSession, fallback),
        parseRecoveryCommand: async ({ input, observation: recoveryObservation, failureContext }) =>
          this.browserCommandService.parseCommand({
            input,
            context: {
              forceAI: true,
              currentPageUrl: recoveryObservation.currentPageUrl || session.currentPageUrl,
              backend: session.backend,
              lastObservationText: recoveryObservation.text,
              availableInputs: this.buildObservedElementDescriptions(recoveryObservation.inputs),
              availableButtons: this.buildObservedElementDescriptions(recoveryObservation.buttons),
              availableCandidates: recoveryObservation.candidates || [],
              controlHints: this.buildRecorderControlHints(session, controlTokenState),
              lastFailureContext: failureContext,
            },
          }),
        mergeObservationWithExecution: (currentObservation, execution) =>
          this.mergeObservationWithExecution(currentObservation, execution),
        applyRecorderControlTokensAfterExecution: (currentSession, state) =>
          this.recorderDebugSessionFacade.applyRecorderControlTokensAfterExecution(
            currentSession,
            state
          ),
      });

      if (executionOutcome.kind === 'ambiguous') {
        response = this.recorderDebugResponseService.createAndRecordChatResponse({
          session,
          reply: executionOutcome.reply,
          status: 'question',
          userGoal: effectiveMessage,
          beforeObservation: observation,
          observation: executionOutcome.nextObservation,
          commands: parsed.commands,
          execution: executionOutcome.execution,
          controlTokenState,
          executionIndex: (executionOutcome as { executionIndex?: number }).executionIndex,
        });
      } else {
        response = this.recorderDebugResponseService.createAndRecordChatResponse({
          session,
          reply: executionOutcome.reply,
          status: 'executed',
          userGoal: effectiveMessage,
          beforeObservation: observation,
          observation: executionOutcome.nextObservation,
          commands: parsed.commands,
          execution: executionOutcome.execution,
          controlTokenState,
          executionIndex: (executionOutcome as { executionIndex?: number }).executionIndex,
        });
      }
    } else if (flow.kind === 'observation') {
      const reply = await this.describePage(
        effectiveMessage,
        observation,
        request.userRoles || [],
        request.modelId
      );
      response = this.recorderDebugResponseService.createAndRecordChatResponse({
        session,
        reply,
        status: 'answer',
        userGoal: effectiveMessage,
        beforeObservation: observation,
        observation,
        controlTokenState,
      });
    } else {
      const reply = this.recorderDebugChatSupportService.buildClarificationReply(observation);
      response = this.recorderDebugResponseService.createAndRecordChatResponse({
        session,
        reply,
        status: 'question',
        userGoal: effectiveMessage,
        beforeObservation: observation,
        observation,
        controlTokenState,
      });
    }

    this.recorderDebugResponseService.finalizeSession(session, this.maxHistory);
    await this.saveSession(session);
    if (response.status === 'executed' && response.execution?.success) {
      void this.refreshObservationAfterExecution(session);
    }
    return response;
  }

  async exportArtifacts(
    request: Omit<RecorderDebugChatRequest, 'message'> & { userGoal?: string }
  ): Promise<{
    sessionId: string;
    runtimeSessionId: string;
    exportArtifacts: RecorderDebugExportArtifacts;
    currentPageUrl?: string;
  }> {
    const sessionId = request.sessionId || `recorder-debug-${Date.now()}`;
    const session = await this.loadOrCreateSession(sessionId, request);
    const exportArtifacts =
      (await this.recorderExportAssemblyService.buildExportArtifacts(
        session,
        request.userGoal || '浏览器调试任务'
      )) as unknown as RecorderDebugExportArtifacts;
    this.recorderDebugResponseService.pushAssistantTurn(session, {
      status: 'completed',
      reply: '已导出 CLI 脚本和内部 skill 草稿。',
      userGoal: request.userGoal,
      beforeObservation: session.lastObservation,
      exportArtifacts,
      observation: session.lastObservation,
    });
    this.recorderDebugResponseService.finalizeSession(session, this.maxHistory);
    await this.saveSession(session);
    return {
      sessionId: session.sessionId,
      runtimeSessionId: session.runtimeSessionId,
      exportArtifacts,
      currentPageUrl: session.currentPageUrl,
    };
  }

  async resetSession(sessionId: string): Promise<void> {
    // v4.1 P0: clean up worker-owned state files before deleting the session record.
    // We need runtimeSessionId to address the worker — load first, then delete.
    const session = await this.loadSession(sessionId);
    if (session) {
      await this.recorderStateStoreService
        .cleanupAll(session)
        .catch((error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          // Don't block session reset on cleanup failure — the worker may already be gone.
          console.warn(
            `recorderStateStoreService.cleanupAll failed during resetSession(${sessionId}): ${errorMessage}`
          );
        });
    }
    await this.recorderDebugSessionFacade.deleteSession(sessionId);
  }

  /**
   * v4.1 P0 (doc §5.1.5): rollback the last recorder execution step.
   *
   * Flow:
   * 1. Load session
   * 2. Delegate to RecorderDebugRollbackService (side-effect check → history filter → state restore)
   * 3. If `requires_confirmation`: return WITHOUT saving (no mutation happened)
   * 4. Otherwise: save the mutated session and return the result
   *
   * First-period endpoint only exposes `rollbackLastStep` semantics — `rollbackTo(N)`
   * for arbitrary N is a P1+ concern (loopDraft / conditional-branch consistency).
   */
  async rollbackLastStep(
    sessionId: string,
    confirmation?: {
      targetExecutionIndex: number;
      sessionRevision: number;
      sideEffectDigest: string;
      confirmedSideEffects?: string[];
    }
  ): Promise<RollbackResult> {
    const session = await this.recorderDebugSessionFacade.getSessionOrThrow<RecorderDebugSession>(
      sessionId
    );
    const result = await this.recorderDebugRollbackService.rollbackLastStep({
      session,
      ...(confirmation ? { confirmation } : {}),
    });

    // requires_confirmation / noop / failed-restore: don't persist partial mutations.
    // The rollback service only mutates the session once past the confirmation gate,
    // so requires_confirmation guarantees an unmutated session.
    if (result.status === 'requires_confirmation' || result.status === 'noop') {
      return result;
    }

    // succeeded OR failed (browser restore failed but history already rolled back):
    // persist the mutated session either way — history rollback stands per doc §5.1 降级处理.
    await this.saveSession(session);
    return result;
  }

  async upsertLoopDraft(request: RecorderLoopDraftRequest): Promise<{
    sessionId: string;
    runtimeSessionId: string;
    loopDraft: RecorderLoopDraft;
  }> {
    return this.recorderDebugSessionFacade.upsertLoopDraft<
      RecorderLoopDraft,
      RecorderDebugSession
    >({
      request,
      ttlSeconds: this.sessionTtlSeconds,
      normalizeLoopDraft: (loopDraft, fallbackPageUrl) =>
        this.normalizeLoopDraft(loopDraft, fallbackPageUrl),
    });
  }

  async clearLoopDraft(sessionId: string): Promise<void> {
    await this.recorderDebugSessionFacade.clearLoopDraft({
      sessionId,
      ttlSeconds: this.sessionTtlSeconds,
    });
  }

  async getSession(sessionId: string): Promise<RecorderDebugSession> {
    return this.recorderDebugSessionFacade.getSessionOrThrow<RecorderDebugSession>(sessionId);
  }

  async reconcileAfterTakeover(
    input: ReconcileAfterTakeoverRequest
  ): Promise<ReconcileAfterTakeoverResponse> {
    return this.executionReconcileService.reconcile(input);
  }

  buildResumePrompt(input: ReconcileAfterTakeoverRequest): string {
    return this.executionReconcileService.buildResumePrompt(input);
  }

  mergeManualPatchSteps(
    originalCommands: BrowserCommand[],
    patchSteps: ReconcileAfterTakeoverRequest['patchSteps'],
    failedCommand?: ReconcileAfterTakeoverRequest['failedCommand']
  ): BrowserCommand[] {
    return this.executionReconcileService.mergeManualPatchSteps(
      originalCommands,
      patchSteps,
      failedCommand
    );
  }

  private async loadOrCreateSession(
    sessionId: string,
    request: Omit<RecorderDebugChatRequest, 'message'>
  ): Promise<RecorderDebugSession> {
    return this.recorderDebugSessionFacade.loadOrCreateSession<
      RecorderDebugSession,
      RecorderDebugBackend
    >({
      sessionId,
      request: {
        backend: request.backend,
        runtimeSessionId: request.runtimeSessionId,
      },
    });
  }

  private async loadSession(sessionId: string): Promise<RecorderDebugSession | null> {
    return this.recorderDebugSessionFacade.loadSession<RecorderDebugSession>(sessionId);
  }

  private async saveSession(session: RecorderDebugSession): Promise<void> {
    await this.recorderDebugSessionFacade.saveSession(session, this.sessionTtlSeconds);
  }

  private extractRecorderControlTokens(message: string): RecorderControlTokenState {
    return this.recorderLoopService.extractRecorderControlTokens(
      message
    ) as RecorderControlTokenState;
  }

  private buildControlTokenAckReply(
    session: RecorderDebugSession,
    state: RecorderControlTokenState
  ): string {
    return this.recorderLoopService.buildControlTokenAckReply(session, state);
  }

  private buildRecorderControlHints(
    session: RecorderDebugSession,
    state: RecorderControlTokenState
  ): string[] {
    return this.recorderLoopService.buildRecorderControlHints(session, state);
  }

  private normalizeLoopDraft(
    input: RecorderLoopDraft,
    fallbackPageUrl?: string
  ): RecorderLoopDraft {
    return this.recorderLoopService.normalizeLoopDraft(input, fallbackPageUrl) as RecorderLoopDraft;
  }

  private async ensureBrowserReady(session: RecorderDebugSession): Promise<void> {
    await this.recorderDebugSessionFacade.ensureBrowserReady({
      session,
      browserWorkerUrl: this.browserWorkerUrl,
      reportError: async ({ session: failedSession, sourceStage, errorType, errorMessage }) =>
        this.reportRecorderDebugError({
          session: failedSession,
          sourceStage,
          errorType,
          errorMessage,
        }),
    });
  }

  private async observePage(session: RecorderDebugSession): Promise<RecorderDebugObservation> {
    return this.recorderDebugExecutionService.observePage(session);
  }

  private async executeBrowserCommands(
    session: RecorderDebugSession,
    commands: BrowserCommand[],
    options?: { appendDefaultWait?: boolean; timeoutMs?: number; skipValidation?: boolean }
  ): Promise<BrowserExecuteResponse> {
    return this.recorderDebugExecutionService.executeBrowserCommands(session, commands, options);
  }

  private async observePageSafely(
    session: RecorderDebugSession,
    fallback?: RecorderDebugObservation,
    options?: { preferCachedObservation?: boolean }
  ): Promise<RecorderDebugObservation> {
    return this.recorderDebugSessionFacade.observePageSafely({
      session,
      fallback,
      preferCachedObservation: options?.preferCachedObservation,
      observePage: async (currentSession) => this.observePage(currentSession),
      reportError: async ({ session: failedSession, sourceStage, errorType, errorMessage }) =>
        this.reportRecorderDebugError({
          session: failedSession,
          sourceStage,
          errorType,
          errorMessage,
          observation: failedSession.lastObservation || fallback,
        }),
    });
  }

  private mergeObservationWithExecution(
    observation: RecorderDebugObservation,
    execution: BrowserExecuteResponse
  ): RecorderDebugObservation {
    return this.recorderDebugExecutionService.mergeObservationWithExecution(observation, execution);
  }

  private async refreshObservationAfterExecution(session: RecorderDebugSession): Promise<void> {
    await this.recorderDebugSessionFacade.refreshObservationAfterExecution({
      session,
      ttlSeconds: this.sessionTtlSeconds,
      observePageSafely: async (currentSession, fallback) =>
        this.observePageSafely(currentSession, fallback),
      loadSession: async (sessionId) => this.loadSession(sessionId),
      saveSession: async (sessionToUpdate) => this.saveSession(sessionToUpdate),
    });
  }

  rewriteCommandWithSnapshotRefs(
    command: BrowserCommand,
    snapshotState: SnapshotResolutionState | null
  ): BrowserCommand {
    return this.recorderDebugExecutionService.rewriteCommandWithSnapshotRefs(
      command,
      snapshotState
    );
  }

  parseSnapshotNodes(content: string): SnapshotNode[] {
    return this.recorderDebugExecutionService.parseSnapshotNodes(content);
  }

  private buildObservedElementDescriptions(items: Array<Record<string, unknown>>): string[] {
    return this.recorderObservationService.buildObservedElementDescriptions(items);
  }

  private async reportRecorderDebugError(input: {
    session: RecorderDebugSession;
    sourceStage: string;
    errorType: string;
    errorMessage: string;
    inputText?: string;
    observation?: RecorderDebugObservation;
    commands?: BrowserCommand[];
    execution?: BrowserExecuteResponse;
  }): Promise<void> {
    await this.browserSemanticsClient.createErrorLog({
      domain_code: 'browser_recorder',
      source: 'recorder_debug',
      error_type: input.errorType,
      error_message: input.errorMessage,
      input_text: input.inputText,
      session_id: input.session.sessionId,
      task_id: input.session.runtimeSessionId,
      page_url: input.observation?.currentPageUrl || input.session.currentPageUrl,
      page_title: input.observation?.title,
      host: this.extractHostFromUrl(input.observation?.currentPageUrl || input.session.currentPageUrl),
      page_type: this.inferRecorderPageType(input.observation),
      observation_summary: this.buildRecorderObservationSummary(input.observation),
      candidate_summary: input.observation
        ? {
            candidate_count: input.observation.candidates?.length || 0,
            candidate_ids: (input.observation.candidates || []).map((candidate) => candidate.candidateId),
            input_count: input.observation.inputs.length,
            button_count: input.observation.buttons.length,
          }
        : undefined,
      parser_output:
        input.commands || input.execution
          ? {
              commands: input.commands,
              execution_message: input.execution?.message,
              execution_steps: input.execution?.steps,
            }
          : undefined,
      metadata: {
        source_stage: input.sourceStage,
        backend: input.session.backend,
      },
    });
  }

  private buildRecorderObservationSummary(observation?: RecorderDebugObservation): string | undefined {
    return this.recorderDebugObservationFacade.buildRecorderObservationSummary(observation);
  }

  private inferRecorderPageType(observation?: RecorderDebugObservation): string | undefined {
    return this.recorderDebugObservationFacade.inferRecorderPageType(observation);
  }

  private extractHostFromUrl(url?: string): string | undefined {
    if (!url?.trim()) {
      return undefined;
    }

    try {
      return new URL(url).hostname || undefined;
    } catch {
      return undefined;
    }
  }

  private async tryHandleNavigateThenActionChat(input: {
    session: RecorderDebugSession;
    observation: RecorderDebugObservation;
    effectiveMessage: string;
    controlTokenState: RecorderControlTokenState;
    request: RecorderDebugChatRequest;
  }): Promise<RecorderDebugChatResponse | null> {
    const stagedMessage = this.recorderDebugChatExecutionService.splitNavigateThenActionMessage(
      input.effectiveMessage
    );
    if (!stagedMessage) {
      return null;
    }

    const navigateParsed = await this.browserCommandService.parseCommand({
      input: stagedMessage.navigateMessage,
      context: this.recorderDebugChatExecutionService.buildBrowserCommandParseContext({
        session: input.session,
        observation: input.observation,
        controlTokenState: input.controlTokenState,
        buildObservedElementDescriptions: (items) => this.buildObservedElementDescriptions(items),
        buildRecorderControlHints: (session, state) => this.buildRecorderControlHints(session, state),
      }),
    });
    if (
      !navigateParsed.success ||
      navigateParsed.commands.length === 0 ||
      navigateParsed.commands.some((command) => command.tool !== 'navigate')
    ) {
      return null;
    }

    // v4.1 P0 fix: the staged navigate step executes directly via executeBrowserCommands,
    // bypassing executeAndResolve. Call prepareExecution so it gets the same pre-action
    // state capture + executionIndex assignment as the main path — otherwise rollback
    // can't match the navigate command to an execution step.
    const navigateExecutionIndex =
      await this.recorderDebugChatExecutionService.prepareExecution(input.session);

    const navigateExecution = await this.executeBrowserCommands(input.session, navigateParsed.commands, {
      appendDefaultWait: true,
    });
    const postNavigateObservation = navigateExecution.success
      ? await this.observePageSafely(
          input.session,
          this.mergeObservationWithExecution(input.observation, navigateExecution)
        )
      : this.mergeObservationWithExecution(input.observation, navigateExecution);

    this.recorderDebugSessionFacade.syncObservationToSession(
      input.session,
      postNavigateObservation
    );
    // v4.1 P0 fix: stamp executionIndex onto navigate commands so rollback's persist
    // scan and command filter can match them to this execution step.
    const preNavigatePushCount = input.session.executedCommands.length;
    input.session.executedCommands.push(
      ...(navigateExecution.executedCommands || navigateParsed.commands)
    );
    this.recorderDebugChatExecutionService.stampExecutionIndex(
      input.session,
      navigateExecutionIndex,
      preNavigatePushCount
    );

    if (!navigateExecution.success) {
      await this.reportRecorderDebugError({
        session: input.session,
        sourceStage: 'staged-navigate-execution',
        errorType: 'STAGED_NAVIGATE_FAILED',
        errorMessage:
          navigateExecution.message ||
          this.recorderDebugChatSupportService.extractExecutionError(navigateExecution) ||
          '导航失败',
        inputText: stagedMessage.navigateMessage,
        observation: input.observation,
        commands: navigateParsed.commands,
        execution: navigateExecution,
      });
      this.recorderDebugSessionFacade.applyRecorderControlTokensAfterExecution(
        input.session,
        input.controlTokenState
      );
      return this.recorderDebugResponseService.createAndRecordChatResponse({
        session: input.session,
        reply: `${navigateParsed.explanation}\n执行失败：${
          navigateExecution.message ||
          this.recorderDebugChatSupportService.extractExecutionError(navigateExecution) ||
          '导航失败'
        }`,
        status: 'executed',
        userGoal: input.effectiveMessage,
        beforeObservation: input.observation,
        observation: postNavigateObservation,
        commands: navigateParsed.commands,
        execution: navigateExecution,
        controlTokenState: input.controlTokenState,
        executionIndex: navigateExecutionIndex,
      });
    }

    const followUpFlow = await this.recorderDebugChatFlowService.resolveFlow({
      session: input.session,
      observation: postNavigateObservation,
      effectiveMessage: stagedMessage.followUpMessage,
      availableInputs: this.buildObservedElementDescriptions(postNavigateObservation.inputs),
      availableButtons: this.buildObservedElementDescriptions(postNavigateObservation.buttons),
      controlHints: this.buildRecorderControlHints(input.session, input.controlTokenState),
      parseCommand: async (parseRequest) => this.browserCommandService.parseCommand(parseRequest),
    });
    const followUpParsed = followUpFlow.parsed;
    const combinedCommands = [...navigateParsed.commands, ...followUpParsed.commands];
    const navigationPreface = '已先打开目标页面。';

    if (followUpFlow.kind === 'execute') {
      const executionOutcome = await this.recorderDebugChatExecutionService.executeAndResolve({
        session: input.session,
        effectiveMessage: stagedMessage.followUpMessage,
        parsed: followUpParsed,
        observation: postNavigateObservation,
        controlTokenState: input.controlTokenState,
        // v4.1 P0 Issue #3: reuse the navigate's executionIndex so the whole staged
        // flow (navigate + follow-up) shares one execution slot. This avoids the
        // divergence where navigate commands get index N but the assistant turn gets
        // index N+1, causing rollback to delete the turn while leaving navigate commands.
        preAssignedExecutionIndex: navigateExecutionIndex,
        executeBrowserCommands: async (currentSession, commands, options) =>
          this.executeBrowserCommands(currentSession, commands, options),
        observePageSafely: async (currentSession, fallback) =>
          this.observePageSafely(currentSession, fallback),
        parseRecoveryCommand: async ({ input: recoveryInput, observation, failureContext }) =>
          this.browserCommandService.parseCommand({
            input: recoveryInput,
            context: {
              forceAI: true,
              currentPageUrl: observation.currentPageUrl || input.session.currentPageUrl,
              backend: input.session.backend,
              lastObservationText: observation.text,
              availableInputs: this.buildObservedElementDescriptions(observation.inputs),
              availableButtons: this.buildObservedElementDescriptions(observation.buttons),
              availableCandidates: observation.candidates || [],
              controlHints: this.buildRecorderControlHints(input.session, input.controlTokenState),
              lastFailureContext: failureContext,
            },
          }),
        mergeObservationWithExecution: (currentObservation, execution) =>
          this.mergeObservationWithExecution(currentObservation, execution),
        applyRecorderControlTokensAfterExecution: (currentSession, state) =>
          this.recorderDebugSessionFacade.applyRecorderControlTokensAfterExecution(
            currentSession,
            state
          ),
      });
      const mergedExecution = this.recorderDebugChatExecutionService.mergeBrowserExecuteResponses(
        navigateExecution,
        executionOutcome.execution
      );
      if (executionOutcome.kind === 'ambiguous') {
        return this.recorderDebugResponseService.createAndRecordChatResponse({
          session: input.session,
          reply: `${navigationPreface}\n${executionOutcome.reply}`,
          status: 'question',
          userGoal: input.effectiveMessage,
          beforeObservation: input.observation,
          observation: executionOutcome.nextObservation,
          commands: combinedCommands,
          execution: mergedExecution,
          controlTokenState: input.controlTokenState,
          executionIndex: (executionOutcome as { executionIndex?: number }).executionIndex,
        });
      }

      return this.recorderDebugResponseService.createAndRecordChatResponse({
        session: input.session,
        reply: `${navigationPreface}\n${executionOutcome.reply}`,
        status: 'executed',
        userGoal: input.effectiveMessage,
        beforeObservation: input.observation,
        observation: executionOutcome.nextObservation,
        commands: combinedCommands,
        execution: mergedExecution,
        controlTokenState: input.controlTokenState,
        executionIndex: (executionOutcome as { executionIndex?: number }).executionIndex,
      });
    }

    this.recorderDebugSessionFacade.applyRecorderControlTokensAfterExecution(
      input.session,
      input.controlTokenState
    );

    if (followUpFlow.kind === 'export') {
      const exportArtifacts =
        (await this.recorderExportAssemblyService.buildExportArtifacts(
          input.session,
          stagedMessage.followUpMessage
        )) as unknown as RecorderDebugExportArtifacts;
      return this.recorderDebugResponseService.createAndRecordChatResponse({
        session: input.session,
        reply: `${navigationPreface}\n已根据当前对话与执行历史生成 CLI 脚本和内部 skill 草稿。`,
        status: 'completed',
        userGoal: input.effectiveMessage,
        beforeObservation: input.observation,
        observation: postNavigateObservation,
        commands: combinedCommands,
        execution: navigateExecution,
        exportArtifacts,
        controlTokenState: input.controlTokenState,
        executionIndex: navigateExecutionIndex,
      });
    }

    if (followUpFlow.kind === 'blocked' || followUpFlow.kind === 'confirmation_required') {
      return this.recorderDebugResponseService.createAndRecordChatResponse({
        session: input.session,
        reply: `${navigationPreface}\n${followUpFlow.reply}`,
        status: 'question',
        userGoal: input.effectiveMessage,
        beforeObservation: input.observation,
        observation: postNavigateObservation,
        commands: combinedCommands,
        execution: navigateExecution,
        controlTokenState: input.controlTokenState,
        executionIndex: navigateExecutionIndex,
      });
    }

    if (followUpFlow.kind === 'observation') {
      const reply = await this.describePage(
        stagedMessage.followUpMessage,
        postNavigateObservation,
        input.request.userRoles || [],
        input.request.modelId
      );
      return this.recorderDebugResponseService.createAndRecordChatResponse({
        session: input.session,
        reply: `${navigationPreface}\n${reply}`,
        status: 'answer',
        userGoal: input.effectiveMessage,
        beforeObservation: input.observation,
        observation: postNavigateObservation,
        commands: combinedCommands,
        execution: navigateExecution,
        controlTokenState: input.controlTokenState,
        executionIndex: navigateExecutionIndex,
      });
    }

    return this.recorderDebugResponseService.createAndRecordChatResponse({
      session: input.session,
      reply: `${navigationPreface}\n${this.recorderDebugChatSupportService.buildClarificationReply(
        postNavigateObservation
      )}`,
      status: 'question',
      userGoal: input.effectiveMessage,
      beforeObservation: input.observation,
      observation: postNavigateObservation,
      commands: combinedCommands,
      execution: navigateExecution,
      controlTokenState: input.controlTokenState,
      executionIndex: navigateExecutionIndex,
    });
  }

  buildCandidatesAndTrace(observation: RecorderDebugObservation): {
    candidates: BrowserCommandCandidate[];
    trace: Array<{
      candidateId: string;
      source: string;
      kind: string;
      reasons: string[];
      summary: string;
    }>;
  } {
    return this.recorderObservationService.buildCandidatesAndTrace(observation);
  }

  private async describePage(
    userMessage: string,
    observation: RecorderDebugObservation,
    userRoles: string[],
    modelId?: string
  ): Promise<string> {
    return this.recorderDebugObservationFacade.describePage({
      userMessage,
      observation,
      userRoles,
      modelId,
    });
  }

  private async handleConditionalBranchChat(input: {
    session: RecorderDebugSession;
    observation: RecorderDebugObservation;
    effectiveMessage: string;
    controlTokenState: RecorderControlTokenState;
  }): Promise<RecorderDebugChatResponse> {
    return this.recorderDebugBranchFacade.handleConditionalBranchChat({
      ...input,
      ackReply: this.buildControlTokenAckReply(input.session, input.controlTokenState),
      executeBrowserCommands: (session, commands, options) =>
        this.executeBrowserCommands(session, commands, options),
      observePageSafely: (session, fallback) => this.observePageSafely(session, fallback),
      parseRecoveryCommand: ({ input: recoveryInput, observation, failureContext }) =>
        this.browserCommandService.parseCommand({
          input: recoveryInput,
          context: {
            ...this.recorderDebugChatExecutionService.buildBrowserCommandParseContext({
              session: input.session,
              observation,
              controlTokenState: input.controlTokenState,
              buildObservedElementDescriptions: (items) => this.buildObservedElementDescriptions(items),
              buildRecorderControlHints: (session, state) =>
                this.buildRecorderControlHints(session, state),
            }),
            forceAI: true,
            lastFailureContext: failureContext,
          },
        }),
      mergeObservationWithExecution: (currentObservation, execution) =>
        this.mergeObservationWithExecution(currentObservation, execution),
    }) as Promise<RecorderDebugChatResponse>;
  }

  inferSuggestedParameters(
    observation: Pick<RecorderDebugObservation, 'inputs' | 'buttons' | 'title' | 'text'>
  ): Array<{ name: string; label: string; required: boolean; reason: string }> {
    return this.recorderObservationService.inferSuggestedParameters(observation);
  }
}
