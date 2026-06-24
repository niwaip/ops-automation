import { Injectable } from '@nestjs/common';
import { RecorderConditionalBranchService } from '../loop';
import type { RecorderSessionLike } from '../loop';
import { RecorderDebugResponseService } from './recorder-debug-response.service';
import { RecorderDebugSessionFacade } from './recorder-debug-session.facade';
import { RecorderDebugChatExecutionService } from './recorder-debug-chat-execution.service';
import type { BrowserExecuteResponse, RecorderDebugObservation } from './recorder-debug.types';
import type {
  BrowserCommand,
  BrowserCommandFailureContext,
  ParseBrowserCommandResponse,
} from '../intent';
import type { RecorderControlTokenStateLike } from './browser-execution-controller.service';

type RecorderDebugBranchSessionLike = RecorderSessionLike & {
  sessionId: string;
  runtimeSessionId: string;
  backend: string;
  browserInitialized: boolean;
  currentPageUrl?: string;
  lastObservation?: RecorderDebugObservation;
  pendingLoopCaptureStartCommandIndex?: number;
  history: any[];
  updatedAt: string;
  executedCommands: BrowserCommand[];
  pendingDisambiguation?: unknown;
};

@Injectable()
export class RecorderDebugBranchFacade {
  constructor(
    private readonly recorderConditionalBranchService: RecorderConditionalBranchService,
    private readonly recorderDebugChatExecutionService: RecorderDebugChatExecutionService,
    private readonly recorderDebugResponseService: RecorderDebugResponseService,
    private readonly recorderDebugSessionFacade: RecorderDebugSessionFacade
  ) {}

  async handleConditionalBranchChat<TSession extends RecorderDebugBranchSessionLike>(input: {
    session: TSession;
    observation: RecorderDebugObservation;
    effectiveMessage: string;
    controlTokenState: RecorderControlTokenStateLike;
    ackReply: string;
    executeBrowserCommands: (
      session: TSession,
      commands: BrowserCommand[],
      options?: { appendDefaultWait?: boolean; timeoutMs?: number; skipValidation?: boolean }
    ) => Promise<BrowserExecuteResponse>;
    observePageSafely: (
      session: TSession,
      fallback?: RecorderDebugObservation
    ) => Promise<RecorderDebugObservation>;
    parseRecoveryCommand: (request: {
      input: string;
      observation: RecorderDebugObservation;
      failureContext: BrowserCommandFailureContext;
    }) => Promise<ParseBrowserCommandResponse>;
    mergeObservationWithExecution: (
      observation: RecorderDebugObservation,
      execution: BrowserExecuteResponse
    ) => RecorderDebugObservation;
  }): Promise<any> {
    const planned = await this.recorderConditionalBranchService.plan({
      runtimeSessionId: input.session.runtimeSessionId,
      currentPageUrl: input.session.currentPageUrl,
      effectiveMessage: input.effectiveMessage,
      observation: input.observation,
      executeBrowserCommands: async (commands, options) =>
        input.executeBrowserCommands(input.session, commands, {
          timeoutMs: options?.timeoutMs,
          skipValidation: options?.skipValidation,
        }),
    });

    if (!planned.command) {
      const reply = [
        input.ackReply,
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
        input.executeBrowserCommands(currentSession, commands, {
          ...options,
          skipValidation: true,
        }),
      observePageSafely: input.observePageSafely,
      parseRecoveryCommand: input.parseRecoveryCommand,
      mergeObservationWithExecution: input.mergeObservationWithExecution,
      applyRecorderControlTokensAfterExecution: (currentSession, state) =>
        this.recorderDebugSessionFacade.applyRecorderControlTokensAfterExecution(
          currentSession,
          state
        ),
    });

    const replyPrefix = `${input.ackReply}\n已记录条件说明：${input.effectiveMessage}`;
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
}
