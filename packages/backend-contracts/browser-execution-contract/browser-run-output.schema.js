"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asBrowserRunOutputV2 = exports.BROWSER_RUN_OUTPUT_V2_SCHEMA = exports.BROWSER_RUN_OUTPUT_V2_SCHEMA_ID = void 0;
exports.BROWSER_RUN_OUTPUT_V2_SCHEMA_ID = 'browser-run-output/v2';
const stringMap = { type: 'object', additionalProperties: true };
const artifactRefSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'type'],
    properties: {
        id: { type: 'string', minLength: 1 }, type: { type: 'string', minLength: 1 },
        name: { type: 'string' }, url: { type: 'string' }, mimeType: { type: 'string' },
        sizeBytes: { type: 'integer', minimum: 0 }, metadata: stringMap,
    },
};
const stepSummarySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['stepId', 'action', 'status', 'attempt'],
    properties: {
        stepId: { type: 'string', minLength: 1 }, name: { type: 'string' }, action: { type: 'string', minLength: 1 },
        status: { enum: ['completed', 'failed', 'recovered', 'skipped', 'blocked', 'takeover_required'] },
        attempt: { type: 'integer', minimum: 1 }, startedAt: { type: 'string' }, endedAt: { type: 'string' },
        pageId: { type: 'string' }, outputVar: { type: 'string' },
        error: { type: 'object', additionalProperties: false, properties: { code: { type: 'string' }, message: { type: 'string' } } },
        warnings: { type: 'array', items: { type: 'string' } }, metadata: stringMap,
    },
};
const pageCaptureSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['pageId', 'stepId', 'attempt', 'captureReason', 'observedAt', 'artifactIds'],
    properties: {
        pageId: { type: 'string', minLength: 1 }, stepId: { type: 'string', minLength: 1 },
        attempt: { type: 'integer', minimum: 1 },
        captureReason: { enum: ['step_completed', 'step_failed', 'step_recovered', 'final'] },
        url: { type: 'string' }, title: { type: 'string' }, fingerprint: { type: 'string' }, readyState: { type: 'string' },
        observedAt: { type: 'string', minLength: 1 }, artifactIds: { type: 'array', items: { type: 'string' } },
        content: { type: 'object' },
    },
};
const outputValueSchema = {
    type: 'object', additionalProperties: false, required: ['value', 'type'],
    properties: {
        value: {}, producerStepId: { type: 'string' },
        type: { enum: ['string', 'number', 'boolean', 'object', 'array', 'null', 'unknown'] },
    },
};
const warningSchema = {
    type: 'object', additionalProperties: false, required: ['code', 'message'],
    properties: { code: { type: 'string', minLength: 1 }, message: { type: 'string' }, stepId: { type: 'string' } },
};
exports.BROWSER_RUN_OUTPUT_V2_SCHEMA = {
    $id: exports.BROWSER_RUN_OUTPUT_V2_SCHEMA_ID,
    type: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'run', 'summary', 'steps', 'pages', 'artifacts', 'outputs', 'warnings'],
    properties: {
        schemaVersion: { const: 'browser-run-output/v2' },
        run: {
            type: 'object',
            additionalProperties: false,
            required: ['executionId', 'runtimeSessionId', 'backend', 'status', 'startedAt', 'endedAt', 'contractDigest'],
            properties: {
                executionId: { type: 'string', minLength: 1 },
                runtimeSessionId: { type: 'string', minLength: 1 },
                backend: { type: 'string', minLength: 1 },
                status: { enum: ['completed', 'completed_with_warnings', 'failed', 'blocked', 'takeover_required'] },
                startedAt: { type: 'string', minLength: 1 },
                endedAt: { type: 'string', minLength: 1 },
                finalPageId: { type: 'string' },
                contractDigest: { type: 'string', minLength: 1 },
            },
        },
        summary: {
            type: 'object',
            additionalProperties: false,
            required: ['totalSteps', 'completedSteps', 'recoveredSteps', 'failedSteps', 'skippedSteps'],
            properties: {
                totalSteps: { type: 'integer', minimum: 0 },
                completedSteps: { type: 'integer', minimum: 0 },
                recoveredSteps: { type: 'integer', minimum: 0 },
                failedSteps: { type: 'integer', minimum: 0 },
                skippedSteps: { type: 'integer', minimum: 0 },
            },
        },
        steps: { type: 'array', items: stepSummarySchema },
        pages: { type: 'array', items: pageCaptureSchema },
        artifacts: { type: 'array', items: artifactRefSchema },
        outputs: { type: 'object', additionalProperties: outputValueSchema },
        warnings: { type: 'array', items: warningSchema },
    },
};
const asBrowserRunOutputV2 = (value) => value;
exports.asBrowserRunOutputV2 = asBrowserRunOutputV2;
//# sourceMappingURL=browser-run-output.schema.js.map