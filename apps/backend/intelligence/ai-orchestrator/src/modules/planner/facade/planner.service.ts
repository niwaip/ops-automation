import { Injectable } from '@nestjs/common';
import { PlanDraftDTO } from '../../../interfaces';
import { PlannerMatchPhaseService } from '../intent';
import { PlannerPlanDraftService } from '../planning';
import type {
  PlannerCompletePlanInput,
  PlannerGeneratePlanInput,
  PlannerMatchPhaseResult,
} from './planner.types';

@Injectable()
export class PlannerService {
  constructor(
    private readonly plannerMatchPhaseService: PlannerMatchPhaseService,
    private readonly plannerPlanDraftService: PlannerPlanDraftService
  ) {}

  async generatePlan(input: PlannerGeneratePlanInput): Promise<PlanDraftDTO> {
    const matchPhase = await this.matchSkillPhase(input);
    return this.completePlanFromMatchPhase({
      ...input,
      matchPhase,
    });
  }

  async matchSkillPhase(input: PlannerGeneratePlanInput): Promise<PlannerMatchPhaseResult> {
    return this.plannerMatchPhaseService.matchSkillPhase(input);
  }

  async completePlanFromMatchPhase(input: PlannerCompletePlanInput): Promise<PlanDraftDTO> {
    return this.plannerPlanDraftService.completePlanFromMatchPhase(input);
  }

  // Temporary compatibility for legacy unit tests that still probe old private hooks.
  private async loadAvailableSkills(
    authToken?: string,
    traceId?: string,
    targetSkillId?: string
  ) {
    return this.plannerMatchPhaseService.loadAvailableSkills(authToken, traceId, targetSkillId);
  }

  // Temporary compatibility for legacy unit tests that still probe old private hooks.
  private async matchSkill(
    userInput: string,
    userId: string | undefined,
    authToken: string | undefined,
    traceId: string | undefined,
    availableSkills: Parameters<PlannerMatchPhaseService['matchSkill']>[4],
    context?: Record<string, unknown>
  ) {
    return this.plannerMatchPhaseService.matchSkill(
      userInput,
      userId,
      authToken,
      traceId,
      availableSkills,
      context
    );
  }
}
