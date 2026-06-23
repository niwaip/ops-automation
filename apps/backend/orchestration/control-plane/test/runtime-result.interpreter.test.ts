import { RuntimeResultInterpreter } from '../src/modules/execution/step-runner/runtime/runtime-result.interpreter';

describe('RuntimeResultInterpreter', () => {
  const createInterpreter = () => {
    const prisma = {
      execution: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const executionStepService = {
      finishBrowserStep: jest.fn(),
      finishSystemSkillStep: jest.fn(),
      markStepWaiting: jest.fn(),
    };

    const interpreter = new RuntimeResultInterpreter(
      prisma as never,
      executionStepService as never
    );

    return { interpreter, prisma, executionStepService };
  };

  it('handles browser takeover without advancing or failing the execution', async () => {
    const { interpreter, executionStepService } = createInterpreter();
    const emitEvent = jest.fn().mockResolvedValue(undefined);
    const advanceExecutionFlow = jest.fn().mockResolvedValue(undefined);
    const failExecution = jest.fn().mockResolvedValue(undefined);
    const takeover = jest.fn().mockResolvedValue(undefined);

    await interpreter.handleBrowserStepResult(
      {
        executionId: 'execution-1',
        runtimeSessionId: 'runtime-1',
        stepId: 'step-1',
        emitEvent,
        advanceExecutionFlow,
        failExecution,
        takeover,
      },
      {
        success: false,
        status: 'takeover_required',
        errorCode: 'RUNTIME_TAKEOVER_REQUIRED',
        requiresTakeover: true,
        takeoverReason: 'captcha_required',
        snapshot: { id: 'snapshot-1' },
      }
    );

    expect(executionStepService.finishBrowserStep).toHaveBeenCalledWith('step-1', {
      success: false,
      output: undefined,
      errorCode: 'RUNTIME_TAKEOVER_REQUIRED',
      errorMessage: undefined,
      snapshotId: 'snapshot-1',
      shouldTakeover: true,
    });
    expect(emitEvent).toHaveBeenCalledWith('step.failed', {
      runtimeSessionId: 'runtime-1',
      stepId: 'step-1',
      snapshotId: 'snapshot-1',
      errorCode: 'RUNTIME_TAKEOVER_REQUIRED',
      shouldTakeover: true,
    });
    expect(takeover).toHaveBeenCalledWith('captcha_required');
    expect(advanceExecutionFlow).not.toHaveBeenCalled();
    expect(failExecution).not.toHaveBeenCalled();
  });

  it('persists skill runtime success, emits event, and advances execution', async () => {
    const { interpreter, prisma, executionStepService } = createInterpreter();
    const emitEvent = jest.fn().mockResolvedValue(undefined);
    const advanceExecutionFlow = jest.fn().mockResolvedValue(undefined);
    const failExecution = jest.fn().mockResolvedValue(undefined);

    prisma.execution.findUnique.mockResolvedValue({
      normalizedInputJson: {
        __usage: {
          prompt_tokens: 5,
          completion_tokens: 3,
          total_tokens: 8,
          completion_tokens_details: {
            reasoning_tokens: 1,
          },
        },
      },
    });
    prisma.execution.update.mockResolvedValue(undefined);

    await interpreter.handleSkillRuntimeResult(
      {
        executionId: 'execution-2',
        runtimeSessionId: 'runtime-2',
        stepId: 'step-2',
        emitEvent,
        advanceExecutionFlow,
        failExecution,
      },
      {
        success: true,
        status: 'completed',
        output: {
          downloadUrl: 'http://localhost:3009/studio/download/doc-1',
        },
        rawResult: {
          runtime: 'capability_runtime',
          releaseId: 'release-1',
          capabilityId: 'capability-1',
          capabilityVersion: 'v1',
          publishedSkillId: 'published-1',
          logs: ['ok'],
          usage: {
            prompt_tokens: 7,
            completion_tokens: 4,
            total_tokens: 11,
            completion_tokens_details: {
              reasoning_tokens: 2,
            },
          },
        },
      }
    );

    expect(executionStepService.finishSystemSkillStep).toHaveBeenCalledWith('step-2', {
      success: true,
      runtime: 'capability_runtime',
      releaseId: 'release-1',
      capabilityId: 'capability-1',
      capabilityVersion: 'v1',
      publishedSkillId: 'published-1',
      result: { downloadUrl: 'http://localhost:3009/studio/download/doc-1' },
      output: { downloadUrl: 'http://localhost:3009/studio/download/doc-1' },
      logs: ['ok'],
      error: null,
    });
    expect(prisma.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-2' },
      data: {
        resultJson: { downloadUrl: 'http://localhost:3009/studio/download/doc-1' },
        normalizedInputJson: {
          __usage: {
            prompt_tokens: 12,
            completion_tokens: 7,
            total_tokens: 19,
            completion_tokens_details: {
              reasoning_tokens: 3,
            },
          },
        },
      },
    });
    expect(emitEvent).toHaveBeenCalledWith('step.succeeded', {
      runtimeSessionId: 'runtime-2',
      stepId: 'step-2',
      result: { downloadUrl: 'http://localhost:3009/studio/download/doc-1' },
      error: undefined,
      shouldTakeover: false,
    });
    expect(advanceExecutionFlow).toHaveBeenCalled();
    expect(failExecution).not.toHaveBeenCalled();
  });

  it('enters waiting_input when runtime returns waiting status', async () => {
    const { interpreter, executionStepService } = createInterpreter();
    const emitEvent = jest.fn().mockResolvedValue(undefined);
    const advanceExecutionFlow = jest.fn().mockResolvedValue(undefined);
    const failExecution = jest.fn().mockResolvedValue(undefined);
    const enterWaitingInput = jest.fn().mockResolvedValue(undefined);

    await interpreter.handleBrowserStepResult(
      {
        executionId: 'execution-waiting',
        runtimeSessionId: 'runtime-waiting',
        stepId: 'step-waiting',
        emitEvent,
        advanceExecutionFlow,
        failExecution,
        enterWaitingInput,
      },
      {
        success: false,
        status: 'waiting',
        errorCode: 'EXECUTION_INPUT_REQUIRED',
        errorMessage: 'missing fields',
        output: {
          requiredInputs: [{ name: 'url', type: 'string' }],
        },
      }
    );

    expect(executionStepService.markStepWaiting).toHaveBeenCalledWith('step-waiting', {
      requiredInputs: [{ name: 'url', type: 'string' }],
      outputJson: {
        requiredInputs: [{ name: 'url', type: 'string' }],
      },
      errorCode: 'EXECUTION_INPUT_REQUIRED',
      errorMessage: 'missing fields',
    });
    expect(enterWaitingInput).toHaveBeenCalledWith(
      [{ name: 'url', type: 'string' }],
      'missing fields'
    );
    expect(emitEvent).not.toHaveBeenCalled();
    expect(advanceExecutionFlow).not.toHaveBeenCalled();
    expect(failExecution).not.toHaveBeenCalled();
  });

  it('enters pending_approval when runtime returns blocked status', async () => {
    const { interpreter, executionStepService } = createInterpreter();
    const emitEvent = jest.fn().mockResolvedValue(undefined);
    const advanceExecutionFlow = jest.fn().mockResolvedValue(undefined);
    const failExecution = jest.fn().mockResolvedValue(undefined);
    const enterPendingApproval = jest.fn().mockResolvedValue(undefined);

    await interpreter.handleSkillRuntimeResult(
      {
        executionId: 'execution-blocked',
        runtimeSessionId: 'runtime-blocked',
        stepId: 'step-blocked',
        emitEvent,
        advanceExecutionFlow,
        failExecution,
        enterPendingApproval,
      },
      {
        success: false,
        status: 'blocked',
        errorCode: 'EXECUTION_APPROVAL_REQUIRED',
        errorMessage: 'approval required by policy',
      }
    );

    expect(enterPendingApproval).toHaveBeenCalledWith('approval required by policy');
    expect(executionStepService.finishSystemSkillStep).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
    expect(advanceExecutionFlow).not.toHaveBeenCalled();
    expect(failExecution).not.toHaveBeenCalled();
  });

  it('fails the execution when skill runtime returns an unsuccessful result', async () => {
    const { interpreter, executionStepService } = createInterpreter();
    const emitEvent = jest.fn().mockResolvedValue(undefined);
    const advanceExecutionFlow = jest.fn().mockResolvedValue(undefined);
    const failExecution = jest.fn().mockResolvedValue(undefined);

    await interpreter.handleSkillRuntimeResult(
      {
        executionId: 'execution-3',
        runtimeSessionId: 'runtime-3',
        stepId: 'step-3',
        emitEvent,
        advanceExecutionFlow,
        failExecution,
      },
      {
        success: false,
        status: 'failed',
        errorCode: 'CAPABILITY_RUNTIME_FAILED',
        errorMessage: 'runtime failed',
        rawResult: {
          runtime: 'capability_runtime',
          releaseId: 'release-2',
          capabilityId: 'capability-2',
          publishedSkillId: 'published-2',
          logs: [],
        },
      }
    );

    expect(executionStepService.finishSystemSkillStep).toHaveBeenCalledWith('step-3', {
      success: false,
      runtime: 'capability_runtime',
      releaseId: 'release-2',
      capabilityId: 'capability-2',
      capabilityVersion: null,
      publishedSkillId: 'published-2',
      result: null,
      output: null,
      logs: [],
      error: 'runtime failed',
    });
    expect(emitEvent).toHaveBeenCalledWith('step.failed', {
      runtimeSessionId: 'runtime-3',
      stepId: 'step-3',
      result: null,
      error: 'runtime failed',
      shouldTakeover: false,
    });
    expect(failExecution).toHaveBeenCalledWith('runtime failed', 'CAPABILITY_RUNTIME_FAILED');
    expect(advanceExecutionFlow).not.toHaveBeenCalled();
  });

  it('requests takeover when skill runtime returns takeover_required', async () => {
    const { interpreter, executionStepService } = createInterpreter();
    const emitEvent = jest.fn().mockResolvedValue(undefined);
    const advanceExecutionFlow = jest.fn().mockResolvedValue(undefined);
    const failExecution = jest.fn().mockResolvedValue(undefined);
    const takeover = jest.fn().mockResolvedValue(undefined);

    await interpreter.handleSkillRuntimeResult(
      {
        executionId: 'execution-4',
        runtimeSessionId: 'runtime-4',
        stepId: 'step-4',
        emitEvent,
        advanceExecutionFlow,
        failExecution,
        takeover,
      },
      {
        success: false,
        status: 'takeover_required',
        errorCode: 'BROWSER_WORKER_EXECUTION_FAILED',
        errorMessage: 'page did not reach expected state',
        requiresTakeover: true,
        takeoverReason: 'browser page drifted after login',
        output: {
          status: 'takeover_required',
        },
        rawResult: {
          runtime: 'temporal_workflow',
          releaseId: 'release-4',
          capabilityId: 'capability-4',
          publishedSkillId: 'published-4',
          logs: ['takeover'],
        },
      }
    );

    expect(executionStepService.finishSystemSkillStep).toHaveBeenCalledWith('step-4', {
      success: false,
      runtime: 'temporal_workflow',
      releaseId: 'release-4',
      capabilityId: 'capability-4',
      capabilityVersion: null,
      publishedSkillId: 'published-4',
      result: { status: 'takeover_required' },
      output: { status: 'takeover_required' },
      logs: ['takeover'],
      error: 'page did not reach expected state',
    });
    expect(emitEvent).toHaveBeenCalledWith('step.failed', {
      runtimeSessionId: 'runtime-4',
      stepId: 'step-4',
      result: { status: 'takeover_required' },
      error: 'page did not reach expected state',
      shouldTakeover: true,
    });
    expect(takeover).toHaveBeenCalledWith('browser page drifted after login');
    expect(failExecution).not.toHaveBeenCalled();
    expect(advanceExecutionFlow).not.toHaveBeenCalled();
  });
});
