import axios, { AxiosInstance, AxiosError } from 'axios';
import { ChatMessage, OpenAICompatibleConfig } from '../interfaces';

/**
 * OpenAI Compatible Client
 * Supports OpenAI, Azure OpenAI, and local/self-hosted models that implement OpenAI-compatible API
 */
export class OpenAICompatibleClient {
  protected client: AxiosInstance;
  private baseURL: string;
  private apiKey: string;
  private model: string;
  private timeout: number;

  constructor(config: OpenAICompatibleConfig, timeout: number = 30000) {
    this.baseURL = config.baseURL;
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeout = timeout;

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
      const response = await this.client.post('/v1/chat/completions', {
        model: this.model,
        messages,
      });

      return response.data.choices[0]?.message?.content || '';
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        throw new Error(`OpenAI API Error: ${error.response?.data?.error?.message || error.message}`);
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
      const response = await this.client.post('/v1/chat/completions', {
        model: this.model,
        messages,
        stream: true,
      }, {
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
      if (error instanceof AxiosError) {
        throw new Error(`OpenAI API Stream Error: ${error.response?.data?.error?.message || error.message}`);
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
      const response = await this.client.get('/v1/models');
      return response.data.data?.map((model: { id: string }) => model.id) || [];
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        throw new Error(`OpenAI API Error: ${error.response?.data?.error?.message || error.message}`);
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
      const response = await this.client.get('/v1/models', { timeout: 5000 });
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
      this.client.defaults.headers.Authorization = `Bearer ${this.apiKey}`;
    }
    if (config.model) {
      this.model = config.model;
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
  }) {
    // Azure OpenAI uses api-key header instead of Bearer token
    const azureConfig = {
      baseURL: `${config.baseURL}/deployments/${config.deploymentName}`,
      apiKey: config.apiKey,
      model: config.model,
    };

    super(azureConfig);
    // Override headers for Azure-specific authentication
    this.client.defaults.headers.common['Content-Type'] = 'application/json';
    this.client.defaults.headers.common['api-key'] = config.apiKey;
    // Add api-version query parameter
    this.client.defaults.params = { 'api-version': config.apiVersion };
  }
}