import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReminderDto, UpdateReminderDto } from './reminder.dto';
import { resolveReminderSchedule } from './reminder-schedule';
import {
  DEFAULT_REMINDER_TIMEZONE,
  DEFAULT_REMINDER_TITLE,
  FALLBACK_REMINDER_TITLE_LENGTH,
  MAX_REMINDER_MESSAGE_LENGTH,
  MAX_REMINDER_TITLE_LENGTH,
  MS_PER_MINUTE,
  REMINDER_CAPABILITY_KEY,
  WECHAT_CHANNEL,
} from './reminder.constants';
export { nextReminderRun } from './reminder-schedule';


@Injectable()
export class ReminderService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.reminderRule.findMany({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { runAt: null },
          { runAt: { gt: new Date() }, isActive: true },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreateReminderDto) {
    await this.assertSkillEnabled();
    const title = this.resolveTitle(dto.title, dto.message);
    this.assertContent(title, dto.message);
    const timezone = dto.timezone || DEFAULT_REMINDER_TIMEZONE;
    const schedule = resolveReminderSchedule(dto.cronExpression, dto.runAt, timezone);
    await this.assertWechatAvailable(userId, dto.sendWechat);
    return this.prisma.reminderRule.create({
      data: {
        userId,
        title,
        message: dto.message.trim(),
        ...schedule,
        timezone,
        sendWechat: dto.sendWechat || false,
      },
    });
  }

  async createFromSkill(userId: string, executionId: string, dto: CreateReminderDto) {
    await this.assertSkillEnabled();
    const title = this.resolveTitle(dto.title, dto.message);
    this.assertContent(title, dto.message);
    const timezone = dto.timezone || DEFAULT_REMINDER_TIMEZONE;
    const schedule = resolveReminderSchedule(dto.cronExpression, dto.runAt, timezone);
    await this.assertWechatAvailable(userId, dto.sendWechat);
    return this.prisma.reminderRule.upsert({
      where: { sourceExecutionId: executionId },
      update: {},
      create: {
        sourceExecutionId: executionId, userId, title, message: dto.message.trim(),
        ...schedule, timezone, sendWechat: dto.sendWechat || false,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateReminderDto) {
    const rule = await this.requireRule(userId, id);
    if (dto.isActive === true) await this.assertSkillEnabled();
    const title = dto.title !== undefined ? this.resolveTitle(dto.title, dto.message ?? rule.message) : rule.title;
    this.assertContent(title, dto.message ?? rule.message);
    await this.assertWechatAvailable(userId, dto.sendWechat);
    const cronExpression = dto.cronExpression ?? rule.cronExpression;
    const timezone = dto.timezone ?? rule.timezone;
    const runAt = dto.runAt === undefined ? rule.runAt?.toISOString() : dto.runAt;
    const shouldRecalculate = dto.cronExpression !== undefined || dto.runAt !== undefined || dto.timezone !== undefined ||
      (dto.isActive === true && !rule.isActive);
    const schedule = shouldRecalculate ? resolveReminderSchedule(cronExpression, runAt, timezone) : null;
    return this.prisma.reminderRule.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title } : {}),
        ...(dto.message !== undefined ? { message: dto.message.trim() } : {}),
        ...(schedule || {}),
        ...(dto.timezone !== undefined ? { timezone } : {}),
        ...(dto.sendWechat !== undefined ? { sendWechat: dto.sendWechat } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  private resolveTitle(title?: string, message?: string): string {
    const trimmed = title?.trim();
    if (trimmed) return trimmed.slice(0, MAX_REMINDER_TITLE_LENGTH);
    const fallback = (message || '').trim().slice(0, FALLBACK_REMINDER_TITLE_LENGTH) || DEFAULT_REMINDER_TITLE;
    return fallback.slice(0, MAX_REMINDER_TITLE_LENGTH);
  }

  async remove(userId: string, id: string) {
    await this.requireRule(userId, id);
    await this.prisma.reminderRule.update({
      where: { id }, data: { isActive: false, deletedAt: new Date() },
    });
    return { success: true };
  }

  async markRead(userId: string, id: string) {
    const result = await this.prisma.reminderDelivery.updateMany({
      where: { id, userId, remindAt: { lte: new Date() } },
      data: { readAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('提醒不存在');
    return { success: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.reminderDelivery.updateMany({
      where: { userId, readAt: null, remindAt: { lte: new Date() } },
      data: { readAt: new Date() },
    });
    return { success: true };
  }

  async snooze(userId: string, id: string, minutes: number) {
    const delivery = await this.prisma.reminderDelivery.findFirst({ where: { id, userId } });
    if (!delivery || delivery.remindAt > new Date()) throw new NotFoundException('提醒不存在');
    await this.prisma.reminderDelivery.update({
      where: { id },
      data: { remindAt: new Date(Date.now() + minutes * MS_PER_MINUTE), readAt: null },
    });
    return { success: true };
  }

  private async requireRule(userId: string, id: string) {
    const rule = await this.prisma.reminderRule.findFirst({ where: { id, userId, deletedAt: null } });
    if (!rule) throw new NotFoundException('提醒规则不存在');
    return rule;
  }

  private assertContent(title: string, message: string) {
    if (!title.trim() || title.length > MAX_REMINDER_TITLE_LENGTH || !message.trim() || message.length > MAX_REMINDER_MESSAGE_LENGTH) {
      throw new BadRequestException('提醒标题或内容无效');
    }
  }

  async isWechatAvailable(userId: string): Promise<boolean> {
    const channel = await this.prisma.imChannelConnection.findUnique({
      where: { userId_channel: { userId, channel: WECHAT_CHANNEL } },
    });
    return Boolean(channel?.enabled && channel?.encryptedCredential);
  }

  async createBatch(userId: string, dtos: CreateReminderDto[]) {
    await this.assertSkillEnabled();
    const wechatAvailable = await this.isWechatAvailable(userId);
    const results = [];
    for (const dto of dtos) {
      const effectiveSendWechat =
        dto.sendWechat === undefined ? wechatAvailable : Boolean(dto.sendWechat && wechatAvailable);
      const title = this.resolveTitle(dto.title, dto.message);
      this.assertContent(title, dto.message);
      const timezone = dto.timezone || DEFAULT_REMINDER_TIMEZONE;
      const schedule = resolveReminderSchedule(dto.cronExpression, dto.runAt, timezone);
      const created = await this.prisma.reminderRule.create({
        data: {
          userId,
          title,
          message: dto.message.trim(),
          ...schedule,
          timezone,
          sendWechat: effectiveSendWechat,
        },
      });
      results.push(created);
    }
    return results;
  }

  private async assertSkillEnabled() {
    const skill = await this.prisma.builtinSkill.findUnique({
      where: { capabilityKey: REMINDER_CAPABILITY_KEY },
    });
    if (!skill?.isEnabled || !skill.activeVersionId) {
      throw new BadRequestException('消息提醒内置 Skill 尚未启用');
    }
  }

  private async assertWechatAvailable(userId: string, sendWechat?: boolean) {
    if (!sendWechat) return;
    const channel = await this.prisma.imChannelConnection.findUnique({
      where: { userId_channel: { userId, channel: WECHAT_CHANNEL } },
    });
    if (!channel?.enabled || !channel.encryptedCredential) {
      throw new BadRequestException('请先绑定并启用微信渠道');
    }
  }
}

