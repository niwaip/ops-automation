/**
 * Chat Types
 * 前端聊天相关类型定义
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
  FILE_UPLOAD = 'file_upload',
  PENDING_APPROVAL = 'pending_approval',
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

export interface PromptDebugPayload {
  systemPrompt: string;
  userPrompt: string;
  debugSource?: 'planner' | 'react-engine';
  systemPromptSectionKeys?: string[];
  systemPromptSectionSources?: string[];
  userPromptSectionKeys?: string[];
  userPromptSectionSources?: string[];
  modelId?: string;
  llmRequestMessages?: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  llmResponseText?: string;
  llmCalls?: PromptDebugLLMCall[];
  notes?: string[];
}

export interface PromptDebugLLMCall {
  stage: string;
  label: string;
  modelId?: string;
  requestMessages?: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  responseText?: string;
  note?: string;
}

export interface PromptDebugRecord {
  id: string;
  sessionId?: string;
  messageId: string;
  executionId?: string;
  mode?: 'chat' | 'task';
  taskStatus?:
    | 'waiting_input'
    | 'pending_approval'
    | 'running'
    | 'completed'
    | 'failed'
    | 'human_control';
  sourceEventType: StreamEventType;
  promptDebug: PromptDebugPayload;
  createdAt: string;
  updatedAt: string;
}

export interface ChatProgressLog {
  stage: 'thought' | 'action' | 'observation';
  text: string;
}

export interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
}

export interface LLMRateLimit {
  requests_limit?: number;
  requests_remaining?: number;
  requests_reset?: string;
  tokens_limit?: number;
  tokens_remaining?: number;
  tokens_reset?: string;
}

/**
 * 聊天消息
 */
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    mode?: 'chat' | 'task';
    showThinking?: boolean;
    usage?: LLMUsage;
    rateLimit?: LLMRateLimit;
    skillUsed?: string;
    params?: Record<string, unknown>;
    files?: string[];
    fileUrl?: string;
    downloadUrl?: string;
    temporalLink?: string;
    missingInputs?: Array<{
      name?: string;
      description?: string;
      missing?: boolean;
    }>;
    taskStatus?:
      | 'waiting_input'
      | 'pending_approval'
      | 'running'
      | 'completed'
      | 'failed'
      | 'human_control';
    executionId?: string;
    executionStatus?: string;
    finalResult?: string;
    finalResultData?: unknown;
    finalSummary?: string;
    progressLogs?: ChatProgressLog[];
    errorMessage?: string;
    failureReason?: string;
    hasBusinessResult?: boolean;
    promptDebug?: PromptDebugPayload;
  };
  isStreaming?: boolean;
}

/**
 * 聊天会话
 */
export interface ChatSession {
  id: string;
  title?: string;
  modelId?: string;
  status: 'active' | 'archived';
  createdAt: Date;
  updatedAt: Date;
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
}

/**
 * 参数Schema
 */
export interface ParamsSchema {
  properties: Record<string, ParamProperty>;
  required: string[];
}

/**
 * 参数属性
 */
export interface ParamProperty {
  type: 'string' | 'number' | 'date' | 'array' | 'boolean';
  description: string;
  required: boolean;
  default?: unknown;
}

/**
 * 上传文件信息
 */
export interface UploadedFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  file?: File;
  content?: string; // base64编码的文件内容
}

/**
 * Chat请求DTO
 */
export interface ChatRequest {
  message: string;
  sessionId?: string;
  userId?: string;
  executionId?: string;
  userRoles?: string[];
  modelId?: string;
  files?: UploadedFile[];
  config?: {
    mode?: 'chat' | 'task'; // 聊天模式：chat(普通) 或 task(ReAct引擎)
    maxIterations?: number;
    thinking?: boolean;
    webSearch?: boolean;
  };
}

/**
 * AI模型信息
 */
export interface AIModel {
  id: string;
  name: string;
  provider: string;
  config?: {
    display_name?: string;
    description?: string;
  };
  status: 'active' | 'inactive';
}
