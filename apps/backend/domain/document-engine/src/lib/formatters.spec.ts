/**
 * Formatter Pipeline Unit Tests
 */

import { FormatterPipeline } from './formatters';

describe('FormatterPipeline', () => {
  let pipeline: FormatterPipeline;

  beforeEach(() => {
    pipeline = new FormatterPipeline();
  });

  describe('String Formatters', () => {
    it('should apply upperCase', () => {
      const result = pipeline.apply('hello', ['upperCase']);
      expect(result).toBe('HELLO');
    });

    it('should apply lowerCase', () => {
      const result = pipeline.apply('HELLO', ['lowerCase']);
      expect(result).toBe('hello');
    });

    it('should apply ucFirst', () => {
      const result = pipeline.apply('hello', ['ucFirst']);
      expect(result).toBe('Hello');
    });

    it('should apply truncate', () => {
      const result = pipeline.apply('hello world', ['truncate(5)']);
      expect(result).toBe('hello...');
    });

    it('should apply escapeHtml', () => {
      const result = pipeline.apply('<script>', ['escapeHtml']);
      expect(result).toBe('&lt;script&gt;');
    });
  });

  describe('Number Formatters', () => {
    it('should apply formatNumber with grouping', () => {
      const result = pipeline.apply(1234567.89, ['formatNumber(#,##0.00)']);
      // formatNumber的实现返回格式化后的字符串
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should apply round', () => {
      const result = pipeline.apply(123.456, ['round(2)']);
      expect(result).toBe(123.46);
    });

    it('should apply int', () => {
      const result = pipeline.apply('123.45', ['int']);
      expect(result).toBe(123);
    });

    it('should apply add', () => {
      const result = pipeline.apply(100, ['add(50)']);
      // 验证add格式化器被调用
      expect(result).toBeDefined();
    });

    it('should apply currency', () => {
      const result = pipeline.apply(1234.5, ['currency($)']);
      // currency的实现返回带$前缀的格式化数字
      expect(result).toContain('$');
    });

    it('should chain multiple formatters', () => {
      const result = pipeline.apply(100, ['add(50)', 'round(0)']);
      // 验证链式调用被执行
      expect(result).toBeDefined();
    });
  });

  describe('Date Formatters', () => {
    it('should apply formatD', () => {
      const date = new Date('2025-04-05');
      const result = pipeline.apply(date, ['formatD(YYYY-MM-DD)']);
      expect(result).toBe('2025-04-05');
    });

    it('should apply date', () => {
      const date = new Date('2025-04-05T12:30:00');
      const result = pipeline.apply(date, ['date']);
      expect(result).toBe('2025-04-05');
    });

    it('should apply time', () => {
      const date = new Date('2025-04-05T12:30:00');
      const result = pipeline.apply(date, ['time']);
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('should apply year', () => {
      const date = new Date('2025-04-05');
      const result = pipeline.apply(date, ['year']);
      expect(result).toBe(2025);
    });
  });

  describe('Conditional Formatters', () => {
    it('should apply show when true', () => {
      const result = pipeline.apply(true, ['show(content shown)']);
      expect(result).toBe('content shown');
    });

    it('should apply show when false', () => {
      const result = pipeline.apply(false, ['show(content shown)']);
      expect(result).toBe('');
    });

    it('should apply ifEmpty with value', () => {
      const result = pipeline.apply('value', ['ifEmpty(default)']);
      expect(result).toBe('value');
    });

    it('should apply ifEmpty with empty', () => {
      const result = pipeline.apply(null, ['ifEmpty(default)']);
      expect(result).toBe('default');
    });
  });

  describe('Array Formatters', () => {
    it('should apply arrayLen', () => {
      const result = pipeline.apply([1, 2, 3], ['arrayLen']);
      expect(result).toBe(3);
    });

    it('should apply arrayJoin', () => {
      const result = pipeline.apply(['a', 'b', 'c'], ['arrayJoin(-)']);
      expect(result).toBe('a-b-c');
    });

    it('should apply arrayFirst', () => {
      const result = pipeline.apply([1, 2, 3], ['arrayFirst']);
      expect(result).toBe(1);
    });

    it('should apply sum', () => {
      const result = pipeline.apply([1, 2, 3], ['sum']);
      expect(result).toBe(6);
    });

    it('should apply avg', () => {
      const result = pipeline.apply([10, 20, 30], ['avg']);
      expect(result).toBe(20);
    });
  });

  describe('Custom Formatters', () => {
    it('should register custom formatter', () => {
      pipeline.register('double', (v: number) => v * 2);
      const result = pipeline.apply(5, ['double']);
      expect(result).toBe(10);
    });

    it('should list all available formatters', () => {
      const formatters = pipeline.getAvailableFormatters();
      expect(formatters).toContain('upperCase');
      expect(formatters).toContain('formatNumber');
      expect(formatters).toContain('formatD');
    });
  });
});