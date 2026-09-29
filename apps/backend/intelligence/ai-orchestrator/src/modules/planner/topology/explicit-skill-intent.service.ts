import { Injectable } from '@nestjs/common';
import type { CompactCapabilityCardV1 } from '@ops/backend-deterministic-plan';
import { hasExplicitCapabilityInvocation } from '../candidate-selection/capability-intent-match.util';
import { stripSystemContext } from '../routing/routing-policy.matcher';

@Injectable()
export class ExplicitSkillIntentService {
  public findExplicitlyRequestedSkills(
    userRequest: string,
    skillCards: CompactCapabilityCardV1[],
  ): CompactCapabilityCardV1[] {
    const cleanRequest = stripSystemContext(userRequest) || userRequest.trim();
    return skillCards.filter((card) =>
      hasExplicitCapabilityInvocation(cleanRequest, [
        card.displayName,
        card.id,
        card.publishedSkillId,
      ]),
    );
  }
}
