import type { GovernanceAuditRiskLevel } from '../audit';

export type GovernancePolicyStatus = 'draft' | 'active' | 'disabled';

export interface GovernancePolicyRule {
  ruleId: string;
  name: string;
  description?: string;
  status: GovernancePolicyStatus;
  appliesTo: string[];
  enforcementMode: 'advisory' | 'blocking';
  maxAllowedRiskLevel?: GovernanceAuditRiskLevel;
  metadata?: Record<string, unknown>;
}

export function normalizeGovernancePolicyRule(
  rule: GovernancePolicyRule,
): GovernancePolicyRule {
  return {
    ...rule,
    appliesTo: [...new Set(rule.appliesTo)].sort(),
  };
}
