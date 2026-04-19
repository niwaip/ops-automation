/**
 * Preset AI Model Configurations
 * Pre-configured models for common AI providers
 */

export interface PresetModelConfig {
  name: string;
  provider: string;
  api_endpoint: string;
  model_id: string;
  description: string;
  env_key: string; // Environment variable name for API key
  config?: Record<string, unknown>;
}

/**
 * Alibaba Cloud DashScope Coding (阿里云 DashScope Coding)
 * OpenAI-compatible API endpoint for coding models
 * https://help.aliyun.com/zh/model-studio/openclaw-coding-plan
 * Default model: MiniMax-M2.7
 */
export const ALIBABA_CODING_MODELS: PresetModelConfig[] = [
  {
    name: 'qwen3.5-plus',
    provider: 'alibaba-coding',
    api_endpoint: 'https://coding.dashscope.aliyuncs.com/v1',
    model_id: 'qwen3.5-plus',
    description: '阿里云 Coding - Qwen3.5 Plus (支持文本和图像)',
    env_key: 'ALIBABA_CODING_API_KEY',
    config: {
      max_tokens: 65536,
      temperature: 0.7,
      context_window: 1000000,
      input: ['text', 'image'],
    },
  },
  {
    name: 'qwen3-max-2026-01-23',
    provider: 'alibaba-coding',
    api_endpoint: 'https://coding.dashscope.aliyuncs.com/v1',
    model_id: 'qwen3-max-2026-01-23',
    description: '阿里云 Coding - Qwen3 Max (高性能模型)',
    env_key: 'ALIBABA_CODING_API_KEY',
    config: {
      max_tokens: 65536,
      temperature: 0.7,
      context_window: 262144,
      input: ['text'],
    },
  },
  {
    name: 'qwen3-coder-next',
    provider: 'alibaba-coding',
    api_endpoint: 'https://coding.dashscope.aliyuncs.com/v1',
    model_id: 'qwen3-coder-next',
    description: '阿里云 Coding - Qwen3 Coder Next (编程模型)',
    env_key: 'ALIBABA_CODING_API_KEY',
    config: {
      max_tokens: 65536,
      temperature: 0.7,
      context_window: 262144,
      input: ['text'],
    },
  },
  {
    name: 'qwen3-coder-plus',
    provider: 'alibaba-coding',
    api_endpoint: 'https://coding.dashscope.aliyuncs.com/v1',
    model_id: 'qwen3-coder-plus',
    description: '阿里云 Coding - Qwen3 Coder Plus (高性能编程模型)',
    env_key: 'ALIBABA_CODING_API_KEY',
    config: {
      max_tokens: 65536,
      temperature: 0.7,
      context_window: 1000000,
      input: ['text'],
    },
  },
  {
    name: 'MiniMax-M2.5',
    provider: 'alibaba-coding',
    api_endpoint: 'https://coding.dashscope.aliyuncs.com/v1',
    model_id: 'MiniMax-M2.5',
    description: '阿里云 Coding - MiniMax M2.5',
    env_key: 'ALIBABA_CODING_API_KEY',
    config: {
      max_tokens: 32768,
      temperature: 0.7,
      context_window: 196608,
      input: ['text'],
    },
  },
  {
    name: 'glm-5',
    provider: 'alibaba-coding',
    api_endpoint: 'https://coding.dashscope.aliyuncs.com/v1',
    model_id: 'glm-5',
    description: '阿里云 Coding - GLM-5 (智谱模型)',
    env_key: 'ALIBABA_CODING_API_KEY',
    config: {
      max_tokens: 16384,
      temperature: 0.7,
      context_window: 202752,
      input: ['text'],
    },
  },
  {
    name: 'glm-4.7',
    provider: 'alibaba-coding',
    api_endpoint: 'https://coding.dashscope.aliyuncs.com/v1',
    model_id: 'glm-4.7',
    description: '阿里云 Coding - GLM-4.7 (智谱模型)',
    env_key: 'ALIBABA_CODING_API_KEY',
    config: {
      max_tokens: 16384,
      temperature: 0.7,
      context_window: 202752,
      input: ['text'],
    },
  },
  {
    name: 'kimi-k2.5',
    provider: 'alibaba-coding',
    api_endpoint: 'https://coding.dashscope.aliyuncs.com/v1',
    model_id: 'kimi-k2.5',
    description: '阿里云 Coding - Kimi K2.5 (月之暗面模型，支持文本和图像)',
    env_key: 'ALIBABA_CODING_API_KEY',
    config: {
      max_tokens: 32768,
      temperature: 0.7,
      context_window: 262144,
      input: ['text', 'image'],
    },
  },
];

/**
 * Alibaba Cloud Bailian (阿里云百炼)
 * OpenAI-compatible API endpoint
 * https://help.aliyun.com/zh/model-studio/
 */
export const ALIBABA_BAILIAN_MODELS: PresetModelConfig[] = [
  {
    name: 'qwen-plus',
    provider: 'alibaba-bailian',
    api_endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model_id: 'qwen-plus',
    description: '阿里云百炼 - Qwen Plus (通用模型)',
    env_key: 'ALIBABA_BAILIAN_API_KEY',
    config: {
      max_tokens: 8192,
      temperature: 0.7,
    },
  },
  {
    name: 'qwen-turbo',
    provider: 'alibaba-bailian',
    api_endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model_id: 'qwen-turbo',
    description: '阿里云百炼 - Qwen Turbo (快速通用模型)',
    env_key: 'ALIBABA_BAILIAN_API_KEY',
    config: {
      max_tokens: 8192,
      temperature: 0.7,
    },
  },
];

/**
 * OpenAI Models
 */
export const OPENAI_MODELS: PresetModelConfig[] = [
  {
    name: 'gpt-4o',
    provider: 'openai',
    api_endpoint: 'https://api.openai.com/v1',
    model_id: 'gpt-4o',
    description: 'OpenAI - GPT-4o (多模态模型)',
    env_key: 'OPENAI_API_KEY',
    config: {
      max_tokens: 4096,
      temperature: 0.7,
    },
  },
  {
    name: 'gpt-4-turbo',
    provider: 'openai',
    api_endpoint: 'https://api.openai.com/v1',
    model_id: 'gpt-4-turbo',
    description: 'OpenAI - GPT-4 Turbo',
    env_key: 'OPENAI_API_KEY',
    config: {
      max_tokens: 4096,
      temperature: 0.7,
    },
  },
  {
    name: 'gpt-3.5-turbo',
    provider: 'openai',
    api_endpoint: 'https://api.openai.com/v1',
    model_id: 'gpt-3.5-turbo',
    description: 'OpenAI - GPT-3.5 Turbo (快速模型)',
    env_key: 'OPENAI_API_KEY',
    config: {
      max_tokens: 4096,
      temperature: 0.7,
    },
  },
];

/**
 * DeepSeek Models (国产编程模型)
 */
export const DEEPSEEK_MODELS: PresetModelConfig[] = [
  {
    name: 'deepseek-coder',
    provider: 'deepseek',
    api_endpoint: 'https://api.deepseek.com/v1',
    model_id: 'deepseek-coder',
    description: 'DeepSeek - Coder (编程专用模型)',
    env_key: 'DEEPSEEK_API_KEY',
    config: {
      max_tokens: 8192,
      temperature: 0.7,
    },
  },
  {
    name: 'deepseek-chat',
    provider: 'deepseek',
    api_endpoint: 'https://api.deepseek.com/v1',
    model_id: 'deepseek-chat',
    description: 'DeepSeek - Chat (通用对话模型)',
    env_key: 'DEEPSEEK_API_KEY',
    config: {
      max_tokens: 4096,
      temperature: 0.7,
    },
  },
];

/**
 * MiniMax Models (MiniMax AI)
 * OpenAI-compatible API endpoint
 * https://www.minimaxi.com/document
 */
export const MINIMAX_MODELS: PresetModelConfig[] = [
  {
    name: 'MiniMax-Text-01',
    provider: 'minimax',
    api_endpoint: 'https://api.minimax.chat/v1',
    model_id: 'MiniMax-Text-01',
    description: 'MiniMax - Text-01 (高性能文本模型)',
    env_key: 'MINIMAX_API_KEY',
    config: {
      max_tokens: 8192,
      temperature: 0.7,
      context_window: 1000000,
    },
  },
  {
    name: 'abab6.5s-chat',
    provider: 'minimax',
    api_endpoint: 'https://api.minimax.chat/v1',
    model_id: 'abab6.5s-chat',
    description: 'MiniMax - ABAB 6.5S (对话模型)',
    env_key: 'MINIMAX_API_KEY',
    config: {
      max_tokens: 4096,
      temperature: 0.7,
    },
  },
  {
    name: 'abab6.5-chat',
    provider: 'minimax',
    api_endpoint: 'https://api.minimax.chat/v1',
    model_id: 'abab6.5-chat',
    description: 'MiniMax - ABAB 6.5 (高性能对话模型)',
    env_key: 'MINIMAX_API_KEY',
    config: {
      max_tokens: 4096,
      temperature: 0.7,
    },
  },
  {
    name: 'MiniMax-M2.7',
    provider: 'minimax',
    api_endpoint: 'https://api.minimax.chat/v1',
    model_id: 'MiniMax-M2.7',
    description: 'MiniMax - M2.7 (默认模型)',
    env_key: 'MINIMAX_API_KEY',
    config: {
      max_tokens: 32768,
      temperature: 0.7,
      context_window: 196608,
      default: true,
    },
  },
];

/**
 * All preset models
 */
export const PRESET_MODELS: PresetModelConfig[] = [
  ...ALIBABA_CODING_MODELS,
  ...ALIBABA_BAILIAN_MODELS,
  ...OPENAI_MODELS,
  ...DEEPSEEK_MODELS,
  ...MINIMAX_MODELS,
];

/**
 * Get preset models by provider
 */
export function getPresetModelsByProvider(provider: string): PresetModelConfig[] {
  return PRESET_MODELS.filter(m => m.provider === provider);
}

/**
 * Get the default model for a provider
 */
export function getDefaultModelForProvider(provider: string): PresetModelConfig | null {
  const models = getPresetModelsByProvider(provider);
  return models.find(m => m.config?.default) || models[0] || null;
}

/**
 * Get all available providers
 */
export function getAvailableProviders(): string[] {
  return Array.from(new Set(PRESET_MODELS.map(m => m.provider)));
}