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
    const webSearchEnabled =
      input.request.context?.web_search_enabled === true ||
      input.request.context?.webSearch === true ||
      /(?:^|[^a-zA-Z0-9])(?:请?帮我)?(?:搜索|联网搜索|全网搜索|检索|搜一下|查一下|查找|查询|搜搜|查查)/i.test(objective);
    const availableSkills = await this.loadAvailableSkills(
      input.authToken,
      input.traceId,
      targetSkillId || undefined,
      webSearchEnabled
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
    targetSkillId?: string,
    webSearchEnabled = false
  ): Promise<AvailableSkillDefinition[]> {
    return this.skillCacheService.loadAvailableSkills(
      authToken,
      traceId,
      targetSkillId,
      webSearchEnabled
    );
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
