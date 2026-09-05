export type ExecutionMode = 'immediate' | 'schedule';
export type SchedulePattern = 'minutely' | 'hourly' | 'workdays' | 'weekly' | 'monthly';

export type ExecutionCreateFormValues = {
  skillId: string;
  input?: Record<string, unknown>;
  executionMode: ExecutionMode;
  scheduleName?: string;
  scheduleDescription?: string;
  timezone?: string;
  schedulePattern?: SchedulePattern;
  scheduleHour?: string;
  scheduleMinute?: string;
  hourlyInterval?: number;
  minutelyInterval?: number;
  weeklyDays?: string[];
  monthlyDay?: number;
};

export const getDefaultScheduleName = (skillName?: string) => `${skillName || '技能'} 定时执行`;

export const MINUTELY_INTERVAL_OPTIONS = [
  { label: '每 5 分钟', value: 5 },
  { label: '每 10 分钟', value: 10 },
  { label: '每 15 分钟', value: 15 },
  { label: '每 20 分钟', value: 20 },
  { label: '每 30 分钟', value: 30 },
];

export const HOURLY_INTERVAL_OPTIONS = [
  { label: '每 1 小时 (每小时)', value: 1 },
  { label: '每 2 小时', value: 2 },
  { label: '每 3 小时', value: 3 },
  { label: '每 4 小时', value: 4 },
  { label: '每 6 小时', value: 6 },
  { label: '每 8 小时', value: 8 },
  { label: '每 12 小时', value: 12 },
];

export const WEEKDAY_OPTIONS = [
  { label: '周一', value: '1' },
  { label: '周二', value: '2' },
  { label: '周三', value: '3' },
  { label: '周四', value: '4' },
  { label: '周五', value: '5' },
  { label: '周六', value: '6' },
  { label: '周日', value: '0' },
];

export const WEEKDAY_LABEL_MAP = new Map(
  WEEKDAY_OPTIONS.map((option) => [option.value, option.label])
);

export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => ({
  label: String(index).padStart(2, '0'),
  value: String(index).padStart(2, '0'),
}));

export const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => {
  const minute = String(index * 5).padStart(2, '0');
  return { label: minute, value: minute };
});

export const MONTH_DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => ({
  label: `${index + 1} 日`,
  value: index + 1,
}));

export const TIMEZONE_OPTIONS = [
  { label: '中国标准时间 (Asia/Shanghai)', value: 'Asia/Shanghai' },
  { label: '协调世界时 (UTC)', value: 'UTC' },
  { label: '日本标准时间 (Asia/Tokyo)', value: 'Asia/Tokyo' },
  { label: '新加坡时间 (Asia/Singapore)', value: 'Asia/Singapore' },
  { label: '伦敦时间 (Europe/London)', value: 'Europe/London' },
  { label: '纽约时间 (America/New_York)', value: 'America/New_York' },
];

export const buildScheduleCronExpression = (values: ExecutionCreateFormValues) => {
  const pattern = values.schedulePattern || 'workdays';

  if (pattern === 'minutely') {
    const interval = values.minutelyInterval || 15;
    return `*/${interval} * * * *`;
  }

  if (pattern === 'hourly') {
    const minute = values.scheduleMinute || '00';
    const interval = values.hourlyInterval || 1;
    if (interval <= 1) {
      return `${minute} * * * *`;
    }
    return `${minute} */${interval} * * *`;
  }

  const hour = values.scheduleHour || '09';
  const minute = values.scheduleMinute || '00';

  if (pattern === 'weekly') {
    const selectedDays =
      (values.weeklyDays || []).filter((day) => WEEKDAY_LABEL_MAP.has(day)).sort() || [];
    if (selectedDays.length === 0) {
      throw new Error('请选择至少一个每周执行日');
    }
    return `${minute} ${hour} * * ${selectedDays.join(',')}`;
  }

  if (pattern === 'monthly') {
    const day = values.monthlyDay || 1;
    return `${minute} ${hour} ${day} * *`;
  }

  return `${minute} ${hour} * * 1-5`;
};

export const buildScheduleRuleText = (values: {
  schedulePattern?: SchedulePattern;
  scheduleHour?: string;
  scheduleMinute?: string;
  hourlyInterval?: number;
  minutelyInterval?: number;
  weeklyDays?: string[];
  monthlyDay?: number;
}) => {
  const pattern = values.schedulePattern || 'workdays';

  if (pattern === 'minutely') {
    const interval = values.minutelyInterval || 15;
    return `每 ${interval} 分钟执行一次`;
  }

  if (pattern === 'hourly') {
    const interval = values.hourlyInterval || 1;
    const minute = values.scheduleMinute || '00';
    if (interval <= 1) {
      return minute === '00' ? '每小时整点' : `每小时第 ${Number(minute)} 分`;
    }
    return minute === '00'
      ? `每 ${interval} 小时整点`
      : `每 ${interval} 小时第 ${Number(minute)} 分`;
  }

  const hour = values.scheduleHour || '09';
  const minute = values.scheduleMinute || '00';
  const timeText = `${hour}:${minute}`;

  if (pattern === 'weekly') {
    const dayText = (values.weeklyDays || [])
      .map((day) => WEEKDAY_LABEL_MAP.get(day))
      .filter(Boolean)
      .join('、');
    return dayText ? `每周 ${dayText} ${timeText}` : `每周 ${timeText}`;
  }

  if (pattern === 'monthly') {
    return `每月 ${values.monthlyDay || 1} 日 ${timeText}`;
  }

  return `每个工作日 ${timeText}`;
};

interface SummarizeCronExpressionOptions {
  workdaysLabel?: string;
  weekdayLabelMap?: ReadonlyMap<string, string>;
}

export const summarizeCronExpression = (
  cronExpression?: string,
  options: SummarizeCronExpressionOptions = {}
): string => {
  if (!cronExpression) {
    return '未设置';
  }

  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return cronExpression;
  }

  const [minute, hour, dayOfMonth, _month, dayOfWeek] = parts;

  // 1. Minutely patterns
  if (dayOfMonth === '*' && dayOfWeek === '*' && hour === '*') {
    if (minute === '*') {
      return '每分钟';
    }
    const matchEveryMinutes = minute.match(/^\*\/(\d+)$/);
    if (matchEveryMinutes) {
      return `每 ${matchEveryMinutes[1]} 分钟`;
    }
  }

  // 2. Hourly patterns
  if (dayOfMonth === '*' && dayOfWeek === '*') {
    const isMinuteNumber = /^\d+$/.test(minute);
    const minNum = Number(minute);

    if (hour === '*' && isMinuteNumber) {
      return minNum === 0 ? '每小时整点' : `每小时第 ${minNum} 分`;
    }

    const matchEveryHours = hour.match(/^\*\/(\d+)$/);
    if (matchEveryHours && isMinuteNumber) {
      const intervalHours = matchEveryHours[1];
      return minNum === 0 ? `每 ${intervalHours} 小时整点` : `每 ${intervalHours} 小时第 ${minNum} 分`;
    }
  }

  const timeText = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const workdaysLabel = options.workdaysLabel || '每个工作日';

  if (dayOfMonth === '*' && dayOfWeek === '1-5') {
    return `${workdaysLabel} ${timeText}`;
  }

  if (dayOfMonth !== '*' && dayOfWeek === '*') {
    return `每月 ${dayOfMonth} 日 ${timeText}`;
  }

  if (dayOfMonth === '*' && dayOfWeek !== '*') {
    const weekText = dayOfWeek
      .split(',')
      .map((day) => (options.weekdayLabelMap || WEEKDAY_LABEL_MAP).get(day) || day)
      .join('、');
    return `每周 ${weekText} ${timeText}`;
  }

  return cronExpression;
};
