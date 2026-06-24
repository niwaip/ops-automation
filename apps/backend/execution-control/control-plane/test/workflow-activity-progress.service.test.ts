import { WorkflowActivityProgressService } from '../src/modules/execution';

describe('WorkflowActivityProgressService', () => {
  it('loads execution, checks permission, and delegates progress sync', async () => {
    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'execution-1',
          createdBy: 'user-1',
        }),
      },
    };
    const executionPhaseService = {
      listByExecutionId: jest.fn().mockResolvedValue([]),
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
    };

    const service = new WorkflowActivityProgressService(prisma as never, executionPhaseService as never);
    const syncSpy = jest.spyOn(service, 'sync').mockResolvedValue(undefined);

    await service.updateWorkflowActivityProgress(
      'execution-1',
      {
        parentPhaseKey: 'phase_parent',
        activityOrder: 2,
      },
      { id: 'user-1' }
    );

    expect(prisma.execution.findUnique).toHaveBeenCalledWith({
      where: { id: 'execution-1' },
    });
    expect(syncSpy).toHaveBeenCalledWith('execution-1', {
      parentPhaseKey: 'phase_parent',
      activityOrder: 2,
    });
  });

  it('completes previous running workflow activity phases and marks current phase running', async () => {
    const prisma = {
      execution: {
        findUnique: jest.fn(),
      },
    };
    const executionPhaseService = {
      listByExecutionId: jest.fn().mockResolvedValue([
        {
          phase_key: 'phase_parent__activity_1',
          phase_name: 'Activity 1',
          phase_type: 'workflow_activity',
          status: 'running',
          attempt: 1,
          runtime_session_id: 'runtime-1',
          input_json: {
            parentPhaseKey: 'phase_parent',
            order: 1,
          },
          output_json: {
            ok: true,
          },
          started_at: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          phase_key: 'phase_parent__activity_2',
          phase_name: 'Activity 2',
          phase_type: 'workflow_activity',
          status: 'pending',
          attempt: 1,
          runtime_session_id: 'runtime-1',
          input_json: {
            parentPhaseKey: 'phase_parent',
            order: 2,
          },
          output_json: null,
          started_at: null,
        },
      ]),
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
    };

    const service = new WorkflowActivityProgressService(prisma as never, executionPhaseService as never);
    await service.sync('execution-1', {
      parentPhaseKey: 'phase_parent',
      activityOrder: 2,
      runtimeSessionId: 'runtime-1',
    });

    expect(executionPhaseService.createOrUpdatePhase).toHaveBeenCalledTimes(2);
    expect(executionPhaseService.createOrUpdatePhase).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        executionId: 'execution-1',
        phaseKey: 'phase_parent__activity_1',
        status: 'completed',
        runtimeSessionId: 'runtime-1',
      })
    );
    expect(executionPhaseService.createOrUpdatePhase).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        executionId: 'execution-1',
        phaseKey: 'phase_parent__activity_2',
        status: 'running',
        runtimeSessionId: 'runtime-1',
      })
    );
  });
});
