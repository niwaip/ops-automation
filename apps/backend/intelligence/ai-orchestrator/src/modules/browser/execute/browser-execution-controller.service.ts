import { Injectable } from '@nestjs/common';
import { BrowserSemanticsClient } from '../../../client/browser-semantics.client';
import { RecorderDebugChatSupportService } from './recorder-debug-chat-support.service';
import type { BrowserExecuteResponse, RecorderDebugObservation } from './recorder-debug.types';
import type { RecorderManualInterventionToken } from '../loop';
import type {
  BrowserCommand,
  BrowserCommandFailureContext,
  ParseBrowserCommandResponse,
} from '../intent';

export type RecorderControlTokenStateLike = {
  cleanedMessage: string;
  rawTokens: string[];
  loopTargetScope?: 'current_list' | 'current_table' | 'current_cards';
  hasLoopStart: boolean;
  hasLoopEnd: boolean;
  hasConditionalBranch: boolean;
  manualInterventions: RecorderManualInterventionToken[];
  manualInterventionLabels: string[];
};

export type RecorderDebugExecutionSessionLike = {
  sessionId?: string;
  runtimeSessionId?: string;
  backend?: string;
  currentPageUrl?: string;
  lastObservation?: RecorderDebugObservation;
  executedCommands: BrowserCommand[];
  pendingDisambiguation?: unknown;
};

export type RecorderDebugChatExecutionOutcome =
  | {
      kind: 'ambiguous';
      reply: string;
      pending: unknown;
      execution: BrowserExecuteResponse;
      nextObservation: RecorderDebugObservation;
    }
  | {
      kind: 'completed';
      reply: string;
      execution: BrowserExecuteResponse;
      nextObservation: RecorderDebugObservation;
    };

export type BrowserExecutionControllerInput<TSession extends RecorderDebugExecutionSessionLike> = {
  session: TSession;
  effectiveMessage: string;
  parsed: ParseBrowserCommandResponse;
  observation: RecorderDebugObservation;
  controlTokenState: RecorderControlTokenStateLike;
  executeBrowserCommands: (
    session: TSession,
    commands: BrowserCommand[],
    options?: { appendDefaultWait?: boolean; timeoutMs?: number; skipValidation?: boolean }
  ) => Promise<BrowserExecuteResponse>;
  observePageSafely: (
    session: TSession,
    fallback?: RecorderDebugObservation
  ) => Promise<RecorderDebugObservation>;
  parseRecoveryCommand?: (request: {
    input: string;
    observation: RecorderDebugObservation;
    failureContext: BrowserCommandFailureContext;
  }) => Promise<ParseBrowserCommandResponse>;
  mergeObservationWithExecution: (
    observation: RecorderDebugObservation,
    execution: BrowserExecuteResponse
  ) => RecorderDebugObservation;
  applyRecorderControlTokensAfterExecution: (
    session: TSession,
    state: RecorderControlTokenStateLike
  ) => void;
};

@Injectable()
export class BrowserExecutionControllerService {
  constructor(
    private readonly recorderDebugChatSupportService: RecorderDebugChatSupportService,
    private readonly browserSemanticsClient: BrowserSemanticsClient
  ) {}

  async executeAndResolve<TSession extends RecorderDebugExecutionSessionLike>(
    input: BrowserExecutionControllerInput<TSession>
  ): Promise<RecorderDebugChatExecutionOutcome> {
    let effectiveParsed = input.parsed;
    const preflightRecoveryParsed = await this.buildPreflightRecoveryParsed(input);
    if (preflightRecoveryParsed) {
      effectiveParsed = preflightRecoveryParsed;
    }

    let initialExecution = await input.executeBrowserCommands(input.session, effectiveParsed.commands, {
      appendDefaultWait: true,
    });
    let nextObservation = await input.observePageSafely(
      input.session,
      input.mergeObservationWithExecution(input.observation, initialExecution)
    );
    initialExecution = this.reconcileNavigationExecution(
      initialExecution,
      effectiveParsed.commands,
      nextObservation
    );
    await this.reportExecutionFailure({
      stage: 'initial-execution',
      session: input.session,
      effectiveMessage: input.effectiveMessage,
      parsed: effectiveParsed,
      observation: input.observation,
      execution: initialExecution,
    });
    let effectiveExecution = initialExecution;

    const retryDecision = this.buildRetryDecision(initialExecution);

    if (!initialExecution.success && retryDecision && input.parseRecoveryCommand) {
      const failureObservation = nextObservation;
      const recoveryParsed = await input.parseRecoveryCommand({
        input: input.effectiveMessage,
        observation: failureObservation,
        failureContext: retryDecision,
      });

      if (
        recoveryParsed.success &&
        recoveryParsed.commands.length > 0 &&
        !this.areCommandsEquivalent(recoveryParsed.commands, input.parsed.commands)
      ) {
        let recoveryExecution = await input.executeBrowserCommands(
          input.session,
          recoveryParsed.commands,
          {
            appendDefaultWait: true,
          }
        );
        nextObservation = await input.observePageSafely(
          input.session,
          input.mergeObservationWithExecution(failureObservation, recoveryExecution)
        );
        recoveryExecution = this.reconcileNavigationExecution(
          recoveryExecution,
          recoveryParsed.commands,
          nextObservation
        );
        await this.reportExecutionFailure({
          stage: 'recovery-execution',
          session: input.session,
          effectiveMessage: input.effectiveMessage,
          parsed: recoveryParsed,
          observation: failureObservation,
          execution: recoveryExecution,
        });
        effectiveParsed = recoveryParsed;
        effectiveExecution = this.mergeExecutionResponses(initialExecution, recoveryExecution);
      } else {
        nextObservation = failureObservation;
      }
    }

    const finalObservation = nextObservation || input.observation;
    input.session.lastObservation = finalObservation;
    input.session.currentPageUrl = finalObservation?.currentPageUrl || input.session.currentPageUrl;
    input.session.executedCommands.push(
      ...(effectiveExecution.executedCommands || effectiveParsed.commands)
    );
    input.applyRecorderControlTokensAfterExecution(input.session, input.controlTokenState);

    const ambiguityReply = this.recorderDebugChatSupportService.buildAmbiguityReply(
      effectiveParsed.commands,
      effectiveExecution,
      finalObservation
    );
    if (ambiguityReply) {
      input.session.pendingDisambiguation = ambiguityReply.pending;
      return {
        kind: 'ambiguous',
        reply: ambiguityReply.reply,
        pending: ambiguityReply.pending,
        execution: effectiveExecution,
        nextObservation,
      };
    }

    return {
      kind: 'completed',
      reply: effectiveExecution.success
        ? `${effectiveParsed.explanation}\n已执行当前页面操作。`
        : `${effectiveParsed.explanation}\n执行失败：${
            effectiveExecution.message ||
            this.recorderDebugChatSupportService.extractExecutionError(effectiveExecution)
          }`,
      execution: effectiveExecution,
      nextObservation,
    };
  }

  private async buildPreflightRecoveryParsed<TSession extends RecorderDebugExecutionSessionLike>(
    input: BrowserExecutionControllerInput<TSession>
  ): Promise<ParseBrowserCommandResponse | null> {
    if (!input.parseRecoveryCommand) {
      return null;
    }
    if (!this.shouldRunLoginRecoveryBeforeExecution(input.parsed.commands, input.observation)) {
      return null;
    }

    const recoveryParsed = await input.parseRecoveryCommand({
      input: input.effectiveMessage,
      observation: input.observation,
      failureContext: {
        lastAction: {
          action: input.parsed.commands[0]?.tool,
          params: input.parsed.commands[0]?.params,
          locator: input.parsed.commands[0]?.locator,
        },
        errorMessage: 'Target action requested while current page is a login gate',
        errorType: 'login_gate_preflight',
        retryable: true,
        failedStepIndex: 0,
      },
    });

    if (
      !recoveryParsed.success ||
      recoveryParsed.commands.length === 0 ||
      this.areCommandsEquivalent(recoveryParsed.commands, input.parsed.commands)
    ) {
      return null;
    }
    return recoveryParsed;
  }

  private shouldRunLoginRecoveryBeforeExecution(
    commands: BrowserCommand[],
    observation: RecorderDebugObservation
  ): boolean {
    if (commands.length !== 1) {
      return false;
    }
    const firstCommand = commands[0];
    if (firstCommand?.tool !== 'click' || this.isLoginLikeCommand(firstCommand)) {
      return false;
    }
    return this.isLoginGateObservation(observation);
  }

  private isLoginLikeCommand(command: BrowserCommand): boolean {
    const source = [
      typeof command.description === 'string' ? command.description : '',
      typeof command.params?.text === 'string' ? command.params.text : '',
      typeof command.params?.target === 'string' ? command.params.target : '',
      typeof command.locator?.value === 'string' ? command.locator.value : '',
      typeof command.locator?.name === 'string' ? command.locator.name : '',
    ]
      .join(' ')
      .toLowerCase();
    return /(登录|登入|log\s*in|log\s*on|sign\s*in|ログイン)/i.test(source);
  }

  private isLoginGateObservation(observation: RecorderDebugObservation): boolean {
    const combinedText = [
      observation.title || '',
      observation.text || '',
      ...observation.inputs.map((item) => JSON.stringify(item)),
      ...observation.buttons.map((item) => JSON.stringify(item)),
    ].join(' ');
    const hasLoginAction = /(登录|登入|log\s*in|log\s*on|sign\s*in|ログイン)/i.test(combinedText);
    const hasCredentialFields =
      /(用户名|账号|账户|user(?:name)?|email|邮箱)/i.test(combinedText) &&
      /(密码|password|pass)/i.test(combinedText);
    return hasLoginAction && hasCredentialFields;
  }

  private async reportExecutionFailure<TSession extends RecorderDebugExecutionSessionLike>(input: {
    stage: 'initial-execution' | 'recovery-execution';
    session: TSession;
    effectiveMessage: string;
    parsed: ParseBrowserCommandResponse;
    observation: RecorderDebugObservation;
    execution: BrowserExecuteResponse;
  }): Promise<void> {
    if (input.execution.success) {
      return;
    }

    const failureContext = this.extractFailureContext(input.execution);
    const executedCommands = input.execution.executedCommands || input.parsed.commands || [];
    const failedCommand =
      failureContext?.failedStepIndex !== undefined && failureContext.failedStepIndex >= 0
        ? executedCommands[failureContext.failedStepIndex] || executedCommands[0]
        : executedCommands[0];

    await this.browserSemanticsClient.createErrorLog({
      domain_code: 'browser_recorder',
      source: 'execution',
      error_type: failureContext?.errorType || 'BROWSER_EXECUTION_FAILED',
      error_message:
        failureContext?.errorMessage ||
        input.execution.message ||
        this.recorderDebugChatSupportService.extractExecutionError(input.execution) ||
        'Browser execution failed',
      input_text: input.effectiveMessage,
      session_id: input.session.sessionId,
      task_id: input.session.runtimeSessionId,
      page_url: input.observation.currentPageUrl || input.session.currentPageUrl,
      page_title: input.observation.title,
      host: this.extractHostFromUrl(input.observation.currentPageUrl || input.session.currentPageUrl),
      page_type: this.inferPageType(input.observation),
      observation_summary: this.buildObservationSummary(input.observation),
      candidate_summary: {
        candidate_count: input.observation.candidates?.length || 0,
        candidate_ids: (input.observation.candidates || []).map((candidate) => candidate.candidateId),
        input_count: input.observation.inputs.length,
        button_count: input.observation.buttons.length,
      },
      parser_output: {
        explanation: input.parsed.explanation,
        success: input.parsed.success,
        commands: input.parsed.commands,
        execution_message: input.execution.message,
        execution_steps: input.execution.steps,
      },
      locator_info:
        failedCommand?.locator && typeof failedCommand.locator === 'object'
          ? { ...failedCommand.locator }
          : undefined,
      metadata: {
        source_stage: input.stage,
        backend: input.session.backend,
        retryable: failureContext?.retryable,
        failed_step_index: failureContext?.failedStepIndex,
        last_action: failureContext?.lastAction,
      },
    });
  }

  private extractFailureContext(execution: BrowserExecuteResponse): BrowserCommandFailureContext | null {
    const failedStep = Array.isArray(execution.steps)
      ? execution.steps.find((step: any) => step?.status === 'error')
      : undefined;
    if (!failedStep) {
      return execution.message
        ? {
            lastAction: {},
            errorMessage: execution.message,
          }
        : null;
    }

    const failedStepError =
      failedStep.error && typeof failedStep.error === 'object'
        ? (failedStep.error as Record<string, unknown>)
        : undefined;
    const retryable =
      typeof failedStepError?.retryable === 'boolean' ? failedStepError.retryable : false;

    return {
      lastAction: {
        action: failedStep.action,
        params: failedStep.params,
        locator: failedStep.locator,
      },
      errorMessage:
        typeof failedStepError?.message === 'string'
          ? failedStepError.message
          : execution.message || 'Execution failed',
      errorType:
        typeof failedStepError?.code === 'string'
          ? failedStepError.code
          : typeof failedStepError?.name === 'string'
            ? failedStepError.name
            : undefined,
      retryable,
      failedStepIndex: Array.isArray(execution.steps)
        ? execution.steps.findIndex((step: any) => step?.status === 'error')
        : undefined,
    };
  }

  private inferPageType(observation: RecorderDebugObservation): string | undefined {
    const combinedText = [observation.title || '', observation.text || ''].join(' ').toLowerCase();
    if (/(登录|登入|log\s*in|sign\s*in|ログイン)/i.test(combinedText)) {
      return 'login';
    }
    if (/(详情|明细|detail)/i.test(combinedText)) {
      return 'detail';
    }
    if (/(列表|一览|list)/i.test(combinedText)) {
      return 'list';
    }
    return undefined;
  }

  private buildObservationSummary(observation: RecorderDebugObservation): string {
    return [
      observation.title ? `title=${observation.title}` : '',
      observation.currentPageUrl ? `url=${observation.currentPageUrl}` : '',
      observation.text ? `text=${observation.text.slice(0, 400)}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
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

  private buildRetryDecision(
    execution: BrowserExecuteResponse
  ): BrowserCommandFailureContext | null {
    const failureContext = this.extractFailureContext(execution);
    if (!failureContext?.retryable) {
      return null;
    }
    return failureContext;
  }

  private mergeExecutionResponses(
    initialExecution: BrowserExecuteResponse,
    recoveryExecution: BrowserExecuteResponse
  ): BrowserExecuteResponse {
    // When recovery succeeds, the merged result reflects the recovery outcome —
    // the initial failure was an internal retry. Surfacing initialExecution.message
    // ("One or more CLI commands failed...") or its error results would contradict
    // `success: true` and confuse the displayed execution result / outcome toolExecution.
    const recoverySucceeded = recoveryExecution.success;
    return {
      success: recoveryExecution.success,
      ...(recoveryExecution.recovered ? { recovered: true, recovery: recoveryExecution.recovery } : {}),
      message: recoverySucceeded
        ? recoveryExecution.message || 'Recovered after retry'
        : recoveryExecution.message || initialExecution.message,
      results: recoverySucceeded
        ? [...(recoveryExecution.results || [])]
        : [...(initialExecution.results || []), ...(recoveryExecution.results || [])],
      steps: [...(initialExecution.steps || []), ...(recoveryExecution.steps || [])],
      executedCommands: [
        ...(initialExecution.executedCommands || []),
        ...(recoveryExecution.executedCommands || []),
      ],
    };
  }

  private reconcileNavigationExecution(
    execution: BrowserExecuteResponse,
    commands: BrowserCommand[],
    observation: RecorderDebugObservation
  ): BrowserExecuteResponse {
    if (process.env.BROWSER_POST_STATE_RECONCILIATION_ENABLED !== 'true') return execution;
    if (execution.success || commands.length !== 1) return execution;
    const command = commands[0];
    if (!command || (command.tool !== 'navigate' && command.tool !== 'goto')) return execution;
    const expectedUrl =
      (typeof command.params?.url === 'string' && command.params.url.trim()) ||
      (typeof command.params?.target === 'string' && command.params.target.trim());
    const observedUrl = observation.currentPageUrl?.trim();
    if (!expectedUrl || !observedUrl || !urlsMatch(expectedUrl, observedUrl)) return execution;
    return {
      ...execution,
      success: true,
      recovered: true,
      recovery: {
        code: 'NAVIGATION_TIMEOUT_RECOVERED',
        expectedUrl,
        observedUrl,
      },
      message: '导航动作返回异常，但页面状态校准确认已到达目标地址。',
    };
  }

  private areCommandsEquivalent(a: BrowserCommand[], b: BrowserCommand[]): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }
}

function urlsMatch(expected: string, actual: string): boolean {
  try {
    const left = new URL(expected);
    const right = new URL(actual);
    return left.protocol === right.protocol && left.hostname === right.hostname && left.port === right.port && left.pathname === right.pathname && left.search === right.search && left.hash === right.hash;
  } catch {
    return expected === actual;
  }
}
