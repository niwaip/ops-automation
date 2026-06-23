import { Injectable, Logger } from '@nestjs/common';
import {
  BrowserPhaseRecoveryPatchDTO,
  ChatMessage,
  PlanBrowserPhaseRecoveryDTO,
  PlanBrowserPhaseRecoveryResponseDTO,
} from '../../../interfaces';
import { LLMClient } from '../../../client/llm-client';
import { ModelService } from '../../model/model.service';

@Injectable()
export class BrowserPhaseRecoveryService {
  private readonly logger = new Logger(BrowserPhaseRecoveryService.name);

  constructor(private readonly modelService: ModelService) {}

  async planRecovery(
    dto: PlanBrowserPhaseRecoveryDTO
  ): Promise<PlanBrowserPhaseRecoveryResponseDTO> {
    const runtime = await this.resolveModelRuntime(dto.modelId);
    if (!runtime) {
      return this.fallbackDecision(dto);
    }

    try {
      const response = await runtime.client.chatCompletion({
        messages: this.buildMessages(dto),
        responseFormat: 'json_object',
        promptCaching: this.modelService.getPromptCachingConfig(runtime.modelId),
      });
      const parsed = this.parseRecoveryResponse(response.content, dto);
      return parsed || this.fallbackDecision(dto);
    } catch (error) {
      this.logger.warn(
        `Browser phase recovery planning failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return this.fallbackDecision(dto);
    }
  }

  private async resolveModelRuntime(
    requestedModelId?: string
  ): Promise<{ modelId: string; client: LLMClient } | null> {
    if (requestedModelId) {
      const resolvedModelId = await this.modelService.resolveModelId(requestedModelId);
      if (resolvedModelId) {
        const client = this.modelService.getClient(resolvedModelId);
        if (client) {
          return { modelId: resolvedModelId, client };
        }
      }
    }

    const defaultModel = this.modelService.getDefaultModel();
    if (!defaultModel) {
      return null;
    }
    const client = this.modelService.getClient(defaultModel.id);
    if (!client) {
      return null;
    }
    return { modelId: defaultModel.id, client };
  }

  private buildMessages(dto: PlanBrowserPhaseRecoveryDTO): ChatMessage[] {
    const systemPrompt = [
      'You are a browser phase recovery planner.',
      'Your job is to return a strictly limited recovery decision for a failed browser phase.',
      'You may only choose one action: "retry_with_patch", "takeover_required", or "abort".',
      'If you choose "retry_with_patch", the patch must be minimal and MUST target only the failed step.',
      'Allowed patch types are only:',
      '1. replace_selector: replace the failed step selector/target with a safer selector.',
      '2. append_wait: add one short wait before retrying the failed step.',
      'Never change business goals, never add new business steps, never modify non-failed steps.',
      'If the issue looks like captcha, MFA, login challenge, or human verification, choose takeover_required.',
      'If you are not confident, choose abort.',
      'Return JSON only in this shape:',
      '{"action":"retry_with_patch"|"takeover_required"|"abort","reason":"string","patch":{"type":"replace_selector"|"append_wait","failed_step_id":"string","selector":"string?","duration_ms":"number?","note":"string?"}|null}',
    ].join('\n');

    const userPrompt = JSON.stringify(
      {
        execution_id: dto.execution_id,
        phase_key: dto.phase_key,
        phase_name: dto.phase_name,
        phase_type: dto.phase_type,
        attempt: dto.attempt,
        failed_result: dto.result,
        commands: dto.commands,
      },
      null,
      2
    );

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
  }

  private parseRecoveryResponse(
    content: string,
    dto: PlanBrowserPhaseRecoveryDTO
  ): PlanBrowserPhaseRecoveryResponseDTO | null {
    try {
      const jsonCandidate = this.extractJsonCandidate(content);
      if (!jsonCandidate) {
        return null;
      }
      const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>;
      const action = parsed.action;
      const reason =
        typeof parsed.reason === 'string' && parsed.reason.trim()
          ? parsed.reason.trim()
          : dto.result.error_message || 'Browser phase recovery planning failed';
      if (action !== 'retry_with_patch' && action !== 'takeover_required' && action !== 'abort') {
        return null;
      }

      const patch = this.normalizePatch(parsed.patch, dto);
      if (action === 'retry_with_patch' && !patch) {
        return {
          action: 'abort',
          reason,
          patch: null,
        };
      }

      return {
        action,
        reason,
        patch,
      };
    } catch {
      return null;
    }
  }

  private extractJsonCandidate(response: string): string | undefined {
    const fencedMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]?.trim()) {
      return fencedMatch[1].trim();
    }
    const start = response.indexOf('{');
    const end = response.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return response.slice(start, end + 1);
    }
    return undefined;
  }

  private normalizePatch(
    value: unknown,
    dto: PlanBrowserPhaseRecoveryDTO
  ): BrowserPhaseRecoveryPatchDTO | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const raw = value as Record<string, unknown>;
    const type = raw.type;
    const failedStepId =
      typeof raw.failed_step_id === 'string' && raw.failed_step_id.trim()
        ? raw.failed_step_id.trim()
        : dto.result.failed_step_id;

    if (!failedStepId || !dto.commands.some((command) => command.step_id === failedStepId)) {
      return null;
    }

    if (type === 'replace_selector') {
      const selector = typeof raw.selector === 'string' ? raw.selector.trim() : '';
      if (!selector) {
        return null;
      }
      return {
        type,
        failed_step_id: failedStepId,
        selector,
        note: typeof raw.note === 'string' ? raw.note.trim() : undefined,
      };
    }

    if (type === 'append_wait') {
      const durationMs =
        typeof raw.duration_ms === 'number' && Number.isFinite(raw.duration_ms)
          ? Math.max(100, Math.min(10000, Math.round(raw.duration_ms)))
          : 1000;
      return {
        type,
        failed_step_id: failedStepId,
        duration_ms: durationMs,
        note: typeof raw.note === 'string' ? raw.note.trim() : undefined,
      };
    }

    return null;
  }

  private fallbackDecision(dto: PlanBrowserPhaseRecoveryDTO): PlanBrowserPhaseRecoveryResponseDTO {
    const errorText =
      `${dto.result.error_code || ''} ${dto.result.error_message || ''} ${dto.result.takeover_reason || ''}`.toLowerCase();
    if (
      /(captcha|mfa|verification|human verify|human verification|二次验证|验证码)/i.test(errorText)
    ) {
      return {
        action: 'takeover_required',
        reason:
          dto.result.takeover_reason ||
          dto.result.error_message ||
          'Human verification is required',
        patch: null,
      };
    }

    if (
      /(timeout|timed out|wait|element not found|selector|locator)/i.test(errorText) &&
      dto.result.failed_step_id
    ) {
      return {
        action: 'retry_with_patch',
        reason: dto.result.error_message || 'Retry failed step with a short wait',
        patch: {
          type: 'append_wait',
          failed_step_id: dto.result.failed_step_id,
          duration_ms: 1000,
          note: 'Fallback wait patch',
        },
      };
    }

    return {
      action: 'abort',
      reason: dto.result.error_message || 'Browser phase recovery aborted',
      patch: null,
    };
  }
}
