"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CAPABILITY_LIFECYCLE = void 0;
exports.validateCapabilityPackManifest = validateCapabilityPackManifest;
exports.assertCapabilityPackManifest = assertCapabilityPackManifest;
exports.digestCapabilityContract = digestCapabilityContract;
const crypto_1 = require("crypto");
exports.CAPABILITY_LIFECYCLE = [
    'draft',
    'experimental',
    'certified',
    'production',
    'deprecated',
];
function validateCapabilityPackManifest(manifest) {
    const errors = [];
    const requiredStrings = [
        ['metadata.id', manifest?.metadata?.id],
        ['metadata.version', manifest?.metadata?.version],
        ['metadata.owner', manifest?.metadata?.owner],
        ['metadata.contractDigest', manifest?.metadata?.contractDigest],
        ['runtime.routeKey', manifest?.runtime?.routeKey],
        ['runtime.adapterVersion', manifest?.runtime?.adapterVersion],
        ['runtime.protocolVersion', manifest?.runtime?.protocolVersion],
    ];
    for (const [field, value] of requiredStrings) {
        if (typeof value !== 'string' || value.trim() === '')
            errors.push(`${field} is required`);
    }
    if (manifest?.apiVersion !== 'ops-automation/capability-pack/v1') {
        errors.push('apiVersion is invalid');
    }
    if (manifest?.kind !== 'CapabilityPack')
        errors.push('kind is invalid');
    if (!exports.CAPABILITY_LIFECYCLE.includes(manifest?.metadata?.lifecycle)) {
        errors.push('metadata.lifecycle is invalid');
    }
    if (manifest?.metadata?.contractDigest !== digestCapabilityContract(manifest.contract)) {
        errors.push('metadata.contractDigest does not match contract');
    }
    validateRoutingAliases(manifest.routing?.aliases, errors);
    validateEnumAliases(manifest.contract?.contracts?.input?.schema, errors);
    if (['certified', 'production'].includes(manifest?.metadata?.lifecycle)) {
        if (!manifest.routing?.aliases?.length)
            errors.push('routing.aliases is required');
        if (!manifest.routing?.positiveExamples?.length)
            errors.push('routing.positiveExamples is required');
        if (!manifest.routing?.negativeExamples?.length)
            errors.push('routing.negativeExamples is required');
        if (!manifest.runtime?.probe)
            errors.push('runtime.probe is required');
        if (!manifest.governance?.runbook)
            errors.push('governance.runbook is required');
        if (manifest.governance?.idempotency === 'none') {
            errors.push('certified capability must declare idempotent behavior');
        }
    }
    if (manifest?.metadata?.lifecycle === 'production') {
        for (const field of ['slo', 'resourceBudget', 'canaryEvidence', 'rollbackVersion']) {
            if (!manifest.production?.[field])
                errors.push(`production.${field} is required`);
        }
    }
    return { valid: errors.length === 0, errors };
}
function validateRoutingAliases(aliases, errors) {
    if (!Array.isArray(aliases))
        return;
    const normalized = aliases.map((alias) => alias.trim().toLocaleLowerCase()).filter(Boolean);
    if (normalized.length !== aliases.length) {
        errors.push('routing.aliases must contain non-empty strings');
    }
    if (new Set(normalized).size !== normalized.length) {
        errors.push('routing.aliases must be unique');
    }
}
function validateEnumAliases(schema, errors) {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema))
        return;
    const properties = schema.properties;
    if (!properties || typeof properties !== 'object' || Array.isArray(properties))
        return;
    for (const [fieldName, rawProperty] of Object.entries(properties)) {
        if (!rawProperty || typeof rawProperty !== 'object' || Array.isArray(rawProperty))
            continue;
        const property = rawProperty;
        const aliases = property['x-enum-aliases'];
        if (aliases === undefined)
            continue;
        const allowedValues = Array.isArray(property.enum) ? new Set(property.enum.map(String)) : null;
        if (!allowedValues || !aliases || typeof aliases !== 'object' || Array.isArray(aliases)) {
            errors.push(`contract input ${fieldName}.x-enum-aliases requires an enum object`);
            continue;
        }
        for (const [canonicalValue, values] of Object.entries(aliases)) {
            if (!allowedValues.has(canonicalValue)) {
                errors.push(`contract input ${fieldName}.x-enum-aliases key ${canonicalValue} is not in enum`);
            }
            if (!Array.isArray(values) ||
                values.length === 0 ||
                values.some((value) => !String(value).trim())) {
                errors.push(`contract input ${fieldName}.x-enum-aliases.${canonicalValue} must be a non-empty array`);
            }
        }
    }
}
function assertCapabilityPackManifest(manifest) {
    const result = validateCapabilityPackManifest(manifest);
    if (!result.valid)
        throw new Error(`Invalid capability pack: ${result.errors.join('; ')}`);
}
function digestCapabilityContract(contract) {
    const copy = JSON.parse(JSON.stringify(contract || {}));
    if (copy.metadata)
        delete copy.metadata.contractDigest;
    return (0, crypto_1.createHash)('sha256').update(stableStringify(copy)).digest('hex');
}
function stableStringify(value) {
    if (Array.isArray(value))
        return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
}
//# sourceMappingURL=manifest.js.map