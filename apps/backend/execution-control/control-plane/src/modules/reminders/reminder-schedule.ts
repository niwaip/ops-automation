import { BadRequestException } from '@nestjs/common';
import * as parser from 'cron-parser';
import { MAX_DAILY_SCHEDULE_TIMES } from './reminder.constants';

export function nextReminderRun(expression: string, timezone: string, from = new Date()): Date {
  try {
    const expressions = expression.split(';').map((part) => part.trim());
    if (!expressions.length || expressions.length > MAX_DAILY_SCHEDULE_TIMES ||
        expressions.some((part) => part.split(/\s+/).length !== 5)) throw new Error('Invalid schedule');
    const runs = expressions.map((part) => parser.parseExpression(part, { currentDate: from, tz: timezone }).next().toDate());
    return new Date(Math.min(...runs.map((run) => run.getTime())));
  } catch {
    throw new BadRequestException('无效的执行周期或时区');
  }
}

export function resolveReminderSchedule(cronExpression: string | undefined, runAt: string | null | undefined,
  timezone: string, from = new Date()): { cronExpression: string; runAt: Date | null; nextRunAt: Date } {
  if (runAt) {
    if (cronExpression?.trim()) throw new BadRequestException('一次性提醒不能同时设置重复周期');
    const date = new Date(runAt);
    if (!/\d{4}-\d\d-\d\dT\d\d:\d\d/.test(runAt) || !Number.isFinite(date.getTime()) || date <= from) {
      throw new BadRequestException('请选择未来的一次性提醒时间');
    }
    return { cronExpression: '', runAt: date, nextRunAt: date };
  }
  if (!cronExpression?.trim()) throw new BadRequestException('请选择提醒周期');
  return { cronExpression, runAt: null, nextRunAt: nextReminderRun(cronExpression, timezone, from) };
}
