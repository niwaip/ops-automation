import { DeterministicTaskExecutionService } from './deterministic-task-execution.service';

describe('DeterministicTaskExecutionService saved workflow routing', () => {
  it('creates the exact user-owned saved workflow version with no topology generation', async () => {
    const routeClassifier = { classifyRoute: jest.fn() };
    const planGenerator = { generatePlan: jest.fn() };
    const controlPlaneClient = {
      listSavedSkills: jest.fn().mockResolvedValue({
        skills: [
          {
            id: 'saved-workflow-1',
            name: '查询微博热点并进行总结，最后通过 Bark 推送',
            version: '1',
            status: 'active',
            stepCount: 3,
          },
        ],
      }),
      createExecution: jest.fn().mockResolvedValue({ id: 'execution-1' }),
      recordRoutingObservation: jest.fn().mockResolvedValue({ id: 'observation-1' }),
    };
    const service = new DeterministicTaskExecutionService(
      routeClassifier as never,
      planGenerator as never,
      controlPlaneClient as never,
    );

    await expect(
      service.executeMatchedSavedWorkflow(
        '查看微博的热点，然后给出总结，用bark推送',
        {
          authToken: 'Bearer token',
          user: { userId: 'user-1', userRoles: ['employee'] },
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        matched: true,
        success: true,
        executionId: 'execution-1',
        score: 1,
      }),
    );
    expect(controlPlaneClient.createExecution).toHaveBeenCalledWith(
      {
        skillId: 'saved-workflow-1',
        capabilityId: 'saved-workflow-1',
        skillVersion: '1',
        capabilityVersion: '1',
        input: {},
      },
      {
        authToken: 'Bearer token',
        user: { userId: 'user-1', userRoles: ['employee'] },
      },
    );
    expect(planGenerator.generatePlan).not.toHaveBeenCalled();
    expect(controlPlaneClient.recordRoutingObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        routeSource: 'saved_workflow',
        matchMethod: 'name',
        plannerInvoked: false,
      }),
      expect.any(Object),
    );
  });
});
