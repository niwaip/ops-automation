"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectOutputSchemaV1 = projectOutputSchemaV1;
exports.resolvePrimaryOutputFieldV1 = resolvePrimaryOutputFieldV1;
exports.canonicalizePlan = canonicalizePlan;
exports.computePlanHash = computePlanHash;
const crypto = __importStar(require("crypto"));
const VALUE_TYPES_V1 = new Set([
    'string',
    'number',
    'boolean',
    'json',
    'text_list',
    'news_item_list',
    'markdown_content',
    'artifact_ref',
]);
/**
 * Projects an authoritative JSON Schema into the small semantic type system
 * used by deterministic plans. Field names remain physical output paths;
 * semantic types such as `artifact_ref` never become field names.
 *
 * Capability authors should prefer `valueType` / `x-value-type` and
 * `primaryOutput` / `x-primary-output`. Structural and legacy-name inference
 * only preserves compatibility for already-published contracts.
 */
function projectOutputSchemaV1(schema) {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
        return { outputContract: {} };
    }
    const schemaRecord = schema;
    const rawProperties = Object.prototype.hasOwnProperty.call(schemaRecord, 'properties')
        ? schemaRecord.properties
        : looksLikeJsonSchema(schemaRecord)
            ? {}
            : schemaRecord;
    const properties = normalizeOutputProperties(rawProperties);
    const outputContract = {};
    for (const [fieldName, property] of Object.entries(properties)) {
        outputContract[fieldName] = projectOutputValueTypeV1(fieldName, property);
    }
    const explicitPrimary = [
        schemaRecord.primaryOutput,
        schemaRecord['x-primary-output'],
        schemaRecord.xPrimaryOutput,
    ].find((value) => typeof value === 'string' && value.length > 0);
    const propertyPrimary = Object.entries(properties).find(([, property]) => {
        const record = asRecord(property);
        return (record.primary === true ||
            record['x-primary-output'] === true ||
            record.xPrimaryOutput === true);
    })?.[0];
    const primaryOutput = explicitPrimary && outputContract[explicitPrimary] ? explicitPrimary : propertyPrimary;
    return primaryOutput ? { outputContract, primaryOutput } : { outputContract };
}
/** Resolves a physical output field without guessing by object key order. */
function resolvePrimaryOutputFieldV1(projection, expectedType) {
    const { outputContract, primaryOutput } = projection;
    if (primaryOutput &&
        outputContract[primaryOutput] &&
        (!expectedType || outputContract[primaryOutput] === expectedType)) {
        return primaryOutput;
    }
    if (expectedType) {
        const matches = Object.keys(outputContract).filter((fieldName) => outputContract[fieldName] === expectedType);
        if (matches.length === 1)
            return matches[0];
        return undefined;
    }
    const fields = Object.keys(outputContract);
    return fields.length === 1 ? fields[0] : undefined;
}
function projectOutputValueTypeV1(fieldName, property) {
    const record = asRecord(property);
    const declaredSemanticType = [
        typeof property === 'string' ? property : undefined,
        record.valueType,
        record.semanticType,
        record['x-value-type'],
        record.xValueType,
    ].find((value) => typeof value === 'string' && VALUE_TYPES_V1.has(value));
    if (declaredSemanticType)
        return declaredSemanticType;
    // Some operation catalogs historically placed semantic types directly in
    // JSON Schema `type`. Accept only non-JSON semantic tags here so ordinary
    // `type: string` does not mask field-level compatibility semantics below.
    if (typeof record.type === 'string' &&
        ['text_list', 'news_item_list', 'markdown_content', 'artifact_ref', 'json'].includes(record.type)) {
        return record.type;
    }
    if (isArtifactReferenceSchema(record))
        return 'artifact_ref';
    // Compatibility for contracts published before semantic annotations existed.
    if (['searchResults', 'results', 'news_item_list'].includes(fieldName)) {
        return 'news_item_list';
    }
    if (fieldName === 'markdown_content')
        return 'markdown_content';
    switch (record.type ?? (typeof property === 'string' ? property : undefined)) {
        case 'string':
            return 'string';
        case 'number':
        case 'integer':
            return 'number';
        case 'boolean':
            return 'boolean';
        case 'array':
        case 'object':
        default:
            return 'json';
    }
}
function isArtifactReferenceSchema(schema) {
    if (schema.type !== 'object' && !schema.properties)
        return false;
    const properties = asRecord(schema.properties);
    return 'url' in properties && 'mimeType' in properties && 'name' in properties;
}
function normalizeOutputProperties(value) {
    if (Array.isArray(value)) {
        const result = {};
        for (const property of value) {
            const record = asRecord(property);
            const fieldName = record.name ?? record.fieldName ?? record.key;
            if (typeof fieldName === 'string' && fieldName.length > 0) {
                result[fieldName] = record;
            }
        }
        return result;
    }
    return asRecord(value);
}
function looksLikeJsonSchema(value) {
    return [
        '$schema',
        '$id',
        'type',
        'required',
        'additionalProperties',
        'oneOf',
        'anyOf',
        'allOf',
    ].some((keyword) => Object.prototype.hasOwnProperty.call(value, keyword));
}
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
}
/**
 * Stable canonical JSON representation of a plan draft for deterministic SHA-256 hashing.
 */
function canonicalizePlan(plan) {
    const sortedNodes = [...plan.nodes]
        .sort((a, b) => a.sequence - b.sequence)
        .map((node) => {
        const canonicalNode = {
            nodeId: node.nodeId,
            sequence: node.sequence,
            kind: node.kind,
            title: node.title,
            dependsOn: [...node.dependsOn].sort(),
            inputBindings: sortObjectKeys(node.inputBindings),
            outputContract: sortObjectKeys(node.outputContract),
            failurePolicy: node.failurePolicy,
        };
        if (node.runWhen)
            canonicalNode.runWhen = node.runWhen;
        if (node.contractRef)
            canonicalNode.contractRef = node.contractRef;
        if (node.contractDigest)
            canonicalNode.contractDigest = node.contractDigest;
        if (node.kind === 'skill') {
            canonicalNode.skillId = node.skillId;
            canonicalNode.skillVersion = node.skillVersion;
            canonicalNode.runtimeType = node.runtimeType;
            if (node.executionRuntimeType)
                canonicalNode.executionRuntimeType = node.executionRuntimeType;
            if (node.retryPolicyId)
                canonicalNode.retryPolicyId = node.retryPolicyId;
        }
        else if (node.kind === 'llm_operation') {
            canonicalNode.operationId = node.operationId;
            canonicalNode.operationVersion = node.operationVersion;
            canonicalNode.operationDigest = node.operationDigest;
            canonicalNode.contractDigest = node.contractDigest;
            if (node.promptTemplateId)
                canonicalNode.promptTemplateId = node.promptTemplateId;
            if (node.promptTemplateVersion)
                canonicalNode.promptTemplateVersion = node.promptTemplateVersion;
            if (node.modelPolicyId)
                canonicalNode.modelPolicyId = node.modelPolicyId;
            if (node.modelId)
                canonicalNode.modelId = node.modelId;
            if (node.temperature !== undefined)
                canonicalNode.temperature = node.temperature;
            if (node.maxInputTokens !== undefined)
                canonicalNode.maxInputTokens = node.maxInputTokens;
            if (node.maxOutputTokens !== undefined)
                canonicalNode.maxOutputTokens = node.maxOutputTokens;
        }
        return canonicalNode;
    });
    const sortedFinalOutputs = [...plan.finalOutputs]
        .sort((a, b) => `${a.fromNodeId}:${a.targetField}`.localeCompare(`${b.fromNodeId}:${b.targetField}`))
        .map((fo) => sortObjectKeys(fo));
    return {
        schemaVersion: plan.schemaVersion,
        planType: plan.planType,
        objective: plan.objective.trim(),
        nodes: sortedNodes,
        finalOutputs: sortedFinalOutputs,
    };
}
function sortObjectKeys(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(sortObjectKeys);
    }
    const sortedObj = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
        sortedObj[key] = sortObjectKeys(obj[key]);
    }
    return sortedObj;
}
function computePlanHash(plan) {
    const canonical = canonicalizePlan(plan);
    const jsonStr = JSON.stringify(canonical);
    return crypto.createHash('sha256').update(jsonStr, 'utf8').digest('hex');
}
//# sourceMappingURL=index.js.map