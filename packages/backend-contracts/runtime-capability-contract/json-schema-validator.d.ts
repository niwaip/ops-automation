export interface SchemaValidationResult {
    valid: boolean;
    errors?: Array<{
        path: string;
        message: string;
        keyword?: string;
        params?: Record<string, unknown>;
    }>;
}
declare class JsonSchemaValidatorService {
    private inputAjv;
    private outputAjv;
    private inputValidatorsCache;
    private outputValidatorsCache;
    constructor();
    private initAjvInstances;
    /**
     * Validate arbitrary target output data strictly without side effects / default value mutations.
     */
    validateOutput(data: unknown, schema: Record<string, unknown>): SchemaValidationResult;
    /**
     * Validate input data, allowing input default value population (useDefaults: true).
     */
    validateInput(data: unknown, schema: Record<string, unknown>): SchemaValidationResult;
    /**
     * Default validation entry point (defaults to strict output validation without side effects).
     */
    validate(data: unknown, schema: Record<string, unknown>): SchemaValidationResult;
    private lazyGetAjv;
    private executeValidation;
    /**
     * Extract data from a runtime result envelope using a simplified JSON path (e.g. '$.result.businessData', '$.data', '$.result').
     */
    extractDataByPath(envelope: unknown, dataPath?: string): unknown;
    /**
     * Sanitizes a JSON Schema for Ajv compilation:
     * 1. Strips non-standard meta-schema $schema URIs (e.g. 2020-12).
     * 2. Extracts property-level boolean `required: true` into parent object's `required` array.
     * 3. Deletes property-level boolean `required: false/true`.
     * 4. Ensures parent `required` is an array of strings (or deletes non-array `required`).
     * 5. Recursively cleans child schemas (`properties`, `items`, `additionalProperties`, `$defs`, `definitions`).
     */
    sanitizeSchema(schema: Record<string, unknown>): Record<string, unknown>;
}
export declare const jsonSchemaValidator: JsonSchemaValidatorService;
export {};
//# sourceMappingURL=json-schema-validator.d.ts.map