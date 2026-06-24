import { ExecutionSystemSkillResultService } from '../src/modules/execution/step-runner/runtime/execution-system-skill-result.service';

describe('ExecutionSystemSkillResultService', () => {
  it('interprets skill runtime results and then syncs phase state', async () => {
    const runtimeResultInterpreter = {
      handleSkillRuntimeResult: jest.fn().mockResolvedValue(undefined),
    };
    const executionPhaseSyncService = {
      syncPhaseAfterStepResult: jest.fn().mockResolvedValue(undefined),
      syncWorkflowActivityPhasesAfterSkillResult: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionSystemSkillResultService(
      runtimeResultInterpreter as never,
      executionPhaseSyncService as never
    );
    const hooks = {
      emitEvent: jest.fn().mockResolvedValue(undefined),
      advanceExecutionFlow: jest.fn().mockResolvedValue(undefined),
      failExecution: jest.fn().mockResolvedValue(undefined),
      takeover: jest.fn().mockResolvedValue(undefined),
      enterWaitingInput: jest.fn().mockResolvedValue(undefined),
      enterPendingApproval: jest.fn().mockResolvedValue(undefined),
      loadWorkflowActivityPhaseDefinitions: jest.fn().mockResolvedValue([]),
    };
    const result = {
      success: true,
      status: 'completed' as const,
      output: { ok: true },
      rawResult: {
        releaseId: 'release-1',
        capabilityId: 'capability-1',
        publishedSkillId: 'published-skill-1',
        runtime: 'capability_runtime',
        logs: [],
      },
    };

    await service.handleSystemSkillStepResult(
      {
        executionId: 'execution-1',
        runtimeSessionId: 'runtime-1',
        stepId: 'step-1',
        result,
        capabilityId: 'capability-1',
        phaseMetadata: {
          phaseKey: 'phase_01_skill',
          phaseName: '执行技能',
          phaseType: 'system_skill',
        },
        step: { id: 'step-1', type: 'system', action: 'execute_skill' },
      },
      hooks
    );

    expect(runtimeResultInterpreter.handleSkillRuntimeResult).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: 'execution-1',
        runtimeSessionId: 'runtime-1',
        stepId: 'step-1',
        emitEvent: hooks.emitEvent,
        advanceExecutionFlow: hooks.advanceExecutionFlow,
        failExecution: hooks.failExecution,
        takeover: hooks.takeover,
        enterWaitingInput: hooks.enterWaitingInput,
        enterPendingApproval: hooks.enterPendingApproval,
      }),
      result
    );
    expect(executionPhaseSyncService.syncPhaseAfterStepResult).toHaveBeenCalledWith(
      'execution-1',
      'runtime-1',
      result,
      {
        phaseKey: 'phase_01_skill',
        phaseName: '执行技能',
        phaseType: 'system_skill',
      },
      { id: 'step-1', type: 'system', action: 'execute_skill' }
    );
    expect(
      executionPhaseSyncService.syncWorkflowActivityPhasesAfterSkillResult
    ).toHaveBeenCalledWith(
      'execution-1',
      'runtime-1',
      'capability-1',
      result,
      {
        phaseKey: 'phase_01_skill',
        phaseName: '执行技能',
        phaseType: 'system_skill',
      }
    );
  });

  it('temporarily bridges workflow activity phase loader overrides', async () => {
    const originalLoader = jest.fn().mockResolvedValue(['original']);
    const customLoader = jest.fn().mockResolvedValue(['custom']);
    const executionPhaseSyncService = {
      syncPhaseAfterStepResult: jest.fn().mockResolvedValue(undefined),
      syncWorkflowActivityPhasesAfterSkillResult: jest.fn().mockImplementation(async () => {
        await executionPhaseSyncService.loadWorkflowActivityPhaseDefinitions?.(
          'capability-1',
          'phase_01_skill'
        );
      }),
      loadWorkflowActivityPhaseDefinitions: originalLoader,
    };

    const service = new ExecutionSystemSkillResultService(
      undefined,
      executionPhaseSyncService as never
    );

    await service.syncWorkflowActivityPhasesAfterSkillResult(
      'execution-1',
      'runtime-1',
      'capability-1',
      {
        success: false,
        status: 'failed' as const,
      },
      {
        phaseKey: 'phase_01_skill',
        phaseName: '执行技能',
        phaseType: 'system_skill',
      },
      customLoader
    );

    expect(customLoader).toHaveBeenCalledWith('capability-1', 'phase_01_skill');
    expect(executionPhaseSyncService.loadWorkflowActivityPhaseDefinitions).toBe(originalLoader);
  });

  it('marks the currently running workflow activity as failed when skill runtime fails without phaseResults', async () => {
    const customLoader = jest.fn().mockResolvedValue([
      {
        phaseKey: 'phase_01_execute_skill__activity_01_open',
        phaseName: '1. 页面打开',
        phaseType: 'workflow_activity',
        activityName: '1. 页面打开',
        parentPhaseKey: 'phase_01_execute_skill',
        order: 1,
      },
      {
        phaseKey: 'phase_01_execute_skill__activity_02_process',
        phaseName: '2. 页面处理',
        phaseType: 'workflow_activity',
        activityName: '2. 页面处理',
        parentPhaseKey: 'phase_01_execute_skill',
        order: 2,
      },
    ]);
    const executionPhaseSyncService = {
      listByExecutionId: jest.fn().mockResolvedValue([
        {
          phase_key: 'phase_01_execute_skill__activity_01_open',
          phase_name: '1. 页面打开',
          phase_type: 'workflow_activity',
          status: 'completed',
          input_json: {
            parentPhaseKey: 'phase_01_execute_skill',
            order: 1,
          },
        },
        {
          phase_key: 'phase_01_execute_skill__activity_02_process',
          phase_name: '2. 页面处理',
          phase_type: 'workflow_activity',
          status: 'running',
          input_json: {
            parentPhaseKey: 'phase_01_execute_skill',
            order: 2,
          },
        },
      ]),
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
      syncPhaseAfterStepResult: jest.fn().mockResolvedValue(undefined),
      syncWorkflowActivityPhasesAfterSkillResult: jest
        .fn()
        .mockImplementation(async function (
          this: {
            loadWorkflowActivityPhaseDefinitions?: (
              capabilityId: string,
              parentPhaseKey: string
            ) => Promise<unknown>;
          },
          executionId: string,
          runtimeSessionId: string,
          capabilityId: string,
          result: {
            success: boolean;
            status: 'failed';
            errorCode: string;
            errorMessage: string;
            output: Record<string, unknown>;
            rawResult: Record<string, unknown>;
          },
          phaseMetadata?: {
            phaseKey: string;
            phaseName: string;
            phaseType: string;
          }
        ) {
          const activityPhases = (await this.loadWorkflowActivityPhaseDefinitions?.(
            capabilityId,
            phaseMetadata?.phaseKey || ''
          )) as Array<{
            phaseKey: string;
            phaseName: string;
            phaseType: string;
            activityName?: string;
          }>;
          const failedActivityPhase = activityPhases[1];
          await executionPhaseSyncService.createOrUpdatePhase({
            executionId,
            phaseKey: failedActivityPhase.phaseKey,
            phaseName: failedActivityPhase.phaseName,
            phaseType: failedActivityPhase.phaseType,
            status: 'failed',
            attempt: 1,
            runtimeSessionId,
            output: {
              parentPhaseKey: phaseMetadata?.phaseKey,
              activityName: failedActivityPhase.activityName || failedActivityPhase.phaseName,
              result: result.output || result.rawResult || null,
            },
            recoveryDecision: null,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
            completedAt: expect.any(Date),
          });
        }),
    };
    const service = new ExecutionSystemSkillResultService(
      undefined,
      executionPhaseSyncService as never
    );

    await service.syncWorkflowActivityPhasesAfterSkillResult(
      'execution-1',
      'runtime-1',
      'published-skill-1',
      {
        success: false,
        status: 'failed' as const,
        errorCode: 'CAPABILITY_RUNTIME_FAILED',
        errorMessage: 'browser-worker 执行失败',
        output: {
          temporalLink: 'http://temporal.local/workflow/1',
        },
        rawResult: {
          output: {
            temporalLink: 'http://temporal.local/workflow/1',
          },
        },
      },
      {
        phaseKey: 'phase_01_execute_skill',
        phaseName: '执行技能',
        phaseType: 'system_skill',
      },
      customLoader
    );

    expect(executionPhaseSyncService.createOrUpdatePhase).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: 'execution-1',
        phaseKey: 'phase_01_execute_skill__activity_02_process',
        phaseName: '2. 页面处理',
        status: 'failed',
        errorCode: 'CAPABILITY_RUNTIME_FAILED',
      })
    );
  });

  it('marks workflow activity as waiting_takeover when phaseResults return takeover_required', async () => {
    const customLoader = jest.fn().mockResolvedValue([
      {
        phaseKey: 'phase_01_execute_skill__activity_01_open',
        phaseName: '1. 页面打开',
        phaseType: 'workflow_activity',
        activityName: '1. 页面打开',
        parentPhaseKey: 'phase_01_execute_skill',
        order: 1,
      },
      {
        phaseKey: 'phase_01_execute_skill__activity_02_process',
        phaseName: '2. 页面处理',
        phaseType: 'workflow_activity',
        activityName: '2. 页面处理',
        parentPhaseKey: 'phase_01_execute_skill',
        order: 2,
      },
    ]);
    const executionPhaseSyncService = {
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      replaceArtifacts: jest.fn().mockResolvedValue(undefined),
      replaceSteps: jest.fn().mockResolvedValue(undefined),
      syncPhaseAfterStepResult: jest.fn().mockResolvedValue(undefined),
      syncWorkflowActivityPhasesAfterSkillResult: jest
        .fn()
        .mockImplementation(async function (
          this: {
            loadWorkflowActivityPhaseDefinitions?: (
              capabilityId: string,
              parentPhaseKey: string
            ) => Promise<unknown>;
          },
          executionId: string,
          runtimeSessionId: string,
          capabilityId: string,
          result: {
            output?: {
              phaseResults?: Array<{
                result?: {
                  status?: string;
                  errorCode?: string;
                  errorMessage?: string;
                };
                stepName?: string;
                activityName?: string;
              }>;
            };
          },
          phaseMetadata?: {
            phaseKey: string;
          }
        ) {
          const activityPhases = (await this.loadWorkflowActivityPhaseDefinitions?.(
            capabilityId,
            phaseMetadata?.phaseKey || ''
          )) as Array<{
            phaseKey: string;
            phaseName: string;
            phaseType: string;
          }>;
          await executionPhaseSyncService.markCompleted('execution-1', activityPhases[0].phaseKey, {
            phaseName: activityPhases[0].phaseName,
          });
          await executionPhaseSyncService.createOrUpdatePhase({
            executionId,
            phaseKey: activityPhases[1].phaseKey,
            phaseName: activityPhases[1].phaseName,
            phaseType: activityPhases[1].phaseType,
            status: 'waiting_takeover',
            attempt: 1,
            runtimeSessionId,
            errorCode: result.output?.phaseResults?.[1]?.result?.errorCode || null,
            errorMessage: result.output?.phaseResults?.[1]?.result?.errorMessage || null,
            completedAt: null,
          });
        }),
    };
    const service = new ExecutionSystemSkillResultService(
      undefined,
      executionPhaseSyncService as never
    );

    await service.syncWorkflowActivityPhasesAfterSkillResult(
      'execution-1',
      'runtime-1',
      'published-skill-1',
      {
        success: false,
        status: 'takeover_required' as const,
        errorCode: 'BROWSER_WORKER_EXECUTION_FAILED',
        errorMessage: '浏览器页面未进入预期状态',
        requiresTakeover: true,
        output: {
          phaseResults: [
            {
              result: {
                status: 'completed',
                results: [{ status: 'success', command: 'navigate' }],
              },
              stepName: '1. 页面打开',
              activityName: '1. 页面打开',
            },
            {
              result: {
                status: 'takeover_required',
                errorCode: 'BROWSER_WORKER_EXECUTION_FAILED',
                errorMessage: '浏览器页面未进入预期状态',
                results: [{ status: 'error', command: 'fill', message: 'selector not found' }],
              },
              stepName: '2. 页面处理',
              activityName: '2. 页面处理',
            },
          ],
        },
      },
      {
        phaseKey: 'phase_01_execute_skill',
        phaseName: '执行技能',
        phaseType: 'system_skill',
      },
      customLoader
    );

    expect(executionPhaseSyncService.markCompleted).toHaveBeenCalledWith(
      'execution-1',
      'phase_01_execute_skill__activity_01_open',
      expect.objectContaining({
        phaseName: '1. 页面打开',
      })
    );
    expect(executionPhaseSyncService.createOrUpdatePhase).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: 'execution-1',
        phaseKey: 'phase_01_execute_skill__activity_02_process',
        phaseName: '2. 页面处理',
        status: 'waiting_takeover',
        errorCode: 'BROWSER_WORKER_EXECUTION_FAILED',
        errorMessage: '浏览器页面未进入预期状态',
        completedAt: null,
      })
    );
  });
});
