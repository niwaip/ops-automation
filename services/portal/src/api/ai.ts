import { apiClient } from './client';

// AI Model types for admin page
export type ModelProvider = 'openai' | 'anthropic' | 'azure' | 'local' | 'alibaba-coding' | 'alibaba-bailian' | 'deepseek';

export interface AIModel {
  id: string;
  name: string;
  provider: ModelProvider;
  api_endpoint: string;
  config: Record<string, unknown>;
  status: 'active' | 'inactive';
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
  config?: Record<string, unknown>;
}

export interface UpdateAIModelRequest {
  name?: string;
  endpoint?: string;
  apiKey?: string;
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

// AI Model API
export const aiModelApi = {
  list: async (): Promise<AIModelListResponse> => {
    return apiClient.get<AIModelListResponse>('/ai/models');
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
    return apiClient.put<AIModel>(`/ai/models/${id}`, data);
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

  testConfig: async (endpoint: string, apiKey: string, modelName: string): Promise<{ success: boolean; response?: string; error?: string }> => {
    return apiClient.post('/ai/models/test-config', { endpoint, apiKey, modelName });
  },
};

// AI Parameter Recognition API
export interface RecognizeParamsRequest {
  template_id: string;
  user_input: string;
  context?: Record<string, unknown>;
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