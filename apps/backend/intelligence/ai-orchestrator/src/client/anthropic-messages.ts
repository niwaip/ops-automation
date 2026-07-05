import axios from 'axios';
import {
  ChatMessage,
  LLMRateLimit,
  LLMResponse,
  LLMUsage,
  OpenAICompatibleConfig,
} from '../interfaces';
import { LLMChatRequest } from './llm-client';

type AxiosLikeError = {
  code?: string;
  message?: string;
  response?: {
    data?: {
      error?: {
        message?: string;
        type?: string;
      };
    };
  };
};

type AnthropicContentBlock = {
  type: 'text';
  text: string;
  cache_control?: {
    type: 'ephemeral';
    ttl?: '5m' | '1h';
  };
};

type AnthropicMessageResponse = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
};

export class AnthropicMessagesClient {
  protected client: ReturnType<typeof axios.create>;
  private baseURL: string;
  private apiKey: string;
  private model: string;
  private timeout: number;
  private anthropicVersion: string;

  constructor(config: OpenAICompatibleConfig, timeout: number = 300000) {
    this.baseURL = config.baseURL;
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeout = timeout;
    this.anthropicVersion = config.anthropicVersion || '2023-06-01';

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.anthropicVersion,
      },
    });
  }

  async chatCompletion(request: ChatMessage[] | LLMChatRequest): Promise<LLMResponse> {
    try {
      const normalized = this.normalizeRequest(request);
      const response = await this.client.post<AnthropicMessageResponse>(
        '/messages',
        normalized.body
      );
      const content = (response.data?.content || [])
        .filter((item) => item?.type === 'text' && typeof item.text === 'string')
        .map((item) => item.text)
        .join('');

      return {
        content,
        usage: this.normalizeUsage(response.data?.usage),
        rateLimit: this.extractRateLimit(response.headers as Record<string, unknown>),
      };
    } catch (error: unknown) {
      const axiosError = error as AxiosLikeError;
      if (axiosError.message) {
        if (axiosError.code === 'ECONNABORTED' || axiosError.message.includes('timeout')) {
          throw new Error(
            `Anthropic 模型响应超时，请稍后重试或使用更简单的命令 (当前超时设置: ${this.timeout / 1000}秒)`
          );
        }
        throw new Error(
          `Anthropic API Error: ${axiosError.response?.data?.error?.message || axiosError.message}`
        );
      }
      throw error;
    }
  }

  async chatCompletionStream(
    messages: ChatMessage[],
    _onChunk: (chunk: string) => void,
    _reasoning?: {
      enabled?: boolean;
      effort?: 'low' | 'medium' | 'high';
    }
  ): Promise<LLMResponse> {
    return this.chatCompletion(messages);
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await this.client.get<{ data?: Array<{ id: string }> }>('/models');
      return response.data?.data?.map((item) => item.id) || [];
    } catch (error: unknown) {
      const axiosError = error as AxiosLikeError;
      if (axiosError.message) {
        throw new Error(
          `Anthropic API Error: ${axiosError.response?.data?.error?.message || axiosError.message}`
        );
      }
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/models', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  updateConfig(config: Partial<OpenAICompatibleConfig>): void {
    if (config.baseURL) {
      this.baseURL = config.baseURL;
      this.client.defaults.baseURL = this.baseURL;
    }
    if (config.apiKey) {
      this.apiKey = config.apiKey;
      this.client.defaults.headers.common['x-api-key'] = this.apiKey;
    }
    if (config.model) {
      this.model = config.model;
    }
    if (config.anthropicVersion) {
      this.anthropicVersion = config.anthropicVersion;
      this.client.defaults.headers.common['anthropic-version'] = this.anthropicVersion;
    }
  }

  getConfig(): OpenAICompatibleConfig {
    return {
      baseURL: this.baseURL,
      apiKey: this.apiKey,
      model: this.model,
      anthropicVersion: this.anthropicVersion,
      provider: 'anthropic',
    };
  }

  private normalizeRequest(request: ChatMessage[] | LLMChatRequest): {
    body: Record<string, unknown>;
  } {
    if (Array.isArray(request) || request.messages) {
      const messages = Array.isArray(request) ? request : request.messages || [];
      return {
        body: {
          model: this.model,
          max_tokens: 1200,
          messages: messages.map((message) => ({
            role: message.role === 'system' ? 'user' : message.role,
            content:
              typeof message.content === 'string'
                ? [{ type: 'text', text: message.content }]
                : (message.content || []).map((block) => ({
                    type: 'text',
                    text: block.text || '',
                  })),
          })),
        },
      };
    }

    const staticBlocks: AnthropicContentBlock[] = [];
    if (request.assembly?.staticSystem?.trim()) {
      staticBlocks.push({
        type: 'text',
        text: request.assembly.staticSystem,
      });
    }
    if (request.assembly?.skillContext?.trim()) {
      staticBlocks.push({
        type: 'text',
        text: request.assembly.skillContext,
        cache_control:
          request.promptCaching?.enabled === false
            ? undefined
            : {
                type: 'ephemeral',
                ttl: request.promptCaching?.retention === '1h' ? '1h' : '5m',
              },
      });
    }

    return {
      body: {
        model: this.model,
        max_tokens: 1200,
        system: staticBlocks,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: request.assembly?.dynamicUser || '',
              },
            ],
          },
        ],
        cache_control:
          request.promptCaching?.mode === 'anthropic_auto' ? { type: 'ephemeral' } : undefined,
      },
    };
  }

  private normalizeUsage(usage?: AnthropicMessageResponse['usage']): LLMUsage | undefined {
    if (!usage) {
      return undefined;
    }
    const promptTokens = usage.input_tokens || 0;
    const completionTokens = usage.output_tokens || 0;
    return {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens,
      cache_read_input_tokens: usage.cache_read_input_tokens,
    };
  }

  private extractRateLimit(headers: Record<string, unknown>): LLMRateLimit | undefined {
    const rateLimit: LLMRateLimit = {};
    let hasInfo = false;
    const requestLimit = headers['anthropic-ratelimit-requests-limit'];
    const requestRemaining = headers['anthropic-ratelimit-requests-remaining'];
    if (typeof requestLimit === 'string') {
      rateLimit.requests_limit = parseInt(requestLimit, 10);
      hasInfo = true;
    }
    if (typeof requestRemaining === 'string') {
      rateLimit.requests_remaining = parseInt(requestRemaining, 10);
      hasInfo = true;
    }
    return hasInfo ? rateLimit : undefined;
  }
}
