import { AIModelConfig, ModelCapabilityTier, ModelProvider } from '@/api/ai';

export interface AIModelFilterState {
  search?: string;
  provider?: string;
  status?: string;
  tier?: string;
}

export type AIModelTabKey = 'models' | 'providers';

export const PROVIDER_NAMES: Record<string, string> = {
  bai: 'B.AI',
  'b.ai': 'B.AI',
  'alibaba-coding': '阿里云 Coding',
  'alibaba-bailian': '阿里云百炼',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  azure: 'Azure OpenAI',
  deepseek: 'DeepSeek',
  minimax: 'MiniMax',
  bigmodel: '智谱 BigModel',
  siliconflow: 'SiliconFlow',
  openrouter: 'OpenRouter',
  gemini: 'Google Gemini',
  google: 'Google Gemini',
  local: '本地模型',
};

export const PRESET_ENDPOINTS: Record<string, string> = {
  bai: 'https://api.b.ai/v1',
  'b.ai': 'https://api.b.ai/v1',
  'alibaba-coding': 'https://coding.dashscope.aliyuncs.com/v1',
  'alibaba-bailian': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  minimax: 'https://api.minimax.chat/v1',
  bigmodel: 'https://open.bigmodel.cn/api/paas/v4',
  siliconflow: 'https://api.siliconflow.cn/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
};

export const PROVIDER_OPTIONS: ModelProvider[] = [
  'bai',
  'alibaba-coding',
  'alibaba-bailian',
  'openai',
  'anthropic',
  'azure',
  'deepseek',
  'minimax',
  'bigmodel',
  'siliconflow',
  'openrouter',
  'gemini',
  'local',
];

export const DEFAULT_SCOPE_OPTIONS = [
  { label: '全体默认', value: 'global' },
  { label: '管理员 AI', value: 'admin_chat' },
  { label: '管理员任务', value: 'admin_task' },
  { label: '语音识别', value: 'audio_transcription' },
];

export const ROUTING_TAG_OPTIONS = [
  { label: '聊天', value: 'chat' },
  { label: '代码', value: 'code' },
  { label: '文档', value: 'document' },
  { label: '流程', value: 'flow' },
  { label: '查询', value: 'query' },
  { label: '多模态', value: 'multimodal' },
];

export const SCOPE_TAG_META: Record<string, { label: string; color: string }> = {
  global: { label: '全体默认', color: 'blue' },
  admin_chat: { label: '管理员 AI', color: 'purple' },
  admin_task: { label: '管理员任务', color: 'magenta' },
  audio_transcription: { label: '语音识别', color: 'orange' },
};

export function mapConfigToFormValues(config?: AIModelConfig) {
  const safeConfig = config || {};
  const defaultScopes = DEFAULT_SCOPE_OPTIONS.map((item) => item.value).filter(
    (scope) =>
      safeConfig.default_scope?.[scope as keyof NonNullable<AIModelConfig['default_scope']>] ===
      true
  );

  return {
    display_name: safeConfig.display_name,
    description: safeConfig.description,
    capability_tier: safeConfig.capability_tier || 'standard',
    defaultScopes,
    routing_tags: Array.isArray(safeConfig.routing_tags) ? safeConfig.routing_tags : [],
    prefer_for_code: safeConfig.routing_preferences?.prefer_for_code === true,
  };
}

export function buildConfigFromValues(values: Record<string, unknown>): AIModelConfig {
  const defaultScopes = Array.isArray(values.defaultScopes)
    ? values.defaultScopes.filter((item): item is string => typeof item === 'string')
    : [];
  const routingTags = Array.isArray(values.routing_tags)
    ? values.routing_tags.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0
      )
    : [];

  return {
    display_name:
      typeof values.display_name === 'string' && values.display_name.trim()
        ? values.display_name.trim()
        : undefined,
    description:
      typeof values.description === 'string' && values.description.trim()
        ? values.description.trim()
        : undefined,
    capability_tier: (values.capability_tier === 'advanced'
      ? 'advanced'
      : 'standard') as ModelCapabilityTier,
    routing_tags: routingTags,
    default_scope: {
      global: defaultScopes.includes('global'),
      admin_chat: defaultScopes.includes('admin_chat'),
      admin_task: defaultScopes.includes('admin_task'),
      audio_transcription: defaultScopes.includes('audio_transcription'),
    },
    routing_preferences: {
      prefer_for_code: values.prefer_for_code === true,
    },
  };
}

export function getProviderIdentity(provider: string, apiEndpoint: string) {
  return `${provider}::${apiEndpoint}`;
}

export function getProviderDisplayName(
  providerConfig?: { name?: string; provider?: string } | null,
  rawProviderKey?: string
): string {
  if (providerConfig?.name?.trim()) {
    const typeLabel =
      (providerConfig.provider && PROVIDER_NAMES[providerConfig.provider]) ||
      providerConfig.provider ||
      '';
    return typeLabel && typeLabel !== providerConfig.name.trim()
      ? `${providerConfig.name.trim()} (${typeLabel})`
      : providerConfig.name.trim();
  }
  if (providerConfig?.provider) {
    return PROVIDER_NAMES[providerConfig.provider] || providerConfig.provider;
  }
  if (rawProviderKey) {
    return PROVIDER_NAMES[rawProviderKey] || rawProviderKey;
  }
  return '未命名服务商';
}

export const getProviderAccent = (provider: string) => {
  switch (provider) {
    case 'gemini':
    case 'google':
      return { solid: '#1a73e8', soft: 'rgba(26, 115, 232, 0.1)' };
    case 'openai':
      return { solid: '#10b981', soft: 'rgba(16, 185, 129, 0.1)' };
    case 'deepseek':
      return { solid: '#7c3aed', soft: 'rgba(124, 58, 237, 0.1)' };
    case 'anthropic':
      return { solid: '#f59e0b', soft: 'rgba(245, 158, 11, 0.1)' };
    case 'azure':
      return { solid: '#2563eb', soft: 'rgba(37, 99, 235, 0.1)' };
    case 'alibaba-coding':
    case 'alibaba-bailian':
      return { solid: '#ea580c', soft: 'rgba(234, 88, 12, 0.1)' };
    case 'bai':
    case 'b.ai':
      return { solid: '#0284c7', soft: 'rgba(2, 132, 199, 0.1)' };
    case 'openrouter':
      return { solid: '#6366f1', soft: 'rgba(99, 102, 241, 0.1)' };
    case 'local':
      return { solid: '#8b5cf6', soft: 'rgba(139, 92, 246, 0.1)' };
    default:
      return { solid: '#6366f1', soft: 'rgba(99, 102, 241, 0.1)' };
  }
};

export const getProviderMonogram = (name?: string) => {
  if (!name) return 'AI';
  const clean = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').trim();
  if (!clean) return 'AI';
  return clean.slice(0, clean.charCodeAt(0) > 255 ? 2 : 1).toUpperCase();
};
