import type { CapabilityPackManifest, ManifestValidationResult } from './manifest';
export interface ContractFixture {
    name: string;
    input: unknown;
    output?: unknown;
    expectInputValid?: boolean;
    expectOutputValid?: boolean;
}
export interface FixtureFailure {
    fixture: string;
    phase: 'input' | 'output';
    errors: string[];
}
export declare function runCapabilityFixtures(manifest: CapabilityPackManifest, fixtures: ContractFixture[]): {
    manifest: ManifestValidationResult;
    failures: FixtureFailure[];
};
//# sourceMappingURL=test-kit.d.ts.map