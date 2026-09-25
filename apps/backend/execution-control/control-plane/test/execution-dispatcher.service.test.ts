import { ExecutionDispatcherService } from '../src/modules/execution/dispatcher/execution-dispatcher.service';

describe('ExecutionDispatcherService', () => {
  const outbox = {
    claimBatch: jest.fn(),
    markPublished: jest.fn(),
    releaseForRetry: jest.fn(),
    markDeadLetter: jest.fn(),
    quarantinePoisonMessages: jest.fn(),
  };
  const scheduler = { advanceExecution: jest.fn() };
  const recovery = { recoverPendingPlans: jest.fn() };
  const service = new ExecutionDispatcherService(outbox as any, scheduler as any, recovery as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('advances and acknowledges a claimed durable execution event with ConsumerSpan', async () => {
    outbox.claimBatch.mockResolvedValue([
      {
        id: 'outbox-1',
        aggregateId: 'execution-1',
        eventType: 'execution.ready',
        payload: {
          executionId: 'execution-1',
          traceContext: {
            traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
            tracestate: 'rojo=1',
          },
        },
        attempts: 1,
      },
    ]);
    scheduler.advanceExecution.mockResolvedValue(undefined);
    outbox.markPublished.mockResolvedValue(true);
    await expect(service.dispatchOnce()).resolves.toBe(1);
    expect(scheduler.advanceExecution).toHaveBeenCalledWith(
      'execution-1',
      expect.objectContaining({
        traceContext: expect.objectContaining({
          traceparent: expect.stringMatching(/^00-4bf92f3577b34da6a3ce929d0e0e4736-[0-9a-f]{16}-01$/),
          traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
          tracestate: 'rojo=1',
        }),
      })
    );
    expect(outbox.markPublished).toHaveBeenCalledWith('outbox-1', expect.any(String));
    expect(outbox.releaseForRetry).not.toHaveBeenCalled();
    expect(outbox.markDeadLetter).not.toHaveBeenCalled();
  });

  it('releases a failed event with bounded exponential backoff when attempts < maxAttempts', async () => {
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
    expect(outbox.markDeadLetter).not.toHaveBeenCalled();
  });

  it('quarantines poison messages to dead letter when attempts reach maxAttempts', async () => {
    outbox.claimBatch.mockResolvedValue([
      {
        id: 'outbox-poison-1',
        aggregateId: 'execution-poison',
        eventType: 'execution.ready',
        payload: { executionId: 'execution-poison' },
        attempts: 10,
      },
    ]);
    scheduler.advanceExecution.mockRejectedValue(new Error('Permanent unhandled schema violation'));
    outbox.markDeadLetter.mockResolvedValue(true);
    await expect(service.dispatchOnce()).resolves.toBe(0);
    expect(outbox.markDeadLetter).toHaveBeenCalledWith(
      'outbox-poison-1',
      expect.any(String),
      'Permanent unhandled schema violation'
    );
    expect(outbox.releaseForRetry).not.toHaveBeenCalled();
  });
});
