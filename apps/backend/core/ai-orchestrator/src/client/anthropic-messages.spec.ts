import { AnthropicMessagesClient } from './anthropic-messages';

describe('AnthropicMessagesClient', () => {
  it('sends explicit cache_control on stable skill context blocks', async () => {
    const client = new AnthropicMessagesClient({
      baseURL: 'https://api.anthropic.com/v1',
      apiKey: 'test-key',
      model: 'claude-sonnet-4-5',
    });
    const postMock = jest.fn().mockResolvedValue({
      data: {
        content: [{ type: 'text', text: '{"params":{"partyA":"ABC"}}' }],
        usage: {
          input_tokens: 1500,
          output_tokens: 120,
          cache_creation_input_tokens: 1200,
        },
      },
      headers: {},
    });
    (client as any).client.post = postMock;

    await client.chatCompletion({
      assembly: {
        staticSystem: '你是参数提取助手。',
        skillContext: '这里是稳定的技能 schema 和指南。',
        dynamicUser: '甲方是ABC公司',
      },
      responseFormat: 'json_object',
      promptCaching: {
        enabled: true,
        mode: 'anthropic_explicit',
        retention: '1h',
      },
    });

    expect(postMock).toHaveBeenCalledWith(
      '/messages',
      expect.objectContaining({
        system: [
          { type: 'text', text: '你是参数提取助手。' },
          {
            type: 'text',
            text: '这里是稳定的技能 schema 和指南。',
            cache_control: { type: 'ephemeral', ttl: '1h' },
          },
        ],
      }),
    );
  });

  it('maps anthropic api errors into readable messages', async () => {
    const client = new AnthropicMessagesClient({
      baseURL: 'https://api.anthropic.com/v1',
      apiKey: 'test-key',
      model: 'claude-sonnet-4-5',
    });
    (client as any).client.post = jest.fn().mockRejectedValue({
      message: 'Request failed with status code 400',
      response: {
        data: {
          error: {
            message: 'invalid request payload',
          },
        },
      },
    });

    await expect(client.chatCompletion([
      { role: 'user', content: 'hello' },
    ])).rejects.toThrow('Anthropic API Error: invalid request payload');
  });
});
