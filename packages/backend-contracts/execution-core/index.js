"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OUTBOUND_EFFECT_STATUS = exports.OUTBOUND_EFFECT_PHASE = exports.EXECUTION_EVENT_TYPE_VALUES = exports.EXECUTION_EVENT_TYPE = exports.APPROVAL_STATUS_VALUES = exports.APPROVAL_STATUS = exports.EXECUTION_STEP_STATUS_VALUES = exports.EXECUTION_STEP_STATUS = exports.TERMINAL_EXECUTION_STATUSES = exports.EXECUTION_STATUS_VALUES = exports.EXECUTION_STATUS = void 0;
exports.isTerminalExecutionStatus = isTerminalExecutionStatus;
exports.canonicalizePayloadObject = canonicalizePayloadObject;
exports.computeOutboundPayloadHash = computeOutboundPayloadHash;
exports.EXECUTION_STATUS = {
    DRAFT: 'draft',
    QUEUED: 'queued',
    RUNNING: 'running',
    WAITING_INPUT: 'waiting_input',
    PENDING_APPROVAL: 'pending_approval',
    HUMAN_CONTROL: 'human_control',
    PAUSED: 'paused',
    SUCCEEDED: 'succeeded',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    ROLLED_BACK: 'rolled_back',
};
exports.EXECUTION_STATUS_VALUES = Object.values(exports.EXECUTION_STATUS);
exports.TERMINAL_EXECUTION_STATUSES = [
    exports.EXECUTION_STATUS.SUCCEEDED,
    exports.EXECUTION_STATUS.FAILED,
    exports.EXECUTION_STATUS.CANCELLED,
    exports.EXECUTION_STATUS.ROLLED_BACK,
];
exports.EXECUTION_STEP_STATUS = {
    PENDING: 'pending',
    RUNNING: 'running',
    WAITING_INPUT: 'waiting_input',
    SUCCEEDED: 'succeeded',
    FAILED: 'failed',
    SKIPPED: 'skipped',
};
exports.EXECUTION_STEP_STATUS_VALUES = Object.values(exports.EXECUTION_STEP_STATUS);
exports.APPROVAL_STATUS = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    NOT_REQUIRED: 'not_required',
};
exports.APPROVAL_STATUS_VALUES = Object.values(exports.APPROVAL_STATUS);
exports.EXECUTION_EVENT_TYPE = {
    EXECUTION_CREATED: 'execution.created',
    EXECUTION_PLAN_GENERATED: 'execution.plan.generated',
    EXECUTION_STEPS_PLANNED: 'execution.steps.planned',
    EXECUTION_STATUS_CHANGED: 'execution.status_changed',
    EXECUTION_TAKEOVER_REQUESTED: 'execution.takeover_requested',
    EXECUTION_RESUMED: 'execution.resumed',
    EXECUTION_APPROVED: 'execution.approved',
    EXECUTION_REJECTED: 'execution.rejected',
    EXECUTION_INPUT_SUBMITTED: 'execution.input_submitted',
    EXECUTION_PARTIAL_INPUT_SUBMITTED: 'execution.partial_input_submitted',
    EXECUTION_CANCELLED: 'execution.cancelled',
    EXECUTION_LEGACY_GRACE_REJECTED: 'execution.legacy_grace.rejected',
    RUNTIME_SKIPPED: 'runtime.skipped',
    RUNTIME_ALLOCATED: 'runtime.allocated',
    STEP_CREATED: 'step.created',
    STEP_STARTED: 'step.started',
    STEP_SUCCEEDED: 'step.succeeded',
    STEP_FAILED: 'step.failed',
    STEP_WAITING_INPUT: 'step.waiting_input',
    STEP_SKIPPED: 'step.skipped',
    STEPS_SKIPPED: 'steps.skipped',
};
exports.EXECUTION_EVENT_TYPE_VALUES = Object.values(exports.EXECUTION_EVENT_TYPE);
function isTerminalExecutionStatus(status) {
    return exports.TERMINAL_EXECUTION_STATUSES.includes(status);
}
exports.OUTBOUND_EFFECT_PHASE = {
    PREPARE: 'prepare',
    COMMIT: 'commit',
    DIRECT: 'direct',
};
exports.OUTBOUND_EFFECT_STATUS = {
    PREPARED: 'prepared',
    COMMITTED: 'committed',
    UNKNOWN: 'unknown',
    FAILED: 'failed',
};
function canonicalizePayloadObject(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(canonicalizePayloadObject);
    }
    const sorted = {};
    const keys = Object.keys(obj).sort();
    for (const k of keys) {
        sorted[k] = canonicalizePayloadObject(obj[k]);
    }
    return sorted;
}
function computeOutboundPayloadHash(payload) {
    const canonicalObj = canonicalizePayloadObject(payload);
    const jsonStr = JSON.stringify(canonicalObj);
    // Simple deterministic SHA-256 using Node crypto
    const cryptoModule = require('crypto');
    const hash = cryptoModule.createHash('sha256').update(jsonStr, 'utf8').digest('hex');
    return `sha256:${hash}`;
}
//# sourceMappingURL=index.js.map