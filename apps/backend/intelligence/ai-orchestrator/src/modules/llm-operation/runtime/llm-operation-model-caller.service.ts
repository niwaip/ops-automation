import { Injectable } from '@nestjs/common';
import type { LLMResponse } from '../../../interfaces';
import { ModelService } from '../../model/model.service';

/**
 * Runtime adapter that turns an operation manifest budget into a provider-side
 * completion limit. This keeps budget ownership in the LLM operation runtime
 * and avoids letting an overlong generation finish before it is rejected.
 */
@Injectable()
export class LlmOperationModelCallerService {
  constructor(private readonly modelService: ModelService) {}

  public async call(
    modelId: string,
    prompt: string,
    maxOutputTokens: number,
  ): Promise<LLMResponse> {
    const client = this.modelService.getClient(modelId);
    if (!client) {
      throw new Error(`No client initialized for model ${modelId}`);
    }

    const boundedMaxOutputTokens = Math.max(1, Math.floor(maxOutputTokens));
    const response = await client.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      responseFormat: 'json_object',
      maxOutputTokens: boundedMaxOutputTokens,
      reasoning: { enabled: false },
    });
    response.content = this.modelService.stripThinkingTags(response.content);
    return response;
  }
}
