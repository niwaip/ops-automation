import { apiClient } from './client';

// AI Model types for admin page
export type ModelProvider =
  | 'openai'
  | 'anthropic'
  | 'azure'
  | 'local'
  | 'alibaba-coding'
  | 'alibaba-bailian'
  | 'deepseek'
  | 'minimax'
  | 'siliconflow';

export type ModelCapabilityTier = 'standard' | 'advanced';

export interface AIModelConfig {
  display_name?: string;
  description?: string;
  default?: boolean;
  routing_tags?: string[];
  input?: string[];
  capability_tier?: ModelCapabilityTier;
  default_scope?: {
    global?: boolean;
    admin_chat?: boolean;
    admin_task?: boolean;
    audio_transcription?: boolean;
  };
  routing_preferences?: {
    prefer_for_code?: boolean;
  };
  [key: string]: unknown;
}

export interface AIModel {
  id: string;
  name: string;
  provider: ModelProvider;
  api_endpoint: string;
  providerConfigId?: string;
  config: AIModelConfig;
  status: 'active' | 'inactive';
  hasApiKey?: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AIModelListResponse {
  models: AIModel[];
  total: number;
}

export interface CreateAIModelRequest {
  name: string;
  provider: ModelProvider;
  api_endpoint: string;
  providerConfigId?: string;
  api_key?: string; // Optional API key for direct input
  config?: AIModelConfig;
}

export interface UpdateAIModelRequest {
  name?: string;
  api_endpoint?: string;
  providerConfigId?: string;
  api_key?: string;
  config?: AIModelConfig;
}

export interface PromptDebugSettings {
  promptDebugEnabled: boolean;
}

export interface AIProviderSummary {
  id: string;
  provider: string;
  api_endpoint: string;
  modelCount: number;
  activeModelCount: number;
  hasCredential: boolean;
  advancedModelCount: number;
  defaultScopes: Array<'global' | 'admin_chat' | 'admin_task' | 'audio_transcription'>;
}

export interface AIProviderSummaryResponse {
  providers: AIProviderSummary[];
}

export interface AIProviderConfig {
  id: string;
  provider: string;
  api_endpoint: string;
  hasCredential?: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AIProviderConfigResponse {
  providers: AIProviderConfig[];
}

export interface AIProviderModelListResponse {
  providerConfigId: string;
  models: string[];
}

export interface CreateAIProviderConfigRequest {
  provider: ModelProvider;
  api_endpoint: string;
  api_key?: string;
  env_key?: string;
  secret_type?: 'vault' | 'env' | 'k8s_secret';
}

export interface UpdateAIProviderConfigRequest {
  provider?: ModelProvider;
  api_endpoint?: string;
  api_key?: string;
  env_key?: string;
  secret_type?: 'vault' | 'env' | 'k8s_secret';
}

// AI Model API
export const aiModelApi = {
  list: async (): Promise<AIModelListResponse> => {
    return apiClient.get<AIModelListResponse>('/ai/models');
  },

  listForAdmin: async (): Promise<AIModelListResponse> => {
    return apiClient.get<AIModelListResponse>('/ai/models/admin');
  },

  listProviders: async (): Promise<AIProviderSummaryResponse> => {
    return apiClient.get<AIProviderSummaryResponse>('/ai/models/providers');
  },

  listProviderConfigs: async (): Promise<AIProviderConfigResponse> => {
    return apiClient.get<AIProviderConfigResponse>('/ai/providers');
  },

  getProviderConfig: async (id: string): Promise<AIProviderConfig> => {
    return apiClient.get<AIProviderConfig>(`/ai/providers/${id}`);
  },

  createProviderConfig: async (data: CreateAIProviderConfigRequest): Promise<AIProviderConfig> => {
    return apiClient.post<AIProviderConfig>('/ai/providers', data);
  },

  updateProviderConfig: async (
    id: string,
    data: UpdateAIProviderConfigRequest
  ): Promise<AIProviderConfig> => {
    return apiClient.patch<AIProviderConfig>(`/ai/providers/${id}`, data);
  },

  checkProviderHealth: async (
    id: string
  ): Promise<{ success: boolean; response?: string; error?: string }> => {
    return apiClient.post(`/ai/providers/${id}/health`);
  },

  listProviderModels: async (id: string): Promise<AIProviderModelListResponse> => {
    return apiClient.get<AIProviderModelListResponse>(`/ai/providers/${id}/models`);
  },

  getById: async (id: string): Promise<AIModel> => {
    return apiClient.get<AIModel>(`/ai/models/${id}`);
  },

  create: async (data: CreateAIModelRequest): Promise<AIModel> => {
    return apiClient.post<AIModel>('/ai/models', data);
  },

  update: async (id: string, data: UpdateAIModelRequest): Promise<AIModel> => {
    return apiClient.patch<AIModel>(`/ai/models/${id}`, data);
  },

  delete: async (id: string): Promise<void> => {
    return apiClient.delete(`/ai/models/${id}`);
  },

  enable: async (id: string): Promise<AIModel> => {
    return apiClient.patch<AIModel>(`/ai/models/${id}/enable`);
  },

  disable: async (id: string): Promise<AIModel> => {
    return apiClient.patch<AIModel>(`/ai/models/${id}/disable`);
  },

  test: async (
    id: string,
    prompt: string
  ): Promise<{ success: boolean; response?: string; error?: string }> => {
    return apiClient.post(`/ai/models/${id}/test`, { prompt });
  },

  testConfigWithStoredKey: async (
    id: string
  ): Promise<{ success: boolean; response?: string; error?: string }> => {
    return apiClient.post(`/ai/models/${id}/test-config`);
  },

  testConfig: async (
    endpoint: string,
    apiKey: string,
    modelName: string
  ): Promise<{ success: boolean; response?: string; error?: string }> => {
    return apiClient.post('/ai/models/test-config', { endpoint, apiKey, modelName });
  },

  getDebugSettings: async (): Promise<PromptDebugSettings> => {
    return apiClient.get<PromptDebugSettings>('/ai/debug-settings');
  },

  updateDebugSettings: async (data: PromptDebugSettings): Promise<PromptDebugSettings> => {
    return apiClient.patch<PromptDebugSettings>('/ai/debug-settings', data);
  },
};

// AI Parameter Recognition API
export interface RecognizeParamsRequest {
  template_id: string;
  user_input: string;
  context?: Record<string, unknown>;
  // 传入模版的 params_schema，让 AI 能够正确识别参数
  params_schema?: {
    properties: Record<
      string,
      {
        type: string;
        description?: string;
        default?: string | number | boolean;
      }
    >;
    required?: string[];
  };
}

export interface RecognizeParamsResponse {
  params: Record<string, unknown>;
  confidence: number;
  suggestions?: string[];
}

export const aiApi = {
  recognizeParams: async (data: RecognizeParamsRequest): Promise<RecognizeParamsResponse> => {
    return apiClient.post<RecognizeParamsResponse>('/ai/recognize-params', data);
  },
};
