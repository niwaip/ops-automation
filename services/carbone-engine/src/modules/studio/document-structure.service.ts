/**
 * Carbone Engine - Document Structure Parser
 * 解析Office文档的结构化元素（标题、段落、表格等）
 */

import { Injectable } from '@nestjs/common';
import JSZip from 'jszip';
// @ts-ignore - xml2js没有类型定义
import * as xml2js from 'xml2js';

export interface TableHeader {
  text: string;
  index: number;
}

export interface TableRow {
  cells: string[];
  hasPreserve: boolean;
  isHeader: boolean;
}

export interface DocumentElement {
  id: string;
  type: 'title' | 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'table' | 'list' | 'image';
  content: string;
  text: string;
  xpath: string;
  index: number;
  style?: string;
  children?: DocumentElement[];
  attributes?: Record<string, string>;
  // 表格特定属性
  tableHeaders?: TableHeader[];
  tableRows?: TableRow[];
  headerRow?: string;
  dataRows?: string[];
}

export interface DocumentStructure {
  elements: DocumentElement[];
  styles: Record<string, string>;
  namespaces: Record<string, string>;
}

@Injectable()
export class DocumentStructureService {
  private parser: DocumentStructureParser;

  constructor() {
    this.parser = new DocumentStructureParser();
  }

  /**
   * 解析Word文档结构
   */
  async parseDocx(buffer: Buffer): Promise<DocumentStructure> {
    return this.parser.parseDocx(buffer);
  }
}

export class DocumentStructureParser {
  private parser: xml2js.Parser;

  // Word命名空间
  private static readonly WORD_NS = {
    w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  };

  // 样式映射到元素类型
  private static readonly STYLE_TYPE_MAP: Record<string, string> = {
    'Title': 'title',
    'Heading1': 'heading1',
    'Heading2': 'heading2',
    'Heading3': 'heading3',
    'Heading4': 'heading3',
    'Heading5': 'heading3',
    'Heading6': 'heading3',
    'heading 1': 'heading1',
    'heading 2': 'heading2',
    'heading 3': 'heading3',
    'title': 'title',
  };

  constructor() {
    this.parser = new xml2js.Parser({
      explicitArray: false,
      mergeAttrs: false,
      attrNameProcessors: [(name: string) => name],
    });
  }

  /**
   * 解析Word文档结构
   */
  async parseDocx(buffer: Buffer): Promise<DocumentStructure> {
    const zip = new JSZip();
    await zip.loadAsync(buffer);

    // 读取document.xml
    const documentXml = await zip.file('word/document.xml')?.async('text');
    if (!documentXml) {
      throw new Error('Document.xml not found in DOCX');
    }

    // 读取styles.xml
    const stylesXml = await zip.file('word/styles.xml')?.async('text');
    const styles = stylesXml ? await this.parseStyles(stylesXml) : {};

    // 解析文档XML
    const elements = await this.parseDocumentXml(documentXml, styles);

    return {
      elements,
      styles,
      namespaces: DocumentStructureParser.WORD_NS,
    };
  }

  /**
   * 解析样式定义
   */
  private async parseStyles(stylesXml: string): Promise<Record<string, string>> {
    const styles: Record<string, string> = {};

    try {
      const result = await this.parser.parseStringPromise(stylesXml);
      const styleList = result?.['w:styles']?.['w:style'] || [];

      for (const style of Array.isArray(styleList) ? styleList : [styleList]) {
        if (style?.['w:styleId']) {
          const styleId = style['w:styleId'];
          const name = style?.['w:name']?.['w:val'] || styleId;
          styles[styleId] = name;
        }
      }
    } catch (e) {
      console.warn('Failed to parse styles:', e);
    }

    return styles;
  }

  /**
   * 解析文档XML，提取结构化元素
   */
  private async parseDocumentXml(xml: string, styles: Record<string, string>): Promise<DocumentElement[]> {
    const elements: DocumentElement[] = [];

    try {
      const result = await this.parser.parseStringPromise(xml);
      const body = result?.['w:document']?.['w:body'];

      if (!body) {
        console.warn('Document body not found');
        return elements;
      }

      let elementIndex = 0;

      // 遍历body下的所有元素
      for (const [key, value] of Object.entries(body)) {
        if (key === 'w:p') {
          // 段落元素
          const paragraphs = Array.isArray(value) ? value : [value];
          for (const p of paragraphs) {
            const element = this.parseParagraph(p, styles, elementIndex);
            if (element) {
              elements.push(element);
              elementIndex++;
            }
          }
        } else if (key === 'w:tbl') {
          // 表格元素
          const tables = Array.isArray(value) ? value : [value];
          for (const tbl of tables) {
            const element = this.parseTable(tbl, elementIndex);
            if (element) {
              elements.push(element);
              elementIndex++;
            }
          }
        } else if (key === 'w:sectPr') {
          // 忽略节属性
        }
      }
    } catch (e) {
      console.error('Failed to parse document XML:', e);
    }

    return elements;
  }

  /**
   * 解析段落元素
   */
  private parseParagraph(p: any, styles: Record<string, string>, index: number): DocumentElement | null {
    // 提取文本内容
    const text = this.extractParagraphText(p);
    if (!text.trim()) {
      return null; // 跳过空段落
    }

    // 获取段落样式
    const styleId = p?.['w:pPr']?.['w:pStyle']?.['w:val'] || '';
    const styleName = styles[styleId] || styleId;

    // 确定元素类型
    let type: DocumentElement['type'] = 'paragraph';
    if (DocumentStructureParser.STYLE_TYPE_MAP[styleName]) {
      type = DocumentStructureParser.STYLE_TYPE_MAP[styleName] as DocumentElement['type'];
    } else if (DocumentStructureParser.STYLE_TYPE_MAP[styleId]) {
      type = DocumentStructureParser.STYLE_TYPE_MAP[styleId] as DocumentElement['type'];
    }

    // 检测列表
    const numPr = p?.['w:pPr']?.['w:numPr'];
    if (numPr) {
      type = 'list';
    }

    return {
      id: `element-${index}`,
      type,
      content: text,
      text: text,
      xpath: `/w:document/w:body/w:p[${index}]`,
      index,
      style: styleName || styleId,
    };
  }

  /**
   * 解析表格元素
   */
  private parseTable(tbl: any, index: number): DocumentElement | null {
    const rows = tbl?.['w:tr'] || [];
    const tableRows = Array.isArray(rows) ? rows : [rows];

    if (tableRows.length === 0) {
      return null;
    }

    // 解析所有行
    const parsedRows: TableRow[] = [];
    const headers: TableHeader[] = [];

    for (let rowIndex = 0; rowIndex < tableRows.length; rowIndex++) {
      const row = tableRows[rowIndex];
      const cells = row?.['w:tc'] || [];
      const tableCells = Array.isArray(cells) ? cells : [cells];

      const cellTexts: string[] = [];
      let rowHasPreserve = false;

      for (const cell of tableCells) {
        const cellText = this.extractParagraphText(cell);
        cellTexts.push(cellText.trim());

        // 检查是否有preserve属性
        if (this.elementHasPreserve(cell)) {
          rowHasPreserve = true;
        }
      }

      const isHeader = rowIndex === 0;

      // 第一行作为标题
      if (isHeader) {
        for (let i = 0; i < cellTexts.length; i++) {
          if (cellTexts[i]) {
            headers.push({ text: cellTexts[i], index: i });
          }
        }
      }

      parsedRows.push({
        cells: cellTexts,
        hasPreserve: rowHasPreserve,
        isHeader
      });
    }

    // 生成显示文本
    const headerText = headers.map(h => h.text).join(' | ');
    const dataRowTexts = parsedRows
      .filter(r => !r.isHeader)
      .map(r => r.cells.join(' | '));

    const allText = [...headers.map(h => h.text), ...dataRowTexts.flat()].join(' ');

    return {
      id: `element-${index}`,
      type: 'table',
      content: allText,
      text: `[表格] ${headerText}${dataRowTexts.length > 0 ? ` | ${dataRowTexts.length}行数据` : ''}`,
      xpath: `/w:document/w:body/w:tbl[${index}]`,
      index,
      attributes: {
        rows: String(tableRows.length),
        cols: String(headers.length),
        hasDataRows: String(dataRowTexts.length > 0),
      },
      tableHeaders: headers,
      tableRows: parsedRows,
      headerRow: headerText,
      dataRows: dataRowTexts.slice(0, 3), // 只显示前3行数据
    };
  }

  /**
   * 检查元素是否有preserve属性
   */
  private elementHasPreserve(element: any): boolean {
    try {
      const str = JSON.stringify(element);
      return str.includes('preserve');
    } catch {
      return false;
    }
  }

  /**
   * 提取段落中的文本
   */
  private extractParagraphText(element: any): string {
    const textParts: string[] = [];

    // 先检查是否有嵌套的段落（如表格单元格中的段落）
    const paragraphs = element?.['w:p'];
    if (paragraphs) {
      const pList = Array.isArray(paragraphs) ? paragraphs : [paragraphs];
      for (const p of pList) {
        textParts.push(this.extractRunsText(p));
      }
      return textParts.join(' ');
    }

    // 直接提取run中的文本
    return this.extractRunsText(element);
  }

  /**
   * 从run元素中提取文本
   */
  private extractRunsText(element: any): string {
    const textParts: string[] = [];

    const runs = element?.['w:r'] || [];
    const runList = Array.isArray(runs) ? runs : [runs];

    for (const run of runList) {
      const textNodes = run?.['w:t'] || [];
      const textList = Array.isArray(textNodes) ? textNodes : [textNodes];

      for (const t of textList) {
        if (typeof t === 'string') {
          textParts.push(t);
        } else if (t?.['_']) {
          // xml:space="preserve" 属性导致文本存储在 _ 中
          textParts.push(t['_']);
        } else if (t && typeof t === 'object') {
          // 尝试其他可能的文本存储位置
          const keys = Object.keys(t);
          for (const key of keys) {
            if (typeof t[key] === 'string') {
              textParts.push(t[key]);
            }
          }
        }
      }
    }

    return textParts.join('');
  }
}