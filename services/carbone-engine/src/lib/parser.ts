/**
 * Carbone Engine - Parser Module
 * 解析模板中的变量标记 {d.xxx} 和循环模式 [i]
 */

export interface Marker {
  pos: number;
  name: string;
  formatters: string[];
  isArray: boolean;
  arrayPath?: string;
}

export interface LoopInfo {
  arrayPath: string;
  startPos: number;
  endPos: number;
  templateUnit: string;
  depth: number;
}

export interface ParsedTemplate {
  markers: Marker[];
  loops: LoopInfo[];
  variables: string[];
  cleanedXml: string;
}

// 正则表达式定义
const CARBONE_MARKER_REGEX = /\{([cdt])\.([^}]+)\}/g;
const ARRAY_INDEX_REGEX = /\[i\]/g;
const FORMATTER_REGEX = /:([a-zA-Z]+)(?:\(([^)]*)\))?/g;
const LOOP_PATTERN_REGEX = /\{[cdt]\.([^}]+)\[i\+1\][^}]*\}/g;

export class Parser {
  /**
   * 检查是否是Carbone标记
   */
  isCarboneMarker(marker: string): boolean {
    return /^\{?\s*(?:[cdt]\s*[.[:(])/.test(marker);
  }

  /**
   * 解析单个标记，提取路径和格式化器
   * 例如: {d.price:formatNumber(#,##0.00):round(2)}
   */
  parseMarker(markerString: string): { path: string; formatters: string[] } {
    const match = markerString.match(/^\{([cdt])\.([^}]+)\}$/);
    if (!match) {
      throw new Error(`Invalid marker format: ${markerString}`);
    }

    const fullContent = match[2];
    const parts = fullContent.split(':');
    const path = parts[0];
    const formatters = parts.slice(1);

    return { path, formatters };
  }

  /**
   * 查找模板中所有的标记
   */
  findMarkers(xml: string): Marker[] {
    const markers: Marker[] = [];
    let match;
    let offset = 0;
    let previousLength = 0;

    while ((match = CARBONE_MARKER_REGEX.exec(xml)) !== null) {
      const fullMarker = match[0];
      const contextChar = match[1];
      const markerContent = match[2];

      // 解析路径和格式化器
      const colonIndex = markerContent.indexOf(':');
      const pathPart = colonIndex > 0 ? markerContent.substring(0, colonIndex) : markerContent;
      const formatterPart = colonIndex > 0 ? markerContent.substring(colonIndex + 1) : '';

      // 提取格式化器链
      const formatters: string[] = [];
      if (formatterPart) {
        let fmtMatch;
        const fmtRegex = /([a-zA-Z]+)(?:\(([^)]*)\))?/g;
        while ((fmtMatch = fmtRegex.exec(formatterPart)) !== null) {
          const name = fmtMatch[1];
          const params = fmtMatch[2] || '';
          formatters.push(params ? `${name}(${params})` : name);
        }
      }

      // 检查是否是数组标记
      const isArray = ARRAY_INDEX_REGEX.test(pathPart);
      let arrayPath: string | undefined;

      if (isArray) {
        // 提取数组路径 (例如 d.items[i].name -> d.items)
        const arrayMatch = pathPart.match(/^([^[]+)\[i\]/);
        if (arrayMatch) {
          arrayPath = `${contextChar}.${arrayMatch[1]}`;
        }
      }

      markers.push({
        pos: match.index - previousLength,
        name: `${contextChar}.${pathPart}`,
        formatters,
        isArray,
        arrayPath
      });

      previousLength += fullMarker.length;
    }

    return markers;
  }

  /**
   * 检测循环模式
   * Carbone使用 [i] 和 [i+1] 来标记循环范围
   */
  detectLoops(xml: string, markers: Marker[]): LoopInfo[] {
    const loops: LoopInfo[] = [];
    const arrayMarkers = markers.filter(m => m.isArray);

    // 按数组路径分组
    const arrayGroups = new Map<string, Marker[]>();
    for (const marker of arrayMarkers) {
      if (marker.arrayPath) {
        const existing = arrayGroups.get(marker.arrayPath) || [];
        existing.push(marker);
        arrayGroups.set(marker.arrayPath, existing);
      }
    }

    // 为每个数组路径创建循环信息
    for (const [arrayPath, groupMarkers] of arrayGroups) {
      if (groupMarkers.length < 2) continue;

      // 找到 [i] 和 [i+1] 标记来确定循环范围
      const sortedMarkers = groupMarkers.sort((a, b) => a.pos - b.pos);

      // 查找模板单元
      const startMarker = sortedMarkers.find(m => m.name.includes('[i]') && !m.name.includes('[i+1]'));
      const endMarker = sortedMarkers.find(m => m.name.includes('[i+1]'));

      if (startMarker && endMarker) {
        loops.push({
          arrayPath,
          startPos: startMarker.pos,
          endPos: endMarker.pos,
          templateUnit: xml.substring(startMarker.pos, endMarker.pos + 10), // 包含标记本身
          depth: 1
        });
      }
    }

    return loops;
  }

  /**
   * 提取所有变量名
   */
  extractVariables(markers: Marker[]): string[] {
    const variables = new Set<string>();

    for (const marker of markers) {
      // 移除数组索引部分
      const cleanPath = marker.name.replace(/\[i\+?\d?\]/g, '');
      variables.add(cleanPath);
    }

    return Array.from(variables);
  }

  /**
   * 完整解析模板
   */
  parse(xml: string): ParsedTemplate {
    const markers = this.findMarkers(xml);
    const loops = this.detectLoops(xml, markers);
    const variables = this.extractVariables(markers);

    // 清理XML（移除标记，保留特殊占位符）
    const cleanedXml = xml.replace(CARBONE_MARKER_REGEX, '\uFFFF');

    return {
      markers,
      loops,
      variables,
      cleanedXml
    };
  }
}