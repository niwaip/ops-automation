/**
 * Chat Types
 * portal 仅保留 UI 侧需要的轻量适配，协议定义统一复用 user-core。
 */

import type {
  AIModel,
  ChatContentPart,
  ChatContextStrategy,
  ChatMessage as CoreChatMessage,
  ChatProgressLog,
  ChatRequest as CoreChatRequest,
  ChatSession as CoreChatSession,
  ChatTaskStatus,
  ExecutionResultPayload,
  LLMRateLimit,
  LLMUsage,
  NormalizedChatExecutionResult,
  PromptDebugLLMCall,
  PromptDebugPayload,
  StreamEvent as CoreStreamEvent,
  StreamEventType as CoreStreamEventType,
} from '@ops/user-core';
import { StreamEventType as CoreStreamEventTypeValue } from '@ops/user-core';

/**
 * 流式事件类型
 */
export const StreamEventType = CoreStreamEventTypeValue;
export type StreamEventType = CoreStreamEventType;

/**
 * 流式事件
 */
export interface StreamEvent extends CoreStreamEvent {}

export type {
  AIModel,
  ChatContentPart,
  ChatContextStrategy,
  ChatProgressLog,
  ChatTaskStatus,
  ExecutionResultPayload,
  LLMRateLimit,
  LLMUsage,
  NormalizedChatExecutionResult,
  PromptDebugLLMCall,
  PromptDebugPayload,
};

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

/**
 * 聊天消息
 * UI 层仍使用 Date，避免一次性改动 portal 展示逻辑。
 */
export type ChatMessage = Omit<CoreChatMessage, 'timestamp'> & {
  timestamp: Date;
};

/**
 * 聊天会话
 */
export type ChatSession = Omit<CoreChatSession, 'createdAt' | 'updatedAt'> & {
  createdAt: Date;
  updatedAt: Date;
};

/**
 * 上传文件信息
 */
export interface UploadedFile {
  fileId: string;
  fileName: string;
  mimeType?: string;
  size: number;
  file?: File;
  content?: string; // base64编码的文件内容
}

/**
 * Chat请求DTO
 */
export type ChatRequest = Omit<CoreChatRequest, 'files'> & {
  files?: UploadedFile[];
};
