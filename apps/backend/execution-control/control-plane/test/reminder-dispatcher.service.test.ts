import { ReminderDispatcherService } from '../src/modules/reminders/reminder-dispatcher.service';

describe('ReminderDispatcherService', () => {
  it('atomically claims a due rule and creates one delivery with the scheduled slot', async () => {
    const scheduledAt = new Date('2026-09-18T01:00:00Z');
    const rule = {
      id: 'rule', userId: 'owner', title: '巡检', message: '检查服务',
      cronExpression: '0 9 * * 1-5', timezone: 'Asia/Shanghai',
      nextRunAt: scheduledAt, sendWechat: false,
    };
    const tx = {
      reminderRule: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      reminderDelivery: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      builtinSkill: { findUnique: jest.fn().mockResolvedValue({ isEnabled: true, activeVersionId: 'version' }) },
      reminderRule: { findMany: jest.fn().mockResolvedValue([rule]) },
      reminderDelivery: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const dispatcher = new ReminderDispatcherService(prisma as any);
    await dispatcher.tick();
    expect(tx.reminderRule.updateMany).toHaveBeenCalledWith({
      where: { id: 'rule', isActive: true, deletedAt: null, nextRunAt: scheduledAt },
      data: { nextRunAt: expect.any(Date) },
    });
    expect(tx.reminderDelivery.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      ruleId: 'rule', userId: 'owner', scheduledAt, wechatStatus: 'skipped',
    }) });

    tx.reminderRule.updateMany.mockResolvedValue({ count: 0 });
    tx.reminderDelivery.create.mockClear();
    await dispatcher.tick();
    expect(tx.reminderDelivery.create).not.toHaveBeenCalled();
  });

  it('deactivates a one-time reminder after claiming its only delivery', async () => {
    const runAt = new Date('2026-01-01T01:00:00Z');
    const tx = { reminderRule: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      reminderDelivery: { create: jest.fn().mockResolvedValue({}) } };
    const prisma = {
      builtinSkill: { findUnique: jest.fn().mockResolvedValue({ isEnabled: true, activeVersionId: 'version' }) },
      reminderRule: { findMany: jest.fn().mockResolvedValue([{ id: 'once', userId: 'owner',
        title: '一次', message: '内容', runAt, nextRunAt: runAt, sendWechat: false }]) },
      reminderDelivery: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    await new ReminderDispatcherService(prisma as any).tick();
    expect(tx.reminderRule.updateMany).toHaveBeenCalledWith({
      where: { id: 'once', isActive: true, deletedAt: null, nextRunAt: runAt },
      data: { nextRunAt: runAt, isActive: false },
    });
    expect(tx.reminderDelivery.create).toHaveBeenCalledTimes(1);
  });
});
