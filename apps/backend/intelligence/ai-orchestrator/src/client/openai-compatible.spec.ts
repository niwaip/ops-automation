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
      maxOutputTokens: 900,
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
        max_tokens: 900,
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

  it('uses MiniMax thinking payload instead of reasoning_effort', async () => {
    const client = new OpenAICompatibleClient({
      baseURL: 'https://api.minimax.chat/v1',
      apiKey: 'test-key',
      model: 'MiniMax-M3',
      provider: 'minimax',
    });
    const postMock = jest.fn().mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: 'ok',
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      },
      headers: {},
    });
    (client as any).client.post = postMock;

    await client.chatCompletion({
      messages: [{ role: 'user', content: 'hello' }],
      reasoning: {
        enabled: true,
        effort: 'high',
      },
    });

    expect(postMock).toHaveBeenCalledWith(
      '/chat/completions',
      expect.objectContaining({
        model: 'MiniMax-M3',
        messages: [{ role: 'user', content: 'hello' }],
        thinking: { type: 'adaptive' },
      })
    );
    expect(postMock.mock.calls[0][1]).not.toHaveProperty('reasoning_effort');
  });

  it('disables DashScope thinking for structured output and preserves response metadata', async () => {
    const client = new OpenAICompatibleClient({
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'test-key',
      model: 'deepseek-v4-flash-0731',
      provider: 'alibaba-bailian',
    });
    const postMock = jest.fn().mockResolvedValue({
      data: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: '{"markdown_content":"摘要"}',
              reasoning_content: '',
            },
          },
        ],
        usage: {
          prompt_tokens: 5000,
          completion_tokens: 100,
          total_tokens: 5100,
        },
      },
      headers: {},
    });
    (client as any).client.post = postMock;

    const result = await client.chatCompletion({
      messages: [{ role: 'user', content: '请以 JSON 格式输出摘要' }],
      responseFormat: 'json_object',
      maxOutputTokens: 4000,
      reasoning: { enabled: false },
    });

    expect(postMock).toHaveBeenCalledWith(
      '/chat/completions',
      expect.objectContaining({
        enable_thinking: false,
        response_format: { type: 'json_object' },
        max_tokens: 4000,
      }),
    );
    expect(result).toMatchObject({
      content: '{"markdown_content":"摘要"}',
      finishReason: 'stop',
      reasoningContent: '',
    });
  });

  it('retains length termination and reasoning-only response metadata', async () => {
    const client = new OpenAICompatibleClient({
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'test-key',
      model: 'deepseek-v4-flash-0731',
    });
    (client as any).client.post = jest.fn().mockResolvedValue({
      data: {
        choices: [
          {
            finish_reason: 'length',
            message: { content: null, reasoning_content: 'reasoning only' },
          },
        ],
        usage: {
          prompt_tokens: 5012,
          completion_tokens: 4000,
          total_tokens: 9012,
          completion_tokens_details: { reasoning_tokens: 4000 },
        },
      },
      headers: {},
    });

    const result = await client.chatCompletion([{ role: 'user', content: '总结' }]);

    expect(result.content).toBe('');
    expect(result.finishReason).toBe('length');
    expect(result.reasoningContent).toBe('reasoning only');
    expect(result.usage?.completion_tokens_details?.reasoning_tokens).toBe(4000);
  });
});
