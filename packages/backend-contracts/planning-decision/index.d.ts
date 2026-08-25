export declare const PLANNING_CLASSES_V1: readonly ["replay_workflow", "single_capability", "recipe_plan", "generated_plan", "exploratory_agent"];
export type PlanningClassV1 = (typeof PLANNING_CLASSES_V1)[number];
export declare const PLANNING_ROUTE_SOURCES_V1: readonly ["explicit_reference", "saved_workflow", "deterministic_match", "recipe", "llm_topology", "exploratory"];
export type PlanningRouteSourceV1 = (typeof PLANNING_ROUTE_SOURCES_V1)[number];
export interface PlanningDecisionV1 {
    schemaVersion: 'planning-decision/v1';
    routeClass: PlanningClassV1;
    routeSource: PlanningRouteSourceV1;
    confidence: number;
    reasonCodes: string[];
    candidateIds: string[];
    selectedCapabilityIds: string[];
    catalogSnapshotDigest: string;
    routingPolicyVersion: string;
    routingPolicyDigest: string;
    estimatedModelCalls: number;
    estimatedInputTokens: number;
    tokenBudget: number;
    riskLevel: 'L0' | 'L1' | 'L2' | 'L3';
    requiresApproval: boolean;
    replayability: 'exact' | 'contract' | 'best_effort';
}
export interface PlanningDecisionValidationResult {
    valid: boolean;
    errors: string[];
}
export declare function validatePlanningDecisionV1(value: unknown): PlanningDecisionValidationResult;
export declare function assertPlanningDecisionV1(value: unknown): asserts value is PlanningDecisionV1;
//# sourceMappingURL=index.d.ts.map