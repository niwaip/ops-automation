export type AgentProfileOwner = 'platform' | 'tenant' | 'builtin';
export type AgentProfileApprovalMode = 'none' | 'required' | 'conditional';
export type AgentProfileRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export interface AgentProfile {
    agentId: string;
    agentKind: string;
    name: string;
    version: string;
    owner: AgentProfileOwner;
    description?: string;
    capabilities: string[];
    allowedRuntimeKinds: string[];
    visibleResourceScopes?: string[];
    approvalMode: AgentProfileApprovalMode;
    riskLevel: AgentProfileRiskLevel;
    metadata?: Record<string, unknown>;
}
//# sourceMappingURL=index.d.ts.map