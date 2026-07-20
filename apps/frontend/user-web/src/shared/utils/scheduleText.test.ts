import { describe, expect, it } from 'vitest';
import { summarizeCronExpression } from './scheduleText';

describe('summarizeCronExpression', () => {
  it('should return default text if no expression is provided', () => {
    expect(summarizeCronExpression()).toBe('未设置');
    expect(summarizeCronExpression('')).toBe('未设置');
  });

  it('should return original expression if parts count is not 5', () => {
    expect(summarizeCronExpression('0 0 1 *')).toBe('0 0 1 *');
    expect(summarizeCronExpression('0 0 1 * * *')).toBe('0 0 1 * * *');
  });

  it('should handle workdays (1-5)', () => {
    expect(summarizeCronExpression('30 9 * * 1-5')).toBe('工作日 09:30');
    expect(
      summarizeCronExpression('0 18 * * 1-5', { workdaysLabel: '工作日(周一至五)' })
    ).toBe('工作日(周一至五) 18:00');
  });

  it('should handle monthly schedules', () => {
    expect(summarizeCronExpression('0 10 15 * *')).toBe('每月 15 日 10:00');
    expect(summarizeCronExpression('15 23 1 * *')).toBe('每月 1 日 23:15');
  });

  it('should handle weekly schedules', () => {
    const weekdayLabelMap = new Map([
      ['1', '周一'],
      ['3', '周三'],
      ['5', '周五'],
    ]);
    expect(
      summarizeCronExpression('0 9 * * 1,3,5', { weekdayLabelMap })
    ).toBe('每周 周一、周三、周五 09:00');
  });

  it('should fallback to original expression for other patterns', () => {
    expect(summarizeCronExpression('0 9 1 * 1-5')).toBe('0 9 1 * 1-5');
  });
});
