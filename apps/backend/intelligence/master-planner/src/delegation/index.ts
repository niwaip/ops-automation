export type PlannerDelegationTarget =
  | 'codegen-agent'
  | 'browser-nl-agent'
  | 'none';

export interface PlannerDelegationDecision {
  target: PlannerDelegationTarget;
  reason: string;
  requiredInputs?: string[];
  capabilityHints?: string[];
}

export function normalizePlannerDelegationDecision(
  decision: PlannerDelegationDecision,
): PlannerDelegationDecision {
  return {
    ...decision,
    requiredInputs: decision.requiredInputs
      ? [...new Set(decision.requiredInputs)].sort()
      : undefined,
    capabilityHints: decision.capabilityHints
      ? [...new Set(decision.capabilityHints)].sort()
      : undefined,
  };
}
