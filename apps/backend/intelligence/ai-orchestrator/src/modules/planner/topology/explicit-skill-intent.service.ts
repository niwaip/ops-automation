import { Injectable } from '@nestjs/common';
import type { CompactCapabilityCardV1 } from '@ops/backend-deterministic-plan';
import { hasExplicitCapabilityInvocation } from '../candidate-selection/capability-intent-match.util';

@Injectable()
export class ExplicitSkillIntentService {
  public findExplicitlyRequestedSkills(
    userRequest: string,
    skillCards: CompactCapabilityCardV1[],
  ): CompactCapabilityCardV1[] {
    const cleanRequest = userRequest.replace(/\[系统上下文：[^\]]*\]/g, '').trim();
    return skillCards.filter((card) =>
      hasExplicitCapabilityInvocation(cleanRequest, [
        card.displayName,
        card.id,
        card.publishedSkillId,
      ]),
    );
  }
}
