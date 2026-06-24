import { ExecutionService } from '../src/modules/execution/execution.service';
import { ExecutionQueryService } from '../src/modules/execution/query/execution-query.service';

describe('ExecutionQueryService', () => {
  const createExecutionRecord = (overrides: Record<string, unknown> = {}) => ({
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
    ...overrides,
  });

  it('loads execution detail with latest runtime session and phases', async () => {
    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue(createExecutionRecord()),
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
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          updatedAt: new Date('2026-05-01T00:00:00.000Z'),
          artifacts: [],
          takeovers: [],
        },
      ]),
    };

    const service = new ExecutionQueryService(
      prisma as never,
      executionPhaseService as never,
      {} as never
    );

    const result = await service.getById('execution-1', { id: 'user-1' });

    expect(prisma.execution.findUnique).toHaveBeenCalledWith({
      where: { id: 'execution-1' },
    });
    expect(prisma.runtimeSession.findFirst).toHaveBeenCalledWith({
      where: { executionId: 'execution-1' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    expect(executionPhaseService.listByExecutionId).toHaveBeenCalledWith('execution-1');
    expect(result.runtimeSessionId).toBe('runtime-1');
    expect(result.phases).toEqual([
      expect.objectContaining({
        phaseKey: 'phase_login',
        phaseName: '登录阶段',
        phaseType: 'browser_login',
      }),
    ]);
  });

  it('rejects detail queries from non-owners', async () => {
    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue(createExecutionRecord()),
      },
      runtimeSession: {
        findFirst: jest.fn(),
      },
    };
    const executionPhaseService = {
      listByExecutionId: jest.fn(),
    };

    const service = new ExecutionQueryService(
      prisma as never,
      executionPhaseService as never,
      {} as never
    );

    await expect(service.getById('execution-1', { id: 'user-2' })).rejects.toThrow(
      'Execution not found'
    );
    expect(prisma.runtimeSession.findFirst).not.toHaveBeenCalled();
    expect(executionPhaseService.listByExecutionId).not.toHaveBeenCalled();
  });

  it('maps phase query results to dto objects', async () => {
    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue(createExecutionRecord()),
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

    const service = new ExecutionQueryService(
      prisma as never,
      executionPhaseService as never,
      {} as never
    );

    const result = await service.getPhases('execution-1', { id: 'user-1' });

    expect(result).toEqual([
      expect.objectContaining({
        phaseKey: 'phase_login',
        phaseName: '登录阶段',
        phaseType: 'browser_login',
      }),
    ]);
  });

  it('maps step query results to dto objects', async () => {
    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue(createExecutionRecord()),
      },
    };
    const executionPhaseService = {
      listByExecutionId: jest.fn(),
    };
    const executionStepService = {
      listByExecutionId: jest.fn().mockResolvedValue([
        {
          id: 'step-1',
          executionId: 'execution-1',
          stepIndex: 1,
          type: 'system',
          action: 'execute_skill',
          status: 'succeeded',
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          updatedAt: new Date('2026-05-01T00:00:00.000Z'),
        },
      ]),
    };

    const service = new ExecutionQueryService(
      prisma as never,
      executionPhaseService as never,
      executionStepService as never
    );

    const result = await service.getSteps('execution-1', { id: 'user-1' });

    expect(executionStepService.listByExecutionId).toHaveBeenCalledWith('execution-1');
    expect(result).toEqual([
      expect.objectContaining({
        id: 'step-1',
        action: 'execute_skill',
      }),
    ]);
  });

  it('lists executions with requester scoping and latest runtime sessions', async () => {
    const prisma = {
      execution: {
        findMany: jest
          .fn()
          .mockResolvedValue([createExecutionRecord(), createExecutionRecord({ id: 'execution-2' })]),
        count: jest.fn().mockResolvedValue(2),
      },
      runtimeSession: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'runtime-2', executionId: 'execution-2' },
          { id: 'runtime-1', executionId: 'execution-1' },
        ]),
      },
    };
    const executionPhaseService = {
      listByExecutionId: jest.fn(),
    };

    const service = new ExecutionQueryService(
      prisma as never,
      executionPhaseService as never,
      {} as never
    );

    const result = await service.list({ page: 2, pageSize: 2, status: 'running' }, { id: 'user-1' });

    expect(prisma.execution.findMany).toHaveBeenCalledWith({
      where: {
        status: 'running',
        createdBy: 'user-1',
      },
      orderBy: { createdAt: 'desc' },
      skip: 2,
      take: 2,
    });
    expect(prisma.execution.count).toHaveBeenCalledWith({
      where: {
        status: 'running',
        createdBy: 'user-1',
      },
    });
    expect(result.data).toHaveLength(2);
    expect(result.data[0]?.runtimeSessionId).toBe('runtime-1');
    expect(result.data[1]?.runtimeSessionId).toBe('runtime-2');
    expect(result.total).toBe(2);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(2);
  });
});

describe('ExecutionService query delegation', () => {
  it('delegates getById, getPhases and list to ExecutionQueryService', async () => {
    const service = new ExecutionService({} as never, {} as never, {} as never, {} as never);
    const queryService = {
      getById: jest.fn().mockResolvedValue({ id: 'execution-1' }),
      getSteps: jest.fn().mockResolvedValue([{ id: 'step-1' }]),
      getPhases: jest.fn().mockResolvedValue([{ phaseKey: 'phase_login' }]),
      list: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 10 }),
    };
    (service as any).executionQueryService = queryService;

    await expect(service.getById('execution-1', { id: 'user-1' })).resolves.toEqual({
      id: 'execution-1',
    });
    await expect(service.getSteps('execution-1', { id: 'user-1' })).resolves.toEqual([
      { id: 'step-1' },
    ]);
    await expect(service.getPhases('execution-1', { id: 'user-1' })).resolves.toEqual([
      { phaseKey: 'phase_login' },
    ]);
    await expect(service.list({ page: 1, pageSize: 10 }, { id: 'user-1' })).resolves.toEqual({
      data: [],
      total: 0,
      page: 1,
      pageSize: 10,
    });

    expect(queryService.getById).toHaveBeenCalledWith('execution-1', { id: 'user-1' });
    expect(queryService.getSteps).toHaveBeenCalledWith('execution-1', { id: 'user-1' });
    expect(queryService.getPhases).toHaveBeenCalledWith('execution-1', { id: 'user-1' });
    expect(queryService.list).toHaveBeenCalledWith({ page: 1, pageSize: 10 }, { id: 'user-1' });
  });
});
