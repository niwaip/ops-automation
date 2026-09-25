import axios from 'axios';
import * as http from 'http';
import * as https from 'https';
import { StringDecoder } from 'string_decoder';
import { applyReasoningRequestAdapter } from './reasoning-request-adapter';
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
    finish_reason?: string;
    message?: {
      content?: string | null;
      reasoning_content?: string;
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
  private provider?: string;
  private timeout: number;
  private useJsonMode: boolean;
  private promptCacheKey?: string;
  private promptCacheRetention?: 'in_memory' | '24h' | '5m' | '1h';
  /** Learned per-client capability: this model rejects an explicit off request. */
  private reasoningOffRejected = false;

  constructor(config: OpenAICompatibleConfig, timeout: number = 90000) {
    this.baseURL = config.baseURL;
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.provider = config.provider;
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
      httpAgent: new http.Agent({ keepAlive: true, timeout: this.timeout }),
      httpsAgent: new https.Agent({ keepAlive: true, timeout: this.timeout }),
    } as any);
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
      if (normalized.tools && normalized.tools.length > 0) {
        data.tools = normalized.tools;
      }
      if (normalized.tool_choice) {
        data.tool_choice = normalized.tool_choice;
      }
      const isGemini =
        this.provider === 'gemini' ||
        this.provider === 'google' ||
        (this.baseURL || '').includes('generativelanguage.googleapis.com');

      if (normalized.promptCacheKey && !isGemini) {
        data.prompt_cache_key = normalized.promptCacheKey;
      }
      if (normalized.maxOutputTokens) {
        data.max_tokens = normalized.maxOutputTokens;
      }
      if (
        normalized.promptCacheRetention &&
        ['in_memory', '24h'].includes(normalized.promptCacheRetention) &&
        !isGemini
      ) {
        data.prompt_cache_retention = normalized.promptCacheRetention;
      }
      this.applyReasoningConfig(data, normalized.reasoning, normalized.maxOutputTokens);

      // Use /chat/completions since baseURL already includes /v1
      const response = await this.postChatCompletionWithReasoningFallback(
        data,
        normalized.reasoning,
        normalized.maxOutputTokens
      );

      const choice = response.data?.choices?.[0];
      const content = choice?.message?.content || '';
      return {
        content,
        finishReason: choice?.finish_reason,
        reasoningContent: choice?.message?.reasoning_content,
        usage: response.data?.usage,
        rateLimit: this.extractRateLimit(response.headers),
        tool_calls: (choice?.message as any)?.tool_calls,
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
          `OpenAI API Error: ${this.extractApiErrorMessage(axiosError)}`
        );
      }
      throw error;
    }
  }

  /**
   * Send chat completion request with streaming support
   * @param request - Array of chat messages or LLMChatRequest
   * @param onChunk - Callback for each streamed chunk
   * @returns Promise resolving to structured LLM response
   */
  async chatCompletionStream(
    request: ChatMessage[] | LLMChatRequest,
    onChunk: (chunk: string, meta?: any) => void,
    reasoning?: {
      enabled?: boolean;
      effort?: 'low' | 'medium' | 'high';
    }
  ): Promise<LLMResponse> {
    const normalized = this.normalizeChatRequest(request);
    const data: any = {
      model: this.model,
      messages: normalized.messages,
      stream: true,
      stream_options: { include_usage: true }, // Request usage in the last chunk
    };

    if (this.useJsonMode || normalized.responseFormat === 'json_object') {
      data.response_format = { type: 'json_object' };
    }
    if (normalized.tools && normalized.tools.length > 0) {
      data.tools = normalized.tools;
    }
    if (normalized.tool_choice) {
      data.tool_choice = normalized.tool_choice;
    }
    if (normalized.maxOutputTokens) {
      data.max_tokens = normalized.maxOutputTokens;
    }
    this.applyReasoningConfig(data, normalized.reasoning || reasoning, normalized.maxOutputTokens);

    let response: any;
    try {
      // Use /chat/completions since baseURL already includes /v1
      response = await this.client.post<NodeJS.ReadableStream>('/chat/completions', data, {
        responseType: 'stream',
      });
    } catch (error: unknown) {
      const errorMsg = await this.extractAxiosErrorMessage(error);
      if (
        data.stream_options &&
        /stream_options|extra inputs are not permitted|unrecognized request argument/i.test(errorMsg)
      ) {
        delete data.stream_options;
        try {
          response = await this.client.post<NodeJS.ReadableStream>('/chat/completions', data, {
            responseType: 'stream',
          });
        } catch (retryError: unknown) {
          const retryErrorMsg = await this.extractAxiosErrorMessage(retryError);
          throw new Error(`OpenAI API Stream Error: ${retryErrorMsg}`);
        }
      } else if (reasoning?.enabled === false && this.isReasoningMandatoryError(errorMsg)) {
        this.reasoningOffRejected = true;
        const retryData = { ...data };
        this.clearReasoningFields(retryData);
        this.applyReasoningConfig(retryData, { enabled: false });
        try {
          response = await this.client.post<NodeJS.ReadableStream>('/chat/completions', retryData, {
            responseType: 'stream',
          });
        } catch (retryError: unknown) {
          const retryErrorMsg = await this.extractAxiosErrorMessage(retryError);
          throw new Error(`OpenAI API Stream Error: ${retryErrorMsg}`);
        }
      } else {
        throw new Error(`OpenAI API Stream Error: ${errorMsg}`);
      }
    }

    try {
      let fullContent = '';
      let finalUsage: LLMUsage | undefined;
      const rateLimit = this.extractRateLimit(response.headers);
      const stream = response.data;
      const decoder = new StringDecoder('utf-8');
      let sseBuffer = '';
      let streamFatalError: Error | null = null;

      const processLine = (rawLine: string) => {
        const trimmed = rawLine.trim();
        if (!trimmed || trimmed.startsWith(':')) return;
        if (!trimmed.startsWith('data:')) return;
        const message = trimmed.replace(/^data:\s*/, '');
        if (message === '[DONE]') return;

        let parsed: any;
        try {
          parsed = JSON.parse(message);
        } catch {
          // Incomplete or invalid JSON chunk
          return;
        }

        if (parsed?.error) {
          const errMsg = parsed.error.message || parsed.error.code || JSON.stringify(parsed.error);
          streamFatalError = new Error(`OpenAI API Stream Error: ${errMsg}`);
          try { (stream as any).destroy?.(streamFatalError); } catch { /* ignore */ }
          return;
        }

        // Handle usage in stream
        if (parsed.usage) {
          finalUsage = parsed.usage;
        }

        const choice = parsed.choices?.[0];
        const delta = choice?.delta;
        const finishReason = choice?.finish_reason;
        const content = delta?.content || '';
        if (content) {
          fullContent += content;
          onChunk(content, { delta, finish_reason: finishReason, usage: parsed.usage });
        } else if (delta?.tool_calls || finishReason || parsed.usage) {
          onChunk('', { delta, finish_reason: finishReason, usage: parsed.usage });
        }
      };

      stream.on('data', (chunk: Buffer) => {
        sseBuffer += decoder.write(chunk);
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() ?? '';
        for (const line of lines) {
          processLine(line);
          if (streamFatalError) break;
        }
      });

      return new Promise((resolve, reject) => {
        stream.on('end', () => {
          if (streamFatalError) {
            reject(streamFatalError);
            return;
          }
          sseBuffer += decoder.end();
          if (sseBuffer.trim()) {
            processLine(sseBuffer);
          }
          if (streamFatalError) {
            reject(streamFatalError);
            return;
          }
          resolve({
            content: fullContent,
            usage: finalUsage,
            rateLimit,
          });
        });
        stream.on('error', (err: any) => reject(streamFatalError || err));
      });
    } catch (error: unknown) {
      const errorMsg = await this.extractAxiosErrorMessage(error);
      throw new Error(`OpenAI API Stream Error: ${errorMsg}`);
    }
  }

  private async extractAxiosErrorMessage(error: unknown): Promise<string> {
    const axiosError = error as any;
    if (!axiosError) return 'Unknown error';

    // If response data is a Stream (e.g. responseType: 'stream' in axios), buffer it to string
    if (axiosError.response?.data && typeof axiosError.response.data.on === 'function') {
      try {
        const stream = axiosError.response.data as NodeJS.ReadableStream;
        const text = await new Promise<string>((resolve) => {
          let body = '';
          stream.on('data', (chunk: Buffer) => {
            body += chunk.toString();
          });
          stream.on('end', () => resolve(body));
          stream.on('error', () => resolve(''));
        });
        if (text) {
          try {
            const parsed = JSON.parse(text);
            return parsed?.error?.message || parsed?.message || text;
          } catch {
            return text;
          }
        }
      } catch {
        // Fallback
      }
    }

    return this.extractApiErrorMessage(axiosError);
  }

  private extractApiErrorMessage(axiosError: any): string {
    const rawData = axiosError?.response?.data;
    const dataObj = Array.isArray(rawData) ? rawData[0] : rawData;
    if (dataObj?.error?.message) {
      return dataObj.error.message;
    }
    if (typeof dataObj?.message === 'string') {
      return dataObj.message;
    }
    return axiosError?.message || 'Unknown error';
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

  private applyReasoningConfig(
    data: Record<string, any>,
    reasoning?: {
      enabled?: boolean;
      effort?: 'low' | 'medium' | 'high';
    },
    maxOutputTokens?: number
  ): void {
    const effectiveReasoning =
      reasoning?.enabled === false && this.reasoningOffRejected
        ? { enabled: true as const, effort: 'low' as const }
        : reasoning;
    applyReasoningRequestAdapter(
      data,
      {
        provider: this.provider,
        baseURL: this.baseURL,
        model: this.model,
        maxOutputTokens,
      },
      effectiveReasoning
    );
  }

  private async postChatCompletionWithReasoningFallback(
    data: Record<string, any>,
    reasoning?: {
      enabled?: boolean;
      effort?: 'low' | 'medium' | 'high';
    },
    maxOutputTokens?: number
  ) {
    try {
      return await this.client.post<ChatCompletionResponse>('/chat/completions', data);
    } catch (error: unknown) {
      if (reasoning?.enabled !== false || !this.isReasoningMandatoryError(error)) {
        throw error;
      }

      // A gateway can expose a common off option while an individual model is
      // reasoning-only. Learn that constraint from its explicit API response,
      // retry once at the lowest shared effort, and skip the invalid request
      // for the lifetime of this model client.
      this.reasoningOffRejected = true;
      const retryData = { ...data };
      this.clearReasoningFields(retryData);
      this.applyReasoningConfig(retryData, { enabled: false }, maxOutputTokens);
      return this.client.post<ChatCompletionResponse>('/chat/completions', retryData);
    }
  }

  private isReasoningMandatoryError(error: unknown): boolean {
    const message = this.extractApiErrorMessage(error).toLowerCase();
    return (
      /reasoning.{0,40}(?:mandatory|required|cannot be disabled|can't be disabled)/i.test(message) ||
      /(?:unrecognized|unknown|extra|invalid|unsupported).*(?:reasoning|thinking|enable_thinking)/i.test(
        message
      )
    );
  }

  private clearReasoningFields(data: Record<string, any>): void {
    delete data.reasoning;
    delete data.reasoning_effort;
    delete data.enable_thinking;
    delete data.thinking;
    delete data.thinking_budget;
  }

  /**
   * Get available models from the API endpoint
   * @returns Promise resolving to list of available models
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await this.client.get<ModelListResponse>('/models');
      return (
        response.data.data
          ?.map((model: { id: string }) =>
            typeof model.id === 'string' ? model.id.replace(/^models\//, '') : ''
          )
          .filter((id: string) => id.length > 0) || []
      );
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
      this.reasoningOffRejected = false;
    }
    if (config.apiKey) {
      this.apiKey = config.apiKey;
      this.client.defaults.headers.common.Authorization = `Bearer ${this.apiKey}`;
    }
    if (config.model) {
      this.model = config.model;
      this.reasoningOffRejected = false;
    }
    if (config.provider !== undefined) {
      this.provider = config.provider;
      this.reasoningOffRejected = false;
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
      provider: this.provider,
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
    maxOutputTokens?: number;
    reasoning?: {
      enabled?: boolean;
      effort?: 'low' | 'medium' | 'high';
    };
    tools?: any[];
    tool_choice?: any;
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
        maxOutputTokens: request.maxOutputTokens ?? (request as any).max_tokens,
        promptCacheKey: request.assembly?.promptCacheKey || this.promptCacheKey,
        promptCacheRetention: request.promptCaching?.retention || this.promptCacheRetention,
        reasoning: request.reasoning,
        tools: request.tools,
        tool_choice: request.tool_choice,
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
        maxOutputTokens: request.maxOutputTokens ?? (request as any).max_tokens,
        promptCacheKey: request.assembly.promptCacheKey || this.promptCacheKey,
        promptCacheRetention: request.promptCaching?.retention || this.promptCacheRetention,
        reasoning: request.reasoning,
        tools: request.tools,
        tool_choice: request.tool_choice,
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
