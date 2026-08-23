import type { RoutingCapabilityCardV1 } from './routing-capability-card.projector';

/**
 * Reserved extension point for enterprise semantic retrieval.
 *
 * The production implementation is deliberately disabled in this release. A
 * caller must still receive an explicit empty result so semantic retrieval can
 * never silently alter deterministic routing.
 */
export interface SemanticCandidateRetriever {
  readonly providerId: string;
  search(input: {
    userId: string;
    normalizedRequest: string;
    candidates: RoutingCapabilityCardV1[];
    limit: number;
  }): Promise<Array<{ candidateKey: string; score: number; providerId: string }>>;
}

/** Reserved extension point for a future candidate reranker. */
export interface CandidateReranker {
  readonly providerId: string;
  rerank(input: {
    normalizedRequest: string;
    candidates: RoutingCapabilityCardV1[];
  }): Promise<{
    decision: 'ranked' | 'no_match' | 'not_available';
    orderedCandidateKeys: string[];
    reason?: string;
  }>;
}

export class DisabledSemanticCandidateRetriever implements SemanticCandidateRetriever {
  readonly providerId = 'disabled';

  search(_input: {
    userId: string;
    normalizedRequest: string;
    candidates: RoutingCapabilityCardV1[];
    limit: number;
  }): Promise<Array<{ candidateKey: string; score: number; providerId: string }>> {
    return Promise.resolve([]);
  }
}

export class DisabledCandidateReranker implements CandidateReranker {
  readonly providerId = 'disabled';

  rerank(_input: {
    normalizedRequest: string;
    candidates: RoutingCapabilityCardV1[];
  }): Promise<{
    decision: 'ranked' | 'no_match' | 'not_available';
    orderedCandidateKeys: string[];
    reason?: string;
  }> {
    return Promise.resolve({
      decision: 'not_available',
      orderedCandidateKeys: [],
      reason: 'semantic_routing_disabled',
    });
  }
}
