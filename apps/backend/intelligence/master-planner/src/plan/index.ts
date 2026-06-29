export type PlannerStepKind =
  | 'reason'
  | 'ask-user'
  | 'delegate'
  | 'execute'
  | 'complete';

export interface PlannerPlanStep {
  stepId: string;
  kind: PlannerStepKind;
  title: string;
  dependsOn?: string[];
  metadata?: Record<string, unknown>;
}

export interface PlannerPlanDraft {
  planId: string;
  intent: string;
  confidence?: number;
  steps: PlannerPlanStep[];
}

export function normalizePlannerPlanDraft(
  draft: PlannerPlanDraft,
): PlannerPlanDraft {
  return {
    ...draft,
    steps: draft.steps.map((step) => ({
      ...step,
      dependsOn: step.dependsOn ? [...new Set(step.dependsOn)].sort() : undefined,
    })),
  };
}
