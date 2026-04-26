import { BadRequestException } from '@nestjs/common';
import { ExecutionService } from '../src/modules/execution/execution.service';
import { ApprovalDecisionDto, SubmitInputDto } from '../src/modules/execution/execution.dto';

describe('ExecutionService.submitInputAndResume', () => {
  const baseExecution = {
    id: 'execution-1',
    status: 'waiting_input',
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
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      executionStep: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      executionEvent: {
        create: jest.fn(),
      },
      runtimeSession: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };

    const service = new ExecutionService(prisma as never);
    const serviceInternals = service as any;
    jest.spyOn(serviceInternals, 'updateStatus').mockResolvedValue(undefined);
    jest.spyOn(serviceInternals, 'advanceExecutionFlow').mockResolvedValue(undefined);

    return { service, prisma };
  };

  it('accepts valid missing input, updates normalized input, and resumes execution', async () => {
    const { service, prisma } = createService();
    const result = {
      id: 'execution-1',
      status: 'running',
    };
    const dto: SubmitInputDto = {
      stepId: 'step-1',
      input: {
        url: 'https://example.com',
      },
    };

    prisma.execution.findUnique.mockResolvedValue(baseExecution);
    prisma.executionStep.findUnique.mockResolvedValue(baseStep);
    prisma.execution.update.mockResolvedValue(undefined);
    prisma.executionStep.update.mockResolvedValue(undefined);
    prisma.executionEvent.create.mockResolvedValue(undefined);
    prisma.runtimeSession.findFirst.mockResolvedValue({ id: 'runtime-1' });
    jest.spyOn(service, 'getById').mockResolvedValue(result as never);

    const response = await service.submitInputAndResume('execution-1', 'user-1', dto);

    expect(prisma.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-1' },
      data: {
        normalizedInputJson: {
          input: {
            url: 'https://example.com',
          },
          requiredInputs: [
            {
              name: 'url',
              type: 'string',
              required: true,
              missing: false,
              source: 'user_input',
              value: 'https://example.com',
            },
          ],
          url: 'https://example.com',
        },
      },
    });
    expect(prisma.executionStep.update).toHaveBeenCalledWith({
      where: { id: 'step-1' },
      data: {
        status: 'succeeded',
        inputJson: {
          requiredInputs: [],
        },
        outputJson: {
          url: 'https://example.com',
        },
        endedAt: expect.any(Date),
      },
    });
    expect((service as any).updateStatus).toHaveBeenCalledWith('execution-1', 'running');
    expect((service as any).advanceExecutionFlow).toHaveBeenCalledWith('execution-1', 'runtime-1');
    expect(response).toBe(result);
  });

  it('rejects submitted fields that are not currently missing', async () => {
    const { service, prisma } = createService();
    const dto: SubmitInputDto = {
      stepId: 'step-1',
      input: {
        unexpected: 'value',
      },
    };

    prisma.execution.findUnique.mockResolvedValue(baseExecution);
    prisma.executionStep.findUnique.mockResolvedValue(baseStep);

    await expect(service.submitInputAndResume('execution-1', 'user-1', dto)).rejects.toThrow(BadRequestException);
    await expect(service.submitInputAndResume('execution-1', 'user-1', dto)).rejects.toThrow(
      'Unexpected input fields: unexpected',
    );
  });

  it('rejects resume when required missing inputs are still incomplete after submission', async () => {
    const { service, prisma } = createService();
    const executionWithTwoRequiredInputs = {
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
    };
    const dto: SubmitInputDto = {
      stepId: 'step-1',
      input: {
        url: 'https://example.com',
      },
    };

    prisma.execution.findUnique.mockResolvedValue(executionWithTwoRequiredInputs);
    prisma.executionStep.findUnique.mockResolvedValue(baseStep);

    await expect(service.submitInputAndResume('execution-1', 'user-1', dto)).rejects.toThrow(BadRequestException);
    await expect(service.submitInputAndResume('execution-1', 'user-1', dto)).rejects.toThrow(
      'Missing required input fields: account',
    );
  });

  it('starts execution after input submission when runtime session has not been allocated yet', async () => {
    const { service, prisma } = createService();
    const result = {
      id: 'execution-1',
      status: 'queued',
    };
    const dto: SubmitInputDto = {
      stepId: 'step-1',
      input: {
        url: 'https://example.com',
      },
    };

    prisma.execution.findUnique.mockResolvedValue(baseExecution);
    prisma.executionStep.findUnique.mockResolvedValue(baseStep);
    prisma.execution.update.mockResolvedValue(undefined);
    prisma.executionStep.update.mockResolvedValue(undefined);
    prisma.executionEvent.create.mockResolvedValue(undefined);
    prisma.runtimeSession.findFirst.mockResolvedValue(null);
    jest.spyOn(service, 'getById').mockResolvedValue(result as never);
    jest.spyOn(service as any, 'startExecution').mockResolvedValue(undefined);

    const response = await service.submitInputAndResume('execution-1', 'user-1', dto);

    expect((service as any).updateStatus).toHaveBeenCalledWith('execution-1', 'queued');
    expect((service as any).startExecution).toHaveBeenCalledWith('execution-1');
    expect(response).toBe(result);
  });
});

describe('ExecutionService approval flow', () => {
  const createService = () => {
    const prisma = {
      execution: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      executionStep: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      executionEvent: {
        create: jest.fn(),
      },
      runtimeSession: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };

    const service = new ExecutionService(prisma as never);
    const serviceInternals = service as any;
    jest.spyOn(serviceInternals, 'updateStatus').mockResolvedValue(undefined);
    jest.spyOn(serviceInternals, 'startExecution').mockResolvedValue(undefined);

    return { service, prisma };
  };

  it('approves pending execution, re-queues it, and starts execution', async () => {
    const { service, prisma } = createService();
    const execution = {
      id: 'execution-approve',
      status: 'pending_approval',
    };
    const dto: ApprovalDecisionDto = {
      comment: 'looks good',
    };
    const result = {
      id: 'execution-approve',
      status: 'queued',
      approvalStatus: 'approved',
    };

    prisma.execution.findUnique.mockResolvedValue(execution);
    prisma.execution.update.mockResolvedValue(undefined);
    prisma.executionEvent.create.mockResolvedValue(undefined);
    jest.spyOn(service, 'getById').mockResolvedValue(result as never);

    const response = await service.approve('execution-approve', 'approver-1', dto);

    expect(prisma.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-approve' },
      data: {
        approvalStatus: 'approved',
      },
    });
    expect((service as any).updateStatus).toHaveBeenCalledWith('execution-approve', 'queued');
    expect((service as any).startExecution).toHaveBeenCalledWith('execution-approve');
    expect(response).toBe(result);
  });

  it('rejects pending execution and cancels it', async () => {
    const { service, prisma } = createService();
    const execution = {
      id: 'execution-reject',
      status: 'pending_approval',
    };
    const dto: ApprovalDecisionDto = {
      comment: 'risk too high',
    };
    const result = {
      id: 'execution-reject',
      status: 'cancelled',
      approvalStatus: 'rejected',
    };

    prisma.execution.findUnique.mockResolvedValue(execution);
    prisma.execution.update.mockResolvedValue(undefined);
    prisma.executionEvent.create.mockResolvedValue(undefined);
    jest.spyOn(service, 'getById').mockResolvedValue(result as never);

    const response = await service.reject('execution-reject', 'approver-1', dto);

    expect(prisma.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-reject' },
      data: {
        approvalStatus: 'rejected',
        failureReason: 'risk too high',
        failureCode: 'APPROVAL_REJECTED',
      },
    });
    expect((service as any).updateStatus).toHaveBeenCalledWith('execution-reject', 'cancelled');
    expect(response).toBe(result);
  });
});

describe('ExecutionService.startExecution runtime selection', () => {
  const createService = () => {
    const prisma = {
      execution: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      executionStep: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      executionEvent: {
        create: jest.fn(),
      },
      runtimeSession: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };

    const service = new ExecutionService(prisma as never);
    const serviceInternals = service as any;
    jest.spyOn(serviceInternals, 'updateStatus').mockResolvedValue(undefined);
    jest.spyOn(serviceInternals, 'createEvent').mockResolvedValue(undefined);
    jest.spyOn(serviceInternals, 'advanceExecutionFlow').mockResolvedValue(undefined);

    return { service, prisma };
  };

  it('skips browser runtime allocation for non-browser execution', async () => {
    const { service, prisma } = createService();

    prisma.execution.findUnique.mockResolvedValue({
      id: 'execution-non-browser',
      runtimeType: 'sandbox',
      createdBy: 'user-1',
    });

    await (service as any).startExecution('execution-non-browser');

    expect((service as any).updateStatus).toHaveBeenCalledWith('execution-non-browser', 'running');
    expect((service as any).createEvent).toHaveBeenCalledWith(
      'execution-non-browser',
      'runtime.skipped',
      {
        runtimeType: 'sandbox',
        mode: 'non_browser_runtime',
      },
    );
    expect((service as any).advanceExecutionFlow).toHaveBeenCalledWith(
      'execution-non-browser',
      'execution-non-browser',
    );
  });
});
