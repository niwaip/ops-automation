import { CapabilityReleaseBrowserRuntimeLoopExecutorService } from './capability-release-browser-runtime-loop-executor.service';
import { BrowserRuntimeExecutionContext, BrowserRuntimeMutableState } from './capability-release-browser-runtime.types';

describe('CapabilityReleaseBrowserRuntimeLoopExecutorService', () => {
  let service: CapabilityReleaseBrowserRuntimeLoopExecutorService;
  let stepExecutor: any;
  let supportService: any;
  let resultStateService: any;

  beforeEach(() => {
    stepExecutor = {
      executeSequence: jest.fn().mockResolvedValue(null),
    };
    supportService = {
      evaluateLoopStopCondition: jest.fn().mockReturnValue(true), // stop condition met after iteration
      extractBrowserStepText: jest.fn().mockReturnValue('0'),
      reportApproveThresholdDebug: jest.fn(),
    };
    resultStateService = {
      nextAttempt: jest.fn().mockReturnValue(1),
      recordWorkerResult: jest.fn(),
    };

    service = new CapabilityReleaseBrowserRuntimeLoopExecutorService(
      stepExecutor,
      supportService,
      resultStateService
    );
  });

  it('resumes execution directly from resumeFromStepId inside loop iteration', async () => {
    const loopPlan = {
      mode: 'repeat_until',
      maxIterations: 5,
      preLoopSteps: [{ id: 'step_1', action: 'goto' }],
      iterationSteps: [
        { id: 'step_7', action: 'click' },
        { id: 'step_8', action: 'read_value' },
        { id: 'step_9', action: 'branch' },
        { id: 'step_10', action: 'click' },
        { id: 'step_11', action: 'click' },
      ],
      postLoopSteps: [{ id: 'step_12', action: 'click' }],
      stopWhen: {
        conditionFn: '!String(value).includes("保留中")',
        description: '无保留中',
        read: {
          step: { id: 'stop_read', action: 'read_page' },
        },
      },
      onNoProgress: 'stop',
    };

    const context: BrowserRuntimeExecutionContext = {
      release: { id: 'rel-1' } as any,
      skillId: 'skill-1',
      options: {
        executionId: 'exec-1',
        metadata: {
          resumeFromStepId: 'step_10',
          runtimeEvidence: {
            currentLoopIteration: 2,
          },
        },
      },
      accessors: {} as any,
      runtimeInput: {},
      runtimeSessionId: 'session-1',
      runtimeExecutionId: 'exec-1',
      browserWorkerUrl: 'http://localhost:3004',
      backend: 'cli',
      planValidation: {} as any,
      runtimeStepsToExecute: [],
      targetRuntimeStep: null,
      loopPlan: loopPlan as any,
      state: {} as any,
      failWithAudit: jest.fn(),
    };

    const state: BrowserRuntimeMutableState = {
      preserveRuntimeSession: false,
      startedAt: new Date().toISOString(),
      currentPageUrl: 'http://test',
      captureOrdinal: 0,
      attemptByStepId: {},
      stepResults: [],
      variables: {},
      runtimeEvidence: {},
      warnings: [],
      contentCandidates: [],
      logs: [],
    };

    // Mock readLoopStopSignal by spying on private method or mocking axios
    const readSpy = jest
      .spyOn(service as any, 'readLoopStopSignal')
      .mockResolvedValue({ failure: null, rawValue: 'none', normalizedValue: 'none' });

    const result = await service.executeLoopPlan(context, state);

    expect(result).toBeNull(); // execution completed without error

    // 1. Should NOT execute preLoopSteps because we are resuming inside iteration 2
    expect(stepExecutor.executeSequence).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([expect.objectContaining({ id: 'step_1' })]),
      'PreLoop',
      expect.anything()
    );

    // 2. Iteration 2 should execute remaining steps: ['step_10', 'step_11']
    expect(stepExecutor.executeSequence).toHaveBeenCalledWith(
      context,
      [
        expect.objectContaining({ id: 'step_10' }),
        expect.objectContaining({ id: 'step_11' }),
      ],
      'Loop 2 (Resumed)',
      state
    );

    // 3. PostLoopSteps should be executed after loop completes
    expect(stepExecutor.executeSequence).toHaveBeenCalledWith(
      context,
      [expect.objectContaining({ id: 'step_12' })],
      'PostLoop',
      state
    );

    readSpy.mockRestore();
  });
});
