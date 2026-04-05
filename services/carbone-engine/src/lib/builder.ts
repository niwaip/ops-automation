/**
 * Carbone Engine - Builder Module
 * 根据数据和标记生成最终XML
 */

import { Parser, Marker, LoopInfo, ParsedTemplate } from './parser';
import { FormatterPipeline } from './formatters';

export interface BuildOptions {
  lang?: string;
  timezone?: string;
  complement?: Record<string, any>;
  formatters?: Record<string, Function>;
}

export interface BuildResult {
  xml: string;
  warnings?: string[];
}

export class Builder {
  private parser: Parser;
  private formatterPipeline: FormatterPipeline;

  constructor() {
    this.parser = new Parser();
    this.formatterPipeline = new FormatterPipeline();
  }

  /**
   * 数据路径求值
   * 例如: d.user.name -> data.user.name
   */
  evaluatePath(path: string, data: any, context: { loopIndex?: number; parentsData?: any[] } = {}): any {
    // 去掉前缀字符 (d, c, t)
    const cleanPath = path.replace(/^([cdt])\./, '');
    const prefixChar = path.charAt(0);

    // 选择数据源
    let dataSource: any;
    if (prefixChar === 'd') {
      dataSource = data;
    } else if (prefixChar === 'c') {
      dataSource = context;
    } else {
      dataSource = data; // 默认使用主数据
    }

    // 处理数组索引 [i]
    if (cleanPath.includes('[i]')) {
      const normalizedPath = cleanPath.replace(/\[i\]/g, `[${context.loopIndex || 0}]`);
      return this.evaluateNormalizedPath(normalizedPath, dataSource);
    }

    return this.evaluateNormalizedPath(cleanPath, dataSource);
  }

  /**
   * 执行标准化路径求值
   */
  private evaluateNormalizedPath(path: string, data: any): any {
    const parts = path.split('.');
    let current = data;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      // 处理数组索引
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const key = arrayMatch[1];
        const index = parseInt(arrayMatch[2], 10);
        current = current[key]?.[index];
      } else {
        current = current[part];
      }
    }

    return current;
  }

  /**
   * 处理循环
   */
  processLoops(xml: string, loops: LoopInfo[], data: any): string {
    let resultXml = xml;

    for (const loop of loops) {
      const arrayData = this.evaluatePath(loop.arrayPath, data);

      if (!Array.isArray(arrayData) || arrayData.length === 0) {
        // 数组为空，移除模板单元
        resultXml = resultXml.replace(loop.templateUnit, '');
        continue;
      }

      // 为数组中的每个元素渲染模板
      const renderedParts: string[] = [];

      for (let i = 0; i < arrayData.length; i++) {
        let unit = loop.templateUnit;

        // 更新行号/索引号（Excel特有）
        unit = this.updateRowNumbers(unit, i);

        // 替换循环变量
        unit = unit.replace(/\{[cdt]\.([^}]+)\[i\]([^}]*)\}/g, (match, path, suffix) => {
          const fullPath = path + '[i]' + suffix;
          const value = this.evaluatePath(`d.${path}`, data, { loopIndex: i });
          return this.formatterPipeline.apply(value, this.parseFormatters(suffix));
        });

        renderedParts.push(unit);
      }

      resultXml = resultXml.replace(loop.templateUnit, renderedParts.join(''));
    }

    return resultXml;
  }

  /**
   * 解析格式化器字符串
   */
  private parseFormatters(formatterString: string): string[] {
    if (!formatterString || formatterString.startsWith(':') === false) {
      return [];
    }

    const formatters: string[] = [];
    const regex = /:([a-zA-Z]+)(?:\(([^)]*)\))?/g;
    let match;

    while ((match = regex.exec(formatterString)) !== null) {
      const name = match[1];
      const params = match[2];
      formatters.push(params ? `${name}(${params})` : name);
    }

    return formatters;
  }

  /**
   * 更新Excel行号
   */
  private updateRowNumbers(xml: string, offset: number): string {
    // Excel XML中的行号格式: <row r="1"> 或 <c r="A1">
    return xml.replace(/r="(\d+)"/g, (match, num) => {
      return `r="${parseInt(num, 10) + offset}"`;
    }).replace(/r="([A-Z]+)(\d+)"/g, (match, col, row) => {
      return `r="${col}${parseInt(row, 10) + offset}"`;
    });
  }

  /**
   * 替换简单变量（非循环）
   */
  replaceVariables(xml: string, markers: Marker[], data: any, options: BuildOptions = {}): string {
    let resultXml = xml;

    // 过滤掉数组标记（它们在循环处理中已经替换）
    const simpleMarkers = markers.filter(m => !m.isArray);

    for (const marker of simpleMarkers) {
      const markerString = `{${marker.name}}`;
      const value = this.evaluatePath(marker.name, data);
      const formattedValue = this.formatterPipeline.apply(value, marker.formatters);
      resultXml = resultXml.replace(markerString, String(formattedValue ?? ''));
    }

    // 清理剩余的占位符
    resultXml = resultXml.replace(/\uFFFF/g, '');

    return resultXml;
  }

  /**
   * 构建最终XML
   */
  buildXML(xml: string, data: any, options: BuildOptions = {}): BuildResult {
    const parsed = this.parser.parse(xml);
    const warnings: string[] = [];

    // 检查数据完整性
    for (const variable of parsed.variables) {
      const value = this.evaluatePath(variable, data);
      if (value === undefined) {
        warnings.push(`Missing data for variable: ${variable}`);
      }
    }

    // 处理循环
    let processedXml = this.processLoops(xml, parsed.loops, data);

    // 替换简单变量
    processedXml = this.replaceVariables(processedXml, parsed.markers, data, options);

    return {
      xml: processedXml,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }
}