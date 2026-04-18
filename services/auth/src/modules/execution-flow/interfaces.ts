/**
 * Execution Flow Template Interfaces
 * 执行流程模板 - 类似Claude Code Skills，用于指导AI一步一步执行操作
 */

// Step types supported by execution flow
export type StepType = 'text' | 'script' | 'tool' | 'api';

// Single step in the execution flow
export interface ExecutionFlowStep {
  id?: string;           // Optional unique identifier for the step
  type: StepType;        // Type of step: text, script, tool, or api
  name: string;          // Step name/label
  description?: string;  // Optional description

  // Content based on type
  content?: string;      // For 'text': instruction content

  // For 'script': script configuration
  script?: {
    language: 'bash' | 'python' | 'javascript';
    code: string;
    timeout?: number;    // Timeout in milliseconds
  };

  // For 'tool': tool configuration
  tool?: {
    name: string;        // Tool name (e.g., 'Read', 'Write', 'Bash')
    params?: Record<string, any>;
  };

  // For 'api': API endpoint configuration
  api?: {
    endpoint: string;    // API endpoint URL
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    body?: Record<string, any>;
    timeout?: number;
  };

  // Optional conditions for step execution
  condition?: {
    if?: string;         // Condition expression
    else?: string;       // Alternative step if condition fails
  };

  // Retry configuration
  retry?: {
    maxAttempts: number;
    delayMs: number;
  };

  // Expected output description
  expectedOutput?: string;

  // Is this step optional?
  optional?: boolean;
}

// Validation result from AI
export interface ValidationResult {
  isValid: boolean;
  score?: number;        // 0-100 score for flow quality
  suggestions: string[];
  warnings?: string[];
  validatedAt: string;   // ISO datetime
  validatedBy?: string;  // AI model used for validation
  details?: {
    stepAnalysis: Array<{
      stepId: string;
      stepName: string;
      isExecutable: boolean;
      hasDependencies: boolean;
      suggestion?: string;
    }>;
  };
}

// DTO for creating a new execution flow template
export interface CreateExecutionFlowTemplateDTO {
  name: string;
  description?: string;
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
export const STEP_TYPE_LABELS: Record<StepType, { label: string; color: string; icon: string }> = {
  text: { label: '纯文本指导', color: 'default', icon: 'FileTextOutlined' },
  script: { label: '脚本执行', color: 'orange', icon: 'CodeOutlined' },
  tool: { label: '系统工具', color: 'blue', icon: 'ToolOutlined' },
  api: { label: 'API调用', color: 'green', icon: 'ApiOutlined' },
};