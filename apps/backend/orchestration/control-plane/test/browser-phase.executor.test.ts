import { BrowserPhaseExecutor } from '../src/modules/execution/step-runner/browser-phase.executor';

describe('BrowserPhaseExecutor', () => {
  it('marks phase completed when all runtime steps succeed', async () => {
    const browserPhaseRecoveryPlanner = {
      plan: jest.fn(),
    };
    const browserRuntimeAdapter = {
      inspectState: jest.fn(),
      assertState: jest.fn(),
    };
    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue(null),
      markRunning: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      markWaitingTakeover: jest.fn().mockResolvedValue(undefined),
      appendSteps: jest.fn().mockResolvedValue(undefined),
      appendArtifacts: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeExecutionOrchestrator = {
      executePhase: jest.fn().mockResolvedValue({
        success: true,
        status: 'completed',
        stepResults: [
          {
            success: true,
            status: 'completed',
            output: { ok: true },
          },
        ],
        output: { ok: true },
      }),
    };

    const executor = new BrowserPhaseExecutor(
      browserPhaseRecoveryPlanner as never,
      browserRuntimeAdapter as never,
      executionPhaseService as never,
      runtimeExecutionOrchestrator as never
    );

    const result = await executor.execute({
      executionId: 'execution-1',
      phaseKey: 'phase_login',
      phaseName: '登录阶段',
      phaseType: 'browser_login',
      runtimeSessionId: 'runtime-1',
      commands: [
        {
          stepId: 'step-1',
          capabilityType: 'browser_step',
          action: 'goto',
          input: { url: 'https://example.com' },
        },
      ],
      input: { url: 'https://example.com' },
      precheck: { matched: false },
      postcheck: { matched: true },
    });

    expect(executionPhaseService.markRunning).toHaveBeenCalled();
    expect(executionPhaseService.markCompleted).toHaveBeenCalled();
    expect(executionPhaseService.markFailed).not.toHaveBeenCalled();
    expect(executionPhaseService.appendArtifacts).toHaveBeenCalledWith(
      'execution-1',
      'phase_login',
      []
    );
    expect(browserPhaseRecoveryPlanner.plan).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('short-circuits phase execution when precheck is already satisfied', async () => {
    const browserPhaseRecoveryPlanner = {
      plan: jest.fn(),
    };
    const browserRuntimeAdapter = {
      inspectState: jest.fn(),
      assertState: jest.fn(),
    };
    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue(null),
      markRunning: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      markWaitingTakeover: jest.fn().mockResolvedValue(undefined),
      appendSteps: jest.fn().mockResolvedValue(undefined),
      appendArtifacts: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeExecutionOrchestrator = {
      executePhase: jest.fn(),
    };

    const executor = new BrowserPhaseExecutor(
      browserPhaseRecoveryPlanner as never,
      browserRuntimeAdapter as never,
      executionPhaseService as never,
      runtimeExecutionOrchestrator as never
    );

    const result = await executor.execute({
      executionId: 'execution-1',
      phaseKey: 'phase_login',
      phaseName: '登录阶段',
      phaseType: 'browser_login',
      runtimeSessionId: 'runtime-1',
      commands: [],
      precheck: { matched: true },
    });

    expect(runtimeExecutionOrchestrator.executePhase).not.toHaveBeenCalled();
    expect(executionPhaseService.markCompleted).toHaveBeenCalled();
    expect(result.output).toEqual({
      shortCircuitedBy: 'precheck',
      precheck: { matched: true },
    });
  });

  it('retries the same phase when runtime execution fails with a retryable error', async () => {
    const browserPhaseRecoveryPlanner = {
      plan: jest.fn().mockReturnValueOnce({ action: 'retry_same_phase', reason: 'retry once' }),
    };
    const browserRuntimeAdapter = {
      inspectState: jest.fn(),
      assertState: jest.fn(),
    };
    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue(null),
      markRunning: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      markWaitingTakeover: jest.fn().mockResolvedValue(undefined),
      appendSteps: jest.fn().mockResolvedValue(undefined),
      appendArtifacts: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeExecutionOrchestrator = {
      executePhase: jest
        .fn()
        .mockResolvedValueOnce({
          success: false,
          status: 'failed',
          stepResults: [],
          retryable: true,
          errorCode: 'STEP_TIMEOUT',
          errorMessage: 'timeout',
        })
        .mockResolvedValueOnce({
          success: true,
          status: 'completed',
          stepResults: [],
          output: { ok: true },
        }),
    };

    const executor = new BrowserPhaseExecutor(
      browserPhaseRecoveryPlanner as never,
      browserRuntimeAdapter as never,
      executionPhaseService as never,
      runtimeExecutionOrchestrator as never
    );

    const result = await executor.execute({
      executionId: 'execution-1',
      phaseKey: 'phase_login',
      phaseName: '登录阶段',
      phaseType: 'browser_login',
      runtimeSessionId: 'runtime-1',
      commands: [
        {
          stepId: 'step-1',
          capabilityType: 'browser_step',
          action: 'fill',
          input: { selector: 'input[name=username]', value: 'test' },
        },
      ],
      recoveryPolicy: {
        maxAutoRetries: 1,
      },
    });

    expect(runtimeExecutionOrchestrator.executePhase).toHaveBeenCalledTimes(2);
    expect(executionPhaseService.markCompleted).toHaveBeenCalled();
    expect(executionPhaseService.markFailed).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('marks phase waiting_takeover when recovery planner requires human takeover', async () => {
    const browserPhaseRecoveryPlanner = {
      plan: jest.fn().mockReturnValue({
        action: 'takeover_required',
        reason: 'captcha detected',
      }),
    };
    const browserRuntimeAdapter = {
      inspectState: jest.fn(),
      assertState: jest.fn(),
    };
    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue(null),
      markRunning: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      markWaitingTakeover: jest.fn().mockResolvedValue(undefined),
      appendSteps: jest.fn().mockResolvedValue(undefined),
      appendArtifacts: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeExecutionOrchestrator = {
      executePhase: jest.fn().mockResolvedValue({
        success: false,
        status: 'takeover_required',
        stepResults: [],
        requiresTakeover: true,
        takeoverReason: 'captcha detected',
        errorCode: 'CAPTCHA',
        errorMessage: 'captcha detected',
      }),
    };

    const executor = new BrowserPhaseExecutor(
      browserPhaseRecoveryPlanner as never,
      browserRuntimeAdapter as never,
      executionPhaseService as never,
      runtimeExecutionOrchestrator as never
    );

    const result = await executor.execute({
      executionId: 'execution-1',
      phaseKey: 'phase_login',
      phaseName: '登录阶段',
      phaseType: 'browser_login',
      runtimeSessionId: 'runtime-1',
      commands: [
        {
          stepId: 'step-1',
          capabilityType: 'browser_step',
          action: 'fill',
          input: { selector: 'input[name=username]', value: 'test' },
        },
      ],
      recoveryPolicy: {
        allowHumanTakeover: true,
      },
    });

    expect(executionPhaseService.markWaitingTakeover).toHaveBeenCalled();
    expect(executionPhaseService.markFailed).not.toHaveBeenCalled();
    expect(executionPhaseService.appendArtifacts).toHaveBeenCalledWith(
      'execution-1',
      'phase_login',
      []
    );
    expect(result.status).toBe('takeover_required');
    expect(result.requiresTakeover).toBe(true);
  });

  it('retries phase with an AI patch that replaces the failed selector', async () => {
    const browserPhaseRecoveryPlanner = {
      plan: jest.fn().mockResolvedValue({
        action: 'retry_with_patch',
        reason: 'Use data-testid selector',
        patch: {
          type: 'replace_selector',
          failedStepId: 'step-1',
          selector: '[data-testid="username"]',
        },
      }),
    };
    const browserRuntimeAdapter = {
      inspectState: jest.fn(),
      assertState: jest.fn(),
    };
    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue(null),
      markRunning: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      markWaitingTakeover: jest.fn().mockResolvedValue(undefined),
      appendSteps: jest.fn().mockResolvedValue(undefined),
      appendArtifacts: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeExecutionOrchestrator = {
      executePhase: jest
        .fn()
        .mockResolvedValueOnce({
          success: false,
          status: 'failed',
          stepResults: [],
          retryable: true,
          errorCode: 'ELEMENT_NOT_FOUND',
          errorMessage: 'selector not found',
          failedStepId: 'step-1',
        })
        .mockResolvedValueOnce({
          success: true,
          status: 'completed',
          stepResults: [],
          output: { ok: true },
        }),
    };

    const executor = new BrowserPhaseExecutor(
      browserPhaseRecoveryPlanner as never,
      browserRuntimeAdapter as never,
      executionPhaseService as never,
      runtimeExecutionOrchestrator as never
    );

    const result = await executor.execute({
      executionId: 'execution-1',
      phaseKey: 'phase_login',
      phaseName: '登录阶段',
      phaseType: 'browser_login',
      runtimeSessionId: 'runtime-1',
      commands: [
        {
          stepId: 'step-1',
          capabilityType: 'browser_step',
          action: 'fill',
          input: { selector: 'input[name=username]', value: 'test' },
        },
      ],
      recoveryPolicy: {
        allowAiRecovery: true,
      },
    });

    const secondRequest = runtimeExecutionOrchestrator.executePhase.mock.calls[1][0];
    expect(secondRequest.steps[0].input.selector).toBe('[data-testid="username"]');
    expect(executionPhaseService.markCompleted).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('marks phase failed when runtime phase execution fails', async () => {
    const browserPhaseRecoveryPlanner = {
      plan: jest.fn().mockReturnValue({
        action: 'abort',
        reason: 'Step failed',
      }),
    };
    const browserRuntimeAdapter = {
      inspectState: jest.fn(),
      assertState: jest.fn(),
    };
    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue(null),
      markRunning: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      markWaitingTakeover: jest.fn().mockResolvedValue(undefined),
      appendSteps: jest.fn().mockResolvedValue(undefined),
      appendArtifacts: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeExecutionOrchestrator = {
      executePhase: jest.fn().mockResolvedValue({
        success: false,
        status: 'failed',
        stepResults: [],
        errorCode: 'PHASE_EXECUTION_FAILED',
        errorMessage: 'Step failed',
      }),
    };

    const executor = new BrowserPhaseExecutor(
      browserPhaseRecoveryPlanner as never,
      browserRuntimeAdapter as never,
      executionPhaseService as never,
      runtimeExecutionOrchestrator as never
    );

    const result = await executor.execute({
      executionId: 'execution-1',
      phaseKey: 'phase_login',
      phaseName: '登录阶段',
      phaseType: 'browser_login',
      runtimeSessionId: 'runtime-1',
      commands: [
        {
          stepId: 'step-1',
          capabilityType: 'browser_step',
          action: 'fill',
          input: { selector: 'input[name=username]', value: 'test' },
        },
      ],
    });

    expect(executionPhaseService.markRunning).toHaveBeenCalled();
    expect(executionPhaseService.markCompleted).not.toHaveBeenCalled();
    expect(executionPhaseService.markFailed).toHaveBeenCalled();
    expect(executionPhaseService.appendArtifacts).toHaveBeenCalledWith(
      'execution-1',
      'phase_login',
      []
    );
    expect(result.success).toBe(false);
  });

  it('fails phase when postcheck does not pass after runtime execution succeeds', async () => {
    const browserPhaseRecoveryPlanner = {
      plan: jest.fn().mockReturnValue({
        action: 'abort',
        reason: 'postcheck failed',
      }),
    };
    const browserRuntimeAdapter = {
      inspectState: jest.fn(),
      assertState: jest.fn(),
    };
    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue(null),
      markRunning: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      markWaitingTakeover: jest.fn().mockResolvedValue(undefined),
      appendSteps: jest.fn().mockResolvedValue(undefined),
      appendArtifacts: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeExecutionOrchestrator = {
      executePhase: jest.fn().mockResolvedValue({
        success: true,
        status: 'completed',
        stepResults: [{ success: true, status: 'completed' }],
        output: { ok: true },
      }),
    };

    const executor = new BrowserPhaseExecutor(
      browserPhaseRecoveryPlanner as never,
      browserRuntimeAdapter as never,
      executionPhaseService as never,
      runtimeExecutionOrchestrator as never
    );

    const result = await executor.execute({
      executionId: 'execution-1',
      phaseKey: 'phase_submit',
      phaseName: '提交阶段',
      phaseType: 'browser_submit',
      runtimeSessionId: 'runtime-1',
      commands: [
        {
          stepId: 'step-1',
          capabilityType: 'browser_step',
          action: 'click',
          input: { selector: 'button[type=submit]' },
        },
      ],
      postcheck: { matched: false },
    });

    expect(browserPhaseRecoveryPlanner.plan).toHaveBeenCalled();
    expect(executionPhaseService.markCompleted).not.toHaveBeenCalled();
    expect(executionPhaseService.markFailed).toHaveBeenCalled();
    expect(executionPhaseService.appendArtifacts).toHaveBeenCalledWith(
      'execution-1',
      'phase_submit',
      []
    );
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('PHASE_POSTCHECK_FAILED');
  });

  it('short-circuits phase when precheck page state matches the current browser page', async () => {
    const browserPhaseRecoveryPlanner = {
      plan: jest.fn(),
    };
    const browserRuntimeAdapter = {
      inspectState: jest.fn().mockResolvedValue({
        runtimeSessionId: 'runtime-1',
        pageUrl: 'https://example.com/dashboard',
        pageFingerprint: 'fp-dashboard',
        readyState: 'complete',
      }),
      assertState: jest.fn().mockResolvedValue({
        matched: true,
      }),
    };
    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue(null),
      markRunning: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      markWaitingTakeover: jest.fn().mockResolvedValue(undefined),
      appendSteps: jest.fn().mockResolvedValue(undefined),
      appendArtifacts: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeExecutionOrchestrator = {
      executePhase: jest.fn(),
    };

    const executor = new BrowserPhaseExecutor(
      browserPhaseRecoveryPlanner as never,
      browserRuntimeAdapter as never,
      executionPhaseService as never,
      runtimeExecutionOrchestrator as never
    );

    const result = await executor.execute({
      executionId: 'execution-1',
      phaseKey: 'phase_navigation',
      phaseName: '页面迁移阶段',
      phaseType: 'browser_navigation',
      runtimeSessionId: 'runtime-1',
      commands: [],
      precheck: {
        pageUrlIncludes: '/dashboard',
        readyState: 'complete',
      },
    });

    expect(browserRuntimeAdapter.assertState).toHaveBeenCalledWith({
      runtimeSessionId: 'runtime-1',
      backend: 'cli',
      pageUrl: undefined,
      pageUrlIncludes: '/dashboard',
      pageTitle: undefined,
      pageTitleIncludes: undefined,
      pageFingerprint: undefined,
      readyState: 'complete',
      selectorExists: undefined,
      textIncludes: undefined,
    });
    expect(runtimeExecutionOrchestrator.executePhase).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('short-circuits phase when precheck selector and text assertions match current browser page', async () => {
    const browserPhaseRecoveryPlanner = {
      plan: jest.fn(),
    };
    const browserRuntimeAdapter = {
      inspectState: jest.fn(),
      assertState: jest.fn().mockResolvedValue({
        matched: true,
      }),
    };
    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue(null),
      markRunning: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      markWaitingTakeover: jest.fn().mockResolvedValue(undefined),
      appendSteps: jest.fn().mockResolvedValue(undefined),
      appendArtifacts: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeExecutionOrchestrator = {
      executePhase: jest.fn(),
    };

    const executor = new BrowserPhaseExecutor(
      browserPhaseRecoveryPlanner as never,
      browserRuntimeAdapter as never,
      executionPhaseService as never,
      runtimeExecutionOrchestrator as never
    );

    const result = await executor.execute({
      executionId: 'execution-1',
      phaseKey: 'phase_verify',
      phaseName: '校验阶段',
      phaseType: 'browser_validation',
      runtimeSessionId: 'runtime-1',
      commands: [],
      precheck: {
        selectorExists: '#success-banner',
        textIncludes: 'Saved successfully',
      },
    });

    expect(browserRuntimeAdapter.assertState).toHaveBeenCalledWith({
      runtimeSessionId: 'runtime-1',
      backend: 'cli',
      pageUrl: undefined,
      pageUrlIncludes: undefined,
      pageTitle: undefined,
      pageTitleIncludes: undefined,
      pageFingerprint: undefined,
      readyState: undefined,
      selectorExists: '#success-banner',
      textIncludes: 'Saved successfully',
    });
    expect(runtimeExecutionOrchestrator.executePhase).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('does not reuse a human-resolved patch across different loop iterations', async () => {
    const browserPhaseRecoveryPlanner = {
      plan: jest.fn(),
    };
    const browserRuntimeAdapter = {
      inspectState: jest.fn(),
      assertState: jest.fn(),
    };
    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue({
        recovery_decision_json: {
          patch: {
            type: 'resolve_by_human',
            failedStepId: 'step-1',
            loopIteration: 2,
            note: 'approved once',
          },
        },
      }),
      markRunning: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      markWaitingTakeover: jest.fn().mockResolvedValue(undefined),
      appendSteps: jest.fn().mockResolvedValue(undefined),
      appendArtifacts: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeExecutionOrchestrator = {
      executePhase: jest.fn().mockResolvedValue({
        success: true,
        status: 'completed',
        stepResults: [],
        output: { ok: true },
      }),
    };

    const executor = new BrowserPhaseExecutor(
      browserPhaseRecoveryPlanner as never,
      browserRuntimeAdapter as never,
      executionPhaseService as never,
      runtimeExecutionOrchestrator as never
    );

    const result = await executor.execute({
      executionId: 'execution-1',
      phaseKey: 'phase_review',
      phaseName: '审核阶段',
      phaseType: 'workflow_activity',
      runtimeSessionId: 'runtime-1',
      commands: [
        {
          stepId: 'step-1',
          capabilityType: 'browser_step',
          action: 'branch',
          input: {},
        },
      ],
      input: {
        loopIteration: 3,
      },
    });

    expect(runtimeExecutionOrchestrator.executePhase).toHaveBeenCalledTimes(1);
    expect(result.output).toEqual({ ok: true });
    expect(executionPhaseService.getByExecutionIdAndPhaseKey).toHaveBeenCalledWith(
      'execution-1',
      'phase_review__loop_3'
    );
    expect(executionPhaseService.markCompleted).toHaveBeenCalledWith(
      'execution-1',
      'phase_review__loop_3',
      expect.objectContaining({
        output: { ok: true },
      })
    );
  });

  it('short-circuits a human-resolved phase when the patch targets the current execution step id', async () => {
    const browserPhaseRecoveryPlanner = {
      plan: jest.fn(),
    };
    const browserRuntimeAdapter = {
      inspectState: jest.fn(),
      assertState: jest.fn(),
    };
    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue({
        recovery_decision_json: {
          patch: {
            type: 'resolve_by_human',
            failedStepId: 'execution-step-15',
            loopIteration: 2,
            resumeFromStepId: 'execution-step-16',
            note: 'approved by human',
          },
        },
      }),
      markRunning: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      markWaitingTakeover: jest.fn().mockResolvedValue(undefined),
      appendSteps: jest.fn().mockResolvedValue(undefined),
      appendArtifacts: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeExecutionOrchestrator = {
      executePhase: jest.fn(),
    };

    const executor = new BrowserPhaseExecutor(
      browserPhaseRecoveryPlanner as never,
      browserRuntimeAdapter as never,
      executionPhaseService as never,
      runtimeExecutionOrchestrator as never
    );

    const result = await executor.execute({
      executionId: 'execution-1',
      executionStepId: 'execution-step-15',
      phaseKey: 'phase_review',
      phaseName: '审核阶段',
      phaseType: 'workflow_activity',
      runtimeSessionId: 'runtime-1',
      commands: [
        {
          stepId: '20__command_01',
          capabilityType: 'browser_step',
          action: 'branch',
          input: {},
        },
      ],
      input: {
        loopIteration: 2,
      },
    });

    expect(runtimeExecutionOrchestrator.executePhase).not.toHaveBeenCalled();
    expect(executionPhaseService.getByExecutionIdAndPhaseKey).toHaveBeenCalledWith(
      'execution-1',
      'phase_review__loop_2'
    );
    expect(result.output).toEqual({
      shortCircuitedBy: 'human_resolved',
      precheck: null,
      note: 'approved by human',
    });
  });

  it('parses stringified recovery decisions before applying a human-resolved patch', async () => {
    const browserPhaseRecoveryPlanner = {
      plan: jest.fn(),
    };
    const browserRuntimeAdapter = {
      inspectState: jest.fn(),
      assertState: jest.fn(),
    };
    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue({
        recovery_decision_json: JSON.stringify({
          patch: {
            type: 'resolve_by_human',
            failedStepId: 'execution-step-15',
            loopIteration: 2,
            resumeFromStepId: 'execution-step-16',
            note: 'approved from string payload',
          },
        }),
      }),
      markRunning: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      markWaitingTakeover: jest.fn().mockResolvedValue(undefined),
      appendSteps: jest.fn().mockResolvedValue(undefined),
      appendArtifacts: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeExecutionOrchestrator = {
      executePhase: jest.fn(),
    };

    const executor = new BrowserPhaseExecutor(
      browserPhaseRecoveryPlanner as never,
      browserRuntimeAdapter as never,
      executionPhaseService as never,
      runtimeExecutionOrchestrator as never
    );

    const result = await executor.execute({
      executionId: 'execution-1',
      executionStepId: 'execution-step-15',
      phaseKey: 'phase_review',
      phaseName: '审核阶段',
      phaseType: 'workflow_activity',
      runtimeSessionId: 'runtime-1',
      commands: [
        {
          stepId: '20__command_01',
          capabilityType: 'browser_step',
          action: 'branch',
          input: {},
        },
      ],
      input: {
        loopIteration: 2,
      },
    });

    expect(runtimeExecutionOrchestrator.executePhase).not.toHaveBeenCalled();
    expect(executionPhaseService.getByExecutionIdAndPhaseKey).toHaveBeenCalledWith(
      'execution-1',
      'phase_review__loop_2'
    );
    expect(result.output).toEqual({
      shortCircuitedBy: 'human_resolved',
      precheck: null,
      note: 'approved from string payload',
    });
  });
});
