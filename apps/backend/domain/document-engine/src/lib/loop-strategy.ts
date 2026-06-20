/**
 * Carbone Engine - Loop Strategy
 * 多格式循环探测策略，支持不同Office文档格式
 */

/**
 * 循环探测策略接口
 */
export interface LoopStrategy {
  /**
   * 获取格式类型
   */
  getFormat(): 'docx' | 'xlsx' | 'pptx';

  /**
   * 获取表格行标签
   */
  getRowTag(): string;

  /**
   * 获取段落标签
   */
  getParagraphTag(): string;

  /**
   * 获取单元格标签
   */
  getCellTag(): string;

  /**
   * 获取文本标签
   */
  getTextTag(): string;

  /**
   * 获取循环容器的XPath模式
   */
  getLoopContainerPattern(): RegExp;

  /**
   * 检测循环范围
   * @param xml XML内容
   * @param markerPosition 标记位置
   */
  detectLoopRange(xml: string, markerPosition: number): LoopRange | null;

  /**
   * 验证标记平衡
   * @param xml XML内容
   * @param startMarker 循环开始标记位置
   * @param endMarker 循环结束标记位置
   */
  validateMarkerBalance(xml: string, startMarker: number, endMarker: number): ValidationResult;
}

/**
 * 循环范围
 */
export interface LoopRange {
  startContainer: string; // 容器开始标签
  endContainer: string; // 容器结束标签
  startPos: number;
  endPos: number;
  depth: number; // 嵌套深度
}

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

export interface ValidationError {
  type: 'structural' | 'marker' | 'nesting';
  message: string;
  position: number;
}

/**
 * Word文档循环策略
 */
export class DocxLoopStrategy implements LoopStrategy {
  getFormat(): 'docx' {
    return 'docx';
  }

  getRowTag(): string {
    return 'w:tr';
  }

  getParagraphTag(): string {
    return 'w:p';
  }

  getCellTag(): string {
    return 'w:tc';
  }

  getTextTag(): string {
    return 'w:t';
  }

  getLoopContainerPattern(): RegExp {
    // 表格行作为循环容器
    return /<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g;
  }

  detectLoopRange(xml: string, markerPosition: number): LoopRange | null {
    // 查找包含标记的表格行
    const rowPattern = /<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g;
    let match;

    while ((match = rowPattern.exec(xml)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      if (markerPosition >= start && markerPosition < end) {
        return {
          startContainer: '<w:tr>',
          endContainer: '</w:tr>',
          startPos: start,
          endPos: end,
          depth: this.calculateDepth(xml, start),
        };
      }
    }

    // 如果不在表格行中，尝试段落
    const paraPattern = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;
    while ((match = paraPattern.exec(xml)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      if (markerPosition >= start && markerPosition < end) {
        return {
          startContainer: '<w:p>',
          endContainer: '</w:p>',
          startPos: start,
          endPos: end,
          depth: this.calculateDepth(xml, start),
        };
      }
    }

    return null;
  }

  validateMarkerBalance(xml: string, startMarker: number, endMarker: number): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // 获取开始标记所在的容器
    const startRange = this.detectLoopRange(xml, startMarker);
    const endRange = this.detectLoopRange(xml, endMarker);

    if (!startRange || !endRange) {
      errors.push({
        type: 'structural',
        message: '无法确定标记所在的容器',
        position: startMarker,
      });
      return { valid: false, errors, warnings };
    }

    // 检查是否在同一容器层级
    if (startRange.startContainer !== endRange.startContainer) {
      errors.push({
        type: 'structural',
        message: `循环开始和结束标记不在同类型的容器中: ${startRange.startContainer} vs ${endRange.startContainer}`,
        position: startMarker,
      });
    }

    // 检查嵌套深度是否一致
    if (startRange.depth !== endRange.depth) {
      errors.push({
        type: 'nesting',
        message: `循环开始和结束标记的嵌套深度不一致: ${startRange.depth} vs ${endRange.depth}`,
        position: startMarker,
      });
    }

    // 检查是否跨单元格
    if (startRange.startContainer === '<w:tr>') {
      const startRow = xml.substring(startRange.startPos, startRange.endPos);
      const endRow = xml.substring(endRange.startPos, endRange.endPos);

      if (startRow === endRow) {
        warnings.push('循环开始和结束标记在同一个表格行内，这通常不是预期行为');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 计算嵌套深度
   */
  private calculateDepth(xml: string, position: number): number {
    let depth = 0;
    const openPattern = /<w:tr[^>]*>/g;
    const closePattern = /<\/w:tr>/g;

    // 计算position之前的开启标签数量
    let match;
    while ((match = openPattern.exec(xml)) !== null) {
      if (match.index < position) {
        depth++;
      }
    }

    // 减去关闭标签数量
    while ((match = closePattern.exec(xml)) !== null) {
      if (match.index < position) {
        depth--;
      }
    }

    return Math.max(0, depth);
  }
}

/**
 * Excel文档循环策略
 */
export class XlsxLoopStrategy implements LoopStrategy {
  getFormat(): 'xlsx' {
    return 'xlsx';
  }

  getRowTag(): string {
    return 'row';
  }

  getParagraphTag(): string {
    return 'c'; // 单元格
  }

  getCellTag(): string {
    return 'c';
  }

  getTextTag(): string {
    return 'v'; // 值
  }

  getLoopContainerPattern(): RegExp {
    return /<row[^>]*>([\s\S]*?)<\/row>/g;
  }

  detectLoopRange(xml: string, markerPosition: number): LoopRange | null {
    const rowPattern = /<row[^>]*>([\s\S]*?)<\/row>/g;
    let match;

    while ((match = rowPattern.exec(xml)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      if (markerPosition >= start && markerPosition < end) {
        return {
          startContainer: '<row>',
          endContainer: '</row>',
          startPos: start,
          endPos: end,
          depth: 0,
        };
      }
    }

    return null;
  }

  validateMarkerBalance(xml: string, startMarker: number, endMarker: number): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    const startRange = this.detectLoopRange(xml, startMarker);
    const endRange = this.detectLoopRange(xml, endMarker);

    if (!startRange || !endRange) {
      errors.push({
        type: 'structural',
        message: '无法确定标记所在的行',
        position: startMarker,
      });
      return { valid: false, errors, warnings };
    }

    if (startRange.startPos === endRange.startPos) {
      warnings.push('循环开始和结束标记在同一行内');
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}

/**
 * PowerPoint文档循环策略
 */
export class PptxLoopStrategy implements LoopStrategy {
  getFormat(): 'pptx' {
    return 'pptx';
  }

  getRowTag(): string {
    return 'a:tr'; // 表格行
  }

  getParagraphTag(): string {
    return 'a:p';
  }

  getCellTag(): string {
    return 'a:tc';
  }

  getTextTag(): string {
    return 'a:t';
  }

  getLoopContainerPattern(): RegExp {
    // PPT中可以是幻灯片或表格行
    return /<(?:a:tr|p:sp)[^>]*>([\s\S]*?)<\/(?:a:tr|p:sp)>/g;
  }

  detectLoopRange(xml: string, markerPosition: number): LoopRange | null {
    // 尝试表格行
    const rowPattern = /<a:tr[^>]*>([\s\S]*?)<\/a:tr>/g;
    let match;

    while ((match = rowPattern.exec(xml)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      if (markerPosition >= start && markerPosition < end) {
        return {
          startContainer: '<a:tr>',
          endContainer: '</a:tr>',
          startPos: start,
          endPos: end,
          depth: 0,
        };
      }
    }

    // 尝试形状/文本框
    const shapePattern = /<p:sp[^>]*>([\s\S]*?)<\/p:sp>/g;
    while ((match = shapePattern.exec(xml)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      if (markerPosition >= start && markerPosition < end) {
        return {
          startContainer: '<p:sp>',
          endContainer: '</p:sp>',
          startPos: start,
          endPos: end,
          depth: 0,
        };
      }
    }

    return null;
  }

  validateMarkerBalance(xml: string, startMarker: number, endMarker: number): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    const startRange = this.detectLoopRange(xml, startMarker);
    const endRange = this.detectLoopRange(xml, endMarker);

    if (!startRange || !endRange) {
      errors.push({
        type: 'structural',
        message: '无法确定标记所在的容器',
        position: startMarker,
      });
      return { valid: false, errors, warnings };
    }

    if (startRange.startContainer !== endRange.startContainer) {
      errors.push({
        type: 'structural',
        message: '循环标记跨越不同类型的容器',
        position: startMarker,
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}

/**
 * 循环策略工厂
 */
export class LoopStrategyFactory {
  private static strategies: Map<string, LoopStrategy>;

  static {
    this.strategies = new Map<string, LoopStrategy>();
    this.strategies.set('docx', new DocxLoopStrategy());
    this.strategies.set('xlsx', new XlsxLoopStrategy());
    this.strategies.set('pptx', new PptxLoopStrategy());
  }

  /**
   * 获取指定格式的策略
   */
  static getStrategy(format: string): LoopStrategy | null {
    return this.strategies.get(format) || null;
  }

  /**
   * 注册自定义策略
   */
  static registerStrategy(strategy: LoopStrategy): void {
    this.strategies.set(strategy.getFormat(), strategy);
  }

  /**
   * 获取所有支持的格式
   */
  static getSupportedFormats(): string[] {
    return Array.from(this.strategies.keys());
  }
}
