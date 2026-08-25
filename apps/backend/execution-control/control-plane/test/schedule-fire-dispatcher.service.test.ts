import { ScheduleFireDispatcherService } from '../src/modules/scheduler/schedule-fire-dispatcher.service';

describe('ScheduleFireDispatcherService', () => {
  const prisma = { $queryRawUnsafe: jest.fn() };
  const outbox = {
    claimBatch: jest.fn(),
    markPublished: jest.fn(),
    releaseForRetry: jest.fn(),
  };
  const executions = { create: jest.fn() };
  const service = new ScheduleFireDispatcherService(
    prisma as any,
    outbox as any,
    executions as any
  );

  beforeEach(() => jest.clearAllMocks());

  it('creates one idempotent execution and acknowledges the fire', async () => {
    outbox.claimBatch.mockResolvedValue([
      {
        id: 'outbox-1',
        aggregateId: '11111111-1111-4111-8111-111111111111',
        payload: {
          fireId: '11111111-1111-4111-8111-111111111111',
          scheduleId: '22222222-2222-4222-8222-222222222222',
          createdBy: '33333333-3333-4333-8333-333333333333',
          skillId: '44444444-4444-4444-8444-444444444444',
          input: { region: 'cn' },
        },
        attempts: 1,
      },
    ]);
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ executionId: null }]).mockResolvedValueOnce([]);
    executions.create.mockResolvedValue({ id: '55555555-5555-4555-8555-555555555555' });
    outbox.markPublished.mockResolvedValue(true);
    await expect(service.dispatchOnce()).resolves.toBe(1);
    expect(executions.create).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      expect.objectContaining({
        idempotencyKey: 'schedule-fire:11111111-1111-4111-8111-111111111111',
        triggerType: 'schedule',
      })
    );
    expect(outbox.markPublished).toHaveBeenCalled();
  });

  it('does not create a duplicate when the fire already links an execution', async () => {
    outbox.claimBatch.mockResolvedValue([
      {
        id: 'outbox-2',
        aggregateId: '11111111-1111-4111-8111-111111111111',
        payload: {},
        attempts: 2,
      },
    ]);
    prisma.$queryRawUnsafe.mockResolvedValue([
      { executionId: '55555555-5555-4555-8555-555555555555' },
    ]);
    outbox.markPublished.mockResolvedValue(true);
    await expect(service.dispatchOnce()).resolves.toBe(1);
    expect(executions.create).not.toHaveBeenCalled();
  });
});
