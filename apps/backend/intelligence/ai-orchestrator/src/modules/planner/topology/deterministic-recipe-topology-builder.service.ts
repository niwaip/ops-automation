import { Injectable, Logger } from '@nestjs/common';
import type { CompactCapabilityCardV1 } from '@ops/backend-deterministic-plan';
import type { MatchedRecipe } from './deterministic-recipe-matcher.service';
import type { DeterministicTopologyDraftV1, TopologyNodeV1 } from './deterministic-topology.types';

@Injectable()
export class DeterministicRecipeTopologyBuilderService {
  private readonly logger = new Logger(DeterministicRecipeTopologyBuilderService.name);

  public buildTopologyFromRecipe(
    recipe: MatchedRecipe,
    skillCards: CompactCapabilityCardV1[],
    llmOperationCards: CompactCapabilityCardV1[],
  ): DeterministicTopologyDraftV1 | null {
    const nodes: TopologyNodeV1[] = [];

    // Find candidates by role
    const searchSkill = skillCards.find(
      (c) =>
        c.kind === 'skill' &&
        ((c.displayName || '').toLowerCase().includes('search') ||
          (c.displayName || '').includes('搜索') ||
          (c.id || '').toLowerCase().includes('search')),
    ) || skillCards[0];

    const markdownWriterSkill = skillCards.find(
      (c) =>
        c.kind === 'skill' &&
        (c.supportsArtifactOutput ||
          (c.displayName || '').toLowerCase().includes('markdown') ||
          (c.displayName || '').includes('写') ||
          (c.id || '').toLowerCase().includes('markdown')),
    );
    const documentExtractorSkill = skillCards.find(
      (c) =>
        c.kind === 'skill' &&
        ((c.id || '').toLowerCase().includes('content-extractor') ||
          (c.id || '').toLowerCase().includes('pdf') ||
          (c.displayName || '').includes('内容提取')),
    );

    for (const step of recipe.steps) {
      let capabilityKey: string | undefined;

      if (step.kind === 'skill') {
        if (step.role === 'search') {
          capabilityKey = searchSkill?.id || searchSkill?.publishedSkillId;
        } else if (step.role === 'markdown_writer') {
          capabilityKey = markdownWriterSkill?.id || markdownWriterSkill?.publishedSkillId;
        } else if (step.role === 'document_extract') {
          capabilityKey = documentExtractorSkill?.id || documentExtractorSkill?.publishedSkillId;
        }
      } else if (step.kind === 'llm_operation') {
        const opCard = llmOperationCards.find((c) => c.id === step.operationId);
        capabilityKey = opCard?.id || step.operationId;
      }

      if (!capabilityKey) {
        this.logger.warn(`Recipe '${recipe.recipeName}' failed to resolve capability for role '${step.role}'`);
        return null;
      }

      nodes.push({
        ref: step.ref,
        capabilityKey,
        dependsOn: step.dependsOn,
      });
    }

    return {
      schemaVersion: 'deterministic-topology/v1',
      objective: recipe.objective,
      matchDecision: 'matched',
      matchConfidence: 1,
      matchReason: `Matched deterministic recipe: ${recipe.recipeName}`,
      recipeName: recipe.recipeName,
      nodes,
      finalNodeRef: recipe.finalNodeRef,
      finalOutputKind: nodes.some(
        (node) => skillCards.find((card) => card.id === node.capabilityKey)?.supportsArtifactOutput,
      )
        ? 'artifact'
        : 'value',
    };
  }
}
