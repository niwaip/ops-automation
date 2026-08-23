import { applyAnthropicReasoningRequestAdapter } from './anthropic-reasoning-request-adapter';

describe('applyAnthropicReasoningRequestAdapter', () => {
  it.each(['low', 'medium', 'high'] as const)(
    'maps adaptive Claude %s effort to native Messages fields',
    (effort) => {
      const payload: Record<string, unknown> = {};

      applyAnthropicReasoningRequestAdapter(
        payload,
        { provider: 'anthropic', model: 'claude-sonnet-4-6', maxOutputTokens: 6000 },
        { enabled: true, effort }
      );

      expect(payload).toEqual({
        thinking: { type: 'adaptive' },
        output_config: { effort },
      });
    }
  );

  it('explicitly disables adaptive Claude thinking', () => {
    const payload: Record<string, unknown> = {};

    applyAnthropicReasoningRequestAdapter(
      payload,
      { provider: 'anthropic', model: 'claude-sonnet-5', maxOutputTokens: 6000 },
      { enabled: false }
    );

    expect(payload).toEqual({ thinking: { type: 'disabled' } });
  });

  it.each([
    ['low', 1024],
    ['medium', 2048],
    ['high', 4096],
  ] as const)('maps legacy Claude %s effort to a safe token budget', (effort, budgetTokens) => {
    const payload: Record<string, unknown> = {};

    applyAnthropicReasoningRequestAdapter(
      payload,
      { provider: 'anthropic', model: 'claude-sonnet-4-5', maxOutputTokens: 6000 },
      { enabled: true, effort }
    );

    expect(payload).toEqual({
      thinking: { type: 'enabled', budget_tokens: budgetTokens },
    });
  });

  it('does not emit an invalid legacy budget when the output cap is too small', () => {
    const payload: Record<string, unknown> = {};

    applyAnthropicReasoningRequestAdapter(
      payload,
      { provider: 'anthropic', model: 'claude-haiku-4-5', maxOutputTokens: 1200 },
      { enabled: true, effort: 'low' }
    );

    expect(payload).toEqual({});
  });

  it('degrades MiniMax effort levels to its adaptive on/off contract', () => {
    const enabledPayload: Record<string, unknown> = {};
    const disabledPayload: Record<string, unknown> = {};
    const context = { provider: 'minimax', model: 'MiniMax-M2.7', maxOutputTokens: 6000 };

    applyAnthropicReasoningRequestAdapter(enabledPayload, context, {
      enabled: true,
      effort: 'high',
    });
    applyAnthropicReasoningRequestAdapter(disabledPayload, context, { enabled: false });

    expect(enabledPayload).toEqual({ thinking: { type: 'adaptive' } });
    expect(disabledPayload).toEqual({ thinking: { type: 'disabled' } });
  });
});
