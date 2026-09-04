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
