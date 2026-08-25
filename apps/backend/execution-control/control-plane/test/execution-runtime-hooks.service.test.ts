import { ExecutionRuntimeHooksService } from '../src/modules/execution/step-runner/runtime/execution-runtime-hooks.service';

describe('ExecutionRuntimeHooksService', () => {
  it('builds failure hooks that preserve the runtime failure callbacks', async () => {
    const executionBrowserOrchestrationService = {
      extractStepPhaseMetadata: jest.fn(),
      extractStepBrowserPhaseConfig: jest.fn(),
      buildBrowserPhasePolicyContext: jest.fn(),
      buildBrowserPhaseTraceContext: jest.fn(),
      extractBrowserPhaseInput: jest.fn(),
    };
    const executionPhaseSyncService = {
      syncPhaseAfterStepResult: jest.fn(),
      markPhaseRunningForStep: jest.fn(),
      initializeWorkflowActivityPhasesForSkillExecution: jest.fn(),
    };
    const executionFailureService = {
      skipSingleStep: jest.fn(),
    };
    const service = new ExecutionRuntimeHooksService(
      executionBrowserOrchestrationService as never,
      executionPhaseSyncService as never,
      executionFailureService as never
    );
    const callbacks = {
      emitEvent: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      closeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
    };

    const hooks = service.createFailureHooks(callbacks);

    await hooks.emitEvent('execution-1', 'step.failed', { reason: 'boom' });
    await hooks.updateStatus('execution-1', 'failed');
    await hooks.closeRuntimeSessionQuietly('runtime-1', 'execution-1', 'boom');

    expect(callbacks.emitEvent).toHaveBeenCalledWith('execution-1', 'step.failed', {
      reason: 'boom',
    });
    expect(callbacks.updateStatus).toHaveBeenCalledWith('execution-1', 'failed');
    expect(callbacks.closeRuntimeSessionQuietly).toHaveBeenCalledWith(
      'runtime-1',
      'execution-1',
      'boom'
    );
  });

  it('builds human control hooks that preserve the takeover callbacks', async () => {
    const executionBrowserOrchestrationService = {
      extractStepPhaseMetadata: jest.fn(),
      extractStepBrowserPhaseConfig: jest.fn(),
      buildBrowserPhasePolicyContext: jest.fn(),
      buildBrowserPhaseTraceContext: jest.fn(),
      extractBrowserPhaseInput: jest.fn(),
    };
    const executionPhaseSyncService = {
      syncPhaseAfterStepResult: jest.fn(),
      markPhaseRunningForStep: jest.fn(),
      initializeWorkflowActivityPhasesForSkillExecution: jest.fn(),
    };
    const executionFailureService = {
      skipSingleStep: jest.fn(),
    };
    const service = new ExecutionRuntimeHooksService(
      executionBrowserOrchestrationService as never,
      executionPhaseSyncService as never,
      executionFailureService as never
    );
    const callbacks = {
      getExecutionDto: jest.fn().mockResolvedValue({ id: 'execution-1' }),
      emitEvent: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      freezeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
      resumeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
      advanceExecutionFlow: jest.fn().mockResolvedValue(undefined),
    };

    const hooks = service.createHumanControlHooks(callbacks);

    await expect(hooks.getExecutionDto('execution-1', { id: 'user-1', role: 'admin' })).resolves.toEqual({
      id: 'execution-1',
    });
    await hooks.emitEvent('execution-1', 'execution.takeover_requested', { reason: 'need-human' });
    await hooks.updateStatus('execution-1', 'running');
    await hooks.freezeRuntimeSessionQuietly('runtime-1', 'execution-1', 'need-human');
    await hooks.resumeRuntimeSessionQuietly('runtime-1', 'execution-1', 'step-1');
    await hooks.advanceExecutionFlow('execution-1', 'runtime-1');

    expect(callbacks.getExecutionDto).toHaveBeenCalledWith('execution-1', {
      id: 'user-1',
      role: 'admin',
    });
    expect(callbacks.emitEvent).toHaveBeenCalledWith(
      'execution-1',
      'execution.takeover_requested',
      { reason: 'need-human' }
    );
    expect(callbacks.updateStatus).toHaveBeenCalledWith('execution-1', 'running');
    expect(callbacks.freezeRuntimeSessionQuietly).toHaveBeenCalledWith(
      'runtime-1',
      'execution-1',
      'need-human'
    );
    expect(callbacks.resumeRuntimeSessionQuietly).toHaveBeenCalledWith(
      'runtime-1',
      'execution-1',
      'step-1'
    );
    expect(callbacks.advanceExecutionFlow).toHaveBeenCalledWith('execution-1', 'runtime-1');
  });

  it('builds system skill result hooks that preserve runtime-scoped callbacks', async () => {
    const executionBrowserOrchestrationService = {
      extractStepPhaseMetadata: jest.fn(),
      extractStepBrowserPhaseConfig: jest.fn(),
      buildBrowserPhasePolicyContext: jest.fn(),
      buildBrowserPhaseTraceContext: jest.fn(),
      extractBrowserPhaseInput: jest.fn(),
    };
    const executionPhaseSyncService = {
      syncPhaseAfterStepResult: jest.fn(),
      markPhaseRunningForStep: jest.fn(),
      initializeWorkflowActivityPhasesForSkillExecution: jest.fn(),
    };
    const executionFailureService = {
      skipSingleStep: jest.fn(),
    };
    const service = new ExecutionRuntimeHooksService(
      executionBrowserOrchestrationService as never,
      executionPhaseSyncService as never,
      executionFailureService as never
    );
    const failureCallbacks = {
      emitEvent: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      closeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
    };
    const humanControlCallbacks = {
      getExecutionDto: jest.fn().mockResolvedValue({ id: 'execution-1' }),
      emitEvent: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      freezeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
      resumeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
      advanceExecutionFlow: jest.fn().mockResolvedValue(undefined),
    };
    const callbacks = {
      emitEvent: jest.fn().mockResolvedValue(undefined),
      advanceExecutionFlow: jest.fn().mockResolvedValue(undefined),
      failExecutionFromRuntimeStep: jest.fn().mockResolvedValue(undefined),
      requestSystemTakeover: jest.fn().mockResolvedValue(undefined),
      enterRuntimeWaitingInput: jest.fn().mockResolvedValue(undefined),
      enterPendingApprovalFromRuntimeStep: jest.fn().mockResolvedValue(undefined),
      loadWorkflowActivityPhaseDefinitions: jest.fn().mockResolvedValue([]),
    };

    const hooks = service.createSystemSkillResultHooks({
      executionId: 'execution-1',
      runtimeSessionId: 'runtime-1',
      stepId: 'step-1',
      ...callbacks,
      failureHooks: failureCallbacks,
      humanControlHooks: humanControlCallbacks,
    });

    await hooks.emitEvent('step.failed', { reason: 'boom' });
    await hooks.advanceExecutionFlow();
    await hooks.failExecution('boom', 'ERR_RUNTIME');
    await hooks.takeover('need-human');
    await hooks.enterWaitingInput([{ name: 'url' }], 'missing-input');
    await hooks.enterPendingApproval('awaiting-approval');
    await expect(
      hooks.loadWorkflowActivityPhaseDefinitions?.('capability-1', 'phase_01_skill')
    ).resolves.toEqual([]);

    expect(callbacks.emitEvent).toHaveBeenCalledWith(
      'execution-1',
      'step.failed',
      { reason: 'boom' },
      {
        runtimeSessionId: 'runtime-1',
        stepId: 'step-1',
      }
    );
    expect(callbacks.advanceExecutionFlow).toHaveBeenCalledWith('execution-1', 'runtime-1');
    expect(callbacks.failExecutionFromRuntimeStep).toHaveBeenCalledWith(
      {
        executionId: 'execution-1',
        stepId: 'step-1',
        failureReason: 'boom',
        failureCode: 'ERR_RUNTIME',
        runtimeSessionId: 'runtime-1',
      },
      expect.objectContaining({
        emitEvent: failureCallbacks.emitEvent,
        updateStatus: failureCallbacks.updateStatus,
        closeRuntimeSessionQuietly: failureCallbacks.closeRuntimeSessionQuietly,
      })
    );
    expect(callbacks.requestSystemTakeover).toHaveBeenCalledWith(
      'execution-1',
      'need-human',
      expect.objectContaining({
        getExecutionDto: humanControlCallbacks.getExecutionDto,
        emitEvent: humanControlCallbacks.emitEvent,
        updateStatus: humanControlCallbacks.updateStatus,
        freezeRuntimeSessionQuietly: humanControlCallbacks.freezeRuntimeSessionQuietly,
        resumeRuntimeSessionQuietly: humanControlCallbacks.resumeRuntimeSessionQuietly,
        advanceExecutionFlow: humanControlCallbacks.advanceExecutionFlow,
      })
    );
    expect(callbacks.enterRuntimeWaitingInput).toHaveBeenCalledWith(
      'execution-1',
      'runtime-1',
      'step-1',
      [{ name: 'url' }],
      'missing-input',
      expect.objectContaining({
        emitEvent: failureCallbacks.emitEvent,
        updateStatus: failureCallbacks.updateStatus,
        closeRuntimeSessionQuietly: failureCallbacks.closeRuntimeSessionQuietly,
      })
    );
    expect(callbacks.enterPendingApprovalFromRuntimeStep).toHaveBeenCalledWith(
      'execution-1',
      'awaiting-approval',
      expect.objectContaining({
        updateStatus: failureCallbacks.updateStatus,
      })
    );
  });

  it('builds flow runner hooks that preserve failure and execution callbacks', async () => {
    const executionBrowserOrchestrationService = {
      extractStepPhaseMetadata: jest.fn(),
      extractStepBrowserPhaseConfig: jest.fn(),
      buildBrowserPhasePolicyContext: jest.fn(),
      buildBrowserPhaseTraceContext: jest.fn(),
      extractBrowserPhaseInput: jest.fn(),
    };
    const executionPhaseSyncService = {
      syncPhaseAfterStepResult: jest.fn(),
      markPhaseRunningForStep: jest.fn(),
      initializeWorkflowActivityPhasesForSkillExecution: jest.fn(),
    };
    const executionFailureService = {
      skipSingleStep: jest.fn(),
    };
    const service = new ExecutionRuntimeHooksService(
      executionBrowserOrchestrationService as never,
      executionPhaseSyncService as never,
      executionFailureService as never
    );
    const failureCallbacks = {
      emitEvent: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      closeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
    };
    const callbacks = {
      completeActivePhasesOnExecutionSuccess: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      closeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
      extractStepUrl: jest.fn().mockReturnValue('https://example.com'),
      skipSingleStep: jest.fn().mockResolvedValue(undefined),
      failExecutionFromRuntimeStep: jest.fn().mockResolvedValue(undefined),
      executeBrowserGotoStep: jest.fn().mockResolvedValue(undefined),
      enterWaitingInput: jest.fn().mockResolvedValue(undefined),
      executeBrowserPhaseStep: jest.fn().mockResolvedValue(undefined),
      executeSystemSkillStep: jest.fn().mockResolvedValue(undefined),
      readBrowserTextBySelector: jest.fn().mockResolvedValue('text'),
    };

    const hooks = service.createFlowRunnerHooks({
      ...callbacks,
      failureHooks: failureCallbacks,
    });

    await hooks.completeActivePhasesOnExecutionSuccess('execution-1', 'runtime-1');
    await hooks.updateStatus('execution-1', 'succeeded');
    await hooks.closeRuntimeSessionQuietly('runtime-1', 'execution-1', 'done');
    expect(hooks.extractStepUrl({ id: 'step-1' }, { id: 'execution-1' })).toBe('https://example.com');
    await hooks.skipSingleStep('step-1', 'execution-1', 'missing-url');
    await hooks.failExecutionFromRuntimeStep({
      executionId: 'execution-1',
      stepId: 'step-unsupported',
      failureReason: 'unsupported',
      failureCode: 'UNSUPPORTED_EXECUTION_STEP',
      runtimeSessionId: 'runtime-1',
    });
    await hooks.executeBrowserGotoStep(
      { id: 'execution-1' },
      'runtime-1',
      'step-1',
      'https://example.com'
    );
    await hooks.enterWaitingInput({ id: 'execution-1' }, 'step-input-1');
    await hooks.executeBrowserPhaseStep({ id: 'execution-1' }, 'runtime-1', 'step-phase-1');
    await hooks.executeSystemSkillStep({ id: 'execution-1' }, 'runtime-1', 'step-skill-1');
    await expect(hooks.readBrowserTextBySelector?.('runtime-1', '#status')).resolves.toBe('text');

    expect(callbacks.completeActivePhasesOnExecutionSuccess).toHaveBeenCalledWith(
      'execution-1',
      'runtime-1'
    );
    expect(callbacks.updateStatus).toHaveBeenCalledWith('execution-1', 'succeeded');
    expect(callbacks.closeRuntimeSessionQuietly).toHaveBeenCalledWith(
      'runtime-1',
      'execution-1',
      'done'
    );
    expect(callbacks.failExecutionFromRuntimeStep).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: 'execution-1',
        failureCode: 'UNSUPPORTED_EXECUTION_STEP',
      }),
      expect.objectContaining({
        emitEvent: failureCallbacks.emitEvent,
        updateStatus: failureCallbacks.updateStatus,
      })
    );
    expect(callbacks.extractStepUrl).toHaveBeenCalledWith(
      { id: 'step-1' },
      { id: 'execution-1' }
    );
    expect(callbacks.skipSingleStep).toHaveBeenCalledWith(
      'step-1',
      'execution-1',
      'missing-url',
      expect.objectContaining({
        emitEvent: failureCallbacks.emitEvent,
        updateStatus: failureCallbacks.updateStatus,
        closeRuntimeSessionQuietly: failureCallbacks.closeRuntimeSessionQuietly,
      })
    );
    expect(callbacks.executeBrowserGotoStep).toHaveBeenCalledWith(
      { id: 'execution-1' },
      'runtime-1',
      'step-1',
      'https://example.com'
    );
    expect(callbacks.enterWaitingInput).toHaveBeenCalledWith(
      { id: 'execution-1' },
      'step-input-1'
    );
    expect(callbacks.executeBrowserPhaseStep).toHaveBeenCalledWith(
      { id: 'execution-1' },
      'runtime-1',
      'step-phase-1'
    );
    expect(callbacks.executeSystemSkillStep).toHaveBeenCalledWith(
      { id: 'execution-1' },
      'runtime-1',
      'step-skill-1'
    );
    expect(callbacks.readBrowserTextBySelector).toHaveBeenCalledWith('runtime-1', '#status');
  });

  it('builds browser orchestration hooks that delegate phase sync and takeover', async () => {
    const executionBrowserOrchestrationService = {
      extractStepPhaseMetadata: jest.fn(),
      extractStepBrowserPhaseConfig: jest.fn(),
      buildBrowserPhasePolicyContext: jest.fn(),
      buildBrowserPhaseTraceContext: jest.fn(),
      extractBrowserPhaseInput: jest.fn(),
    };
    const executionPhaseSyncService = {
      syncPhaseAfterStepResult: jest.fn().mockResolvedValue(undefined),
      markPhaseRunningForStep: jest.fn(),
      initializeWorkflowActivityPhasesForSkillExecution: jest.fn(),
    };
    const executionFailureService = {
      skipSingleStep: jest.fn(),
    };
    const service = new ExecutionRuntimeHooksService(
      executionBrowserOrchestrationService as never,
      executionPhaseSyncService as never,
      executionFailureService as never
    );
    const takeover = jest.fn().mockResolvedValue(undefined);
    const hooks = service.createBrowserOrchestrationHooks({
      emitEvent: jest.fn().mockResolvedValue(undefined),
      advanceExecutionFlow: jest.fn().mockResolvedValue(undefined),
      enterRuntimeWaitingInput: jest.fn().mockResolvedValue(undefined),
      enterPendingApprovalFromRuntimeStep: jest.fn().mockResolvedValue(undefined),
      failExecutionFromRuntimeStep: jest.fn().mockResolvedValue(undefined),
      takeover,
      failureHooks: {
        emitEvent: jest.fn().mockResolvedValue(undefined),
        updateStatus: jest.fn().mockResolvedValue(undefined),
        closeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
      },
    });

    await hooks.syncPhaseAfterStepResult(
      'execution-1',
      'runtime-1',
      { success: true, status: 'completed' },
      {
        phaseKey: 'phase_01_browser',
        phaseName: '浏览器步骤',
        phaseType: 'browser',
      },
      { id: 'step-1' }
    );
    await hooks.takeover('execution-1', 'need-human');

    expect(executionPhaseSyncService.syncPhaseAfterStepResult).toHaveBeenCalledWith(
      'execution-1',
      'runtime-1',
      { success: true, status: 'completed' },
      {
        phaseKey: 'phase_01_browser',
        phaseName: '浏览器步骤',
        phaseType: 'browser',
      },
      { id: 'step-1' }
    );
    expect(takeover).toHaveBeenCalledWith('execution-1', 'need-human');
  });

  it('builds step executor hooks that delegate extraction and skip failure handling', async () => {
    const executionBrowserOrchestrationService = {
      extractStepPhaseMetadata: jest.fn().mockReturnValue({
        phaseKey: 'phase_01_skill',
        phaseName: '执行技能',
        phaseType: 'system_skill',
      }),
      extractStepBrowserPhaseConfig: jest.fn().mockReturnValue({ commands: [] }),
      buildBrowserPhasePolicyContext: jest.fn().mockReturnValue({ riskLevel: 'L1' }),
      buildBrowserPhaseTraceContext: jest.fn().mockReturnValue({ actorType: 'system' }),
      extractBrowserPhaseInput: jest.fn().mockReturnValue({ foo: 'bar' }),
    };
    const executionPhaseSyncService = {
      syncPhaseAfterStepResult: jest.fn(),
      markPhaseRunningForStep: jest.fn().mockResolvedValue(undefined),
      initializeWorkflowActivityPhasesForSkillExecution: jest.fn().mockResolvedValue(undefined),
    };
    const executionFailureService = {
      skipSingleStep: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ExecutionRuntimeHooksService(
      executionBrowserOrchestrationService as never,
      executionPhaseSyncService as never,
      executionFailureService as never
    );
    const input = {
      emitEvent: jest.fn().mockResolvedValue(undefined),
      advanceExecutionFlow: jest.fn().mockResolvedValue(undefined),
      handleBrowserStepResult: jest.fn().mockResolvedValue(undefined),
      handleBrowserPhaseStepResult: jest.fn().mockResolvedValue(undefined),
      handleSystemSkillStepResult: jest.fn().mockResolvedValue(undefined),
      failureHooks: {
        emitEvent: jest.fn().mockResolvedValue(undefined),
        updateStatus: jest.fn().mockResolvedValue(undefined),
        closeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
      },
    };
    const hooks = service.createStepExecutorHooks(input);
    const step = { id: 'step-1' };

    expect(hooks.extractStepPhaseMetadata(step)).toEqual({
      phaseKey: 'phase_01_skill',
      phaseName: '执行技能',
      phaseType: 'system_skill',
    });

    await hooks.markPhaseRunningForStep('execution-1', 'runtime-1', undefined, step);
    await hooks.initializeWorkflowActivityPhasesForSkillExecution(
      'execution-1',
      'runtime-1',
      'capability-1',
      undefined,
      step
    );
    await hooks.skipSingleStep('step-1', 'execution-1', 'bad-step');

    expect(executionPhaseSyncService.markPhaseRunningForStep).toHaveBeenCalledWith(
      'execution-1',
      'runtime-1',
      undefined,
      step
    );
    expect(
      executionPhaseSyncService.initializeWorkflowActivityPhasesForSkillExecution
    ).toHaveBeenCalledWith('execution-1', 'runtime-1', 'capability-1', undefined, step);
    expect(executionFailureService.skipSingleStep).toHaveBeenCalledWith(
      'step-1',
      'execution-1',
      'bad-step',
      expect.objectContaining({
        emitEvent: input.failureHooks.emitEvent,
        updateStatus: input.failureHooks.updateStatus,
        closeRuntimeSessionQuietly: input.failureHooks.closeRuntimeSessionQuietly,
      })
    );
  });
});
