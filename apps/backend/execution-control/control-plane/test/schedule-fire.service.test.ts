import { ScheduleFireService } from '../src/modules/scheduler/schedule-fire.service';

describe('ScheduleFireService', () => {
  const transactionQuery = jest.fn();
  const skillScheduleUpdate = jest.fn();
  const prisma = {
    $transaction: jest.fn((callback: (tx: any) => unknown) =>
      callback({
        $queryRawUnsafe: transactionQuery,
        skillSchedule: { update: skillScheduleUpdate },
      })
    ),
  };
  const outbox = { enqueue: jest.fn() };
  const service = new ScheduleFireService(prisma as any, outbox as any);
  const input = {
    scheduleId: '11111111-1111-4111-8111-111111111111',
    scheduledAt: new Date('2026-08-24T01:00:00Z'),
    nextRunAt: new Date('2026-08-25T01:00:00Z'),
    createdBy: '22222222-2222-4222-8222-222222222222',
    skillId: '33333333-3333-4333-8333-333333333333',
    skillVersion: '3',
    input: { region: 'cn' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('atomically advances the schedule and writes an outbox event', async () => {
    transactionQuery.mockResolvedValue([{ id: 'fire-1' }]);
    outbox.enqueue.mockResolvedValue('outbox-1');
    const result = await service.create(input);
    expect(result.created).toBe(true);
    expect(skillScheduleUpdate).toHaveBeenCalledWith({
      where: { id: input.scheduleId },
      data: { lastRunAt: input.scheduledAt, nextRunAt: input.nextRunAt },
    });
    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'schedule.fire.created',
        payload: expect.objectContaining({ scheduleId: input.scheduleId }),
      }),
      expect.objectContaining({ $queryRawUnsafe: transactionQuery })
    );
  });

  it('does not advance or enqueue when the unique fire already exists', async () => {
    transactionQuery.mockResolvedValue([]);
    await expect(service.create(input)).resolves.toEqual({ created: false });
    expect(skillScheduleUpdate).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });
});
