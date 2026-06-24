import { ExecutionPhaseSyncService } from '../src/modules/execution/state/execution-phase-sync.service';

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

  it('persists runtime artifacts when syncing a successful skill runtime phase', async () => {
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
          id: 'snapshot-2',
          type: 'browser',
          metadata: {
            artifactPath: '/tmp/snapshot-2.png',
          },
        },
        artifacts: [
          {
            type: 'snapshot',
            id: 'snapshot-1',
            metadata: {
              command: 'screenshot',
              artifactPath: '/tmp/snapshot-1.png',
              pageFingerprint: 'fp-1',
            },
          },
          {
            type: 'snapshot',
            id: 'snapshot-2',
            metadata: {
              command: 'screenshot',
              artifactPath: '/tmp/snapshot-2.png',
            },
          },
        ],
      } as never,
      {
        phaseKey: 'phase_01_execute_skill',
        phaseName: '执行技能',
        phaseType: 'skill',
      },
      {
        id: 'step-1',
        action: 'execute_skill',
      }
    );

    expect(executionPhaseService.markCompleted).toHaveBeenCalledWith(
      'execution-1',
      'phase_01_execute_skill',
      expect.objectContaining({
        runtimeSessionId: 'runtime-1',
      })
    );
    expect(executionPhaseService.appendArtifacts).toHaveBeenCalledWith(
      'execution-1',
      'phase_01_execute_skill',
      [
        {
          artifactType: 'snapshot',
          snapshotId: 'snapshot-1',
          pageUrl: null,
          pageFingerprint: 'fp-1',
          payload: {
            command: 'screenshot',
            artifactPath: '/tmp/snapshot-1.png',
            pageFingerprint: 'fp-1',
          },
        },
        {
          artifactType: 'snapshot',
          snapshotId: 'snapshot-2',
          pageUrl: null,
          pageFingerprint: null,
          payload: {
            command: 'screenshot',
            artifactPath: '/tmp/snapshot-2.png',
          },
        },
      ]
    );
  });
});
