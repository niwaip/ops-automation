import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { ControlPlaneClient } from '../../client/control-plane.client';
import type { LLMResponse } from '../../interfaces';

export interface ModelInvocationContext {
  executionId?: string;
  planningDecisionId?: string;
  stepId?: string;
  traceId?: string;
  purpose:
    | 'route'
    | 'topology'
    | 'parameter_binding'
    | 'llm_operation'
    | 'result_presentation'
    | 'compaction';
  promptTemplateVersion: string;
  systemPrompt?: string;
  catalogSnapshotDigest?: string;
  modelPolicyDigest?: string;
  generationParameters?: Record<string, unknown>;
  inputRefs?: unknown[];
  user: { userId: string; userRoles?: string[] };
  authToken?: string;
}

@Injectable()
export class ModelInvocationTelemetryService {
  private readonly logger = new Logger(ModelInvocationTelemetryService.name);

  constructor(private readonly controlPlane: ControlPlaneClient) {}

  get enabled(): boolean {
    return process.env.MODEL_INVOCATION_LEDGER_ENABLED === 'true';
  }

  async record(input: {
    modelId: string;
    provider: string;
    prompt: string;
    response: LLMResponse;
    context?: ModelInvocationContext;
  }): Promise<void> {
    if (!this.enabled || !input.context?.user.userId) return;
    const usage = input.response.usage;
    try {
      await this.controlPlane.recordModelInvocation(
        {
          executionId: input.context.executionId,
          planningDecisionId: input.context.planningDecisionId,
          stepId: input.context.stepId,
          traceId: input.context.traceId,
          purpose: input.context.purpose,
          provider: input.provider,
          modelId: input.modelId,
          promptTemplateVersion: input.context.promptTemplateVersion,
          promptTemplateDigest: digest(input.prompt),
          systemPromptDigest: digest(input.context.systemPrompt || ''),
          catalogSnapshotDigest: input.context.catalogSnapshotDigest,
          modelPolicyDigest: input.context.modelPolicyDigest,
          generationParameters: input.context.generationParameters || {},
          inputRefs: input.context.inputRefs || [],
          inputTokens: usage?.prompt_tokens || 0,
          outputTokens: usage?.completion_tokens || 0,
          cachedTokens: extractCachedTokens(usage),
          estimatedCost: (usage as any)?.estimated_cost,
          currency: (usage as any)?.currency,
        },
        { authToken: input.context.authToken, user: input.context.user }
      );
    } catch (error) {
      this.logger.warn(
        `Failed to persist model invocation telemetry: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function extractCachedTokens(usage: LLMResponse['usage']): number {
  const details = usage as any;
  return (
    details?.prompt_tokens_details?.cached_tokens ||
    details?.input_tokens_details?.cached_tokens ||
    details?.cache_read_input_tokens ||
    0
  );
}
