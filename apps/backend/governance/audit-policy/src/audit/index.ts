export type GovernanceAuditRiskLevel =
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

export interface GovernanceAuditRecord {
  auditId: string;
  action: string;
  actorId?: string;
  actorType?: 'user' | 'system' | 'agent';
  resourceType: string;
  resourceId?: string;
  riskLevel: GovernanceAuditRiskLevel;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export function normalizeGovernanceAuditRecord(
  record: GovernanceAuditRecord,
): GovernanceAuditRecord {
  return {
    ...record,
    action: record.action.trim(),
    resourceType: record.resourceType.trim(),
  };
}
