"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isExecutionResultPayload = exports.isRecord = exports.CHAT_CONTEXT_STRATEGY = exports.EXECUTION_RESULT_TYPE = exports.CONTENT_PART_TYPE = exports.STREAM_EVENT_TYPE = exports.CHAT_TASK_STATUS = exports.CHAT_CHANNEL_TYPE = void 0;
exports.CHAT_CHANNEL_TYPE = {
    WEB: 'web',
    DESKTOP: 'desktop',
    WECHAT: 'wechat',
    WECOM: 'wecom',
    FEISHU: 'feishu',
    WEBHOOK: 'webhook',
};
exports.CHAT_TASK_STATUS = {
    RUNNING: 'running',
    WAITING_INPUT: 'waiting_input',
    PENDING_APPROVAL: 'pending_approval',
    HUMAN_CONTROL: 'human_control',
    COMPLETED: 'completed',
    FAILED: 'failed',
};
exports.STREAM_EVENT_TYPE = {
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
};
exports.CONTENT_PART_TYPE = {
    TEXT: 'text',
    MARKDOWN: 'markdown',
    STRUCTURED_RESULT: 'structured_result',
    TASK_CARD: 'task_card',
    APPROVAL_CARD: 'approval_card',
    FILE_REF: 'file_ref',
    DEEPLINK: 'deeplink',
};
exports.EXECUTION_RESULT_TYPE = {
    BROWSER_TASK: 'browser_task',
    REPORT: 'report',
    GENERIC: 'generic',
};
exports.CHAT_CONTEXT_STRATEGY = {
    SLIDING_WINDOW: 'sliding_window',
    SUMMARY_COMPRESS: 'summary_compress',
    RETRIEVAL_AUGMENT: 'retrieval_augment',
    FULL: 'full',
};
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
exports.isRecord = isRecord;
const isExecutionResultPayload = (value) => {
    if (!(0, exports.isRecord)(value) || typeof value.type !== 'string') {
        return false;
    }
    switch (value.type) {
        case exports.EXECUTION_RESULT_TYPE.BROWSER_TASK:
            return typeof value.summary === 'string';
        case exports.EXECUTION_RESULT_TYPE.REPORT:
            return typeof value.downloadUrl === 'string' && typeof value.fileName === 'string';
        case exports.EXECUTION_RESULT_TYPE.GENERIC:
            return true;
        default:
            return false;
    }
};
exports.isExecutionResultPayload = isExecutionResultPayload;
//# sourceMappingURL=index.js.map