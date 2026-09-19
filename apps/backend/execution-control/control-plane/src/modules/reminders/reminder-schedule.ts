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

export function parseZonedDateTime(runAt: string, timezone: string): Date {
  if (/Z$|[+-]\d{2}(?::?\d{2})?$/.test(runAt.trim())) {
    const d = new Date(runAt);
    if (!Number.isFinite(d.getTime())) throw new BadRequestException('无效的提醒时间');
    return d;
  }

  const match = runAt.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    const d = new Date(runAt);
    if (!Number.isFinite(d.getTime())) throw new BadRequestException('无效的提醒时间');
    return d;
  }

  const [, yStr, mStr, dStr, hStr, minStr, sStr = '0'] = match;
  let dtf: Intl.DateTimeFormat;
  try {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
  } catch {
    throw new BadRequestException('无效的执行周期或时区');
  }

  const utcGuess = new Date(Date.UTC(+yStr, +mStr - 1, +dStr, +hStr, +minStr, +sStr));
  const parts = dtf.formatToParts(utcGuess);
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }

  const tzYear = parseInt(map.year, 10);
  const tzMonth = parseInt(map.month, 10);
  const tzDay = parseInt(map.day, 10);
  const tzHour = map.hour === '24' ? 0 : parseInt(map.hour, 10);
  const tzMinute = parseInt(map.minute, 10);
  const tzSecond = parseInt(map.second, 10);

  const asUtcInTz = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, tzSecond);
  const offsetMs = asUtcInTz - utcGuess.getTime();

  return new Date(utcGuess.getTime() - offsetMs);
}

export function resolveReminderSchedule(cronExpression: string | undefined, runAt: string | null | undefined,
  timezone: string, from = new Date()): { cronExpression: string; runAt: Date | null; nextRunAt: Date } {
  if (runAt) {
    if (cronExpression?.trim()) throw new BadRequestException('一次性提醒不能同时设置重复周期');
    if (!/\d{4}-\d\d-\d\dT\d\d:\d\d/.test(runAt)) {
      throw new BadRequestException('请选择未来的一次性提醒时间');
    }
    const date = parseZonedDateTime(runAt, timezone);
    if (!Number.isFinite(date.getTime()) || date <= from) {
      throw new BadRequestException('请选择未来的一次性提醒时间');
    }
    return { cronExpression: '', runAt: date, nextRunAt: date };
  }
  if (!cronExpression?.trim()) throw new BadRequestException('请选择提醒周期');
  return { cronExpression, runAt: null, nextRunAt: nextReminderRun(cronExpression, timezone, from) };
}
