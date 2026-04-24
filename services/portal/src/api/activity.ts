/**
 * Activity API Client
 * Activity管理API客户端
 */

import apiClient from './client';
import { useAuthStore } from '../store/authStore';
import { postSseStream } from './streaming';

// Activity configuration
export interface ActivityDTO {
  id: string;
  name: string;
  fn: string;
  timeout: string;
  retryPolicy: { maxRetries: number; backoffMs?: number } | null;
  handler: 'api' | 'carbone' | 'browser' | 'script';
  config: Record<string, any>;
  generatedCode?: string; // Top-level field returned by API
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
  generatedCode?: string;
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

export interface GenerateCodeResult {
  success: boolean;
  code?: string;
  error?: string;
}

export interface ExecuteCodeResult {
  success: boolean;
  result?: any;
  logs?: string[];
  error?: string;
}

export interface ExecuteCodeDto {
  code: string;
  fn: string;
  taskQueue: string;
  input?: Record<string, any>;
}

export interface StreamEvent {
  type: 'log' | 'error' | 'done';
  message?: string;
  result?: any;
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
  update: async (id: string, data: Partial<CreateActivityDto>): Promise<ActivityDTO> => {
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

  generateCode: async (config: CreateActivityDto, errorContext?: string): Promise<GenerateCodeResult> => {
    return apiClient.post<GenerateCodeResult>('/activities/generate-code', { config, errorContext });
  },

  executeCode: async (data: ExecuteCodeDto): Promise<ExecuteCodeResult> => {
    return apiClient.post<ExecuteCodeResult>('/activities/execute-code', data);
  },

  // SSE streaming execution
  executeCodeStream: (data: ExecuteCodeDto, onEvent: (event: StreamEvent) => void): Promise<void> => {
    const token = useAuthStore.getState().accessToken;
    return postSseStream({
      url: '/api/activities/execute-code/stream',
      payload: data as unknown as Record<string, unknown>,
      token,
      requireDoneEvent: true,
      onEvent: onEvent as (event: { type: string; [key: string]: unknown }) => void,
    });
  },
};
