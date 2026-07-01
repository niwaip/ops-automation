import type { PlannerDelegationDecision } from '../delegation';
import type { PlannerPlanDraft } from '../plan';

export interface PlannerExecutionContext {
  requestId: string;
  userId?: string;
  tenantId?: string;
  input: string;
  metadata?: Record<string, unknown>;
}

export interface PlannerFacadeResult {
  plan: PlannerPlanDraft;
  delegation?: PlannerDelegationDecision;
  needsUserInput?: boolean;
}
