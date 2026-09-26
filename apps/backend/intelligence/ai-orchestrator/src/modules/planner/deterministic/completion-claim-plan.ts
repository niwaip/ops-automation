import type { DeterministicPlanDraftV1 } from '@ops/backend-deterministic-plan';
import type { MatchedRecipe } from '../topology/deterministic-recipe-matcher.service';

export interface PlannedCompletionClaim {
  claim: string;
  producerNodeId: string;
  evidenceType: 'schema' | 'provider_receipt' | 'artifact';
}

const ROLE_DEFAULT_CLAIMS: Record<string, string> = {
  web_extract: 'webpage_content_extracted',
  document_extract: 'document_content_extracted',
  search: 'search_results_produced',
  summarize: 'summary_generated',
  transform: 'transformed_text_generated',
  markdown_writer: 'markdown_artifact_created',
};

function findNodeForStep(
  plan: DeterministicPlanDraftV1,
  step: NonNullable<MatchedRecipe['steps']>[number],
  stepIndex: number,
  totalSteps: number,
  recipe: MatchedRecipe
) {
  const isTerminalStep = stepIndex === totalSteps - 1 || step.ref === recipe.finalNodeRef;
  if (isTerminalStep) {
    const finalProducerNodeId = plan.finalOutputs?.[0]?.fromNodeId;
    if (finalProducerNodeId) {
      const match = plan.nodes.find((n) => n.nodeId === finalProducerNodeId);
      if (match) return match;
    }
    return plan.nodes[plan.nodes.length - 1];
  }

  if (plan.nodes.length === totalSteps && plan.nodes[stepIndex]) {
    return plan.nodes[stepIndex];
  }

  switch (step.role) {
    case 'search':
      return (
        plan.nodes.find(
          (n) =>
            n.kind === 'skill' &&
            (n.skillId.includes('search') ||
              n.title?.includes('搜索') ||
              n.title?.includes('Search'))
        ) || plan.nodes[stepIndex]
      );
    case 'summarize':
      return (
        plan.nodes.find(
          (n) => n.kind === 'llm_operation' && n.operationId.startsWith('summarize')
        ) || plan.nodes[stepIndex]
      );
    case 'transform':
      return (
        plan.nodes.find(
          (n) => n.kind === 'llm_operation' && n.operationId.startsWith('transform')
        ) || plan.nodes[stepIndex]
      );
    case 'web_extract':
      return (
        plan.nodes.find(
          (n) =>
            n.kind === 'skill' &&
            (n.skillId.includes('web') || n.title?.includes('网页') || n.title?.includes('Web'))
        ) || plan.nodes[stepIndex]
      );
    case 'document_extract':
      return (
        plan.nodes.find(
          (n) =>
            n.kind === 'skill' &&
            (n.skillId.includes('extract') ||
              n.title?.includes('提取') ||
              n.title?.includes('Extract'))
        ) || plan.nodes[stepIndex]
      );
    case 'markdown_writer':
      return (
        plan.nodes.find(
          (n) =>
            n.kind === 'skill' &&
            (n.skillId.includes('markdown') ||
              n.title?.includes('Markdown') ||
              n.runtimeType === 'artifact')
        ) ||
        plan.nodes[plan.nodes.length - 1] ||
        plan.nodes[stepIndex]
      );
    default:
      return plan.nodes[stepIndex] || plan.nodes[plan.nodes.length - 1];
  }
}

export function attachCompletionClaims(
  plan: DeterministicPlanDraftV1,
  recipe: MatchedRecipe | null | undefined
): void {
  if (!recipe) return;
  const requested = new Set<string>(
    (recipe.completionClaims?.length
      ? recipe.completionClaims
      : recipe.steps.map((step) => ROLE_DEFAULT_CLAIMS[step.role]).filter((c): c is string => Boolean(c))
    )
  );
  const claims: PlannedCompletionClaim[] = [];
  for (let index = 0; index < recipe.steps.length; index++) {
    const step = recipe.steps[index]!;
    const node = findNodeForStep(plan, step, index, recipe.steps.length, recipe);
    if (!node) continue;
    const defaultClaim = ROLE_DEFAULT_CLAIMS[step.role];
    const matchingClaims = [...requested].filter(
      (claim): claim is string => Boolean(claim && (claim === defaultClaim || claim.startsWith(`${step.role}.`)))
    );
    for (const claim of matchingClaims) {
      claims.push({
        claim,
        producerNodeId: node.nodeId,
        evidenceType:
          step.role === 'markdown_writer'
            ? 'artifact'
            : /send|deliver|upload|delete|payment/.test(claim)
              ? 'provider_receipt'
              : 'schema',
      });
      requested.delete(claim);
    }
  }
  // Unknown claims bind to the terminal node but remain explicit, allowing the
  // runtime synthesizer to fail closed when it has no supported evidence.
  const terminalNodeId = plan.nodes[plan.nodes.length - 1]?.nodeId;
  if (terminalNodeId) {
    for (const claim of requested) {
      claims.push({ claim, producerNodeId: terminalNodeId, evidenceType: 'schema' });
    }
  }
  (plan as any).completionClaims = claims;
}
