import { apiClient } from './client';

// AI Model types for admin page
export type ModelProvider = 'openai' | 'anthropic' | 'azure' | 'local';

export interface AIModel {
  id: string;
  name: string;
  provider: ModelProvider;
  type: 'chat' | 'embedding' | 'image';
  endpoint: string;
  apiKey?: string;
  config: Record<string, unknown>;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIModelListResponse {
  models: AIModel[];
  total: number;
}

export interface CreateAIModelRequest {
  name: string;
  provider: ModelProvider;
  type: 'chat' | 'embedding' | 'image';
  endpoint: string;
  apiKey?: string;
  config?: Record<string, unknown>;
}

export interface UpdateAIModelRequest {
  name?: string;
  endpoint?: string;
  apiKey?: string;
  config?: Record<string, unknown>;
}

// AI Model API
export const aiModelApi = {
  list: async (): Promise<AIModelListResponse> => {
    return apiClient.get<AIModelListResponse>('/ai/models');
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
};