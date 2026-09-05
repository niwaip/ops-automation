import { applyReasoningRequestAdapter } from './reasoning-request-adapter';

describe('applyReasoningRequestAdapter', () => {
  it.each([
    ['low', { reasoning: { effort: 'low' } }],
    ['medium', { reasoning: { effort: 'medium' } }],
    ['high', { reasoning: { effort: 'high' } }],
  ] as const)('maps OpenRouter %s effort', (effort, expected) => {
    const payload: Record<string, unknown> = {};
    applyReasoningRequestAdapter(
      payload,
      {
        provider: 'openrouter',
        baseURL: 'https://openrouter.ai/api/v1',
        model: 'stealth/ox-alpha',
      },
      { enabled: true, effort }
    );
    expect(payload).toEqual(expected);
  });

  it('omits reasoning for OpenRouter when disabled', () => {
    const payload: Record<string, unknown> = {};
    applyReasoningRequestAdapter(
      payload,
      {
        provider: 'openrouter',
        baseURL: 'https://openrouter.ai/api/v1',
        model: 'stealth/ox-alpha',
      },
      { enabled: false }
    );
    expect(payload).toEqual({});
  });

  it('maps DashScope effort to its thinking switch and token budget', () => {
    const payload: Record<string, unknown> = {};
    applyReasoningRequestAdapter(
      payload,
      {
        provider: 'alibaba-bailian',
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        model: 'qwen',
        maxOutputTokens: 6000,
      },
      { enabled: true, effort: 'medium' }
    );
    expect(payload).toEqual({ enable_thinking: true, thinking_budget: 2048 });
  });

  it('degrades MiniMax effort to adaptive thinking and supports off', () => {
    const enabledPayload: Record<string, unknown> = {};
    const disabledPayload: Record<string, unknown> = {};
    const context = {
      provider: 'minimax',
      baseURL: 'https://api.minimax.io/v1',
      model: 'MiniMax-M3',
    };
    applyReasoningRequestAdapter(enabledPayload, context, {
      enabled: true,
      effort: 'low',
    });
    applyReasoningRequestAdapter(disabledPayload, context, { enabled: false });
    expect(enabledPayload).toEqual({ thinking: { type: 'adaptive' } });
    expect(disabledPayload).toEqual({ thinking: { type: 'disabled' } });
  });

  it('uses reasoning_effort for generic compatible endpoints only when enabled', () => {
    const enabledPayload: Record<string, unknown> = {};
    const disabledPayload: Record<string, unknown> = {};
    const context = { provider: 'local', baseURL: 'http://model/v1', model: 'generic-model' };
    applyReasoningRequestAdapter(enabledPayload, context, {
      enabled: true,
      effort: 'medium',
    });
    applyReasoningRequestAdapter(disabledPayload, context, { enabled: false });
    expect(enabledPayload).toEqual({ reasoning_effort: 'medium' });
    expect(disabledPayload).toEqual({});
  });

  it('maps Gemini effort to reasoning_effort and removes it when disabled', () => {
    const enabledPayload: Record<string, unknown> = {};
    const disabledPayload: Record<string, unknown> = {};
    const context = {
      provider: 'gemini',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: 'gemini-2.5-pro',
    };
    applyReasoningRequestAdapter(enabledPayload, context, {
      enabled: true,
      effort: 'high',
    });
    applyReasoningRequestAdapter(disabledPayload, context, { enabled: false });
    expect(enabledPayload).toEqual({ reasoning_effort: 'high' });
    expect(disabledPayload).toEqual({});
  });
});
