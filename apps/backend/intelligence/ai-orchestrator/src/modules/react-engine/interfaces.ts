import type { LLMUsage, LLMRateLimit, PromptDebugLLMCall } from '../../interfaces';

export type { LLMUsage, LLMRateLimit, PromptDebugLLMCall };

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
  PENDING_APPROVAL = 'pending_approval',
  HUMAN_CONTROL = 'human_control',
  ERROR = 'error',
  SESSION_PATCH = 'session_patch',
  PARAMS_CONFIRM = 'params_confirm',
  ACTION_CONFIRM = 'action_confirm',
  FILE_UPLOAD = 'file_upload',
}

/**
 * 执行过程中的 LLM 消耗明细
 */
export interface LLMCallDetail {
  iteration: number;
  modelId: string;
  usage?: LLMUsage;
  rateLimit?: LLMRateLimit;
  cost?: number;
  currency?: string;
  timestamp: Date;
  type: 'reasoning' | 'auxiliary'; // 区分推理与辅助调用
}

/**
 * 累积消耗统计
 */
export interface ExecutionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
  totalCost: number;
  currency: string;
  calls: LLMCallDetail[];
}

/**
 * 流式事件
 */
export interface StreamEvent {
  type: StreamEventType;
  content: string;
  data?: Record<string, unknown>;
  iteration?: number;
  seq?: number;
  protocolVersion?: '1';
  sessionId?: string;
}

export interface RoutingMeta {
  modelId?: string;
  attemptedModelIds?: string[];
  routingReason?: string;
}

export interface PromptAssemblyMeta {
  systemPromptSectionKeys?: string[];
  systemPromptSectionSources?: string[];
  userPromptSectionKeys?: string[];
  userPromptSectionSources?: string[];
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

export interface DecisionContext {
  routing: RoutingMeta;
  promptAssembly: PromptAssemblyMeta;
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
  finalResultData?: Record<string, unknown>;
  lastToolResult?: ToolResult;
  contextSummary?: string;
  usage?: ExecutionUsage; // 消耗统计
  promptAssembly?: PromptAssemblyMeta;
  promptDebug?: PromptDebugPayload;
  retryState?: {
    sameAction?: number;
    modelInference?: number;
    activeModelId?: string;
    attemptedModelIds?: string[];
    routingReason?: string;
  };
}

/**
 * ReAct执行配置
 */
export interface ReActConfig {
  maxIterations: number; // 默认5
  modelId: string;
  timeoutMs?: number; // 每步超时时间
  tools: string[]; // 可用工具列表
  mode?: 'chat' | 'task'; // 执行模式：聊天或任务
  thinking?: boolean; // 是否显示/保留思维链
  reasoning?: boolean; // 是否启用模型原生推理模式（若支持）
  webSearch?: boolean;
}

export interface CapabilityVisibleTool {
  name: string;
  description: string;
  category?: 'discovery' | 'parameter' | 'execution' | 'utility' | 'flow';
  requiresConfirmation?: boolean;
  requiresApproval?: boolean;
  requiredRoles?: string[];
  parameters: ToolDefinition['parameters'];
  exposure: 'prompt_and_runtime' | 'runtime_only' | 'prompt_only';
}

export interface CapabilityVisibleSkill {
  skillId: string;
  skillName: string;
  description?: string;
  triggerKeywords: string[];
  paramsSchema: ParamsSchema;
  executionType: 'document' | 'flow' | 'query' | 'artifact';
  version?: string;
  publishedSkillId?: string;
  executableVersion?: string;
  templateId?: string;
  carboneSkillId?: string;
  carboneTemplateId?: string;
  executionFlowTemplateIds?: string[];
  executionFlow?: string[];
  apiEndpoints?: {
    runtimeMetadata?: SkillRuntimeMetadata;
  };
  permissionTags?: string[];
  runtimeHints?: {
    goal?: string;
    expectedResult?: string;
    outputParams?: Record<string, unknown>;
  };
}

export interface CapabilityConstraints {
  disallowToolNames: string[];
  disallowSkillIds: string[];
  forceSkillBoundExecution: boolean;
  forbidExternalApiInTaskMode: boolean;
  maxVisibleSkills: number;
}

export interface CapabilityPolicies {
  requireConfirmToolNames: string[];
  requireApprovalToolNames?: string[];
  requireHumanReviewOnWrite: boolean;
  documentTemplateClarificationEnabled: boolean;
}

export interface CapabilitySnapshot {
  userId: string;
  tenantId?: string;
  sessionId: string;
  roles: string[];
  mode: 'chat' | 'task';
  selectedSkillId?: string;
  skillScopedToolNames?: string[];
  deniedToolNames?: string[];
  visibleTools: CapabilityVisibleTool[];
  visibleSkills: CapabilityVisibleSkill[];
  constraints: CapabilityConstraints;
  policies: CapabilityPolicies;
  generatedAt: string;
  version: string;
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
    properties: Record<
      string,
      {
        type: 'string' | 'number' | 'boolean' | 'array' | 'object';
        description: string;
        required?: boolean;
        items?: any; // 新增：支持数组项定义
      }
    >;
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
  code?: string;
  severity?: 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
  requiresUserInput?: boolean;
  userInputPrompt?: string;
  nextAction?: string; // 建议下一步调用的工具
  nextActionParams?: Record<string, unknown>; // 下一步工具的参数
  meta?: {
    toolName?: string;
    capabilityChecked?: boolean;
    selectedSkillId?: string;
    selectedTemplateId?: string;
    modelId?: string;
    attemptedModelIds?: string[];
    routingReason?: string;
    tokenEstimate?: number;
    truncated?: boolean;
    systemPromptSectionKeys?: string[];
    systemPromptSectionSources?: string[];
    userPromptSectionKeys?: string[];
    userPromptSectionSources?: string[];
  };
}

/**
 * 执行上下文
 */
export interface ExecutionContext {
  sessionId: string;
  userId: string;
  traceId?: string; // Request trace id for observability
  executionId?: string; // Execution ID for step tracking
  userRoles?: string[]; // 新增：当前用户的角色
  authToken?: string; // 新增：当前用户的认证令牌 (Bearer token)
  capabilitySnapshot?: CapabilitySnapshot;
  originalUserInput?: string; // 初始用户输入，供工具缺省参数兜底
  history: ChatMessage[];
  availableSkills?: AvailableSkillDefinition[];
  allowedToolNames?: string[];
  selectedSkillToolNames?: string[];
  approvedToolNames?: string[];
  currentThought?: string;
  skill?: SkillMatchResult;
  uploadedFiles?: UploadedFile[];
  collectedParams?: Record<string, unknown>; // 已收集的参数
  nextAction?: string; // 工具返回的下一步动作提示
  nextActionParams?: Record<string, unknown>; // 下一步动作的参数
  currentFlowStep?: number; // 当前执行流的步骤索引
  currentStepId?: string; // 当前执行的步骤ID
  documentContext?: {
    pendingTemplateClarification?: boolean;
    selectedTemplateId?: string;
    selectedTemplateName?: string;
    selectedSkillId?: string;
    selectionSource?: 'explicit' | 'context' | 'ranking';
    candidateRanking?: Array<{
      skillId: string;
      skillName: string;
      templateId?: string;
      templateName?: string;
      score: number;
    }>;
  };
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

export interface SkillRuntimeMetadata {
  matchSummary?: string;
  paramCollectionGuidance?: string;
  validationRules?: string;
  goal?: string;
  expectedResult?: string;
  outputParams?: Record<string, unknown>;
  sourceType?: string;
  skillGuideMarkdown?: string;
  dataExampleJson?: Record<string, unknown> | string;
  extractionRules?: Array<Record<string, unknown>>;
  mappingHints?: Array<Record<string, unknown>>;
  sourceTemplate?: {
    templateId?: string;
    skillId?: string;
    fileName?: string;
    format?: string;
    variableCount?: number;
  };
  taskQueue?: string;
  workflowSteps?: Array<{
    id?: string;
    name?: string;
    type?: string;
    activityName?: string;
  }>;
  workflowInputPolicy?: {
    params: Record<
      string,
      {
        enabled?: boolean;
        requiredMode?: 'always' | 'conditional' | 'optional' | 'system_required';
        defaultValue?: unknown;
        defaultValueResolver?: string;
        valueSourcePriority?: string[];
        confirmationThreshold?: number;
        previewBlocking?: boolean;
        validationRules?: Array<Record<string, unknown>>;
        transformRule?: string;
        templateBinding?: string;
      }
    >;
  };
}

export interface AvailableSkillDefinition {
  skillId: string;
  skillName: string;
  description?: string;
  triggerKeywords: string[];
  paramsSchema: ParamsSchema;
  executionType?: 'document' | 'flow' | 'query' | 'artifact';
  source?: string;
  supportsArtifact?: boolean;
  publishedSkillId?: string;
  executableVersion?: string;
  version?: string;
  publishedVersion?: string;
  isPublished?: boolean;
  publishedReleaseId?: string;
  publishedReleaseVersion?: number;
  publishedReleaseStatus?: string;
  publishedDeploymentStatus?: string;
  publishedSourceType?: string;
  templateId?: string;
  carboneSkillId?: string;
  carboneTemplateId?: string;
  executionFlowTemplateIds?: string[];
  executionFlow?: string[];
  apiEndpoints?: {
    runtimeMetadata?: SkillRuntimeMetadata;
  };
  goal?: string;
  expectedResult?: string;
  outputParams?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  contractRef?: string;
  contractDigest?: string;
  effectiveTools?: string[];
  usage?: LLMUsage;
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
  executionType?: AvailableSkillDefinition['executionType'];
  templateId?: string;
  carboneSkillId?: string;
  carboneTemplateId?: string;
  executionFlowTemplateId?: string;
  executionFlowTemplateIds?: string[]; // 执行流程模板ID列表
  executionFlow?: string[]; // 预定义的执行流
  apiEndpoints?: {
    runtimeMetadata?: SkillRuntimeMetadata;
  };
  matchReason?: string; // AI语义匹配原因
  goal?: string;
  expectedResult?: string;
  outputParams?: Record<string, unknown>;
  usage?: LLMUsage;
  debug?: {
    llmCalls?: PromptDebugLLMCall[];
    notes?: string[];
  };
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
  enum?: Array<string | number>;
  extractionPrompt?: string;
  semanticRole?: string;
  extractionHints?: string[];
  displayName?: string;
  groupLabel?: string;
  renderPath?: string | string[];
  previewBlocking?: boolean;
  confirmationThreshold?: number;
}


/**
 * 上传文件信息
 */
export interface UploadedFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  content?: string; // base64编码的文件内容
  parsedContent?: string;
}

/**
 * Chat请求DTO
 */
export interface ChatRequestDTO {
  message: string;
  traceId?: string;
  idempotencyKey?: string;
  sessionId?: string;
  userId?: string;
  executionId?: string; // Execution ID for step tracking
  userRoles?: string[]; // 新增：请求中传入的用户角色
  modelId?: string;
  files?: UploadedFile[];
  config?: Partial<ReActConfig>;
  isConfirmed?: boolean; // 是否已确认执行敏感操作
  approvedToolNames?: string[]; // 已完成审批并允许放行的工具名
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
  triggerKeywords: string[];
  paramsSchema: ParamsSchema;
  executionFlowTemplateIds?: string[];
  executionFlow?: Array<Record<string, unknown>>;
  tools: string[];
  isActive: boolean;
  apiEndpoints?: {
    runtimeMetadata?: SkillRuntimeMetadata;
  };
}

/**
 * 创建Skill请求DTO
 */
export interface CreateSkillDTO {
  name: string;
  description?: string;
  triggerKeywords: string[];
  paramsSchema: ParamsSchema;
  executionFlowTemplateIds?: string[];
  executionFlow?: Array<Record<string, unknown>>;
  tools?: string[];
  apiEndpoints?: {
    runtimeMetadata?: SkillRuntimeMetadata;
  };
}
