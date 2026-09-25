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

  it('correctly resolves naive datetime in the specified timezone', () => {
    const from = new Date('2026-09-18T00:00:00Z');
    // 2026-09-19 10:00 in Asia/Shanghai (UTC+8) is 2026-09-19 02:00:00 UTC
    const shanghaiResult = resolveReminderSchedule('', '2026-09-19T10:00', 'Asia/Shanghai', from);
    expect(shanghaiResult.runAt?.toISOString()).toBe('2026-09-19T02:00:00.000Z');
    expect(shanghaiResult.nextRunAt.toISOString()).toBe('2026-09-19T02:00:00.000Z');

    // 2026-09-19 10:00 in UTC is 2026-09-19 10:00:00 UTC
    const utcResult = resolveReminderSchedule('', '2026-09-19T10:00', 'UTC', from);
    expect(utcResult.runAt?.toISOString()).toBe('2026-09-19T10:00:00.000Z');

    // Invalid timezone throws BadRequestException
    expect(() => resolveReminderSchedule('', '2026-09-19T10:00', 'Invalid/Timezone', from))
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

  it('checks wechat availability correctly', async () => {
    prisma.imChannelConnection.findUnique.mockResolvedValueOnce(null);
    expect(await service.isWechatAvailable('user-1')).toBe(false);

    prisma.imChannelConnection.findUnique.mockResolvedValueOnce({
      enabled: true,
      encryptedCredential: 'encrypted-token',
    });
    expect(await service.isWechatAvailable('user-1')).toBe(true);
  });

  it('creates batch reminders defaulting sendWechat to wechat availability', async () => {
    prisma.imChannelConnection.findUnique.mockResolvedValue({
      enabled: true,
      encryptedCredential: 'encrypted-token',
    });
    prisma.reminderRule.create.mockImplementation(({ data }) => Promise.resolve({ id: 'rule-batch', ...data }));

    const results = await service.createBatch('owner', [
      {
        title: 'WSBK 排位赛',
        message: 'WorldSSP300 排位赛',
        cronExpression: '0 19 * * *',
      },
      {
        title: 'WSBK 正赛',
        message: 'WorldSSP300 第一场正赛',
        cronExpression: '30 17 * * *',
        sendWechat: false, // explicitly false
      },
    ]);

    expect(results).toHaveLength(2);
    expect(prisma.reminderRule.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({
        title: 'WSBK 排位赛',
        sendWechat: true, // defaulted to available
      }),
    }));
    expect(prisma.reminderRule.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({
        title: 'WSBK 正赛',
        sendWechat: false, // respected explicit false
      }),
    }));
  });
});

