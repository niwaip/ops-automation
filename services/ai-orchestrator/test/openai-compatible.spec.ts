import { OpenAICompatibleClient, AzureOpenAIClient } from '../src/client/openai-compatible';

// Mock axios for testing
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    post: jest.fn(),
    get: jest.fn(),
    defaults: {
      headers: {},
      baseURL: '',
    },
  })),
}));

describe('OpenAICompatibleClient', () => {
  let client: OpenAICompatibleClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    const axios = require('axios');
    mockAxiosInstance = axios.create();

    client = new OpenAICompatibleClient({
      baseURL: 'https://api.openai.com',
      apiKey: 'test-api-key',
      model: 'gpt-4',
    });
  });

  it('should be defined', () => {
    expect(client).toBeDefined();
  });

  it('should have correct config', () => {
    const config = client.getConfig();
    expect(config.baseURL).toBe('https://api.openai.com');
    expect(config.model).toBe('gpt-4');
  });

  describe('chatCompletion', () => {
    it('should call API with correct parameters', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          choices: [{ message: { content: 'AI response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
        headers: {
          'x-ratelimit-remaining-requests': '99',
        },
      });

      const messages = [
        { role: 'user' as const, content: 'Hello' },
      ];

      const result = await client.chatCompletion(messages);

      expect(result.content).toBe('AI response');
      expect(result.usage?.total_tokens).toBe(15);
      expect(result.rateLimit?.requests_remaining).toBe(99);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/chat/completions', {
        model: 'gpt-4',
        messages,
      });
    });

    it('should handle API errors', async () => {
      mockAxiosInstance.post.mockRejectedValueOnce({
        response: { data: { error: { message: 'API Error' } } },
        message: 'Request failed',
      });

      await expect(client.chatCompletion([{ role: 'user', content: 'test' }]))
        .rejects.toThrow('OpenAI API Error');
    });
  });

  describe('updateConfig', () => {
    it('should update model', () => {
      client.updateConfig({ model: 'gpt-4-turbo' });
      const config = client.getConfig();
      expect(config.model).toBe('gpt-4-turbo');
    });
  });

  describe('healthCheck', () => {
    it('should return true when API is accessible', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ status: 200 });
      const result = await client.healthCheck();
      expect(result).toBe(true);
    });

    it('should return false when API is not accessible', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('Connection failed'));
      const result = await client.healthCheck();
      expect(result).toBe(false);
    });
  });
});

describe('AzureOpenAIClient', () => {
  it('should be defined', () => {
    const client = new AzureOpenAIClient({
      baseURL: 'https://my-instance.openai.azure.com',
      apiKey: 'azure-key',
      model: 'gpt-4',
      deploymentName: 'my-deployment',
      apiVersion: '2024-02-15-preview',
    });

    expect(client).toBeDefined();
  });
});