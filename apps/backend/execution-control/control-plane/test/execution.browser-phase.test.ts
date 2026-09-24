import { BadRequestException } from '@nestjs/common';
import axios from 'axios';
import {
  APPROVAL_STATUS,
  EXECUTION_EVENT_TYPE,
  EXECUTION_STATUS,
  EXECUTION_STEP_STATUS,
} from '../src/modules/execution';
import { ExecutionService } from '../src/modules/execution/execution.service';
import {
  ApprovalDecisionDto,
  SubmitInputDto,
  TakeoverExecutionDto,
} from '../src/modules/execution/state/execution.dto';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ExecutionService browser phase execution', () => {
  it('routes execute_browser_phase planner steps through BrowserPhaseExecutor in the main flow', async () => {
    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'execution-1',
          status: EXECUTION_STATUS.RUNNING,
        }),
      },
    };
    const executionStepService = {
      findNextPendingStep: jest.fn().mockResolvedValue({
        id: 'step-browser-phase',
        type: 'system',
        action: 'execute_browser_phase',
      }),
    };

    const service = new ExecutionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      executionStepService as never
    );
    const serviceInternals = service as any;
    jest
      .spyOn(serviceInternals.executionStepExecutorService, 'executeBrowserPhaseStep')
      .mockResolvedValue(undefined);

    await (service as any).advanceExecutionFlow('execution-1', 'runtime-1');

    expect(
      serviceInternals.executionStepExecutorService.executeBrowserPhaseStep
    ).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'execution-1' }),
      'runtime-1',
      'step-browser-phase',
      expect.any(Object)
    );
  });

  it('reuses browser phase commands/precheck/postcheck/recovery policy when executing planner step', async () => {
    const browserPhaseExecutor = {
      execute: jest.fn().mockResolvedValue({
        success: true,
        status: 'completed',
        stepResults: [
          {
            success: true,
            status: 'completed',
            output: { clicked: true },
          },
        ],
        output: {
          completedCommands: 2,
        },
      }),
    };
    const executionStepService = {
      getById: jest.fn().mockResolvedValue({
        id: 'step-browser-phase',
        name: '登录阶段',
        type: 'system',
        action: 'execute_browser_phase',
        targetJson: {
          plannerStepId: 'planner-step-1',
          plannerKind: 'tool',
          phaseKey: 'phase_login',
          phaseName: '登录阶段',
          phaseType: 'browser_phase',
          commands: [
            {
              stepId: 'cmd-fill-username',
              capabilityType: 'browser.step',
              action: 'fill',
              input: {
                target: 'username-input',
                value: '${username}',
              },
            },
            {
              stepId: 'cmd-click-submit',
              capabilityType: 'browser.step',
              action: 'click',
              input: {
                target: 'submit-button',
              },
            },
          ],
          precheck: {
            selectorExists: '#login-form',
          },
          postcheck: {
            pageUrlIncludes: '/dashboard',
          },
          recoveryPolicy: {
            maxAutoRetries: 2,
            allowAiRecovery: true,
            allowHumanTakeover: true,
            modelId: 'gpt-5.4',
          },
        },
        inputJson: {
          description: '复用模板中的登录 phase commands',
          plannerStatus: 'planned',
          commands: [
            {
              stepId: 'cmd-fill-username',
              capabilityType: 'browser.step',
              action: 'fill',
              input: {
                target: 'username-input',
                value: '${username}',
              },
            },
          ],
          precheck: {
            selectorExists: '#login-form',
          },
          postcheck: {
            pageUrlIncludes: '/dashboard',
          },
          recoveryPolicy: {
            maxAutoRetries: 2,
            allowAiRecovery: true,
            allowHumanTakeover: true,
            modelId: 'gpt-5.4',
          },
        },
      }),
      setCurrentStep: jest.fn().mockResolvedValue(undefined),
      startStep: jest.fn().mockResolvedValue(undefined),
      finishRuntimeStep: jest.fn().mockResolvedValue(undefined),
      markStepWaiting: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      executionStepService as never,
      undefined,
      undefined,
      browserPhaseExecutor as never
    );
    const serviceInternals = service as any;
    const runtimeControlService = serviceInternals.executionRuntimeControlService;
    jest.spyOn(serviceInternals.executionStreamService, 'createEvent').mockResolvedValue(undefined);
    jest.spyOn(serviceInternals, 'advanceExecutionFlow').mockResolvedValue(undefined);
    jest.spyOn(runtimeControlService, 'enterRuntimeWaitingInput').mockResolvedValue(undefined);
    jest
      .spyOn(runtimeControlService, 'enterPendingApprovalFromRuntimeStep')
      .mockResolvedValue(undefined);
    jest.spyOn(runtimeControlService, 'failExecutionFromRuntimeStep').mockResolvedValue(undefined);

    await (service as any).executionStepExecutorService.executeBrowserPhaseStep(
      {
        id: 'execution-1',
        skillId: 'skill-login',
        createdBy: 'user-1',
        riskLevel: 'L1',
        requiresApproval: false,
        normalizedInputJson: {
          input: {
            username: 'admin',
            loginCredential: 'admin',
            grossMarginThreshold: '15',
          },
        },
      },
      'runtime-1',
      'step-browser-phase',
      serviceInternals.getStepExecutorHooks()
    );

    expect(browserPhaseExecutor.execute).toHaveBeenCalledWith({
      executionId: 'execution-1',
      executionStepId: 'step-browser-phase',
      phaseKey: 'phase_login',
      phaseName: '登录阶段',
      phaseType: 'browser_phase',
      runtimeSessionId: 'runtime-1',
      skillId: 'skill-login',
      publishedSkillId: 'skill-login',
      runtimeType: 'browser',
      policyContext: {
        riskLevel: 'L1',
        requiresApproval: false,
      },
      traceContext: {
        userId: 'user-1',
        actorType: 'system',
        sourceService: 'control-plane',
      },
      commands: [
        {
          stepId: 'cmd-fill-username',
          capabilityType: 'browser.step',
          action: 'fill',
          input: {
            target: 'username-input',
            value: '${username}',
          },
          metadata: undefined,
        },
        {
          stepId: 'cmd-click-submit',
          capabilityType: 'browser.step',
          action: 'click',
          input: {
            target: 'submit-button',
          },
          metadata: undefined,
        },
      ],
      input: {
        username: 'admin',
        loginCredential: 'admin',
        grossMarginThreshold: '15',
        description: '复用模板中的登录 phase commands',
        plannerStatus: 'planned',
      },
      precheck: {
        selectorExists: '#login-form',
      },
      postcheck: {
        pageUrlIncludes: '/dashboard',
      },
      recoveryPolicy: {
        maxAutoRetries: 2,
        allowAiRecovery: true,
        allowHumanTakeover: true,
        modelId: 'gpt-5.4',
      },
    });
    expect(executionStepService.finishRuntimeStep).toHaveBeenCalledWith(
      'step-browser-phase',
      expect.objectContaining({
        success: true,
        takeoverTriggered: false,
        outputJson: expect.objectContaining({
          status: 'completed',
          output: {
            completedCommands: 2,
          },
        }),
      })
    );
    expect(serviceInternals.advanceExecutionFlow).toHaveBeenCalledWith('execution-1', 'runtime-1');
    expect(runtimeControlService.failExecutionFromRuntimeStep).not.toHaveBeenCalled();
  });

  it('takes over browser phase failures instead of failing execution when phase result requires takeover', async () => {
    const browserPhaseExecutor = {
      execute: jest.fn().mockResolvedValue({
        success: false,
        status: 'takeover_required',
        stepResults: [],
        output: {
          failedAction: 'click',
        },
        errorCode: 'STEP_EXECUTION_ERROR',
        errorMessage: 'selector not found',
        requiresTakeover: true,
        takeoverReason: 'selector not found',
      }),
    };
    const executionStepService = {
      getById: jest.fn().mockResolvedValue({
        id: 'step-browser-phase',
        name: '迁移阶段',
        type: 'system',
        action: 'execute_browser_phase',
        targetJson: {
          phaseKey: 'phase_migrate',
          phaseName: '迁移阶段',
          phaseType: 'workflow_activity',
          commands: [
            {
              stepId: 'cmd-click-menu',
              capabilityType: 'browser.step',
              action: 'click',
              input: {
                target: 'menuitem[name="play-circle Executions"]',
              },
            },
          ],
          recoveryPolicy: {
            maxAutoRetries: 1,
            allowHumanTakeover: true,
          },
        },
        inputJson: {
          description: '执行迁移阶段',
        },
      }),
      setCurrentStep: jest.fn().mockResolvedValue(undefined),
      startStep: jest.fn().mockResolvedValue(undefined),
      finishRuntimeStep: jest.fn().mockResolvedValue(undefined),
      markStepWaiting: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      executionStepService as never,
      undefined,
      undefined,
      browserPhaseExecutor as never
    );
    const serviceInternals = service as any;
    const runtimeControlService = serviceInternals.executionRuntimeControlService;
    jest.spyOn(serviceInternals.executionStreamService, 'createEvent').mockResolvedValue(undefined);
    jest.spyOn(serviceInternals, 'advanceExecutionFlow').mockResolvedValue(undefined);
    jest.spyOn(runtimeControlService, 'enterRuntimeWaitingInput').mockResolvedValue(undefined);
    jest
      .spyOn(runtimeControlService, 'enterPendingApprovalFromRuntimeStep')
      .mockResolvedValue(undefined);
    jest.spyOn(runtimeControlService, 'failExecutionFromRuntimeStep').mockResolvedValue(undefined);
    jest.spyOn(runtimeControlService, 'requestSystemTakeover').mockResolvedValue(undefined);

    await (service as any).executionStepExecutorService.executeBrowserPhaseStep(
      {
        id: 'execution-1',
        skillId: 'skill-login',
        createdBy: 'user-1',
        riskLevel: 'L1',
        requiresApproval: false,
      },
      'runtime-1',
      'step-browser-phase',
      serviceInternals.getStepExecutorHooks()
    );

    expect(executionStepService.finishRuntimeStep).toHaveBeenCalledWith(
      'step-browser-phase',
      expect.objectContaining({
        success: false,
        takeoverTriggered: true,
        errorCode: 'STEP_EXECUTION_ERROR',
        errorMessage: 'selector not found',
        outputJson: expect.objectContaining({
          status: 'takeover_required',
          requiresTakeover: true,
          takeoverReason: 'selector not found',
        }),
      })
    );
    expect(runtimeControlService.requestSystemTakeover).toHaveBeenCalledWith(
      'execution-1',
      'selector not found',
      expect.objectContaining({
        getExecutionDto: expect.any(Function),
        emitEvent: expect.any(Function),
        updateStatus: expect.any(Function),
        freezeRuntimeSessionQuietly: expect.any(Function),
        resumeRuntimeSessionQuietly: expect.any(Function),
        advanceExecutionFlow: expect.any(Function),
      })
    );
    expect(runtimeControlService.failExecutionFromRuntimeStep).not.toHaveBeenCalled();
    expect(serviceInternals.advanceExecutionFlow).not.toHaveBeenCalled();
  });
});

describe('ExecutionService phase takeover lifecycle', () => {
  beforeEach(() => {
    mockedAxios.post.mockReset();
    mockedAxios.post.mockResolvedValue({ data: {} } as never);
  });

  it('requests phase takeover and freezes runtime session', async () => {
    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'execution-1',
          createdBy: 'user-1',
          status: 'running',
          currentPhaseKey: 'phase_login',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      runtimeSession: {
        findFirst: jest.fn().mockResolvedValue({ id: 'runtime-1' }),
      },
      executionEvent: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $executeRawUnsafe: jest.fn(),
    };
    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue({
        id: 'phase-1',
        phase_key: 'phase_login',
        phase_name: '登录阶段',
        phase_type: 'browser_login',
        status: 'running',
        attempt: 1,
        runtime_session_id: 'runtime-1',
        output_json: null,
        postcheck_json: null,
        error_code: null,
        error_message: null,
      }),
      markWaitingTakeover: jest.fn().mockResolvedValue(undefined),
      createTakeoverRecord: jest.fn().mockResolvedValue(undefined),
      listByExecutionId: jest.fn().mockResolvedValue([]),
    };

    const service = new ExecutionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      executionPhaseService as never
    );
    jest.spyOn(service, 'getById').mockResolvedValue({ id: 'execution-1' } as never);

    await service.takeoverPhase(
      'execution-1',
      'phase_login',
      'user-1',
      { reason: 'Captcha detected' },
      { id: 'user-1' }
    );

    expect(prisma.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-1' },
      data: {
        status: EXECUTION_STATUS.HUMAN_CONTROL,
        takeoverRequired: true,
        takeoverReason: 'Captcha detected',
      },
    });
    expect(executionPhaseService.markWaitingTakeover).toHaveBeenCalledWith(
      'execution-1',
      'phase_login',
      expect.objectContaining({
        phaseName: '登录阶段',
        phaseType: 'browser_login',
      })
    );
    expect(executionPhaseService.createTakeoverRecord).toHaveBeenCalled();
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/runtime-sessions/runtime-1/freeze'),
      { reason: 'Captcha detected' }
    );
  });

  it('resumes phase takeover and resolves takeover record before resuming runtime session', async () => {
    const executionFindUnique = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'execution-1',
        createdBy: 'user-1',
        status: EXECUTION_STATUS.HUMAN_CONTROL,
      })
      .mockResolvedValueOnce({
        currentStepId: 'step-1',
      });
    const prisma = {
      execution: {
        findUnique: executionFindUnique,
        update: jest.fn().mockResolvedValue(undefined),
      },
      runtimeSession: {
        findFirst: jest.fn().mockResolvedValue({ id: 'runtime-1' }),
      },
      executionEvent: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $executeRawUnsafe: jest.fn(),
    };
    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue({
        id: 'phase-1',
        phase_key: 'phase_login',
        phase_name: '登录阶段',
        phase_type: 'browser_login',
        status: 'waiting_takeover',
        attempt: 2,
        runtime_session_id: 'runtime-1',
        input_json: { stepId: 'step-1' },
        recovery_decision_json: {
          patch: {
            type: 'resolve_by_human',
            failedStepId: 'step-1',
            resumeFromStepId: 'step-2',
          },
        },
      }),
      resolveTakeoverRecord: jest.fn().mockResolvedValue(undefined),
      markRunning: jest.fn().mockResolvedValue(undefined),
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
      listByExecutionId: jest.fn().mockResolvedValue([]),
    };
    const executionStepService = {
      getById: jest.fn().mockResolvedValue({
        id: 'step-1',
        status: EXECUTION_STEP_STATUS.FAILED,
        targetJson: {
          phaseKey: 'phase_login',
          phaseName: '登录阶段',
          phaseType: 'browser_login',
        },
      }),
      requeueFailedStep: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      executionPhaseService as never,
      undefined,
      executionStepService as never
    );
    jest.spyOn(service as any, 'updateStatus').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'advanceExecutionFlow').mockResolvedValue(undefined);
    jest.spyOn(service, 'getById').mockResolvedValue({ id: 'execution-1' } as never);

    await service.resumePhaseTakeover(
      'execution-1',
      'phase_login',
      'user-1',
      { stepId: 'step-1', comment: 'Manual fix complete' },
      { id: 'user-1' }
    );

    expect(executionPhaseService.resolveTakeoverRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: 'execution-1',
        phaseId: 'phase-1',
        resolvedBy: 'user-1',
      })
    );
    expect(executionPhaseService.createOrUpdatePhase).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: 'execution-1',
        phaseKey: 'phase_login',
        status: 'running',
        phaseName: '登录阶段',
        phaseType: 'browser_login',
        attempt: 2,
      })
    );
    expect(executionStepService.requeueFailedStep).not.toHaveBeenCalled();
    expect((service as any).updateStatus).toHaveBeenCalledWith(
      'execution-1',
      EXECUTION_STATUS.RUNNING
    );
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/runtime-sessions/runtime-1/resume'),
      expect.anything()
    );
    expect((service as any).advanceExecutionFlow).toHaveBeenCalledWith('execution-1', 'runtime-1');
  });

  it('resumes legacy human_control execution and restarts execution flow asynchronously', async () => {
    const executionFindUnique = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'execution-1',
        createdBy: 'user-1',
        status: EXECUTION_STATUS.HUMAN_CONTROL,
        currentPhaseKey: 'phase_login',
      })
      .mockResolvedValueOnce({
        currentStepId: 'step-1',
      });
    const prisma = {
      execution: {
        findUnique: executionFindUnique,
        update: jest.fn().mockResolvedValue(undefined),
      },
      runtimeSession: {
        findFirst: jest.fn().mockResolvedValue({ id: 'runtime-1' }),
      },
      executionEvent: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $executeRawUnsafe: jest.fn(),
    };
    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue({
        id: 'phase-1',
        phase_key: 'phase_login',
        phase_name: '登录阶段',
        phase_type: 'browser_login',
        status: 'waiting_takeover',
        attempt: 2,
        runtime_session_id: 'runtime-1',
        input_json: { stepId: 'step-1' },
      }),
      resolveTakeoverRecord: jest.fn().mockResolvedValue(undefined),
      markRunning: jest.fn().mockResolvedValue(undefined),
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
      listByExecutionId: jest.fn().mockResolvedValue([]),
    };
    const executionStepService = {
      getById: jest.fn().mockResolvedValue({
        id: 'step-1',
        status: EXECUTION_STEP_STATUS.FAILED,
        targetJson: {
          phaseKey: 'phase_login',
          phaseName: '登录阶段',
          phaseType: 'browser_login',
        },
      }),
      requeueFailedStep: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      executionPhaseService as never,
      undefined,
      executionStepService as never
    );
    jest.spyOn(service as any, 'updateStatus').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'advanceExecutionFlow').mockResolvedValue(undefined);
    jest.spyOn(service, 'getById').mockResolvedValue({ id: 'execution-1' } as never);

    await service.resume(
      'execution-1',
      'user-1',
      { stepId: 'step-1', comment: 'Continue after manual fix' },
      { id: 'user-1' }
    );

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/runtime-sessions/runtime-1/resume'),
      { stepId: 'step-1' }
    );
    expect(executionStepService.requeueFailedStep).toHaveBeenCalledWith('step-1');
    expect((service as any).advanceExecutionFlow).toHaveBeenCalledWith('execution-1', 'runtime-1');
  });
});
