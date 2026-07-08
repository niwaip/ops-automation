import type { AIModel } from '@ops/user-core';

export const supportsNativeReasoning = (model?: AIModel | null): boolean => {
  if (!model) {
    return false;
  }

  return (
    model.config?.supports_reasoning === true ||
    model.config?.reasoning?.supported === true ||
    (model.provider === 'minimax' && /^MiniMax-M/i.test(model.name)) ||
    /^(o1|o3|o4|qwq)/i.test(model.name) ||
    /(reasoner|reasoning|deepseek-r1)/i.test(model.name)
  );
};
