export enum StreamEventType {
  THOUGHT = "thought",
  ACTION = "action",
  OBSERVATION = "observation",
  RESULT = "result",
  WAITING_INPUT = "waiting_input",
  ERROR = "error",
  PARAMS_CONFIRM = "params_confirm",
  FILE_UPLOAD = "file_upload",
  PENDING_APPROVAL = "pending_approval",
}

export interface StreamEvent {
  type: StreamEventType;
  content: string;
  data?: Record<string, unknown>;
  iteration?: number;
}

export interface PromptDebugPayload {
  systemPrompt: string;
  userPrompt: string;
  debugSource?: "planner" | "react-engine";
  systemPromptSectionKeys?: string[];
  systemPromptSectionSources?: string[];
  userPromptSectionKeys?: string[];
  userPromptSectionSources?: string[];
  modelId?: string;
  llmRequestMessages?: Array<{
    role: "system" | "user" | "assistant";
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
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  responseText?: string;
  note?: string;
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

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: {
    mode?: "chat" | "task";
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
    taskStatus?: "waiting_input" | "pending_approval" | "running" | "completed" | "failed";
    executionId?: string;
    executionStatus?: string;
    finalResult?: string;
    finalResultData?: unknown;
    finalSummary?: string;
    errorMessage?: string;
    hasBusinessResult?: boolean;
    promptDebug?: PromptDebugPayload;
  };
  isStreaming?: boolean;
}

export interface ChatSession {
  id: string;
  title?: string;
  modelId?: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface UploadedFileDescriptor {
  fileId?: string;
  fileName: string;
  mimeType?: string;
  size?: number;
  contentBase64?: string;
}

export interface ChatRequest {
  message: string;
  sessionId?: string;
  userId?: string;
  executionId?: string;
  userRoles?: string[];
  modelId?: string;
  files?: UploadedFileDescriptor[];
  config?: {
    mode?: "chat" | "task";
    maxIterations?: number;
    thinking?: boolean;
    webSearch?: boolean;
  };
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  config?: {
    display_name?: string;
    description?: string;
  };
  status: "active" | "inactive";
}
