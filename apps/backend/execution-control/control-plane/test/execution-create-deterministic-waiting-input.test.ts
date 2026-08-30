import { ExecutionCreateService } from '../src/modules/execution/creation/execution-create.service';

describe('ExecutionCreateService deterministic waiting input', () => {
  it('freezes the plan in waiting_input and does not schedule nodes before input arrives', async () => {
    const tx = {
      execution: {
        create: jest.fn().mockResolvedValue({ id: 'execution-1' }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      executionStep: {
        create: jest.fn().mockResolvedValue({ id: 'waiting-step-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const planFreezeService = {
      freezeAndPersistPlan: jest.fn().mockResolvedValue({
        planId: 'plan-1',
        planHash: 'hash-1',
      }),
    };
    const planSchedulerService = {
      advanceExecution: jest.fn().mockResolvedValue(undefined),
    };
    const hooks = {
      getExecutionDto: jest.fn().mockResolvedValue({
        id: 'execution-1',
        status: 'waiting_input',
      }),
      emitEvent: jest.fn().mockResolvedValue(undefined),
      enterWaitingInput: jest.fn(),
      startExecution: jest.fn(),
    };
    const service = new ExecutionCreateService(
      prisma as never,
      {} as never,
      {} as never,
      {
        buildParamResolutionFromRequiredInputs: jest.fn().mockReturnValue({
          'n1.type': {
            type: 'string',
            required: true,
            requiredMode: 'always',
            source: 'unresolved',
            missing: true,
            final: false,
          },
        }),
      } as never,
      {} as never,
      planFreezeService as never,
      planSchedulerService as never,
    );

    await service.create(
      'user-1',
      {
        skillId: 'platform.document.pdf-create',
        capabilityId: 'platform.document.pdf-create',
        executionMode: 'deterministic_plan',
        input: { prompt: '查询微博热点并总结，用 Bark 推送' },
        deterministicPlan: {
          schemaVersion: 'deterministic-plan/v1',
          plannerVersion: 'v1',
          catalogVersion: 'v1',
          planType: 'sequential',
          objective: '查询微博热点并总结，用 Bark 推送',
          originalRequest: '查询微博热点并总结，用 Bark 推送',
          status: 'validated',
          nodes: [],
          finalOutputs: [],
          requiredUserInputs: [
            {
              name: 'n1.type',
              targetField: 'type',
              nodeId: 'n1_热榜查询',
              inputPath: 'planInputs.n1.type',
              prompt: '请输入热榜平台',
              missing: true,
            },
          ],
        },
      } as never,
      hooks as never,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(tx.execution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        skillId: null,
        status: 'waiting_input',
        executionMode: 'deterministic_plan',
        normalizedInputJson: expect.objectContaining({
          requiredInputs: [expect.objectContaining({ name: 'n1.type', missing: true })],
        }),
      }),
    });
    expect(tx.executionStep.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        executionId: 'execution-1',
        stepIndex: 0,
        type: 'input_collection',
        status: 'waiting_input',
      }),
    });
    expect(tx.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-1' },
      data: { currentStepId: 'waiting-step-1' },
    });
    expect(planSchedulerService.advanceExecution).not.toHaveBeenCalled();
    expect(hooks.emitEvent).toHaveBeenCalledWith(
      'execution-1',
      'execution.created',
      expect.objectContaining({
        skillId: 'platform.document.pdf-create',
      })
    );
  });
});
