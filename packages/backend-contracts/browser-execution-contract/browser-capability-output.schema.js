"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBrowserCapabilityOutputSchema = buildBrowserCapabilityOutputSchema;
exports.browserCompositionHasPostProcessing = browserCompositionHasPostProcessing;
const LEGACY_BROWSER_OUTPUTS = {
    text: { type: 'string', description: '浏览器最终页面的可见文本', 'x-primary-output': true },
    pageUrl: { type: 'string', description: '浏览器最终页面地址' },
    title: { type: 'string', description: '浏览器最终页面标题' },
    screenshot: { type: 'string', description: '最后一次页面截图引用' },
    result: { type: 'object', description: '浏览器执行结果详情' },
};
/**
 * Projects a browser template's public outputs from runtime evidence.
 *
 * Older releases stored a broad, synthetic six-field schema regardless of
 * what the recording or its post-processing steps actually produced.  This
 * projector deliberately ignores undeclared synthetic properties and derives
 * the contract from executionPlan.outputs and composition.outputDeclarations.
 * Legacy runtime aliases remain available, with `text` as the stable primary
 * output, but an LLM `summary` is never invented for a browser-only template.
 */
function buildBrowserCapabilityOutputSchema(input) {
    const runtimeMetadata = asRecord(input.runtimeMetadata);
    const executionPlan = asRecord(input.executionPlan) || asRecord(runtimeMetadata?.executionPlan);
    const composition = asRecord(input.composition) || asRecord(runtimeMetadata?.composition);
    const properties = { ...LEGACY_BROWSER_OUTPUTS };
    for (const output of asRecordArray(executionPlan?.outputs)) {
        const name = nonEmptyString(output.name);
        if (!name)
            continue;
        properties[name] = {
            type: normalizeJsonSchemaType(output.type),
            ...(nonEmptyString(output.description)
                ? { description: nonEmptyString(output.description) }
                : {}),
        };
    }
    for (const declaration of asRecordArray(composition?.outputDeclarations)) {
        const name = nonEmptyString(declaration.name);
        if (!name)
            continue;
        properties[name] = {
            type: declaration.kind === 'content' ? 'string' : 'object',
            ...(declaration.kind === 'content' ? { valueType: 'string' } : {}),
        };
    }
    return {
        type: 'object',
        primaryOutput: 'text',
        properties,
        // Legacy and V2 browser runtimes both carry the visible text in a nested
        // execution envelope before downstream output projection.  `text` is the
        // semantic primary output, but it is not a raw-envelope required field.
        required: [],
        additionalProperties: true,
    };
}
function browserCompositionHasPostProcessing(value) {
    return asRecordArray(asRecord(value)?.postProcessingSteps).length > 0;
}
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function asRecordArray(value) {
    return Array.isArray(value) ? value.map(asRecord).filter((item) => !!item) : [];
}
function nonEmptyString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function normalizeJsonSchemaType(value) {
    switch (value) {
        case 'string':
        case 'number':
        case 'integer':
        case 'boolean':
        case 'array':
        case 'object':
            return value;
        default:
            return 'object';
    }
}
//# sourceMappingURL=browser-capability-output.schema.js.map