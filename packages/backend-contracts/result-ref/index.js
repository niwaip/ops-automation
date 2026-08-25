"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectResultFields = projectResultFields;
exports.isResultRefV1 = isResultRefV1;
const SAFE_SEGMENT = /^[a-zA-Z0-9_-]+$/u;
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
function projectResultFields(payload, paths, maxPaths = 32) {
    if (!Array.isArray(paths) || paths.length === 0) {
        throw new Error('At least one result projection path is required');
    }
    if (paths.length > maxPaths)
        throw new Error(`Result projection exceeds ${maxPaths} paths`);
    const output = {};
    for (const path of paths) {
        const segments = path.split('.');
        if (!segments.every((segment) => SAFE_SEGMENT.test(segment) && !FORBIDDEN_SEGMENTS.has(segment))) {
            throw new Error(`Unsafe result projection path: ${path}`);
        }
        let current = payload;
        for (const segment of segments) {
            if (!current || typeof current !== 'object' || Array.isArray(current)) {
                current = undefined;
                break;
            }
            current = current[segment];
        }
        output[path] = current;
    }
    return output;
}
function isResultRefV1(value) {
    const record = value;
    return Boolean(record &&
        record.schemaVersion === 'result-ref/v1' &&
        typeof record.id === 'string' &&
        typeof record.executionId === 'string' &&
        typeof record.schemaDigest === 'string' &&
        typeof record.sizeBytes === 'number');
}
//# sourceMappingURL=index.js.map