import { ExecutionOutboxService } from '../src/modules/execution/outbox/execution-outbox.service';

describe('ExecutionOutboxService', () => {
  const queryRaw = jest.fn();
  const service = new ExecutionOutboxService({ $queryRawUnsafe: queryRaw } as any);

  beforeEach(() => {
    queryRaw.mockReset();
  });

  it('writes an event through the provided transaction client', async () => {
    const transactionQuery = jest.fn().mockResolvedValue([]);
    const id = await service.enqueue(
      {
        aggregateType: 'execution',
        aggregateId: '11111111-1111-4111-8111-111111111111',
        eventType: 'execution.ready',
        payload: { executionId: '11111111-1111-4111-8111-111111111111' },
      },
      { $queryRawUnsafe: transactionQuery }
    );
    expect(id).toMatch(/^[0-9a-f-]{36}$/u);
    expect(transactionQuery).toHaveBeenCalledTimes(1);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('claims only available unleased events with skip locked', async () => {
    queryRaw.mockResolvedValue([
      {
        id: 'outbox-1',
        aggregateType: 'execution',
        aggregateId: 'execution-1',
        eventType: 'execution.ready',
        payload: { executionId: 'execution-1' },
        attempts: 1,
        leaseExpiresAt: new Date(),
      },
    ]);
    const rows = await service.claimBatch('dispatcher-1', {
      limit: 10,
      leaseMs: 20_000,
      eventTypes: ['execution.ready'],
    });
    expect(rows).toHaveLength(1);
    expect(queryRaw.mock.calls[0][0]).toContain('FOR UPDATE SKIP LOCKED');
    expect(queryRaw.mock.calls[0][0]).toContain('published_at IS NULL');
    expect(queryRaw.mock.calls[0][1]).toBe('dispatcher-1');
    expect(queryRaw.mock.calls[0][3]).toBe(10);
    expect(queryRaw.mock.calls[0][4]).toEqual(['execution.ready']);
  });

  it('requires the current lease owner to publish or release an event', async () => {
    queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'outbox-1' }]);
    await expect(
      service.markPublished('11111111-1111-4111-8111-111111111111', 'wrong')
    ).resolves.toBe(false);
    await expect(
      service.releaseForRetry('11111111-1111-4111-8111-111111111111', 'dispatcher-1', 1_000)
    ).resolves.toBe(true);
  });
});
