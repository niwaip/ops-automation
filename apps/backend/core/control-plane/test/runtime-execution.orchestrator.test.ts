import { RuntimeExecutionOrchestrator } from '../src/modules/execution/runtime-execution.orchestrator';

describe('RuntimeExecutionOrchestrator.executePhase', () => {
  it('executes all step requests and returns completed result when all succeed', async () => {
    const adapter = {
      initializeSession: jest.fn().mockResolvedValue(undefined),
      invokeStep: jest.fn()
        .mockResolvedValueOnce({
          success: true,
          status: 'completed',
          output: { ok: true, pageUrl: 'https://example.com' },
          snapshot: {
            id: 'snapshot-1',
            url: 'https://example.com',
            metadata: {
              pageFingerprint: 'fp-1',
            },
          },
        })
        .mockResolvedValueOnce({
          success: true,
          status: 'completed',
          output: { done: true, pageUrl: 'https://example.com/form' },
          snapshot: {
            id: 'snapshot-2',
            url: 'https://example.com/form',
          },
        }),
    };

    const registry = {
      resolve: jest.fn().mockReturnValue(adapter),
    };

    const orchestrator = new RuntimeExecutionOrchestrator(registry as never);
    const result = await orchestrator.executePhase({
      executionId: 'execution-1',
      phaseKey: 'phase_login',
      runtimeSessionId: 'runtime-1',
      steps: [
        {
          requestId: 'req-1',
          executionId: 'execution-1',
          stepId: 'step-1',
          runtimeType: 'browser',
          runtimeSessionId: 'runtime-1',
          capabilityType: 'browser_step',
          action: 'goto',
          input: { url: 'https://example.com' },
        },
        {
          requestId: 'req-2',
          executionId: 'execution-1',
          stepId: 'step-2',
          runtimeType: 'browser',
          runtimeSessionId: 'runtime-1',
          capabilityType: 'browser_step',
          action: 'fill',
          input: { selector: 'input[name=username]', value: 'test' },
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('completed');
    expect(result.stepResults).toHaveLength(2);
    expect(result.snapshotId).toBe('snapshot-2');
    expect(result.pageUrl).toBe('https://example.com/form');
    expect(result.pageFingerprint).toBe('fp-1');
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        artifactType: 'snapshot',
        snapshotId: 'snapshot-1',
        pageUrl: 'https://example.com',
        pageFingerprint: 'fp-1',
      }),
      expect.objectContaining({
        artifactType: 'snapshot',
        snapshotId: 'snapshot-2',
        pageUrl: 'https://example.com/form',
      }),
    ]);
    expect(adapter.initializeSession).toHaveBeenCalledTimes(1);
    expect(adapter.initializeSession).toHaveBeenCalledWith('runtime-1');
  });

  it('stops on first failed step and returns failed step metadata', async () => {
    const adapter = {
      initializeSession: jest.fn().mockResolvedValue(undefined),
      invokeStep: jest.fn()
        .mockResolvedValueOnce({
          success: true,
          status: 'completed',
          output: { ok: true, pageUrl: 'https://example.com' },
          snapshot: {
            id: 'snapshot-1',
            url: 'https://example.com',
          },
        })
        .mockResolvedValueOnce({
          success: false,
          status: 'failed',
          errorCode: 'SELECTOR_NOT_FOUND',
          errorMessage: 'Element not found',
          retryable: true,
          output: {
            pageUrl: 'https://example.com/login',
          },
        }),
    };

    const registry = {
      resolve: jest.fn().mockReturnValue(adapter),
    };

    const orchestrator = new RuntimeExecutionOrchestrator(registry as never);
    const result = await orchestrator.executePhase({
      executionId: 'execution-1',
      phaseKey: 'phase_login',
      runtimeSessionId: 'runtime-1',
      steps: [
        {
          requestId: 'req-1',
          executionId: 'execution-1',
          stepId: 'step-1',
          runtimeType: 'browser',
          runtimeSessionId: 'runtime-1',
          capabilityType: 'browser_step',
          action: 'goto',
          input: { url: 'https://example.com' },
        },
        {
          requestId: 'req-2',
          executionId: 'execution-1',
          stepId: 'step-2',
          runtimeType: 'browser',
          runtimeSessionId: 'runtime-1',
          capabilityType: 'browser_step',
          action: 'fill',
          input: { selector: 'input[name=username]', value: 'test' },
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.failedStepId).toBe('step-2');
    expect(result.failedAction).toBe('fill');
    expect(result.errorCode).toBe('SELECTOR_NOT_FOUND');
    expect(result.snapshotId).toBe('snapshot-1');
    expect(result.pageUrl).toBe('https://example.com/login');
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        artifactType: 'snapshot',
        snapshotId: 'snapshot-1',
        pageUrl: 'https://example.com',
      }),
      expect.objectContaining({
        artifactType: 'page_state',
        pageUrl: 'https://example.com/login',
      }),
    ]);
    expect(adapter.initializeSession).toHaveBeenCalledTimes(1);
  });

  it('initializes each runtime session only once per phase', async () => {
    const adapter = {
      routeKeys: ['browser:browser.step'] as const,
      initializeSession: jest.fn().mockResolvedValue(undefined),
      invokeStep: jest.fn()
        .mockResolvedValueOnce({
          success: true,
          status: 'completed',
          output: { ok: true },
        })
        .mockResolvedValueOnce({
          success: true,
          status: 'completed',
          output: { ok: true },
        })
        .mockResolvedValueOnce({
          success: true,
          status: 'completed',
          output: { ok: true },
        }),
    };

    const registry = {
      resolve: jest.fn().mockReturnValue(adapter),
    };

    const orchestrator = new RuntimeExecutionOrchestrator(registry as never);

    await orchestrator.executePhase({
      executionId: 'execution-1',
      phaseKey: 'phase_login',
      runtimeSessionId: 'runtime-1',
      steps: [
        {
          requestId: 'req-1',
          executionId: 'execution-1',
          stepId: 'step-1',
          runtimeType: 'browser',
          runtimeSessionId: 'runtime-1',
          capabilityType: 'browser.step',
          action: 'goto',
          input: { url: 'https://example.com' },
        },
        {
          requestId: 'req-2',
          executionId: 'execution-1',
          stepId: 'step-2',
          runtimeType: 'browser',
          runtimeSessionId: 'runtime-1',
          capabilityType: 'browser.step',
          action: 'fill',
          input: { selector: 'input[name=username]', value: 'test' },
        },
        {
          requestId: 'req-3',
          executionId: 'execution-1',
          stepId: 'step-3',
          runtimeType: 'browser',
          runtimeSessionId: 'runtime-2',
          capabilityType: 'browser.step',
          action: 'click',
          input: { selector: 'button[type=submit]' },
        },
      ],
    });

    expect(adapter.initializeSession).toHaveBeenCalledTimes(2);
    expect(adapter.initializeSession).toHaveBeenNthCalledWith(1, 'runtime-1');
    expect(adapter.initializeSession).toHaveBeenNthCalledWith(2, 'runtime-2');
  });
});
