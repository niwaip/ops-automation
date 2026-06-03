import type { ReActConfig, StreamEvent } from '../react-engine/interfaces';

export interface ChatUploadedFileDTO {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  content?: string;
  parsedContent?: string;
}

export interface ChatRequestDTO {
  message: string;
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

export interface ChatUploadFileResponseDTO {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface ChatAudioTranscriptionResponseDTO {
  text: string;
}
