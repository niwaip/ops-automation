import axios from 'axios';
import {
  ChatMessage,
  OpenAICompatibleConfig,
  LLMResponse,
  LLMUsage,
  LLMRateLimit,
} from '../interfaces';
import { LLMChatRequest } from './llm-client';

type AxiosLikeError = {
  code?: string;
  message?: string;
  response?: {
    data?: {
      error?: {
        message?: string;
      };
    };
  };
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: LLMUsage;
};

type ModelListResponse = {
  data?: Array<{
    id: string;
  }>;
};

/**
 * OpenAI Compatible Client
 * Supports OpenAI, Azure OpenAI, and local/self-hosted models that implement OpenAI-compatible API
 */
export class OpenAICompatibleClient {
  protected client: ReturnType<typeof axios.create>;
  private baseURL: string;
  private apiKey: string;
  private model: string;
  private timeout: number;
  private useJsonMode: boolean;
  private promptCacheKey?: string;
  private promptCacheRetention?: 'in_memory' | '24h' | '5m' | '1h';

  constructor(config: OpenAICompatibleConfig, timeout: number = 300000) {
    this.baseURL = config.baseURL;
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeout = timeout;
    this.useJsonMode = config.useJsonMode || false;
    this.promptCacheKey = config.promptCacheKey;
    this.promptCacheRetention = config.promptCacheRetention;

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
  }

  /**
   * Send chat completion request to OpenAI-compatible API
   * @param messages - Array of chat messages
   * @returns Promise resolving to structured LLM response
   */
  async chatCompletion(request: ChatMessage[] | LLMChatRequest): Promise<LLMResponse> {
    try {
      const normalized = this.normalizeChatRequest(request);
      const data: any = {
        model: this.model,
        messages: normalized.messages,
      };

      if (normalized.responseFormat === 'json_object' || this.useJsonMode) {
        data.response_format = { type: 'json_object' };
      }
      if (normalized.promptCacheKey) {
        data.prompt_cache_key = normalized.promptCacheKey;
      }
      if (
        normalized.promptCacheRetention &&
        ['in_memory', '24h'].includes(normalized.promptCacheRetention)
      ) {
        data.prompt_cache_retention = normalized.promptCacheRetention;
      }

      // Use /chat/completions since baseURL already includes /v1
      const response = await this.client.post<ChatCompletionResponse>('/chat/completions', data);

      return {
        content: response.data?.choices?.[0]?.message?.content || '',
        usage: response.data?.usage,
        rateLimit: this.extractRateLimit(response.headers),
      };
    } catch (error: unknown) {
      const axiosError = error as AxiosLikeError;
      if (axiosError.message) {
        // Check for timeout specifically
        if (axiosError.code === 'ECONNABORTED' || axiosError.message.includes('timeout')) {
          throw new Error(
            `AI 模型响应超时，请稍后重试或使用更简单的命令 (当前超时设置: ${this.timeout / 1000}秒)`
          );
        }
        throw new Error(
          `OpenAI API Error: ${axiosError.response?.data?.error?.message || axiosError.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Send chat completion request with streaming support
   * @param messages - Array of chat messages
   * @param onChunk - Callback for each streamed chunk
   * @returns Promise resolving to structured LLM response
   */
  async chatCompletionStream(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void
  ): Promise<LLMResponse> {
    try {
      const data: any = {
        model: this.model,
        messages,
        stream: true,
        stream_options: { include_usage: true }, // Request usage in the last chunk
      };

      if (this.useJsonMode) {
        data.response_format = { type: 'json_object' };
      }

      // Use /chat/completions since baseURL already includes /v1
      const response = await this.client.post<NodeJS.ReadableStream>('/chat/completions', data, {
        responseType: 'stream',
      });

      let fullContent = '';
      let finalUsage: LLMUsage | undefined;
      const rateLimit = this.extractRateLimit(response.headers);
      const stream = response.data;

      stream.on('data', (chunk: Buffer) => {
        const lines = chunk
          .toString()
          .split('\n')
          .filter((line) => line.trim() !== '');
        for (const line of lines) {
          const message = line.replace(/^data: /, '');
          if (message === '[DONE]') continue;
          try {
            const parsed = JSON.parse(message);

            // Handle usage in stream
            if (parsed.usage) {
              finalUsage = parsed.usage;
            }

            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              fullContent += content;
              onChunk(content);
            }
          } catch {
            // Skip invalid JSON chunks
          }
        }
      });

      return new Promise((resolve, reject) => {
        stream.on('end', () =>
          resolve({
            content: fullContent,
            usage: finalUsage,
            rateLimit,
          })
        );
        stream.on('error', reject);
      });
    } catch (error: unknown) {
      const axiosError = error as AxiosLikeError;
      if (axiosError.message) {
        throw new Error(
          `OpenAI API Stream Error: ${axiosError.response?.data?.error?.message || axiosError.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Extract rate limit information from response headers
   */
  private extractRateLimit(headers: any): LLMRateLimit | undefined {
    const rateLimit: LLMRateLimit = {};
    let hasInfo = false;

    // Standard OpenAI rate limit headers
    if (headers['x-ratelimit-limit-requests']) {
      rateLimit.requests_limit = parseInt(headers['x-ratelimit-limit-requests'], 10);
      hasInfo = true;
    }
    if (headers['x-ratelimit-remaining-requests']) {
      rateLimit.requests_remaining = parseInt(headers['x-ratelimit-remaining-requests'], 10);
      hasInfo = true;
    }
    if (headers['x-ratelimit-reset-requests']) {
      rateLimit.requests_reset = headers['x-ratelimit-reset-requests'];
      hasInfo = true;
    }
    if (headers['x-ratelimit-limit-tokens']) {
      rateLimit.tokens_limit = parseInt(headers['x-ratelimit-limit-tokens'], 10);
      hasInfo = true;
    }
    if (headers['x-ratelimit-remaining-tokens']) {
      rateLimit.tokens_remaining = parseInt(headers['x-ratelimit-remaining-tokens'], 10);
      hasInfo = true;
    }
    if (headers['x-ratelimit-reset-tokens']) {
      rateLimit.tokens_reset = headers['x-ratelimit-reset-tokens'];
      hasInfo = true;
    }

    return hasInfo ? rateLimit : undefined;
  }

  /**
   * Get available models from the API endpoint
   * @returns Promise resolving to list of available models
   */
  async listModels(): Promise<string[]> {
    try {
      // Use /models since baseURL already includes /v1
      const response = await this.client.get<ModelListResponse>('/models');
      return response.data.data?.map((model: { id: string }) => model.id) || [];
    } catch (error: unknown) {
      const axiosError = error as AxiosLikeError;
      if (axiosError.message) {
        throw new Error(
          `OpenAI API Error: ${axiosError.response?.data?.error?.message || axiosError.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Check if the API endpoint is accessible
   * @returns Promise resolving to boolean indicating health status
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Use /models since baseURL already includes /v1
      const response = await this.client.get('/models', { timeout: 5000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Update configuration (e.g., switch model)
   */
  updateConfig(config: Partial<OpenAICompatibleConfig>): void {
    if (config.baseURL) {
      this.baseURL = config.baseURL;
      this.client.defaults.baseURL = this.baseURL;
    }
    if (config.apiKey) {
      this.apiKey = config.apiKey;
      this.client.defaults.headers.common.Authorization = `Bearer ${this.apiKey}`;
    }
    if (config.model) {
      this.model = config.model;
    }
    if (config.useJsonMode !== undefined) {
      this.useJsonMode = config.useJsonMode;
    }
    if (config.promptCacheKey !== undefined) {
      this.promptCacheKey = config.promptCacheKey;
    }
    if (config.promptCacheRetention !== undefined) {
      this.promptCacheRetention = config.promptCacheRetention;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): OpenAICompatibleConfig {
    return {
      baseURL: this.baseURL,
      apiKey: this.apiKey,
      model: this.model,
      useJsonMode: this.useJsonMode,
      promptCacheKey: this.promptCacheKey,
      promptCacheRetention: this.promptCacheRetention,
    };
  }

  private normalizeChatRequest(request: ChatMessage[] | LLMChatRequest): {
    messages: ChatMessage[];
    responseFormat?: 'json_object';
    promptCacheKey?: string;
    promptCacheRetention?: 'in_memory' | '24h' | '5m' | '1h';
  } {
    if (Array.isArray(request)) {
      return {
        messages: request,
        promptCacheKey: this.promptCacheKey,
        promptCacheRetention: this.promptCacheRetention,
      };
    }

    if (request.messages) {
      return {
        messages: request.messages,
        responseFormat: request.responseFormat,
        promptCacheKey: request.assembly?.promptCacheKey || this.promptCacheKey,
        promptCacheRetention: request.promptCaching?.retention || this.promptCacheRetention,
      };
    }

    if (request.assembly) {
      const systemPrompt = [request.assembly.staticSystem, request.assembly.skillContext]
        .filter((section) => typeof section === 'string' && section.trim().length > 0)
        .join('\n\n');

      return {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: request.assembly.dynamicUser },
        ],
        responseFormat: request.responseFormat,
        promptCacheKey: request.assembly.promptCacheKey || this.promptCacheKey,
        promptCacheRetention: request.promptCaching?.retention || this.promptCacheRetention,
      };
    }

    return {
      messages: [],
      promptCacheKey: this.promptCacheKey,
      promptCacheRetention: this.promptCacheRetention,
    };
  }
}

/**
 * Azure OpenAI specific client factory
 * Azure OpenAI has slightly different authentication and URL structure
 */
export class AzureOpenAIClient extends OpenAICompatibleClient {
  constructor(config: {
    baseURL: string;
    apiKey: string;
    model: string;
    deploymentName: string;
    apiVersion: string;
    useJsonMode?: boolean;
  }) {
    // Azure OpenAI uses api-key header instead of Bearer token
    const azureConfig = {
      baseURL: `${config.baseURL}/deployments/${config.deploymentName}`,
      apiKey: config.apiKey,
      model: config.model,
      useJsonMode: config.useJsonMode,
    };

    super(azureConfig);
    // Override headers for Azure-specific authentication
    this.client.defaults.headers.common['Content-Type'] = 'application/json';
    this.client.defaults.headers.common['api-key'] = config.apiKey;
    // Add api-version query parameter
    this.client.defaults.params = { 'api-version': config.apiVersion };
  }
}
