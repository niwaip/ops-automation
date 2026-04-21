import apiClient from './client';

export interface ActivityDTO {
  id: string;
  name: string;
  fn: string;
  timeout: string;
  retryPolicy: { maxRetries: number; backoffMs?: number } | null;
  handler: 'api' | 'carbone' | 'browser' | 'script';
  config: Record<string, any>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateActivityDto {
  name: string;
  fn: string;
  timeout?: string;
  retryPolicy?: { maxRetries: number; backoffMs?: number };
  handler: 'api' | 'carbone' | 'browser' | 'script';
  config: Record<string, any>;
}

export interface ActivityValidationResult {
  isValid: boolean;
  score: number;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export const activityApi = {
  list: async (): Promise<ActivityDTO[]> => {
    return apiClient.get<ActivityDTO[]>('/activities');
  },

  getById: async (id: string): Promise<ActivityDTO> => {
    return apiClient.get<ActivityDTO>(`/activities/${id}`);
  },

  create: async (data: CreateActivityDto): Promise<ActivityDTO> => {
    return apiClient.post<ActivityDTO>('/activities', data);
  },

  update: async (id: string, data: Partial<CreateActivityDto>): Promise<ActivityDTO> => {
    return apiClient.put<ActivityDTO>(`/activities/${id}`, data);
  },

  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiClient.delete(`/activities/${id}`);
  },

  validate: async (config: CreateActivityDto): Promise<ActivityValidationResult> => {
    return apiClient.post<ActivityValidationResult>('/activities/validate', config);
  },
};