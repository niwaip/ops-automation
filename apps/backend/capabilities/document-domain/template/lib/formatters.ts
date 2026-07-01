/**
 * Carbone Engine - Formatter Pipeline
 * 格式化器管道，支持链式调用
 */

import dayjs from 'dayjs';

export interface FormatterFunction {
  (value: any, ...params: any[]): any;
}

export class FormatterPipeline {
  private formatters: Record<string, FormatterFunction>;

  constructor() {
    this.formatters = this.loadBuiltinFormatters();
  }

  /**
   * 加载内置格式化器
   */
  private loadBuiltinFormatters(): Record<string, FormatterFunction> {
    return {
      // ===== 字符串格式化器 =====
      upperCase: (v: string) => String(v).toUpperCase(),
      lowerCase: (v: string) => String(v).toLowerCase(),
      ucFirst: (v: string) => {
        const str = String(v);
        return str.charAt(0).toUpperCase() + str.slice(1);
      },
      ucWords: (v: string) => {
        return String(v).replace(/\b\w/g, (c) => c.toUpperCase());
      },
      truncate: (v: string, length: number = 100) => {
        const str = String(v);
        return str.length > length ? str.slice(0, length) + '...' : str;
      },
      stripTags: (v: string) => String(v).replace(/<[^>]*>/g, ''),
      stripHtml: (v: string) => String(v).replace(/<[^>]*>/g, ''),
      escapeHtml: (v: string) => {
        return String(v)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      },

      // ===== 数字格式化器 =====
      formatNumber: (v: number, pattern: string = '#,##0.00') => {
        return this.formatNumberPattern(v, pattern);
      },
      int: (v: number) => parseInt(String(v), 10),
      float: (v: number) => parseFloat(String(v)),
      round: (v: number, decimals: number = 2) => {
        const num = parseFloat(String(v));
        return Number(num.toFixed(decimals));
      },
      floor: (v: number) => Math.floor(parseFloat(String(v))),
      ceil: (v: number) => Math.ceil(parseFloat(String(v))),
      abs: (v: number) => Math.abs(parseFloat(String(v))),
      add: (v: number, n: number) => parseFloat(String(v)) + n,
      subtract: (v: number, n: number) => parseFloat(String(v)) - n,
      multiply: (v: number, n: number) => parseFloat(String(v)) * n,
      divide: (v: number, n: number) => parseFloat(String(v)) / n,
      percent: (v: number) => parseFloat(String(v)) * 100,
      currency: (v: number, symbol: string = '$') => {
        return symbol + this.formatNumberPattern(v, '#,##0.00');
      },

      // ===== 日期格式化器 =====
      formatD: (v: Date | string, pattern: string = 'YYYY-MM-DD') => {
        const date = typeof v === 'string' ? dayjs(v) : dayjs(v);
        return date.format(pattern);
      },
      addDays: (v: Date | string, days: number) => {
        const date = typeof v === 'string' ? dayjs(v) : dayjs(v);
        return date.add(days, 'day').toDate();
      },
      addMonths: (v: Date | string, months: number) => {
        const date = typeof v === 'string' ? dayjs(v) : dayjs(v);
        return date.add(months, 'month').toDate();
      },
      addYears: (v: Date | string, years: number) => {
        const date = typeof v === 'string' ? dayjs(v) : dayjs(v);
        return date.add(years, 'year').toDate();
      },
      date: (v: Date | string) => {
        const date = typeof v === 'string' ? dayjs(v) : dayjs(v);
        return date.format('YYYY-MM-DD');
      },
      time: (v: Date | string) => {
        const date = typeof v === 'string' ? dayjs(v) : dayjs(v);
        return date.format('HH:mm:ss');
      },
      datetime: (v: Date | string) => {
        const date = typeof v === 'string' ? dayjs(v) : dayjs(v);
        return date.format('YYYY-MM-DD HH:mm:ss');
      },
      year: (v: Date | string) => dayjs(v).year(),
      month: (v: Date | string) => dayjs(v).month() + 1,
      day: (v: Date | string) => dayjs(v).date(),
      weekday: (v: Date | string) => dayjs(v).day(),
      age: (v: Date | string) => {
        const birth = dayjs(v);
        return dayjs().diff(birth, 'year');
      },

      // ===== 条件格式化器 =====
      show: (v: any, content: string = '') => (v ? content : ''),
      hide: (v: any, content: string = '') => (v ? '' : content),
      showBegin: (v: any) => (v ? '' : '\uFFFE'), // 隐藏开始标记
      showEnd: () => '\uFFFF', // 隐藏结束标记
      hideBegin: (v: any) => (v ? '\uFFFE' : ''),
      hideEnd: () => '\uFFFF',
      if: (v: any, trueVal: string, falseVal: string = '') => (v ? trueVal : falseVal),
      ifEmpty: (v: any, defaultVal: string) => (v ? String(v) : defaultVal),
      empty: (v: any) => !v,
      notEmpty: (v: any) => Boolean(v),

      // ===== 数组格式化器 =====
      arrayLen: (v: any[]) => (Array.isArray(v) ? v.length : 0),
      arrayFirst: (v: any[]) => (Array.isArray(v) && v.length > 0 ? v[0] : undefined),
      arrayLast: (v: any[]) => (Array.isArray(v) && v.length > 0 ? v[v.length - 1] : undefined),
      arrayJoin: (v: any[], separator: string = ',') => (Array.isArray(v) ? v.join(separator) : ''),
      arrayUnique: (v: any[]) => (Array.isArray(v) ? [...new Set(v)] : []),
      arraySort: (v: any[], order: string = 'asc') => {
        if (!Array.isArray(v)) return [];
        const sorted = [...v].sort();
        return order === 'desc' ? sorted.reverse() : sorted;
      },

      // ===== 类型转换 =====
      toString: (v: any) => String(v),
      toNumber: (v: any) => Number(v),
      toBoolean: (v: any) => Boolean(v),
      toJSON: (v: any) => JSON.stringify(v),

      // ===== 数学运算 =====
      sum: (v: number[]) => (Array.isArray(v) ? v.reduce((a, b) => a + b, 0) : 0),
      avg: (v: number[]) =>
        Array.isArray(v) && v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : 0,
      min: (v: number[]) => (Array.isArray(v) && v.length > 0 ? Math.min(...v) : undefined),
      max: (v: number[]) => (Array.isArray(v) && v.length > 0 ? Math.max(...v) : undefined),

      // ===== 文本处理 =====
      concat: (v: string, suffix: string) => String(v) + suffix,
      prepend: (v: string, prefix: string) => prefix + String(v),
      replace: (v: string, search: string, replace: string) =>
        String(v).replace(new RegExp(search, 'g'), replace),
      padLeft: (v: string, length: number, char: string = ' ') => String(v).padStart(length, char),
      padRight: (v: string, length: number, char: string = ' ') => String(v).padEnd(length, char),
    };
  }

  /**
   * 数字格式化模式处理
   */
  private formatNumberPattern(value: number, pattern: string): string {
    const num = parseFloat(String(value));

    // 简单实现：处理逗号分隔和小数位
    const parts = pattern.split('.');
    const hasDecimals = parts.length > 1;
    const decimalPlaces = hasDecimals ? parts[1].length : 0;
    const useGrouping = pattern.includes(',');

    if (useGrouping) {
      return num.toLocaleString('en-US', {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
      });
    }

    return num.toFixed(decimalPlaces);
  }

  /**
   * 解析格式化器字符串
   * 例如: "formatNumber(#,##0.00):round(2)"
   */
  parseFormatterString(formatterString: string): { name: string; params: string[] }[] {
    const formatters: { name: string; params: string[] }[] = [];

    // 分割格式化器链
    const parts = formatterString.split(':').filter((p) => p.trim());

    for (const part of parts) {
      const match = part.match(/^([a-zA-Z]+)(?:\(([^)]*)\))?$/);
      if (match) {
        const name = match[1];
        const paramsStr = match[2] || '';
        const params = paramsStr
          ? paramsStr.split(',').map((p) => p.trim().replace(/^'|'$|^"|"$/g, ''))
          : [];
        formatters.push({ name, params });
      }
    }

    return formatters;
  }

  /**
   * 应用格式化器链
   */
  apply(value: any, formatterNames: string[]): any {
    if (!formatterNames || formatterNames.length === 0) {
      return value;
    }

    let result = value;

    for (const formatterStr of formatterNames) {
      const parsed = this.parseFormatterString(formatterStr);

      for (const { name, params } of parsed) {
        const formatter = this.formatters[name];

        if (formatter) {
          try {
            result = formatter(result, ...params);
          } catch (error) {
            // 格式化失败，保持原值
            console.warn(`Formatter ${name} failed:`, error);
          }
        } else {
          console.warn(`Unknown formatter: ${name}`);
        }
      }
    }

    return result;
  }

  /**
   * 注册自定义格式化器
   */
  register(name: string, formatter: FormatterFunction): void {
    this.formatters[name] = formatter;
  }

  /**
   * 获取所有可用格式化器名称
   */
  getAvailableFormatters(): string[] {
    return Object.keys(this.formatters);
  }
}
