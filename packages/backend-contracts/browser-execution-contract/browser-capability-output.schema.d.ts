type JsonRecord = Record<string, unknown>;
export type BrowserCapabilityOutputSchemaInput = {
    declaredOutputSchema?: unknown;
    runtimeMetadata?: unknown;
    executionPlan?: unknown;
    composition?: unknown;
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
export declare function buildBrowserCapabilityOutputSchema(input: BrowserCapabilityOutputSchemaInput): JsonRecord;
export declare function browserCompositionHasPostProcessing(value: unknown): boolean;
export {};
//# sourceMappingURL=browser-capability-output.schema.d.ts.map