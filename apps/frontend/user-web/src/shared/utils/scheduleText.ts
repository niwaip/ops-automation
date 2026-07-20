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
  const timeText = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const workdaysLabel = options.workdaysLabel || '工作日';

  if (dayOfMonth === '*' && dayOfWeek === '1-5') {
    return `${workdaysLabel} ${timeText}`;
  }

  if (dayOfMonth !== '*' && dayOfWeek === '*') {
    return `每月 ${dayOfMonth} 日 ${timeText}`;
  }

  if (dayOfMonth === '*' && dayOfWeek !== '*') {
    const weekText = dayOfWeek
      .split(',')
      .map((day) => options.weekdayLabelMap?.get(day) || day)
      .join('、');
    return `每周 ${weekText} ${timeText}`;
  }

  return cronExpression;
};
