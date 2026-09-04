import { Injectable, Logger, Optional } from '@nestjs/common';
import type { CompactCapabilityCardV1 } from '@ops/backend-deterministic-plan';
import type { MatchedRecipe } from './deterministic-recipe-matcher.service';
import type { DeterministicTopologyDraftV1, TopologyNodeV1 } from './deterministic-topology.types';
import {
  createBuiltinRoutingPolicySnapshot,
  matchesCapabilityRole,
} from '../routing/routing-policy.matcher';
import { RoutingPolicyService } from '../routing/routing-policy.service';
import type { EffectiveTaskCapabilityBinding } from '../policy/task-policy.types';
import { calculateCapabilityIntentScore } from '../candidate-selection/capability-intent-match.util';

@Injectable()
export class DeterministicRecipeTopologyBuilderService {
  private readonly logger = new Logger(DeterministicRecipeTopologyBuilderService.name);

  constructor(@Optional() private readonly routingPolicy?: RoutingPolicyService) {}

  public buildTopologyFromRecipe(
    recipe: MatchedRecipe,
    skillCards: CompactCapabilityCardV1[],
    llmOperationCards: CompactCapabilityCardV1[],
    capabilityBindings: EffectiveTaskCapabilityBinding[] = []
  ): DeterministicTopologyDraftV1 | null {
    const nodes: TopologyNodeV1[] = [];
    const policy = this.routingPolicy?.getSnapshot() || createBuiltinRoutingPolicySnapshot();

    // Detect if any search step has a downstream summarize step that needs list input.
    // This prevents selecting skills with no list output (e.g. workspace.explorer) for search→summarize_list recipes.
    const searchDownstreamNeedsList = recipe.steps.some(
      (step) =>
        step.role === 'summarize' &&
        step.inputShape === 'list' &&
        step.dependsOn.some((dep) =>
          recipe.steps.find((s) => s.ref === dep && s.role === 'search')
        )
    );

    const searchSkill = this.selectSkillForRole(
      skillCards, 'search', policy, recipe.objective, searchDownstreamNeedsList
    );
    const markdownWriterSkill = this.selectSkillForRole(skillCards, 'markdown_writer', policy, recipe.objective);
    const documentExtractorSkill = this.selectSkillForRole(skillCards, 'document_extract', policy, recipe.objective);
    const webExtractorSkill = this.selectSkillForRole(skillCards, 'web_extract', policy, recipe.objective);
    const notifySkill = this.selectSkillForRole(skillCards, 'notify', policy, recipe.objective);

    for (const step of recipe.steps) {
      let capabilityKey: string | undefined;
      const bindingRole = step.role === 'summarize' && step.inputShape === 'list'
        ? 'summarize_list'
        : step.role;
      const hasExplicitBinding = capabilityBindings.some(
        (binding) => binding.capabilityRole === bindingRole
      );
      const boundCard = this.selectExplicitlyBoundCapability(
        bindingRole,
        step.kind === 'skill' ? skillCards : llmOperationCards,
        capabilityBindings
      );

      if (boundCard) {
        capabilityKey = boundCard?.id || boundCard?.publishedSkillId;
      } else if (step.kind === 'skill') {
        if (step.role === 'search') {
          capabilityKey = searchSkill?.id || searchSkill?.publishedSkillId;
        } else if (step.role === 'markdown_writer') {
          capabilityKey = markdownWriterSkill?.id || markdownWriterSkill?.publishedSkillId;
        } else if (step.role === 'document_extract') {
          capabilityKey = documentExtractorSkill?.id || documentExtractorSkill?.publishedSkillId;
        } else if (step.role === 'web_extract') {
          capabilityKey = webExtractorSkill?.id || webExtractorSkill?.publishedSkillId;
        } else if (step.role === 'notify') {
          capabilityKey = notifySkill?.id || notifySkill?.publishedSkillId;
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

  private selectExplicitlyBoundCapability(
    role: string,
    cards: CompactCapabilityCardV1[],
    bindings: EffectiveTaskCapabilityBinding[]
  ): CompactCapabilityCardV1 | undefined {
    const candidates = bindings
      .filter((binding) => binding.capabilityRole === role)
      .sort((left, right) => right.priority - left.priority);
    if (!candidates.length) return undefined;

    for (const binding of candidates) {
      const matched = cards.find(
        (card) => card.id === binding.capabilityId || card.publishedSkillId === binding.capabilityId
      );
      if (matched) return matched;
    }
    return undefined;
  }

  private selectSkillForRole(
    skillCards: CompactCapabilityCardV1[],
    role: 'search' | 'markdown_writer' | 'document_extract' | 'web_extract' | 'notify',
    policy: ReturnType<typeof createBuiltinRoutingPolicySnapshot>,
    userRequest?: string,
    requiresListOutput?: boolean
  ): CompactCapabilityCardV1 | undefined {
    const policyRole =
      role === 'markdown_writer'
        ? 'markdownWriter'
        : role === 'document_extract'
          ? 'documentExtractor'
          : role === 'web_extract'
            ? 'webExtractor'
          : role === 'notify'
            ? 'notifier'
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
      .map((card, index) => ({
        card,
        index,
        score: this.scoreSkillContract(card, role, userRequest, requiresListOutput),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.card;
  }

  private scoreSkillContract(
    card: CompactCapabilityCardV1,
    role: 'search' | 'markdown_writer' | 'document_extract' | 'web_extract' | 'notify',
    userRequest?: string,
    requiresListOutput?: boolean
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
      const hasTextOutput = outputs.some(
        ([name, type]) =>
          /content|text|body|markdown/i.test(name) || /string|markdown_content/i.test(type)
      );
      if (!hasTextOutput) return 0;
      let score = 100;
      if (userRequest) {
        const candidateTexts = [card.displayName, card.summary, ...(card.goals || []), card.id];
        score += calculateCapabilityIntentScore(userRequest, candidateTexts);
      }
      return score;
    }
    if (role === 'web_extract') {
      const hasUrlInput = inputs.some(([name]) => /url|website|page|start/i.test(name));
      const hasTextOutput = outputs.some(
        ([name, type]) =>
          /content|text|body|markdown/i.test(name) || /string|markdown_content/i.test(type)
      );
      return (hasUrlInput ? 50 : 0) + (hasTextOutput ? 50 : 0);
    }
    if (role === 'notify') {
      const hasContentInput = inputs.some(([name]) => /content|text|message|body/i.test(name));
      if (!hasContentInput) return 0;
      let score = 100;
      if (userRequest) {
        const candidateTexts = [card.displayName, card.summary, ...(card.goals || []), card.id];
        score += calculateCapabilityIntentScore(userRequest, candidateTexts);
      }
      return score;
    }
    if (role === 'search') {
      const cardText = [
        card.displayName,
        card.id,
        card.summary,
        ...(card.goals || []),
      ]
        .join(' ')
        .toLowerCase();
      const isEmail = /邮件|email|mailbox|收件箱/i.test(cardText);

      // Email safety: personal mailboxes require explicit email intent in user request
      if (isEmail) {
        if (!userRequest) return 0;
        const hasEmailInReq = /邮件|email|inbox|收件箱|发件箱|未读|已读/i.test(userRequest.toLowerCase());
        if (!hasEmailInReq) return 0;
      }

      const hasDirectQuery = inputs.some(([name]) => /^query$/i.test(name));
      const hasKeyword = inputs.some(([name]) => /keyword|search|filter|type/i.test(name));
      const hasResultsOutput = outputs.some(
        ([name, type]) =>
          /result|item|list/i.test(name) ||
          /news_item_list|text_list|_list$|\[\]$/i.test(type) ||
          /^array$/i.test(type)
      );

      // When the downstream step needs list output (e.g. summarize_list), skills that produce
      // only scalar/text outputs (like workspace.explorer returning answer:string) cannot be
      // used as the search source. Exclude them immediately to prevent binding failures.
      if (requiresListOutput && !hasResultsOutput) {
        return 0;
      }

      let intentScore = 0;
      if (userRequest) {
        const candidateTexts = [card.displayName, card.summary, ...(card.goals || []), card.id];
        intentScore = calculateCapabilityIntentScore(userRequest, candidateTexts);
      }

      if (!hasResultsOutput && !hasDirectQuery && !hasKeyword && intentScore <= 0) {
        return 0;
      }

      let score = 0;
      if (hasDirectQuery) score += 30;
      else if (hasKeyword) score += 20;
      if (hasResultsOutput) score += 50;

      if (intentScore > 0) {
        score += intentScore;

        // Specialized domain capabilities with matching intent take precedence over generic web search fallback
        const isGenericWebSearch = card.id === 'platform.search.web';
        if (!isGenericWebSearch) {
          score += 50;
        }
      }

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

    if (step.role === 'generate') {
      const acceptsInstruction = inputs.some(([name]) => /instruction|request|prompt/i.test(name));
      const hasGenerateIntent = /generate|advice|opinion|见解|建议|生成|文本生成|创作|撰写|解释|看法|问答/.test(
        text
      );
      const isGenerateOperation = card.id === 'generate_text' || /generate_text/i.test(card.id);
      if (isGenerateOperation) return 150;
      return acceptsInstruction && hasGenerateIntent ? 120 : acceptsInstruction ? 80 : 0;
    }

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
        (/items|list|results/i.test(name) || /news_item_list|text_list|array|list/i.test(type)) &&
        !/instruction|request|prompt/i.test(name)
    );
    const acceptsText = inputs.some(
      ([name, type]) =>
        (/content|text|body|input/i.test(name) || /string|markdown_content/i.test(type)) &&
        !/instruction|request|prompt|items|list/i.test(name)
    );
    if (step.inputShape === 'list') return acceptsList ? 120 : acceptsText ? 50 : 0;
    return acceptsText && !acceptsList ? 120 : acceptsText ? 80 : 0;
  }
}
