import { ExecutionService } from '../src/modules/execution/execution.service';

describe('ExecutionService phase artifact sync', () => {
  it('persists runtime artifacts when syncing a successful skill runtime phase', async () => {
    const prisma = {
      execution: { update: jest.fn(), findUnique: jest.fn() },
      executionStep: { update: jest.fn(), findUnique: jest.fn() },
      executionEvent: { create: jest.fn() },
      runtimeSession: { findFirst: jest.fn() },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };

    const executionPhaseService = {
      markCompleted: jest.fn().mockResolvedValue(undefined),
      replaceArtifacts: jest.fn().mockResolvedValue(undefined),
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
      undefined,
    );

    await (service as any).syncPhaseAfterStepResult(
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
      },
      {
        phaseKey: 'phase_01_execute_skill',
        phaseName: '执行技能',
        phaseType: 'skill',
      },
      {
        id: 'step-1',
        action: 'execute_skill',
      },
    );

    expect(executionPhaseService.markCompleted).toHaveBeenCalledWith(
      'execution-1',
      'phase_01_execute_skill',
      expect.objectContaining({
        runtimeSessionId: 'runtime-1',
      }),
    );
    expect(executionPhaseService.replaceArtifacts).toHaveBeenCalledWith(
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
      ],
    );
  });
});
