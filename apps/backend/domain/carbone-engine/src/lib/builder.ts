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
  skipLoops?: boolean;
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

  private sanitizeXmlText(value: string): string {
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
  }

  private escapeXmlText(value: string): string {
    const sanitized = this.sanitizeXmlText(value);
    return sanitized
      .replace(/&(?!(?:[a-zA-Z]+|#\d+);)/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * 数据路径求值
   * 例如: d.user.name -> data.user.name
   */
  evaluatePath(path: string, data: any, context: { loopIndex?: number; parentsData?: any[] } = {}): any {
    // 移除可能存在的花括号
    const unwrappedPath = path.startsWith('{') && path.endsWith('}') 
      ? path.slice(1, -1) 
      : path;
      
    // 去掉前缀字符 (d, c, t)
    const cleanPath = unwrappedPath.replace(/^([cdt])\./, '');
    const prefixChar = unwrappedPath.charAt(0);

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

      const prev = current;
      // Handle array index: items[0] or items[]
      const arrayMatch = part.match(/^([^\[]+)\[(\d+)?\]$/);
      if (arrayMatch) {
        const key = arrayMatch[1];
        const index = arrayMatch[2] !== undefined ? parseInt(arrayMatch[2], 10) : 0;
        current = current[key]?.[index];
      } else {
        current = current[part];
      }
    }

    return current;
  }

  /**
   * 处理循环（支持嵌套）
   */
  processLoops(xml: string, loops: LoopInfo[], data: any): string {
    let resultXml = xml;

    // 按深度从外到内处理循环
    const sortedLoops = [...loops].sort((a, b) => a.depth - b.depth);

    for (const loop of sortedLoops) {
      resultXml = this.processSingleLoop(resultXml, loop, data, loops);
    }

    // 清理显式循环标记
    resultXml = resultXml.replace(/\{#[cdt]\.([^}]+)\}/g, '');
    resultXml = resultXml.replace(/\{\/[cdt]\.([^}]+)\}/g, '');

    return resultXml;
  }

  /**
   * 处理单个循环
   */
  private processSingleLoop(xml: string, loop: LoopInfo, data: any, allLoops: LoopInfo[]): string {
    // 提取数组路径中的路径部分
    const arrayPathMatch = loop.arrayPath.match(/^([cdt])\.(.+)$/);
    if (!arrayPathMatch) return xml;

    const prefixChar = arrayPathMatch[1];
    const pathPart = arrayPathMatch[2];

    // 获取数组数据
    let arrayData: any[];

    // 处理嵌套路径 (如 d.categories[i].products)
    if (loop.parentLoop) {
      // 对于嵌套循环，需要根据父循环的索引获取数据
      // 简化处理：假设数据结构已经准备好
      arrayData = this.evaluatePath(loop.arrayPath.replace('[i]', '[0]'), data) || [];
      if (!Array.isArray(arrayData)) {
        arrayData = [];
      }
    } else {
      const evaluated = this.evaluatePath(loop.arrayPath, data);
      arrayData = Array.isArray(evaluated) ? evaluated : [];
    }

    if (arrayData.length === 0) {
      // 数组为空，移除模板单元（但保留显式标记以便后续清理）
      if (loop.loopType === 'explicit') {
        // 显式循环保留标记，等待清理
        return xml.replace(loop.templateUnit, '');
      } else {
        return xml.replace(loop.templateUnit, '');
      }
    }

    // 为数组中的每个元素渲染模板
    const renderedParts: string[] = [];

    for (let i = 0; i < arrayData.length; i++) {
      let unit = loop.templateUnit;

      // 移除显式循环开始标记 {#d.xxx}
      unit = unit.replace(/\{#[cdt]\.[^}]+\}/, '');

      // 移除显式循环结束标记 {/d.xxx}
      unit = unit.replace(/\{\/[cdt]\.[^}]+\}/, '');

      // 更新行号/索引号（Excel特有）
      unit = this.updateRowNumbers(unit, i);

      // 替换当前循环层级的变量
      unit = this.replaceLoopVariables(unit, loop.arrayPath, i, data);

      // 处理嵌套循环中的变量引用
      if (loop.parentLoop) {
        // 替换父循环路径引用 (如 d.categories[i].products[i].name)
        unit = this.replaceNestedLoopVariables(unit, loop, i, data);
      }

      renderedParts.push(unit);
    }

    return xml.replace(loop.templateUnit, renderedParts.join(''));
  }

  /**
   * 替换循环变量
   */
  private replaceLoopVariables(unit: string, arrayPath: string, index: number, data: any): string {
    return unit.replace(/\{([cdt])\.([^}]+)(\[(?:i)?\])([^}]*)\}/g, (match, contextChar, path, indexToken, suffix) => {
      const expectedPrefix = arrayPath.replace(/^[cdt]\./, '').replace(/\[i\]/g, '');
      const formatterStart = suffix.indexOf(':');
      const propertySuffix = formatterStart >= 0 ? suffix.substring(0, formatterStart) : suffix;
      const formatterSuffix = formatterStart >= 0 ? suffix.substring(formatterStart) : '';

      if (path.startsWith(expectedPrefix)) {
        // 属于当前循环，进行替换
        const normalizedPath = `${path}${indexToken}${propertySuffix}`.replace(/\[(?:i)?\]/g, `[${index}]`);
        const value = this.evaluatePath(`${contextChar}.${normalizedPath}`, data);
        const formatters = this.parseFormatters(formatterSuffix);
        return this.escapeXmlText(String(this.formatterPipeline.apply(value, formatters) ?? ''));
      }

      // 不属于当前循环，保持原样（等待父循环处理）
      return match;
    });
  }

  /**
   * 替换嵌套循环变量
   */
  private replaceNestedLoopVariables(unit: string, loop: LoopInfo, index: number, data: any): string {
    // 处理多层嵌套索引
    // 例如: {d.categories[i].products[i].name}
    // 需要将父循环的 [i] 也替换成实际索引

    const parentPath = loop.parentLoop?.replace(/^[cdt]\./, '') || '';

    // 替换父循环路径中的 [i] 为具体索引（使用0作为示例，实际应该在父循环渲染时处理）
    return unit.replace(/\{[cdt]\.([^}]+\[i\][^}]*)\[i\]([^}]*)\}/g, (match, parentPart, suffix) => {
      // 将父路径的 [i] 替换为当前元素索引
      const normalizedParentPath = parentPart.replace(/\[i\]/g, `[${index}]`);
      const value = this.evaluatePath(`d.${normalizedParentPath}`, data);
      const formatters = this.parseFormatters(suffix);
      return this.escapeXmlText(String(this.formatterPipeline.apply(value, formatters) ?? ''));
    });
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
      const replacement = this.escapeXmlText(String(formattedValue ?? ''));
      resultXml = resultXml.split(markerString).join(replacement);
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
    const arrayBackedVariables = new Set(
      parsed.markers
        .filter(marker => marker.isArray)
        .map(marker => marker.name.replace(/\[(?:i(?:\+\d+)?)?\]/g, ''))
    );

    // 检查数据完整性
    for (const variable of parsed.variables) {
      if (arrayBackedVariables.has(variable)) {
        continue;
      }

      const value = this.evaluatePath(variable, data);
      if (value === undefined) {
        warnings.push(`Missing data for variable: ${variable}`);
      }
    }

    // 处理循环
    let processedXml = options.skipLoops ? xml : this.processLoops(xml, parsed.loops, data);

    // 替换简单变量
    processedXml = this.replaceVariables(processedXml, parsed.markers, data, options);

    return {
      xml: processedXml,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }
}
