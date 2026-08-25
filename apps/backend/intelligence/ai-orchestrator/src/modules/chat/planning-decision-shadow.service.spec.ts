import { PlanningDecisionShadowService } from './planning-decision-shadow.service';

describe('PlanningDecisionShadowService', () => {
  const originalFlag = process.env.PLANNING_DECISION_PERSIST_ENABLED;

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.PLANNING_DECISION_PERSIST_ENABLED;
    else process.env.PLANNING_DECISION_PERSIST_ENABLED = originalFlag;
  });

  it('does nothing while the feature flag is disabled', async () => {
    delete process.env.PLANNING_DECISION_PERSIST_ENABLED;
    const client = { recordPlanningDecision: jest.fn() };
    const service = new PlanningDecisionShadowService(
      { classifyRoute: jest.fn().mockReturnValue('single_skill') } as any,
      { getSnapshot: jest.fn() } as any,
      client as any
    );
    await service.recordLegacyRoute('查询天气', {}, { user: { userId: 'user-1' } });
    expect(client.recordPlanningDecision).not.toHaveBeenCalled();
  });

  it('records a generated-plan shadow decision without changing execution', async () => {
    process.env.PLANNING_DECISION_PERSIST_ENABLED = 'true';
    const client = { recordPlanningDecision: jest.fn().mockResolvedValue({ id: 'decision-1' }) };
    const service = new PlanningDecisionShadowService(
      { classifyRoute: jest.fn().mockReturnValue('deterministic_plan') } as any,
      {
        getSnapshot: jest.fn().mockReturnValue({
          version: 'policy-v1',
          digest: 'a'.repeat(64),
        }),
      } as any,
      client as any
    );
    await service.recordLegacyRoute(
      '查询并总结',
      {},
      { authToken: 'token', user: { userId: 'user-1' } }
    );
    expect(client.recordPlanningDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        shadow: true,
        decision: expect.objectContaining({
          schemaVersion: 'planning-decision/v1',
          routeClass: 'generated_plan',
          routeSource: 'llm_topology',
          estimatedModelCalls: 1,
        }),
      }),
      { authToken: 'token', user: { userId: 'user-1' } }
    );
  });
});
