import { Injectable } from '@nestjs/common';
import type { AvailableSkillDefinition, SkillMatchResult } from '../../react-engine/interfaces';
import { SkillCacheService, SkillMatcherService } from '../skill';
import type { PlannerGeneratePlanInput, PlannerMatchPhaseResult } from '../facade';

@Injectable()
export class PlannerMatchPhaseService {
  constructor(
    private readonly skillCacheService: SkillCacheService,
    private readonly skillMatcherService: SkillMatcherService
  ) {}

  async matchSkillPhase(input: PlannerGeneratePlanInput): Promise<PlannerMatchPhaseResult> {
    const objective = input.request.user_input.trim();
    const targetSkillId =
      typeof input.request.context?.target_skill_id === 'string'
        ? input.request.context.target_skill_id.trim()
        : '';
    const availableSkills = await this.loadAvailableSkills(
      input.authToken,
      input.traceId,
      targetSkillId || undefined
    );
    const matchedSkill = await this.matchSkill(
      objective,
      input.userId || input.request.user_id,
      input.authToken,
      input.traceId,
      availableSkills,
      input.request.context
    );

    return {
      objective,
      matchedSkill,
      hasVisibleSkills: availableSkills.length > 0,
    };
  }

  async loadAvailableSkills(
    authToken?: string,
    traceId?: string,
    targetSkillId?: string
  ): Promise<AvailableSkillDefinition[]> {
    return this.skillCacheService.loadAvailableSkills(authToken, traceId, targetSkillId);
  }

  async matchSkill(
    userInput: string,
    userId: string | undefined,
    authToken: string | undefined,
    traceId: string | undefined,
    availableSkills: AvailableSkillDefinition[],
    context?: Record<string, unknown>
  ): Promise<SkillMatchResult | null> {
    return this.skillMatcherService.matchSkill({
      userInput,
      userId,
      authToken,
      traceId,
      availableSkills,
      context,
    });
  }
}
