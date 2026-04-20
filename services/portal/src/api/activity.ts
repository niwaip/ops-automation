/**
 * Activity API Client
 * Activity管理API客户端
 */

import apiClient from './client';

// Activity configuration
export interface ActivityDTO {
  id: string;
  name: string;
  fn: string;
  timeout: string;
  retryPolicy?: { maxRetries: number };
  handler: 'api' | 'carbone' | 'browser' | 'script';
  config: Record<string, any>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Create DTO
export interface CreateActivityDto {
  name: string;
  fn: string;
  timeout: string;
  retryPolicy?: { maxRetries: number };
  handler: 'api' | 'carbone' | 'browser' | 'script';
  config: Record<string, any>;
}

// Update DTO
export interface UpdateActivityDto {
  name?: string;
  fn?: string;
  timeout?: string;
  retryPolicy?: { maxRetries: number };
  handler?: 'api' | 'carbone' | 'browser' | 'script';
  config?: Record<string, any>;
  isActive?: boolean;
}

// Validation result
export interface ActivityValidationResult {
  isValid: boolean;
  score: number;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export const activityApi = {
  /**
   * 获取所有 Activity 列表
   */
  list: async (handler?: string): Promise<ActivityDTO[]> => {
    const params = handler ? `?handler=${handler}` : '';
    return apiClient.get<ActivityDTO[]>(`/activities${params}`);
  },

  /**
   * 获取单个 Activity 详情
   */
  getById: async (id: string): Promise<ActivityDTO> => {
    return apiClient.get<ActivityDTO>(`/activities/${id}`);
  },

  /**
   * 创建新 Activity
   */
  create: async (data: CreateActivityDto): Promise<ActivityDTO> => {
    return apiClient.post<ActivityDTO>('/activities', data);
  },

  /**
   * 更新 Activity
   */
  update: async (id: string, data: UpdateActivityDto): Promise<ActivityDTO> => {
    return apiClient.put<ActivityDTO>(`/activities/${id}`, data);
  },

  /**
   * 删除 Activity
   */
  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiClient.delete(`/activities/${id}`);
  },

  /**
   * 验证 Activity 配置
   */
  validate: async (config: CreateActivityDto): Promise<ActivityValidationResult> => {
    return apiClient.post<ActivityValidationResult>('/activities/validate', config);
  },
};