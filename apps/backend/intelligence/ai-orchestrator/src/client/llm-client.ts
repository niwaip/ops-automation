import { ChatMessage, LLMResponse, OpenAICompatibleConfig } from '../interfaces';

export type PromptCachingMode = 'none' | 'openai_auto' | 'anthropic_auto' | 'anthropic_explicit';

export type PromptCacheRetention = 'in_memory' | '24h' | '5m' | '1h';

export interface PromptCachingConfig {
  enabled?: boolean;
  mode?: PromptCachingMode;
  retention?: PromptCacheRetention;
  min_tokens?: number;
}

export interface PromptAssembly {
  staticSystem: string;
  skillContext: string;
  dynamicUser: string;
  promptCacheKey?: string;
}

export interface LLMChatRequest {
  messages?: ChatMessage[];
  assembly?: PromptAssembly;
  responseFormat?: 'json_object';
  /** Provider-side completion cap. Runtime budgets must be enforced before generation, not only after it. */
  maxOutputTokens?: number;
  promptCaching?: PromptCachingConfig;
  reasoning?: {
    enabled?: boolean;
    effort?: 'low' | 'medium' | 'high';
  };
}

export interface LLMClient {
  chatCompletion(request: ChatMessage[] | LLMChatRequest): Promise<LLMResponse>;
  chatCompletionStream(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    reasoning?: {
      enabled?: boolean;
      effort?: 'low' | 'medium' | 'high';
    }
  ): Promise<LLMResponse>;
  listModels(): Promise<string[]>;
  healthCheck(): Promise<boolean>;
  updateConfig(config: Partial<OpenAICompatibleConfig>): void;
  getConfig(): OpenAICompatibleConfig;
}
