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

        // 检查段落中是否包含图片
        const drawings = node.getElementsByTagNameNS('*', 'drawing');
        const hasImage = drawings.length > 0;

        // 检测 Step X: screenshot 模式
        const stepScreenshotPattern = /^Step\s+(\d+)[:：]\s*screenshot/i;
        const isStepScreenshotText = stepScreenshotPattern.test(text);

        if (text.trim() || hasImage) {
          // 提取图片信息
          const imageIds: string[] = [];
          if (hasImage) {
            const blips = node.getElementsByTagNameNS('*', 'blip');
            for (let i = 0; i < blips.length; i++) {
              const embed = blips[i].getAttribute('r:embed') || blips[i].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
              if (embed) {
                imageIds.push(embed);
              }
            }
          }

          // 检测 step-screenshot 组合类型
          // "Step X: screenshot" 文本段落后面紧跟图片段落
          let elementType: 'title' | 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'table' | 'list' | 'image' | 'chart' | 'textbox' | 'step-screenshot' = hasImage ? 'image' : 'paragraph';
          let stepNumber: number | undefined = undefined;
          let combinedImage: DocumentElement | undefined = undefined;

          // 如果当前段落是 "Step X: screenshot" 文本（没有图片），检查下一个段落是否是图片
          if (isStepScreenshotText && !hasImage) {
            const match = text.match(stepScreenshotPattern);
            if (match) {
              stepNumber = parseInt(match[1], 10);
              // 检查下一个段落是否包含图片
              const nextNode = rawElements[index + 1];
              if (nextNode) {
                const nextLocalName = nextNode.localName || nextNode.tagName.split(':').pop();
                if (nextLocalName === 'p') {
                  const nextDrawings = nextNode.getElementsByTagNameNS('*', 'drawing');
                  if (nextDrawings.length > 0) {
                    // 这是一个 step-screenshot 组合元素（文本段落）
                    elementType = 'step-screenshot';
                    const nextBlips = nextNode.getElementsByTagNameNS('*', 'blip');
                    const nextImageId = nextBlips.length > 0 ?
                      (nextBlips[0].getAttribute('r:embed') || nextBlips[0].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed')) : '';
                    combinedImage = {
                      id: `image-${index + 1}`,
                      type: 'image',
                      content: '',
                      text: '[图片]',
                      xpath: `/w:document/w:body/w:p[${index + 1}]`,
                      index: index + 1,
                      imageId: nextImageId || undefined,
                    };
                  }
                }
              }
            }
          }
          // 如果当前段落是图片，且前一个段落是 "Step X: screenshot" 文本，标记为图片（已被前一个段落引用）
          else if (hasImage && !text.trim()) {
            const prevNode = rawElements[index - 1];
            if (prevNode) {
              const prevLocalName = prevNode.localName || prevNode.tagName.split(':').pop();
              if (prevLocalName === 'p') {
                const prevText = this.getNodeText(prevNode);
                if (stepScreenshotPattern.test(prevText)) {
                  // 这个图片段落已经被前一个 step-screenshot 元素引用，跳过
                  return; // 不添加为独立元素
                }
              }
            }
          }

          elements.push({
            id: `element-${index}`,
            type: elementType,
            content: text,
            text: hasImage ? `[图片] ${text}` : text,
            xpath: `/w:document/w:body/w:p[${index}]`,
            index: index,
            imageId: imageIds[0] || undefined,
            stepNumber: stepNumber,
            combinedImage: combinedImage,
          });
        }
      } else if (localName === 'tbl') {
        const rowNodes = node.getElementsByTagNameNS('*', 'tr');
        // 解析表头行，提取每列的文本
        const headerCells: string[] = [];
        if (rowNodes.length > 0) {
          const headerRow = rowNodes[0];
          const cells = headerRow.getElementsByTagNameNS('*', 'tc');
          for (let i = 0; i < cells.length; i++) {
            headerCells.push(this.getNodeText(cells[i]).trim());
          }
        }
        const headerText = headerCells.join(' | ');
        elements.push({
          id: `element-${index}`,
          type: 'table',
          content: '',
          text: `[表格] ${headerText.substring(0, 80)}...`,
          xpath: `/w:document/w:body/w:tbl[${index}]`,
          index: index,
          attributes: {
            rows: String(rowNodes.length)
          },
          headerRow: headerText,
          dataRowCount: Math.max(0, rowNodes.length - 1),
          tableHeaders: headerCells.map((text, i) => ({ text, index: i })),
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

    // 2. 应用变量映射 (Variable Mappings - AI生成)
    if (config.variableMappings && Array.isArray(config.variableMappings)) {
      for (const mapping of config.variableMappings) {
        const node = elements[mapping.index];
        if (!node) continue;

        // 检查是否是图片类型
        if (mapping.type === 'image' || this.isImageElement(node)) {
          this.injectImageVariable(node, mapping.path);
        } else if (mapping.path) {
          this.injectTextToElement(node, `{${mapping.path}}`);
        }
      }
    }

    // 3. 应用表格循环 (Table Loops)
    if (config.tableLoops && Array.isArray(config.tableLoops)) {
      for (const tableLoop of config.tableLoops) {
        const table = elements[tableLoop.tableIndex];
        if (!table || (table.localName !== 'tbl' && table.tagName.split(':').pop() !== 'tbl')) continue;

        this.applyTableLoop(doc, table, tableLoop);
      }
    }

    // 4. 应用组合变量 (Combined Variables - step-screenshot)
    // 处理 "Step X: screenshot" 类型的文本+图片组合
    // 文本段落和图片段落是两个独立的连续段落
    // 类似表格循环：只保留第一对作为模板，删除其他对，用循环包裹
    if (config.combinedVariables && Array.isArray(config.combinedVariables) && config.combinedVariables.length > 0) {
      const stepPattern = /Step\s+(\d+)[:：]\s*screenshot/i;

      // 找到所有 step-screenshot 对（文本段落索引 -> 图片段落索引）
      const screenshotPairs: { textIndex: number; imageIndex: number; textNode: any; imageNode: any }[] = [];

      for (let i = 0; i < elements.length; i++) {
        const node = elements[i];
        const localName = node.localName || node.tagName.split(':').pop();
        if (localName !== 'p') continue;

        const text = this.getNodeText(node);
        const match = text.match(stepPattern);
        if (!match) continue;

        // 找到下一个段落（应该是图片段落）
        const nextNode = elements[i + 1];
        if (!nextNode) continue;
        const nextLocalName = nextNode.localName || nextNode.tagName.split(':').pop();
        if (nextLocalName !== 'p') continue;

        // 检查下一个段落是否包含图片
        if (!this.isImageElement(nextNode)) continue;

        screenshotPairs.push({
          textIndex: i,
          imageIndex: i + 1,
          textNode: node,
          imageNode: nextNode
        });
      }

      // 如果找到了截图对，处理它们
      if (screenshotPairs.length > 0) {
        // 第一对作为模板
        const templatePair = screenshotPairs[0];

        // 替换文本段落为变量
        this.injectTextToElement(templatePair.textNode, `{d.screenshots[].description}`);

        // 替换图片段落为变量
        this.injectImageVariable(templatePair.imageNode, `d.screenshots[].url`);

        // 在文本段落前添加循环开始标记
        this.prefixTextToElement(templatePair.textNode, `{#d.screenshots}`);

        // 在图片段落后添加循环结束标记
        this.suffixTextToElement(templatePair.imageNode, `{/d.screenshots}`);

        // 删除其他截图对（从后往前删除，避免索引问题）
        for (let i = screenshotPairs.length - 1; i >= 1; i--) {
          const pair = screenshotPairs[i];
          // 先删除图片段落，再删除文本段落
          if (pair.imageNode.parentNode) {
            pair.imageNode.parentNode.removeChild(pair.imageNode);
          }
          if (pair.textNode.parentNode) {
            pair.textNode.parentNode.removeChild(pair.textNode);
          }
        }
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
   * 在元素文本前添加前缀
   */
  private prefixTextToElement(element: any, text: string): void {
    const textNodes = element.getElementsByTagNameNS('*', 't');
    if (textNodes.length > 0) {
      const firstT = textNodes[0];
      const current = firstT.textContent || '';
      firstT.textContent = text + current;
    }
  }

  /**
   * 在元素文本后添加后缀
   */
  private suffixTextToElement(element: any, text: string): void {
    const textNodes = element.getElementsByTagNameNS('*', 't');
    if (textNodes.length > 0) {
      const lastT = textNodes[textNodes.length - 1];
      const current = lastT.textContent || '';
      lastT.textContent = current + text;
    }
  }

  /**
   * 处理表格循环注入
   * 正确顺序：先替换单元格变量，再添加循环标记，最后删除多余数据行
   */
  private applyTableLoop(doc: any, table: any, tableLoop: any): void {
    const rows = table.getElementsByTagNameNS('*', 'tr');
    if (rows.length < 2) return;

    // 假设第二行是数据行（rows[0]是表头，rows[1]是模板行）
    const dataRow = rows[1];
    const cells = dataRow.getElementsByTagNameNS('*', 'tc');
    if (cells.length === 0) return;

    // 1. 先处理列映射 - 替换单元格内容为变量
    if (tableLoop.columnMappings && Array.isArray(tableLoop.columnMappings)) {
      for (let i = 0; i < tableLoop.columnMappings.length; i++) {
        const mapping = tableLoop.columnMappings[i];
        const columnIndex = mapping.columnIndex !== undefined ? mapping.columnIndex : i;
        if (columnIndex < cells.length && mapping.variablePath) {
          const cell = cells[columnIndex];
          // 替换单元格内容为变量标记
          this.injectTextToElement(cell, `{${mapping.variablePath}}`);
        }
      }
    }

    // 2. 然后在第一个单元格开头添加循环开始标记
    const firstCell = cells[0];
    this.prefixTextToCell(firstCell, `{#${tableLoop.arrayPath}}`);

    // 3. 在最后一个单元格末尾添加循环结束标记
    const lastCell = cells[cells.length - 1];
    this.suffixTextToCell(lastCell, `{/${tableLoop.arrayPath}}`);

    // 4. 删除多余的数据行（rows[2]及之后的所有行）
    // Carbone渲染时会根据数据数组长度自动复制模板行
    // 所以需要删除模板行之后的所有原始数据行
    const rowsToDelete: any[] = [];
    for (let i = 2; i < rows.length; i++) {
      rowsToDelete.push(rows[i]);
    }
    // 从后往前删除，避免索引问题
    for (let i = rowsToDelete.length - 1; i >= 0; i--) {
      const row = rowsToDelete[i];
      if (row.parentNode) {
        row.parentNode.removeChild(row);
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

  /**
   * 检查元素是否包含图片
   */
  private isImageElement(element: any): boolean {
    const drawings = element.getElementsByTagNameNS('*', 'drawing');
    return drawings.length > 0;
  }

  /**
   * 在图片元素中注入图片变量
   * Carbone格式：将图片的r:embed属性替换为变量标记
   */
  private injectImageVariable(element: any, path: string): void {
    const drawings = element.getElementsByTagNameNS('*', 'drawing');
    if (drawings.length === 0) return;

    // 找到blip元素（包含图片引用）
    const blips = element.getElementsByTagNameNS('*', 'blip');
    if (blips.length > 0) {
      const blip = blips[0];
      // 获取当前的embed属性
      const currentEmbed = blip.getAttribute('r:embed') ||
        blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');

      if (currentEmbed) {
        // Carbone图片变量格式：使用特殊的图片标记
        // 实际渲染时需要替换图片的二进制数据
        // 这里我们保留原图片，但添加注释标记供后续处理
        // 更好的方式是在段落的文本部分添加变量标记，供渲染引擎识别
        const textNodes = element.getElementsByTagNameNS('*', 't');
        if (textNodes.length > 0) {
          // 在现有文本节点中添加变量标记
          const firstT = textNodes[0];
          const currentText = firstT.textContent || '';
          firstT.textContent = `{${path}:formatImage(${currentEmbed})}`;
        } else {
          // 如果没有文本节点，创建一个
          const doc = element.ownerDocument;
          const newRun = doc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:r');
          const newText = doc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t');
          newText.textContent = `{${path}}`;
          newRun.appendChild(newText);
          element.appendChild(newRun);
        }
      }
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
