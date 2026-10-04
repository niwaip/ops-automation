import { ExecutionHumanControlService } from '../src/modules/execution/human-control/execution-human-control.service';
import { EXECUTION_STATUS } from '../src/modules/execution/contracts/execution-status';
import { EXECUTION_STEP_STATUS } from '../src/modules/execution/contracts/execution-step-status';

describe('ExecutionHumanControlService - Deterministic Plan & Human Takeover Resolution', () => {
  it('resolves failed step as succeeded and advances deterministic plan scheduler upon resolve_by_human', async () => {
    const executionId = 'exec-takeover-1';
    const stepId = 'step-failed-1';
    const phaseKey = 'phase_01_n1_live_skill';

    const executionRecord = {
      id: executionId,
      createdBy: 'user-1',
      status: EXECUTION_STATUS.HUMAN_CONTROL,
      executionMode: 'deterministic_plan',
      currentStepId: stepId,
      currentPhaseKey: phaseKey,
      takeoverRequired: true,
      takeoverReason: '运行时动作需要人工接管',
    };

    const phaseRecord = {
      id: 'phase-1',
      phase_key: phaseKey,
      phase_name: 'n1_live_skill',
      phase_type: 'browser_recording',
      status: 'waiting_takeover',
      runtime_session_id: 'session-1',
      input_json: null,
      output_json: {
        variables: { grossProfitRate: '17.8%' },
      },
      recovery_decision_json: {
        patch: {
          type: 'resolve_by_human',
          failedStepId: 'step_9',
          resumeFromStepId: 'step_10',
          note: '同意并继续',
        },
        comment: '同意并继续',
        reconciledBy: 'user-1',
      },
    };

    const failedStepRecord = {
      id: stepId,
      executionId,
      stepIndex: 1,
      name: 'live_skill',
      planNodeId: 'n1_live_skill',
      status: EXECUTION_STEP_STATUS.FAILED,
      type: 'system',
      action: 'browser_template',
      inputJson: { grossMarginThreshold: 20 },
      outputJson: {
        variables: { grossProfitRate: '17.8%' },
      },
      errorCode: 'CAPABILITY_RUNTIME_FAILED',
      errorMessage: '毛利率低于20%',
      takeoverTriggered: true,
    };

    const prisma = {
      execution: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === executionId) return Promise.resolve(executionRecord);
          return Promise.resolve(null);
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      executionPhase: {
        findFirst: jest.fn().mockResolvedValue(phaseRecord),
      },
      executionStep: {
        findMany: jest.fn().mockResolvedValue([failedStepRecord]),
      },
      runtimeSession: {
        findFirst: jest.fn().mockResolvedValue({ id: 'session-1' }),
      },
    };

    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue(phaseRecord),
      resolveTakeoverRecord: jest.fn().mockResolvedValue(undefined),
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markRunning: jest.fn().mockResolvedValue(undefined),
    };

    const executionStepService = {
      getById: jest.fn().mockResolvedValue(failedStepRecord),
      finishRuntimeStep: jest.fn().mockResolvedValue(undefined),
      requeueFailedStep: jest.fn().mockResolvedValue(undefined),
    };

    const planSchedulerService = {
      advanceExecution: jest.fn().mockResolvedValue(undefined),
    };

    const hooks = {
      getExecutionDto: jest.fn().mockResolvedValue({ id: executionId } as any),
      emitEvent: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      freezeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
      resumeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
      advanceExecutionFlow: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionHumanControlService(
      prisma as any,
      executionPhaseService as any,
      executionStepService as any,
      planSchedulerService as any
    );

    await service.resumePhaseTakeover(
      executionId,
      phaseKey,
      'user-1',
      { comment: '同意并继续' },
      hooks as any,
      { id: 'user-1' }
    );

    // 1. Should have requeued failed step so scheduler can resume remaining steps from resumeFromStepId
    expect(executionStepService.requeueFailedStep).toHaveBeenCalledWith(stepId);
    expect(executionStepService.finishRuntimeStep).not.toHaveBeenCalled();

    // 2. Should have resolved takeover record
    expect(executionPhaseService.resolveTakeoverRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId,
        phaseId: 'phase-1',
        resolvedBy: 'user-1',
      })
    );

    // 3. Should have updated execution status to RUNNING and cleared takeover flags
    expect(hooks.updateStatus).toHaveBeenCalledWith(executionId, EXECUTION_STATUS.RUNNING);
    expect(prisma.execution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: executionId },
        data: expect.objectContaining({
          takeoverRequired: false,
          takeoverReason: null,
          currentPhaseStatus: null,
        }),
      })
    );

    // 4. Must NOT advance via legacy advanceExecutionFlow
    expect(hooks.advanceExecutionFlow).not.toHaveBeenCalled();

    // 5. Must advance via planSchedulerService.advanceExecution
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(planSchedulerService.advanceExecution).toHaveBeenCalledWith(executionId);
  });

  it('requeues step and advances deterministic plan scheduler upon retry without resolve_by_human patch', async () => {
    const executionId = 'exec-retry-1';
    const stepId = 'step-failed-2';
    const phaseKey = 'phase_01_n1_retry_skill';

    const executionRecord = {
      id: executionId,
      createdBy: 'user-1',
      status: EXECUTION_STATUS.HUMAN_CONTROL,
      executionMode: 'deterministic_plan',
      currentStepId: stepId,
      currentPhaseKey: phaseKey,
      takeoverRequired: true,
    };

    const phaseRecord = {
      id: 'phase-2',
      phase_key: phaseKey,
      phase_name: 'n1_retry_skill',
      status: 'waiting_takeover',
      runtime_session_id: 'session-2',
      recovery_decision_json: {
        patch: {
          type: 'retry',
        },
      },
    };

    const failedStepRecord = {
      id: stepId,
      executionId,
      stepIndex: 1,
      name: 'retry_skill',
      planNodeId: 'n1_retry_skill',
      status: EXECUTION_STEP_STATUS.FAILED,
    };

    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue(executionRecord),
        update: jest.fn().mockResolvedValue(undefined),
      },
      executionPhase: {
        findFirst: jest.fn().mockResolvedValue(phaseRecord),
      },
      executionStep: {
        findMany: jest.fn().mockResolvedValue([failedStepRecord]),
      },
      runtimeSession: {
        findFirst: jest.fn().mockResolvedValue({ id: 'session-2' }),
      },
    };

    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue(phaseRecord),
      resolveTakeoverRecord: jest.fn().mockResolvedValue(undefined),
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
    };

    const executionStepService = {
      getById: jest.fn().mockResolvedValue(failedStepRecord),
      finishRuntimeStep: jest.fn().mockResolvedValue(undefined),
      requeueFailedStep: jest.fn().mockResolvedValue(undefined),
    };

    const planSchedulerService = {
      advanceExecution: jest.fn().mockResolvedValue(undefined),
    };

    const hooks = {
      getExecutionDto: jest.fn().mockResolvedValue({ id: executionId } as any),
      emitEvent: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      freezeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
      resumeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
      advanceExecutionFlow: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionHumanControlService(
      prisma as any,
      executionPhaseService as any,
      executionStepService as any,
      planSchedulerService as any
    );

    await service.resume(
      executionId,
      'user-1',
      { comment: 'Retrying step' },
      hooks as any,
      { id: 'user-1' }
    );

    expect(executionStepService.requeueFailedStep).toHaveBeenCalledWith(stepId);
    expect(executionStepService.finishRuntimeStep).not.toHaveBeenCalled();
    expect(hooks.advanceExecutionFlow).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(planSchedulerService.advanceExecution).toHaveBeenCalledWith(executionId);
  });

  it('finishes step as succeeded when resolve_by_human has NO resumeFromStepId', async () => {
    const executionId = 'exec-complete-1';
    const stepId = 'step-failed-3';
    const phaseKey = 'phase_01_n1_complete_skill';

    const executionRecord = {
      id: executionId,
      createdBy: 'user-1',
      status: EXECUTION_STATUS.HUMAN_CONTROL,
      executionMode: 'deterministic_plan',
      currentStepId: stepId,
      currentPhaseKey: phaseKey,
      takeoverRequired: true,
    };

    const phaseRecord = {
      id: 'phase-3',
      phase_key: phaseKey,
      phase_name: 'n1_complete_skill',
      status: 'waiting_takeover',
      runtime_session_id: 'session-3',
      output_json: {
        variables: { grossProfitRate: '25.0%' },
      },
      recovery_decision_json: {
        patch: {
          type: 'resolve_by_human',
          note: '人工已在线下全部处理完成',
        },
        comment: '人工已在线下全部处理完成',
        reconciledBy: 'user-1',
      },
    };

    const failedStepRecord = {
      id: stepId,
      executionId,
      stepIndex: 1,
      name: 'complete_skill',
      planNodeId: 'n1_complete_skill',
      status: EXECUTION_STEP_STATUS.FAILED,
      outputJson: {
        variables: { grossProfitRate: '25.0%' },
      },
      errorCode: 'TAKEOVER_REQUIRED',
      errorMessage: '需要人工确认',
      takeoverTriggered: true,
    };

    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue(executionRecord),
        update: jest.fn().mockResolvedValue(undefined),
      },
      executionPhase: {
        findFirst: jest.fn().mockResolvedValue(phaseRecord),
      },
      executionStep: {
        findMany: jest.fn().mockResolvedValue([failedStepRecord]),
      },
      runtimeSession: {
        findFirst: jest.fn().mockResolvedValue({ id: 'session-3' }),
      },
    };

    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue(phaseRecord),
      resolveTakeoverRecord: jest.fn().mockResolvedValue(undefined),
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
    };

    const executionStepService = {
      getById: jest.fn().mockResolvedValue(failedStepRecord),
      finishRuntimeStep: jest.fn().mockResolvedValue(undefined),
      requeueFailedStep: jest.fn().mockResolvedValue(undefined),
    };

    const planSchedulerService = {
      advanceExecution: jest.fn().mockResolvedValue(undefined),
    };

    const hooks = {
      getExecutionDto: jest.fn().mockResolvedValue({ id: executionId } as any),
      emitEvent: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      freezeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
      resumeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
      advanceExecutionFlow: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionHumanControlService(
      prisma as any,
      executionPhaseService as any,
      executionStepService as any,
      planSchedulerService as any
    );

    await service.resumePhaseTakeover(
      executionId,
      phaseKey,
      'user-1',
      { comment: '人工已在线下全部处理完成' },
      hooks as any,
      { id: 'user-1' }
    );

    expect(executionStepService.finishRuntimeStep).toHaveBeenCalledWith(
      stepId,
      expect.objectContaining({
        success: true,
        takeoverTriggered: false,
        outputJson: expect.objectContaining({
          resolvedByHuman: true,
          resolvedBy: 'user-1',
          resolutionNote: '人工已在线下全部处理完成',
        }),
      })
    );
    expect(executionStepService.requeueFailedStep).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(planSchedulerService.advanceExecution).toHaveBeenCalledWith(executionId);
  });

  it('requeues step and infers resume step when resolve_by_human has failedStepId but NO resumeFromStepId', async () => {
    const executionId = 'exec-infer-resume-1';
    const stepId = 'step-failed-4';
    const phaseKey = 'phase_01_n1_loop_skill';

    const executionRecord = {
      id: executionId,
      createdBy: 'user-1',
      status: EXECUTION_STATUS.HUMAN_CONTROL,
      executionMode: 'deterministic_plan',
      currentStepId: stepId,
      currentPhaseKey: phaseKey,
      takeoverRequired: true,
      takeoverReason: '毛利率低于20%',
    };

    const phaseRecord = {
      id: 'phase-4',
      phase_key: phaseKey,
      phase_name: 'n1_loop_skill',
      status: 'waiting_takeover',
      runtime_session_id: 'session-4',
      output_json: {
        variables: { grossProfitRate: '17.8%' },
      },
      recovery_decision_json: {
        patch: {
          type: 'resolve_by_human',
          failedStepId: 'step_9',
          note: '特批放行',
        },
        comment: '特批放行',
        reconciledBy: 'user-1',
      },
    };

    const failedStepRecord = {
      id: stepId,
      executionId,
      stepIndex: 1,
      name: 'loop_skill',
      planNodeId: 'n1_loop_skill',
      status: EXECUTION_STEP_STATUS.FAILED,
      inputJson: {},
      outputJson: {
        variables: { grossProfitRate: '17.8%' },
      },
      takeoverTriggered: true,
    };

    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue(executionRecord),
        update: jest.fn().mockResolvedValue(undefined),
      },
      executionPhase: {
        findFirst: jest.fn().mockResolvedValue(phaseRecord),
      },
      executionStep: {
        findMany: jest.fn().mockResolvedValue([failedStepRecord]),
        update: jest.fn().mockResolvedValue(undefined),
      },
      runtimeSession: {
        findFirst: jest.fn().mockResolvedValue({ id: 'session-4' }),
      },
    };

    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue(phaseRecord),
      resolveTakeoverRecord: jest.fn().mockResolvedValue(undefined),
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
    };

    const executionStepService = {
      getById: jest.fn().mockResolvedValue(failedStepRecord),
      finishRuntimeStep: jest.fn().mockResolvedValue(undefined),
      requeueFailedStep: jest.fn().mockResolvedValue(undefined),
    };

    const planSchedulerService = {
      advanceExecution: jest.fn().mockResolvedValue(undefined),
    };

    const hooks = {
      getExecutionDto: jest.fn().mockResolvedValue({ id: executionId } as any),
      emitEvent: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      freezeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
      resumeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
      advanceExecutionFlow: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionHumanControlService(
      prisma as any,
      executionPhaseService as any,
      executionStepService as any,
      planSchedulerService as any
    );

    await service.resumePhaseTakeover(
      executionId,
      phaseKey,
      'user-1',
      { comment: '特批放行' },
      hooks as any,
      { id: 'user-1' }
    );

    // Should NOT finish whole step; must requeue and inject inferred step_10
    expect(executionStepService.finishRuntimeStep).not.toHaveBeenCalled();
    expect(executionStepService.requeueFailedStep).toHaveBeenCalledWith(stepId);
    expect(prisma.executionStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: stepId },
        data: expect.objectContaining({
          inputJson: expect.objectContaining({
            __resumeFromStepId: 'step_10',
          }),
        }),
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(planSchedulerService.advanceExecution).toHaveBeenCalledWith(executionId);
  });

  it('finishes step as succeeded and advances scheduler when resolve_by_human has resumeFromStepId equal to targetStep.id or failedStepId', async () => {
    const executionId = 'exec-uuid-resolve-1';
    const stepId = 'c6fd5967-b875-44e6-b21e-9dcf96428be1';
    const phaseKey = 'phase_01_browser_recording';

    const executionRecord = {
      id: executionId,
      createdBy: 'user-1',
      status: EXECUTION_STATUS.HUMAN_CONTROL,
      executionMode: 'deterministic_plan',
      currentStepId: stepId,
      currentPhaseKey: phaseKey,
      takeoverRequired: true,
      takeoverReason: '案件粗利率（毛利率）未达到20%以上或未能正确识别，需要人工介入判断',
    };

    const phaseRecord = {
      id: 'phase-uuid-1',
      phase_key: phaseKey,
      phase_name: 'browser_recording',
      phase_type: 'browser_recording',
      status: 'waiting_takeover',
      runtime_session_id: 'session-uuid-1',
      output_json: {
        variables: { grossProfitRate: '17.8%' },
      },
      recovery_decision_json: {
        patch: {
          type: 'resolve_by_human',
          failedStepId: stepId,
          resumeFromStepId: stepId,
          note: '人工已处理 / 特批放行',
        },
        comment: '人工已处理 / 特批放行',
        reconciledBy: 'user-1',
      },
    };

    const failedStepRecord = {
      id: stepId,
      executionId,
      stepIndex: 1,
      name: '浏览器录制执行',
      planNodeId: 'browser_recording',
      status: EXECUTION_STEP_STATUS.FAILED,
      inputJson: { grossMarginThreshold: 20 },
      outputJson: {
        variables: { grossProfitRate: '17.8%' },
      },
      errorCode: 'CAPABILITY_RUNTIME_FAILED',
      errorMessage: '毛利率低于20%',
      takeoverTriggered: true,
    };

    const prisma = {
      execution: {
        findUnique: jest.fn().mockResolvedValue(executionRecord),
        update: jest.fn().mockResolvedValue(undefined),
      },
      executionPhase: {
        findFirst: jest.fn().mockResolvedValue(phaseRecord),
      },
      executionStep: {
        findMany: jest.fn().mockResolvedValue([failedStepRecord]),
        update: jest.fn().mockResolvedValue(undefined),
      },
      runtimeSession: {
        findFirst: jest.fn().mockResolvedValue({ id: 'session-uuid-1' }),
      },
    };

    const executionPhaseService = {
      getByExecutionIdAndPhaseKey: jest.fn().mockResolvedValue(phaseRecord),
      resolveTakeoverRecord: jest.fn().mockResolvedValue(undefined),
      createOrUpdatePhase: jest.fn().mockResolvedValue(undefined),
    };

    const executionStepService = {
      getById: jest.fn().mockResolvedValue(failedStepRecord),
      finishRuntimeStep: jest.fn().mockResolvedValue(undefined),
      requeueFailedStep: jest.fn().mockResolvedValue(undefined),
    };

    const planSchedulerService = {
      advanceExecution: jest.fn().mockResolvedValue(undefined),
    };

    const hooks = {
      getExecutionDto: jest.fn().mockResolvedValue({ id: executionId } as any),
      emitEvent: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      freezeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
      resumeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
      advanceExecutionFlow: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ExecutionHumanControlService(
      prisma as any,
      executionPhaseService as any,
      executionStepService as any,
      planSchedulerService as any
    );

    await service.resumePhaseTakeover(
      executionId,
      phaseKey,
      'user-1',
      { stepId, comment: '人工已处理 / 特批放行' },
      hooks as any,
      { id: 'user-1' }
    );

    // 1. MUST finish target step as succeeded (NOT requeue!)
    expect(executionStepService.finishRuntimeStep).toHaveBeenCalledWith(
      stepId,
      expect.objectContaining({
        success: true,
        takeoverTriggered: false,
        outputJson: expect.objectContaining({
          resolvedByHuman: true,
          resolvedBy: 'user-1',
          resolutionNote: '人工已处理 / 特批放行',
        }),
      })
    );
    expect(executionStepService.requeueFailedStep).not.toHaveBeenCalled();

    // 2. MUST mark phase as completed
    expect(executionPhaseService.createOrUpdatePhase).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId,
        phaseKey,
        status: 'completed',
      })
    );

    // 3. MUST advance deterministic plan scheduler without stale resumeFromStepId
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(planSchedulerService.advanceExecution).toHaveBeenCalledWith(executionId);
  });
});
