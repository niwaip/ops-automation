import { Injectable, Logger } from '@nestjs/common';
import type { LLMResponse } from '../../../interfaces';
import { ModelService } from '../../model/model.service';

/**
 * Runtime adapter that turns an operation manifest budget into a provider-side
 * completion limit. This keeps budget ownership in the LLM operation runtime
 * and avoids letting an overlong generation finish before it is rejected.
 */
@Injectable()
export class LlmOperationModelCallerService {
  private readonly logger = new Logger(LlmOperationModelCallerService.name);
  private static readonly MAX_ATTEMPTS = 2;

  constructor(private readonly modelService: ModelService) {}

  public async call(
    modelId: string,
    prompt: string,
    maxOutputTokens: number,
    outputMode: 'json' | 'text' = 'json'
  ): Promise<LLMResponse> {
    const client = this.modelService.getClient(modelId);
    if (!client) {
      throw new Error(`No client initialized for model ${modelId}`);
    }

    const boundedMaxOutputTokens = Math.max(1, Math.floor(maxOutputTokens));
    const request = {
      messages: [{ role: 'user' as const, content: prompt }],
      ...(outputMode === 'json' ? { responseFormat: 'json_object' as const } : {}),
      maxOutputTokens: boundedMaxOutputTokens,
      reasoning: { enabled: false },
    };
    let response: LLMResponse | undefined;
    for (let attempt = 1; attempt <= LlmOperationModelCallerService.MAX_ATTEMPTS; attempt++) {
      try {
        response = await client.chatCompletion(request);
        break;
      } catch (error: any) {
        if (attempt >= LlmOperationModelCallerService.MAX_ATTEMPTS || !this.isRetryable(error)) {
          throw error;
        }
        this.logger.warn(
          `Transient provider failure for frozen model '${modelId}', retrying once: ${error?.message || String(error)}`,
        );
      }
    }
    if (!response) throw new Error(`Model '${modelId}' returned no response`);
    response.content = this.modelService.stripThinkingTags(response.content);
    return response;
  }

  private isRetryable(error: any): boolean {
    const status = Number(error?.status || error?.response?.status);
    if (Number.isFinite(status)) {
      return status === 408 || status === 409 || status === 429 || status >= 500;
    }
    const code = String(error?.code || '').toUpperCase();
    if (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN'].includes(code)) {
      return true;
    }
    return /provider returned error|network|timeout|temporar|overload|unavailable/i.test(
      String(error?.message || ''),
    );
  }
}
