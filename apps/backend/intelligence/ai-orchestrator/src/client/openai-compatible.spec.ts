import { OpenAICompatibleClient } from './openai-compatible';

describe('OpenAICompatibleClient', () => {
  it('includes prompt_cache_key and prompt_cache_retention for assembly requests', async () => {
    const client = new OpenAICompatibleClient({
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1',
    });
    const postMock = jest.fn().mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: '{"params":{"partyA":"ABC"}}',
            },
          },
        ],
        usage: {
          prompt_tokens: 1200,
          completion_tokens: 100,
          total_tokens: 1300,
          prompt_tokens_details: {
            cached_tokens: 1024,
          },
        },
      },
      headers: {},
    });
    (client as any).client.post = postMock;

    await client.chatCompletion({
      assembly: {
        staticSystem: 'stable contract',
        skillContext: 'stable skill context',
        dynamicUser: '甲方是ABC公司',
        promptCacheKey: 'recognizer:test-cache-key',
      },
      responseFormat: 'json_object',
      promptCaching: {
        enabled: true,
        mode: 'openai_auto',
        retention: '24h',
      },
    });

    expect(postMock).toHaveBeenCalledWith(
      '/chat/completions',
      expect.objectContaining({
        prompt_cache_key: 'recognizer:test-cache-key',
        prompt_cache_retention: '24h',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'stable contract\n\nstable skill context',
          },
          {
            role: 'user',
            content: '甲方是ABC公司',
          },
        ],
      })
    );
  });
});
