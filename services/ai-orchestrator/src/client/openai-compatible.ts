import axios from 'axios';
import { ChatMessage, OpenAICompatibleConfig } from '../interfaces';

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

  constructor(config: OpenAICompatibleConfig, timeout: number = 300000) {
    this.baseURL = config.baseURL;
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeout = timeout;
    this.useJsonMode = config.useJsonMode || false;

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
   * @returns Promise resolving to assistant response content
   */
  async chatCompletion(messages: ChatMessage[]): Promise<string> {
    try {
      const data: any = {
        model: this.model,
        messages,
      };

      if (this.useJsonMode) {
        data.response_format = { type: 'json_object' };
      }

      // Use /chat/completions since baseURL already includes /v1
      const response = await this.client.post<ChatCompletionResponse>('/chat/completions', data);

      return response.data?.choices?.[0]?.message?.content || '';
    } catch (error: unknown) {
      const axiosError = error as AxiosLikeError;
      if (axiosError.message) {
        // Check for timeout specifically
        if (axiosError.code === 'ECONNABORTED' || axiosError.message.includes('timeout')) {
          throw new Error(`AI 模型响应超时，请稍后重试或使用更简单的命令 (当前超时设置: ${this.timeout / 1000}秒)`);
        }
        throw new Error(`OpenAI API Error: ${axiosError.response?.data?.error?.message || axiosError.message}`);
      }
      throw error;
    }
  }

  /**
   * Send chat completion request with streaming support
   * @param messages - Array of chat messages
   * @param onChunk - Callback for each streamed chunk
   * @returns Promise resolving to full assistant response content
   */
  async chatCompletionStream(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    try {
      const data: any = {
        model: this.model,
        messages,
        stream: true,
      };

      if (this.useJsonMode) {
        data.response_format = { type: 'json_object' };
      }

      // Use /chat/completions since baseURL already includes /v1
      const response = await this.client.post<NodeJS.ReadableStream>('/chat/completions', data, {
        responseType: 'stream',
      });

      let fullContent = '';
      const stream = response.data;

      stream.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter((line) => line.trim() !== '');
        for (const line of lines) {
          const message = line.replace(/^data: /, '');
          if (message === '[DONE]') continue;
          try {
            const parsed = JSON.parse(message);
            const content = parsed.choices[0]?.delta?.content || '';
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
        stream.on('end', () => resolve(fullContent));
        stream.on('error', reject);
      });
    } catch (error: unknown) {
      const axiosError = error as AxiosLikeError;
      if (axiosError.message) {
        throw new Error(`OpenAI API Stream Error: ${axiosError.response?.data?.error?.message || axiosError.message}`);
      }
      throw error;
    }
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
        throw new Error(`OpenAI API Error: ${axiosError.response?.data?.error?.message || axiosError.message}`);
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
