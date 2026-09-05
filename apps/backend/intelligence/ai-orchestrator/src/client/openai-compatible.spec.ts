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
      })
    );
    expect(result).toMatchObject({
      content: '{"markdown_content":"摘要"}',
      finishReason: 'stop',
      reasoningContent: '',
    });
  });

  it('disables OpenRouter reasoning through the unified reasoning contract', async () => {
    const client = new OpenAICompatibleClient({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
      model: 'stealth/ox-alpha',
      provider: 'openrouter',
    });
    const postMock = jest.fn().mockResolvedValue({
      data: {
        choices: [{ finish_reason: 'stop', message: { content: '# 摘要' } }],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      },
      headers: {},
    });
    (client as any).client.post = postMock;

    await client.chatCompletion({
      messages: [{ role: 'user', content: '总结' }],
      maxOutputTokens: 6000,
      reasoning: { enabled: false },
    });

    expect(postMock).toHaveBeenCalledWith(
      '/chat/completions',
      expect.objectContaining({
        max_tokens: 6000,
      })
    );
    expect(postMock.mock.calls[0][1].reasoning).toBeUndefined();
  });

  it('learns a reasoning-only model and retries disabled requests at low effort', async () => {
    const client = new OpenAICompatibleClient({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
      model: 'provider/reasoning-only-model',
      provider: 'openrouter',
    });
    const postMock = jest
      .fn()
      .mockRejectedValueOnce({
        message: 'Request failed with status code 400',
        response: {
          data: {
            error: {
              message: 'Reasoning is mandatory for this endpoint and cannot be disabled.',
            },
          },
        },
      })
      .mockResolvedValue({
        data: { choices: [{ message: { content: 'summary' }, finish_reason: 'stop' }] },
        headers: {},
      });
    (client as any).client.post = postMock;

    await client.chatCompletion({
      messages: [{ role: 'user', content: 'summarize' }],
      maxOutputTokens: 6000,
      reasoning: { enabled: false },
    });
    await client.chatCompletion({
      messages: [{ role: 'user', content: 'summarize again' }],
      maxOutputTokens: 6000,
      reasoning: { enabled: false },
    });

    expect(postMock).toHaveBeenCalledTimes(3);
    expect(postMock.mock.calls[0][1].reasoning).toBeUndefined();
    expect(postMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({ reasoning: { effort: 'low' } })
    );
    expect(postMock.mock.calls[2][1]).toEqual(
      expect.objectContaining({ reasoning: { effort: 'low' } })
    );
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

  it('normalizes model IDs returned with models/ prefix in listModels', async () => {
    const client = new OpenAICompatibleClient({
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: 'test-key',
      model: 'model-discovery',
      provider: 'gemini',
    });
    (client as any).client.get = jest.fn().mockResolvedValue({
      data: {
        data: [
          { id: 'models/gemini-2.5-pro' },
          { id: 'models/gemini-2.5-flash' },
          { id: 'gemini-2.0-flash' },
        ],
      },
    });

    const models = await client.listModels();
    expect(models).toEqual(['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash']);
  });
});
