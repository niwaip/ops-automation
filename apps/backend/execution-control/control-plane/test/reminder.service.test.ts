import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReminderService, nextReminderRun } from '../src/modules/reminders/reminder.service';
import { resolveReminderSchedule } from '../src/modules/reminders/reminder-schedule';

describe('ReminderService', () => {
  const prisma = {
    builtinSkill: { findUnique: jest.fn().mockResolvedValue({ isEnabled: true, activeVersionId: 'version' }) },
    imChannelConnection: { findUnique: jest.fn() },
    reminderRule: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), upsert: jest.fn() },
    reminderDelivery: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  };
  const service = new ReminderService(prisma as any);

  beforeEach(() => jest.clearAllMocks());

  it('calculates a future run in the requested timezone', () => {
    expect(nextReminderRun('0 9 * * 1-5', 'Asia/Shanghai', new Date('2026-09-18T02:00:00Z'))
      .toISOString()).toBe('2026-09-21T01:00:00.000Z');
    expect(() => nextReminderRun('0 9 * * * *', 'Asia/Shanghai')).toThrow(BadRequestException);
    expect(nextReminderRun('0 8 * * *;0 12 * * *;0 16 * * *;0 20 * * *', 'Asia/Shanghai',
      new Date('2026-09-18T03:00:00Z')).toISOString()).toBe('2026-09-18T04:00:00.000Z');
  });

  it('requires a future instant for a one-time reminder', () => {
    const from = new Date('2026-09-18T03:00:00Z');
    expect(resolveReminderSchedule('', '2026-09-18T04:00:00.000Z', 'Asia/Shanghai', from))
      .toEqual({ cronExpression: '', runAt: new Date('2026-09-18T04:00:00Z'),
        nextRunAt: new Date('2026-09-18T04:00:00Z') });
    expect(() => resolveReminderSchedule('', '2026-09-18T02:00:00Z', 'Asia/Shanghai', from))
      .toThrow(BadRequestException);
  });

  it('requires the owner to have enabled WeChat when selected', async () => {
    prisma.imChannelConnection.findUnique.mockResolvedValue(null);
    await expect(service.create('owner', {
      title: '巡检', message: '检查服务', cronExpression: '0 9 * * *', sendWechat: true,
    })).rejects.toThrow(BadRequestException);
    expect(prisma.reminderRule.create).not.toHaveBeenCalled();
  });

  it('snoozes only an existing owner-visible delivery without changing its recurrence', async () => {
    prisma.reminderDelivery.findFirst.mockResolvedValue({ id: 'delivery', remindAt: new Date(0) });
    prisma.reminderDelivery.update.mockResolvedValue({});
    await service.snooze('owner', 'delivery', 10);
    expect(prisma.reminderDelivery.findFirst).toHaveBeenCalledWith({ where: { id: 'delivery', userId: 'owner' } });
    expect(prisma.reminderDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery' },
      data: { remindAt: expect.any(Date), readAt: null },
    });
    expect(prisma.reminderRule.update).not.toHaveBeenCalled();
    prisma.reminderDelivery.findFirst.mockResolvedValue(null);
    await expect(service.snooze('other', 'delivery', 10)).rejects.toThrow(NotFoundException);
  });

  it('allows title to be omitted and falls back to message preview', async () => {
    prisma.reminderRule.create.mockImplementation(({ data }) => Promise.resolve({ id: 'rule-1', ...data }));
    const created = await service.create('owner', {
      message: '按时服用维生素C',
      cronExpression: '0 9 * * *',
    });
    expect(prisma.reminderRule.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        title: '按时服用维生素C',
        message: '按时服用维生素C',
      }),
    }));
    expect(created.title).toBe('按时服用维生素C');
  });
});
