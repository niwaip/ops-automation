/**
 * Execution Flow Template Interfaces
 */

export const EXECUTION_FLOW_CATEGORIES = {
  document: { label: '文档生成', color: 'blue' },
  analysis: { label: '数据分析', color: 'green' },
  automation: { label: '自动化办公', color: 'purple' },
  custom: { label: '自定义流程', color: 'orange' },
  query: { label: '信息查询', color: 'cyan' },
};

/**
 * 流程步骤类型
 */
export type ExecutionFlowStepType = 'text' | 'api' | 'tool' | 'script';

/**
 * 流程步骤定义
 */
export interface ExecutionFlowStep {
  id?: string;
  type: ExecutionFlowStepType;
  name: string;
  content?: string;
  expectedOutput?: string;
  api?: {
    endpoint: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
    timeout?: number;
  };
  tool?: {
    name: string;
    params?: Record<string, unknown>;
  };
  script?: {
    language: 'bash' | 'python' | 'javascript';
    code: string;
  };
}

/**
 * 验证结果定义
 */
export interface ValidationResult {
  isValid: boolean;
  score?: number;
  suggestions: string[];
  warnings?: string[];
  validatedAt: string;
  validatedBy: string;
  details?: {
    stepAnalysis: StepAnalysis[];
    aiCritique?: string;        // AI 深度审计详情
    autoAdjustment?: any;      // AI 建议的自动优化流程
  };
}

/**
 * 步骤分析结果
 */
export interface StepAnalysis {
  stepId: string;
  stepName: string;
  isExecutable: boolean;
  hasDependencies: boolean;
  suggestion?: string;
}

/**
 * 流程模板 DTO
 */
export interface ExecutionFlowTemplateDTO {
  id: string;
  name: string;
  description?: string;
  goal?: string;             // 流程目标 - 指导AI验证和宏工具生成
  expectedResult?: string;   // 预期结果 - 指导AI验证
  paramsSchema?: Record<string, any>;  // 参数定义 - 可选，指导AI验证参数完整性
  category: string;
  steps: ExecutionFlowStep[];
  executionFlowKeys: string[];
  validation?: ValidationResult;
  usageCount: number;
  isPublic: boolean;
  createdBy?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 创建模板 DTO
 */
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

/**
 * 更新模板 DTO
 */
export interface UpdateExecutionFlowTemplateDTO {
  name?: string;
  description?: string;
  goal?: string;
  expectedResult?: string;
  paramsSchema?: Record<string, any>;
  category?: string;
  steps?: ExecutionFlowStep[];
  executionFlowKeys?: string[];
  isPublic?: boolean;
  isActive?: boolean;
}
