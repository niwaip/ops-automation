export declare const CHAT_CHANNEL_TYPE: {
    readonly WEB: "web";
    readonly DESKTOP: "desktop";
    readonly WECHAT: "wechat";
    readonly WECOM: "wecom";
    readonly FEISHU: "feishu";
    readonly WEBHOOK: "webhook";
};
export type ChatChannelType = (typeof CHAT_CHANNEL_TYPE)[keyof typeof CHAT_CHANNEL_TYPE];
export declare const CHAT_TASK_STATUS: {
    readonly RUNNING: "running";
    readonly WAITING_INPUT: "waiting_input";
    readonly PENDING_APPROVAL: "pending_approval";
    readonly HUMAN_CONTROL: "human_control";
    readonly COMPLETED: "completed";
    readonly FAILED: "failed";
};
export type ChatTaskStatus = (typeof CHAT_TASK_STATUS)[keyof typeof CHAT_TASK_STATUS];
export declare const STREAM_EVENT_TYPE: {
    readonly THOUGHT: "thought";
    readonly ACTION: "action";
    readonly OBSERVATION: "observation";
    readonly RESULT: "result";
    readonly WAITING_INPUT: "waiting_input";
    readonly PENDING_APPROVAL: "pending_approval";
    readonly HUMAN_CONTROL: "human_control";
    readonly ERROR: "error";
    readonly SESSION_PATCH: "session_patch";
    readonly PARAMS_CONFIRM: "params_confirm";
    readonly FILE_UPLOAD: "file_upload";
};
export type UnifiedStreamEventType = (typeof STREAM_EVENT_TYPE)[keyof typeof STREAM_EVENT_TYPE];
export declare const CONTENT_PART_TYPE: {
    readonly TEXT: "text";
    readonly MARKDOWN: "markdown";
    readonly STRUCTURED_RESULT: "structured_result";
    readonly TASK_CARD: "task_card";
    readonly APPROVAL_CARD: "approval_card";
    readonly FILE_REF: "file_ref";
    readonly DEEPLINK: "deeplink";
};
export type ContentPartType = (typeof CONTENT_PART_TYPE)[keyof typeof CONTENT_PART_TYPE];
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
export type ChatContentPart = TextContentPart | MarkdownContentPart | StructuredResultContentPart | TaskCardContentPart | ApprovalCardContentPart | FileRefContentPart | DeeplinkContentPart;
export declare const EXECUTION_RESULT_TYPE: {
    readonly BROWSER_TASK: "browser_task";
    readonly REPORT: "report";
    readonly GENERIC: "generic";
};
export type ExecutionResultType = (typeof EXECUTION_RESULT_TYPE)[keyof typeof EXECUTION_RESULT_TYPE];
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
export type ExecutionResultPayload = BrowserTaskExecutionResultPayload | ReportExecutionResultPayload | GenericExecutionResultPayload;
export declare const CHAT_CONTEXT_STRATEGY: {
    readonly SLIDING_WINDOW: "sliding_window";
    readonly SUMMARY_COMPRESS: "summary_compress";
    readonly RETRIEVAL_AUGMENT: "retrieval_augment";
    readonly FULL: "full";
};
export type ChatContextStrategy = (typeof CHAT_CONTEXT_STRATEGY)[keyof typeof CHAT_CONTEXT_STRATEGY];
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
    data?: ChatContentPart | ChatContentPart[] | Record<string, unknown>;
    iteration?: number;
}
export interface UnifiedTaskAction {
    actionId: string;
    executionId: string;
    type: 'send_message' | 'stop_stream' | 'submit_input' | 'approve' | 'reject' | 'resume_human_control' | 'open_execution_detail';
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
export declare const isRecord: (value: unknown) => value is Record<string, unknown>;
export declare const isExecutionResultPayload: (value: unknown) => value is ExecutionResultPayload;