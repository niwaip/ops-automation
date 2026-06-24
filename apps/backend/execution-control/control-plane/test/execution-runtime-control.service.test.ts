import { ExecutionRuntimeControlService } from '../src/modules/execution/step-runner/runtime/execution-runtime-control.service';

describe('ExecutionRuntimeControlService', () => {
  it('passes runtime waiting_input through ExecutionFailureService with hooks', async () => {
    const executionFailureService = {
      enterRuntimeWaitingInput: jest.fn().mockResolvedValue(undefined),
      failExecutionFromRuntimeStep: jest.fn().mockResolvedValue(undefined),
      enterPendingApprovalFromRuntimeStep: jest.fn().mockResolvedValue(undefined),
    };
    const executionHumanControlService = {
      takeover: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ExecutionRuntimeControlService(
      executionFailureService as never,
      executionHumanControlService as never
    );
    const hooks = {
      emitEvent: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      closeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
    };

    await service.enterRuntimeWaitingInput(
      'execution-1',
      'runtime-1',
      'step-1',
      [{ name: 'url', type: 'string' }],
      'missing fields',
      hooks
    );

    expect(executionFailureService.enterRuntimeWaitingInput).toHaveBeenCalledWith(
      'execution-1',
      'runtime-1',
      'step-1',
      [{ name: 'url', type: 'string' }],
      'missing fields',
      hooks
    );
  });

  it('delegates runtime failure and system takeover to underlying services', async () => {
    const executionFailureService = {
      enterRuntimeWaitingInput: jest.fn().mockResolvedValue(undefined),
      failExecutionFromRuntimeStep: jest.fn().mockResolvedValue(undefined),
      enterPendingApprovalFromRuntimeStep: jest.fn().mockResolvedValue(undefined),
    };
    const executionHumanControlService = {
      takeover: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ExecutionRuntimeControlService(
      executionFailureService as never,
      executionHumanControlService as never
    );
    const failureHooks = {
      emitEvent: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      closeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
    };
    const humanControlHooks = {
      getExecutionDto: jest.fn(),
      emitEvent: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      freezeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
      resumeRuntimeSessionQuietly: jest.fn().mockResolvedValue(undefined),
      advanceExecutionFlow: jest.fn().mockResolvedValue(undefined),
    };

    await service.failExecutionFromRuntimeStep(
      {
        executionId: 'execution-2',
        stepId: 'step-2',
        failureReason: 'boom',
        failureCode: 'ERR',
        runtimeSessionId: 'runtime-2',
      },
      failureHooks
    );
    await service.enterPendingApprovalFromRuntimeStep('execution-3', 'blocked', {
      updateStatus: failureHooks.updateStatus,
    });
    await service.requestSystemTakeover('execution-4', 'need-human', humanControlHooks);

    expect(executionFailureService.failExecutionFromRuntimeStep).toHaveBeenCalledWith(
      {
        executionId: 'execution-2',
        stepId: 'step-2',
        failureReason: 'boom',
        failureCode: 'ERR',
        runtimeSessionId: 'runtime-2',
      },
      failureHooks
    );
    expect(executionFailureService.enterPendingApprovalFromRuntimeStep).toHaveBeenCalledWith(
      'execution-3',
      'blocked',
      { updateStatus: failureHooks.updateStatus }
    );
    expect(executionHumanControlService.takeover).toHaveBeenCalledWith(
      'execution-4',
      'system',
      { reason: 'need-human' },
      humanControlHooks,
      { id: 'system', role: 'admin' }
    );
  });
});
