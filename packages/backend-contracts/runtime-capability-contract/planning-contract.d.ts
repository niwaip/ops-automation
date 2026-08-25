export declare const ENUM_ALIASES_SCHEMA_KEY: "x-enum-aliases";
export interface DeterministicRoutingCapability {
    id: string;
    name: string;
    aliases?: string[];
    triggerKeywords?: string[];
}
export interface DeterministicRoutingMatch<T extends DeterministicRoutingCapability> {
    capability: T;
    matchedSignals: string[];
    confidence: number;
    reason: 'deterministic_routing_signal';
}
export interface EnumAliasProperty {
    enum?: Array<string | number>;
    [ENUM_ALIASES_SCHEMA_KEY]?: Record<string, Array<string | number>>;
}
export interface DeterministicParamResolution {
    params: Record<string, string | number>;
    fieldConfidences: Record<string, number>;
    matchedAliases: Record<string, string>;
}
export declare function normalizePlanningText(value: string): string;
export declare function matchDeterministicRoutingCapability<T extends DeterministicRoutingCapability>(userInput: string, capabilities: T[]): DeterministicRoutingMatch<T> | null;
export declare function resolveDeterministicEnumParams(userInput: string, properties: Record<string, EnumAliasProperty>): DeterministicParamResolution;
//# sourceMappingURL=planning-contract.d.ts.map