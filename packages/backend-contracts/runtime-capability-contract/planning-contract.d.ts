export declare const ENUM_ALIASES_SCHEMA_KEY: "x-enum-aliases";
export interface DeterministicRoutingCapability {
    id: string;
    name: string;
    aliases?: string[];
    triggerKeywords?: string[];
    negativeKeywords?: string[];
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
export declare const GENERIC_ROUTING_BUZZWORDS: Set<string>;
export declare const GUIDE_INQUIRY_PATTERNS: readonly ["安装方法", "安装教程", "安装步骤", "安装指南", "怎么安装", "如何安装", "部署方法", "部署教程", "部署指南", "怎么部署", "如何部署", "使用教程", "使用方法", "使用指南", "使用说明", "怎么使用", "如何使用", "怎么用", "配置指南", "配置方法", "配置教程", "怎么配置", "如何配置", "实现原理", "工作原理", "架构原理", "架构设计", "系统架构", "是什么", "有什么用", "代码写法"];
export declare function normalizePlanningText(value: string): string;
export declare function isGuideOrInquiryRequest(userInput: string): boolean;
export declare function matchDeterministicRoutingCapability<T extends DeterministicRoutingCapability>(userInput: string, capabilities: T[]): DeterministicRoutingMatch<T> | null;
export declare function resolveDeterministicEnumParams(userInput: string, properties: Record<string, EnumAliasProperty>): DeterministicParamResolution;
export declare function isDistinctiveSignal(value: string): boolean;
//# sourceMappingURL=planning-contract.d.ts.map