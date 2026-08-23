import {
  DisabledCandidateReranker,
  DisabledSemanticCandidateRetriever,
} from './semantic-routing.port';

describe('semantic routing ports', () => {
  it('keeps semantic retrieval disabled and returns no candidates', async () => {
    const retriever = new DisabledSemanticCandidateRetriever();

    await expect(
      retriever.search({
        userId: 'user-1',
        normalizedRequest: '查询热点',
        candidates: [],
        limit: 5,
      })
    ).resolves.toEqual([]);
    expect(retriever.providerId).toBe('disabled');
  });

  it('returns an explicit unavailable rerank decision', async () => {
    const reranker = new DisabledCandidateReranker();

    await expect(
      reranker.rerank({ normalizedRequest: '查询热点', candidates: [] })
    ).resolves.toEqual({
      decision: 'not_available',
      orderedCandidateKeys: [],
      reason: 'semantic_routing_disabled',
    });
    expect(reranker.providerId).toBe('disabled');
  });
});
