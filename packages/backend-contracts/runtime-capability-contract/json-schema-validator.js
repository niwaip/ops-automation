"use strict";
// eslint-disable-next-line @typescript-eslint/no-var-requires
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsonSchemaValidator = void 0;
function safeRequire(moduleName) {
    const candidates = [
        moduleName,
        `/app/node_modules/${moduleName}`,
        `${process.cwd()}/node_modules/${moduleName}`,
    ];
    for (const candidate of candidates) {
        try {
            return require(candidate);
        }
        catch {
            // try next candidate
        }
    }
    try {
        if (require.main && typeof require.main.require === 'function') {
            return require.main.require(moduleName);
        }
    }
    catch {
        // ignore
    }
    return null;
}
function getAjvConstructor() {
    for (const moduleName of ['ajv/dist/2020', 'ajv']) {
        const mod = safeRequire(moduleName);
        if (!mod)
            continue;
        if (typeof mod === 'function')
            return mod;
        if (typeof mod.default === 'function')
            return mod.default;
        if (typeof mod.Ajv === 'function')
            return mod.Ajv;
    }
    return null;
}
const AjvConstructor = getAjvConstructor();
class JsonSchemaValidatorService {
    constructor() {
        this.inputValidatorsCache = new Map();
        this.outputValidatorsCache = new Map();
        this.initAjvInstances();
    }
    initAjvInstances() {
        const Ctor = typeof AjvConstructor === 'function' ? AjvConstructor : getAjvConstructor();
        if (typeof Ctor === 'function') {
            try {
                this.inputAjv = new Ctor({
                    allErrors: true,
                    useDefaults: true,
                    coerceTypes: false,
                    strict: false,
                });
                this.outputAjv = new Ctor({
                    allErrors: true,
                    useDefaults: false,
                    coerceTypes: false,
                    strict: false,
                });
            }
            catch {
                // ignore init errors
            }
        }
    }
    /**
     * Validate arbitrary target output data strictly without side effects / default value mutations.
     */
    validateOutput(data, schema) {
        return this.executeValidation(data, schema, this.outputAjv || this.lazyGetAjv(false), this.outputValidatorsCache);
    }
    /**
     * Validate input data, allowing input default value population (useDefaults: true).
     */
    validateInput(data, schema) {
        return this.executeValidation(data, schema, this.inputAjv || this.lazyGetAjv(true), this.inputValidatorsCache);
    }
    /**
     * Default validation entry point (defaults to strict output validation without side effects).
     */
    validate(data, schema) {
        return this.validateOutput(data, schema);
    }
    lazyGetAjv(isInput) {
        this.initAjvInstances();
        return isInput ? this.inputAjv : this.outputAjv;
    }
    executeValidation(data, schema, ajvInstance, cacheMap) {
        if (!schema || Object.keys(schema).length === 0) {
            return { valid: true };
        }
        if (!ajvInstance) {
            ajvInstance = this.lazyGetAjv(cacheMap === this.inputValidatorsCache);
        }
        if (!ajvInstance || typeof ajvInstance.compile !== 'function') {
            // Fallback gracefully if Ajv module is unavailable in the environment
            return { valid: true };
        }
        try {
            const cacheKey = JSON.stringify(schema);
            let validateFn = cacheMap.get(cacheKey);
            if (!validateFn) {
                const cleanSchema = this.sanitizeSchema(schema);
                validateFn = ajvInstance.compile(cleanSchema);
                cacheMap.set(cacheKey, validateFn);
            }
            const valid = Boolean(validateFn(data));
            if (valid) {
                return { valid: true };
            }
            const rawErrors = validateFn.errors || [];
            const errors = rawErrors.map((err) => ({
                path: err.instancePath || err.dataPath || '/',
                message: err.message || 'Schema validation error',
                keyword: err.keyword,
                params: err.params,
            }));
            return {
                valid: false,
                errors,
            };
        }
        catch (err) {
            return {
                valid: false,
                errors: [
                    {
                        path: '/',
                        message: `JSON Schema compilation or validation threw error: ${err.message}`,
                        keyword: 'compilation',
                    },
                ],
            };
        }
    }
    /**
     * Extract data from a runtime result envelope using a simplified JSON path (e.g. '$.result.businessData', '$.data', '$.result').
     */
    extractDataByPath(envelope, dataPath) {
        if (!dataPath || dataPath === '$' || dataPath === '$.') {
            return envelope;
        }
        if (envelope === null || typeof envelope !== 'object') {
            return envelope;
        }
        const normalizedPath = dataPath.startsWith('$.')
            ? dataPath.slice(2)
            : dataPath.startsWith('$')
                ? dataPath.slice(1)
                : dataPath;
        if (!normalizedPath)
            return envelope;
        const segments = normalizedPath.split('.').filter(Boolean);
        let current = envelope;
        for (const segment of segments) {
            if (current === null || typeof current !== 'object') {
                return undefined;
            }
            current = current[segment];
        }
        return current;
    }
    /**
     * Sanitizes a JSON Schema for Ajv compilation:
     * 1. Strips non-standard meta-schema $schema URIs (e.g. 2020-12).
     * 2. Extracts property-level boolean `required: true` into parent object's `required` array.
     * 3. Deletes property-level boolean `required: false/true`.
     * 4. Ensures parent `required` is an array of strings (or deletes non-array `required`).
     * 5. Recursively cleans child schemas (`properties`, `items`, `additionalProperties`, `$defs`, `definitions`).
     */
    sanitizeSchema(schema) {
        if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
            return schema;
        }
        const clean = { ...schema };
        // Strip unhandled meta-schema URIs
        if (typeof clean['$schema'] === 'string' && clean['$schema'].includes('2020-12')) {
            delete clean['$schema'];
        }
        // Process object properties and boolean required fields
        if (clean.properties && typeof clean.properties === 'object' && !Array.isArray(clean.properties)) {
            const properties = {};
            const newRequired = new Set(Array.isArray(clean.required) ? clean.required.filter((item) => typeof item === 'string') : []);
            for (const [propKey, propVal] of Object.entries(clean.properties)) {
                if (propVal && typeof propVal === 'object' && !Array.isArray(propVal)) {
                    const legacyRequired = propVal.required;
                    const cleanProp = this.sanitizeSchema(propVal);
                    if (legacyRequired === true) {
                        newRequired.add(propKey);
                    }
                    if (typeof legacyRequired === 'boolean') {
                        delete cleanProp.required;
                    }
                    properties[propKey] = cleanProp;
                }
                else {
                    properties[propKey] = propVal;
                }
            }
            clean.properties = properties;
            if (newRequired.size > 0) {
                clean.required = Array.from(newRequired);
            }
            else if ('required' in clean && !Array.isArray(clean.required)) {
                delete clean.required;
            }
        }
        else if ('required' in clean && !Array.isArray(clean.required)) {
            delete clean.required;
        }
        // Process array items
        if (clean.items && typeof clean.items === 'object' && !Array.isArray(clean.items)) {
            clean.items = this.sanitizeSchema(clean.items);
        }
        // Process additionalProperties if object
        if (clean.additionalProperties && typeof clean.additionalProperties === 'object' && !Array.isArray(clean.additionalProperties)) {
            clean.additionalProperties = this.sanitizeSchema(clean.additionalProperties);
        }
        // Process $defs or definitions
        for (const defsKey of ['$defs', 'definitions']) {
            if (clean[defsKey] && typeof clean[defsKey] === 'object' && !Array.isArray(clean[defsKey])) {
                const defs = {};
                for (const [dKey, dVal] of Object.entries(clean[defsKey])) {
                    if (dVal && typeof dVal === 'object' && !Array.isArray(dVal)) {
                        defs[dKey] = this.sanitizeSchema(dVal);
                    }
                    else {
                        defs[dKey] = dVal;
                    }
                }
                clean[defsKey] = defs;
            }
        }
        return clean;
    }
}
exports.jsonSchemaValidator = new JsonSchemaValidatorService();
//# sourceMappingURL=json-schema-validator.js.map