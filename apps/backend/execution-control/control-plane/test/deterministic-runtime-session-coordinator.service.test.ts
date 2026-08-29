import { DeterministicRuntimeSessionCoordinatorService } from '../src/modules/execution/plan-runtime/deterministic-runtime-session-coordinator.service';

describe('DeterministicRuntimeSessionCoordinatorService', () => {
  const createHarness = () => {
    const prisma = {
      runtimeSession: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };
    const runtimeSessions = {
      allocateRuntimeSession: jest.fn(),
      closeQuietly: jest.fn().mockResolvedValue(undefined),
    };
    const events = { createEvent: jest.fn().mockResolvedValue(undefined) };
    return {
      prisma,
      runtimeSessions,
      events,
      service: new DeterministicRuntimeSessionCoordinatorService(
        prisma as any,
        runtimeSessions as any,
        events as any
      ),
    };
  };

  it('reuses an active standard browser session for every browser node in the plan', async () => {
    const harness = createHarness();
    harness.prisma.runtimeSession.findFirst.mockResolvedValue({ id: 'session-standard' });

    await expect(
      harness.service.ensureBrowserSession({
        executionId: 'execution-1',
        userId: 'user-1',
        stepId: 'browser-step-2',
      })
    ).resolves.toBe('session-standard');
    expect(harness.runtimeSessions.allocateRuntimeSession).not.toHaveBeenCalled();
  });

  it('allocates through session-broker once and emits the standard allocation event', async () => {
    const harness = createHarness();
    harness.prisma.runtimeSession.findFirst.mockResolvedValue(null);
    harness.runtimeSessions.allocateRuntimeSession.mockResolvedValue({ id: 'session-standard' });

    await expect(
      harness.service.ensureBrowserSession({
        executionId: 'execution-1',
        userId: 'user-1',
        stepId: 'browser-step-1',
      })
    ).resolves.toBe('session-standard');

    expect(harness.runtimeSessions.allocateRuntimeSession).toHaveBeenCalledWith({
      executionId: 'execution-1',
      userId: 'user-1',
      runtimeType: 'browser',
    });
    expect(harness.events.createEvent).toHaveBeenCalledWith(
      'execution-1',
      'runtime.allocated',
      expect.objectContaining({
        runtimeSessionId: 'session-standard',
        source: 'deterministic_plan',
      }),
      { stepId: 'browser-step-1' }
    );
  });

  it('closes active sessions at plan terminal but preserves frozen takeover sessions', async () => {
    const harness = createHarness();
    harness.prisma.runtimeSession.findMany.mockResolvedValue([{ id: 'session-standard' }]);

    await harness.service.closeForTerminalExecution('execution-1', 'plan_completed_after_llm');

    expect(harness.prisma.runtimeSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          executionId: 'execution-1',
          state: { in: ['ready', 'busy', 'error'] },
        }),
      })
    );
    expect(harness.runtimeSessions.closeQuietly).toHaveBeenCalledWith(
      'session-standard',
      'execution-1',
      'plan_completed_after_llm'
    );
  });
});
