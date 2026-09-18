import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { getAuthServiceUrl } from '../../config/service-endpoints';
import { roleEnabled } from '../../config/control-plane-role';
import { nextReminderRun } from './reminder-schedule';
import {
  MAX_WECHAT_ERROR_LENGTH,
  REMINDER_CAPABILITY_KEY,
  REMINDER_DISPATCHER_TICK_INTERVAL_MS,
  REMINDER_RULE_BATCH_SIZE,
  WECHAT_BASE_BACKOFF_MS,
  WECHAT_DELIVERY_BATCH_SIZE,
  WECHAT_DELIVERY_LEASE_MS,
  WECHAT_MAX_BACKOFF_MS,
  WECHAT_MAX_BACKOFF_POWER,
  WECHAT_REQUEST_TIMEOUT_MS,
} from './reminder.constants';

@Injectable()
export class ReminderDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderDispatcherService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (!roleEnabled('schedule')) return;
    this.timer = setInterval(() => void this.tick(), REMINDER_DISPATCHER_TICK_INTERVAL_MS);
    void this.tick();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const skill = await this.prisma.builtinSkill.findUnique({
        where: { capabilityKey: REMINDER_CAPABILITY_KEY },
      });
      if (!skill?.isEnabled || !skill.activeVersionId) return;
      await this.createDueDeliveries();
      await this.deliverWechat();
    } catch (error) {
      this.logger.error(`Reminder tick failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async createDueDeliveries() {
    const now = new Date();
    const rules = await this.prisma.reminderRule.findMany({
      where: { isActive: true, deletedAt: null, nextRunAt: { lte: now } },
      orderBy: { nextRunAt: 'asc' }, take: REMINDER_RULE_BATCH_SIZE,
    });
    for (const rule of rules) {
      try {
        const scheduledAt = rule.nextRunAt;
        // After downtime, send one catch-up reminder and move directly to the next future slot.
        const nextRunAt = rule.runAt ? scheduledAt : nextReminderRun(rule.cronExpression, rule.timezone, now);
        await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.reminderRule.updateMany({
            where: { id: rule.id, isActive: true, deletedAt: null, nextRunAt: scheduledAt },
            data: { nextRunAt, ...(rule.runAt ? { isActive: false } : {}) },
          });
          if (!claimed.count) return;
          await tx.reminderDelivery.create({
            data: {
              ruleId: rule.id, userId: rule.userId, scheduledAt,
              title: rule.title, message: rule.message, remindAt: now,
              sendWechat: rule.sendWechat,
              wechatStatus: rule.sendWechat ? 'pending' : 'skipped',
              wechatNextAttemptAt: rule.sendWechat ? now : null,
            },
          });
        });
      } catch (error) {
        this.logger.error(`Reminder rule ${rule.id} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async deliverWechat() {
    const now = new Date();
    const deliveries = await this.prisma.reminderDelivery.findMany({
      where: {
        sendWechat: true, wechatStatus: { in: ['pending', 'retrying'] },
        wechatNextAttemptAt: { lte: now },
        OR: [{ wechatLeaseUntil: null }, { wechatLeaseUntil: { lt: now } }],
      },
      orderBy: { wechatNextAttemptAt: 'asc' }, take: WECHAT_DELIVERY_BATCH_SIZE,
    });
    for (const delivery of deliveries) {
      const claimed = await this.prisma.reminderDelivery.updateMany({
        where: {
          id: delivery.id, wechatStatus: { in: ['pending', 'retrying'] },
          wechatNextAttemptAt: { lte: now },
          OR: [{ wechatLeaseUntil: null }, { wechatLeaseUntil: { lt: now } }],
        },
        data: { wechatLeaseUntil: new Date(Date.now() + WECHAT_DELIVERY_LEASE_MS) },
      });
      if (!claimed.count) continue;
      try {
        await axios.post(`${getAuthServiceUrl()}/im-channels/internal/reminder`, {
          userId: delivery.userId,
          text: `${delivery.title}\n${delivery.message}`,
          idempotencyKey: delivery.id,
        }, {
          timeout: WECHAT_REQUEST_TIMEOUT_MS,
          headers: { 'x-internal-auth': process.env.INTERNAL_API_SHARED_SECRET || process.env.INTERNAL_API_SECRET || '' },
        });
        await this.prisma.reminderDelivery.update({
          where: { id: delivery.id },
          data: { wechatStatus: 'sent', wechatLeaseUntil: null, wechatLastError: null },
        });
      } catch (error) {
        const attempts = delivery.wechatAttempts + 1;
        await this.prisma.reminderDelivery.update({
          where: { id: delivery.id },
          data: {
            wechatStatus: 'retrying', wechatAttempts: attempts, wechatLeaseUntil: null,
            wechatNextAttemptAt: new Date(Date.now() + Math.min(WECHAT_MAX_BACKOFF_MS, WECHAT_BASE_BACKOFF_MS * 2 ** Math.min(attempts, WECHAT_MAX_BACKOFF_POWER))),
            wechatLastError: (error instanceof Error ? error.message : String(error)).slice(0, MAX_WECHAT_ERROR_LENGTH),
          },
        });
      }
    }
  }
}
