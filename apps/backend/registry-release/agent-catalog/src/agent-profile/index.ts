import type {
  AgentProfile,
  AgentProfileApprovalMode,
  AgentProfileRiskLevel,
} from '@ops/backend-agent-profile';

export type AgentCatalogStatus =
  | 'draft'
  | 'active'
  | 'suspended'
  | 'retired';

export interface AgentScopePolicy {
  allowedTenants?: string[];
  deniedTenants?: string[];
  visibleResourceScopes?: string[];
  approvalMode?: AgentProfileApprovalMode;
  maxRiskLevel?: AgentProfileRiskLevel;
}

export interface AgentCapabilityMatrixEntry {
  capabilityKey: string;
  enabled: boolean;
  allowedRuntimeKinds?: string[];
}

export interface RegisteredAgentProfile {
  profile: AgentProfile;
  status: AgentCatalogStatus;
  scopePolicy?: AgentScopePolicy;
  capabilityMatrix?: AgentCapabilityMatrixEntry[];
  metadata?: Record<string, unknown>;
}

export function normalizeRegisteredAgentProfile(
  entry: RegisteredAgentProfile,
): RegisteredAgentProfile {
  const capabilityMatrix = (entry.capabilityMatrix ?? []).map((item) => ({
    ...item,
    allowedRuntimeKinds: item.allowedRuntimeKinds
      ? [...new Set(item.allowedRuntimeKinds)].sort()
      : undefined,
  }));

  return {
    ...entry,
    scopePolicy: entry.scopePolicy
      ? {
          ...entry.scopePolicy,
          allowedTenants: entry.scopePolicy.allowedTenants
            ? [...new Set(entry.scopePolicy.allowedTenants)].sort()
            : undefined,
          deniedTenants: entry.scopePolicy.deniedTenants
            ? [...new Set(entry.scopePolicy.deniedTenants)].sort()
            : undefined,
          visibleResourceScopes: entry.scopePolicy.visibleResourceScopes
            ? [...new Set(entry.scopePolicy.visibleResourceScopes)].sort()
            : undefined,
        }
      : undefined,
    capabilityMatrix,
  };
}

export function getEnabledAgentCapabilities(
  entry: RegisteredAgentProfile,
): string[] {
  return (entry.capabilityMatrix ?? [])
    .filter((item) => item.enabled)
    .map((item) => item.capabilityKey)
    .sort();
}
