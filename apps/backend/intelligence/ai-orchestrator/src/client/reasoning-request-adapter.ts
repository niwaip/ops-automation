export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface NormalizedReasoningOption {
  enabled?: boolean;
  effort?: ReasoningEffort;
}

export interface ReasoningAdapterContext {
  provider?: string;
  baseURL: string;
  model: string;
  maxOutputTokens?: number;
}

type ReasoningDialect = 'openrouter' | 'dashscope' | 'minimax' | 'openai' | 'generic';

/**
 * Converts the product-level off/low/medium/high option into provider-native
 * Chat Completions fields. Providers without effort control degrade explicitly
 * to their supported on/off contract instead of emitting an invalid field.
 */
export function applyReasoningRequestAdapter(
  payload: Record<string, unknown>,
  context: ReasoningAdapterContext,
  option?: NormalizedReasoningOption
): void {
  if (option?.enabled === undefined) return;
  const dialect = resolveDialect(context);

  if (option.enabled === false) {
    applyDisabledReasoning(payload, dialect, context.model, context.provider);
    return;
  }

  const effort = option.effort || 'medium';
  switch (dialect) {
    case 'openrouter':
      payload.reasoning = { effort };
      return;
    case 'dashscope':
      payload.enable_thinking = true;
      applyDashScopeThinkingBudget(payload, effort, context.maxOutputTokens);
      return;
    case 'minimax':
      payload.thinking = { type: 'adaptive' };
      return;
    case 'openai':
    case 'generic':
      payload.reasoning_effort = effort;
  }
}

function applyDashScopeThinkingBudget(
  payload: Record<string, unknown>,
  effort: ReasoningEffort,
  maxOutputTokens?: number
): void {
  const requested = {
    low: 1024,
    medium: 2048,
    high: 4096,
  }[effort];
  if (maxOutputTokens === undefined) {
    payload.thinking_budget = requested;
    return;
  }

  const safeBudget = Math.min(requested, maxOutputTokens - 256);
  if (safeBudget > 0) payload.thinking_budget = safeBudget;
}

function applyDisabledReasoning(
  payload: Record<string, unknown>,
  dialect: ReasoningDialect,
  model: string,
  provider?: string
): void {
  const normModel = (model || '').toLowerCase();
  const normProvider = (provider || '').toLowerCase();

  switch (dialect) {
    case 'openrouter':
      delete payload.reasoning;
      return;
    case 'dashscope':
      payload.enable_thinking = false;
      return;
    case 'minimax':
      payload.thinking = { type: 'disabled' };
      return;
    case 'openai':
      // `none` is not accepted by every historical OpenAI reasoning model.
      // Send it only for model families that expose an off mode; non-reasoning
      // models and mandatory-reasoning models safely keep the field omitted.
      if (supportsOpenAiReasoningOff(model)) payload.reasoning_effort = 'none';
      return;
    case 'generic':
      if (normModel.includes('deepseek') || normModel.includes('qwen') || normProvider === 'bai') {
        payload.enable_thinking = false;
      }
      return;
  }
}

function resolveDialect(context: ReasoningAdapterContext): ReasoningDialect {
  const provider = (context.provider || '').toLowerCase();
  const baseURL = context.baseURL.toLowerCase();
  if (provider === 'openrouter' || baseURL.includes('openrouter.ai')) return 'openrouter';
  if (provider === 'alibaba-bailian' || baseURL.includes('dashscope.aliyuncs.com')) {
    return 'dashscope';
  }
  if (provider === 'minimax' || /(?:minimax\.chat|minimax\.io|minimaxi\.com)/i.test(baseURL)) {
    return 'minimax';
  }
  if (provider === 'openai' || baseURL.includes('api.openai.com')) return 'openai';
  return 'generic';
}

function supportsOpenAiReasoningOff(model: string): boolean {
  return /^gpt-5\.(?:[1-9]|\d{2,})(?:-|$)/i.test(model);
}
