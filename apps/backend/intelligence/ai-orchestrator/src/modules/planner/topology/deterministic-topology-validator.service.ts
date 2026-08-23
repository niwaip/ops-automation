import { Injectable, Logger } from '@nestjs/common';
import type { DeterministicTopologyDraftV1 } from './deterministic-topology.types';
import type { CompactCapabilityCardV1 } from '@ops/backend-deterministic-plan';
import { getSkillMatchMinConfidence, isAcceptedSkillMatch } from '../skill/skill-match-policy';

export interface TopologyValidationResult {
  valid: boolean;
  errors: string[];
}

@Injectable()
export class DeterministicTopologyValidatorService {
  private readonly logger = new Logger(DeterministicTopologyValidatorService.name);

  public validateTopology(
    topology: unknown,
    aliasMap: Map<string, CompactCapabilityCardV1>,
    explicitlyRequestedSkills: CompactCapabilityCardV1[] = [],
    options?: { allowOperationOnly?: boolean },
  ): TopologyValidationResult {
    const errors: string[] = [];

    if (!topology || typeof topology !== 'object' || Array.isArray(topology)) {
      return { valid: false, errors: ['Topology is not a valid JSON object'] };
    }

    const draft = topology as Partial<DeterministicTopologyDraftV1>;

    if (draft.schemaVersion !== 'deterministic-topology/v1') {
      errors.push(`Invalid schemaVersion: expected 'deterministic-topology/v1', got '${draft.schemaVersion}'`);
    }

    if (draft.matchDecision !== 'matched' && draft.matchDecision !== 'no_match') {
      errors.push(`Invalid matchDecision '${draft.matchDecision}'`);
    }

    if (
      typeof draft.matchConfidence !== 'number' ||
      !Number.isFinite(draft.matchConfidence) ||
      draft.matchConfidence < 0 ||
      draft.matchConfidence > 1
    ) {
      errors.push(`Invalid matchConfidence '${draft.matchConfidence}'`);
    }

    if (typeof draft.matchReason !== 'string' || !draft.matchReason.trim()) {
      errors.push('Missing matchReason');
    }

    if (draft.matchDecision === 'no_match') {
      if (!Array.isArray(draft.nodes) || draft.nodes.length !== 0) {
        errors.push('no_match topology must have an empty nodes array');
      }
      if (draft.finalNodeRef !== null) {
        errors.push('no_match topology must have finalNodeRef=null');
      }
      return { valid: errors.length === 0, errors };
    }

    if (!isAcceptedSkillMatch(draft.matchConfidence)) {
      errors.push(
        `matchConfidence ${draft.matchConfidence} is below minimum ${getSkillMatchMinConfidence()}`
      );
    }

    if (!Array.isArray(draft.nodes) || draft.nodes.length === 0) {
      errors.push('Topology nodes must be a non-empty array');
      return { valid: false, errors };
    }

    if (draft.nodes.length > 6) {
      errors.push(`Topology nodes count exceeds maximum 6 (got ${draft.nodes.length})`);
    }

    const seenRefs = new Set<string>();
    for (let i = 0; i < draft.nodes.length; i++) {
      const node = draft.nodes[i];
      if (!node || typeof node.ref !== 'string' || !node.ref.trim()) {
        errors.push(`Node at index ${i} is missing a valid ref`);
        continue;
      }

      if (seenRefs.has(node.ref)) {
        errors.push(`Duplicate node ref '${node.ref}'`);
      }
      seenRefs.add(node.ref);

      if (!aliasMap.has(node.capabilityKey)) {
        errors.push(`Node '${node.ref}' specifies unknown capabilityKey '${node.capabilityKey}'`);
      }

      if (Array.isArray(node.dependsOn)) {
        for (const depRef of node.dependsOn) {
          if (!seenRefs.has(depRef) || depRef === node.ref) {
            errors.push(`Node '${node.ref}' dependsOn invalid or forward/self reference '${depRef}'`);
          }
        }
      }
    }

    const hasSkillNode = draft.nodes.some(
      (node) => aliasMap.get(node.capabilityKey)?.kind === 'skill'
    );
    const llmOperationNodeCount = draft.nodes.filter(
      (node) => aliasMap.get(node.capabilityKey)?.kind === 'llm_operation'
    ).length;
    if (llmOperationNodeCount > 3) {
      errors.push(
        `LLM operation node count exceeds maximum 3 (got ${llmOperationNodeCount})`
      );
    }
    if (!hasSkillNode && options?.allowOperationOnly !== true) {
      errors.push('Operation-only topology is not allowed in this planning context');
    }

    const selectedSkillIds = new Set(
      draft.nodes.flatMap((node) => {
        const card = aliasMap.get(node.capabilityKey);
        return card?.kind === 'skill'
          ? [card.id, card.publishedSkillId].filter((id): id is string => Boolean(id))
          : [];
      }),
    );
    for (const requiredSkill of explicitlyRequestedSkills) {
      const covered = [requiredSkill.id, requiredSkill.publishedSkillId]
        .filter((id): id is string => Boolean(id))
        .some((id) => selectedSkillIds.has(id));
      if (!covered) {
        errors.push(
          `Topology does not cover explicitly requested Skill '${requiredSkill.displayName || requiredSkill.id}'`,
        );
      }
    }

    if (draft.finalOutputKind !== 'value' && draft.finalOutputKind !== 'artifact') {
      errors.push(`Invalid finalOutputKind '${draft.finalOutputKind}'`);
    }

    if (!draft.finalNodeRef || typeof draft.finalNodeRef !== 'string') {
      errors.push('Missing finalNodeRef in topology');
    } else if (!seenRefs.has(draft.finalNodeRef)) {
      errors.push(`finalNodeRef '${draft.finalNodeRef}' does not exist in nodes`);
    } else if (draft.finalOutputKind === 'artifact') {
      const finalNode = draft.nodes.find((n) => n.ref === draft.finalNodeRef);
      const finalCard = aliasMap.get(finalNode?.capabilityKey || '');
      if (finalCard && !finalCard.supportsArtifactOutput) {
        errors.push(`User requested artifact output, but final node '${draft.finalNodeRef}' (${finalCard.displayName}) does not support artifact output`);
      }
    }

    const valid = errors.length === 0;
    if (!valid) {
      this.logger.warn(`Topology validation failed: ${errors.join('; ')}`);
    }

    return { valid, errors };
  }
}
