/**
 * Execution Flow Template API Client
 * 执行流程模板API客户端
 */

import apiClient from './client';
import {
  ExecutionFlowTemplateDTO,
  CreateExecutionFlowTemplateDTO,
  UpdateExecutionFlowTemplateDTO,
  ExecutionFlowStep,
  ValidationResult,
  EXECUTION_FLOW_CATEGORIES,
  STEP_TYPE_LABELS,
  StepType,
} from '../types/execution-flow';

export interface ExecutionFlowTemplateListResponse {
  templates: ExecutionFlowTemplateDTO[];
  total: number;
}

export interface CategoryResponse {
  categories: { key: string; label: string; color: string; count: number }[];
}

export interface ValidateResponse {
  validationResult: ValidationResult;
}

export const executionFlowApi = {
  /**
   * 获取所有流程模板列表
   */
  list: async (options?: {
    category?: string;
    isPublic?: boolean;
    isActive?: boolean;
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<ExecutionFlowTemplateListResponse> => {
    const params = new URLSearchParams();
    if (options?.category) params.append('category', options.category);
    if (options?.isPublic !== undefined) params.append('isPublic', String(options.isPublic));
    if (options?.isActive !== undefined) params.append('isActive', String(options.isActive));
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));
    if (options?.search) params.append('search', options.search);

    return apiClient.get<ExecutionFlowTemplateListResponse>(
      `/execution-flow-templates?${params.toString()}`
    );
  },

  /**
   * 获取单个模板详情
   */
  getById: async (id: string): Promise<ExecutionFlowTemplateDTO> => {
    return apiClient.get<ExecutionFlowTemplateDTO>(`/execution-flow-templates/${id}`);
  },

  /**
   * 创建新模板
   */
  create: async (data: CreateExecutionFlowTemplateDTO): Promise<ExecutionFlowTemplateDTO> => {
    return apiClient.post<ExecutionFlowTemplateDTO>('/execution-flow-templates', data);
  },

  /**
   * 更新模板
   */
  update: async (id: string, data: UpdateExecutionFlowTemplateDTO): Promise<ExecutionFlowTemplateDTO> => {
    return apiClient.put<ExecutionFlowTemplateDTO>(`/execution-flow-templates/${id}`, data);
  },

  /**
   * 删除模板
   */
  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiClient.delete(`/execution-flow-templates/${id}`);
  },

  /**
   * 验证流程模板 - AI验证功能
   */
  validate: async (id: string, aiServiceUrl?: string): Promise<ValidateResponse> => {
    const params = aiServiceUrl ? `?aiServiceUrl=${encodeURIComponent(aiServiceUrl)}` : '';
    return apiClient.post<ValidateResponse>(
      `/execution-flow-templates/${id}/validate${params}`
    );
  },

  /**
   * 复制模板（创建副本）
   */
  clone: async (id: string, newName: string): Promise<ExecutionFlowTemplateDTO> => {
    return apiClient.post<ExecutionFlowTemplateDTO>(
      `/execution-flow-templates/${id}/clone`,
      { name: newName }
    );
  },

  /**
   * 导出模板为JSON格式
   */
  export: async (id: string): Promise<{ data: string }> => {
    return apiClient.get<{ data: string }>(`/execution-flow-templates/${id}/export`);
  },

  /**
   * 导入模板（从JSON格式）
   */
  import: async (jsonData: string): Promise<ExecutionFlowTemplateDTO> => {
    return apiClient.post<ExecutionFlowTemplateDTO>(
      '/execution-flow-templates/import',
      { data: jsonData }
    );
  },

  /**
   * 使用模板（增加使用计数）
   */
  use: async (id: string): Promise<{ success: boolean }> => {
    return apiClient.post(`/execution-flow-templates/${id}/use`);
  },

  /**
   * 获取热门模板
   */
  getPopular: async (limit?: number): Promise<{ templates: ExecutionFlowTemplateDTO[] }> => {
    const params = limit ? `?limit=${limit}` : '';
    return apiClient.get<{ templates: ExecutionFlowTemplateDTO[] }>(
      `/execution-flow-templates/popular${params}`
    );
  },

  /**
   * 获取模板分类列表
   */
  getCategories: async (): Promise<CategoryResponse> => {
    return apiClient.get<CategoryResponse>('/execution-flow-templates/categories');
  },
};

// Export types for frontend use
export {
  ExecutionFlowTemplateDTO,
  CreateExecutionFlowTemplateDTO,
  UpdateExecutionFlowTemplateDTO,
  ExecutionFlowStep,
  ValidationResult,
  EXECUTION_FLOW_CATEGORIES,
  STEP_TYPE_LABELS,
  StepType,
};