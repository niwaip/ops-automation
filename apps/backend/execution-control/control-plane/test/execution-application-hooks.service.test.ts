import { ExecutionApplicationHooksService } from '../src/modules/execution/shared/execution-application-hooks.service';

describe('ExecutionApplicationHooksService', () => {
  it('builds lifecycle hooks that preserve lifecycle callbacks', async () => {
    const service = new ExecutionApplicationHooksService();
    const callbacks = {
      getExecutionDto: jest.fn().mockResolvedValue({ id: 'execution-1' }),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      emitEvent: jest.fn().mockResolvedValue(undefined),
    };

    const hooks = service.createLifecycleHooks(callbacks);

    await expect(hooks.getExecutionDto('execution-1', { id: 'user-1' })).resolves.toEqual({
      id: 'execution-1',
    });
    await hooks.updateStatus('execution-1', 'cancelled');
    await hooks.emitEvent('execution-1', 'execution.cancelled', { userId: 'user-1' });

    expect(callbacks.getExecutionDto).toHaveBeenCalledWith('execution-1', { id: 'user-1' });
    expect(callbacks.updateStatus).toHaveBeenCalledWith('execution-1', 'cancelled');
    expect(callbacks.emitEvent).toHaveBeenCalledWith('execution-1', 'execution.cancelled', {
      userId: 'user-1',
    });
  });

  it('builds approval hooks that preserve approval callbacks', async () => {
    const service = new ExecutionApplicationHooksService();
    const callbacks = {
      getExecutionDto: jest.fn().mockResolvedValue({ id: 'execution-approve' }),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      emitEvent: jest.fn().mockResolvedValue(undefined),
      startExecution: jest.fn().mockResolvedValue(undefined),
    };

    const hooks = service.createApprovalHooks(callbacks);

    await expect(hooks.getExecutionDto('execution-approve', { id: 'approver-1' })).resolves.toEqual({
      id: 'execution-approve',
    });
    await hooks.updateStatus('execution-approve', 'queued');
    await hooks.emitEvent('execution-approve', 'execution.approved', { userId: 'approver-1' });
    await hooks.startExecution('execution-approve');

    expect(callbacks.getExecutionDto).toHaveBeenCalledWith('execution-approve', {
      id: 'approver-1',
    });
    expect(callbacks.updateStatus).toHaveBeenCalledWith('execution-approve', 'queued');
    expect(callbacks.emitEvent).toHaveBeenCalledWith(
      'execution-approve',
      'execution.approved',
      { userId: 'approver-1' }
    );
    expect(callbacks.startExecution).toHaveBeenCalledWith('execution-approve');
  });

  it('builds create hooks that preserve creation callbacks', async () => {
    const service = new ExecutionApplicationHooksService();
    const callbacks = {
      getExecutionDto: jest.fn().mockResolvedValue({ id: 'execution-create' }),
      emitEvent: jest.fn().mockResolvedValue(undefined),
      enterWaitingInput: jest.fn().mockResolvedValue(undefined),
      startExecution: jest.fn().mockResolvedValue(undefined),
    };

    const hooks = service.createCreateHooks(callbacks);

    await expect(hooks.getExecutionDto('execution-create')).resolves.toEqual({
      id: 'execution-create',
    });
    await hooks.emitEvent('execution-create', 'execution.created', { userId: 'user-1' });
    await hooks.enterWaitingInput({ id: 'execution-create' }, 'step-input-1');
    await hooks.startExecution('execution-create');

    expect(callbacks.getExecutionDto).toHaveBeenCalledWith('execution-create');
    expect(callbacks.emitEvent).toHaveBeenCalledWith('execution-create', 'execution.created', {
      userId: 'user-1',
    });
    expect(callbacks.enterWaitingInput).toHaveBeenCalledWith(
      { id: 'execution-create' },
      'step-input-1'
    );
    expect(callbacks.startExecution).toHaveBeenCalledWith('execution-create');
  });

  it('builds submit input hooks that preserve resume callbacks', async () => {
    const service = new ExecutionApplicationHooksService();
    const callbacks = {
      getExecutionDto: jest.fn().mockResolvedValue({ id: 'execution-submit' }),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      emitEvent: jest.fn().mockResolvedValue(undefined),
      startExecution: jest.fn().mockResolvedValue(undefined),
      advanceExecutionFlow: jest.fn().mockResolvedValue(undefined),
    };

    const hooks = service.createSubmitInputHooks(callbacks);

    await expect(hooks.getExecutionDto('execution-submit', { id: 'user-1' })).resolves.toEqual({
      id: 'execution-submit',
    });
    await hooks.updateStatus('execution-submit', 'running');
    await hooks.emitEvent('execution-submit', 'execution.input_submitted', { stepId: 'step-1' });
    await hooks.startExecution('execution-submit');
    await hooks.advanceExecutionFlow('execution-submit', 'runtime-1');

    expect(callbacks.getExecutionDto).toHaveBeenCalledWith('execution-submit', { id: 'user-1' });
    expect(callbacks.updateStatus).toHaveBeenCalledWith('execution-submit', 'running');
    expect(callbacks.emitEvent).toHaveBeenCalledWith(
      'execution-submit',
      'execution.input_submitted',
      { stepId: 'step-1' }
    );
    expect(callbacks.startExecution).toHaveBeenCalledWith('execution-submit');
    expect(callbacks.advanceExecutionFlow).toHaveBeenCalledWith(
      'execution-submit',
      'runtime-1'
    );
  });

  it('builds start hooks that preserve runtime start callbacks', async () => {
    const service = new ExecutionApplicationHooksService();
    const callbacks = {
      updateStatus: jest.fn().mockResolvedValue(undefined),
      emitEvent: jest.fn().mockResolvedValue(undefined),
      advanceExecutionFlow: jest.fn().mockResolvedValue(undefined),
      bootstrapBrowserExecution: jest.fn().mockResolvedValue(undefined),
    };

    const hooks = service.createStartHooks(callbacks);

    await hooks.updateStatus('execution-start', 'running');
    await hooks.emitEvent('execution-start', 'runtime.allocated', { runtimeSessionId: 'runtime-1' });
    await hooks.advanceExecutionFlow('execution-start', 'runtime-1');
    await hooks.bootstrapBrowserExecution({ id: 'execution-start' }, 'runtime-1');

    expect(callbacks.updateStatus).toHaveBeenCalledWith('execution-start', 'running');
    expect(callbacks.emitEvent).toHaveBeenCalledWith(
      'execution-start',
      'runtime.allocated',
      { runtimeSessionId: 'runtime-1' }
    );
    expect(callbacks.advanceExecutionFlow).toHaveBeenCalledWith('execution-start', 'runtime-1');
    expect(callbacks.bootstrapBrowserExecution).toHaveBeenCalledWith(
      { id: 'execution-start' },
      'runtime-1'
    );
  });
});
