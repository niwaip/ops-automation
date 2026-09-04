import type { CapabilityCandidateSelectorService } from '../candidate-selection/capability-candidate-selector.service';
import type { EffectiveTaskPolicySnapshot } from '../policy/task-policy.types';

export interface GenerateDeterministicPlanRequestDto {
  userRequest: string;
  /** User-selected task model. Frozen into every LLM Operation node. */
  modelId?: string;
  availableSkills?: Parameters<CapabilityCandidateSelectorService['selectCandidates']>[1];
  systemInputs?: Record<string, unknown>;
  taskPolicySnapshot?: EffectiveTaskPolicySnapshot;
  /**
   * Context used only while drafting a plan.  It is deliberately separate from
   * systemInputs because systemInputs are persisted as execution input.
   */
  plannerContext?: {
    scopedMemory?: unknown;
  };
  telemetry?: {
    traceId?: string;
    authToken?: string;
    user: { userId: string; userRoles?: string[] };
  };
}
