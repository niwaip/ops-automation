import { Injectable } from '@nestjs/common';
import type { CompactCapabilityCardV1 } from '@ops/backend-deterministic-plan';

export interface RoutingCapabilityCardV1 {
  key: string; // 本次请求内短别名，如 s0, s1, o0, o1
  capabilityKind: 'skill' | 'llm_operation';
  displayName: string;
  description: string;
  goals: string[];
  accepts: string[];
  produces: string[];
  supportsArtifactOutput: boolean;
}

export interface ProjectedCandidateSet {
  routingCards: RoutingCapabilityCardV1[];
  aliasMap: Map<string, CompactCapabilityCardV1>;
}

@Injectable()
export class RoutingCapabilityCardProjector {
  public projectCandidateCards(
    skillCards: CompactCapabilityCardV1[],
    llmOperationCards: CompactCapabilityCardV1[],
  ): ProjectedCandidateSet {
    const routingCards: RoutingCapabilityCardV1[] = [];
    const aliasMap = new Map<string, CompactCapabilityCardV1>();

    let skillIndex = 0;
    for (const card of skillCards) {
      const key = `s${skillIndex++}`;
      aliasMap.set(key, card);
      aliasMap.set(card.id, card);
      if (card.publishedSkillId) aliasMap.set(card.publishedSkillId, card);

      const accepts = Object.keys(card.inputs || {});
      const produces = Object.keys(card.outputs || {});

      routingCards.push({
        key,
        capabilityKind: 'skill',
        displayName: card.displayName || card.id,
        description: card.summary || card.displayName || card.id,
        goals: card.goals || [card.displayName || card.id],
        accepts,
        produces,
        supportsArtifactOutput: Boolean(card.supportsArtifactOutput),
      });
    }

    let opIndex = 0;
    for (const card of llmOperationCards) {
      const key = `o${opIndex++}`;
      aliasMap.set(key, card);
      aliasMap.set(card.id, card);

      const accepts = Object.keys(card.inputs || {});
      const produces = Object.keys(card.outputs || {});

      routingCards.push({
        key,
        capabilityKind: 'llm_operation',
        displayName: card.displayName || card.id,
        description: card.summary || card.displayName || card.id,
        goals: card.goals || [card.displayName || card.id],
        accepts,
        produces,
        supportsArtifactOutput: Boolean(card.supportsArtifactOutput),
      });
    }

    return { routingCards, aliasMap };
  }
}
