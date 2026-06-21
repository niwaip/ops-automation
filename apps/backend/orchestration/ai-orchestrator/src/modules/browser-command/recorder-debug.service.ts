import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getBrowserWorkerUrl } from '../../config/service-endpoints';
import type { BrowserCommand, BrowserCommandCandidate } from './browser-command.types';
import {
  BrowserCommandService,
} from './browser-command.service';
import { BrowserActionRiskLevel } from './browser-action-validator.service';
import {
  ExecutionReconcileService,
  ReconcileAfterTakeoverRequest,
  ReconcileAfterTakeoverResponse,
} from './execution-reconcile.service';
import { ModelService } from '../model/model.service';
import { RecorderLoopService } from './recorder-loop.service';
import { RecorderExportAssemblyService } from './recorder-export-assembly.service';
import { RecorderDebugChatSupportService } from './recorder-debug-chat-support.service';
import { RecorderDebugChatExecutionService } from './recorder-debug-chat-execution.service';
import { RecorderDebugChatFlowService } from './recorder-debug-chat-flow.service';
import { RecorderDebugExecutionService } from './recorder-debug-execution.service';
import { RecorderDebugObservationRefreshService } from './recorder-debug-observation-refresh.service';
import { RecorderDebugResponseService } from './recorder-debug-response.service';
import { RecorderDebugSessionCoordinatorService } from './recorder-debug-session-coordinator.service';
import { RecorderConditionalBranchService } from './recorder-conditional-branch.service';
import { RecorderObservationService } from './recorder-observation.service';
import { SnapshotNode, SnapshotResolutionState } from './recorder-snapshot.service';
import type {
  RecorderLoopRuntimeStateLike,
  RecorderManualInterventionRecord,
  RecorderManualInterventionToken,
} from './recorder-loop.types';

export type RecorderDebugBackend = 'cli' | 'chrome-devtools' | 'mcp';
export type RecorderDebugTurnRole = 'user' | 'assistant' | 'system';

export interface BrowserExecuteResponse {
  success: boolean;
  results: Array<Record<string, any>>;
  message?: string;
  steps?: Array<Record<string, any>>;
  executedCommands?: BrowserCommand[];
}

interface BrowserInitResponse {
  success: boolean;
  message: string;
}

interface RecorderDebugDisambiguationCandidate {
  index: number;
  ref: string;
  role?: string;
  text: string;
}

interface RecorderDebugPendingDisambiguation {
  command: BrowserCommand;
  targetLabel: string;
  candidates: RecorderDebugDisambiguationCandidate[];
}

interface RecorderDebugPendingRiskConfirmation {
  commands: BrowserCommand[];
  explanation: string;
  riskLevel: BrowserActionRiskLevel;
  reason: string;
}

export interface RecorderDebugObservation {
  currentPageUrl?: string;
  title?: string;
  text?: string;
  inputs: Array<Record<string, unknown>>;
  buttons: Array<Record<string, unknown>>;
  rows?: Array<Record<string, unknown>>;
  regions?: Array<Record<string, unknown>>;
  pageSemantics?: Record<string, unknown>;
  candidates?: BrowserCommandCandidate[];
  candidateTrace?: Array<{
    candidateId: string;
    source: string;
    kind: string;
    reasons: string[];
    summary: string;
  }>;
  headings: string[];
  links: string[];
  suggestedParameters: Array<{
    name: string;
    label: string;
    required: boolean;
    reason: string;
  }>;
  snapshotPath?: string;
}

export interface RecorderDebugExportArtifacts {
  script: string;
  guidance: string;
  templateSteps?: RecorderTemplateStepArtifact[];
  loopDraft?: RecorderLoopDraft;
  loopPlanPreview?: Array<Record<string, unknown>>;
  scriptValidation?: {
    syntaxValid: boolean;
    warnings: string[];
  };
  skillDraft: {
    name: string;
    description: string;
    invocation: string;
    parameterOnly: true;
    parameters: Array<{
      name: string;
      description: string;
      required: boolean;
      exampleValue?: string;
      source?: string;
    }>;
    outputs: Array<{
      name: string;
      description: string;
      location: string;
    }>;
    usageNotes: string[];
    usageMarkdown: string;
    publishPayload: {
      name: string;
      description: string;
      triggerKeywords: string[];
      paramsSchema: {
        properties: Record<
          string,
          {
            type: 'string' | 'number' | 'date' | 'boolean';
            description: string;
            required?: boolean;
            default?: string | number | boolean;
            extractionPrompt?: string;
          }
        >;
        required: string[];
      };
      executionFlowTemplateIds: string[];
      executionFlow: Array<Record<string, unknown>>;
      loopPlanPreview?: Array<Record<string, unknown>>;
      tools: string[];
      apiEndpoints: {
        runtimeMetadata: Record<string, unknown>;
      };
    };
    executionPlan: {
      backend: RecorderDebugBackend;
      runtimeSessionId: string;
      commands: BrowserCommand[];
      templateSteps?: RecorderTemplateStepArtifact[];
      loopDraft?: RecorderLoopDraft;
    };
    commands: BrowserCommand[];
  };
}

export interface RecorderDebugTurn {
  role: RecorderDebugTurnRole;
  content: string;
  timestamp: string;
  commands?: BrowserCommand[];
  execution?: BrowserExecuteResponse;
  observation?: RecorderDebugObservation;
  exportArtifacts?: RecorderDebugExportArtifacts;
  loopDraft?: RecorderLoopDraft;
  loopState?: RecorderLoopRuntimeStateLike;
}

export interface RecorderLoopDraft {
  mode: 'repeat_until';
  target: {
    scope: 'current_list' | 'current_table' | 'current_cards';
    regionId?: string;
    currentPageUrl?: string;
    match?: {
      field?: string;
      operator?: 'equals' | 'contains' | 'lt' | 'gt';
      value?: string | number | boolean;
    };
  };
  sampleRow?: {
    rowKey?: string;
    entityType?: string;
    entityId?: string;
    semanticPath?: string[];
  };
  eachIteration?: {
    capturedFromIndex?: number;
    capturedToIndex?: number;
    stepIds: string[];
    stepCount: number;
  };
  stopWhen?: {
    read:
      | { type: 'count' | 'text'; locator: { type: string; value: string } }
      | { type: 'page_signal'; key: string };
    conditionFn: string;
    description: string;
  };
  onNoProgress?: 'takeover' | 'stop';
  maxIterations?: number;
  updatedAt?: string;
}

export interface RecorderLoopDraftRequest {
  sessionId?: string;
  runtimeSessionId?: string;
  backend?: RecorderDebugBackend;
  loopDraft: RecorderLoopDraft;
}

export interface RecorderDebugSession {
  sessionId: string;
  runtimeSessionId: string;
  backend: RecorderDebugBackend;
  browserInitialized: boolean;
  currentPageUrl?: string;
  lastObservation?: RecorderDebugObservation;
  loopDraft?: RecorderLoopDraft;
  pendingLoopCaptureStartCommandIndex?: number;
  manualInterventions?: RecorderManualInterventionRecord[];
  history: RecorderDebugTurn[];
  executedCommands: BrowserCommand[];
  pendingDisambiguation?: RecorderDebugPendingDisambiguation;
  pendingRiskConfirmation?: RecorderDebugPendingRiskConfirmation;
  createdAt: string;
  updatedAt: string;
}

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

interface RecorderTemplateBranchConfig {
  condition_fn: string;
  on_match: 'continue' | 'stop';
  on_mismatch: 'continue' | 'stop' | 'takeover';
  takeover_reason?: string;
  description?: string;
}

interface RecorderTemplateStepArtifact {
  step_id: string;
  action: string;
  locator?: {
    type: string;
    value: string;
  };
  params?: Record<string, string | number>;
  output_var?: string;
  branch?: RecorderTemplateBranchConfig;
  description?: string;
}

export interface RecorderDebugChatRequest {
  sessionId?: string;
  runtimeSessionId?: string;
  message: string;
  backend?: RecorderDebugBackend;
  modelId?: string;
  userRoles?: string[];
}

export interface RecorderDebugChatResponse {
  sessionId: string;
  runtimeSessionId: string;
  reply: string;
  status: 'executed' | 'answer' | 'question' | 'completed';
  browserReady: boolean;
  currentPageUrl?: string;
  observation?: RecorderDebugObservation;
  commands?: BrowserCommand[];
  execution?: BrowserExecuteResponse;
  exportArtifacts?: RecorderDebugExportArtifacts;
  loopDraft?: RecorderLoopDraft;
  loopState?: RecorderLoopRuntimeStateLike;
}

@Injectable()
export class RecorderDebugService {
  private readonly logger = new Logger(RecorderDebugService.name);
  private readonly browserWorkerUrl = getBrowserWorkerUrl();
  private readonly sessionTtlSeconds = parseInt(
    process.env.CHAT_SESSION_TTL_SECONDS || '259200',
    10
  );
  private readonly maxHistory = parseInt(process.env.CHAT_SESSION_MAX_MESSAGES || '20', 10);

  constructor(
    private readonly browserCommandService: BrowserCommandService,
    private readonly modelService: ModelService,
    private readonly recorderConditionalBranchService: RecorderConditionalBranchService,
    private readonly recorderDebugSessionCoordinatorService: RecorderDebugSessionCoordinatorService,
    private readonly executionReconcileService: ExecutionReconcileService,
    private readonly recorderLoopService: RecorderLoopService,
    private readonly recorderExportAssemblyService: RecorderExportAssemblyService,
    private readonly recorderDebugChatSupportService: RecorderDebugChatSupportService,
    private readonly recorderDebugChatFlowService: RecorderDebugChatFlowService,
    private readonly recorderDebugChatExecutionService: RecorderDebugChatExecutionService,
    private readonly recorderDebugExecutionService: RecorderDebugExecutionService,
    private readonly recorderDebugObservationRefreshService: RecorderDebugObservationRefreshService,
    private readonly recorderDebugResponseService: RecorderDebugResponseService,
    private readonly recorderObservationService: RecorderObservationService
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
    const observation = await this.observePageSafely(session);
    session.lastObservation = observation;
    session.currentPageUrl = observation.currentPageUrl || session.currentPageUrl;
    this.applyRecorderControlTokensBeforeExecution(session, controlTokenState, observation);

    const effectiveMessage = controlTokenState.cleanedMessage.trim();
    if (!effectiveMessage && controlTokenState.rawTokens.length > 0) {
      this.applyRecorderControlTokensAfterExecution(session, controlTokenState);
      const reply = this.buildControlTokenAckReply(session, controlTokenState);
      const response = this.recorderDebugResponseService.createAndRecordChatResponse({
        session,
        reply,
        status: 'answer',
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
      const exportArtifacts = await this.buildExportArtifacts(session, effectiveMessage);
      response = this.recorderDebugResponseService.createAndRecordChatResponse({
        session,
        reply: '已根据当前对话与执行历史生成 CLI 脚本和内部 skill 草稿。',
        status: 'completed',
        observation,
        exportArtifacts,
        controlTokenState,
      });
    } else if (flow.kind === 'blocked' || flow.kind === 'confirmation_required') {
      response = this.recorderDebugResponseService.createAndRecordChatResponse({
        session,
        reply: flow.reply,
        status: 'question',
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
          this.applyRecorderControlTokensAfterExecution(currentSession, state),
      });

      if (executionOutcome.kind === 'ambiguous') {
        response = this.recorderDebugResponseService.createAndRecordChatResponse({
          session,
          reply: executionOutcome.reply,
          status: 'question',
          observation: executionOutcome.nextObservation,
          commands: parsed.commands,
          execution: executionOutcome.execution,
          controlTokenState,
        });
      } else {
        response = this.recorderDebugResponseService.createAndRecordChatResponse({
          session,
          reply: executionOutcome.reply,
          status: 'executed',
          observation: executionOutcome.nextObservation,
          commands: parsed.commands,
          execution: executionOutcome.execution,
          controlTokenState,
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
        observation,
        controlTokenState,
      });
    } else {
      const reply = this.recorderDebugChatSupportService.buildClarificationReply(observation);
      response = this.recorderDebugResponseService.createAndRecordChatResponse({
        session,
        reply,
        status: 'question',
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
  ) {
    const sessionId = request.sessionId || `recorder-debug-${Date.now()}`;
    const session = await this.loadOrCreateSession(sessionId, request);
    const exportArtifacts = await this.buildExportArtifacts(
      session,
      request.userGoal || '浏览器调试任务'
    );
    this.recorderDebugResponseService.pushAssistantTurn(session, {
      reply: '已导出 CLI 脚本和内部 skill 草稿。',
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
    await this.recorderDebugSessionCoordinatorService.deleteSession(sessionId);
  }

  async upsertLoopDraft(request: RecorderLoopDraftRequest): Promise<{
    sessionId: string;
    runtimeSessionId: string;
    loopDraft: RecorderLoopDraft;
  }> {
    return this.recorderDebugSessionCoordinatorService.upsertLoopDraft<
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
    await this.recorderDebugSessionCoordinatorService.clearLoopDraft({
      sessionId,
      ttlSeconds: this.sessionTtlSeconds,
    });
  }

  async getSession(sessionId: string): Promise<RecorderDebugSession> {
    return this.recorderDebugSessionCoordinatorService.getSessionOrThrow<RecorderDebugSession>(
      sessionId
    );
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
    const failedIndex = failedCommand
      ? originalCommands.findIndex((command) => {
          if (command.tool !== failedCommand.tool) {
            return false;
          }
          if (command.description && failedCommand.description) {
            return command.description === failedCommand.description;
          }
          return (
            JSON.stringify(command.params || {}) === JSON.stringify(failedCommand.params || {})
          );
        })
      : -1;

    const mappedPatchCommands: BrowserCommand[] = [];
    for (const step of patchSteps) {
      if (step.action === 'navigate' && typeof step.params?.url === 'string') {
        mappedPatchCommands.push({
          tool: 'navigate',
          params: { url: step.params.url },
          description: step.scriptFragment || '手动补录导航',
        });
        continue;
      }
      if (step.action === 'click') {
        mappedPatchCommands.push({
          tool: 'click',
          params: { ...(step.params || {}) },
          description: step.scriptFragment || '手动补录点击',
        });
        continue;
      }
      if (step.action === 'hover') {
        mappedPatchCommands.push({
          tool: 'hover',
          params: { ...(step.params || {}) },
          description: step.scriptFragment || '手动补录悬停',
        });
        continue;
      }
      if (step.action === 'fill' && step.params?.value !== undefined) {
        mappedPatchCommands.push({
          tool: 'fill',
          params: { ...(step.params || {}) },
          description: step.scriptFragment || '手动补录输入',
        });
        continue;
      }
      if (
        (step.action === 'press' || step.action === 'press_key') &&
        typeof step.params?.key === 'string'
      ) {
        mappedPatchCommands.push({
          tool: 'press_key',
          params: { key: step.params.key },
          description: step.scriptFragment || '手动补录按键',
        });
        continue;
      }
      if (step.action === 'switch_latest_tab' || step.action === 'focus_latest_page') {
        mappedPatchCommands.push({
          tool: 'switch_latest_tab',
          params: {},
          description: step.scriptFragment || '手动补录切换最新标签页',
        });
      }
    }

    if (failedIndex < 0) {
      return [...mappedPatchCommands, ...originalCommands];
    }

    return [
      ...originalCommands.slice(0, failedIndex),
      ...mappedPatchCommands,
      ...originalCommands.slice(failedIndex + 1),
    ];
  }

  private async loadOrCreateSession(
    sessionId: string,
    request: Omit<RecorderDebugChatRequest, 'message'>
  ): Promise<RecorderDebugSession> {
    return this.recorderDebugSessionCoordinatorService.loadOrCreateSession<
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
    return this.recorderDebugSessionCoordinatorService.loadSession<RecorderDebugSession>(sessionId);
  }

  private async saveSession(session: RecorderDebugSession): Promise<void> {
    await this.recorderDebugSessionCoordinatorService.saveSession(session, this.sessionTtlSeconds);
  }

  private extractRecorderControlTokens(message: string): RecorderControlTokenState {
    return this.recorderLoopService.extractRecorderControlTokens(
      message
    ) as RecorderControlTokenState;
  }

  private applyRecorderControlTokensBeforeExecution(
    session: RecorderDebugSession,
    state: RecorderControlTokenState,
    observation?: RecorderDebugObservation
  ): void {
    this.recorderLoopService.applyRecorderControlTokensBeforeExecution(session, state, observation);
  }

  private applyRecorderControlTokensAfterExecution(
    session: RecorderDebugSession,
    state: RecorderControlTokenState
  ): void {
    this.recorderLoopService.applyRecorderControlTokensAfterExecution(session, state);
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
    if (session.browserInitialized) {
      return;
    }

    const response = await axios.post<BrowserInitResponse>(
      `${this.browserWorkerUrl}/browser/init`,
      {
        backend: session.backend,
        runtimeSessionId: session.runtimeSessionId,
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

    session.browserInitialized = response.data.success;
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
    fallback?: RecorderDebugObservation
  ): Promise<RecorderDebugObservation> {
    return this.recorderDebugObservationRefreshService.observePageSafely({
      session,
      fallback,
      observePage: async (currentSession) => this.observePage(currentSession),
      onObserveFailed: ({ session: failedSession, errorMessage }) => {
        this.logger.warn(
          `observePage failed for session ${failedSession.sessionId}: ${errorMessage}`
        );
      },
    });
  }

  private mergeObservationWithExecution(
    observation: RecorderDebugObservation,
    execution: BrowserExecuteResponse
  ): RecorderDebugObservation {
    return this.recorderDebugExecutionService.mergeObservationWithExecution(observation, execution);
  }

  private async refreshObservationAfterExecution(session: RecorderDebugSession): Promise<void> {
    await this.recorderDebugObservationRefreshService.refreshObservationAfterExecution({
      session,
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

  private async tryHandleNavigateThenActionChat(input: {
    session: RecorderDebugSession;
    observation: RecorderDebugObservation;
    effectiveMessage: string;
    controlTokenState: RecorderControlTokenState;
    request: RecorderDebugChatRequest;
  }): Promise<RecorderDebugChatResponse | null> {
    const stagedMessage = this.splitNavigateThenActionMessage(input.effectiveMessage);
    if (!stagedMessage) {
      return null;
    }

    const navigateParsed = await this.browserCommandService.parseCommand({
      input: stagedMessage.navigateMessage,
      context: this.buildBrowserCommandParseContext(
        input.session,
        input.observation,
        input.controlTokenState
      ),
    });
    if (
      !navigateParsed.success ||
      navigateParsed.commands.length === 0 ||
      navigateParsed.commands.some((command) => command.tool !== 'navigate')
    ) {
      return null;
    }

    const navigateExecution = await this.executeBrowserCommands(input.session, navigateParsed.commands, {
      appendDefaultWait: true,
    });
    const postNavigateObservation = navigateExecution.success
      ? await this.observePageSafely(
          input.session,
          this.mergeObservationWithExecution(input.observation, navigateExecution)
        )
      : this.mergeObservationWithExecution(input.observation, navigateExecution);

    input.session.lastObservation = postNavigateObservation;
    input.session.currentPageUrl =
      postNavigateObservation.currentPageUrl || input.session.currentPageUrl;
    input.session.executedCommands.push(
      ...(navigateExecution.executedCommands || navigateParsed.commands)
    );

    if (!navigateExecution.success) {
      this.applyRecorderControlTokensAfterExecution(input.session, input.controlTokenState);
      return this.recorderDebugResponseService.createAndRecordChatResponse({
        session: input.session,
        reply: `${navigateParsed.explanation}\n执行失败：${
          navigateExecution.message ||
          this.recorderDebugChatSupportService.extractExecutionError(navigateExecution) ||
          '导航失败'
        }`,
        status: 'executed',
        observation: postNavigateObservation,
        commands: navigateParsed.commands,
        execution: navigateExecution,
        controlTokenState: input.controlTokenState,
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
          this.applyRecorderControlTokensAfterExecution(currentSession, state),
      });
      const mergedExecution = this.mergeBrowserExecuteResponses(
        navigateExecution,
        executionOutcome.execution
      );
      if (executionOutcome.kind === 'ambiguous') {
        return this.recorderDebugResponseService.createAndRecordChatResponse({
          session: input.session,
          reply: `${navigationPreface}\n${executionOutcome.reply}`,
          status: 'question',
          observation: executionOutcome.nextObservation,
          commands: combinedCommands,
          execution: mergedExecution,
          controlTokenState: input.controlTokenState,
        });
      }

      return this.recorderDebugResponseService.createAndRecordChatResponse({
        session: input.session,
        reply: `${navigationPreface}\n${executionOutcome.reply}`,
        status: 'executed',
        observation: executionOutcome.nextObservation,
        commands: combinedCommands,
        execution: mergedExecution,
        controlTokenState: input.controlTokenState,
      });
    }

    this.applyRecorderControlTokensAfterExecution(input.session, input.controlTokenState);

    if (followUpFlow.kind === 'export') {
      const exportArtifacts = await this.buildExportArtifacts(
        input.session,
        stagedMessage.followUpMessage
      );
      return this.recorderDebugResponseService.createAndRecordChatResponse({
        session: input.session,
        reply: `${navigationPreface}\n已根据当前对话与执行历史生成 CLI 脚本和内部 skill 草稿。`,
        status: 'completed',
        observation: postNavigateObservation,
        commands: combinedCommands,
        execution: navigateExecution,
        exportArtifacts,
        controlTokenState: input.controlTokenState,
      });
    }

    if (followUpFlow.kind === 'blocked' || followUpFlow.kind === 'confirmation_required') {
      return this.recorderDebugResponseService.createAndRecordChatResponse({
        session: input.session,
        reply: `${navigationPreface}\n${followUpFlow.reply}`,
        status: 'question',
        observation: postNavigateObservation,
        commands: combinedCommands,
        execution: navigateExecution,
        controlTokenState: input.controlTokenState,
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
        observation: postNavigateObservation,
        commands: combinedCommands,
        execution: navigateExecution,
        controlTokenState: input.controlTokenState,
      });
    }

    return this.recorderDebugResponseService.createAndRecordChatResponse({
      session: input.session,
      reply: `${navigationPreface}\n${this.recorderDebugChatSupportService.buildClarificationReply(
        postNavigateObservation
      )}`,
      status: 'question',
      observation: postNavigateObservation,
      commands: combinedCommands,
      execution: navigateExecution,
      controlTokenState: input.controlTokenState,
    });
  }

  private splitNavigateThenActionMessage(
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

  private buildBrowserCommandParseContext(
    session: RecorderDebugSession,
    observation: RecorderDebugObservation,
    controlTokenState: RecorderControlTokenState
  ): Record<string, unknown> {
    return {
      currentPageUrl: session.currentPageUrl,
      backend: session.backend,
      lastObservationText: observation.text,
      availableInputs: this.buildObservedElementDescriptions(observation.inputs),
      availableButtons: this.buildObservedElementDescriptions(observation.buttons),
      availableCandidates: observation.candidates || [],
      controlHints: this.buildRecorderControlHints(session, controlTokenState),
    };
  }

  private mergeBrowserExecuteResponses(
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
      executedCommands: [
        ...(first.executedCommands || []),
        ...(second.executedCommands || []),
      ],
    };

    if (!merged.steps?.length) {
      delete merged.steps;
    }
    if (!merged.executedCommands?.length) {
      delete merged.executedCommands;
    }

    return merged;
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
    const structuredSummary = this.buildObservationSummary(observation);
    const preferredModel =
      modelId ||
      this.modelService.getPreferredDefaultModel({
        mode: 'chat',
        userRoles,
      })?.id;

    if (!preferredModel) {
      return structuredSummary;
    }

    try {
      const response = await this.modelService.callModel(
        preferredModel,
        [
          'You are helping a user debug a React page through browser observations.',
          'Answer in concise Chinese.',
          'If the user asks what parameters are needed, focus on the visible inputs, buttons, and current page context.',
          `User question: ${userMessage}`,
          `Page observation:\n${structuredSummary}`,
        ].join('\n\n')
      );
      return response.content || structuredSummary;
    } catch (error) {
      this.logger.warn(
        `Failed to generate recorder debug description: ${error instanceof Error ? error.message : 'unknown error'}`
      );
      return structuredSummary;
    }
  }

  private buildObservationSummary(observation: RecorderDebugObservation): string {
    return this.recorderObservationService.buildObservationSummary(observation);
  }

  private async handleConditionalBranchChat(input: {
    session: RecorderDebugSession;
    observation: RecorderDebugObservation;
    effectiveMessage: string;
    controlTokenState: RecorderControlTokenState;
  }): Promise<RecorderDebugChatResponse> {
    const ackReply = this.buildControlTokenAckReply(input.session, input.controlTokenState);
    const planned = await this.recorderConditionalBranchService.plan({
      runtimeSessionId: input.session.runtimeSessionId,
      currentPageUrl: input.session.currentPageUrl,
      effectiveMessage: input.effectiveMessage,
      observation: input.observation,
      executeBrowserCommands: async (commands, options) =>
        this.executeBrowserCommands(input.session, commands, {
          timeoutMs: options?.timeoutMs,
          skipValidation: options?.skipValidation,
        }),
    });

    if (!planned.command) {
      const reply = [
        ackReply,
        `已记录条件说明：${input.effectiveMessage}`,
        planned.matched === false
          ? '当前页面未命中条件，本轮先不执行承认动作，导出时仍会保留条件分支。'
          : planned.matched === null
            ? '当前页面暂时无法可靠判断条件是否命中，本轮先保留条件分支，不直接执行浏览器动作。'
            : '当前页面缺少可立即执行的下一步动作，本轮先保留条件分支，导出时继续生成 branch。',
      ].join('\n');
      return this.recorderDebugResponseService.createAndRecordChatResponse({
        session: input.session,
        reply,
        status: 'answer',
        observation: input.observation,
        controlTokenState: input.controlTokenState,
      });
    }

    const parsed = {
      success: true,
      commands: [planned.command],
      explanation: `已记录条件分歧；当前页面命中条件，继续执行：${planned.command.description || '下一步动作'}`,
    };
    const executionOutcome = await this.recorderDebugChatExecutionService.executeAndResolve({
      session: input.session,
      effectiveMessage: input.effectiveMessage,
      parsed,
      observation: input.observation,
      controlTokenState: input.controlTokenState,
      executeBrowserCommands: async (currentSession, commands, options) =>
        this.executeBrowserCommands(currentSession, commands, {
          ...options,
          skipValidation: true,
        }),
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
        this.applyRecorderControlTokensAfterExecution(currentSession, state),
    });

    const replyPrefix = `${ackReply}\n已记录条件说明：${input.effectiveMessage}`;
    if (executionOutcome.kind === 'ambiguous') {
      return this.recorderDebugResponseService.createAndRecordChatResponse({
        session: input.session,
        reply: `${replyPrefix}\n${executionOutcome.reply}`,
        status: 'question',
        observation: executionOutcome.nextObservation,
        commands: parsed.commands,
        execution: executionOutcome.execution,
        controlTokenState: input.controlTokenState,
      });
    }

    return this.recorderDebugResponseService.createAndRecordChatResponse({
      session: input.session,
      reply: `${replyPrefix}\n${executionOutcome.reply}`,
      status: 'executed',
      observation: executionOutcome.nextObservation,
      commands: parsed.commands,
      execution: executionOutcome.execution,
      controlTokenState: input.controlTokenState,
    });
  }

  private async buildExportArtifacts(
    session: RecorderDebugSession,
    userGoal: string
  ): Promise<RecorderDebugExportArtifacts> {
    return this.recorderExportAssemblyService.buildExportArtifacts(
      session,
      userGoal
    ) as unknown as Promise<RecorderDebugExportArtifacts>;
  }

  inferSuggestedParameters(
    observation: Pick<RecorderDebugObservation, 'inputs' | 'buttons' | 'title' | 'text'>
  ): Array<{ name: string; label: string; required: boolean; reason: string }> {
    return this.recorderObservationService.inferSuggestedParameters(observation);
  }
}
