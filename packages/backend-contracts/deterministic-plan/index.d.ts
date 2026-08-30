export type LlmOperationIdV1 = 'summarize_text' | 'summarize_list' | 'generate_text' | 'transform_text' | 'extract_structured_fields' | 'rewrite_to_markdown' | 'classify_intent_label' | 'merge_multi_source_notes';
export type ValueTypeV1 = 'string' | 'number' | 'boolean' | 'json' | 'text_list' | 'news_item_list' | 'markdown_content' | 'artifact_ref';
export interface ProjectedOutputContractV1 {
    outputContract: Record<string, ValueTypeV1>;
    primaryOutput?: string;
}
/**
 * Projects an authoritative JSON Schema into the small semantic type system
 * used by deterministic plans. Field names remain physical output paths;
 * semantic types such as `artifact_ref` never become field names.
 *
 * Capability authors should prefer `valueType` / `x-value-type` and
 * `primaryOutput` / `x-primary-output`. Structural and legacy-name inference
 * only preserves compatibility for already-published contracts.
 */
export declare function projectOutputSchemaV1(schema: unknown): ProjectedOutputContractV1;
/** Resolves a physical output field without guessing by object key order. */
export declare function resolvePrimaryOutputFieldV1(projection: ProjectedOutputContractV1, expectedType?: ValueTypeV1): string | undefined;
export type ValueBindingV1 = {
    source: 'literal';
    value: unknown;
} | {
    source: 'user_input';
    path: string;
} | {
    source: 'node_output';
    nodeId: string;
    fromNodeId?: string;
    path?: string;
    outputPath?: string;
    expectedType?: ValueTypeV1;
    transform?: 'extract_unique_array' | 'resolve_text_content' | 'project_ops_report';
} | {
    source: 'runtime_default';
    key: string;
};
export interface PlanNodeBaseV1 {
    nodeId: string;
    sequence: number;
    title: string;
    dependsOn: string[];
    inputBindings: Record<string, ValueBindingV1>;
    outputContract: Record<string, ValueTypeV1>;
    contractRef?: string;
    contractDigest?: string;
    /** `continue` is reserved for a browser terminal result that still carries
     * a valid BrowserRunOutputV2 for an explicitly configured report step. */
    failurePolicy: 'abort' | 'continue';
    /** Governs explicit post-processing; omitted means all dependencies must
     * have a successful transport result. */
    runWhen?: 'browser_succeeded' | 'browser_terminal';
}
export interface SkillPlanNodeV1 extends PlanNodeBaseV1 {
    kind: 'skill';
    skillId: string;
    skillVersion: string;
    runtimeType: 'api' | 'workflow' | 'browser_template' | 'artifact';
    /** Actual runtime type for execution dispatch (e.g. 'document_markdown_writer'). When absent, runtimeType is used. */
    executionRuntimeType?: string;
    retryPolicyId?: string;
}
export interface LlmOperationPlanNodeV1 extends PlanNodeBaseV1 {
    kind: 'llm_operation';
    operationId: LlmOperationIdV1;
    operationVersion: string;
    operationDigest: string;
    contractDigest: string;
    promptTemplateId?: string;
    promptTemplateVersion?: string;
    modelPolicyId?: string;
    /** Exact model selected when the plan is frozen. */
    modelId?: string;
    temperature?: number;
    maxInputTokens?: number;
    maxOutputTokens?: number;
}
export type DeterministicPlanNodeV1 = SkillPlanNodeV1 | LlmOperationPlanNodeV1;
export interface FinalOutputRequirementV1 {
    targetField: string;
    fromNodeId: string;
    fromNodeOutput: string;
    expectedType: ValueTypeV1;
    mimeType?: string;
    isArtifact?: boolean;
}
export interface RequiredUserInputV1 {
    targetField: string;
    nodeId: string;
    prompt: string;
    /** Stable submission key exposed to the chat/client input form. */
    name?: string;
    /** Path in execution.inputJson consumed by a user_input binding. */
    inputPath?: string;
    type?: string;
    description?: string;
    enum?: Array<string | number>;
    missing?: boolean;
}
export interface PlanValidationErrorV1 {
    code: string;
    message: string;
    nodeId?: string;
    field?: string;
}
export interface PlanValidationResultV1 {
    valid: boolean;
    errors: PlanValidationErrorV1[];
    warnings?: string[];
}
export interface DeterministicPlanDraftV1 {
    schemaVersion: 'deterministic-plan/v1';
    plannerVersion: string;
    catalogVersion: string;
    planType: 'single' | 'sequential' | 'dag';
    objective: string;
    originalRequest: string;
    status: 'draft' | 'validated' | 'frozen' | 'rejected';
    nodes: DeterministicPlanNodeV1[];
    finalOutputs: FinalOutputRequirementV1[];
    requiredUserInputs?: RequiredUserInputV1[];
    validationResult?: PlanValidationResultV1;
    planHash?: string;
}
export interface CompactCapabilityCardV1 {
    id: string;
    kind: 'skill' | 'llm_operation';
    displayName?: string;
    summary: string;
    goals: string[];
    inputs: Record<string, string>;
    outputs: Record<string, string>;
    /** Physical field name selected by the authoritative output schema. */
    primaryOutput?: string;
    category?: SkillPlanNodeV1['runtimeType'];
    /** Actual execution runtime type (e.g. 'document_markdown_writer'). When absent, category/runtimeType is used for dispatch. */
    executionRuntimeType?: string;
    supportsArtifactOutput?: boolean;
    publishedSkillId?: string;
    executableVersion?: string;
    /** Immutable LLM Operation manifest digest; required when kind is llm_operation. */
    operationDigest?: string;
    /** Immutable LLM Operation input/output contract digest; required when kind is llm_operation. */
    contractDigest?: string;
}
/**
 * Stable canonical JSON representation of a plan draft for deterministic SHA-256 hashing.
 */
export declare function canonicalizePlan(plan: DeterministicPlanDraftV1): Record<string, unknown>;
export declare function computePlanHash(plan: DeterministicPlanDraftV1): string;
//# sourceMappingURL=index.d.ts.map