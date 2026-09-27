import type { AIModel } from '@ops/user-core';

export type ReasoningEffort = 'low' | 'medium' | 'high';

export const supportsNativeReasoning = (model?: AIModel | null): boolean => {
  if (!model) {
    return false;
  }

  const name = model.name || '';
  const provider = (model.provider || '').toLowerCase();

  return (
    model.config?.supports_reasoning === true ||
    model.config?.reasoning?.supported === true ||
    (model.config?.reasoning as any)?.enabled === true ||
    (provider === 'minimax' && /^MiniMax-M/i.test(name)) ||
    /^(o1|o3|o4|qwq)/i.test(name) ||
    /(reasoner|reasoning|deepseek-r1)/i.test(name) ||
    ((provider === 'gemini' || provider === 'google') && /(?:thinking|2\.5)/i.test(name)) ||
    /35b/i.test(name)
  );
};

export const getModelDefaultReasoningEffort = (model?: AIModel | null): ReasoningEffort => {
  if (!model?.config) return 'medium';
  const effort =
    (model.config as any).reasoning_effort ||
    (model.config as any).reasoning?.effort;
  if (effort === 'low' || effort === 'high' || effort === 'medium') {
    return effort;
  }
  return 'medium';
};
