import { Injectable } from '@nestjs/common';
import { BrowserActionValidatorService } from '../intent/browser-action-validator.service';
import {
  BrowserCommand,
  BrowserCommandCandidate,
  ParseBrowserCommandResponse,
} from '../intent/browser-command.service';
import { RecorderDebugChatSupportService } from './recorder-debug-chat-support.service';

type RecorderDebugPendingRiskConfirmationLike = {
  commands: BrowserCommand[];
  explanation: string;
  riskLevel: string;
  reason: string;
};

type RecorderDebugSessionLike = {
  currentPageUrl?: string;
  backend: string;
  pendingDisambiguation?: Parameters<
    RecorderDebugChatSupportService['resolvePendingDisambiguation']
  >[0];
  pendingRiskConfirmation?: RecorderDebugPendingRiskConfirmationLike;
};

type RecorderDebugObservationLike = {
  text?: string;
  inputs: Array<Record<string, unknown>>;
  buttons: Array<Record<string, unknown>>;
  candidates?: BrowserCommandCandidate[];
};

export type RecorderDebugChatFlowResolution =
  | {
      kind: 'export';
      effectiveMessage: string;
      parsed: ParseBrowserCommandResponse;
    }
  | {
      kind: 'blocked';
      effectiveMessage: string;
      parsed: ParseBrowserCommandResponse;
      reply: string;
    }
  | {
      kind: 'confirmation_required';
      effectiveMessage: string;
      parsed: ParseBrowserCommandResponse;
      reply: string;
    }
  | {
      kind: 'execute';
      effectiveMessage: string;
      parsed: ParseBrowserCommandResponse;
    }
  | {
      kind: 'observation';
      effectiveMessage: string;
      parsed: ParseBrowserCommandResponse;
    }
  | {
      kind: 'clarification';
      effectiveMessage: string;
      parsed: ParseBrowserCommandResponse;
    };

@Injectable()
export class RecorderDebugChatFlowService {
  constructor(
    private readonly recorderDebugChatSupportService: RecorderDebugChatSupportService,
    private readonly browserActionValidatorService: BrowserActionValidatorService
  ) {}

  async resolveFlow(input: {
    session: RecorderDebugSessionLike;
    observation: RecorderDebugObservationLike;
    effectiveMessage: string;
    availableInputs: string[];
    availableButtons: string[];
    controlHints: string[];
    parseCommand: (request: {
      input: string;
      context: {
        currentPageUrl?: string;
        backend?: string;
        lastObservationText?: string;
        availableInputs: string[];
        availableButtons: string[];
        availableCandidates: BrowserCommandCandidate[];
        controlHints: string[];
      };
    }) => Promise<ParseBrowserCommandResponse>;
  }): Promise<RecorderDebugChatFlowResolution> {
    const shouldConfirmPendingRisk = Boolean(
      input.session.pendingRiskConfirmation &&
      this.recorderDebugChatSupportService.isRiskConfirmationMessage(input.effectiveMessage)
    );
    const resolvedDisambiguation =
      this.recorderDebugChatSupportService.resolvePendingDisambiguation(
        input.session.pendingDisambiguation,
        input.effectiveMessage
      );
    const parsed = shouldConfirmPendingRisk
      ? {
          success: true,
          commands: input.session.pendingRiskConfirmation?.commands || [],
          explanation:
            input.session.pendingRiskConfirmation?.explanation || '继续执行上一步高风险动作',
        }
      : resolvedDisambiguation ||
        (await input.parseCommand({
          input: input.effectiveMessage,
          context: {
            currentPageUrl: input.session.currentPageUrl,
            backend: input.session.backend,
            lastObservationText: input.observation.text,
            availableInputs: input.availableInputs,
            availableButtons: input.availableButtons,
            availableCandidates: input.observation.candidates || [],
            controlHints: input.controlHints,
          },
        }));

    if (this.recorderDebugChatSupportService.isExportIntent(input.effectiveMessage)) {
      return {
        kind: 'export',
        effectiveMessage: input.effectiveMessage,
        parsed,
      };
    }

    if (parsed.success && parsed.commands.length > 0) {
      const actionValidation = this.browserActionValidatorService.assessCommands(parsed.commands, {
        currentPageUrl: input.session.currentPageUrl,
      });
      const validationReason =
        this.recorderDebugChatSupportService.buildActionValidationReason(actionValidation);

      if (actionValidation.forbidden) {
        input.session.pendingDisambiguation = undefined;
        input.session.pendingRiskConfirmation = undefined;
        return {
          kind: 'blocked',
          effectiveMessage: input.effectiveMessage,
          parsed,
          reply: `当前请求包含禁止执行的浏览器动作，已阻断。\n原因：${validationReason}`,
        };
      }

      input.session.pendingDisambiguation = undefined;
      input.session.pendingRiskConfirmation = undefined;
      return {
        kind: 'execute',
        effectiveMessage: input.effectiveMessage,
        parsed,
      };
    }

    if (this.recorderDebugChatSupportService.isObservationIntent(input.effectiveMessage)) {
      return {
        kind: 'observation',
        effectiveMessage: input.effectiveMessage,
        parsed,
      };
    }

    return {
      kind: 'clarification',
      effectiveMessage: input.effectiveMessage,
      parsed,
    };
  }
}
