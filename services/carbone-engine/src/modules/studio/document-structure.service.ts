/**
 * Carbone Engine - Document Structure Parser
 * 解析Office文档的结构化元素（标题、段落、表格等）
 */

import { Injectable } from '@nestjs/common';
import JSZip from 'jszip';
// @ts-ignore - xml2js没有类型定义
import * as xml2js from 'xml2js';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

export interface TableHeader {
  text: string;
  index: number;
}

export interface TableRow {
  cells: string[];
  hasPreserve: boolean;
  preserveType?: string;  // 'static' | 'loop' | 'variable'
  isHeader: boolean;
}

export interface PreserveMarker {
  type: 'static' | 'loop' | 'variable' | 'step-screenshot';
  text?: string;  // 如 '循环'、'### 自动化操作'等
  position?: number;
}

export interface DocumentElement {
  id: string;
  type: 'title' | 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'table' | 'list' | 'image' | 'chart' | 'textbox' | 'step-screenshot';
  content: string;
  text: string;
  xpath: string;
  index: number;
  style?: string;
  children?: DocumentElement[];
  attributes?: Record<string, string>;
  preserveMarker?: PreserveMarker;
  tableHeaders?: TableHeader[];
  tableRows?: TableRow[];
  headerRow?: string;
  dataRows?: string[];
  dataRowCount?: number;
  imageId?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageName?: string;
  altText?: string;
  combinedImage?: DocumentElement;
  stepNumber?: number;
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

  /**
   * 将模版配置应用到Word文档XML中
   * 在渲染前注入变量标记和循环标记
   */
  async applyConfigToDocx(buffer: Buffer, config: any): Promise<Buffer> {
    return this.parser.applyConfigToDocx(buffer, config);
  }
}

export class DocumentStructureParser {
  private xml2jsParser: xml2js.Parser;

  // Word命名空间
  private static readonly WORD_NS = {
    w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  };

  constructor() {
    this.xml2jsParser = new xml2js.Parser({
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

    const documentXml = await zip.file('word/document.xml')?.async('text');
    if (!documentXml) {
      throw new Error('Document.xml not found in DOCX');
    }

    const stylesXml = await zip.file('word/styles.xml')?.async('text');
    const styles = stylesXml ? await this.parseStyles(stylesXml) : {};

    // 使用DOMParser进行线性解析，确保与注入逻辑索引一致
    const doc = new DOMParser().parseFromString(documentXml, 'text/xml');
    const body = doc.getElementsByTagNameNS('*', 'body')[0];
    
    if (!body) {
      throw new Error('Document body not found');
    }

    const elements: DocumentElement[] = [];
    const rawElements = this.collectElements(body);

    rawElements.forEach((node, index) => {
      const localName = node.localName || node.tagName.split(':').pop();
      
      if (localName === 'p') {
        const text = this.getNodeText(node);
        if (text.trim()) {
          elements.push({
            id: `element-${index}`,
            type: 'paragraph',
            content: text,
            text: text,
            xpath: `/w:document/w:body/w:p[${index}]`,
            index: index,
          });
        }
      } else if (localName === 'tbl') {
        const rowNodes = node.getElementsByTagNameNS('*', 'tr');
        const headerText = rowNodes.length > 0 ? this.getNodeText(rowNodes[0]) : '';
        elements.push({
          id: `element-${index}`,
          type: 'table',
          content: '',
          text: `[表格] ${headerText.substring(0, 50)}...`,
          xpath: `/w:document/w:body/w:tbl[${index}]`,
          index: index,
          attributes: {
            rows: String(rowNodes.length)
          },
          headerRow: headerText,
          dataRowCount: Math.max(0, rowNodes.length - 1)
        });
      }
    });

    return {
      elements,
      styles,
      namespaces: DocumentStructureParser.WORD_NS,
    };
  }

  /**
   * 将模版配置应用到Word文档XML中
   */
  async applyConfigToDocx(buffer: Buffer, config: any): Promise<Buffer> {
    const zip = new JSZip();
    await zip.loadAsync(buffer);

    const documentXml = await zip.file('word/document.xml')?.async('text');
    if (!documentXml) return buffer;

    const doc = new DOMParser().parseFromString(documentXml, 'text/xml');
    const body = doc.getElementsByTagNameNS('*', 'body')[0];
    if (!body) return buffer;

    const elements = this.collectElements(body);

    // 1. 应用手动标记 (Markings)
    if (config.markings && Array.isArray(config.markings)) {
      for (const marking of config.markings) {
        const node = elements[marking.index];
        if (!node) continue;

        if (marking.type === 'param' && marking.path) {
          this.injectTextToElement(node, `{${marking.path}}`);
        } else if (marking.type === 'loop' && marking.path) {
          // 如果是段落循环，包装标记
          this.injectTextToElement(node, `{#${marking.path}}${this.getNodeText(node)}{/${marking.path}}`);
        }
      }
    }

    // 2. 应用表格循环 (Table Loops)
    if (config.tableLoops && Array.isArray(config.tableLoops)) {
      for (const tableLoop of config.tableLoops) {
        const table = elements[tableLoop.tableIndex];
        if (!table || (table.localName !== 'tbl' && table.tagName.split(':').pop() !== 'tbl')) continue;

        this.applyTableLoop(doc, table, tableLoop);
      }
    }

    const updatedXml = new XMLSerializer().serializeToString(doc);
    zip.file('word/document.xml', updatedXml);

    return zip.generateAsync({ type: 'nodebuffer' });
  }

  /**
   * 线性收集body下的直接子元素（段落和表格）
   */
  private collectElements(body: any): any[] {
    const elements: any[] = [];
    const children = body.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === 1) { // Element
        const localName = child.localName || child.tagName.split(':').pop();
        if (localName === 'p' || localName === 'tbl') {
          elements.push(child);
        }
      }
    }
    return elements;
  }

  /**
   * 在元素中注入文本标记
   */
  private injectTextToElement(element: any, text: string): void {
    const textNodes = element.getElementsByTagNameNS('*', 't');
    if (textNodes.length > 0) {
      // 清空现有文本并设置新文本
      const firstT = textNodes[0];
      while (firstT.firstChild) {
        firstT.removeChild(firstT.firstChild);
      }
      firstT.appendChild(element.ownerDocument.createTextNode(text));
      
      // 移除其他文本节点
      for (let i = 1; i < textNodes.length; i++) {
        const t = textNodes[i];
        if (t.parentNode) {
          t.parentNode.removeChild(t);
        }
      }
    }
  }

  /**
   * 处理表格循环注入
   */
  private applyTableLoop(doc: any, table: any, tableLoop: any): void {
    const rows = table.getElementsByTagNameNS('*', 'tr');
    if (rows.length < 2) return;

    // 假设第二行是数据行
    const dataRow = rows[1];
    const cells = dataRow.getElementsByTagNameNS('*', 'tc');
    if (cells.length === 0) return;

    // 注入开始标记
    const firstCell = cells[0];
    this.prefixTextToCell(firstCell, `{#${tableLoop.arrayPath}}`);

    // 注入结束标记
    const lastCell = cells[cells.length - 1];
    this.suffixTextToCell(lastCell, `{/${tableLoop.arrayPath}}`);

    // 处理列映射
    if (tableLoop.columnMappings && Array.isArray(tableLoop.columnMappings)) {
      for (const mapping of tableLoop.columnMappings) {
        if (mapping.columnIndex < cells.length && mapping.variablePath) {
          const cell = cells[mapping.columnIndex];
          this.injectTextToElement(cell, `{${mapping.variablePath}}`);
        }
      }
    }
  }

  private prefixTextToCell(cell: any, text: string): void {
    const firstT = cell.getElementsByTagNameNS('*', 't')[0];
    if (firstT) {
      const current = firstT.textContent || '';
      firstT.textContent = text + current;
    }
  }

  private suffixTextToCell(cell: any, text: string): void {
    const textNodes = cell.getElementsByTagNameNS('*', 't');
    const lastT = textNodes[textNodes.length - 1];
    if (lastT) {
      const current = lastT.textContent || '';
      lastT.textContent = current + text;
    }
  }

  private getNodeText(node: any): string {
    const textNodes = node.getElementsByTagNameNS('*', 't');
    let text = '';
    for (let i = 0; i < textNodes.length; i++) {
      text += textNodes[i].textContent || '';
    }
    return text;
  }

  private async parseStyles(stylesXml: string): Promise<Record<string, string>> {
    const styles: Record<string, string> = {};
    try {
      const result = await this.xml2jsParser.parseStringPromise(stylesXml);
      const styleList = result?.['w:styles']?.['w:style'] || [];
      for (const style of Array.isArray(styleList) ? styleList : [styleList]) {
        if (style?.['w:styleId']) {
          const styleId = style['w:styleId'];
          const name = style?.['w:name']?.['w:val'] || styleId;
          styles[styleId] = name;
        }
      }
    } catch (e) {}
    return styles;
  }
}
