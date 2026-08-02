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
    private executeValidation;
    /**
     * Extract data from a runtime result envelope using a simplified JSON path (e.g. '$.result.businessData', '$.data', '$.result').
     */
    extractDataByPath(envelope: unknown, dataPath?: string): unknown;
}
export declare const jsonSchemaValidator: JsonSchemaValidatorService;
export {};
//# sourceMappingURL=json-schema-validator.d.ts.map