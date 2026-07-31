export type BuiltinSkillLifecycle = 'experimental' | 'stable' | 'deprecated';
export type BuiltinSkillAccessMode = 'authenticated' | 'restricted' | 'public';
export type BuiltinWorkflowEngine = 'platform-sequential' | 'temporal' | 'domain-handler';
export type CapabilitySource = 'published_skill' | 'builtin_skill';
export type BuiltinSkillAction = 'discover' | 'execute' | 'manage';
export interface ExecutableCapabilityRef {
    source: CapabilitySource;
    id: string;
    version: string;
}
export interface ExecutableCapabilityView {
    capabilityRef: ExecutableCapabilityRef;
    displayName: string;
    description?: string;
    category: string;
    runtimeType: string;
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
    runtimeHints?: Record<string, unknown>;
    accessStatus: 'authorized' | 'unauthorized';
    lifecycle?: BuiltinSkillLifecycle;
    supportsArtifact?: boolean;
}
export interface BuiltinSkillManifestMetadata {
    key: string;
    displayName: string;
    description?: string;
    owner: string;
    labels?: Record<string, string>;
}
export interface BuiltinSkillPlannerSpec {
    enabled: boolean;
    triggerKeywords?: string[];
    matchSummary?: string;
    runtimeType: string;
    supportsArtifact?: boolean;
}
export interface BuiltinSkillContractSchema {
    schemaRef?: string;
    schema: Record<string, unknown>;
}
export interface BuiltinSkillContractsSpec {
    input: BuiltinSkillContractSchema;
    output: BuiltinSkillContractSchema;
}
export interface BuiltinSkillWorkflowSpec {
    engine: BuiltinWorkflowEngine;
    definitionRef?: string;
    workflowContent?: Record<string, unknown>;
}
export interface BuiltinSkillRuntimeSpec {
    adapterRoute: string;
    handlerKey: string;
    idempotency?: 'required' | 'optional' | 'disabled';
    timeoutSeconds?: number;
    retryPolicy?: {
        maximumAttempts?: number;
    };
}
export interface BuiltinSkillMigrationSpec {
    minimumPlatformVersion?: string;
    contractCompatibility?: 'backward' | 'none';
}
export interface BuiltinSkillSmokeTestSpec {
    inputRef?: string;
    assertions?: string[];
}
export interface BuiltinSkillManifestSpec {
    definitionVersion: string;
    lifecycle: BuiltinSkillLifecycle;
    defaultAccess: {
        mode: BuiltinSkillAccessMode;
    };
    planner?: BuiltinSkillPlannerSpec;
    contracts: BuiltinSkillContractsSpec;
    workflow?: BuiltinSkillWorkflowSpec;
    runtime: BuiltinSkillRuntimeSpec;
    migration?: BuiltinSkillMigrationSpec;
    smokeTest?: BuiltinSkillSmokeTestSpec;
}
export interface BuiltinSkillManifest {
    apiVersion: string;
    kind: 'BuiltinWorkflowSkill';
    metadata: BuiltinSkillManifestMetadata;
    spec: BuiltinSkillManifestSpec;
}
export interface BundleLock {
    capabilityKey: string;
    definitionVersion: string;
    definitionDigest: string;
    fileHashes: Record<string, string>;
    createdAt?: string;
}
export interface BuiltinWorkflowInvokeRequest {
    capabilityKey: string;
    definitionVersion: string;
    executionId: string;
    stepId: string;
    input: Record<string, unknown>;
    idempotencyKey: string;
    traceContext?: Record<string, unknown>;
}
export interface BuiltinSkillContext {
    executionId: string;
    stepId: string;
    capabilityKey: string;
    definitionVersion: string;
    idempotencyKey: string;
    traceContext?: Record<string, unknown>;
}
export interface BuiltinSkillHandlerResult {
    success: boolean;
    output?: Record<string, unknown>;
    errorCode?: string;
    errorMessage?: string;
    artifacts?: Array<{
        type: string;
        id?: string;
        name?: string;
        url?: string;
        mimeType?: string;
        sizeBytes?: number;
        metadata?: Record<string, unknown>;
    }>;
}
export interface BuiltinSkillHandler {
    readonly handlerKey: string;
    execute(context: BuiltinSkillContext, input: Record<string, unknown>): Promise<BuiltinSkillHandlerResult>;
}
export interface BuiltinSkillPermissionOverrideDto {
    id?: string;
    builtinSkillId: string;
    orgId?: string | null;
    principalType: 'role' | 'user';
    principalId: string;
    effect: 'allow' | 'deny';
    reason?: string | null;
    createdBy?: string | null;
    createdAt?: string;
    expiresAt?: string | null;
}
/**
 * Recursively sort object keys for deterministic canonical JSON representation.
 */
export declare function canonicalizeObject(obj: unknown): unknown;
/**
 * Compute canonical SHA-256 digest of a BuiltinSkillManifest.
 */
export declare function computeCanonicalDigest(manifest: BuiltinSkillManifest): string;
//# sourceMappingURL=index.d.ts.map