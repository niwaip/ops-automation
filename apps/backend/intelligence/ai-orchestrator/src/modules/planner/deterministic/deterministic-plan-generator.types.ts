import type { CapabilityCandidateSelectorService } from '../candidate-selection/capability-candidate-selector.service';

export interface GenerateDeterministicPlanRequestDto {
  userRequest: string;
  availableSkills?: Parameters<CapabilityCandidateSelectorService['selectCandidates']>[1];
  systemInputs?: Record<string, unknown>;
}
