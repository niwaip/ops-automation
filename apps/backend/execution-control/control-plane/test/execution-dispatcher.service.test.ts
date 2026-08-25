import { ExecutionDispatcherService } from '../src/modules/execution/dispatcher/execution-dispatcher.service';

describe('ExecutionDispatcherService', () => {
  const outbox = {
    claimBatch: jest.fn(),
    markPublished: jest.fn(),
    releaseForRetry: jest.fn(),
  };
  const scheduler = { advanceExecution: jest.fn() };
  const recovery = { recoverPendingPlans: jest.fn() };
  const service = new ExecutionDispatcherService(outbox as any, scheduler as any, recovery as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('advances and acknowledges a claimed durable execution event', async () => {
    outbox.claimBatch.mockResolvedValue([
      {
        id: 'outbox-1',
        aggregateId: 'execution-1',
        eventType: 'execution.ready',
        payload: { executionId: 'execution-1' },
        attempts: 1,
      },
    ]);
    scheduler.advanceExecution.mockResolvedValue(undefined);
    outbox.markPublished.mockResolvedValue(true);
    await expect(service.dispatchOnce()).resolves.toBe(1);
    expect(scheduler.advanceExecution).toHaveBeenCalledWith('execution-1');
    expect(outbox.markPublished).toHaveBeenCalledWith('outbox-1', expect.any(String));
    expect(outbox.releaseForRetry).not.toHaveBeenCalled();
  });

  it('releases a failed event with bounded exponential backoff', async () => {
    outbox.claimBatch.mockResolvedValue([
      {
        id: 'outbox-2',
        aggregateId: 'execution-2',
        eventType: 'execution.ready',
        payload: {},
        attempts: 2,
      },
    ]);
    scheduler.advanceExecution.mockRejectedValue(new Error('runtime unavailable'));
    outbox.releaseForRetry.mockResolvedValue(true);
    await expect(service.dispatchOnce()).resolves.toBe(0);
    expect(outbox.releaseForRetry).toHaveBeenCalledWith('outbox-2', expect.any(String), 4_000);
  });
});
