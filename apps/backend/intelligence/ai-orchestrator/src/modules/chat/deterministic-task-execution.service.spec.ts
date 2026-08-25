import { DeterministicTaskExecutionService } from './deterministic-task-execution.service';

describe('DeterministicTaskExecutionService saved workflow routing', () => {
  it('uses planner context for planning only and never persists it in execution input', async () => {
    const routeClassifier = { classifyRoute: jest.fn() };
    const planGenerator = {
      generatePlan: jest.fn().mockResolvedValue({ nodes: [], required_inputs: [] }),
    };
    const controlPlaneClient = {
      createExecution: jest.fn().mockResolvedValue({ id: 'execution-1' }),
    };
    const service = new DeterministicTaskExecutionService(
      routeClassifier as never,
      planGenerator as never,
      controlPlaneClient as never
    );

    await expect(
      service.executeDeterministicTask('生成周报', 'user-1', {
        user: { userId: 'user-1' },
        systemInputs: { reportDate: '2026-08-25' },
        plannerContext: { scopedMemory: { value: { preferredFormat: 'table' } } },
      })
    ).resolves.toMatchObject({ success: true, executionId: 'execution-1' });

    expect(planGenerator.generatePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInputs: { reportDate: '2026-08-25' },
        plannerContext: { scopedMemory: { value: { preferredFormat: 'table' } } },
      })
    );
    expect(controlPlaneClient.createExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { prompt: '生成周报', reportDate: '2026-08-25' },
      }),
      expect.any(Object)
    );
  });

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
