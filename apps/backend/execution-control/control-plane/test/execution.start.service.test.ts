import { NotFoundException } from '@nestjs/common';
import { EXECUTION_EVENT_TYPE, EXECUTION_STATUS } from '../src/modules/execution';
import { ExecutionService } from '../src/modules/execution/execution.service';
import { ExecutionStartService } from '../src/modules/execution/step-runner/flow/execution-start.service';

describe('ExecutionStartService', () => {
  const createService = () => {
    const prisma = {
      execution: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const executionRuntimeSessionService = {
      allocateRuntimeSession: jest.fn(),
    };
    const hooks = {
      updateStatus: jest.fn().mockResolvedValue(undefined),
      emitEvent: jest.fn().mockResolvedValue(undefined),
      advanceExecutionFlow: jest.fn().mockResolvedValue(undefined),
      bootstrapBrowserExecution: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionStartService(
      prisma as never,
      executionRuntimeSessionService as never
    );

    return { service, prisma, executionRuntimeSessionService, hooks };
  };

  it('skips runtime allocation for non-browser execution', async () => {
    const { service, prisma, executionRuntimeSessionService, hooks } = createService();
    prisma.execution.findUnique.mockResolvedValue({
      id: 'execution-non-browser',
      runtimeType: 'sandbox',
      createdBy: 'user-1',
    });

    await service.startExecution('execution-non-browser', hooks);

    expect(hooks.updateStatus).toHaveBeenCalledWith(
      'execution-non-browser',
      EXECUTION_STATUS.RUNNING
    );
    expect(hooks.emitEvent).toHaveBeenCalledWith(
      'execution-non-browser',
      EXECUTION_EVENT_TYPE.RUNTIME_SKIPPED,
      {
        runtimeType: 'sandbox',
        mode: 'non_browser_runtime',
      }
    );
    expect(hooks.advanceExecutionFlow).toHaveBeenCalledWith(
      'execution-non-browser',
      'execution-non-browser'
    );
    expect(executionRuntimeSessionService.allocateRuntimeSession).not.toHaveBeenCalled();
    expect(hooks.bootstrapBrowserExecution).not.toHaveBeenCalled();
  });

  it('allocates browser runtime and bootstraps execution', async () => {
    const { service, prisma, executionRuntimeSessionService, hooks } = createService();
    prisma.execution.findUnique.mockResolvedValue({
      id: 'execution-browser',
      runtimeType: 'browser',
      createdBy: 'user-1',
    });
    executionRuntimeSessionService.allocateRuntimeSession.mockResolvedValue({
      id: 'runtime-1',
    });

    await service.startExecution('execution-browser', hooks);

    expect(executionRuntimeSessionService.allocateRuntimeSession).toHaveBeenCalledWith({
      userId: 'user-1',
      executionId: 'execution-browser',
      runtimeType: 'browser',
    });
    expect(hooks.emitEvent).toHaveBeenCalledWith(
      'execution-browser',
      EXECUTION_EVENT_TYPE.RUNTIME_ALLOCATED,
      {
        runtimeSessionId: 'runtime-1',
      }
    );
    expect(hooks.bootstrapBrowserExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'execution-browser',
        runtimeType: 'browser',
      }),
      'runtime-1'
    );
  });

  it('marks execution failed when runtime allocation throws', async () => {
    const { service, prisma, executionRuntimeSessionService, hooks } = createService();
    prisma.execution.findUnique.mockResolvedValue({
      id: 'execution-browser',
      runtimeType: 'browser',
      createdBy: 'user-1',
    });
    prisma.execution.update.mockResolvedValue(undefined);
    executionRuntimeSessionService.allocateRuntimeSession.mockRejectedValue(new Error('boom'));

    await service.startExecution('execution-browser', hooks);

    expect(hooks.updateStatus).toHaveBeenNthCalledWith(1, 'execution-browser', EXECUTION_STATUS.RUNNING);
    expect(hooks.updateStatus).toHaveBeenNthCalledWith(2, 'execution-browser', EXECUTION_STATUS.FAILED);
    expect(prisma.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-browser' },
      data: {
        failureReason: 'Failed to allocate runtime session: boom',
        failureCode: 'RUNTIME_ALLOCATION_FAILED',
      },
    });
  });

  it('throws when execution does not exist', async () => {
    const { service, prisma, hooks } = createService();
    prisma.execution.findUnique.mockResolvedValue(null);

    await expect(service.startExecution('execution-missing', hooks)).rejects.toThrow(
      NotFoundException
    );
    await expect(service.startExecution('execution-missing', hooks)).rejects.toThrow(
      'Execution execution-missing not found'
    );
  });
});

describe('ExecutionService startExecution delegation', () => {
  it('delegates getStartExecutionCallback to ExecutionStartService', async () => {
    const service = new ExecutionService({} as never, {} as never, {} as never, {} as never);
    const executionStartService = {
      startExecution: jest.fn().mockResolvedValue(undefined),
    };
    const startHooks = { updateStatus: jest.fn() };
    (service as any).executionStartService = executionStartService;
    jest.spyOn(service as any, 'getStartHooks').mockReturnValue(startHooks);

    await (service as any).getStartExecutionCallback()('execution-1');

    expect(executionStartService.startExecution).toHaveBeenCalledWith(
      'execution-1',
      startHooks
    );
  });
});
