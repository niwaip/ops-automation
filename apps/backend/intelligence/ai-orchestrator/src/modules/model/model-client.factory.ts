import type { AIModelDTO } from '../../interfaces';
import { AnthropicMessagesClient } from '../../client/anthropic-messages';
import type { LLMClient } from '../../client/llm-client';
import { OpenAICompatibleClient } from '../../client/openai-compatible';
import { getPromptCachingConfigForModel } from './model-config.helpers';

export function buildModelClient(model: AIModelDTO, apiKey: string): LLMClient {
  const transport =
    model.config.invocation?.transport ||
    (model.provider === 'anthropic' ? 'anthropic_messages' : 'openai_chat_completions');
  const promptCaching = getPromptCachingConfigForModel(model);

  if (transport === 'anthropic_messages') {
    return new AnthropicMessagesClient({
      baseURL: model.api_endpoint,
      apiKey,
      model: model.name,
      provider: model.provider,
      promptCacheRetention: promptCaching?.retention,
    });
  }

  return new OpenAICompatibleClient({
    baseURL: model.api_endpoint,
    apiKey,
    model: model.name,
    provider: model.provider,
    promptCacheRetention: promptCaching?.retention,
  });
}
