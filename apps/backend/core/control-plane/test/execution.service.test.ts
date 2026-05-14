import { BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { APPROVAL_STATUS, EXECUTION_EVENT_TYPE, EXECUTION_STATUS } from '../src/modules/execution';
import { ExecutionService } from '../src/modules/execution/execution.service';
import { ApprovalDecisionDto, SubmitInputDto, TakeoverExecutionDto } from '../src/modules/execution/execution.dto';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ExecutionService.submitInputAndResume', () => {
  const baseExecution = {
    id: 'execution-1',
    createdBy: 'user-1',
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
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };

    const service = new ExecutionService(prisma as never, {} as never, {} as never, {} as never);
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
        status: 'queued',
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

  it('keeps execution in waiting_input when required inputs are still incomplete after submission', async () => {
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
    const result = {
      id: 'execution-1',
      status: 'waiting_input',
    };

    prisma.execution.findUnique.mockResolvedValue(executionWithTwoRequiredInputs);
    prisma.executionStep.findUnique.mockResolvedValue(baseStep);
    prisma.execution.update.mockResolvedValue(undefined);
    prisma.executionStep.update.mockResolvedValue(undefined);
    prisma.executionEvent.create.mockResolvedValue(undefined);
    prisma.runtimeSession.findFirst.mockResolvedValue({ id: 'runtime-1' });
    jest.spyOn(service, 'getById').mockResolvedValue(result as never);

    const response = await service.submitInputAndResume('execution-1', 'user-1', dto);

    expect(prisma.executionStep.update).toHaveBeenCalledWith({
      where: { id: 'step-1' },
      data: {
        status: 'waiting_input',
        inputJson: {
          requiredInputs: [
            {
              name: 'account',
              type: 'string',
              required: true,
              missing: true,
              source: 'unresolved',
            },
          ],
        },
        outputJson: {
          url: 'https://example.com',
        },
        endedAt: null,
      },
    });
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
            {
              name: 'account',
              type: 'string',
              required: true,
              missing: true,
              source: 'unresolved',
            },
          ],
          url: 'https://example.com',
        },
        status: 'waiting_input',
      },
    });
    expect((service as any).updateStatus).not.toHaveBeenCalled();
    expect((service as any).advanceExecutionFlow).not.toHaveBeenCalled();
    expect(response).toBe(result);
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

    expect((service as any).updateStatus).not.toHaveBeenCalled();
    expect((service as any).startExecution).toHaveBeenCalledWith('execution-1');
    expect(response).toBe(result);
  });
});

describe('ExecutionService waiting_input semantic passthrough', () => {
  const createService = () => {
    const prisma = {
      execution: {
        findUnique: jest.fn(),
      },
      executionEvent: {
        create: jest.fn(),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };

    const service = new ExecutionService(prisma as never, {} as never, {} as never, {} as never);
    const serviceInternals = service as any;
    jest.spyOn(serviceInternals, 'updateStatus').mockResolvedValue(undefined);
    jest.spyOn(serviceInternals, 'createEvent').mockResolvedValue(undefined);

    return { service, prisma };
  };

  it('includes semantic snapshot in runtime waiting_input events when available', async () => {
    const { service, prisma } = createService();
    const semantic = {
      enabled: true,
      mode: 'complex_document',
      previewReady: true,
      finalReady: false,
      fallbackToFieldLevel: false,
      groupedMissing: [],
    };
    prisma.execution.findUnique.mockResolvedValue({
      normalizedInputJson: { semantic },
    });

    await (service as any).enterRuntimeWaitingInput(
      'execution-1',
      'runtime-1',
      'step-1',
      [{ name: 'url', type: 'string' }],
      'missing fields',
    );

    expect((service as any).createEvent).toHaveBeenCalledWith(
      'execution-1',
      EXECUTION_EVENT_TYPE.STEP_WAITING_INPUT,
      expect.objectContaining({
        requiredInputs: [{ name: 'url', type: 'string' }],
        reason: 'missing fields',
        semantic,
      }),
      expect.objectContaining({
        runtimeSessionId: 'runtime-1',
        stepId: 'step-1',
      }),
    );
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
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };

    const service = new ExecutionService(prisma as never, {} as never, {} as never, {} as never);
    const serviceInternals = service as any;
    jest.spyOn(serviceInternals, 'updateStatus').mockResolvedValue(undefined);
    jest.spyOn(serviceInternals, 'startExecution').mockResolvedValue(undefined);

    return { service, prisma };
  };

  it('approves pending execution, re-queues it, and starts execution', async () => {
    const { service, prisma } = createService();
    const execution = {
      id: 'execution-approve',
      createdBy: 'approver-1',
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
        approvalStatus: APPROVAL_STATUS.APPROVED,
      },
    });
    expect((service as any).updateStatus).toHaveBeenCalledWith('execution-approve', EXECUTION_STATUS.QUEUED);
    expect((service as any).startExecution).toHaveBeenCalledWith('execution-approve');
    expect(response).toBe(result);
  });

  it('rejects pending execution and cancels it', async () => {
    const { service, prisma } = createService();
    const execution = {
      id: 'execution-reject',
      createdBy: 'approver-1',
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
        approvalStatus: APPROVAL_STATUS.REJECTED,
        failureReason: 'risk too high',
        failureCode: 'APPROVAL_REJECTED',
      },
    });
    expect((service as any).updateStatus).toHaveBeenCalledWith('execution-reject', EXECUTION_STATUS.CANCELLED);
    expect(response).toBe(result);
  });
});

describe('ExecutionService takeover and cancel flow', () => {
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
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };

    const service = new ExecutionService(prisma as never, {} as never, {} as never, {} as never);
    const serviceInternals = service as any;
    jest.spyOn(serviceInternals, 'updateStatus').mockResolvedValue(undefined);

    return { service, prisma };
  };

  beforeEach(() => {
    mockedAxios.post.mockReset();
    mockedAxios.post.mockResolvedValue({ data: { ok: true } } as never);
  });

  it('moves execution into human_control, freezes runtime session, and emits takeover event', async () => {
    const { service, prisma } = createService();
    const execution = {
      id: 'execution-takeover',
      createdBy: 'user-1',
      status: EXECUTION_STATUS.RUNNING,
    };
    const dto: TakeoverExecutionDto = {
      reason: 'Captcha detected',
    };
    const result = {
      id: 'execution-takeover',
      status: EXECUTION_STATUS.HUMAN_CONTROL,
      takeoverRequired: true,
    };

    prisma.execution.findUnique.mockResolvedValue(execution);
    prisma.execution.update.mockResolvedValue(undefined);
    prisma.executionEvent.create.mockResolvedValue(undefined);
    prisma.runtimeSession.findFirst.mockResolvedValue({ id: 'runtime-1' });
    jest.spyOn(service, 'getById').mockResolvedValue(result as never);

    const response = await service.takeover('execution-takeover', 'user-1', dto);

    expect(prisma.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-takeover' },
      data: {
        status: EXECUTION_STATUS.HUMAN_CONTROL,
        takeoverRequired: true,
        takeoverReason: 'Captcha detected',
      },
    });
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://session-broker:3002/runtime-sessions/runtime-1/freeze',
      { reason: 'Captcha detected' },
    );
    expect(prisma.executionEvent.create).toHaveBeenCalledWith({
      data: {
        executionId: 'execution-takeover',
        runtimeSessionId: undefined,
        stepId: undefined,
        eventType: EXECUTION_EVENT_TYPE.EXECUTION_TAKEOVER_REQUESTED,
        eventSource: 'control-plane',
        payloadJson: {
          userId: 'user-1',
          reason: 'Captcha detected',
        },
      },
    });
    expect(response).toBe(result);
  });

  it('cancels execution, closes runtime session, and emits cancelled event', async () => {
    const { service, prisma } = createService();
    const execution = {
      id: 'execution-cancel',
      createdBy: 'user-1',
      status: EXECUTION_STATUS.RUNNING,
    };
    const result = {
      id: 'execution-cancel',
      status: EXECUTION_STATUS.CANCELLED,
    };

    prisma.execution.findUnique.mockResolvedValue(execution);
    prisma.executionEvent.create.mockResolvedValue(undefined);
    prisma.runtimeSession.findFirst.mockResolvedValue({ id: 'runtime-2' });
    jest.spyOn(service, 'getById').mockResolvedValue(result as never);

    const response = await service.cancel('execution-cancel', 'user-1');

    expect((service as any).updateStatus).toHaveBeenCalledWith(
      'execution-cancel',
      EXECUTION_STATUS.CANCELLED,
    );
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://session-broker:3002/runtime-sessions/runtime-2/close',
      {},
    );
    expect(prisma.executionEvent.create).toHaveBeenCalledWith({
      data: {
        executionId: 'execution-cancel',
        runtimeSessionId: undefined,
        stepId: undefined,
        eventType: EXECUTION_EVENT_TYPE.EXECUTION_CANCELLED,
        eventSource: 'control-plane',
        payloadJson: {
          userId: 'user-1',
        },
      },
    });
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
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };

    const service = new ExecutionService(prisma as never, {} as never, {} as never, {} as never);
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

    expect((service as any).updateStatus).toHaveBeenCalledWith(
      'execution-non-browser',
      EXECUTION_STATUS.RUNNING,
    );
    expect((service as any).createEvent).toHaveBeenCalledWith(
      'execution-non-browser',
      EXECUTION_EVENT_TYPE.RUNTIME_SKIPPED,
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

describe('ExecutionService.bootstrapBrowserExecution', () => {
  const createService = () => {
    const prisma = {
      execution: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      executionStep: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      executionEvent: {
        create: jest.fn(),
      },
      runtimeSession: {
        findFirst: jest.fn(),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };

    const service = new ExecutionService(prisma as never, {} as never, {} as never, {} as never);
    const serviceInternals = service as any;
    jest.spyOn(serviceInternals, 'advanceExecutionFlow').mockResolvedValue(undefined);

    return { service, prisma };
  };

  it('skips runtime bootstrap goto for direct skill execution mode', async () => {
    const { service, prisma } = createService();

    await (service as any).bootstrapBrowserExecution(
      {
        id: 'execution-browser-skill-1',
        runtimeType: 'browser',
        normalizedInputJson: {
          plannerMode: 'skill',
          url: 'https://www.bing.com',
          input: {
            url: 'https://www.bing.com',
            query: 'mcp',
          },
        },
        inputJson: {
          url: 'https://www.bing.com',
          query: 'mcp',
        },
      },
      'runtime-browser-skill-1',
    );

    expect(prisma.executionStep.findFirst).not.toHaveBeenCalled();
    expect(prisma.executionStep.create).not.toHaveBeenCalled();
    expect((service as any).advanceExecutionFlow).toHaveBeenCalledWith(
      'execution-browser-skill-1',
      'runtime-browser-skill-1',
    );
  });
});

describe('ExecutionService runtime session close on terminal state', () => {
  const createService = () => {
    const prisma = {
      execution: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      executionStep: {
        findNextPendingStep: jest.fn(),
        findFirst: jest.fn(),
      },
      executionEvent: {
        create: jest.fn(),
      },
      runtimeSession: {
        findFirst: jest.fn(),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };

    const service = new ExecutionService(prisma as never, {} as never, {} as never, {} as never);
    const internals = service as any;
    jest.spyOn(internals, 'updateStatus').mockResolvedValue(undefined);
    jest.spyOn(internals, 'closeRuntimeSessionQuietly').mockResolvedValue(undefined);
    jest.spyOn(internals, 'skipPendingSteps').mockResolvedValue(undefined);

    return { service, prisma };
  };

  it('closes runtime session when execution has no pending step and is marked succeeded', async () => {
    const { service, prisma } = createService();
    prisma.execution.findUnique.mockResolvedValue({
      id: 'execution-terminal-1',
      status: EXECUTION_STATUS.RUNNING,
    });
    prisma.executionStep.findFirst.mockResolvedValue(null);

    await (service as any).advanceExecutionFlow('execution-terminal-1', 'runtime-terminal-1');

    expect((service as any).updateStatus).toHaveBeenCalledWith(
      'execution-terminal-1',
      EXECUTION_STATUS.SUCCEEDED,
    );
    expect((service as any).closeRuntimeSessionQuietly).toHaveBeenCalledWith(
      'runtime-terminal-1',
      'execution-terminal-1',
      'execution_succeeded',
    );
  });

  it('closes runtime session when runtime step failure marks execution failed', async () => {
    const { service, prisma } = createService();
    prisma.execution.update.mockResolvedValue(undefined);

    await (service as any).failExecutionFromRuntimeStep({
      executionId: 'execution-terminal-2',
      stepId: 'step-1',
      failureReason: 'boom',
      failureCode: 'ERR',
      runtimeSessionId: 'runtime-terminal-2',
    });

    expect(prisma.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-terminal-2' },
      data: {
        failureReason: 'boom',
        failureCode: 'ERR',
      },
    });
    expect((service as any).updateStatus).toHaveBeenCalledWith(
      'execution-terminal-2',
      EXECUTION_STATUS.FAILED,
    );
    expect((service as any).closeRuntimeSessionQuietly).toHaveBeenCalledWith(
      'runtime-terminal-2',
      'execution-terminal-2',
      'runtime_step_failed',
    );
  });
});

describe('ExecutionService.create planner draft reuse', () => {
  const createService = () => {
    const prisma = {
      execution: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      executionStep: {
        createMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      executionEvent: {
        create: jest.fn(),
      },
      runtimeSession: {
        findFirst: jest.fn(),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };

    const service = new ExecutionService(prisma as never, {} as never, {} as never, {} as never);
    const serviceInternals = service as any;
    jest.spyOn(serviceInternals, 'assertSkillAccessibleByUser').mockResolvedValue(undefined);
    jest.spyOn(serviceInternals, 'generatePlanDraft').mockResolvedValue(undefined);
    jest.spyOn(serviceInternals, 'createPlannedSteps').mockResolvedValue(undefined);
    jest.spyOn(serviceInternals, 'startExecution').mockResolvedValue(undefined);
    jest.spyOn(serviceInternals, 'getById').mockResolvedValue({ id: 'execution-create-1' });

    return { service, prisma };
  };

  it('reuses provided planDraft and skips planner callback during create', async () => {
    const { service, prisma } = createService();

    const providedPlanDraft = {
      plan_id: 'plan-1',
      planner_mode: 'skill',
      objective: 'query weather',
      summary: 'query weather via weather skill',
      skill_match: {
        skill_id: 'skill-1',
        skill_name: '天气查询',
        confidence: 0.99,
      },
      steps: [],
      required_inputs: [
        {
          name: 'city',
          type: 'string',
          required: false,
          value: '上海',
          missing: false,
          source: 'user_input',
        },
      ],
      risk_summary: {
        level: 'low',
        requires_human_review: false,
        items: ['no_material_risk_detected'],
      },
    };

    prisma.execution.create.mockResolvedValue({
      id: 'execution-create-1',
      requiresApproval: false,
      createdBy: 'user-1',
    });
    prisma.executionEvent.create.mockResolvedValue(undefined);

    await service.create(
      'user-1',
      {
        skillId: 'skill-1',
        runtimeType: 'workflow',
        input: { prompt: '上海的天气' },
        planDraft: providedPlanDraft,
      },
      {
        authToken: 'Bearer token-1',
      },
    );

    expect((service as any).generatePlanDraft).not.toHaveBeenCalled();
    expect(prisma.execution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        skillId: 'skill-1',
        runtimeType: 'workflow',
        status: 'queued',
      }),
    });
  });

  it('reuses existing execution when the same idempotencyKey is provided', async () => {
    const { service, prisma } = createService();

    const existingExecution = {
      id: 'execution-existing-1',
      createdBy: 'user-1',
      skillId: 'skill-1',
      status: 'succeeded',
    };

    prisma.$queryRawUnsafe.mockResolvedValue([
      { execution_id: 'execution-existing-1' },
    ]);
    jest.spyOn(service, 'getById').mockResolvedValue(existingExecution as never);

    const response = await service.create(
      'user-1',
      {
        skillId: 'skill-1',
        runtimeType: 'workflow',
        input: { prompt: '上海的天气' },
        idempotencyKey: 'full-smoke-fixed-key',
      },
      {
        authToken: 'Bearer token-1',
      },
    );

    expect(prisma.execution.create).not.toHaveBeenCalled();
    expect((service as any).generatePlanDraft).not.toHaveBeenCalled();
    expect(response).toBe(existingExecution);
  });
});
