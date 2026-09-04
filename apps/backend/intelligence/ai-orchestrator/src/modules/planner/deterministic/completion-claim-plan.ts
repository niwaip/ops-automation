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

export function attachCompletionClaims(
  plan: DeterministicPlanDraftV1,
  recipe: MatchedRecipe | null | undefined
): void {
  if (!recipe) return;
  const requested = new Set(
    recipe.completionClaims?.length
      ? recipe.completionClaims
      : recipe.steps.map((step) => ROLE_DEFAULT_CLAIMS[step.role]).filter(Boolean)
  );
  const claims: PlannedCompletionClaim[] = [];
  for (let index = 0; index < recipe.steps.length; index++) {
    const step = recipe.steps[index]!;
    const node = plan.nodes[index];
    if (!node) continue;
    const defaultClaim = ROLE_DEFAULT_CLAIMS[step.role];
    const matchingClaims = [...requested].filter(
      (claim) => claim === defaultClaim || claim.startsWith(`${step.role}.`)
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
