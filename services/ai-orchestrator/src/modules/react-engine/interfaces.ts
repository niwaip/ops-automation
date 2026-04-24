/**
 * ReAct Engine Interfaces
 * ReAct (Reasoning + Acting) 架构核心类型定义
 */

/**
 * 流式事件类型
 */
export enum StreamEventType {
  THOUGHT = 'thought',
  ACTION = 'action',
  OBSERVATION = 'observation',
  RESULT = 'result',
  WAITING_INPUT = 'waiting_input',
  ERROR = 'error',
  PARAMS_CONFIRM = 'params_confirm',
  ACTION_CONFIRM = 'action_confirm',
  FILE_UPLOAD = 'file_upload',
}

/**
 * 流式事件
 */
export interface StreamEvent {
  type: StreamEventType;
  content: string;
  data?: Record<string, unknown>;
  iteration?: number;
}

/**
 * ReAct状态
 */
export interface ReActState {
  thought: string;
  action: string;
  actionInput: Record<string, unknown>;
  observation: string;
  iteration: number;
  maxIterations: number;
  isFinished: boolean;
  isWaitingForUserInput?: boolean;
  finalAnswer?: string;
}

/**
 * ReAct执行配置
 */
export interface ReActConfig {
  maxIterations: number;  // 默认5
  modelId: string;
  timeoutMs?: number;     // 每步超时时间
  tools: string[];        // 可用工具列表
  mode?: 'chat' | 'task'; // 执行模式：聊天或任务
}

/**
 * 工具定义
 */
export interface ToolDefinition {
  name: string;
  description: string;
  category?: 'discovery' | 'parameter' | 'execution' | 'utility' | 'flow';
  requiresConfirmation?: boolean;
  requiredRoles?: string[]; // 新增：执行此工具所需的角色
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: 'string' | 'number' | 'boolean' | 'array' | 'object';
      description: string;
      required?: boolean;
    }>;
    required: string[];
  };
  validateParams: (params: Record<string, unknown>) => { valid: boolean; missing: string[] };
  execute: (params: Record<string, unknown>, context: ExecutionContext) => Promise<ToolResult>;
}

/**
 * 工具执行结果
 */
export interface ToolResult {
  success: boolean;
  output: string;
  data?: Record<string, unknown>;
  requiresUserInput?: boolean;
  userInputPrompt?: string;
  nextAction?: string;           // 建议下一步调用的工具
  nextActionParams?: Record<string, unknown>;  // 下一步工具的参数
}

/**
 * 执行上下文
 */
export interface ExecutionContext {
  sessionId: string;
  userId: string;
  traceId?: string;             // Request trace id for observability
  executionId?: string;           // Execution ID for step tracking
  userRoles?: string[];           // 新增：当前用户的角色
  originalUserInput?: string;     // 初始用户输入，供工具缺省参数兜底
  history: ChatMessage[];
  currentThought?: string;
  skill?: SkillMatchResult;
  uploadedFiles?: UploadedFile[];
  collectedParams?: Record<string, unknown>;  // 已收集的参数
  nextAction?: string;            // 工具返回的下一步动作提示
  nextActionParams?: Record<string, unknown>;  // 下一步动作的参数
  currentFlowStep?: number;       // 当前执行流的步骤索引
  currentStepId?: string;         // 当前执行的步骤ID
}

/**
 * 聊天消息
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * API端点配置
 */
export interface ApiEndpoint {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  description: string;
}

/**
 * 流程模板定义
 */
export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  steps: any[];
  executionFlowKeys: string[];
}

/**
 * Skill匹配结果
 */
export interface SkillMatchResult {
  skillId: string;
  skillName: string;
  matchedKeywords: string[];
  confidence: number;
  collectedParams: Record<string, unknown>;
  missingParams: string[];
  paramsSchema: ParamsSchema;
  templateId?: string;
  carboneTemplateId?: string;  // Carbone引擎的模板ID
  carboneSkillId?: string;      // Carbone引擎的Skill ID
  executionFlowTemplateId?: string;  // 兼容旧字段
  executionFlowTemplateIds?: string[];  // 执行流程模板ID列表
  executionFlow?: string[];     // 预定义的执行流
  apiEndpoints?: {
    generateParameters?: ApiEndpoint;  // 参数生成API
    render?: ApiEndpoint;              // 文档渲染API
    getSkill?: ApiEndpoint;            // 获取Skill信息API
  };
  matchReason?: string;  // AI语义匹配原因
}

/**
 * 参数Schema
 */
export interface ParamsSchema {
  properties: Record<string, ParamProperty>;
  required: string[];
}

/**
 * 参数属性定义
 */
export interface ParamProperty {
  type: 'string' | 'number' | 'date' | 'array' | 'boolean';
  description: string;
  required: boolean;
  default?: unknown;
  extractionPrompt?: string;
}

/**
 * 上传文件信息
 */
export interface UploadedFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  content?: string;  // base64编码的文件内容
  parsedContent?: string;
}

/**
 * Chat请求DTO
 */
export interface ChatRequestDTO {
  message: string;
  traceId?: string;
  sessionId?: string;
  userId?: string;
  executionId?: string;          // Execution ID for step tracking
  userRoles?: string[];          // 新增：请求中传入的用户角色
  modelId?: string;
  files?: UploadedFile[];
  config?: Partial<ReActConfig>;
  isConfirmed?: boolean;         // 是否已确认执行敏感操作
}

/**
 * Chat响应DTO
 */
export interface ChatResponseDTO {
  sessionId: string;
  response: string;
  events: StreamEvent[];
  metadata?: Record<string, unknown>;
}

/**
 * Skill配置DTO
 */
export interface SkillConfigDTO {
  id: string;
  name: string;
  description?: string;
  category: 'template' | 'query' | 'action';
  triggerKeywords: string[];
  paramsSchema: ParamsSchema;
  templateId?: string;
  executionFlow: string[];
  tools: string[];
  isActive: boolean;
}

/**
 * 创建Skill请求DTO
 */
export interface CreateSkillDTO {
  name: string;
  description?: string;
  category?: 'template' | 'query' | 'action';
  triggerKeywords: string[];
  paramsSchema: ParamsSchema;
  templateId?: string;
  executionFlow?: string[];
  tools?: string[];
}
