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
  isImplicitArray?: boolean;  // 隐式数组标记（无[i]但数据为数组）
}

export interface LoopInfo {
  arrayPath: string;
  startPos: number;
  endPos: number;
  templateUnit: string;
  depth: number;
  parentLoop?: string;  // 父循环路径，用于嵌套循环
  loopType: 'explicit' | 'implicit' | 'auto';  // 显式、隐式或自动检测
}

export interface ParsedTemplate {
  markers: Marker[];
  loops: LoopInfo[];
  variables: string[];
  cleanedXml: string;
  implicitArrays?: ImplicitArray[];  // 自动检测到的数组
}

/**
 * 隐式数组信息
 */
export interface ImplicitArray {
  path: string;           // 如 d.items.name
  detectedPath: string;   // 推断的数组路径，如 d.items
  occurrences: number;    // 出现次数
  container: string;      // 所在容器类型
  confidence: number;     // 置信度
}

// 正则表达式定义
const CARBONE_MARKER_REGEX = /\{([cdt])\.([^}]+)\}/g;
const ARRAY_INDEX_REGEX = /\[i\]|\[i\+\d+\]/;  // 支持 [i] 和 [i+1]
const FORMATTER_REGEX = /:([a-zA-Z]+)(?:\(([^)]*)\))?/g;
const LOOP_PATTERN_REGEX = /\{[cdt]\.([^}]+)\[i\+1\][^}]*\}/g;

// 显式循环标记: {#d.array} 和 {/d.array}
const LOOP_START_REGEX = /\{#([cdt])\.([^}]+)\}/g;  // {#d.items}
const LOOP_END_REGEX = /\{\/([cdt])\.([^}]+)\}/g;   // {/d.items}

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

      // 检查是否是数组标记（包含 [i] 或 [i+1] 等）
      const isArray = ARRAY_INDEX_REGEX.test(pathPart);
      let arrayPath: string | undefined;

      if (isArray) {
        // 提取数组路径 (例如 d.steps[i].name -> d.steps)
        const arrayMatch = pathPart.match(/^([^[]+)\[i/);
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
   * 支持两种方式:
   * 1. 显式循环标记: {#d.array} 和 {/d.array} (支持嵌套)
   * 2. 隐式循环标记: [i] 和 [i+1] 配对或表格行自动检测
   */
  detectLoops(xml: string, markers: Marker[]): LoopInfo[] {
    const loops: LoopInfo[] = [];

    // 首先检测显式循环标记 {#d.xxx} 和 {/d.xxx}
    const explicitLoops = this.detectExplicitLoops(xml);
    loops.push(...explicitLoops);

    // 然后检测隐式循环标记（[i] 和 [i+1] 配对）
    const implicitLoops = this.detectImplicitLoops(xml, markers, loops);
    loops.push(...implicitLoops);

    // 最后检测表格行循环
    const tableRowLoops = this.detectTableRowLoops(xml, markers, loops);
    loops.push(...tableRowLoops);

    // 按起始位置排序
    return loops.sort((a, b) => a.startPos - b.startPos);
  }

  /**
   * 检测显式循环标记 {#d.array} 和 {/d.array}
   * 支持嵌套循环
   */
  private detectExplicitLoops(xml: string): LoopInfo[] {
    const loops: LoopInfo[] = [];
    const loopStack: { arrayPath: string; startPos: number; depth: number }[] = [];

    // 重置正则表达式
    LOOP_START_REGEX.lastIndex = 0;
    LOOP_END_REGEX.lastIndex = 0;

    // 找到所有的循环开始和结束标记
    const loopMarkers: { type: 'start' | 'end'; pos: number; arrayPath: string }[] = [];

    let startMatch;
    while ((startMatch = LOOP_START_REGEX.exec(xml)) !== null) {
      const contextChar = startMatch[1];
      const path = startMatch[2];
      loopMarkers.push({
        type: 'start',
        pos: startMatch.index,
        arrayPath: `${contextChar}.${path}`
      });
    }

    let endMatch;
    while ((endMatch = LOOP_END_REGEX.exec(xml)) !== null) {
      const contextChar = endMatch[1];
      const path = endMatch[2];
      loopMarkers.push({
        type: 'end',
        pos: endMatch.index,
        arrayPath: `${contextChar}.${path}`
      });
    }

    // 按位置排序
    loopMarkers.sort((a, b) => a.pos - b.pos);

    // 处理循环嵌套
    for (const marker of loopMarkers) {
      if (marker.type === 'start') {
        // 计算深度
        const depth = loopStack.length + 1;
        const parentPath = loopStack.length > 0 ? loopStack[loopStack.length - 1].arrayPath : undefined;

        loopStack.push({
          arrayPath: marker.arrayPath,
          startPos: marker.pos,
          depth
        });
      } else if (marker.type === 'end') {
        // 查找匹配的开始标记
        const matchingStart = loopStack.find(s => s.arrayPath === marker.arrayPath);

        if (matchingStart) {
          // 提取模板内容（不包括开始和结束标记）
          const startPos = matchingStart.startPos;
          const endPos = marker.pos + xml.substring(marker.pos).indexOf('}') + 1;
          const templateUnit = xml.substring(startPos, endPos);

          // 计算父循环路径
          const parentLoop = loopStack.find(s =>
            s.startPos < matchingStart.startPos &&
            s.depth < matchingStart.depth
          )?.arrayPath;

          loops.push({
            arrayPath: marker.arrayPath,
            startPos: matchingStart.startPos,
            endPos,
            templateUnit,
            depth: matchingStart.depth,
            parentLoop,
            loopType: 'explicit'
          });

          // 从栈中移除
          const stackIndex = loopStack.findIndex(s => s.arrayPath === marker.arrayPath);
          if (stackIndex >= 0) {
            loopStack.splice(stackIndex, 1);
          }
        }
      }
    }

    return loops;
  }

  /**
   * 检测隐式循环标记 [i] 和 [i+1] 配对
   */
  private detectImplicitLoops(xml: string, markers: Marker[], existingLoops: LoopInfo[]): LoopInfo[] {
    const loops: LoopInfo[] = [];

    const arrayMarkers = markers.filter(m => m.isArray);
    const arrayGroups = new Map<string, Marker[]>();

    for (const marker of arrayMarkers) {
      if (marker.arrayPath) {
        const existing = arrayGroups.get(marker.arrayPath) || [];
        existing.push(marker);
        arrayGroups.set(marker.arrayPath, existing);
      }
    }

    for (const [arrayPath, groupMarkers] of arrayGroups) {
      // 检查是否已经有显式循环
      if (existingLoops.some(l => l.arrayPath === arrayPath && l.loopType === 'explicit')) {
        continue;
      }

      if (groupMarkers.length < 2) continue;

      const sortedMarkers = groupMarkers.sort((a, b) => a.pos - b.pos);
      const startMarker = sortedMarkers.find(m => m.name.includes('[i]') && !m.name.includes('[i+1]'));
      const endMarker = sortedMarkers.find(m => m.name.includes('[i+1]'));

      if (startMarker && endMarker) {
        // 计算嵌套深度
        const depth = this.calculateLoopDepth(startMarker.pos, existingLoops);
        const parentLoop = this.findParentLoop(startMarker.pos, existingLoops);

        loops.push({
          arrayPath,
          startPos: startMarker.pos,
          endPos: endMarker.pos,
          templateUnit: xml.substring(startMarker.pos, endMarker.pos + 10),
          depth,
          parentLoop,
          loopType: 'implicit'
        });
      }
    }

    return loops;
  }

  /**
   * 检测表格行循环（只有一个[i]标记的情况）
   */
  private detectTableRowLoops(xml: string, markers: Marker[], existingLoops: LoopInfo[]): LoopInfo[] {
    const loops: LoopInfo[] = [];

    const tableRowPattern = /<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g;
    let rowMatch;

    while ((rowMatch = tableRowPattern.exec(xml)) !== null) {
      const rowFullMatch = rowMatch[0];
      const rowStartPos = rowMatch.index;

      // 检查这个行是否包含数组标记
      const arrayInRow = markers.find(m => {
        return m.pos >= rowStartPos &&
               m.pos < rowStartPos + rowFullMatch.length &&
               m.name.includes('[i]');
      });

      if (arrayInRow && arrayInRow.arrayPath) {
        // 检查是否已经有这个数组路径的循环
        if (existingLoops.some(l => l.arrayPath === arrayInRow.arrayPath)) {
          continue;
        }

        // 计算嵌套深度
        const depth = this.calculateLoopDepth(rowStartPos, existingLoops);
        const parentLoop = this.findParentLoop(rowStartPos, existingLoops);

        loops.push({
          arrayPath: arrayInRow.arrayPath,
          startPos: rowStartPos,
          endPos: rowStartPos + rowFullMatch.length,
          templateUnit: rowFullMatch,
          depth,
          parentLoop,
          loopType: 'implicit'
        });
      }
    }

    return loops;
  }

  /**
   * 计算循环嵌套深度
   */
  private calculateLoopDepth(pos: number, existingLoops: LoopInfo[]): number {
    let depth = 1;
    for (const loop of existingLoops) {
      if (loop.startPos < pos && loop.endPos > pos) {
        depth = Math.max(depth, loop.depth + 1);
      }
    }
    return depth;
  }

  /**
   * 查找父循环
   */
  private findParentLoop(pos: number, existingLoops: LoopInfo[]): string | undefined {
    // 找到包含此位置的最内层循环
    const containingLoops = existingLoops.filter(l =>
      l.startPos < pos && l.endPos > pos
    ).sort((a, b) => b.depth - a.depth);

    return containingLoops[0]?.arrayPath;
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
  parse(xml: string, data?: any): ParsedTemplate {
    const markers = this.findMarkers(xml);
    const loops = this.detectLoops(xml, markers);
    const variables = this.extractVariables(markers);

    // 检测隐式数组（无[i]标记但数据为数组的情况）
    const implicitArrays = this.detectImplicitArrays(markers, data);

    // 为隐式数组自动生成循环
    const autoLoops = this.generateAutoLoops(xml, implicitArrays, loops);
    loops.push(...autoLoops);

    // 清理XML（移除标记，保留特殊占位符）
    const cleanedXml = xml.replace(CARBONE_MARKER_REGEX, '\uFFFF');

    return {
      markers,
      loops,
      variables,
      cleanedXml,
      implicitArrays
    };
  }

  /**
   * 检测隐式数组
   * 当变量路径对应的数据是数组，但模板中没有使用 [i] 标记时
   * 自动识别为隐式数组
   */
  detectImplicitArrays(markers: Marker[], data?: any): ImplicitArray[] {
    const implicitArrays: ImplicitArray[] = [];
    if (!data) return implicitArrays;

    // 收集所有非数组标记
    const nonArrayMarkers = markers.filter(m => !m.isArray);

    // 按路径前缀分组
    const pathGroups = new Map<string, Marker[]>();
    for (const marker of nonArrayMarkers) {
      // 提取可能的数组路径前缀
      // 例如: d.items.name -> d.items
      const parts = marker.name.split('.');
      if (parts.length >= 2) {
        const prefix = parts.slice(0, -1).join('.');
        const existing = pathGroups.get(prefix) || [];
        existing.push(marker);
        pathGroups.set(prefix, existing);
      }
    }

    // 检查每个路径前缀是否对应数组数据
    for (const [path, groupMarkers] of pathGroups) {
      const arrayData = this.getValueAtPath(data, path);

      if (Array.isArray(arrayData) && arrayData.length > 0) {
        // 找到隐式数组
        implicitArrays.push({
          path,
          detectedPath: path,
          occurrences: groupMarkers.length,
          container: this.detectContainer(groupMarkers),
          confidence: this.calculateImplicitArrayConfidence(groupMarkers, arrayData)
        });
      }
    }

    return implicitArrays;
  }

  /**
   * 为隐式数组生成自动循环
   */
  private generateAutoLoops(
    xml: string,
    implicitArrays: ImplicitArray[],
    existingLoops: LoopInfo[]
  ): LoopInfo[] {
    const autoLoops: LoopInfo[] = [];

    for (const implicit of implicitArrays) {
      // 检查是否已经有这个路径的循环
      if (existingLoops.some(l => l.arrayPath === implicit.path)) {
        continue;
      }

      // 找到包含这些标记的表格行
      const rowPattern = /<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g;
      let match;
      let foundRow = false;

      while ((match = rowPattern.exec(xml)) !== null) {
        const rowContent = match[0];
        const rowStart = match.index;

        // 检查行是否包含相关标记
        if (rowContent.includes(implicit.path.replace('d.', '{d.'))) {
          autoLoops.push({
            arrayPath: implicit.path,
            startPos: rowStart,
            endPos: rowStart + rowContent.length,
            templateUnit: rowContent,
            depth: 1,
            loopType: 'auto'
          });
          foundRow = true;
          break;
        }
      }

      // 如果不在表格行中，尝试段落
      if (!foundRow) {
        const paraPattern = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;
        while ((match = paraPattern.exec(xml)) !== null) {
          const paraContent = match[0];
          const paraStart = match.index;

          if (paraContent.includes(implicit.path.replace('d.', '{d.'))) {
            autoLoops.push({
              arrayPath: implicit.path,
              startPos: paraStart,
              endPos: paraStart + paraContent.length,
              templateUnit: paraContent,
              depth: 1,
              loopType: 'auto'
            });
            break;
          }
        }
      }
    }

    return autoLoops;
  }

  /**
   * 检测标记所在容器类型
   */
  private detectContainer(markers: Marker[]): string {
    // 根据标记位置推测容器类型
    // 这里返回通用值，实际使用时可以结合XML结构分析
    if (markers.length > 1) {
      return 'table-row';
    }
    return 'paragraph';
  }

  /**
   * 计算隐式数组检测的置信度
   */
  private calculateImplicitArrayConfidence(markers: Marker[], arrayData: any[]): number {
    let confidence = 0.5;

    // 标记越多，置信度越高
    if (markers.length > 3) confidence += 0.2;
    else if (markers.length > 1) confidence += 0.1;

    // 数组元素越多，越可能是正确的
    if (arrayData.length > 5) confidence += 0.2;
    else if (arrayData.length > 2) confidence += 0.1;

    return Math.min(confidence, 0.95);
  }

  /**
   * 根据路径获取值
   */
  private getValueAtPath(data: any, path: string): any {
    const cleanPath = path.replace(/^[dct]\./, '');
    const parts = cleanPath.split('.');
    let current = data;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }
}