export type DateTextInput = string | Date | null | undefined;

interface CommonDateTextOptions {
  locale?: string;
  hour12?: boolean;
}

interface LocalizedDateTimeOptions extends CommonDateTextOptions {
  fallback?: string;
}

interface LocalizedDateTimeNullOptions extends CommonDateTextOptions {
  fallback: null;
}

const toDate = (value: DateTextInput): Date | null => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function formatLocalizedDateTime(
  value: DateTextInput,
  options: LocalizedDateTimeNullOptions
): string | null;
export function formatLocalizedDateTime(
  value: DateTextInput,
  options?: LocalizedDateTimeOptions
): string;
export function formatLocalizedDateTime(
  value: DateTextInput,
  options: LocalizedDateTimeOptions | LocalizedDateTimeNullOptions = {}
): string | null {
  const date = toDate(value);
  if (!date) {
    return options.fallback ?? '-';
  }

  return date.toLocaleString(options.locale || 'zh-CN', {
    hour12: options.hour12 ?? false,
  });
}

export const formatMonthDayTime = (
  value: DateTextInput,
  options: { locale?: string; fallback?: string } = {}
): string => {
  const date = toDate(value);
  if (!date) {
    return options.fallback ?? '-';
  }

  return new Intl.DateTimeFormat(options.locale || 'zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};
