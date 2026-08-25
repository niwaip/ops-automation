import { ModelInvocationTelemetryService } from './model-invocation-telemetry.service';

describe('ModelInvocationTelemetryService', () => {
  const original = process.env.MODEL_INVOCATION_LEDGER_ENABLED;

  afterEach(() => {
    if (original === undefined) delete process.env.MODEL_INVOCATION_LEDGER_ENABLED;
    else process.env.MODEL_INVOCATION_LEDGER_ENABLED = original;
  });

  it('is disabled by default', async () => {
    delete process.env.MODEL_INVOCATION_LEDGER_ENABLED;
    const controlPlane = { recordModelInvocation: jest.fn() };
    const service = new ModelInvocationTelemetryService(controlPlane as any);
    await service.record({
      modelId: 'model-1',
      provider: 'openai',
      prompt: 'hello',
      response: {
        content: 'world',
        usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
      },
    });
    expect(controlPlane.recordModelInvocation).not.toHaveBeenCalled();
  });

  it('persists digests and attributable usage when enabled', async () => {
    process.env.MODEL_INVOCATION_LEDGER_ENABLED = 'true';
    const controlPlane = { recordModelInvocation: jest.fn().mockResolvedValue({}) };
    const service = new ModelInvocationTelemetryService(controlPlane as any);
    await service.record({
      modelId: 'model-1',
      provider: 'openai',
      prompt: 'stable prompt',
      response: {
        content: 'world',
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
      },
      context: {
        executionId: 'execution-1',
        purpose: 'topology',
        promptTemplateVersion: 'topology/v1',
        systemPrompt: 'system',
        user: { userId: 'user-1' },
      },
    });
    expect(controlPlane.recordModelInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'topology',
        inputTokens: 10,
        outputTokens: 2,
        promptTemplateDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        systemPromptDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      expect.any(Object)
    );
  });
});
