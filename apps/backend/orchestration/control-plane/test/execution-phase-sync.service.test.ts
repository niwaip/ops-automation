import { ExecutionPhaseSyncService } from '../src/modules/execution/execution-phase-sync.service';

describe('ExecutionPhaseSyncService', () => {
  const createService = () => {
    const prisma = {
      executionStep: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const executionPhaseService = {
      markRunning: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
      appendArtifacts: jest.fn().mockResolvedValue(undefined),
      appendSteps: jest.fn().mockResolvedValue(undefined),
    };

    return {
      service: new ExecutionPhaseSyncService(prisma as never, executionPhaseService as never),
      executionPhaseService,
    };
  };

  it('uses loop-scoped phase key when marking running for a loop step', async () => {
    const { service, executionPhaseService } = createService();

    await service.markPhaseRunningForStep(
      'execution-1',
      'runtime-1',
      {
        phaseKey: 'phase_08_iteration_step_8',
        phaseName: '读取页面中的案件粗利率',
        phaseType: 'workflow_activity',
      },
      {
        id: 'step-21',
        type: 'browser_phase',
        action: 'browser_phase',
        inputJson: {
          loopIteration: 3,
          phaseKey: 'phase_08_iteration_step_8',
        },
      }
    );

    expect(executionPhaseService.markRunning).toHaveBeenCalledWith(
      'execution-1',
      'phase_08_iteration_step_8__loop_3',
      expect.objectContaining({
        runtimeSessionId: 'runtime-1',
      })
    );
  });

  it('appends loop phase artifacts and steps using the loop-scoped phase key', async () => {
    const { service, executionPhaseService } = createService();

    await service.syncPhaseAfterStepResult(
      'execution-1',
      'runtime-1',
      {
        success: true,
        status: 'completed',
        output: {
          ok: true,
        },
        snapshot: {
          id: 'snapshot-1',
          type: 'browser',
          metadata: {
            artifactPath: '/tmp/snapshot-1.png',
          },
        },
        artifacts: [
          {
            type: 'snapshot',
            id: 'snapshot-1',
            metadata: {
              artifactPath: '/tmp/snapshot-1.png',
            },
          },
        ],
      } as never,
      {
        phaseKey: 'phase_08_iteration_step_8',
        phaseName: '读取页面中的案件粗利率',
        phaseType: 'workflow_activity',
      },
      {
        id: 'step-21',
        action: 'branch',
        inputJson: {
          loopIteration: 3,
          phaseKey: 'phase_08_iteration_step_8',
        },
      }
    );

    expect(executionPhaseService.markCompleted).toHaveBeenCalledWith(
      'execution-1',
      'phase_08_iteration_step_8__loop_3',
      expect.objectContaining({
        runtimeSessionId: 'runtime-1',
      })
    );
    expect(executionPhaseService.appendArtifacts).toHaveBeenCalledWith(
      'execution-1',
      'phase_08_iteration_step_8__loop_3',
      expect.any(Array)
    );
    expect(executionPhaseService.appendSteps).toHaveBeenCalledWith(
      'execution-1',
      'phase_08_iteration_step_8__loop_3',
      expect.any(Array)
    );
  });
});
