import dayjs, { type Dayjs } from 'dayjs';
import type { ReminderRule } from '@/api';

export type Pattern = 'once' | 'daily' | 'dailyMultiple' | 'workdays' | 'weekly' | 'monthly';
export interface ReminderFormValues {
  title?: string;
  message: string;
  pattern: Pattern;
  time: Dayjs;
  times: Dayjs[];
  onceDate?: Dayjs;
  onceTime?: Dayjs;
  onceAt?: Dayjs;
  weekday: number;
  monthDay: number;
  sendWechat: boolean;
}

export function resolveOnceDateTime(values: ReminderFormValues): Dayjs {
  if (values.onceAt && !values.onceDate && !values.onceTime) {
    return values.onceAt;
  }
  const date = values.onceDate || dayjs();
  const time = values.onceTime || dayjs();
  return date
    .hour(time.hour())
    .minute(time.minute())
    .second(0)
    .millisecond(0);
}

export function scheduleInput(values: ReminderFormValues): { cronExpression: string; runAt: string | null } {
  if (values.pattern === 'once') {
    const onceAt = resolveOnceDateTime(values);
    return { cronExpression: '', runAt: onceAt.toISOString() };
  }
  const cron = (time: Dayjs, suffix: string) => `${time.minute()} ${time.hour()} ${suffix}`;
  if (values.pattern === 'dailyMultiple') {
    const times = [...new Set((values.times || []).map((time) => time.format('HH:mm')))].sort();
    return { cronExpression: times.map((time) => {
      const [hour, minute] = time.split(':');
      return `${Number(minute)} ${Number(hour)} * * *`;
    }).join(';'), runAt: null };
  }
  const suffix = values.pattern === 'workdays' ? '* * 1-5' : values.pattern === 'weekly'
    ? `* * ${values.weekday ?? 1}` : values.pattern === 'monthly' ? `${values.monthDay ?? 1} * *` : '* * *';
  return { cronExpression: cron(values.time, suffix), runAt: null };
}

export function formFromRule(rule: ReminderRule): Partial<ReminderFormValues> {
  if (rule.runAt) {
    const runAt = dayjs(rule.runAt);
    return { pattern: 'once', onceDate: runAt, onceTime: runAt, onceAt: runAt };
  }
  const expressions = rule.cronExpression.split(';');
  const parsed = expressions.map((expression) => {
    const [minute, hour] = expression.trim().split(' ');
    return dayjs().hour(Number(hour)).minute(Number(minute)).second(0);
  });
  const [, , day, , weekday] = expressions[0].trim().split(' ');
  const pattern: Pattern = expressions.length > 1 ? 'dailyMultiple' : day !== '*' ? 'monthly'
    : weekday === '1-5' ? 'workdays' : weekday !== '*' ? 'weekly' : 'daily';
  return { pattern, time: parsed[0], times: parsed, weekday: Number(weekday) || 1,
    monthDay: Number(day) || 1 };
}

export function scheduleLabel(rule: ReminderRule): string {
  if (rule.runAt) return `仅一次 · ${dayjs(rule.runAt).format('M月D日 HH:mm')}`;
  const expressions = rule.cronExpression.split(';');
  const times = expressions.map((expression) => {
    const [minute, hour] = expression.trim().split(' ');
    return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  });
  if (expressions.length > 1) return `每天 ${times.length} 次 · ${times.join('、')}`;
  const [, , day, , weekday] = expressions[0].trim().split(' ');
  if (day !== '*') return `每月 ${day} 日 · ${times[0]}`;
  if (weekday === '1-5') return `工作日 · ${times[0]}`;
  if (weekday !== '*') return `每周${['日', '一', '二', '三', '四', '五', '六'][Number(weekday)]} · ${times[0]}`;
  return `每天 · ${times[0]}`;
}
