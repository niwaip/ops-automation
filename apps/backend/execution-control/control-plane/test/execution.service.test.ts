import { BadRequestException } from '@nestjs/common';
import axios from 'axios';
import {
  APPROVAL_STATUS,
  EXECUTION_EVENT_TYPE,
  EXECUTION_STATUS,
  EXECUTION_STEP_STATUS,
} from '../src/modules/execution';
import { ExecutionService } from '../src/modules/execution/execution.service';
import {
  ApprovalDecisionDto,
  SubmitInputDto,
  TakeoverExecutionDto,
} from '../src/modules/execution/state/execution.dto';

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
            expect.objectContaining({
              name: 'url',
              type: 'string',
              required: true,
              missing: false,
              source: 'user_input',
              needs_confirmation: false,
              value: 'https://example.com',
            }),
          ],
          paramResolution: {
            url: expect.objectContaining({
              value: 'https://example.com',
              source: 'user_input',
              missing: false,
              needsConfirmation: false,
              final: true,
            }),
          },
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

  it('normalizes legacy planner paramResolution metadata aliases before resuming execution', async () => {
    const { service, prisma } = createService();
    const executionWithParamResolutionOnly = {
      ...baseExecution,
      normalizedInputJson: {
        input: {},
        paramResolution: {
          url: {
            type: 'string',
            required: true,
            value: undefined,
            source: 'unresolved',
            requiredMode: 'always',
            missing: true,
            needsConfirmation: false,
            confirmed: false,
            final: false,
            displayName: '访问地址',
            groupLabel: '入口参数',
            previewBlocking: true,
            missingReason: 'missing',
          },
        },
      },
    };
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

    prisma.execution.findUnique.mockResolvedValue(executionWithParamResolutionOnly);
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
        normalizedInputJson: {
          input: {
            url: 'https://example.com',
          },
          requiredInputs: [
            expect.objectContaining({
              name: 'url',
              display_name: '访问地址',
              group_label: '入口参数',
              preview_blocking: true,
              source: 'user_input',
              missing: false,
            }),
          ],
          paramResolution: {
            url: expect.objectContaining({
              value: 'https://example.com',
              source: 'user_input',
              missing: false,
              final: true,
              display_name: '访问地址',
              group_label: '入口参数',
              preview_blocking: true,
            }),
          },
          url: 'https://example.com',
        },
        status: 'queued',
      },
    });
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

    await expect(service.submitInputAndResume('execution-1', 'user-1', dto)).rejects.toThrow(
      BadRequestException
    );
    await expect(service.submitInputAndResume('execution-1', 'user-1', dto)).rejects.toThrow(
      'Unexpected input fields: unexpected'
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
            expect.objectContaining({
              name: 'account',
              type: 'string',
              required: true,
              missing: true,
              source: 'unresolved',
            }),
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
        normalizedInputJson: expect.objectContaining({
          input: expect.objectContaining({
            url: 'https://example.com',
          }),
          requiredInputs: [
            expect.objectContaining({
              name: 'url',
              type: 'string',
              required: true,
              missing: false,
              source: 'user_input',
              needs_confirmation: false,
              value: 'https://example.com',
            }),
            expect.objectContaining({
              name: 'account',
              type: 'string',
              required: true,
              missing: true,
              source: 'unresolved',
            }),
          ],
          paramResolution: {
            url: expect.objectContaining({
              value: 'https://example.com',
              source: 'user_input',
              missing: false,
              final: true,
            }),
            account: expect.objectContaining({
              source: 'unresolved',
              missing: true,
              final: false,
            }),
          },
          url: 'https://example.com',
        }),
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
            summary: '仍缺少 1 个必填参数。',
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
        outputJson: {},
        endedAt: null,
      },
    });
    expect(prisma.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-1' },
      data: {
        normalizedInputJson: {
          input: {},
          requiredInputs: [
            expect.objectContaining({ name: 'otherTerms', missing: true, source: 'unresolved' }),
            expect.objectContaining({
              name: 'installationCondition',
              missing: true,
              source: 'unresolved',
            }),
            expect.objectContaining({
              name: 'deliveryItems[].installationDate',
              missing: true,
              source: 'unresolved',
            }),
          ],
          paramResolution: {
            otherTerms: expect.objectContaining({
              missing: true,
              source: 'unresolved',
              final: false,
              value: undefined,
            }),
            installationCondition: expect.objectContaining({
              missing: true,
              source: 'unresolved',
              final: false,
              value: undefined,
            }),
            'deliveryItems[].installationDate': expect.objectContaining({
              missing: true,
              source: 'unresolved',
              final: false,
              value: undefined,
            }),
          },
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
            expect.objectContaining({
              name: 'deliveryItems[].installationDate',
              type: 'date',
              required: true,
              missing: false,
              source: 'user_input',
              needs_confirmation: false,
              value: '2025-06-07',
            }),
          ],
          paramResolution: {
            'deliveryItems[].installationDate': expect.objectContaining({
              value: '2025-06-07',
              source: 'user_input',
              missing: false,
              final: true,
            }),
          },
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
    jest
      .spyOn((service as any).executionStartService, 'startExecution')
      .mockResolvedValue(undefined);

    const response = await service.submitInputAndResume('execution-1', 'user-1', dto);

    expect((service as any).updateStatus).not.toHaveBeenCalled();
    expect((service as any).executionStartService.startExecution).toHaveBeenCalledWith(
      'execution-1',
      expect.any(Object)
    );
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
    jest.spyOn(serviceInternals.executionStreamService, 'createEvent').mockResolvedValue(undefined);

    return { service, prisma, serviceInternals };
  };

  it('includes semantic snapshot in runtime waiting_input events when available', async () => {
    const { prisma, serviceInternals } = createService();
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

    await serviceInternals.executionRuntimeControlService.enterRuntimeWaitingInput(
      'execution-1',
      'runtime-1',
      'step-1',
      [{ name: 'url', type: 'string' }],
      'missing fields',
      serviceInternals.getFailureHooks()
    );

    expect(serviceInternals.executionStreamService.createEvent).toHaveBeenCalledWith(
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
      })
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
    jest
      .spyOn(serviceInternals.executionStartService, 'startExecution')
      .mockResolvedValue(undefined);

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
    expect((service as any).updateStatus).toHaveBeenCalledWith(
      'execution-approve',
      EXECUTION_STATUS.QUEUED
    );
    expect((service as any).executionStartService.startExecution).toHaveBeenCalledWith(
      'execution-approve',
      expect.any(Object)
    );
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
    expect((service as any).updateStatus).toHaveBeenCalledWith(
      'execution-reject',
      EXECUTION_STATUS.CANCELLED
    );
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
      { reason: 'Captcha detected' }
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
      EXECUTION_STATUS.CANCELLED
    );
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://session-broker:3002/runtime-sessions/runtime-2/close',
      {}
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
    jest.spyOn(serviceInternals.executionStreamService, 'createEvent').mockResolvedValue(undefined);
    jest.spyOn(serviceInternals, 'advanceExecutionFlow').mockResolvedValue(undefined);

    return { service, prisma };
  };

  it('skips browser runtime allocation for non-browser execution', async () => {
    const { service, prisma } = createService();
    const serviceInternals = service as any;

    prisma.execution.findUnique.mockResolvedValue({
      id: 'execution-non-browser',
      runtimeType: 'sandbox',
      createdBy: 'user-1',
    });
    await serviceInternals.executionStartService.startExecution(
      'execution-non-browser',
      serviceInternals.getStartHooks()
    );

    expect((service as any).updateStatus).toHaveBeenCalledWith(
      'execution-non-browser',
      EXECUTION_STATUS.RUNNING
    );
    expect((service as any).executionStreamService.createEvent).toHaveBeenCalledWith(
      'execution-non-browser',
      EXECUTION_EVENT_TYPE.RUNTIME_SKIPPED,
      {
        runtimeType: 'sandbox',
        mode: 'non_browser_runtime',
      },
      {}
    );
    expect((service as any).advanceExecutionFlow).toHaveBeenCalledWith(
      'execution-non-browser',
      'execution-non-browser'
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

    return { service, prisma, serviceInternals };
  };

  it('skips runtime bootstrap goto for direct skill execution mode', async () => {
    const { prisma, serviceInternals } = createService();

    await serviceInternals.executionBrowserOrchestrationService.bootstrapBrowserExecution(
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
      serviceInternals.getBrowserOrchestrationHooks()
    );

    expect(prisma.executionStep.findFirst).not.toHaveBeenCalled();
    expect(prisma.executionStep.create).not.toHaveBeenCalled();
    expect(serviceInternals.advanceExecutionFlow).toHaveBeenCalledWith(
      'execution-browser-skill-1',
      'runtime-browser-skill-1'
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
        findMany: jest.fn().mockResolvedValue([]),
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
    jest
      .spyOn(internals.executionPhaseSyncService, 'completeActivePhasesOnExecutionSuccess')
      .mockResolvedValue(undefined);
    jest
      .spyOn(internals.executionRuntimeSessionService, 'closeQuietly')
      .mockResolvedValue(undefined);

    return { service, prisma, internals };
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
      EXECUTION_STATUS.SUCCEEDED
    );
    expect((service as any).executionPhaseSyncService.completeActivePhasesOnExecutionSuccess).toHaveBeenCalledWith(
      'execution-terminal-1',
      'runtime-terminal-1'
    );
    expect((service as any).executionRuntimeSessionService.closeQuietly).toHaveBeenCalledWith(
      'runtime-terminal-1',
      'execution-terminal-1',
      'execution_succeeded'
    );
  });

  it('closes runtime session when runtime step failure marks execution failed', async () => {
    const { prisma, internals } = createService();
    prisma.execution.update.mockResolvedValue(undefined);

    await internals.executionRuntimeControlService.failExecutionFromRuntimeStep(
      {
        executionId: 'execution-terminal-2',
        stepId: 'step-1',
        failureReason: 'boom',
        failureCode: 'ERR',
        runtimeSessionId: 'runtime-terminal-2',
      },
      internals.getFailureHooks()
    );

    expect(prisma.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-terminal-2' },
      data: {
        failureReason: 'boom',
        failureCode: 'ERR',
      },
    });
    expect(internals.updateStatus).toHaveBeenCalledWith(
      'execution-terminal-2',
      EXECUTION_STATUS.FAILED
    );
    expect(internals.executionRuntimeSessionService.closeQuietly).toHaveBeenCalledWith(
      'runtime-terminal-2',
      'execution-terminal-2',
      'runtime_step_failed'
    );
  });
});
