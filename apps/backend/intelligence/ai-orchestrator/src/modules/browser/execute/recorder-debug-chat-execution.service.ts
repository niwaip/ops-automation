import { Injectable } from '@nestjs/common';
import type { BrowserCommandCandidate } from '../intent';
import type { BrowserExecuteResponse } from './recorder-debug.types';
import {
  BrowserExecutionControllerService,
  type BrowserExecutionControllerInput,
  type RecorderControlTokenStateLike,
  type RecorderDebugChatExecutionOutcome,
  type RecorderDebugExecutionSessionLike,
} from './browser-execution-controller.service';

export type {
  BrowserExecutionControllerInput,
  RecorderControlTokenStateLike,
  RecorderDebugChatExecutionOutcome,
  RecorderDebugExecutionSessionLike,
} from './browser-execution-controller.service';

@Injectable()
export class RecorderDebugChatExecutionService {
  constructor(
    private readonly browserExecutionControllerService: BrowserExecutionControllerService
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
  } & BrowserExecutionControllerInput<TSession>): Promise<RecorderDebugChatExecutionOutcome> {
    return this.browserExecutionControllerService.executeAndResolve(input);
  }
}
