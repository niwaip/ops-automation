import { Injectable } from '@nestjs/common';
import type { CompactCapabilityCardV1 } from '@ops/backend-deterministic-plan';
import { hasExplicitCapabilityInvocation } from '../candidate-selection/capability-intent-match.util';

@Injectable()
export class ExplicitSkillIntentService {
  public findExplicitlyRequestedSkills(
    userRequest: string,
    skillCards: CompactCapabilityCardV1[],
  ): CompactCapabilityCardV1[] {
    return skillCards.filter((card) =>
      hasExplicitCapabilityInvocation(userRequest, [
        card.displayName,
        card.id,
        card.publishedSkillId,
        card.goals,
      ]),
    );
  }
}
