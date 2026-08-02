export type CapabilitySourceTypeV2 = 'published_skill' | 'builtin_skill' | 'llm_operation';
export interface CapabilityMetadataV2 {
    id: string;
    version: string;
    sourceType: CapabilitySourceTypeV2;
    contractDigest?: string;
}
export interface CapabilitySingleContractV2 {
    schemaRef?: string;
    dataPath?: string;
    schema: Record<string, unknown>;
}
export interface CapabilityContractsV2 {
    input: CapabilitySingleContractV2;
    output: CapabilitySingleContractV2;
}
export interface CapabilityRuntimeV2 {
    type: 'temporal' | 'llm_operation' | 'builtin_handler' | 'api' | string;
    workflowType?: string;
    operationId?: string;
    promptTemplateId?: string;
    promptTemplateVersion?: string;
    modelPolicyId?: string;
    [key: string]: unknown;
}
export interface CapabilityTestFixtureV2 {
    name?: string;
    input: Record<string, unknown>;
    expectedOutput?: Record<string, unknown>;
    isNegativeFixture?: boolean;
}
export interface CapabilityContractV2 {
    apiVersion: string;
    kind: 'Capability';
    metadata: CapabilityMetadataV2;
    contracts: CapabilityContractsV2;
    runtime: CapabilityRuntimeV2;
    compatibility?: {
        policy?: 'backward' | 'none';
    };
    tests?: {
        fixtures?: CapabilityTestFixtureV2[];
    };
}
/**
 * Sort object keys recursively for canonical JSON stringification.
 */
export declare function canonicalizeValue(obj: unknown): unknown;
/**
 * Compute SHA-256 digest of a normalized CapabilityContractV2.
 * Excludes metadata.contractDigest from calculation to avoid self-reference recursion.
 */
export declare function computeContractDigest(contract: CapabilityContractV2): string;
//# sourceMappingURL=capability-contract-v2.d.ts.map