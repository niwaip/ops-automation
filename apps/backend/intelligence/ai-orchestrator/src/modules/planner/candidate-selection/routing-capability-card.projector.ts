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
    options?: { maxSkillCards?: number }
  ): ProjectedCandidateSet {
    const routingCards: RoutingCapabilityCardV1[] = [];
    const aliasMap = new Map<string, CompactCapabilityCardV1>();

    const maxSkills = options?.maxSkillCards ?? 6;
    const topSkillCards = skillCards.slice(0, maxSkills);

    let skillIndex = 0;
    for (const card of topSkillCards) {
      const key = `s${skillIndex++}`;
      aliasMap.set(key, card);
      aliasMap.set(card.id, card);
      if (card.publishedSkillId) aliasMap.set(card.publishedSkillId, card);

      const cleanName = (card.displayName || card.id).replace(/-[0-9a-f]{8}$/i, '');
      const rawProps = (card as any)._rawInputSchema?.properties || {};
      const rawDefaults = (card as any)._rawInputSchema?.defaults || {};
      const rawRequired = (card as any)._rawInputSchema?.required || [];

      const accepts = Object.keys(card.inputs || {}).map((paramName) => {
        const prop = rawProps[paramName];
        const def = rawDefaults[paramName];
        const isReq = rawRequired.includes(paramName);
        const desc = prop?.description || prop?.displayName;
        const details: string[] = [];
        if (desc) details.push(desc);
        if (def !== undefined) details.push(`默认值: ${JSON.stringify(def)}`);
        else if (!isReq) details.push('可选');
        return details.length > 0 ? `${paramName} (${details.join(', ')})` : paramName;
      });

      const produces = Object.keys(card.outputs || {});

      routingCards.push({
        key,
        capabilityKind: 'skill',
        displayName: cleanName,
        description: card.summary || cleanName,
        goals: (card.goals || [cleanName]).map((g) => g.replace(/-[0-9a-f]{8}$/i, '')),
        accepts,
        produces,
        supportsArtifactOutput: Boolean(card.supportsArtifactOutput),
      });
    }

    for (const card of skillCards.slice(maxSkills)) {
      aliasMap.set(card.id, card);
      if (card.publishedSkillId) aliasMap.set(card.publishedSkillId, card);
    }

    let opIndex = 0;
    for (const card of llmOperationCards) {
      const key = `o${opIndex++}`;
      aliasMap.set(key, card);
      aliasMap.set(card.id, card);

      const rawProps = (card as any)._rawInputSchema?.properties || {};
      const accepts = Object.keys(card.inputs || {}).map((paramName) => {
        const prop = rawProps[paramName];
        const desc = prop?.description || prop?.displayName;
        return desc ? `${paramName} (${desc})` : paramName;
      });
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
