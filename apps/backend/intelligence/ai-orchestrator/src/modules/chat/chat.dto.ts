import type { ReActConfig, StreamEvent } from '../react-engine/interfaces';

export interface ChatUploadedFileDTO {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  content?: string;
  parsedContent?: string;
  source?: 'upload' | 'workspace';
  workspaceNodeId?: string;
  workspaceId?: string;
  storagePath?: string;
}

export interface ChatRequestDTO {
  message: string;
  clientMessageId?: string;
  traceId?: string;
  idempotencyKey?: string;
  sessionId?: string;
  userId?: string;
  executionId?: string;
  userRoles?: string[];
  modelId?: string;
  files?: ChatUploadedFileDTO[];
  config?: Partial<ReActConfig>;
  isConfirmed?: boolean;
  approvedToolNames?: string[];
}

export interface ChatResponseDTO {
  sessionId?: string;
  response: string;
  events: StreamEvent[];
  metadata?: Record<string, unknown>;
}

export interface ChatHistoryMessageDTO {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ChatSessionDTO {
  id: string;
  title?: string;
  modelId?: string;
  status: 'active' | 'archived';
  channel?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionsResponseDTO {
  sessions: ChatSessionDTO[];
}

export interface ChatHistoryResponseDTO {
  messages: ChatHistoryMessageDTO[];
}

export interface ChatUploadFileResponseDTO {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface ChatAudioTranscriptionResponseDTO {
  text: string;
}
