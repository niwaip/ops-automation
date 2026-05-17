import { BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { APPROVAL_STATUS, EXECUTION_EVENT_TYPE, EXECUTION_STATUS, EXECUTION_STEP_STATUS } from '../src/modules/execution';
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

  it('refreshes semantic groupedMissing after partial submission', async () => {
    const { service, prisma } = createService();
    const executionWithSemantic = {
      ...baseExecution,
      normalizedInputJson: {
        input: {},
        requiredInputs: [
          {
            name: 'info.partyA',
            type: 'string',
            description: '甲方名称',
            required: true,
            missing: true,
            source: 'unresolved',
          },
          {
            name: 'info.partyB',
            type: 'string',
            description: '乙方名称',
            required: true,
            missing: true,
            source: 'unresolved',
          },
        ],
        semantic: {
          enabled: true,
          mode: 'field_level',
          previewReady: false,
          finalReady: false,
          fallbackToFieldLevel: true,
          summary: '文档仍缺少 2 个关键业务组。',
          groupedMissing: [
            {
              key: 'info.partyA',
              label: '甲方名称',
              kind: 'field',
              blocking: true,
              required: true,
              fieldNames: ['info.partyA'],
              missingFieldNames: ['info.partyA'],
              description: '请补充甲方名称',
            },
            {
              key: 'info.partyB',
              label: '乙方名称',
              kind: 'field',
              blocking: true,
              required: true,
              fieldNames: ['info.partyB'],
              missingFieldNames: ['info.partyB'],
              description: '请补充乙方名称',
            },
          ],
          complexity: {
            category: 'simple',
            totalFields: 2,
            requiredFields: 2,
            missingFields: 2,
            arrayGroups: 0,
            reasonCodes: [],
          },
        },
      },
    };
    const dto: SubmitInputDto = {
      stepId: 'step-1',
      input: {
        'info.partyA': '星海智造科技有限公司',
      },
    };
    const result = {
      id: 'execution-1',
      status: 'waiting_input',
    };

    prisma.execution.findUnique.mockResolvedValue(executionWithSemantic);
    prisma.executionStep.findUnique.mockResolvedValue(baseStep);
    prisma.execution.update.mockResolvedValue(undefined);
    prisma.executionStep.update.mockResolvedValue(undefined);
    prisma.executionEvent.create.mockResolvedValue(undefined);
    prisma.runtimeSession.findFirst.mockResolvedValue({ id: 'runtime-1' });
    jest.spyOn(service, 'getById').mockResolvedValue(result as never);

    await service.submitInputAndResume('execution-1', 'user-1', dto);

    expect(prisma.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-1' },
      data: {
        normalizedInputJson: expect.objectContaining({
          input: {
            'info.partyA': '星海智造科技有限公司',
          },
          requiredInputs: [
            expect.objectContaining({ name: 'info.partyA', missing: false }),
            expect.objectContaining({ name: 'info.partyB', missing: true }),
          ],
          semantic: expect.objectContaining({
            previewReady: false,
            finalReady: false,
            summary: '文档仍缺少 1 个关键业务组。',
            groupedMissing: [
              expect.objectContaining({
                key: 'info.partyB',
                missingFieldNames: ['info.partyB'],
              }),
            ],
            complexity: expect.objectContaining({
              missingFields: 1,
            }),
          }),
          'info.partyA': '星海智造科技有限公司',
        }),
        status: 'waiting_input',
      },
    });
  });

  it('keeps placeholder-like submitted values as missing inputs', async () => {
    const { service, prisma } = createService();
    const executionWithThreeRequiredInputs = {
      ...baseExecution,
      normalizedInputJson: {
        input: {},
        requiredInputs: [
          {
            name: 'otherTerms',
            type: 'string',
            required: true,
            missing: true,
            source: 'unresolved',
          },
          {
            name: 'installationCondition',
            type: 'string',
            required: true,
            missing: true,
            source: 'unresolved',
          },
          {
            name: 'deliveryItems[].installationDate',
            type: 'date',
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
        otherTerms: '无',
        installationCondition: '待补充',
        'deliveryItems[].installationDate': 'N/A',
      },
    };
    const result = {
      id: 'execution-1',
      status: 'waiting_input',
    };

    prisma.execution.findUnique.mockResolvedValue(executionWithThreeRequiredInputs);
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
            expect.objectContaining({ name: 'otherTerms', missing: true }),
            expect.objectContaining({ name: 'installationCondition', missing: true }),
            expect.objectContaining({ name: 'deliveryItems[].installationDate', missing: true }),
          ],
        },
        outputJson: {
          otherTerms: undefined,
          installationCondition: undefined,
          'deliveryItems[].installationDate': undefined,
        },
        endedAt: null,
      },
    });
    expect(prisma.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-1' },
      data: {
        normalizedInputJson: {
          input: {
            otherTerms: undefined,
            installationCondition: undefined,
            'deliveryItems[].installationDate': undefined,
          },
          requiredInputs: [
            expect.objectContaining({ name: 'otherTerms', missing: true, value: undefined, source: 'unresolved' }),
            expect.objectContaining({ name: 'installationCondition', missing: true, value: undefined, source: 'unresolved' }),
            expect.objectContaining({ name: 'deliveryItems[].installationDate', missing: true, value: undefined, source: 'unresolved' }),
          ],
          otherTerms: undefined,
          installationCondition: undefined,
          'deliveryItems[].installationDate': undefined,
        },
        status: 'waiting_input',
      },
    });
    expect((service as any).updateStatus).not.toHaveBeenCalled();
    expect((service as any).advanceExecutionFlow).not.toHaveBeenCalled();
    expect(response).toBe(result);
  });

  it('normalizes submitted date input before resuming execution', async () => {
    const { service, prisma } = createService();
    const executionWithDateInput = {
      ...baseExecution,
      normalizedInputJson: {
        input: {},
        requiredInputs: [
          {
            name: 'deliveryItems[].installationDate',
            type: 'date',
            required: true,
            missing: true,
            source: 'unresolved',
          },
        ],
      },
    };
    const result = {
      id: 'execution-1',
      status: 'running',
    };
    const dto: SubmitInputDto = {
      stepId: 'step-1',
      input: {
        'deliveryItems[].installationDate': '2025/6/7',
      },
    };

    prisma.execution.findUnique.mockResolvedValue(executionWithDateInput);
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
            'deliveryItems[].installationDate': '2025-06-07',
          },
          requiredInputs: [
            {
              name: 'deliveryItems[].installationDate',
              type: 'date',
              required: true,
              missing: false,
              source: 'user_input',
              value: '2025-06-07',
            },
          ],
          'deliveryItems[].installationDate': '2025-06-07',
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
          'deliveryItems[].installationDate': '2025-06-07',
        },
        endedAt: expect.any(Date),
      },
    });
    expect((service as any).updateStatus).toHaveBeenCalledWith('execution-1', 'running');
    expect((service as any).advanceExecutionFlow).toHaveBeenCalledWith('execution-1', 'runtime-1');
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

  it('does not block HTTP response on asynchronous advanceExecutionFlow after full submission', async () => {
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
    let resolveAdvance: (() => void) | undefined;
    const advancePromise = new Promise<void>((resolve) => {
      resolveAdvance = resolve;
    });

    prisma.execution.findUnique.mockResolvedValue(baseExecution);
    prisma.executionStep.findUnique.mockResolvedValue(baseStep);
    prisma.execution.update.mockResolvedValue(undefined);
    prisma.executionStep.update.mockResolvedValue(undefined);
    prisma.executionEvent.create.mockResolvedValue(undefined);
    prisma.runtimeSession.findFirst.mockResolvedValue({ id: 'runtime-1' });
    jest.spyOn(service, 'getById').mockResolvedValue(result as never);
    jest.spyOn(service as any, 'advanceExecutionFlow').mockReturnValue(advancePromise);

    const submitPromise = service.submitInputAndResume('execution-1', 'user-1', dto);
    const outcome = await Promise.race([
      submitPromise.then(() => 'resolved'),
      new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 20)),
    ]);

    expect(outcome).toBe('resolved');
    resolveAdvance?.();
    await advancePromise;
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
    jest.spyOn(internals, 'completeActivePhasesOnExecutionSuccess').mockResolvedValue(undefined);
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
    expect((service as any).completeActivePhasesOnExecutionSuccess).toHaveBeenCalledWith(
      'execution-terminal-1',
      'runtime-terminal-1',
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

  it('refreshes semantic snapshot when provided input already resolves grouped missing fields', async () => {
    const { service, prisma } = createService();

    const providedPlanDraft = {
      plan_id: 'plan-1',
      planner_mode: 'skill',
      objective: 'generate contract',
      summary: '仍缺少付款计划',
      skill_match: {
        skill_id: 'skill-1',
        skill_name: '采购合同',
        confidence: 0.99,
      },
      steps: [
        {
          id: 'collect-required-inputs',
          title: 'Collect required inputs',
          description: '补齐必填参数: paymentSchedule[].amount',
          kind: 'human_input',
          status: 'planned',
        },
      ],
      required_inputs: [
        {
          name: 'paymentSchedule[].amount',
          type: 'number',
          required: true,
          missing: true,
          source: 'unresolved',
          description: '付款金额',
        },
      ],
      semantic: {
        enabled: true,
        mode: 'complex_document',
        previewReady: false,
        finalReady: false,
        fallbackToFieldLevel: false,
        summary: '文档仍缺少 1 个关键业务组。',
        groupedMissing: [
          {
            key: 'paymentSchedule',
            label: '付款计划',
            kind: 'array_group',
            blocking: true,
            required: true,
            fieldNames: ['paymentSchedule[].amount'],
            missingFieldNames: ['paymentSchedule[].amount'],
            description: '请按业务组补充 付款计划',
          },
        ],
        complexity: {
          category: 'complex_document',
          totalFields: 1,
          requiredFields: 1,
          missingFields: 1,
          arrayGroups: 1,
          reasonCodes: ['array_group_threshold'],
        },
      },
      risk_summary: {
        level: 'medium',
        requires_human_review: false,
        items: ['missing_required_inputs'],
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
        input: { 'paymentSchedule[].amount': [1000] },
        planDraft: providedPlanDraft as any,
      },
      {
        authToken: 'Bearer token-1',
      },
    );

    expect(prisma.execution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        normalizedInputJson: expect.objectContaining({
          semantic: expect.objectContaining({
            previewReady: true,
            finalReady: true,
            groupedMissing: [],
            summary: '文档参数已满足最终渲染要求。',
            complexity: expect.objectContaining({
              missingFields: 0,
            }),
          }),
        }),
      }),
    });
  });

  it('rewrites browser recording planDraft into workflow activity phases during create', async () => {
    const { service, prisma } = createService();

    const providedPlanDraft = {
      plan_id: 'plan-browser-1',
      planner_mode: 'skill',
      objective: '登录并进入执行管理',
      summary: '已识别浏览器技能',
      skill_match: {
        skill_id: 'skill-browser-1',
        skill_name: '登录并进入登录',
        confidence: 1,
      },
      steps: [
        {
          id: 'raw-step-1',
          title: '1. navigate',
          description: '执行 1. navigate 步骤。',
          kind: 'tool',
          status: 'planned',
          tool_name: '1. navigate',
        },
      ],
      required_inputs: [
        {
          name: 'startUrl',
          type: 'string',
          required: true,
          value: 'http://example.test/login',
          missing: false,
          source: 'user_input',
        },
        {
          name: 'username',
          type: 'string',
          required: true,
          value: 'tester',
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

    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        source_type: 'browser_recording',
        source_payload_json: {},
        workflow_dsl: {
          steps: [
            {
              id: 'activity_open',
              name: '1. 页面打开',
              type: 'activity',
              activityRef: 'custom:browser_open',
              activityName: '1. 页面打开',
            },
            {
              id: 'activity_submit',
              name: '2. 页面迁移',
              type: 'activity',
              activityRef: 'custom:browser_submit',
              activityName: '2. 页面迁移',
            },
            {
              id: 'activity_nav',
              name: '3. 页面迁移',
              type: 'activity',
              activityRef: 'custom:browser_nav',
              activityName: '3. 页面迁移',
            },
          ],
        },
        activity_dsl: {
          activities: [
            {
              fn: 'browser_open',
              name: '1. 页面打开',
              handler: 'browser',
              config: {
                steps: [
                  {
                    name: '1. navigate',
                    type: 'browser',
                    config: {
                      action: 'navigate',
                      url: '${startUrl}',
                      target: '${startUrl}',
                    },
                  },
                  {
                    name: '2. fill',
                    type: 'browser',
                    config: {
                      action: 'fill',
                      selector: 'textbox[name="Enter username"]',
                      value: '${username}',
                    },
                  },
                ],
              },
            },
            {
              fn: 'browser_submit',
              name: '2. 页面迁移',
              handler: 'browser',
              config: {
                steps: [
                  {
                    name: '3. click',
                    type: 'browser',
                    config: {
                      action: 'click',
                      selector: 'button[type="submit"]',
                    },
                  },
                ],
              },
            },
            {
              fn: 'browser_nav',
              name: '3. 页面迁移',
              handler: 'browser',
              config: {
                steps: [
                  {
                    name: '4. wait for executions',
                    type: 'browser',
                    config: {
                      action: 'waitForSelector',
                      selector: 'menuitem[name="Executions"]',
                      timeoutMs: 15000,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ]);
    prisma.execution.create.mockResolvedValue({
      id: 'execution-create-1',
      requiresApproval: false,
      createdBy: 'user-1',
    });
    prisma.executionEvent.create.mockResolvedValue(undefined);

    await service.create(
      'user-1',
      {
        skillId: 'skill-browser-1',
        runtimeType: 'browser',
        input: {
          startUrl: 'http://example.test/login',
          username: 'tester',
        },
        planDraft: providedPlanDraft as any,
      },
      {
        authToken: 'Bearer token-1',
      },
    );

    const normalizedInput = prisma.execution.create.mock.calls[0][0].data.normalizedInputJson as Record<string, unknown>;
    const rewrittenSteps = normalizedInput.planSteps as Array<Record<string, unknown>>;
    expect(rewrittenSteps).toHaveLength(3);
    expect(rewrittenSteps[0]).toEqual(expect.objectContaining({
      title: '1. 页面打开',
      phase_type: 'workflow_activity',
    }));
    expect(rewrittenSteps[0].commands).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'goto',
        input: expect.objectContaining({
          target: 'http://example.test/login',
          args: expect.objectContaining({
            url: 'http://example.test/login',
          }),
        }),
      }),
      expect.objectContaining({
        action: 'fill',
        input: expect.objectContaining({
          target: 'textbox[name="Enter username"]',
          args: expect.objectContaining({
            selector: 'textbox[name="Enter username"]',
            value: 'tester',
          }),
        }),
      }),
    ]));
    expect(rewrittenSteps[2]).toEqual(expect.objectContaining({
      title: '3. 页面迁移',
      commands: [
        expect.objectContaining({
          action: 'wait',
          input: expect.objectContaining({
            target: 'menuitem[name="Executions"]',
            args: expect.objectContaining({
              selector: 'menuitem[name="Executions"]',
              duration: 15000,
            }),
          }),
        }),
      ],
    }));
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

describe('ExecutionService.cleanupBeforeDate', () => {
  const createService = () => {
    const prisma = {
      execution: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      executionStep: {
        deleteMany: jest.fn(),
      },
      executionEvent: {
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };

    const service = new ExecutionService(prisma as never, {} as never, {} as never, {} as never);
    return { service, prisma };
  };

  it('deletes executions created before the cutoff for the current user', async () => {
    const { service, prisma } = createService();
    prisma.execution.findMany.mockResolvedValue([
      { id: 'execution-old-1' },
      { id: 'execution-old-2' },
    ]);
    prisma.executionStep.deleteMany.mockResolvedValue({ count: 2 });
    prisma.executionEvent.deleteMany.mockResolvedValue({ count: 2 });
    prisma.execution.deleteMany.mockResolvedValue({ count: 2 });

    const result = await service.cleanupBeforeDate('2026-05-13', 'user-1', { id: 'user-1', role: 'employee' } as any);

    expect(prisma.execution.findMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: new Date('2026-05-13T00:00:00') },
        createdBy: 'user-1',
      },
      select: { id: true },
    });
    expect(prisma.executionStep.deleteMany).toHaveBeenCalledWith({
      where: { executionId: { in: ['execution-old-1', 'execution-old-2'] } },
    });
    expect(prisma.executionEvent.deleteMany).toHaveBeenCalledWith({
      where: { executionId: { in: ['execution-old-1', 'execution-old-2'] } },
    });
    expect(prisma.execution.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['execution-old-1', 'execution-old-2'] } },
    });
    expect(result).toEqual({
      success: true,
      deletedCount: 2,
      beforeDate: '2026-05-13',
    });
  });
});

describe('ExecutionService.getById with phases', () => {
  it('includes phase data from executionPhaseService in execution dto', async () => {
    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'execution-1',
          createdBy: 'user-1',
          skillId: 'skill-1',
          status: 'running',
          runtimeType: 'browser',
          riskLevel: 'L0',
          requiresApproval: false,
          takeoverRequired: false,
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          updatedAt: new Date('2026-05-01T00:00:00.000Z'),
        }),
      },
      runtimeSession: {
        findFirst: jest.fn().mockResolvedValue({ id: 'runtime-1' }),
      },
    };

    const executionPhaseService = {
      listByExecutionId: jest.fn().mockResolvedValue([
        {
          id: 'phase-1',
          executionId: 'execution-1',
          phaseKey: 'phase_login',
          phaseName: '登录阶段',
          phaseType: 'browser_login',
          status: 'running',
          attempt: 1,
          runtimeSessionId: 'runtime-1',
          inputJson: { username: 'test' },
          outputJson: null,
          precheckJson: { matched: false },
          postcheckJson: null,
          recoveryDecisionJson: null,
          errorCode: null,
          errorMessage: null,
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          updatedAt: new Date('2026-05-01T00:00:00.000Z'),
          artifacts: [],
          takeovers: [],
        },
      ]),
    };

    const service = new ExecutionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      executionPhaseService as never,
    );

    const dto = await service.getById('execution-1', { id: 'user-1' });

    expect(executionPhaseService.listByExecutionId).toHaveBeenCalledWith('execution-1');
    expect(dto.runtimeSessionId).toBe('runtime-1');
    expect(dto.phases).toHaveLength(1);
    expect(dto.phases?.[0]).toEqual(
      expect.objectContaining({
        phaseKey: 'phase_login',
        phaseName: '登录阶段',
        phaseType: 'browser_login',
      }),
    );
  });
});

describe('ExecutionService.getPhases', () => {
  it('returns mapped phases after permission check', async () => {
    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'execution-1',
          createdBy: 'user-1',
        }),
      },
    };

    const executionPhaseService = {
      listByExecutionId: jest.fn().mockResolvedValue([
        {
          id: 'phase-1',
          execution_id: 'execution-1',
          phase_key: 'phase_login',
          phase_name: '登录阶段',
          phase_type: 'browser_login',
          status: 'running',
          attempt: 1,
          runtime_session_id: 'runtime-1',
          created_at: new Date('2026-05-01T00:00:00.000Z'),
          updated_at: new Date('2026-05-01T00:00:00.000Z'),
          artifacts: [],
          takeovers: [],
        },
      ]),
    };

    const service = new ExecutionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      executionPhaseService as never,
    );

    const phases = await service.getPhases('execution-1', { id: 'user-1' });

    expect(executionPhaseService.listByExecutionId).toHaveBeenCalledWith('execution-1');
    expect(phases).toEqual([
      expect.objectContaining({
        phaseKey: 'phase_login',
        phaseName: '登录阶段',
        phaseType: 'browser_login',
      }),
    ]);
  });
});

describe('ExecutionService phase sync during system execution', () => {
  it('marks phase running and completed when system step succeeds', async () => {
    const prisma = {
      execution: {
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const runtimeExecutionOrchestrator = {
      executeStep: jest.fn().mockResolvedValue({
        success: true,
        status: 'completed',
        output: { result: 'ok' },
        rawResult: {
          runtime: 'capability_runtime',
          releaseId: 'release-1',
          capabilityId: 'capability-1',
          publishedSkillId: 'published-skill-1',
          logs: [],
        },
      }),
    };
    const runtimeResultInterpreter = {
      handleSkillRuntimeResult: jest.fn().mockResolvedValue(undefined),
      handleBrowserStepResult: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeStepRequestFactory = {
      resolveExecutionCapabilityId: jest.fn().mockReturnValue('capability-1'),
      resolveExecutionCapabilityVersion: jest.fn().mockReturnValue('v1'),
      resolveExecutionInput: jest.fn().mockReturnValue({ username: 'test' }),
      buildSkillRuntimeRequest: jest.fn().mockReturnValue({
        requestId: 'req-1',
        executionId: 'execution-1',
        stepId: 'step-1',
        runtimeType: 'custom',
        runtimeSessionId: 'runtime-1',
        capabilityType: 'skill.runtime',
        action: 'execute',
        input: { username: 'test' },
      }),
    };
    const executionPhaseService = {
      listByExecutionId: jest.fn(),
      markRunning: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
      replaceArtifacts: jest.fn().mockResolvedValue(undefined),
      replaceSteps: jest.fn().mockResolvedValue(undefined),
    };
    const executionStepService = {
      getById: jest.fn().mockResolvedValue({
        id: 'step-1',
        type: 'system',
        action: 'execute_skill',
        targetJson: {
          phaseKey: 'phase_01_login_skill',
          phaseName: '登录并进入主页',
          phaseType: 'system_skill',
        },
        inputJson: {
          description: '执行登录技能',
        },
      }),
      setCurrentStep: jest.fn().mockResolvedValue(undefined),
      startStep: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionService(
      prisma as never,
      runtimeExecutionOrchestrator as never,
      runtimeResultInterpreter as never,
      runtimeStepRequestFactory as never,
      undefined,
      executionPhaseService as never,
      undefined,
      executionStepService as never,
    );
    jest.spyOn(service as any, 'createEvent').mockResolvedValue(undefined);

    await (service as any).executeSystemSkillStep(
      { id: 'execution-1', skillId: 'skill-1', runtimeType: 'browser' },
      'runtime-1',
      'step-1',
    );

    expect(executionPhaseService.markRunning).toHaveBeenCalledWith(
      'execution-1',
      'phase_01_login_skill',
      expect.objectContaining({
        phaseName: '登录并进入主页',
        phaseType: 'system_skill',
      }),
    );
    expect(executionPhaseService.markCompleted).toHaveBeenCalledWith(
      'execution-1',
      'phase_01_login_skill',
      expect.objectContaining({
        phaseName: '登录并进入主页',
        phaseType: 'system_skill',
      }),
    );
    expect(executionPhaseService.replaceSteps).toHaveBeenCalledWith(
      'execution-1',
      'phase_01_login_skill',
      [],
    );
    expect(executionPhaseService.createOrUpdatePhase).not.toHaveBeenCalled();
  });

  it('persists skill runtime phase steps extracted from nested phase results', async () => {
    const prisma = {
      execution: {
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const runtimeExecutionOrchestrator = {
      executeStep: jest.fn().mockResolvedValue({
        success: true,
        status: 'completed',
        output: { result: 'ok' },
        rawResult: {
          runtime: 'capability_runtime',
          releaseId: 'release-1',
          capabilityId: 'capability-1',
          publishedSkillId: 'published-skill-1',
          logs: [],
          output: {
            phaseResults: [
              {
                stepName: '打开搜索页',
                result: {
                  results: [
                    {
                      stepId: 'goto-1',
                      action: 'goto',
                      status: 'success',
                      input: {
                        url: 'https://example.com',
                      },
                      output: {
                        pageUrl: 'https://example.com',
                      },
                      snapshot: {
                        id: 'snapshot-1',
                      },
                    },
                    {
                      stepId: 'click-1',
                      action: 'click',
                      status: 'completed',
                      input: {
                        target: 'text=Search',
                      },
                      output: {
                        clicked: true,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      }),
    };
    const runtimeResultInterpreter = {
      handleSkillRuntimeResult: jest.fn().mockResolvedValue(undefined),
      handleBrowserStepResult: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeStepRequestFactory = {
      resolveExecutionCapabilityId: jest.fn().mockReturnValue('capability-1'),
      resolveExecutionCapabilityVersion: jest.fn().mockReturnValue('v1'),
      resolveExecutionInput: jest.fn().mockReturnValue({ username: 'test' }),
      buildSkillRuntimeRequest: jest.fn().mockReturnValue({
        requestId: 'req-1',
        executionId: 'execution-1',
        stepId: 'step-1',
        runtimeType: 'custom',
        runtimeSessionId: 'runtime-1',
        capabilityType: 'skill.runtime',
        action: 'execute',
        input: { username: 'test' },
      }),
    };
    const executionPhaseService = {
      listByExecutionId: jest.fn(),
      markRunning: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
      replaceArtifacts: jest.fn().mockResolvedValue(undefined),
      replaceSteps: jest.fn().mockResolvedValue(undefined),
    };
    const executionStepService = {
      getById: jest.fn().mockResolvedValue({
        id: 'step-1',
        type: 'system',
        action: 'execute_skill',
        targetJson: {
          phaseKey: 'phase_01_execute_skill',
          phaseName: '执行技能',
          phaseType: 'system_skill',
        },
        inputJson: {
          description: '执行技能并提取内部步骤',
        },
      }),
      setCurrentStep: jest.fn().mockResolvedValue(undefined),
      startStep: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionService(
      prisma as never,
      runtimeExecutionOrchestrator as never,
      runtimeResultInterpreter as never,
      runtimeStepRequestFactory as never,
      undefined,
      executionPhaseService as never,
      undefined,
      executionStepService as never,
    );
    jest.spyOn(service as any, 'createEvent').mockResolvedValue(undefined);

    await (service as any).executeSystemSkillStep(
      { id: 'execution-1', skillId: 'skill-1', runtimeType: 'browser' },
      'runtime-1',
      'step-1',
    );

    expect(executionPhaseService.replaceSteps).toHaveBeenCalledWith(
      'execution-1',
      'phase_01_execute_skill',
      [
        expect.objectContaining({
          stepIndex: 1,
          stepId: 'goto-1',
          action: 'goto',
          status: 'completed',
          snapshotId: 'snapshot-1',
          input: {
            url: 'https://example.com',
          },
          output: {
            pageUrl: 'https://example.com',
          },
        }),
        expect.objectContaining({
          stepIndex: 2,
          stepId: 'click-1',
          action: 'click',
          status: 'completed',
          input: {
            target: 'text=Search',
          },
          output: {
            clicked: true,
          },
        }),
      ],
    );
  });

  it('prebuilds workflow activity phases before skill runtime finishes', async () => {
    const prisma = {
      execution: {
        update: jest.fn().mockResolvedValue(undefined),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        {
          source_payload_json: {
            workflowDsl: {
              steps: [
                {
                  id: 'activity-step-1',
                  type: 'activity',
                  name: '打开登录页',
                  activityName: 'open_login_page',
                },
                {
                  id: 'activity-step-2',
                  type: 'activity',
                  name: '提交登录',
                  activityName: 'submit_login_form',
                },
              ],
            },
          },
        },
      ]),
    };
    const runtimeExecutionOrchestrator = {
      executeStep: jest.fn().mockResolvedValue({
        success: true,
        status: 'completed',
        output: {
          phaseResults: [
            {
              stepName: '打开登录页',
              activityName: 'open_login_page',
              result: {
                status: 'completed',
                results: [{ action: 'goto', status: 'success' }],
              },
            },
            {
              stepName: '提交登录',
              activityName: 'submit_login_form',
              result: {
                status: 'completed',
                results: [{ action: 'click', status: 'success' }],
              },
            },
          ],
        },
        rawResult: {
          runtime: 'capability_runtime',
          releaseId: 'release-1',
          capabilityId: 'published-skill-1',
          publishedSkillId: 'published-skill-1',
          logs: [],
          output: {
            phaseResults: [
              {
                stepName: '打开登录页',
                activityName: 'open_login_page',
                result: {
                  status: 'completed',
                  results: [{ action: 'goto', status: 'success' }],
                },
              },
              {
                stepName: '提交登录',
                activityName: 'submit_login_form',
                result: {
                  status: 'completed',
                  results: [{ action: 'click', status: 'success' }],
                },
              },
            ],
          },
        },
      }),
    };
    const runtimeResultInterpreter = {
      handleSkillRuntimeResult: jest.fn().mockResolvedValue(undefined),
      handleBrowserStepResult: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeStepRequestFactory = {
      resolveExecutionCapabilityId: jest.fn().mockReturnValue('published-skill-1'),
      resolveExecutionCapabilityVersion: jest.fn().mockReturnValue('v1'),
      resolveExecutionInput: jest.fn().mockReturnValue({ username: 'test' }),
      buildSkillRuntimeRequest: jest.fn().mockReturnValue({
        requestId: 'req-1',
        executionId: 'execution-1',
        stepId: 'step-1',
        runtimeType: 'custom',
        runtimeSessionId: 'runtime-1',
        capabilityType: 'skill.runtime',
        action: 'execute',
        input: { username: 'test' },
      }),
    };
    const executionPhaseService = {
      listByExecutionId: jest.fn(),
      markRunning: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
      replaceArtifacts: jest.fn().mockResolvedValue(undefined),
      replaceSteps: jest.fn().mockResolvedValue(undefined),
    };
    const executionStepService = {
      getById: jest.fn().mockResolvedValue({
        id: 'step-1',
        type: 'system',
        action: 'execute_skill',
        targetJson: {
          phaseKey: 'phase_01_execute_skill',
          phaseName: '执行技能',
          phaseType: 'system_skill',
        },
        inputJson: {
          description: '执行技能并实时展示 activity',
        },
      }),
      setCurrentStep: jest.fn().mockResolvedValue(undefined),
      startStep: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionService(
      prisma as never,
      runtimeExecutionOrchestrator as never,
      runtimeResultInterpreter as never,
      runtimeStepRequestFactory as never,
      undefined,
      executionPhaseService as never,
      undefined,
      executionStepService as never,
    );
    jest.spyOn(service as any, 'createEvent').mockResolvedValue(undefined);

    await (service as any).executeSystemSkillStep(
      { id: 'execution-1', skillId: 'published-skill-1', runtimeType: 'browser' },
      'runtime-1',
      'step-1',
    );

    expect(executionPhaseService.createOrUpdatePhase).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: 'execution-1',
        phaseKey: 'phase_01_execute_skill__activity_02_submit_login_form',
        phaseName: '提交登录',
        phaseType: 'workflow_activity',
        status: 'pending',
      }),
    );
    expect(executionPhaseService.markRunning.mock.calls).toEqual(
      expect.arrayContaining([
        [
          'execution-1',
          'phase_01_execute_skill__activity_01_open_login_page',
          expect.objectContaining({
            phaseName: '打开登录页',
            phaseType: 'workflow_activity',
            runtimeSessionId: 'runtime-1',
          }),
        ],
      ]),
    );
    expect(executionPhaseService.markCompleted.mock.calls).toEqual(
      expect.arrayContaining([
        [
          'execution-1',
          'phase_01_execute_skill__activity_01_open_login_page',
          expect.objectContaining({
            phaseName: '打开登录页',
            phaseType: 'workflow_activity',
          }),
        ],
        [
          'execution-1',
          'phase_01_execute_skill__activity_02_submit_login_form',
          expect.objectContaining({
            phaseName: '提交登录',
            phaseType: 'workflow_activity',
          }),
        ],
      ]),
    );
  });

  it('updates current workflow activity while skill runtime is still running', async () => {
    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'execution-1',
          createdBy: 'user-1',
        }),
      },
    };
    const executionPhaseService = {
      listByExecutionId: jest.fn().mockResolvedValue([
        {
          phase_key: 'phase_01_execute_skill__activity_01_open',
          phase_name: '1. 页面打开',
          phase_type: 'workflow_activity',
          status: 'running',
          attempt: 1,
          runtime_session_id: 'runtime-1',
          input_json: {
            parentPhaseKey: 'phase_01_execute_skill',
            order: 1,
          },
          output_json: null,
          started_at: new Date('2026-05-16T07:00:00.000Z'),
        },
        {
          phase_key: 'phase_01_execute_skill__activity_02_process',
          phase_name: '2. 页面处理',
          phase_type: 'workflow_activity',
          status: 'pending',
          attempt: 1,
          runtime_session_id: 'runtime-1',
          input_json: {
            parentPhaseKey: 'phase_01_execute_skill',
            order: 2,
          },
          output_json: null,
          started_at: null,
        },
      ]),
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      executionPhaseService as never,
      undefined,
      {} as never,
    );

    await service.updateWorkflowActivityProgress(
      'execution-1',
      {
        parentPhaseKey: 'phase_01_execute_skill',
        activityOrder: 2,
        activityName: '2. 页面处理',
        runtimeSessionId: 'runtime-1',
      },
      { id: 'user-1' },
    );

    expect(executionPhaseService.createOrUpdatePhase).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        executionId: 'execution-1',
        phaseKey: 'phase_01_execute_skill__activity_01_open',
        status: 'completed',
      }),
    );
    expect(executionPhaseService.createOrUpdatePhase).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        executionId: 'execution-1',
        phaseKey: 'phase_01_execute_skill__activity_02_process',
        status: 'running',
        runtimeSessionId: 'runtime-1',
      }),
    );
  });

  it('marks the currently running workflow activity as failed when skill runtime fails without phaseResults', async () => {
    const prisma = {};
    const executionPhaseService = {
      listByExecutionId: jest.fn().mockResolvedValue([
        {
          phase_key: 'phase_01_execute_skill__activity_01_open',
          phase_name: '1. 页面打开',
          phase_type: 'workflow_activity',
          status: 'completed',
          input_json: {
            parentPhaseKey: 'phase_01_execute_skill',
            order: 1,
          },
        },
        {
          phase_key: 'phase_01_execute_skill__activity_02_process',
          phase_name: '2. 页面处理',
          phase_type: 'workflow_activity',
          status: 'running',
          input_json: {
            parentPhaseKey: 'phase_01_execute_skill',
            order: 2,
          },
        },
      ]),
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      executionPhaseService as never,
      undefined,
      {} as never,
    );

    jest.spyOn(service as any, 'loadWorkflowActivityPhaseDefinitions').mockResolvedValue([
      {
        phaseKey: 'phase_01_execute_skill__activity_01_open',
        phaseName: '1. 页面打开',
        phaseType: 'workflow_activity',
        activityName: '1. 页面打开',
        parentPhaseKey: 'phase_01_execute_skill',
        order: 1,
      },
      {
        phaseKey: 'phase_01_execute_skill__activity_02_process',
        phaseName: '2. 页面处理',
        phaseType: 'workflow_activity',
        activityName: '2. 页面处理',
        parentPhaseKey: 'phase_01_execute_skill',
        order: 2,
      },
    ]);

    await (service as any).syncWorkflowActivityPhasesAfterSkillResult(
      'execution-1',
      'runtime-1',
      'published-skill-1',
      {
        success: false,
        status: 'failed',
        errorCode: 'CAPABILITY_RUNTIME_FAILED',
        errorMessage: 'browser-worker 执行失败',
        output: {
          temporalLink: 'http://temporal.local/workflow/1',
        },
        rawResult: {
          output: {
            temporalLink: 'http://temporal.local/workflow/1',
          },
        },
      },
      {
        phaseKey: 'phase_01_execute_skill',
        phaseName: '执行技能',
        phaseType: 'system_skill',
      },
    );

    expect(executionPhaseService.createOrUpdatePhase).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: 'execution-1',
        phaseKey: 'phase_01_execute_skill__activity_02_process',
        phaseName: '2. 页面处理',
        status: 'failed',
        errorCode: 'CAPABILITY_RUNTIME_FAILED',
      }),
    );
  });

  it('marks workflow activity as waiting_takeover when phaseResults return takeover_required', async () => {
    const prisma = {};
    const executionPhaseService = {
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      replaceArtifacts: jest.fn().mockResolvedValue(undefined),
      replaceSteps: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      executionPhaseService as never,
      undefined,
      {} as never,
    );

    jest.spyOn(service as any, 'loadWorkflowActivityPhaseDefinitions').mockResolvedValue([
      {
        phaseKey: 'phase_01_execute_skill__activity_01_open',
        phaseName: '1. 页面打开',
        phaseType: 'workflow_activity',
        activityName: '1. 页面打开',
        parentPhaseKey: 'phase_01_execute_skill',
        order: 1,
      },
      {
        phaseKey: 'phase_01_execute_skill__activity_02_process',
        phaseName: '2. 页面处理',
        phaseType: 'workflow_activity',
        activityName: '2. 页面处理',
        parentPhaseKey: 'phase_01_execute_skill',
        order: 2,
      },
    ]);

    await (service as any).syncWorkflowActivityPhasesAfterSkillResult(
      'execution-1',
      'runtime-1',
      'published-skill-1',
      {
        success: false,
        status: 'takeover_required',
        errorCode: 'BROWSER_WORKER_EXECUTION_FAILED',
        errorMessage: '浏览器页面未进入预期状态',
        requiresTakeover: true,
        output: {
          phaseResults: [
            {
              result: {
                status: 'completed',
                results: [{ status: 'success', command: 'navigate' }],
              },
              stepName: '1. 页面打开',
              activityName: '1. 页面打开',
            },
            {
              result: {
                status: 'takeover_required',
                errorCode: 'BROWSER_WORKER_EXECUTION_FAILED',
                errorMessage: '浏览器页面未进入预期状态',
                results: [{ status: 'error', command: 'fill', message: 'selector not found' }],
              },
              stepName: '2. 页面处理',
              activityName: '2. 页面处理',
            },
          ],
        },
      },
      {
        phaseKey: 'phase_01_execute_skill',
        phaseName: '执行技能',
        phaseType: 'system_skill',
      },
    );

    expect(executionPhaseService.markCompleted).toHaveBeenCalledWith(
      'execution-1',
      'phase_01_execute_skill__activity_01_open',
      expect.objectContaining({
        phaseName: '1. 页面打开',
      }),
    );
    expect(executionPhaseService.createOrUpdatePhase).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: 'execution-1',
        phaseKey: 'phase_01_execute_skill__activity_02_process',
        phaseName: '2. 页面处理',
        status: 'waiting_takeover',
        errorCode: 'BROWSER_WORKER_EXECUTION_FAILED',
        errorMessage: '浏览器页面未进入预期状态',
        completedAt: null,
      }),
    );
  });
});

describe('ExecutionService browser phase execution', () => {
  it('routes execute_browser_phase planner steps through BrowserPhaseExecutor in the main flow', async () => {
    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'execution-1',
          status: EXECUTION_STATUS.RUNNING,
        }),
      },
    };
    const executionStepService = {
      findNextPendingStep: jest.fn().mockResolvedValue({
        id: 'step-browser-phase',
        type: 'system',
        action: 'execute_browser_phase',
      }),
    };

    const service = new ExecutionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      executionStepService as never,
    );
    jest.spyOn(service as any, 'executeBrowserPhaseStep').mockResolvedValue(undefined);

    await (service as any).advanceExecutionFlow('execution-1', 'runtime-1');

    expect((service as any).executeBrowserPhaseStep).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'execution-1' }),
      'runtime-1',
      'step-browser-phase',
    );
  });

  it('reuses browser phase commands/precheck/postcheck/recovery policy when executing planner step', async () => {
    const browserPhaseExecutor = {
      execute: jest.fn().mockResolvedValue({
        success: true,
        status: 'completed',
        stepResults: [
          {
            success: true,
            status: 'completed',
            output: { clicked: true },
          },
        ],
        output: {
          completedCommands: 2,
        },
      }),
    };
    const executionStepService = {
      getById: jest.fn().mockResolvedValue({
        id: 'step-browser-phase',
        name: '登录阶段',
        type: 'system',
        action: 'execute_browser_phase',
        targetJson: {
          plannerStepId: 'planner-step-1',
          plannerKind: 'tool',
          phaseKey: 'phase_login',
          phaseName: '登录阶段',
          phaseType: 'browser_phase',
          commands: [
            {
              stepId: 'cmd-fill-username',
              capabilityType: 'browser.step',
              action: 'fill',
              input: {
                target: 'username-input',
                value: '${username}',
              },
            },
            {
              stepId: 'cmd-click-submit',
              capabilityType: 'browser.step',
              action: 'click',
              input: {
                target: 'submit-button',
              },
            },
          ],
          precheck: {
            selectorExists: '#login-form',
          },
          postcheck: {
            pageUrlIncludes: '/dashboard',
          },
          recoveryPolicy: {
            maxAutoRetries: 2,
            allowAiRecovery: true,
            allowHumanTakeover: true,
            modelId: 'gpt-5.4',
          },
        },
        inputJson: {
          description: '复用模板中的登录 phase commands',
          plannerStatus: 'planned',
          commands: [
            {
              stepId: 'cmd-fill-username',
              capabilityType: 'browser.step',
              action: 'fill',
              input: {
                target: 'username-input',
                value: '${username}',
              },
            },
          ],
          precheck: {
            selectorExists: '#login-form',
          },
          postcheck: {
            pageUrlIncludes: '/dashboard',
          },
          recoveryPolicy: {
            maxAutoRetries: 2,
            allowAiRecovery: true,
            allowHumanTakeover: true,
            modelId: 'gpt-5.4',
          },
        },
      }),
      setCurrentStep: jest.fn().mockResolvedValue(undefined),
      startStep: jest.fn().mockResolvedValue(undefined),
      finishRuntimeStep: jest.fn().mockResolvedValue(undefined),
      markStepWaiting: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      executionStepService as never,
      browserPhaseExecutor as never,
    );
    jest.spyOn(service as any, 'createEvent').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'advanceExecutionFlow').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'enterRuntimeWaitingInput').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'enterPendingApprovalFromRuntimeStep').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'failExecutionFromRuntimeStep').mockResolvedValue(undefined);

    await (service as any).executeBrowserPhaseStep(
      {
        id: 'execution-1',
        skillId: 'skill-login',
        createdBy: 'user-1',
        riskLevel: 'L1',
        requiresApproval: false,
      },
      'runtime-1',
      'step-browser-phase',
    );

    expect(browserPhaseExecutor.execute).toHaveBeenCalledWith({
      executionId: 'execution-1',
      phaseKey: 'phase_login',
      phaseName: '登录阶段',
      phaseType: 'browser_phase',
      runtimeSessionId: 'runtime-1',
      skillId: 'skill-login',
      publishedSkillId: 'skill-login',
      runtimeType: 'browser',
      policyContext: {
        riskLevel: 'L1',
        requiresApproval: false,
      },
      traceContext: {
        userId: 'user-1',
        actorType: 'system',
        sourceService: 'control-plane',
      },
      commands: [
        {
          stepId: 'cmd-fill-username',
          capabilityType: 'browser.step',
          action: 'fill',
          input: {
            target: 'username-input',
            value: '${username}',
          },
          metadata: undefined,
        },
        {
          stepId: 'cmd-click-submit',
          capabilityType: 'browser.step',
          action: 'click',
          input: {
            target: 'submit-button',
          },
          metadata: undefined,
        },
      ],
      input: {
        description: '复用模板中的登录 phase commands',
        plannerStatus: 'planned',
      },
      precheck: {
        selectorExists: '#login-form',
      },
      postcheck: {
        pageUrlIncludes: '/dashboard',
      },
      recoveryPolicy: {
        maxAutoRetries: 2,
        allowAiRecovery: true,
        allowHumanTakeover: true,
        modelId: 'gpt-5.4',
      },
    });
    expect(executionStepService.finishRuntimeStep).toHaveBeenCalledWith(
      'step-browser-phase',
      expect.objectContaining({
        success: true,
        takeoverTriggered: false,
        outputJson: expect.objectContaining({
          status: 'completed',
          output: {
            completedCommands: 2,
          },
        }),
      }),
    );
    expect((service as any).advanceExecutionFlow).toHaveBeenCalledWith('execution-1', 'runtime-1');
    expect((service as any).failExecutionFromRuntimeStep).not.toHaveBeenCalled();
  });

  it('takes over browser phase failures instead of failing execution when phase result requires takeover', async () => {
    const browserPhaseExecutor = {
      execute: jest.fn().mockResolvedValue({
        success: false,
        status: 'takeover_required',
        stepResults: [],
        output: {
          failedAction: 'click',
        },
        errorCode: 'STEP_EXECUTION_ERROR',
        errorMessage: 'selector not found',
        requiresTakeover: true,
        takeoverReason: 'selector not found',
      }),
    };
    const executionStepService = {
      getById: jest.fn().mockResolvedValue({
        id: 'step-browser-phase',
        name: '迁移阶段',
        type: 'system',
        action: 'execute_browser_phase',
        targetJson: {
          phaseKey: 'phase_migrate',
          phaseName: '迁移阶段',
          phaseType: 'workflow_activity',
          commands: [
            {
              stepId: 'cmd-click-menu',
              capabilityType: 'browser.step',
              action: 'click',
              input: {
                target: 'menuitem[name="play-circle Executions"]',
              },
            },
          ],
          recoveryPolicy: {
            maxAutoRetries: 1,
            allowHumanTakeover: true,
          },
        },
        inputJson: {
          description: '执行迁移阶段',
        },
      }),
      setCurrentStep: jest.fn().mockResolvedValue(undefined),
      startStep: jest.fn().mockResolvedValue(undefined),
      finishRuntimeStep: jest.fn().mockResolvedValue(undefined),
      markStepWaiting: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      executionStepService as never,
      browserPhaseExecutor as never,
    );
    jest.spyOn(service as any, 'createEvent').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'advanceExecutionFlow').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'enterRuntimeWaitingInput').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'enterPendingApprovalFromRuntimeStep').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'failExecutionFromRuntimeStep').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'takeover').mockResolvedValue(undefined);

    await (service as any).executeBrowserPhaseStep(
      {
        id: 'execution-1',
        skillId: 'skill-login',
        createdBy: 'user-1',
        riskLevel: 'L1',
        requiresApproval: false,
      },
      'runtime-1',
      'step-browser-phase',
    );

    expect(executionStepService.finishRuntimeStep).toHaveBeenCalledWith(
      'step-browser-phase',
      expect.objectContaining({
        success: false,
        takeoverTriggered: true,
        errorCode: 'STEP_EXECUTION_ERROR',
        errorMessage: 'selector not found',
        outputJson: expect.objectContaining({
          status: 'takeover_required',
          requiresTakeover: true,
          takeoverReason: 'selector not found',
        }),
      }),
    );
    expect((service as any).takeover).toHaveBeenCalledWith(
      'execution-1',
      'system',
      {
        reason: 'selector not found',
      },
      {
        id: 'system',
        role: 'admin',
      },
    );
    expect((service as any).failExecutionFromRuntimeStep).not.toHaveBeenCalled();
    expect((service as any).advanceExecutionFlow).not.toHaveBeenCalled();
  });

  it('persists browser phase stepResults to execution result when phase succeeds', async () => {
    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue({
          resultJson: {
            temporalLink: 'https://temporal.example/workflow/1',
          },
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const executionStepService = {
      finishRuntimeStep: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      executionStepService as never,
    );
    jest.spyOn(service as any, 'createEvent').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'advanceExecutionFlow').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'takeover').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'failExecutionFromRuntimeStep').mockResolvedValue(undefined);

    await (service as any).handleBrowserPhaseStepResult(
      'execution-1',
      'runtime-1',
      'step-browser-phase',
      {
        success: true,
        status: 'completed',
        output: {
          command: 'wait',
          pageUrl: 'http://localhost:5173/dashboard',
        },
        stepResults: [
          {
            stepId: '3__command_03',
            command: 'screenshot',
            output: {
              command: 'screenshot',
              screenshot: 'data:image/png;base64,AAA',
            },
          },
        ],
        artifacts: [
          {
            type: 'browser_artifact',
            id: 'snapshot-1',
            metadata: {
              artifactPath: '/tmp/snapshot-1.png',
            },
          },
        ],
        snapshotId: 'snapshot-1',
        pageUrl: 'http://localhost:5173/dashboard',
        pageFingerprint: 'fingerprint-1',
      },
    );

    expect(prisma.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-1' },
      data: {
        resultJson: expect.objectContaining({
          temporalLink: 'https://temporal.example/workflow/1',
          status: 'completed',
          runtimeSessionId: 'runtime-1',
          backend: 'browser',
          stepResults: [
            expect.objectContaining({
              stepId: '3__command_03',
              command: 'screenshot',
              output: expect.objectContaining({
                screenshot: 'data:image/png;base64,AAA',
              }),
            }),
          ],
          artifacts: [
            expect.objectContaining({
              id: 'snapshot-1',
            }),
          ],
        }),
      },
    });
    expect((service as any).advanceExecutionFlow).toHaveBeenCalledWith('execution-1', 'runtime-1');
  });
});

describe('ExecutionService phase takeover lifecycle', () => {
  beforeEach(() => {
    mockedAxios.post.mockReset();
    mockedAxios.post.mockResolvedValue({ data: {} } as never);
  });

  it('requests phase takeover and freezes runtime session', async () => {
    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'execution-1',
          createdBy: 'user-1',
          status: 'running',
          currentPhaseKey: 'phase_login',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      runtimeSession: {
        findFirst: jest.fn().mockResolvedValue({ id: 'runtime-1' }),
      },
      executionEvent: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $executeRawUnsafe: jest.fn(),
    };
    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue({
        id: 'phase-1',
        phase_key: 'phase_login',
        phase_name: '登录阶段',
        phase_type: 'browser_login',
        status: 'running',
        attempt: 1,
        runtime_session_id: 'runtime-1',
        output_json: null,
        postcheck_json: null,
        error_code: null,
        error_message: null,
      }),
      markWaitingTakeover: jest.fn().mockResolvedValue(undefined),
      createTakeoverRecord: jest.fn().mockResolvedValue(undefined),
      listByExecutionId: jest.fn().mockResolvedValue([]),
    };

    const service = new ExecutionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      executionPhaseService as never,
    );
    jest.spyOn(service, 'getById').mockResolvedValue({ id: 'execution-1' } as never);

    await service.takeoverPhase(
      'execution-1',
      'phase_login',
      'user-1',
      { reason: 'Captcha detected' },
      { id: 'user-1' },
    );

    expect(prisma.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-1' },
      data: {
        status: EXECUTION_STATUS.HUMAN_CONTROL,
        takeoverRequired: true,
        takeoverReason: 'Captcha detected',
      },
    });
    expect(executionPhaseService.markWaitingTakeover).toHaveBeenCalledWith(
      'execution-1',
      'phase_login',
      expect.objectContaining({
        phaseName: '登录阶段',
        phaseType: 'browser_login',
      }),
    );
    expect(executionPhaseService.createTakeoverRecord).toHaveBeenCalled();
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/runtime-sessions/runtime-1/freeze'),
      { reason: 'Captcha detected' },
    );
  });

  it('resumes phase takeover and resolves takeover record before resuming runtime session', async () => {
    const executionFindUnique = jest.fn()
      .mockResolvedValueOnce({
        id: 'execution-1',
        createdBy: 'user-1',
        status: EXECUTION_STATUS.HUMAN_CONTROL,
      })
      .mockResolvedValueOnce({
        currentStepId: 'step-1',
      });
    const prisma = {
      execution: {
        findUnique: executionFindUnique,
        update: jest.fn().mockResolvedValue(undefined),
      },
      runtimeSession: {
        findFirst: jest.fn().mockResolvedValue({ id: 'runtime-1' }),
      },
      executionEvent: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $executeRawUnsafe: jest.fn(),
    };
    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue({
        id: 'phase-1',
        phase_key: 'phase_login',
        phase_name: '登录阶段',
        phase_type: 'browser_login',
        status: 'waiting_takeover',
        attempt: 2,
        runtime_session_id: 'runtime-1',
        input_json: { stepId: 'step-1' },
      }),
      resolveTakeoverRecord: jest.fn().mockResolvedValue(undefined),
      markRunning: jest.fn().mockResolvedValue(undefined),
      listByExecutionId: jest.fn().mockResolvedValue([]),
    };
    const executionStepService = {
      getById: jest.fn().mockResolvedValue({
        id: 'step-1',
        status: EXECUTION_STEP_STATUS.FAILED,
        targetJson: {
          phaseKey: 'phase_login',
          phaseName: '登录阶段',
          phaseType: 'browser_login',
        },
      }),
      requeueFailedStep: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      executionPhaseService as never,
      undefined,
      executionStepService as never,
    );
    jest.spyOn(service as any, 'updateStatus').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'advanceExecutionFlow').mockResolvedValue(undefined);
    jest.spyOn(service, 'getById').mockResolvedValue({ id: 'execution-1' } as never);

    await service.resumePhaseTakeover(
      'execution-1',
      'phase_login',
      'user-1',
      { stepId: 'step-1', comment: 'Manual fix complete' },
      { id: 'user-1' },
    );

    expect(executionPhaseService.resolveTakeoverRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: 'execution-1',
        phaseId: 'phase-1',
        resolvedBy: 'user-1',
      }),
    );
    expect(executionPhaseService.markRunning).toHaveBeenCalledWith(
      'execution-1',
      'phase_login',
      expect.objectContaining({
        phaseName: '登录阶段',
        phaseType: 'browser_login',
        attempt: 2,
      }),
    );
    expect(executionStepService.requeueFailedStep).toHaveBeenCalledWith('step-1');
    expect((service as any).updateStatus).toHaveBeenCalledWith('execution-1', EXECUTION_STATUS.RUNNING);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/runtime-sessions/runtime-1/resume'),
      { stepId: 'step-1' },
    );
    expect((service as any).advanceExecutionFlow).toHaveBeenCalledWith('execution-1', 'runtime-1');
  });

  it('resumes legacy human_control execution and restarts execution flow asynchronously', async () => {
    const executionFindUnique = jest.fn()
      .mockResolvedValueOnce({
        id: 'execution-1',
        createdBy: 'user-1',
        status: EXECUTION_STATUS.HUMAN_CONTROL,
        currentPhaseKey: 'phase_login',
      })
      .mockResolvedValueOnce({
        currentStepId: 'step-1',
      });
    const prisma = {
      execution: {
        findUnique: executionFindUnique,
        update: jest.fn().mockResolvedValue(undefined),
      },
      runtimeSession: {
        findFirst: jest.fn().mockResolvedValue({ id: 'runtime-1' }),
      },
      executionEvent: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $executeRawUnsafe: jest.fn(),
    };
    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue({
        id: 'phase-1',
        phase_key: 'phase_login',
        phase_name: '登录阶段',
        phase_type: 'browser_login',
        status: 'waiting_takeover',
        attempt: 2,
        runtime_session_id: 'runtime-1',
        input_json: { stepId: 'step-1' },
      }),
      resolveTakeoverRecord: jest.fn().mockResolvedValue(undefined),
      markRunning: jest.fn().mockResolvedValue(undefined),
      listByExecutionId: jest.fn().mockResolvedValue([]),
    };
    const executionStepService = {
      getById: jest.fn().mockResolvedValue({
        id: 'step-1',
        status: EXECUTION_STEP_STATUS.FAILED,
        targetJson: {
          phaseKey: 'phase_login',
          phaseName: '登录阶段',
          phaseType: 'browser_login',
        },
      }),
      requeueFailedStep: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      executionPhaseService as never,
      undefined,
      executionStepService as never,
    );
    jest.spyOn(service as any, 'updateStatus').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'advanceExecutionFlow').mockResolvedValue(undefined);
    jest.spyOn(service, 'getById').mockResolvedValue({ id: 'execution-1' } as never);

    await service.resume(
      'execution-1',
      'user-1',
      { stepId: 'step-1', comment: 'Continue after manual fix' },
      { id: 'user-1' },
    );

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/runtime-sessions/runtime-1/resume'),
      { stepId: 'step-1' },
    );
    expect(executionStepService.requeueFailedStep).toHaveBeenCalledWith('step-1');
    expect((service as any).advanceExecutionFlow).toHaveBeenCalledWith('execution-1', 'runtime-1');
  });
});
