import type { GeneratePlanDTO } from '../../../interfaces';
import type { SkillMatchResult } from '../../react-engine/interfaces';

export interface PlannerGeneratePlanInput {
  request: GeneratePlanDTO;
  userId?: string;
  authToken?: string;
  traceId?: string;
}

export interface PlannerMatchPhaseResult {
  objective: string;
  matchedSkill: SkillMatchResult | null;
  hasVisibleSkills: boolean;
}

export interface PlannerCompletePlanInput extends PlannerGeneratePlanInput {
  matchPhase: PlannerMatchPhaseResult;
}
