import { apiClient } from './client';

// AI Model types for admin page
export type ModelProvider = 'openai' | 'anthropic' | 'azure' | 'local' | 'alibaba-coding' | 'alibaba-bailian' | 'deepseek' | 'minimax';

export interface AIModel {
  id: string;
  name: string;
  provider: ModelProvider;
  api_endpoint: string;
  config: Record<string, unknown>;
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
  api_key?: string; // Optional API key for direct input
  config?: Record<string, unknown>;
}

export interface UpdateAIModelRequest {
  name?: string;
  api_endpoint?: string;
  api_key?: string;
  config?: Record<string, unknown>;
}

export interface PresetModelStatus {
  name: string;
  provider: string;
  configured: boolean;
  default?: boolean;
  description?: string;
}

export interface PresetModelsResponse {
  presets: PresetModelStatus[];
}

export interface PromptDebugSettings {
  promptDebugEnabled: boolean;
}

// AI Model API
export const aiModelApi = {
  list: async (): Promise<AIModelListResponse> => {
    return apiClient.get<AIModelListResponse>('/ai/models');
  },

  listForAdmin: async (): Promise<AIModelListResponse> => {
    return apiClient.get<AIModelListResponse>('/ai/models/admin');
  },

  listPresets: async (): Promise<PresetModelsResponse> => {
    return apiClient.get<PresetModelsResponse>('/ai/models/presets');
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

  test: async (id: string, prompt: string): Promise<{ success: boolean; response?: string; error?: string }> => {
    return apiClient.post(`/ai/models/${id}/test`, { prompt });
  },

  testConfigWithStoredKey: async (id: string): Promise<{ success: boolean; response?: string; error?: string }> => {
    return apiClient.post(`/ai/models/${id}/test-config`);
  },

  testConfig: async (endpoint: string, apiKey: string, modelName: string): Promise<{ success: boolean; response?: string; error?: string }> => {
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
    properties: Record<string, {
      type: string;
      description?: string;
      default?: string | number | boolean;
    }>;
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
