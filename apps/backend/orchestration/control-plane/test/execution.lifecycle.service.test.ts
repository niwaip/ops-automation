import { BadRequestException } from '@nestjs/common';
import {
  EXECUTION_EVENT_TYPE,
  EXECUTION_STATUS,
} from '../src/modules/execution';
import { ExecutionService } from '../src/modules/execution/execution.service';
import { ExecutionLifecycleService } from '../src/modules/execution/lifecycle/execution-lifecycle.service';

describe('ExecutionLifecycleService', () => {
  const createService = () => {
    const prisma = {
      execution: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      executionStep: {
        deleteMany: jest.fn(),
      },
      executionEvent: {
        deleteMany: jest.fn(),
      },
      runtimeSession: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const executionStepService = {
      deleteByExecutionId: jest.fn(),
    };
    const executionRuntimeSessionService = {
      closeQuietly: jest.fn(),
    };
    const hooks = {
      getExecutionDto: jest.fn().mockResolvedValue({
        id: 'execution-1',
        status: EXECUTION_STATUS.CANCELLED,
      }),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      emitEvent: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionLifecycleService(
      prisma as never,
      executionStepService as never,
      executionRuntimeSessionService as never
    );

    return {
      service,
      prisma,
      executionStepService,
      executionRuntimeSessionService,
      hooks,
    };
  };

  it('cancels execution through hooks and closes the runtime session', async () => {
    const { service, prisma, executionRuntimeSessionService, hooks } = createService();
    prisma.execution.findUnique.mockResolvedValue({
      id: 'execution-1',
      createdBy: 'user-1',
      status: EXECUTION_STATUS.RUNNING,
    });
    prisma.runtimeSession.findFirst.mockResolvedValue({ id: 'runtime-1' });

    const result = await service.cancel('execution-1', 'user-1', hooks, { id: 'user-1' });

    expect(hooks.updateStatus).toHaveBeenCalledWith('execution-1', EXECUTION_STATUS.CANCELLED);
    expect(executionRuntimeSessionService.closeQuietly).toHaveBeenCalledWith(
      'runtime-1',
      'execution-1',
      'execution_cancelled'
    );
    expect(hooks.emitEvent).toHaveBeenCalledWith(
      'execution-1',
      EXECUTION_EVENT_TYPE.EXECUTION_CANCELLED,
      { userId: 'user-1' }
    );
    expect(hooks.getExecutionDto).toHaveBeenCalledWith('execution-1', { id: 'user-1' });
    expect(result).toEqual({
      id: 'execution-1',
      status: EXECUTION_STATUS.CANCELLED,
    });
  });

  it('deletes an execution after removing related steps and events', async () => {
    const { service, prisma, executionStepService } = createService();
    prisma.execution.findUnique.mockResolvedValue({
      id: 'execution-1',
      createdBy: 'user-1',
    });
    prisma.executionEvent.deleteMany.mockResolvedValue({ count: 1 });
    prisma.execution.delete.mockResolvedValue({ id: 'execution-1' });

    const result = await service.delete('execution-1', 'user-1', { id: 'user-1' });

    expect(executionStepService.deleteByExecutionId).toHaveBeenCalledWith('execution-1');
    expect(prisma.executionEvent.deleteMany).toHaveBeenCalledWith({
      where: { executionId: 'execution-1' },
    });
    expect(prisma.execution.delete).toHaveBeenCalledWith({
      where: { id: 'execution-1' },
    });
    expect(result).toEqual({ success: true });
  });

  it('cleans up executions before a cutoff for non-admin requesters', async () => {
    const { service, prisma } = createService();
    prisma.execution.findMany.mockResolvedValue([{ id: 'execution-1' }, { id: 'execution-2' }]);
    prisma.executionStep.deleteMany.mockResolvedValue({ count: 2 });
    prisma.executionEvent.deleteMany.mockResolvedValue({ count: 2 });
    prisma.execution.deleteMany.mockResolvedValue({ count: 2 });

    const result = await service.cleanupBeforeDate('2026-05-13', 'user-1', {
      id: 'user-1',
      role: 'employee',
    });

    expect(prisma.execution.findMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: new Date('2026-05-13T00:00:00') },
        createdBy: 'user-1',
      },
      select: { id: true },
    });
    expect(prisma.executionStep.deleteMany).toHaveBeenCalledWith({
      where: { executionId: { in: ['execution-1', 'execution-2'] } },
    });
    expect(prisma.executionEvent.deleteMany).toHaveBeenCalledWith({
      where: { executionId: { in: ['execution-1', 'execution-2'] } },
    });
    expect(prisma.execution.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['execution-1', 'execution-2'] } },
    });
    expect(result).toEqual({
      success: true,
      deletedCount: 2,
      beforeDate: '2026-05-13',
    });
  });

  it('rejects invalid cleanup date formats', async () => {
    const { service } = createService();

    await expect(service.cleanupBeforeDate('2026/05/13', 'user-1')).rejects.toThrow(
      BadRequestException
    );
    await expect(service.cleanupBeforeDate('2026/05/13', 'user-1')).rejects.toThrow(
      'beforeDate must use YYYY-MM-DD format'
    );
  });
});

describe('ExecutionService lifecycle delegation', () => {
  it('delegates cancel, delete and cleanupBeforeDate to ExecutionLifecycleService', async () => {
    const service = new ExecutionService({} as never, {} as never, {} as never, {} as never);
    const lifecycleService = {
      cancel: jest.fn().mockResolvedValue({ id: 'execution-1' }),
      delete: jest.fn().mockResolvedValue({ success: true }),
      cleanupBeforeDate: jest.fn().mockResolvedValue({
        success: true,
        deletedCount: 0,
        beforeDate: '2026-05-13',
      }),
    };
    (service as any).executionLifecycleService = lifecycleService;

    await expect(service.cancel('execution-1', 'user-1', { id: 'user-1' })).resolves.toEqual({
      id: 'execution-1',
    });
    await expect(service.delete('execution-1', 'user-1', { id: 'user-1' })).resolves.toEqual({
      success: true,
    });
    await expect(
      service.cleanupBeforeDate('2026-05-13', 'user-1', { id: 'user-1' })
    ).resolves.toEqual({
      success: true,
      deletedCount: 0,
      beforeDate: '2026-05-13',
    });

    expect(lifecycleService.cancel).toHaveBeenCalledWith(
      'execution-1',
      'user-1',
      expect.any(Object),
      { id: 'user-1' }
    );
    expect(lifecycleService.delete).toHaveBeenCalledWith('execution-1', 'user-1', {
      id: 'user-1',
    });
    expect(lifecycleService.cleanupBeforeDate).toHaveBeenCalledWith(
      '2026-05-13',
      'user-1',
      { id: 'user-1' }
    );
  });
});
