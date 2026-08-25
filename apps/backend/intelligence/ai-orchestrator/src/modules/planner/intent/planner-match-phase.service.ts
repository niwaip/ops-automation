import { Injectable } from '@nestjs/common';
import type { AvailableSkillDefinition, SkillMatchResult } from '../../react-engine/interfaces';
import { SkillCacheService, SkillMatcherService } from '../skill';
import type { PlannerGeneratePlanInput, PlannerMatchPhaseResult } from '../facade';

type SkillMatchFailure = NonNullable<PlannerMatchPhaseResult['failure']>;

class SkillMatchUnavailableError extends Error {
  constructor(readonly failure: SkillMatchFailure) {
    super(failure.message);
    this.name = 'SkillMatchUnavailableError';
  }
}

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
    let matchedSkill: SkillMatchResult | null = null;
    let failure: SkillMatchFailure | undefined;
    try {
      matchedSkill = await this.matchSkill(
        objective,
        input.userId || input.request.user_id,
        input.authToken,
        input.traceId,
        availableSkills,
        input.request.context,
        input.request.modelId
      );
    } catch (error) {
      if (!(error instanceof SkillMatchUnavailableError)) {
        throw error;
      }
      failure = error.failure;
    }

    return {
      objective,
      matchedSkill,
      hasVisibleSkills: availableSkills.length > 0,
      ...(failure ? { failure } : {}),
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
    context?: Record<string, unknown>,
    modelId?: string
  ): Promise<SkillMatchResult | null> {
    const attempt = await this.skillMatcherService.matchSkillAttempt({
      userInput,
      userId,
      authToken,
      traceId,
      availableSkills,
      context,
      modelId,
    });
    if (attempt.status === 'unavailable') {
      throw new SkillMatchUnavailableError({
        code: attempt.code,
        message: attempt.message,
        retryable: attempt.retryable,
      });
    }
    return attempt.match;
  }
}
