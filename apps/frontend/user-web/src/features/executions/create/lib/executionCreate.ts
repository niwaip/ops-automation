import type { CreateScheduleRequest, UpdateScheduleRequest } from '@/api/schedules';
import type { SkillParamsSchema } from '@/api/skill';

export type SchemaField = {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  defaultValue?: unknown;
  enum?: Array<string | number>;
};

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
export type ExecutionScheduleToggleInput = Pick<UpdateScheduleRequest, 'isActive'>;

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

export const getTypeTagColor = (type: string) => {
  const normalizedType = type.toLowerCase();
  if (normalizedType === 'boolean') return 'green';
  if (normalizedType === 'number' || normalizedType === 'integer') return 'blue';
  if (normalizedType === 'object' || normalizedType === 'json') return 'purple';
  return 'default';
};

export const stringifyPreview = (value: unknown) => {
  try {
    const text = JSON.stringify(value, null, 2);
    return text.length > 240 ? `${text.slice(0, 240)}...` : text;
  } catch {
    return String(value);
  }
};

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

export const getSchemaFields = (schema?: SkillParamsSchema): SchemaField[] => {
  if (!schema?.properties) {
    return [];
  }

  const requiredFields = new Set(schema.required || []);
  return Object.entries(schema.properties).map(([name, config]) => ({
    name,
    type: config?.type || 'string',
    description: config?.description,
    required: requiredFields.has(name) || Boolean(config?.required),
    defaultValue: config?.default,
    enum: config?.enum,
  }));
};

export const getInitialInputValues = (fields: SchemaField[]): Record<string, unknown> => {
  return fields.reduce<Record<string, unknown>>((acc, field) => {
    if (field.defaultValue === undefined) {
      if (field.type === 'boolean') {
        acc[field.name] = false;
      }
      return acc;
    }

    if (field.type === 'object' || field.type === 'json' || field.type === 'array') {
      acc[field.name] =
        typeof field.defaultValue === 'string'
          ? field.defaultValue
          : JSON.stringify(field.defaultValue, null, 2);
      return acc;
    }

    acc[field.name] = field.defaultValue;
    return acc;
  }, {});
};

export const normalizeInputValues = (
  values: Record<string, unknown>,
  fields: SchemaField[]
): Record<string, unknown> => {
  return fields.reduce<Record<string, unknown>>((acc, field) => {
    const rawValue = values[field.name];

    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return acc;
    }

    const normalizedType = field.type.toLowerCase();

    if (
      (normalizedType === 'object' || normalizedType === 'json' || normalizedType === 'array') &&
      typeof rawValue === 'string'
    ) {
      acc[field.name] = JSON.parse(rawValue);
      return acc;
    }

    acc[field.name] = rawValue;
    return acc;
  }, {});
};

export const buildExecutionScheduleCreateRequest = ({
  values,
  schemaFields,
  selectedSkillDisplayName,
  selectedSkillVersion,
}: {
  values: ExecutionCreateFormValues;
  schemaFields: SchemaField[];
  selectedSkillDisplayName: string;
  selectedSkillVersion?: string;
}): CreateScheduleRequest => ({
  name: values.scheduleName?.trim() || getDefaultScheduleName(selectedSkillDisplayName),
  description: values.scheduleDescription?.trim() || undefined,
  skillId: values.skillId,
  skillVersion: selectedSkillVersion,
  input: normalizeInputValues(values.input || {}, schemaFields),
  cronExpression: buildScheduleCronExpression(values),
  timezone: values.timezone?.trim() || 'Asia/Shanghai',
});

export const buildExecutionScheduleToggleInput = (
  isActive: boolean
): ExecutionScheduleToggleInput => ({
  isActive,
});
