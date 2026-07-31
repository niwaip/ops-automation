export type LlmOperationIdV1 = 'summarize_text' | 'summarize_list' | 'extract_structured_fields' | 'rewrite_to_markdown' | 'classify_intent_label' | 'merge_multi_source_notes';
export type ValueTypeV1 = 'string' | 'number' | 'boolean' | 'json' | 'text_list' | 'news_item_list' | 'markdown_content' | 'artifact_ref';
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
    failurePolicy: 'abort';
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
    promptTemplateId: string;
    promptTemplateVersion: string;
    modelPolicyId: string;
    temperature: 0;
    maxInputTokens: number;
    maxOutputTokens: number;
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
    planType: 'single' | 'sequential';
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
    category?: SkillPlanNodeV1['runtimeType'];
    /** Actual execution runtime type (e.g. 'document_markdown_writer'). When absent, category/runtimeType is used for dispatch. */
    executionRuntimeType?: string;
    supportsArtifactOutput?: boolean;
    publishedSkillId?: string;
    executableVersion?: string;
}
/**
 * Stable canonical JSON representation of a plan draft for deterministic SHA-256 hashing.
 */
export declare function canonicalizePlan(plan: DeterministicPlanDraftV1): Record<string, unknown>;
export declare function computePlanHash(plan: DeterministicPlanDraftV1): string;
//# sourceMappingURL=index.d.ts.map