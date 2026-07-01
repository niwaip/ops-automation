export const CHAT_CHANNEL_TYPE = {
  WEB: 'web',
  DESKTOP: 'desktop',
  WECHAT: 'wechat',
  WECOM: 'wecom',
  FEISHU: 'feishu',
  WEBHOOK: 'webhook',
} as const;

export type ChatChannelType =
  (typeof CHAT_CHANNEL_TYPE)[keyof typeof CHAT_CHANNEL_TYPE];

export const CHAT_TASK_STATUS = {
  RUNNING: 'running',
  WAITING_INPUT: 'waiting_input',
  PENDING_APPROVAL: 'pending_approval',
  HUMAN_CONTROL: 'human_control',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type ChatTaskStatus =
  (typeof CHAT_TASK_STATUS)[keyof typeof CHAT_TASK_STATUS];

export const STREAM_EVENT_TYPE = {
  THOUGHT: 'thought',
  ACTION: 'action',
  OBSERVATION: 'observation',
  RESULT: 'result',
  WAITING_INPUT: 'waiting_input',
  PENDING_APPROVAL: 'pending_approval',
  HUMAN_CONTROL: 'human_control',
  ERROR: 'error',
  SESSION_PATCH: 'session_patch',
  PARAMS_CONFIRM: 'params_confirm',
  FILE_UPLOAD: 'file_upload',
} as const;

export type UnifiedStreamEventType =
  (typeof STREAM_EVENT_TYPE)[keyof typeof STREAM_EVENT_TYPE];

export const CONTENT_PART_TYPE = {
  TEXT: 'text',
  MARKDOWN: 'markdown',
  STRUCTURED_RESULT: 'structured_result',
  TASK_CARD: 'task_card',
  APPROVAL_CARD: 'approval_card',
  FILE_REF: 'file_ref',
  DEEPLINK: 'deeplink',
} as const;

export type ContentPartType =
  (typeof CONTENT_PART_TYPE)[keyof typeof CONTENT_PART_TYPE];

export interface TextContentPart {
  type: typeof CONTENT_PART_TYPE.TEXT;
  text: string;
}

export interface MarkdownContentPart {
  type: typeof CONTENT_PART_TYPE.MARKDOWN;
  markdown: string;
}

export interface StructuredResultContentPart {
  type: typeof CONTENT_PART_TYPE.STRUCTURED_RESULT;
  schemaType: string;
  // Keep `unknown` during the registry expansion phase so older skills can still
  // emit partially typed payloads. Renderers should narrow with
  // `isExecutionResultPayload()` whenever they want structured access.
  data: unknown;
}

export interface TaskCardContentPart {
  type: typeof CONTENT_PART_TYPE.TASK_CARD;
  taskStatus: ChatTaskStatus;
  executionId: string;
}

export interface ApprovalCardContentPart {
  type: typeof CONTENT_PART_TYPE.APPROVAL_CARD;
  executionId: string;
  riskLevel?: string;
}

export interface FileRefContentPart {
  type: typeof CONTENT_PART_TYPE.FILE_REF;
  fileId: string;
  fileName: string;
  mimeType?: string;
}

export interface DeeplinkContentPart {
  type: typeof CONTENT_PART_TYPE.DEEPLINK;
  url: string;
  label: string;
}

export type ChatContentPart =
  | TextContentPart
  | MarkdownContentPart
  | StructuredResultContentPart
  | TaskCardContentPart
  | ApprovalCardContentPart
  | FileRefContentPart
  | DeeplinkContentPart;

export const EXECUTION_RESULT_TYPE = {
  BROWSER_TASK: 'browser_task',
  REPORT: 'report',
  GENERIC: 'generic',
} as const;

export type ExecutionResultType =
  (typeof EXECUTION_RESULT_TYPE)[keyof typeof EXECUTION_RESULT_TYPE];

export interface BrowserTaskExecutionResultPayload {
  type: typeof EXECUTION_RESULT_TYPE.BROWSER_TASK;
  summary: string;
  screenshots?: string[];
  extractedData?: Record<string, unknown>;
}

export interface ReportExecutionResultPayload {
  type: typeof EXECUTION_RESULT_TYPE.REPORT;
  downloadUrl: string;
  previewUrl?: string;
  fileName: string;
}

export interface GenericExecutionResultPayload {
  type: typeof EXECUTION_RESULT_TYPE.GENERIC;
  summary?: string;
  data?: unknown;
}

export type ExecutionResultPayload =
  | BrowserTaskExecutionResultPayload
  | ReportExecutionResultPayload
  | GenericExecutionResultPayload;

export const CHAT_CONTEXT_STRATEGY = {
  SLIDING_WINDOW: 'sliding_window',
  SUMMARY_COMPRESS: 'summary_compress',
  RETRIEVAL_AUGMENT: 'retrieval_augment',
  FULL: 'full',
} as const;

export type ChatContextStrategy =
  (typeof CHAT_CONTEXT_STRATEGY)[keyof typeof CHAT_CONTEXT_STRATEGY];

export interface UnifiedChatSession {
  sessionId: string;
  userId?: string;
  tenantId?: string;
  channelType: ChatChannelType;
  channelUserId?: string;
  channelThreadId?: string;
  title?: string;
  status: 'active' | 'archived';
  contextStrategy?: ChatContextStrategy;
  contextWindowTokens?: number;
  createdAt: string;
  updatedAt: string;
}

export interface UnifiedStreamEvent {
  seq?: number;
  protocolVersion?: '1';
  sessionId?: string;
  type: UnifiedStreamEventType;
  content: string;
  // `Record<string, unknown>` is kept for backward compatibility with legacy
  // stream producers while the platform migrates fully to `ChatContentPart[]`.
  data?: ChatContentPart | ChatContentPart[] | Record<string, unknown>;
  iteration?: number;
}

export interface UnifiedTaskAction {
  actionId: string;
  executionId: string;
  type:
    | 'send_message'
    | 'stop_stream'
    | 'submit_input'
    | 'approve'
    | 'reject'
    | 'resume_human_control'
    | 'open_execution_detail';
  payload?: unknown;
  clientTimestamp: string;
}

export interface ChannelCapability {
  channel: ChatChannelType;
  supportsMarkdown: boolean;
  supportsInteractiveButtons: boolean;
  maxMessageLength: number;
  supportsFileAttachment: boolean;
  supportsStreaming: boolean;
  buttonLimit?: number;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const isExecutionResultPayload = (
  value: unknown
): value is ExecutionResultPayload => {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  switch (value.type) {
    case EXECUTION_RESULT_TYPE.BROWSER_TASK:
      return typeof value.summary === 'string';
    case EXECUTION_RESULT_TYPE.REPORT:
      return typeof value.downloadUrl === 'string' && typeof value.fileName === 'string';
    case EXECUTION_RESULT_TYPE.GENERIC:
      return true;
    default:
      return false;
  }
};
