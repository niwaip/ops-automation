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

describe('ExecutionService.cleanupBeforeDate', () => {
  const createService = () => {
    const prisma = {
      execution: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      executionStep: {
        deleteMany: jest.fn(),
      },
      executionEvent: {
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };

    const service = new ExecutionService(prisma as never, {} as never, {} as never, {} as never);
    return { service, prisma };
  };

  it('deletes executions created before the cutoff for the current user', async () => {
    const { service, prisma } = createService();
    prisma.execution.findMany.mockResolvedValue([
      { id: 'execution-old-1' },
      { id: 'execution-old-2' },
    ]);
    prisma.executionStep.deleteMany.mockResolvedValue({ count: 2 });
    prisma.executionEvent.deleteMany.mockResolvedValue({ count: 2 });
    prisma.execution.deleteMany.mockResolvedValue({ count: 2 });

    const result = await service.cleanupBeforeDate('2026-05-13', 'user-1', {
      id: 'user-1',
      role: 'employee',
    } as any);

    expect(prisma.execution.findMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: new Date('2026-05-13T00:00:00') },
        createdBy: 'user-1',
      },
      select: { id: true },
    });
    expect(prisma.executionStep.deleteMany).toHaveBeenCalledWith({
      where: { executionId: { in: ['execution-old-1', 'execution-old-2'] } },
    });
    expect(prisma.executionEvent.deleteMany).toHaveBeenCalledWith({
      where: { executionId: { in: ['execution-old-1', 'execution-old-2'] } },
    });
    expect(prisma.execution.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['execution-old-1', 'execution-old-2'] } },
    });
    expect(result).toEqual({
      success: true,
      deletedCount: 2,
      beforeDate: '2026-05-13',
    });
  });
});

describe('ExecutionService.getById with phases', () => {
  it('includes phase data from executionPhaseService in execution dto', async () => {
    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'execution-1',
          createdBy: 'user-1',
          skillId: 'skill-1',
          status: 'running',
          runtimeType: 'browser',
          riskLevel: 'L0',
          requiresApproval: false,
          takeoverRequired: false,
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          updatedAt: new Date('2026-05-01T00:00:00.000Z'),
        }),
      },
      runtimeSession: {
        findFirst: jest.fn().mockResolvedValue({ id: 'runtime-1' }),
      },
    };

    const executionPhaseService = {
      listByExecutionId: jest.fn().mockResolvedValue([
        {
          id: 'phase-1',
          executionId: 'execution-1',
          phaseKey: 'phase_login',
          phaseName: '登录阶段',
          phaseType: 'browser_login',
          status: 'running',
          attempt: 1,
          runtimeSessionId: 'runtime-1',
          inputJson: { username: 'test' },
          outputJson: null,
          precheckJson: { matched: false },
          postcheckJson: null,
          recoveryDecisionJson: null,
          errorCode: null,
          errorMessage: null,
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          updatedAt: new Date('2026-05-01T00:00:00.000Z'),
          artifacts: [],
          takeovers: [],
        },
      ]),
    };

    const service = new ExecutionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      executionPhaseService as never
    );

    const dto = await service.getById('execution-1', { id: 'user-1' });

    expect(executionPhaseService.listByExecutionId).toHaveBeenCalledWith('execution-1');
    expect(dto.runtimeSessionId).toBe('runtime-1');
    expect(dto.phases).toHaveLength(1);
    expect(dto.phases?.[0]).toEqual(
      expect.objectContaining({
        phaseKey: 'phase_login',
        phaseName: '登录阶段',
        phaseType: 'browser_login',
      })
    );
  });
});

describe('ExecutionService.getPhases', () => {
  it('returns mapped phases after permission check', async () => {
    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'execution-1',
          createdBy: 'user-1',
        }),
      },
    };

    const executionPhaseService = {
      listByExecutionId: jest.fn().mockResolvedValue([
        {
          id: 'phase-1',
          execution_id: 'execution-1',
          phase_key: 'phase_login',
          phase_name: '登录阶段',
          phase_type: 'browser_login',
          status: 'running',
          attempt: 1,
          runtime_session_id: 'runtime-1',
          created_at: new Date('2026-05-01T00:00:00.000Z'),
          updated_at: new Date('2026-05-01T00:00:00.000Z'),
          artifacts: [],
          takeovers: [],
        },
      ]),
    };

    const service = new ExecutionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      executionPhaseService as never
    );

    const phases = await service.getPhases('execution-1', { id: 'user-1' });

    expect(executionPhaseService.listByExecutionId).toHaveBeenCalledWith('execution-1');
    expect(phases).toEqual([
      expect.objectContaining({
        phaseKey: 'phase_login',
        phaseName: '登录阶段',
        phaseType: 'browser_login',
      }),
    ]);
  });
});

describe('ExecutionService phase sync during system execution', () => {
  it('marks phase running and completed when system step succeeds', async () => {
    const prisma = {
      execution: {
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const runtimeExecutionOrchestrator = {
      executeStep: jest.fn().mockResolvedValue({
        success: true,
        status: 'completed',
        output: { result: 'ok' },
        rawResult: {
          runtime: 'capability_runtime',
          releaseId: 'release-1',
          capabilityId: 'capability-1',
          publishedSkillId: 'published-skill-1',
          logs: [],
        },
      }),
    };
    const runtimeResultInterpreter = {
      handleSkillRuntimeResult: jest.fn().mockResolvedValue(undefined),
      handleBrowserStepResult: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeStepRequestFactory = {
      resolveExecutionCapabilityId: jest.fn().mockReturnValue('capability-1'),
      resolveExecutionCapabilityVersion: jest.fn().mockReturnValue('v1'),
      resolveExecutionInput: jest.fn().mockReturnValue({ username: 'test' }),
      buildSkillRuntimeRequest: jest.fn().mockReturnValue({
        requestId: 'req-1',
        executionId: 'execution-1',
        stepId: 'step-1',
        runtimeType: 'custom',
        runtimeSessionId: 'runtime-1',
        capabilityType: 'skill.runtime',
        action: 'execute',
        input: { username: 'test' },
      }),
    };
    const executionPhaseService = {
      listByExecutionId: jest.fn(),
      markRunning: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
      replaceArtifacts: jest.fn().mockResolvedValue(undefined),
      appendSteps: jest.fn().mockResolvedValue(undefined),
    };
    const executionStepService = {
      getById: jest.fn().mockResolvedValue({
        id: 'step-1',
        type: 'system',
        action: 'execute_skill',
        targetJson: {
          phaseKey: 'phase_01_login_skill',
          phaseName: '登录并进入主页',
          phaseType: 'system_skill',
        },
        inputJson: {
          description: '执行登录技能',
        },
      }),
      setCurrentStep: jest.fn().mockResolvedValue(undefined),
      startStep: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionService(
      prisma as never,
      runtimeExecutionOrchestrator as never,
      runtimeResultInterpreter as never,
      runtimeStepRequestFactory as never,
      undefined,
      executionPhaseService as never,
      undefined,
      executionStepService as never
    );
    jest.spyOn((service as any).executionStreamService, 'createEvent').mockResolvedValue(undefined);

    await (service as any).executionStepExecutorService.executeSystemSkillStep(
      { id: 'execution-1', skillId: 'skill-1', runtimeType: 'browser' },
      'runtime-1',
      'step-1',
      (service as any).getStepExecutorHooks()
    );

    expect(executionPhaseService.markRunning).toHaveBeenCalledWith(
      'execution-1',
      'phase_01_login_skill',
      expect.objectContaining({
        phaseName: '登录并进入主页',
        phaseType: 'system_skill',
      })
    );
    expect(executionPhaseService.markCompleted).toHaveBeenCalledWith(
      'execution-1',
      'phase_01_login_skill',
      expect.objectContaining({
        phaseName: '登录并进入主页',
        phaseType: 'system_skill',
      })
    );
    expect(executionPhaseService.appendSteps).toHaveBeenCalledWith(
      'execution-1',
      'phase_01_login_skill',
      []
    );
    expect(executionPhaseService.createOrUpdatePhase).not.toHaveBeenCalled();
  });

  it('persists skill runtime phase steps extracted from nested phase results', async () => {
    const prisma = {
      execution: {
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const runtimeExecutionOrchestrator = {
      executeStep: jest.fn().mockResolvedValue({
        success: true,
        status: 'completed',
        output: { result: 'ok' },
        rawResult: {
          runtime: 'capability_runtime',
          releaseId: 'release-1',
          capabilityId: 'capability-1',
          publishedSkillId: 'published-skill-1',
          logs: [],
          output: {
            phaseResults: [
              {
                stepName: '打开搜索页',
                result: {
                  results: [
                    {
                      stepId: 'goto-1',
                      action: 'goto',
                      status: 'success',
                      input: {
                        url: 'https://example.com',
                      },
                      output: {
                        pageUrl: 'https://example.com',
                      },
                      snapshot: {
                        id: 'snapshot-1',
                      },
                    },
                    {
                      stepId: 'click-1',
                      action: 'click',
                      status: 'completed',
                      input: {
                        target: 'text=Search',
                      },
                      output: {
                        clicked: true,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      }),
    };
    const runtimeResultInterpreter = {
      handleSkillRuntimeResult: jest.fn().mockResolvedValue(undefined),
      handleBrowserStepResult: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeStepRequestFactory = {
      resolveExecutionCapabilityId: jest.fn().mockReturnValue('capability-1'),
      resolveExecutionCapabilityVersion: jest.fn().mockReturnValue('v1'),
      resolveExecutionInput: jest.fn().mockReturnValue({ username: 'test' }),
      buildSkillRuntimeRequest: jest.fn().mockReturnValue({
        requestId: 'req-1',
        executionId: 'execution-1',
        stepId: 'step-1',
        runtimeType: 'custom',
        runtimeSessionId: 'runtime-1',
        capabilityType: 'skill.runtime',
        action: 'execute',
        input: { username: 'test' },
      }),
    };
    const executionPhaseService = {
      listByExecutionId: jest.fn(),
      markRunning: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
      replaceArtifacts: jest.fn().mockResolvedValue(undefined),
      appendSteps: jest.fn().mockResolvedValue(undefined),
    };
    const executionStepService = {
      getById: jest.fn().mockResolvedValue({
        id: 'step-1',
        type: 'system',
        action: 'execute_skill',
        targetJson: {
          phaseKey: 'phase_01_execute_skill',
          phaseName: '执行技能',
          phaseType: 'system_skill',
        },
        inputJson: {
          description: '执行技能并提取内部步骤',
        },
      }),
      setCurrentStep: jest.fn().mockResolvedValue(undefined),
      startStep: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionService(
      prisma as never,
      runtimeExecutionOrchestrator as never,
      runtimeResultInterpreter as never,
      runtimeStepRequestFactory as never,
      undefined,
      executionPhaseService as never,
      undefined,
      executionStepService as never
    );
    jest.spyOn((service as any).executionStreamService, 'createEvent').mockResolvedValue(undefined);

    await (service as any).executionStepExecutorService.executeSystemSkillStep(
      { id: 'execution-1', skillId: 'skill-1', runtimeType: 'browser' },
      'runtime-1',
      'step-1',
      (service as any).getStepExecutorHooks()
    );

    expect(executionPhaseService.appendSteps).toHaveBeenCalledWith(
      'execution-1',
      'phase_01_execute_skill',
      [
        expect.objectContaining({
          stepIndex: 1,
          stepId: 'goto-1',
          action: 'goto',
          status: 'completed',
          snapshotId: 'snapshot-1',
          input: {
            url: 'https://example.com',
          },
          output: {
            pageUrl: 'https://example.com',
          },
        }),
        expect.objectContaining({
          stepIndex: 2,
          stepId: 'click-1',
          action: 'click',
          status: 'completed',
          input: {
            target: 'text=Search',
          },
          output: {
            clicked: true,
          },
        }),
      ]
    );
  });

  it('prebuilds workflow activity phases before skill runtime finishes', async () => {
    const prisma = {
      execution: {
        update: jest.fn().mockResolvedValue(undefined),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        {
          source_payload_json: {
            workflowDsl: {
              steps: [
                {
                  id: 'activity-step-1',
                  type: 'activity',
                  name: '打开登录页',
                  activityName: 'open_login_page',
                },
                {
                  id: 'activity-step-2',
                  type: 'activity',
                  name: '提交登录',
                  activityName: 'submit_login_form',
                },
              ],
            },
          },
        },
      ]),
    };
    const runtimeExecutionOrchestrator = {
      executeStep: jest.fn().mockResolvedValue({
        success: true,
        status: 'completed',
        output: {
          phaseResults: [
            {
              stepName: '打开登录页',
              activityName: 'open_login_page',
              result: {
                status: 'completed',
                results: [{ action: 'goto', status: 'success' }],
              },
            },
            {
              stepName: '提交登录',
              activityName: 'submit_login_form',
              result: {
                status: 'completed',
                results: [{ action: 'click', status: 'success' }],
              },
            },
          ],
        },
        rawResult: {
          runtime: 'capability_runtime',
          releaseId: 'release-1',
          capabilityId: 'published-skill-1',
          publishedSkillId: 'published-skill-1',
          logs: [],
          output: {
            phaseResults: [
              {
                stepName: '打开登录页',
                activityName: 'open_login_page',
                result: {
                  status: 'completed',
                  results: [{ action: 'goto', status: 'success' }],
                },
              },
              {
                stepName: '提交登录',
                activityName: 'submit_login_form',
                result: {
                  status: 'completed',
                  results: [{ action: 'click', status: 'success' }],
                },
              },
            ],
          },
        },
      }),
    };
    const runtimeResultInterpreter = {
      handleSkillRuntimeResult: jest.fn().mockResolvedValue(undefined),
      handleBrowserStepResult: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeStepRequestFactory = {
      resolveExecutionCapabilityId: jest.fn().mockReturnValue('published-skill-1'),
      resolveExecutionCapabilityVersion: jest.fn().mockReturnValue('v1'),
      resolveExecutionInput: jest.fn().mockReturnValue({ username: 'test' }),
      buildSkillRuntimeRequest: jest.fn().mockReturnValue({
        requestId: 'req-1',
        executionId: 'execution-1',
        stepId: 'step-1',
        runtimeType: 'custom',
        runtimeSessionId: 'runtime-1',
        capabilityType: 'skill.runtime',
        action: 'execute',
        input: { username: 'test' },
      }),
    };
    const executionPhaseService = {
      listByExecutionId: jest.fn(),
      markRunning: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
      replaceArtifacts: jest.fn().mockResolvedValue(undefined),
      replaceSteps: jest.fn().mockResolvedValue(undefined),
    };
    const executionStepService = {
      getById: jest.fn().mockResolvedValue({
        id: 'step-1',
        type: 'system',
        action: 'execute_skill',
        targetJson: {
          phaseKey: 'phase_01_execute_skill',
          phaseName: '执行技能',
          phaseType: 'system_skill',
        },
        inputJson: {
          description: '执行技能并实时展示 activity',
        },
      }),
      setCurrentStep: jest.fn().mockResolvedValue(undefined),
      startStep: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionService(
      prisma as never,
      runtimeExecutionOrchestrator as never,
      runtimeResultInterpreter as never,
      runtimeStepRequestFactory as never,
      undefined,
      executionPhaseService as never,
      undefined,
      executionStepService as never
    );
    jest.spyOn((service as any).executionStreamService, 'createEvent').mockResolvedValue(undefined);

    await (service as any).executionStepExecutorService.executeSystemSkillStep(
      { id: 'execution-1', skillId: 'published-skill-1', runtimeType: 'browser' },
      'runtime-1',
      'step-1',
      (service as any).getStepExecutorHooks()
    );

    expect(executionPhaseService.createOrUpdatePhase).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: 'execution-1',
        phaseKey: 'phase_01_execute_skill__activity_02_submit_login_form',
        phaseName: '提交登录',
        phaseType: 'workflow_activity',
        status: 'pending',
      })
    );
    expect(executionPhaseService.markRunning.mock.calls).toEqual(
      expect.arrayContaining([
        [
          'execution-1',
          'phase_01_execute_skill__activity_01_open_login_page',
          expect.objectContaining({
            phaseName: '打开登录页',
            phaseType: 'workflow_activity',
            runtimeSessionId: 'runtime-1',
          }),
        ],
      ])
    );
    expect(executionPhaseService.markCompleted.mock.calls).toEqual(
      expect.arrayContaining([
        [
          'execution-1',
          'phase_01_execute_skill__activity_01_open_login_page',
          expect.objectContaining({
            phaseName: '打开登录页',
            phaseType: 'workflow_activity',
          }),
        ],
        [
          'execution-1',
          'phase_01_execute_skill__activity_02_submit_login_form',
          expect.objectContaining({
            phaseName: '提交登录',
            phaseType: 'workflow_activity',
          }),
        ],
      ])
    );
  });

  it('updates current workflow activity while skill runtime is still running', async () => {
    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'execution-1',
          createdBy: 'user-1',
        }),
      },
    };
    const executionPhaseService = {
      listByExecutionId: jest.fn().mockResolvedValue([
        {
          phase_key: 'phase_01_execute_skill__activity_01_open',
          phase_name: '1. 页面打开',
          phase_type: 'workflow_activity',
          status: 'running',
          attempt: 1,
          runtime_session_id: 'runtime-1',
          input_json: {
            parentPhaseKey: 'phase_01_execute_skill',
            order: 1,
          },
          output_json: null,
          started_at: new Date('2026-05-16T07:00:00.000Z'),
        },
        {
          phase_key: 'phase_01_execute_skill__activity_02_process',
          phase_name: '2. 页面处理',
          phase_type: 'workflow_activity',
          status: 'pending',
          attempt: 1,
          runtime_session_id: 'runtime-1',
          input_json: {
            parentPhaseKey: 'phase_01_execute_skill',
            order: 2,
          },
          output_json: null,
          started_at: null,
        },
      ]),
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
      {} as never
    );

    await service.updateWorkflowActivityProgress(
      'execution-1',
      {
        parentPhaseKey: 'phase_01_execute_skill',
        activityOrder: 2,
        activityName: '2. 页面处理',
        runtimeSessionId: 'runtime-1',
      },
      { id: 'user-1' }
    );

    expect(executionPhaseService.createOrUpdatePhase).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        executionId: 'execution-1',
        phaseKey: 'phase_01_execute_skill__activity_01_open',
        status: 'completed',
      })
    );
    expect(executionPhaseService.createOrUpdatePhase).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        executionId: 'execution-1',
        phaseKey: 'phase_01_execute_skill__activity_02_process',
        status: 'running',
        runtimeSessionId: 'runtime-1',
      })
    );
  });

  it('forwards an instance-level workflow activity phase loader override to system skill result hooks', async () => {
    const prisma = {
      execution: {
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const runtimeResultInterpreter = {
      handleSkillRuntimeResult: jest.fn().mockResolvedValue(undefined),
      handleBrowserStepResult: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeStepRequestFactory = {
      resolveExecutionCapabilityId: jest.fn().mockReturnValue('capability-1'),
      resolveExecutionCapabilityVersion: jest.fn().mockReturnValue('v1'),
      resolveExecutionInput: jest.fn().mockReturnValue({ username: 'test' }),
      buildSkillRuntimeRequest: jest.fn(),
    };
    const executionPhaseService = {
      listByExecutionId: jest.fn(),
      markRunning: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
      replaceArtifacts: jest.fn().mockResolvedValue(undefined),
      appendSteps: jest.fn().mockResolvedValue(undefined),
    };
    const executionStepService = {
      getById: jest.fn(),
      setCurrentStep: jest.fn(),
      startStep: jest.fn(),
    };

    const service = new ExecutionService(
      prisma as never,
      {} as never,
      runtimeResultInterpreter as never,
      runtimeStepRequestFactory as never,
      undefined,
      executionPhaseService as never,
      undefined,
      executionStepService as never
    );
    const serviceInternals = service as any;
    const overriddenLoader = jest
      .fn()
      .mockResolvedValue([{ phaseKey: 'phase_01_skill__activity_01' }]);
    serviceInternals.loadWorkflowActivityPhaseDefinitions = overriddenLoader;
    jest
      .spyOn(serviceInternals.executionSystemSkillResultService, 'handleSystemSkillStepResult')
      .mockImplementation(async (...args: unknown[]) => {
        const hooks = args[1] as {
          loadWorkflowActivityPhaseDefinitions?: (
            capabilityId: string,
            parentPhaseKey: string
          ) => Promise<unknown>;
        };
        await hooks.loadWorkflowActivityPhaseDefinitions?.('capability-1', 'phase_01_skill');
      });

    await serviceInternals.handleSystemSkillStepResult(
      'execution-1',
      'runtime-1',
      'step-1',
      {
        success: true,
        status: 'completed',
        output: { ok: true },
      },
      'capability-1',
      {
        phaseKey: 'phase_01_skill',
        phaseName: '执行技能',
        phaseType: 'system_skill',
      },
      { id: 'step-1' }
    );

    expect(overriddenLoader).toHaveBeenCalledWith('capability-1', 'phase_01_skill');
  });
});
