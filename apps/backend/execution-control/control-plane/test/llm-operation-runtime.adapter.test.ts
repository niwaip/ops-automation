import axios from 'axios';
import { LlmOperationRuntimeAdapter } from '../src/modules/execution/adapters/llm-operation-runtime.adapter';

jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

describe('LlmOperationRuntimeAdapter', () => {
  const post = axios.post as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls the independent Runtime V2 endpoint and forwards its data as node output', async () => {
    post.mockResolvedValue({
      data: {
        success: true,
        operationRef: {
          id: 'summarize_list',
          version: '2.0.0',
          digest: 'sha256:operation',
        },
        source: 'database',
        data: { summary: 'Real retrieved intelligence summary' },
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      },
    });

    const result = await new LlmOperationRuntimeAdapter().executeOperation({
      executionId: 'execution-1',
      stepId: 'step-2',
      operationId: 'summarize_list',
      operationVersion: '2.0.0',
      operationDigest: 'sha256:operation',
      contractDigest: 'sha256:contract',
      input: { items: [{ title: 'Source' }] },
      idempotencyKey: 'execution-1:step-2',
    });

    expect(post).toHaveBeenCalledWith(
      expect.stringContaining('/ai/operations/v2/execute'),
      expect.objectContaining({
        operationVersion: '2.0.0',
        operationDigest: 'sha256:operation',
        contractDigest: 'sha256:contract',
        input: { items: [{ title: 'Source' }] },
        idempotencyKey: 'execution-1:step-2',
      }),
      expect.any(Object),
    );
    expect(result.output).toEqual({ summary: 'Real retrieved intelligence summary' });
    expect(result.templateVersion).toBe('2.0.0');
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
  });

  it('forwards the promptDebug snapshot from the runtime response', async () => {
    post.mockResolvedValue({
      data: {
        success: true,
        operationRef: { id: 'summarize_text', version: '1.0.4', digest: 'sha256:operation' },
        source: 'database',
        data: { summary: 'ok' },
        promptDebug: {
          systemPrompt: 'You are a summarizer.',
          userPrompt: '文本：hello',
          modelId: 'model-1',
          llmResponseText: '{"summary": "ok"}',
        },
      },
    });

    const result = await new LlmOperationRuntimeAdapter().executeOperation({
      executionId: 'execution-1',
      stepId: 'step-2',
      operationId: 'summarize_text',
      operationVersion: '1.0.4',
      operationDigest: 'sha256:operation',
      contractDigest: 'sha256:contract',
      input: { text: 'hello' },
      idempotencyKey: 'execution-1:step-2',
    });

    expect(result.success).toBe(true);
    expect(result.promptDebug).toEqual({
      systemPrompt: 'You are a summarizer.',
      userPrompt: '文本：hello',
      modelId: 'model-1',
      llmResponseText: '{"summary": "ok"}',
    });
  });

  it('forwards the promptDebug snapshot from an error response body', async () => {
    post.mockRejectedValue({
      response: {
        data: {
          success: false,
          errorMessage: 'REPAIR_EXHAUSTED',
          promptDebug: {
            systemPrompt: 'You are a summarizer.',
            userPrompt: '文本：hello',
            modelId: 'model-1',
            llmResponseText: 'not json at all',
          },
        },
      },
    });

    const result = await new LlmOperationRuntimeAdapter().executeOperation({
      executionId: 'execution-1',
      stepId: 'step-2',
      operationId: 'summarize_text',
      operationVersion: '1.0.4',
      operationDigest: 'sha256:operation',
      contractDigest: 'sha256:contract',
      input: { text: 'hello' },
      idempotencyKey: 'execution-1:step-2',
    });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('REPAIR_EXHAUSTED');
    expect(result.promptDebug?.llmResponseText).toBe('not json at all');
  });

  it('rejects an unfrozen invocation before making a network request', async () => {
    await expect(
      new LlmOperationRuntimeAdapter().executeOperation({
        executionId: 'execution-1',
        stepId: 'step-2',
        operationId: 'summarize_list',
        operationVersion: '',
        operationDigest: '',
        contractDigest: '',
        input: {},
      }),
    ).rejects.toThrow('Frozen plan must pin');
    expect(post).not.toHaveBeenCalled();
  });
});
