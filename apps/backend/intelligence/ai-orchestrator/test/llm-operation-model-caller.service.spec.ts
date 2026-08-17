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
        content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim(),
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
});
