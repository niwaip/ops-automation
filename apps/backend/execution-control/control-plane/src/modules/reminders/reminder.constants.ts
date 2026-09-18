export const REMINDER_CAPABILITY_KEY = 'platform.notification.reminder';
export const WECHAT_CHANNEL = 'wechat';
export const DEFAULT_REMINDER_TIMEZONE = 'Asia/Shanghai';

export const MAX_REMINDER_TITLE_LENGTH = 200;
export const MAX_REMINDER_MESSAGE_LENGTH = 4096;
export const MAX_REMINDER_CRON_LENGTH = 500;
export const MAX_REMINDER_TIMEZONE_LENGTH = 50;
export const MAX_DAILY_SCHEDULE_TIMES = 12;

export const FALLBACK_REMINDER_TITLE_LENGTH = 30;
export const DEFAULT_REMINDER_TITLE = '消息提醒';

export const SNOOZE_ALLOWED_MINUTES = [10, 60, 1440] as const;
export type SnoozeMinutes = (typeof SNOOZE_ALLOWED_MINUTES)[number];

export const MS_PER_MINUTE = 60_000;

export const REMINDER_DISPATCHER_TICK_INTERVAL_MS = 30_000;
export const REMINDER_RULE_BATCH_SIZE = 50;
export const WECHAT_DELIVERY_BATCH_SIZE = 20;
export const WECHAT_DELIVERY_LEASE_MS = 60_000;
export const WECHAT_REQUEST_TIMEOUT_MS = 15_000;
export const WECHAT_MAX_BACKOFF_MS = 3_600_000;
export const WECHAT_BASE_BACKOFF_MS = 30_000;
export const WECHAT_MAX_BACKOFF_POWER = 7;
export const MAX_WECHAT_ERROR_LENGTH = 1000;
