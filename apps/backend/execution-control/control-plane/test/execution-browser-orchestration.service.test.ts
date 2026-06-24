import { ExecutionBrowserOrchestrationService } from '../src/modules/execution/step-runner/browser/execution-browser-orchestration.service';

describe('ExecutionBrowserOrchestrationService', () => {
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
    const service = new ExecutionBrowserOrchestrationService(
      prisma as never,
      executionStepService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );
    const hooks = {
      emitEvent: jest.fn().mockResolvedValue(undefined),
      advanceExecutionFlow: jest.fn().mockResolvedValue(undefined),
      enterRuntimeWaitingInput: jest.fn().mockResolvedValue(undefined),
      enterPendingApprovalFromRuntimeStep: jest.fn().mockResolvedValue(undefined),
      failExecutionFromRuntimeStep: jest.fn().mockResolvedValue(undefined),
      syncPhaseAfterStepResult: jest.fn().mockResolvedValue(undefined),
      takeover: jest.fn().mockResolvedValue(undefined),
      failureHooks: {
        emitEvent: jest.fn().mockResolvedValue(undefined),
        updateStatus: jest.fn().mockResolvedValue(undefined),
        closeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
      },
    };

    await service.handleBrowserPhaseStepResult(
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
      } as never,
      hooks as never
    );

    expect(prisma.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-1' },
      data: expect.objectContaining({
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
      }),
    });
    expect(hooks.advanceExecutionFlow).toHaveBeenCalledWith('execution-1', 'runtime-1');
  });

  it('persists browser phase variables into normalized input after phase success', async () => {
    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue({
          resultJson: {
            backend: 'browser',
          },
          normalizedInputJson: {
            plannerMode: 'browser_loop_workflow',
            browserPhaseVariables: {
              existingVar: 'keep',
            },
          },
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };

    const service = new ExecutionBrowserOrchestrationService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    await (service as any).persistBrowserPhaseSuccess('execution-1', 'runtime-1', {
      output: {
        phaseVariables: {
          existingVar: 'keep',
          grossProfitRate: '25%',
        },
      },
      stepResults: [],
      status: 'completed',
    });

    expect(prisma.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-1' },
      data: {
        resultJson: expect.objectContaining({
          runtimeSessionId: 'runtime-1',
          browserPhaseVariables: {
            existingVar: 'keep',
            grossProfitRate: '25%',
          },
        }),
        normalizedInputJson: expect.objectContaining({
          plannerMode: 'browser_loop_workflow',
          browserPhaseVariables: {
            existingVar: 'keep',
            grossProfitRate: '25%',
          },
        }),
      },
    });
  });
});
