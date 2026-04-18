/**
 * Execution Flow Template API Client
 * 执行流程模板API客户端
 */

import apiClient from './client';

// Step types supported by execution flow
export type StepType = 'text' | 'script' | 'tool' | 'api' | 'llm' | 'validator';

// Single step in the execution flow
export interface ExecutionFlowStep {
  id?: string;
  type: StepType | string;  // 支持扩展类型
  name: string;
  description?: string;
  content?: string;
  expectedOutput?: string;
  condition?: string;  // 执行条件，如 "step_xxx.status == 'success'"
  inputMapping?: Record<string, string>;  // 输入变量映射
  retryPolicy?: {
    maxRetries?: number;
    backoff?: number;
  };
  script?: {
    language: 'bash' | 'python' | 'javascript';
    code: string;
    timeout?: number;
  };
  tool?: {
    name: string;
    params?: Record<string, any>;
  };
  api?: {
    endpoint: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    body?: Record<string, any>;
    timeout?: number;
  };
  optional?: boolean;
}

// Validation result from AI
export interface ValidationResult {
  isValid: boolean;
  score?: number;
  suggestions: string[];
  warnings?: string[];
  validatedAt: string;
  validatedBy?: string;
  details?: {
    stepAnalysis: Array<{
      stepId: string;
      stepName: string;
      isExecutable: boolean;
      hasDependencies: boolean;
      suggestion?: string;
    }>;
    aiCritique?: string;
    autoAdjustment?: any;
    executionTest?: {
      success: boolean;
      result?: string;
      error?: string;
      log: string[];
      iterations: number;
    };
  };
}

// DTO for creating a new execution flow template
export interface CreateExecutionFlowTemplateDTO {
  name: string;
  description?: string;
  goal?: string;             // 流程目标
  expectedResult?: string;   // 预期结果
  paramsSchema?: Record<string, any>;  // 参数定义
  category?: string;
  steps: ExecutionFlowStep[];
  executionFlowKeys?: string[];
  isPublic?: boolean;
  createdBy?: string;
}

// DTO for updating an existing template
export interface UpdateExecutionFlowTemplateDTO {
  name?: string;
  description?: string;
  category?: string;
  steps?: ExecutionFlowStep[];
  executionFlowKeys?: string[];
  isPublic?: boolean;
  isActive?: boolean;
}

// Full template DTO returned by API
export interface ExecutionFlowTemplateDTO {
  id: string;
  name: string;
  description: string | null;
  goal: string | null;             // 流程目标 - 指导AI验证和宏工具生成
  expectedResult: string | null;   // 预期结果 - 指导AI验证
  paramsSchema: Record<string, any> | null;  // 参数定义 - 可选
  category: string;
  steps: ExecutionFlowStep[];
  executionFlowKeys: string[];
  validation: ValidationResult | null;
  usageCount: number;
  isPublic: boolean;
  createdBy: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Category labels
export const EXECUTION_FLOW_CATEGORIES: Record<string, { label: string; color: string; desc: string }> = {
  document: { label: '文档处理', color: 'blue', desc: 'Word/PDF文档生成与处理' },
  analysis: { label: '数据分析', color: 'green', desc: '数据统计、报表分析' },
  automation: { label: '自动化流程', color: 'purple', desc: '自动化任务执行' },
  integration: { label: '系统集成', color: 'cyan', desc: '与外部系统对接' },
  query: { label: '查询服务', color: 'orange', desc: '数据查询、信息检索' },
  custom: { label: '自定义', color: 'default', desc: '用户自定义流程' },
};

// Step type labels
export const STEP_TYPE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  text: { label: '纯文本指导', color: 'default', icon: 'FileTextOutlined' },
  script: { label: '脚本执行', color: 'orange', icon: 'CodeOutlined' },
  tool: { label: '系统工具', color: 'blue', icon: 'ToolOutlined' },
  api: { label: 'API调用', color: 'green', icon: 'ApiOutlined' },
  llm: { label: 'LLM处理', color: 'purple', icon: 'FileTextOutlined' },
  validator: { label: '参数验证', color: 'cyan', icon: 'CheckCircleOutlined' },
};

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
   * 支持真实执行测试
   */
  validate: async (
    id: string,
    options?: {
      aiServiceUrl?: string;
      enableExecutionTest?: boolean;
      testParams?: Record<string, any>;
    },
  ): Promise<ValidateResponse> => {
    const params = new URLSearchParams();
    if (options?.aiServiceUrl) params.append('aiServiceUrl', encodeURIComponent(options.aiServiceUrl));
    if (options?.enableExecutionTest) params.append('enableExecutionTest', 'true');

    const body = options?.testParams ? { testParams: options.testParams } : undefined;

    return apiClient.post<ValidateResponse>(
      `/execution-flow-templates/${id}/validate?${params.toString()}`,
      body,
    );
  },

  /**
   * 应用AI优化建议
   */
  applyAdjustment: async (id: string): Promise<ExecutionFlowTemplateDTO> => {
    return apiClient.post<ExecutionFlowTemplateDTO>(
      `/execution-flow-templates/${id}/apply-adjustment`
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