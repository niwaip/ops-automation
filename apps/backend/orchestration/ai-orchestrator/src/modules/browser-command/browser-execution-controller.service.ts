import { Injectable } from '@nestjs/common';
import { RecorderDebugChatSupportService } from './recorder-debug-chat-support.service';
import type { BrowserExecuteResponse, RecorderDebugObservation } from './recorder-debug.service';
import type { RecorderManualInterventionToken } from './recorder-loop.types';
import type {
  BrowserCommand,
  BrowserCommandFailureContext,
  ParseBrowserCommandResponse,
} from './browser-command.types';

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
  constructor(private readonly recorderDebugChatSupportService: RecorderDebugChatSupportService) {}

  async executeAndResolve<TSession extends RecorderDebugExecutionSessionLike>(
    input: BrowserExecutionControllerInput<TSession>
  ): Promise<RecorderDebugChatExecutionOutcome> {
    let effectiveParsed = input.parsed;
    const preflightRecoveryParsed = await this.buildPreflightRecoveryParsed(input);
    if (preflightRecoveryParsed) {
      effectiveParsed = preflightRecoveryParsed;
    }

    const initialExecution = await input.executeBrowserCommands(input.session, effectiveParsed.commands, {
      appendDefaultWait: true,
    });
    let effectiveExecution = initialExecution;

    const retryDecision = this.buildRetryDecision(initialExecution);
    let nextObservation = initialExecution.success
      ? await input.observePageSafely(
          input.session,
          input.mergeObservationWithExecution(input.observation, initialExecution)
        )
      : input.observation;

    if (!initialExecution.success && retryDecision && input.parseRecoveryCommand) {
      const failureObservation = await input.observePageSafely(
        input.session,
        input.mergeObservationWithExecution(input.observation, initialExecution)
      );
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
        const recoveryExecution = await input.executeBrowserCommands(
          input.session,
          recoveryParsed.commands,
          {
            appendDefaultWait: true,
          }
        );
        effectiveParsed = recoveryParsed;
        effectiveExecution = this.mergeExecutionResponses(initialExecution, recoveryExecution);
        nextObservation = recoveryExecution.success
          ? await input.observePageSafely(
              input.session,
              input.mergeObservationWithExecution(failureObservation, recoveryExecution)
            )
          : failureObservation;
      } else {
        nextObservation = failureObservation;
      }
    }

    input.session.lastObservation = nextObservation;
    input.session.currentPageUrl = nextObservation.currentPageUrl || input.session.currentPageUrl;
    input.session.executedCommands.push(
      ...(effectiveExecution.executedCommands || effectiveParsed.commands)
    );
    input.applyRecorderControlTokensAfterExecution(input.session, input.controlTokenState);

    const ambiguityReply = this.recorderDebugChatSupportService.buildAmbiguityReply(
      effectiveParsed.commands,
      effectiveExecution,
      nextObservation
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

  private buildRetryDecision(
    execution: BrowserExecuteResponse
  ): BrowserCommandFailureContext | null {
    const failedStep = Array.isArray(execution.steps)
      ? execution.steps.find((step: any) => step?.status === 'error')
      : undefined;
    if (!failedStep) {
      return null;
    }

    const failedStepError =
      failedStep.error && typeof failedStep.error === 'object'
        ? (failedStep.error as Record<string, unknown>)
        : undefined;
    const retryable =
      typeof failedStepError?.retryable === 'boolean' ? failedStepError.retryable : false;
    if (!retryable) {
      return null;
    }

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
      retryable: true,
      failedStepIndex: Array.isArray(execution.steps)
        ? execution.steps.findIndex((step: any) => step?.status === 'error')
        : undefined,
    };
  }

  private mergeExecutionResponses(
    initialExecution: BrowserExecuteResponse,
    recoveryExecution: BrowserExecuteResponse
  ): BrowserExecuteResponse {
    return {
      success: recoveryExecution.success,
      message:
        recoveryExecution.message ||
        initialExecution.message ||
        (recoveryExecution.success ? 'Recovered after retry' : undefined),
      results: [...(initialExecution.results || []), ...(recoveryExecution.results || [])],
      steps: [...(initialExecution.steps || []), ...(recoveryExecution.steps || [])],
      executedCommands: [
        ...(initialExecution.executedCommands || []),
        ...(recoveryExecution.executedCommands || []),
      ],
    };
  }

  private areCommandsEquivalent(a: BrowserCommand[], b: BrowserCommand[]): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }
}
