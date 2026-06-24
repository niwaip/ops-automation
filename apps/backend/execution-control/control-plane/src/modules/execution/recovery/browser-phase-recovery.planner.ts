import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { RECOVERY_MESSAGES, RECOVERY_ACTIONS } from './recovery-constants';
import { getAiOrchestratorUrl } from '../../../config/service-endpoints';
import type { RuntimePhaseInvokeResult } from '../adapters/runtime-adapter.interface';
import type { BrowserPhaseCommand } from '../step-runner/browser/browser-phase.types';

export interface BrowserPhaseRecoveryPolicy {
  maxAutoRetries?: number;
  allowAiRecovery?: boolean;
  allowHumanTakeover?: boolean;
  modelId?: string;
}

export interface BrowserPhaseRecoveryPatch {
  type: 'replace_selector' | 'append_wait' | 'replace_input_value' | 'resolve_by_human';
  failedStepId: string;
  selector?: string;
  durationMs?: number;
  inputValues?: Record<string, unknown>;
  resumeFromStepId?: string;
  loopIteration?: number;
  note?: string;
}

export interface BrowserPhaseRecoveryDecision {
  action:
    | 'retry_same_phase'
    | 'retry_with_patch'
    | 'takeover_required'
    | 'resolved_by_human'
    | 'abort';
  reason: string;
  patch?: BrowserPhaseRecoveryPatch | null;
}

export interface PlanBrowserPhaseRecoveryInput {
  executionId: string;
  phaseKey: string;
  phaseName?: string;
  phaseType?: string;
  attempt: number;
  commands: BrowserPhaseCommand[];
  result: RuntimePhaseInvokeResult;
  policy?: BrowserPhaseRecoveryPolicy;
}

@Injectable()
export class BrowserPhaseRecoveryPlanner {
  private readonly logger = new Logger(BrowserPhaseRecoveryPlanner.name);
  private readonly aiOrchestratorUrl = getAiOrchestratorUrl();

  async plan(input: PlanBrowserPhaseRecoveryInput): Promise<BrowserPhaseRecoveryDecision> {
    const policy = input.policy || {};
    const maxAutoRetries = Math.max(0, policy.maxAutoRetries || 0);
    const allowHumanTakeover = policy.allowHumanTakeover !== false;
    const shouldFallbackToHumanTakeover = policy.allowHumanTakeover === true;

    if (
      (input.result.status === 'takeover_required' || input.result.requiresTakeover) &&
      allowHumanTakeover
    ) {
      return {
        action: RECOVERY_ACTIONS.TAKEOVER_REQUIRED,
        reason:
          input.result.takeoverReason ||
          input.result.errorMessage ||
          RECOVERY_MESSAGES.PHASE_TAKEOVER,
      };
    }

    if (input.result.retryable && input.attempt <= maxAutoRetries) {
      return {
        action: RECOVERY_ACTIONS.RETRY_SAME_PHASE,
        reason: input.result.errorMessage || RECOVERY_MESSAGES.AUTO_RETRY(input.attempt + 1),
      };
    }

    if (input.result.retryable && policy.allowAiRecovery) {
      const aiDecision = await this.planWithAi(input);
      if (aiDecision) {
        return aiDecision;
      }
    }

    if (shouldFallbackToHumanTakeover) {
      return {
        action: RECOVERY_ACTIONS.TAKEOVER_REQUIRED,
        reason:
          input.result.takeoverReason ||
          input.result.errorMessage ||
          RECOVERY_MESSAGES.PHASE_TAKEOVER,
      };
    }

    return {
      action: RECOVERY_ACTIONS.ABORT,
      reason: input.result.errorMessage || RECOVERY_MESSAGES.BROWSER_FAILED,
    };
  }

  private async planWithAi(
    input: PlanBrowserPhaseRecoveryInput
  ): Promise<BrowserPhaseRecoveryDecision | null> {
    try {
      const response = await axios.post<{
        action?: string;
        reason?: string;
        patch?: {
          type?: string;
          failed_step_id?: string;
          selector?: string;
          duration_ms?: number;
          note?: string;
        } | null;
      }>(`${this.aiOrchestratorUrl}/ai/browser-phase-recovery/plan`, {
        execution_id: input.executionId,
        phase_key: input.phaseKey,
        phase_name: input.phaseName,
        phase_type: input.phaseType,
        attempt: input.attempt,
        modelId: input.policy?.modelId,
        commands: input.commands.map((command) => ({
          step_id: command.stepId,
          action: command.action,
          capability_type: command.capabilityType,
          input: command.input,
          metadata: command.metadata || undefined,
        })),
        result: {
          failed_step_id: input.result.failedStepId,
          failed_action: input.result.failedAction,
          error_code: input.result.errorCode,
          error_message: input.result.errorMessage,
          retryable: input.result.retryable,
          takeover_reason: input.result.takeoverReason,
        },
      });

      const action = response.data?.action;
      const reason =
        typeof response.data?.reason === 'string' && response.data.reason.trim()
          ? response.data.reason.trim()
          : input.result.errorMessage || RECOVERY_MESSAGES.AI_RECOVERY_FAILED;
      if (
        action !== RECOVERY_ACTIONS.RETRY_WITH_PATCH &&
        action !== RECOVERY_ACTIONS.TAKEOVER_REQUIRED &&
        action !== RECOVERY_ACTIONS.ABORT
      ) {
        return null;
      }

      const patch = this.normalizePatch(response.data?.patch, input.commands);
      if (action === RECOVERY_ACTIONS.RETRY_WITH_PATCH && !patch) {
        return {
          action: RECOVERY_ACTIONS.ABORT,
          reason,
          patch: null,
        };
      }

      return {
        action,
        reason,
        patch,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to plan browser phase recovery with AI: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  private normalizePatch(
    patch:
      | {
          type?: string;
          failed_step_id?: string;
          selector?: string;
          duration_ms?: number;
          note?: string;
        }
      | null
      | undefined,
    commands: BrowserPhaseCommand[]
  ): BrowserPhaseRecoveryPatch | null {
    if (
      !patch ||
      !patch.failed_step_id ||
      !commands.some((command) => command.stepId === patch.failed_step_id)
    ) {
      return null;
    }
    if (patch.type === 'replace_selector') {
      const selector = typeof patch.selector === 'string' ? patch.selector.trim() : '';
      if (!selector) {
        return null;
      }
      return {
        type: 'replace_selector',
        failedStepId: patch.failed_step_id,
        selector,
        note: typeof patch.note === 'string' ? patch.note : undefined,
      };
    }
    if (patch.type === 'append_wait') {
      return {
        type: 'append_wait',
        failedStepId: patch.failed_step_id,
        durationMs:
          typeof patch.duration_ms === 'number' && Number.isFinite(patch.duration_ms)
            ? Math.max(100, Math.min(10000, Math.round(patch.duration_ms)))
            : 1000,
        note: typeof patch.note === 'string' ? patch.note : undefined,
      };
    }
    return null;
  }
}
