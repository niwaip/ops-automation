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
 * Alibaba Cloud Bailian (阿里云百炼)
 * OpenAI-compatible API endpoint
 * https://help.aliyun.com/zh/model-studio/
 */
export const ALIBABA_BAILIAN_MODELS: PresetModelConfig[] = [
  {
    name: 'qwen-coder-plus',
    provider: 'alibaba-bailian',
    api_endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model_id: 'qwen-coder-plus',
    description: '阿里云百炼 - Qwen Coder Plus (高性能编程模型)',
    env_key: 'ALIBABA_BAILIAN_API_KEY',
    config: {
      max_tokens: 8192,
      temperature: 0.7,
    },
  },
  {
    name: 'qwen-coder-turbo',
    provider: 'alibaba-bailian',
    api_endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model_id: 'qwen-coder-turbo',
    description: '阿里云百炼 - Qwen Coder Turbo (快速响应编程模型)',
    env_key: 'ALIBABA_BAILIAN_API_KEY',
    config: {
      max_tokens: 8192,
      temperature: 0.7,
    },
  },
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
 * All preset models
 */
export const PRESET_MODELS: PresetModelConfig[] = [
  ...ALIBABA_BAILIAN_MODELS,
  ...OPENAI_MODELS,
  ...DEEPSEEK_MODELS,
];

/**
 * Get preset models by provider
 */
export function getPresetModelsByProvider(provider: string): PresetModelConfig[] {
  return PRESET_MODELS.filter(m => m.provider === provider);
}

/**
 * Get all available providers
 */
export function getAvailableProviders(): string[] {
  return Array.from(new Set(PRESET_MODELS.map(m => m.provider)));
}