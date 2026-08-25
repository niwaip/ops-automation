import type { CapabilityContractV2 } from '@ops/backend-runtime-capability-contract';
export declare const CAPABILITY_LIFECYCLE: readonly ["draft", "experimental", "certified", "production", "deprecated"];
export type CapabilityLifecycle = (typeof CAPABILITY_LIFECYCLE)[number];
export interface CapabilityRoutingCard {
    displayName: string;
    summary: string;
    /** Stable, locale-aware phrases that are safe for deterministic routing. */
    aliases: string[];
    goals: string[];
    positiveExamples: string[];
    negativeExamples: string[];
}
export interface CapabilityPackManifest {
    apiVersion: 'ops-automation/capability-pack/v1';
    kind: 'CapabilityPack';
    metadata: {
        id: string;
        version: string;
        owner: string;
        lifecycle: CapabilityLifecycle;
        contractDigest: string;
    };
    contract: CapabilityContractV2;
    routing: CapabilityRoutingCard;
    runtime: {
        routeKey: string;
        adapterVersion: string;
        protocolVersion: string;
        probe?: string;
    };
    governance: {
        riskLevel: 'L0' | 'L1' | 'L2' | 'L3';
        sideEffectClass: 'none' | 'read' | 'internal_write' | 'external_write' | 'destructive';
        idempotency: 'none' | 'keyed' | 'naturally_idempotent';
        permissions: string[];
        runbook?: string;
    };
    production?: {
        slo: string;
        resourceBudget: string;
        canaryEvidence: string;
        rollbackVersion: string;
    };
}
export interface ManifestValidationResult {
    valid: boolean;
    errors: string[];
}
export declare function validateCapabilityPackManifest(manifest: CapabilityPackManifest): ManifestValidationResult;
export declare function assertCapabilityPackManifest(manifest: CapabilityPackManifest): asserts manifest is CapabilityPackManifest;
export declare function digestCapabilityContract(contract: CapabilityContractV2): string;
//# sourceMappingURL=manifest.d.ts.map