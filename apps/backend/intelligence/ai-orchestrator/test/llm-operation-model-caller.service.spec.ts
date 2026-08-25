import type { LLMClient } from '../src/client/llm-client';
import { LlmOperationModelCallerService } from '../src/modules/llm-operation/runtime/llm-operation-model-caller.service';
import { ModelService } from '../src/modules/model/model.service';

describe('LlmOperationModelCallerService', () => {
  it('passes the manifest output budget to the provider request', async () => {
    const chatCompletion = jest.fn().mockResolvedValue({
      content: '<think>hidden</think>{"markdown_content":"摘要"}',
      usage: { completion_tokens: 20 },
    });
    const client = { chatCompletion } as unknown as LLMClient;
    const modelService = {
      getClient: jest.fn().mockReturnValue(client),
      stripThinkingTags: jest.fn((content: string) =>
        content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
      ),
    } as unknown as ModelService;
    const service = new LlmOperationModelCallerService(modelService);

    const result = await service.call('model-1', '总结内容', 2000.9);

    expect(chatCompletion).toHaveBeenCalledWith({
      messages: [{ role: 'user', content: '总结内容' }],
      responseFormat: 'json_object',
      maxOutputTokens: 2000,
      reasoning: { enabled: false },
    });
    expect(result.content).toBe('{"markdown_content":"摘要"}');
  });

  it('uses plain text transport while keeping the runtime output contract', async () => {
    const chatCompletion = jest.fn().mockResolvedValue({ content: '# 摘要\n\n正文' });
    const modelService = {
      getClient: jest.fn().mockReturnValue({ chatCompletion }),
      stripThinkingTags: jest.fn((content: string) => content),
    } as unknown as ModelService;
    const service = new LlmOperationModelCallerService(modelService);

    await service.call('model-1', '总结内容', 6000, 'text');

    expect(chatCompletion).toHaveBeenCalledWith({
      messages: [{ role: 'user', content: '总结内容' }],
      maxOutputTokens: 6000,
      reasoning: { enabled: false },
    });
  });

  it('retries one transient provider failure on the same frozen model', async () => {
    const chatCompletion = jest
      .fn()
      .mockRejectedValueOnce(new Error('Provider returned error'))
      .mockResolvedValueOnce({ content: '{"markdown_content":"摘要"}' });
    const modelService = {
      getClient: jest.fn().mockReturnValue({ chatCompletion }),
      stripThinkingTags: jest.fn((content: string) => content),
    } as unknown as ModelService;
    const service = new LlmOperationModelCallerService(modelService);

    await expect(service.call('selected-model', '总结内容', 1000)).resolves.toEqual(
      expect.objectContaining({ content: '{"markdown_content":"摘要"}' }),
    );
    expect(modelService.getClient).toHaveBeenCalledWith('selected-model');
    expect(chatCompletion).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable client error', async () => {
    const error = Object.assign(new Error('bad request'), { status: 400 });
    const chatCompletion = jest.fn().mockRejectedValue(error);
    const modelService = {
      getClient: jest.fn().mockReturnValue({ chatCompletion }),
      stripThinkingTags: jest.fn((content: string) => content),
    } as unknown as ModelService;
    const service = new LlmOperationModelCallerService(modelService);

    await expect(service.call('selected-model', '总结内容', 1000)).rejects.toBe(error);
    expect(chatCompletion).toHaveBeenCalledTimes(1);
  });
});
