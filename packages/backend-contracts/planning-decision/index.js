"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLANNING_ROUTE_SOURCES_V1 = exports.PLANNING_CLASSES_V1 = void 0;
exports.validatePlanningDecisionV1 = validatePlanningDecisionV1;
exports.assertPlanningDecisionV1 = assertPlanningDecisionV1;
exports.PLANNING_CLASSES_V1 = [
    'replay_workflow',
    'single_capability',
    'recipe_plan',
    'generated_plan',
    'exploratory_agent',
];
exports.PLANNING_ROUTE_SOURCES_V1 = [
    'explicit_reference',
    'saved_workflow',
    'deterministic_match',
    'recipe',
    'llm_topology',
    'exploratory',
];
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
function validatePlanningDecisionV1(value) {
    const errors = [];
    if (!isRecord(value)) {
        return { valid: false, errors: ['decision must be an object'] };
    }
    if (value.schemaVersion !== 'planning-decision/v1') {
        errors.push('schemaVersion must equal planning-decision/v1');
    }
    if (!exports.PLANNING_CLASSES_V1.includes(value.routeClass)) {
        errors.push('routeClass is invalid');
    }
    if (!exports.PLANNING_ROUTE_SOURCES_V1.includes(value.routeSource)) {
        errors.push('routeSource is invalid');
    }
    validateBoundedNumber(value.confidence, 'confidence', 0, 1, errors);
    validateStringArray(value.reasonCodes, 'reasonCodes', errors);
    validateStringArray(value.candidateIds, 'candidateIds', errors);
    validateStringArray(value.selectedCapabilityIds, 'selectedCapabilityIds', errors);
    validateDigest(value.catalogSnapshotDigest, 'catalogSnapshotDigest', errors);
    validateNonEmptyString(value.routingPolicyVersion, 'routingPolicyVersion', errors);
    validateDigest(value.routingPolicyDigest, 'routingPolicyDigest', errors);
    validateNonNegativeInteger(value.estimatedModelCalls, 'estimatedModelCalls', errors);
    validateNonNegativeInteger(value.estimatedInputTokens, 'estimatedInputTokens', errors);
    validateNonNegativeInteger(value.tokenBudget, 'tokenBudget', errors);
    if (!['L0', 'L1', 'L2', 'L3'].includes(String(value.riskLevel))) {
        errors.push('riskLevel is invalid');
    }
    if (typeof value.requiresApproval !== 'boolean') {
        errors.push('requiresApproval must be a boolean');
    }
    if (!['exact', 'contract', 'best_effort'].includes(String(value.replayability))) {
        errors.push('replayability is invalid');
    }
    return { valid: errors.length === 0, errors };
}
function assertPlanningDecisionV1(value) {
    const result = validatePlanningDecisionV1(value);
    if (!result.valid) {
        throw new Error(`Invalid PlanningDecisionV1: ${result.errors.join('; ')}`);
    }
}
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function validateBoundedNumber(value, field, min, max, errors) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
        errors.push(`${field} must be a number between ${min} and ${max}`);
    }
}
function validateNonNegativeInteger(value, field, errors) {
    if (!Number.isInteger(value) || Number(value) < 0) {
        errors.push(`${field} must be a non-negative integer`);
    }
}
function validateNonEmptyString(value, field, errors) {
    if (typeof value !== 'string' || value.trim() === '') {
        errors.push(`${field} must be a non-empty string`);
    }
}
function validateDigest(value, field, errors) {
    if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
        errors.push(`${field} must be a lowercase sha256 digest`);
    }
}
function validateStringArray(value, field, errors) {
    if (!Array.isArray(value) ||
        value.some((item) => typeof item !== 'string' || item.trim() === '')) {
        errors.push(`${field} must be an array of non-empty strings`);
    }
}
//# sourceMappingURL=index.js.map