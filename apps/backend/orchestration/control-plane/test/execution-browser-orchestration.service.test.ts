import { ExecutionBrowserOrchestrationService } from '../src/modules/execution/execution-browser-orchestration.service';

describe('ExecutionBrowserOrchestrationService', () => {
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
