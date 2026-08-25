import { PlanningDecisionService } from '../src/modules/experience-learning/planning-decision.service';

describe('PlanningDecisionService', () => {
  const queryRaw = jest.fn();
  const service = new PlanningDecisionService({ $queryRawUnsafe: queryRaw } as any);
  const decision = {
    schemaVersion: 'planning-decision/v1' as const,
    routeClass: 'single_capability' as const,
    routeSource: 'deterministic_match' as const,
    confidence: 0.9,
    reasonCodes: ['legacy_fast_path'],
    candidateIds: [],
    selectedCapabilityIds: [],
    catalogSnapshotDigest: 'a'.repeat(64),
    routingPolicyVersion: 'v1',
    routingPolicyDigest: 'b'.repeat(64),
    estimatedModelCalls: 0,
    estimatedInputTokens: 0,
    tokenBudget: 0,
    riskLevel: 'L0' as const,
    requiresApproval: false,
    replayability: 'contract' as const,
  };

  beforeEach(() => {
    queryRaw.mockReset();
  });

  it('validates and persists the immutable decision payload', async () => {
    queryRaw.mockResolvedValue([{ id: 'decision-1', createdAt: new Date('2026-08-24T00:00:00Z') }]);
    const result = await service.record('11111111-1111-4111-8111-111111111111', {
      requestFingerprint: 'c'.repeat(64),
      shadow: true,
      decision,
    });
    expect(result).toEqual({
      id: 'decision-1',
      createdAt: '2026-08-24T00:00:00.000Z',
      shadow: true,
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw.mock.calls[0]).toEqual(
      expect.arrayContaining([JSON.stringify(decision), true, decision.routingPolicyVersion])
    );
  });

  it('rejects invalid decisions before touching the database', async () => {
    await expect(
      service.record('11111111-1111-4111-8111-111111111111', {
        requestFingerprint: 'c'.repeat(64),
        shadow: true,
        decision: { ...decision, confidence: 2 },
      })
    ).rejects.toThrow('Invalid PlanningDecisionV1');
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
