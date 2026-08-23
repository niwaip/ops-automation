import type { NormalizedReasoningOption, ReasoningEffort } from './reasoning-request-adapter';

export interface AnthropicReasoningAdapterContext {
  provider?: string;
  model: string;
  maxOutputTokens: number;
}

/**
 * Converts the shared off/low/medium/high option into Anthropic Messages
 * fields. New Claude families use adaptive thinking and output_config.effort;
 * legacy Claude families use a bounded token budget. Anthropic-compatible
 * providers are only configured when their documented dialect is known.
 */
export function applyAnthropicReasoningRequestAdapter(
  payload: Record<string, unknown>,
  context: AnthropicReasoningAdapterContext,
  option?: NormalizedReasoningOption
): void {
  if (option?.enabled === undefined) return;

  const family = resolveAnthropicReasoningFamily(context);
  if (option.enabled === false) {
    if (family === 'claude-adaptive' || family === 'minimax-adaptive') {
      payload.thinking = { type: 'disabled' };
    }
    return;
  }

  const effort = option.effort || 'medium';
  if (family === 'claude-adaptive') {
    payload.thinking = { type: 'adaptive' };
    payload.output_config = { effort };
    return;
  }

  if (family === 'claude-budget') {
    const budgetTokens = resolveLegacyThinkingBudget(effort, context.maxOutputTokens);
    if (budgetTokens !== undefined) {
      payload.thinking = { type: 'enabled', budget_tokens: budgetTokens };
    }
    return;
  }

  if (family === 'minimax-adaptive') {
    payload.thinking = { type: 'adaptive' };
  }
}

type AnthropicReasoningFamily =
  | 'claude-adaptive'
  | 'claude-budget'
  | 'minimax-adaptive'
  | 'unsupported';

function resolveAnthropicReasoningFamily(
  context: AnthropicReasoningAdapterContext
): AnthropicReasoningFamily {
  const provider = (context.provider || '').toLowerCase();
  const model = context.model.toLowerCase();

  if (provider === 'minimax' || model.startsWith('minimax-')) return 'minimax-adaptive';
  if (!model.startsWith('claude-')) return 'unsupported';

  if (isAdaptiveClaudeModel(model)) return 'claude-adaptive';
  return 'claude-budget';
}

function isAdaptiveClaudeModel(model: string): boolean {
  if (/^claude-(?:opus|sonnet)-(?:[5-9]|\d{2,})(?:-|$)/.test(model)) return true;
  const version = model.match(/^claude-(?:opus|sonnet)-4-(\d+)(?:-|$)/)?.[1];
  return version !== undefined && Number(version) >= 6;
}

function resolveLegacyThinkingBudget(
  effort: ReasoningEffort,
  maxOutputTokens: number
): number | undefined {
  // Anthropic requires budget_tokens >= 1024 and strictly below max_tokens.
  if (maxOutputTokens <= 1536) return undefined;

  const requested = {
    low: 1024,
    medium: 2048,
    high: 4096,
  }[effort];
  return Math.min(requested, maxOutputTokens - 512);
}
