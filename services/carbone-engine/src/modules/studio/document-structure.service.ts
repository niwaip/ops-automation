/**
 * Carbone Engine - Document Structure Parser
 * 解析Office文档的结构化元素（标题、段落、表格等）
 */

import { Injectable } from '@nestjs/common';
import JSZip from 'jszip';
// @ts-ignore - xml2js没有类型定义
import * as xml2js from 'xml2js';

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

    // 提取表格文本
    const textParts: string[] = [];
    for (const row of tableRows) {
      const cells = row?.['w:tc'] || [];
      const tableCells = Array.isArray(cells) ? cells : [cells];
      for (const cell of tableCells) {
        const cellText = this.extractParagraphText(cell);
        if (cellText.trim()) {
          textParts.push(cellText.trim());
        }
      }
    }

    const text = textParts.join(' | ');
    if (!text.trim()) {
      return null;
    }

    return {
      id: `element-${index}`,
      type: 'table',
      content: text,
      text: `[表格] ${text.substring(0, 100)}...`,
      xpath: `/w:document/w:body/w:tbl[${index}]`,
      index,
      attributes: {
        rows: String(tableRows.length),
      },
    };
  }

  /**
   * 提取段落中的文本
   */
  private extractParagraphText(element: any): string {
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
          textParts.push(t['_']);
        }
      }
    }

    return textParts.join('');
  }
}