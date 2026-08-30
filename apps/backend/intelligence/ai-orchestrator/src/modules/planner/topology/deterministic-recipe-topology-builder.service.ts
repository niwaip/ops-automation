import { Injectable, Logger, Optional } from '@nestjs/common';
import type { CompactCapabilityCardV1 } from '@ops/backend-deterministic-plan';
import type { MatchedRecipe } from './deterministic-recipe-matcher.service';
import type { DeterministicTopologyDraftV1, TopologyNodeV1 } from './deterministic-topology.types';
import {
  createBuiltinRoutingPolicySnapshot,
  matchesCapabilityRole,
} from '../routing/routing-policy.matcher';
import { RoutingPolicyService } from '../routing/routing-policy.service';

@Injectable()
export class DeterministicRecipeTopologyBuilderService {
  private readonly logger = new Logger(DeterministicRecipeTopologyBuilderService.name);

  constructor(@Optional() private readonly routingPolicy?: RoutingPolicyService) {}

  public buildTopologyFromRecipe(
    recipe: MatchedRecipe,
    skillCards: CompactCapabilityCardV1[],
    llmOperationCards: CompactCapabilityCardV1[]
  ): DeterministicTopologyDraftV1 | null {
    const nodes: TopologyNodeV1[] = [];
    const policy = this.routingPolicy?.getSnapshot() || createBuiltinRoutingPolicySnapshot();

    const searchSkill = this.selectSkillForRole(skillCards, 'search', policy);
    const markdownWriterSkill = this.selectSkillForRole(skillCards, 'markdown_writer', policy);
    const documentExtractorSkill = this.selectSkillForRole(skillCards, 'document_extract', policy);
    const webExtractorSkill = this.selectSkillForRole(skillCards, 'web_extract', policy);

    for (const step of recipe.steps) {
      let capabilityKey: string | undefined;

      if (step.kind === 'skill') {
        if (step.role === 'search') {
          capabilityKey = searchSkill?.id || searchSkill?.publishedSkillId;
        } else if (step.role === 'markdown_writer') {
          capabilityKey = markdownWriterSkill?.id || markdownWriterSkill?.publishedSkillId;
        } else if (step.role === 'document_extract') {
          capabilityKey = documentExtractorSkill?.id || documentExtractorSkill?.publishedSkillId;
        } else if (step.role === 'web_extract') {
          capabilityKey = webExtractorSkill?.id || webExtractorSkill?.publishedSkillId;
        }
      } else if (step.kind === 'llm_operation') {
        capabilityKey = this.selectOperationForStep(step, llmOperationCards)?.id;
      }

      if (!capabilityKey) {
        this.logger.warn(
          `Recipe '${recipe.recipeName}' failed to resolve capability for role '${step.role}'`
        );
        return null;
      }

      nodes.push({
        ref: step.ref,
        capabilityKey,
        dependsOn: step.dependsOn,
      });
    }

    const finalTopologyNode = nodes.find((node) => node.ref === recipe.finalNodeRef);
    const finalSkillCard = skillCards.find((card) => card.id === finalTopologyNode?.capabilityKey);

    return {
      schemaVersion: 'deterministic-topology/v1',
      objective: recipe.objective,
      matchDecision: 'matched',
      matchConfidence: 1,
      matchReason: `Matched deterministic recipe: ${recipe.recipeName}`,
      recipeName: recipe.recipeName,
      nodes,
      finalNodeRef: recipe.finalNodeRef,
      finalOutputKind: finalSkillCard?.supportsArtifactOutput === true ? 'artifact' : 'value',
      requiresExternalData: recipe.requiresExternalData,
    };
  }

  private selectSkillForRole(
    skillCards: CompactCapabilityCardV1[],
    role: 'search' | 'markdown_writer' | 'document_extract' | 'web_extract',
    policy: ReturnType<typeof createBuiltinRoutingPolicySnapshot>
  ): CompactCapabilityCardV1 | undefined {
    const policyRole =
      role === 'markdown_writer'
        ? 'markdownWriter'
        : role === 'document_extract'
          ? 'documentExtractor'
          : role === 'web_extract'
            ? 'webExtractor'
          : 'search';
    const candidates = skillCards.filter((card) => {
      if (card.kind !== 'skill') return false;
      if (role === 'markdown_writer' && card.supportsArtifactOutput) return true;
      return matchesCapabilityRole(
        [card.displayName, card.id, card.summary, card.goals],
        policyRole,
        policy
      );
    });

    return candidates
      .map((card, index) => ({ card, index, score: this.scoreSkillContract(card, role) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.card;
  }

  private scoreSkillContract(
    card: CompactCapabilityCardV1,
    role: 'search' | 'markdown_writer' | 'document_extract' | 'web_extract'
  ): number {
    const inputs = Object.entries(card.inputs || {});
    const outputs = Object.entries(card.outputs || {});
    if (role === 'markdown_writer') {
      return (
        (card.supportsArtifactOutput ? 100 : 0) +
        (inputs.some(([name]) => /content|text|markdown|body/i.test(name)) ? 20 : 0)
      );
    }
    if (role === 'document_extract') {
      return outputs.some(
        ([name, type]) =>
          /content|text|body|markdown/i.test(name) || /string|markdown_content/i.test(type)
      )
        ? 100
        : 0;
    }
    if (role === 'web_extract') {
      const hasUrlInput = inputs.some(([name]) => /url|website|page|start/i.test(name));
      const hasTextOutput = outputs.some(
        ([name, type]) =>
          /content|text|body|markdown/i.test(name) || /string|markdown_content/i.test(type)
      );
      return (hasUrlInput ? 50 : 0) + (hasTextOutput ? 50 : 0);
    }
    if (role === 'search') {
      const hasDirectQuery = inputs.some(([name]) => /^query$/i.test(name));
      const hasKeyword = inputs.some(([name]) => /keyword|search/i.test(name));
      const isGeneralSearch = /websearch|search|检索|tavily|google|bing/i.test(
        [card.displayName, card.id, card.summary, ...(card.goals || [])].join(' ')
      );
      const isHotboard = /热榜|热搜|hotboard|榜单/i.test(
        [card.displayName, card.id, card.summary, ...(card.goals || [])].join(' ')
      );
      const hasResultsOutput = outputs.some(
        ([name, type]) =>
          /result|item|list/i.test(name) || /news_item_list|text_list|json/i.test(type)
      );

      let score = 0;
      if (hasDirectQuery) score += 50;
      else if (hasKeyword) score += 30;

      if (hasResultsOutput) score += 50;
      if (isGeneralSearch) score += 40;
      if (isHotboard) score -= 30;

      return Math.max(0, score);
    }
    return 0;
  }

  private selectOperationForStep(
    step: MatchedRecipe['steps'][number],
    cards: CompactCapabilityCardV1[]
  ): CompactCapabilityCardV1 | undefined {
    const candidates = cards
      .filter((card) => card.kind === 'llm_operation')
      .map((card, index) => ({ card, index, score: this.scoreOperation(card, step) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index);
    return candidates[0]?.card;
  }

  private scoreOperation(
    card: CompactCapabilityCardV1,
    step: MatchedRecipe['steps'][number]
  ): number {
    const text = [card.id, card.displayName, card.summary, ...(card.goals || [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const inputs = Object.entries(card.inputs || {});
    const outputs = Object.entries(card.outputs || {});
    const producesText = outputs.some(
      ([name, type]) =>
        /content|text|summary|markdown|body/i.test(name) || /string|markdown_content/i.test(type)
    );
    if (!producesText) return 0;

    if (step.role === 'transform') {
      const acceptsInstruction = inputs.some(([name]) => /instruction|request|prompt/i.test(name));
      const acceptsText = inputs.some(
        ([name, type]) =>
          /content|text|body|input/i.test(name) || /string|markdown_content/i.test(type)
      );
      const hasTransformIntent = /transform|rewrite|translate|改写|翻译|文本变换/.test(text);
      return acceptsInstruction && acceptsText && hasTransformIntent ? 100 : 0;
    }

    if (step.role !== 'summarize') return 0;
    const hasSummarizeIntent = /summar|summary|摘要|总结|归纳|汇总/.test(text);
    if (!hasSummarizeIntent) return 0;
    const acceptsList = inputs.some(
      ([name, type]) =>
        /items|list|results/i.test(name) || /news_item_list|text_list|array|list/i.test(type)
    );
    const acceptsText = inputs.some(
      ([name, type]) =>
        /content|text|body|input/i.test(name) || /string|markdown_content/i.test(type)
    );
    if (step.inputShape === 'list') return acceptsList ? 120 : 0;
    return acceptsText ? 100 : 0;
  }
}
