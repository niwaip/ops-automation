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
  failure?: {
    code: 'SKILL_MATCH_MODEL_UNAVAILABLE' | 'SKILL_MATCH_SERVICE_UNAVAILABLE';
    message: string;
    retryable: true;
  };
}

export interface PlannerCompletePlanInput extends PlannerGeneratePlanInput {
  matchPhase: PlannerMatchPhaseResult;
}
