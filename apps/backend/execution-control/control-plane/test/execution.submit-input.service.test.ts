import { BadRequestException } from '@nestjs/common';
import { EXECUTION_EVENT_TYPE, EXECUTION_STATUS } from '../src/modules/execution';
import { ExecutionService } from '../src/modules/execution/execution.service';
import { ExecutionInputResolutionService } from '../src/modules/execution/human-control/execution-input-resolution.service';
import { ExecutionSubmitInputService } from '../src/modules/execution/human-control/execution-submit-input.service';
import { ExecutionPlanNormalizationService } from '../src/modules/execution/step-runner/planning/execution-plan-normalization.service';

describe('ExecutionSubmitInputService', () => {
  const baseExecution = {
    id: 'execution-1',
    createdBy: 'user-1',
    status: EXECUTION_STATUS.WAITING_INPUT,
    normalizedInputJson: {
      input: {},
      requiredInputs: [
        {
          name: 'url',
          type: 'string',
          required: true,
          missing: true,
          source: 'unresolved',
        },
      ],
    },
  };

  const baseStep = {
    id: 'step-1',
    executionId: 'execution-1',
    type: 'input_collection',
  };

  const createService = () => {
    const prisma = {
      execution: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      executionStep: {
        update: jest.fn(),
      },
      runtimeSession: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const executionStepService = {
      getById: jest.fn(),
    };
    const executionInputResolutionService = new ExecutionInputResolutionService();
    const executionPlanNormalizationService = new ExecutionPlanNormalizationService(
      executionInputResolutionService
    );
    const hooks = {
      getExecutionDto: jest.fn(),
      emitEvent: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      startExecution: jest.fn().mockResolvedValue(undefined),
      advanceExecutionFlow: jest.fn().mockResolvedValue(undefined),
    };
    const planSchedulerService = {
      advanceExecution: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionSubmitInputService(
      prisma as never,
      executionStepService as never,
      executionInputResolutionService,
      executionPlanNormalizationService,
      planSchedulerService as never,
    );

    return { service, prisma, executionStepService, hooks, planSchedulerService };
  };

  it('resumes execution and advances runtime flow when the missing input is fulfilled', async () => {
    const { service, prisma, executionStepService, hooks } = createService();
    prisma.execution.findUnique.mockResolvedValue(baseExecution);
    prisma.execution.update.mockResolvedValue(undefined);
    prisma.executionStep.update.mockResolvedValue(undefined);
    prisma.runtimeSession.findFirst.mockResolvedValue({ id: 'runtime-1' });
    executionStepService.getById.mockResolvedValue(baseStep);
    hooks.getExecutionDto.mockResolvedValue({
      id: 'execution-1',
      status: EXECUTION_STATUS.RUNNING,
    });

    const result = await service.submitInputAndResume(
      'execution-1',
      'user-1',
      {
        stepId: 'step-1',
        input: {
          url: 'https://example.com',
        },
      },
      hooks,
      { id: 'user-1' }
    );

    expect(hooks.emitEvent).toHaveBeenNthCalledWith(
      1,
      'execution-1',
      EXECUTION_EVENT_TYPE.EXECUTION_INPUT_SUBMITTED,
      {
        stepId: 'step-1',
        input: {
          url: 'https://example.com',
        },
        remainingMissing: [],
      }
    );
    expect(hooks.updateStatus).toHaveBeenCalledWith('execution-1', EXECUTION_STATUS.RUNNING);
    expect(hooks.emitEvent).toHaveBeenNthCalledWith(
      2,
      'execution-1',
      EXECUTION_EVENT_TYPE.EXECUTION_RESUMED,
      {
        userId: 'user-1',
        reason: 'input_submitted',
      },
      {
        runtimeSessionId: 'runtime-1',
        stepId: 'step-1',
      }
    );
    expect(hooks.advanceExecutionFlow).toHaveBeenCalledWith('execution-1', 'runtime-1');
    expect(result).toEqual({
      id: 'execution-1',
      status: EXECUTION_STATUS.RUNNING,
    });
  });

  it('keeps execution in waiting_input when required fields remain missing', async () => {
    const { service, prisma, executionStepService, hooks } = createService();
    prisma.execution.findUnique.mockResolvedValue({
      ...baseExecution,
      normalizedInputJson: {
        input: {},
        requiredInputs: [
          {
            name: 'url',
            type: 'string',
            required: true,
            missing: true,
            source: 'unresolved',
          },
          {
            name: 'account',
            type: 'string',
            required: true,
            missing: true,
            source: 'unresolved',
          },
        ],
      },
    });
    prisma.execution.update.mockResolvedValue(undefined);
    prisma.executionStep.update.mockResolvedValue(undefined);
    prisma.runtimeSession.findFirst.mockResolvedValue({ id: 'runtime-1' });
    executionStepService.getById.mockResolvedValue(baseStep);
    hooks.getExecutionDto.mockResolvedValue({
      id: 'execution-1',
      status: EXECUTION_STATUS.WAITING_INPUT,
    });

    const result = await service.submitInputAndResume(
      'execution-1',
      'user-1',
      {
        stepId: 'step-1',
        input: {
          url: 'https://example.com',
        },
      },
      hooks,
      { id: 'user-1' }
    );

    expect(prisma.executionStep.update).toHaveBeenCalledWith({
      where: { id: 'step-1' },
      data: {
        status: 'waiting_input',
        inputJson: {
          requiredInputs: [expect.objectContaining({ name: 'account', missing: true })],
        },
        outputJson: {
          url: 'https://example.com',
        },
        endedAt: null,
      },
    });
    expect(hooks.emitEvent).toHaveBeenCalledWith(
      'execution-1',
      EXECUTION_EVENT_TYPE.EXECUTION_PARTIAL_INPUT_SUBMITTED,
      {
        stepId: 'step-1',
        input: {
          url: 'https://example.com',
        },
        remainingMissing: ['account'],
      }
    );
    expect(hooks.startExecution).not.toHaveBeenCalled();
    expect(hooks.updateStatus).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: 'execution-1',
      status: EXECUTION_STATUS.WAITING_INPUT,
    });
  });

  it('rejects invalid step ids for input submission', async () => {
    const { service, prisma, executionStepService, hooks } = createService();
    prisma.execution.findUnique.mockResolvedValue(baseExecution);
    executionStepService.getById.mockResolvedValue({
      id: 'step-2',
      executionId: 'execution-2',
      type: 'system',
    });

    await expect(
      service.submitInputAndResume(
        'execution-1',
        'user-1',
        {
          stepId: 'step-1',
          input: {
            url: 'https://example.com',
          },
        },
        hooks
      )
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.submitInputAndResume(
        'execution-1',
        'user-1',
        {
          stepId: 'step-1',
          input: {
            url: 'https://example.com',
          },
        },
        hooks
      )
    ).rejects.toThrow('Invalid step ID for input submission');
  });

  it('writes submitted values to frozen plan paths and resumes the deterministic scheduler', async () => {
    const { service, prisma, executionStepService, hooks, planSchedulerService } = createService();
    const deterministicExecution = {
      ...baseExecution,
      executionMode: 'deterministic_plan',
      inputJson: { prompt: '查询微博热点并总结，用 Bark 推送' },
      normalizedInputJson: {
        input: {},
        requiredInputs: [
          {
            name: 'n1.type',
            type: 'string',
            required: true,
            missing: true,
            source: 'unresolved',
          },
        ],
      },
      plan: {
        planJson: {
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
      },
    };
    prisma.execution.findUnique
      .mockResolvedValueOnce(deterministicExecution)
      .mockResolvedValueOnce({ executionMode: 'deterministic_plan' });
    prisma.execution.update.mockResolvedValue(undefined);
    prisma.executionStep.update.mockResolvedValue(undefined);
    prisma.runtimeSession.findFirst.mockResolvedValue(null);
    executionStepService.getById.mockResolvedValue(baseStep);
    hooks.getExecutionDto.mockResolvedValue({
      id: 'execution-1',
      status: EXECUTION_STATUS.QUEUED,
    });

    await service.submitInputAndResume(
      'execution-1',
      'user-1',
      {
        stepId: 'step-1',
        input: { 'n1.type': 'weibo' },
      },
      hooks,
      { id: 'user-1' },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(prisma.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-1' },
      data: expect.objectContaining({
        status: EXECUTION_STATUS.QUEUED,
        inputJson: {
          prompt: '查询微博热点并总结，用 Bark 推送',
          planInputs: { n1: { type: 'weibo' } },
        },
      }),
    });
    expect(planSchedulerService.advanceExecution).toHaveBeenCalledWith('execution-1');
    expect(hooks.startExecution).not.toHaveBeenCalled();
    expect(hooks.advanceExecutionFlow).not.toHaveBeenCalled();
  });
});

describe('ExecutionService submit-input delegation', () => {
  it('delegates submitInputAndResume to ExecutionSubmitInputService', async () => {
    const service = new ExecutionService({} as never, {} as never, {} as never, {} as never);
    const submitInputService = {
      submitInputAndResume: jest.fn().mockResolvedValue({
        id: 'execution-1',
        status: EXECUTION_STATUS.RUNNING,
      }),
    };
    (service as any).executionSubmitInputService = submitInputService;

    await expect(
      service.submitInputAndResume(
        'execution-1',
        'user-1',
        {
          stepId: 'step-1',
          input: {
            url: 'https://example.com',
          },
        },
        { id: 'user-1' }
      )
    ).resolves.toEqual({
      id: 'execution-1',
      status: EXECUTION_STATUS.RUNNING,
    });

    expect(submitInputService.submitInputAndResume).toHaveBeenCalledWith(
      'execution-1',
      'user-1',
      {
        stepId: 'step-1',
        input: {
          url: 'https://example.com',
        },
      },
      expect.any(Object),
      { id: 'user-1' }
    );
  });
});
