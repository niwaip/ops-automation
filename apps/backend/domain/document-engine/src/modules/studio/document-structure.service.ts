/**
 * Carbone Engine - Document Structure Parser
 * 解析Office文档的结构化元素（标题、段落、表格等）
 */

import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(DocumentStructureParser.name);

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

    // 0. 处理忽略元素 (Ignored Elements)
    // 必须首先处理，否则会影响后续注入
    const ignoredIndices = new Set<number>(config.ignoredElements || []);

    // 收集所有在 elementGroups 中的索引，避免重复处理
    const groupLoopIndices = new Set<number>();

    // 1. 处理分组循环 (Element Groups / Group Loops)
    // 对应用户界面中的 "分组循环"
    if (config.elementGroups && typeof config.elementGroups === 'object') {
      for (const [groupId, indices] of Object.entries(config.elementGroups)) {
        const groupIndices = indices as number[];
        if (groupIndices.length === 0) continue;

        // 检查该分组是否被忽略
        if (config.ignoredGroups && config.ignoredGroups.includes(groupId)) {
          groupIndices.forEach((idx: number) => ignoredIndices.add(idx));
          continue;
        }

        // 记录这些索引属于分组循环
        groupIndices.forEach((idx: number) => groupLoopIndices.add(idx));

        const firstIdx = Math.min(...groupIndices);
        const lastIdx = Math.max(...groupIndices);

        const firstNode = elements[firstIdx];
        const lastNode = elements[lastIdx];

        if (firstNode && lastNode) {
          // 注入循环开始标记，使用分组ID作为路径（去掉#前缀如果存在）
          const path = groupId.startsWith('#') ? groupId.substring(1) : groupId;
          this.prefixTextToElement(firstNode, `{#${path}}`);
          this.suffixTextToElement(lastNode, `{/${path}}`);
        }
      }
    }

    // 1.5 处理AI生成的分组循环 (Group Loops from AI config)
    // 这是AI根据用户分组标记生成的循环配置，使用正确的数组路径
    if (config.groupLoops && Array.isArray(config.groupLoops)) {
      for (const groupLoop of config.groupLoops) {
        const groupIndices = groupLoop.groupIndices;
        if (!groupIndices || groupIndices.length === 0) continue;

        // 记录这些索引属于分组循环
        groupIndices.forEach((idx: number) => groupLoopIndices.add(idx));

        const firstIdx = Math.min(...groupIndices);
        const lastIdx = Math.max(...groupIndices);

        const firstNode = elements[firstIdx];
        const lastNode = elements[lastIdx];

        if (firstNode && lastNode) {
          const arrayPath = groupLoop.arrayPath || 'd.items';

          // 在第一个元素前添加循环开始标记
          this.prefixTextToElement(firstNode, `{#${arrayPath}}`);

          // 在最后一个元素后添加循环结束标记
          this.suffixTextToElement(lastNode, `{/${arrayPath}}`);

          // 如果指定了文本元素和图片元素，注入变量
          if (groupLoop.textElement !== undefined) {
            const textNode = elements[groupLoop.textElement];
            if (textNode) {
              // 尝试推导文本路径
              const textPath = arrayPath.replace('d.', 'd.[].') + '.description';
              // 简化路径：d.steps[].description -> d.steps[].description
              const simpleTextPath = `${arrayPath}[].description`;
              this.injectTextToElement(textNode, `{${simpleTextPath}}`);
            }
          }

          if (groupLoop.imageElement !== undefined) {
            const imageNode = elements[groupLoop.imageElement];
            if (imageNode && this.isImageElement(imageNode)) {
              const imagePath = `${arrayPath}[].screenshot`;
              this.injectImageVariable(imageNode, imagePath);
            }
          }
        }
      }
    }

    // 2. 应用标记 (Markings - 手动标记)
    if (config.markings && Array.isArray(config.markings)) {
      for (const marking of config.markings) {
        if (ignoredIndices.has(marking.index)) continue;
        // 跳过已经在分组循环中的元素，避免重复标记
        if (groupLoopIndices.has(marking.index)) continue;

        const node = elements[marking.index];
        if (!node) continue;

        if (marking.type === 'param' && marking.path) {
          this.injectTextToElement(node, `{${marking.path}}`);
        } else if (marking.type === 'loop' && marking.path) {
          // 单个元素的段落循环
          this.injectTextToElement(node, `{#${marking.path}}${this.getNodeText(node)}{/${marking.path}}`);
        }
      }
    }

    // 3. 应用变量映射 (Variable Mappings - AI生成)
    const variableMappings = Array.isArray(config.variableMappings)
      ? config.variableMappings
      : Array.isArray(config.mappings)
        ? config.mappings
        : [];
    if (variableMappings.length > 0) {
      const protectedTitleTexts = new Set<string>(
        (Array.isArray(config.staticElements) ? config.staticElements : [])
          .filter((item: any) => this.safeText(item?.type) === 'title')
          .map((item: any) => this.safeText(item?.content))
          .filter(Boolean)
      );
      const groupedTextMappings = new Map<number, string[]>();

      for (const mapping of variableMappings) {
        if (ignoredIndices.has(mapping.index)) continue;
        
        const node = elements[mapping.index];
        if (!node) continue;
        if (this.shouldSkipProtectedTitleMapping(mapping, node, protectedTitleTexts)) continue;

        if (mapping.type === 'image' || this.isImageElement(node)) {
          this.injectImageVariable(node, mapping.path);
        } else if (mapping.path) {
          const textMappings = groupedTextMappings.get(mapping.index) || [];
          textMappings.push(`{${mapping.path}}`);
          groupedTextMappings.set(mapping.index, textMappings);
        }
      }

      for (const [index, texts] of groupedTextMappings.entries()) {
        const node = elements[index];
        if (!node) continue;
        this.injectTextLinesToElement(node, texts);
        if (texts.length > 1) {
          this.logger.debug(
            `[DocumentStructure] merged variable mappings for index=${index}: ${texts.join(' | ')}`,
          );
        }
      }
    }

    // 4. 应用表格循环 (Table Loops)
    if (config.tableLoops && Array.isArray(config.tableLoops)) {
      for (const tableLoop of config.tableLoops) {
        if (ignoredIndices.has(tableLoop.tableIndex)) continue;
        
        const table = elements[tableLoop.tableIndex];
        if (!table) continue;
        const localName = table.localName || table.tagName.split(':').pop();
        if (localName !== 'tbl') continue;

        this.applyTableLoop(table, tableLoop);
      }
    }

    // 5. 应用组合变量 (Combined Variables - step-screenshot)
    // 处理 "Step X: screenshot" 类型的文本+图片组合
    if (config.combinedVariables && Array.isArray(config.combinedVariables) && config.combinedVariables.length > 0) {
      const stepPattern = /Step\s+(\d+)[:：]\s*screenshot/i;

      // 找到所有 step-screenshot 对（文本段落索引 -> 图片段落索引）
      const screenshotPairs: { textIndex: number; imageIndex: number; textNode: any; imageNode: any }[] = [];

      for (let i = 0; i < elements.length - 1; i++) {
        const node = elements[i];
        if (ignoredIndices.has(i)) continue;

        const text = this.getNodeText(node);
        const match = text.match(stepPattern);
        if (!match) continue;

        // 找到下一个段落（应该是图片段落）
        let nextIndex = i + 1;
        while (nextIndex < elements.length && ignoredIndices.has(nextIndex)) {
          nextIndex++;
        }
        
        const nextNode = elements[nextIndex];
        if (!nextNode) continue;

        // 检查下一个元素是否包含图片
        if (this.isImageElement(nextNode)) {
          screenshotPairs.push({
            textIndex: i,
            imageIndex: nextIndex,
            textNode: node,
            imageNode: nextNode
          });
        }
      }

      // 如果找到了截图对，处理它们
      if (screenshotPairs.length > 0) {
        // 第一对作为模版
        const templatePair = screenshotPairs[0];

        // 获取路径
        const firstConfigVar = config.combinedVariables[0];
        const imagePath = firstConfigVar.imagePath || 'd.steps[].screenshot';
        // 尝试推导文本路径：将 .screenshot 替换为 .description 或使用 textContent
        const textPath = imagePath.includes('.screenshot') ? 
                         imagePath.replace('.screenshot', '.description') : 
                         imagePath.replace('.url', '.description');

        // 替换文本段落为变量
        this.injectTextToElement(templatePair.textNode, `{${textPath}}`);

        // 替换图片段落为变量
        this.injectImageVariable(templatePair.imageNode, imagePath);

        // 提取数组路径进行循环
        const arrayPathMatch = imagePath.match(/^(d\.\w+)\[\]/);
        const arrayPath = arrayPathMatch ? arrayPathMatch[1] : 'd.steps';

        // 在文本段落前添加循环开始标记
        this.prefixTextToElement(templatePair.textNode, `{#${arrayPath}}`);

        // 在图片段落后添加循环结束标记
        this.suffixTextToElement(templatePair.imageNode, `{/${arrayPath}}`);

        // 将其他对标记为忽略（稍后删除）
        for (let i = 1; i < screenshotPairs.length; i++) {
          const pair = screenshotPairs[i];
          ignoredIndices.add(pair.textIndex);
          ignoredIndices.add(pair.imageIndex);
        }
      }
    }

    // 6. 物理删除被忽略的元素
    // 从后往前删，避免索引偏移
    const sortedIgnored = Array.from(ignoredIndices).sort((a, b) => b - a);
    for (const idx of sortedIgnored) {
      const node = elements[idx];
      if (node && node.parentNode) {
        node.parentNode.removeChild(node);
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
    const textNodes = Array.from(element.getElementsByTagNameNS('*', 't'));
    if (textNodes.length > 0) {
      // 获取第一个文本节点
      const firstT: any = textNodes[0];
      
      // 清空第一个节点的内容并设置新文本
      while (firstT.firstChild) {
        firstT.removeChild(firstT.firstChild);
      }
      firstT.appendChild(element.ownerDocument.createTextNode(text));
      
      // 确保保留空格
      firstT.setAttribute('xml:space', 'preserve');

      // 移除其他所有文本节点
      for (let i = 1; i < textNodes.length; i++) {
        const t: any = textNodes[i];
        if (t.parentNode) {
          t.parentNode.removeChild(t);
        }
      }
    } else {
      // 如果没有文本节点，尝试创建一个新运行(r)和文本节点(t)
      const doc = element.ownerDocument;
      const wNS = DocumentStructureParser.WORD_NS.w;
      const r = doc.createElementNS(wNS, 'w:r');
      const t = doc.createElementNS(wNS, 'w:t');
      t.setAttribute('xml:space', 'preserve');
      t.appendChild(doc.createTextNode(text));
      r.appendChild(t);
      element.appendChild(r);
    }
  }

  private injectTextLinesToElement(element: any, texts: string[]): void {
    const lines = texts.map((text) => this.safeText(text)).filter(Boolean);
    if (lines.length === 0) {
      return;
    }

    if (lines.length === 1) {
      this.injectTextToElement(element, lines[0]);
      return;
    }

    const textNodes = Array.from(element.getElementsByTagNameNS('*', 't'));
    if (textNodes.length === 0) {
      this.injectTextToElement(element, lines.join('\n'));
      return;
    }

    const firstT: any = textNodes[0];
    while (firstT.firstChild) {
      firstT.removeChild(firstT.firstChild);
    }
    firstT.appendChild(element.ownerDocument.createTextNode(lines[0]));
    firstT.setAttribute('xml:space', 'preserve');

    for (let i = 1; i < textNodes.length; i++) {
      const t: any = textNodes[i];
      if (t.parentNode) {
        t.parentNode.removeChild(t);
      }
    }

    const doc = element.ownerDocument;
    const wNS = DocumentStructureParser.WORD_NS.w;
    const baseRun = firstT.parentNode;
    const paragraph = baseRun?.parentNode;

    if (!paragraph) {
      this.injectTextToElement(element, lines.join('\n'));
      return;
    }

    for (let i = 1; i < lines.length; i++) {
      const run = doc.createElementNS(wNS, 'w:r');
      const lineBreak = doc.createElementNS(wNS, 'w:br');
      const textNode = doc.createElementNS(wNS, 'w:t');
      textNode.setAttribute('xml:space', 'preserve');
      textNode.appendChild(doc.createTextNode(lines[i]));
      run.appendChild(lineBreak);
      run.appendChild(textNode);
      paragraph.appendChild(run);
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
      firstT.setAttribute('xml:space', 'preserve');
    } else {
      this.injectTextToElement(element, text);
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
      lastT.setAttribute('xml:space', 'preserve');
    } else {
      this.injectTextToElement(element, text);
    }
  }

  /**
   * 处理表格循环注入
   * 正确顺序：先替换单元格变量，再添加循环标记，最后删除多余数据行
   */
  private applyTableLoop(table: any, tableLoop: any): void {
    // 获取所有行 - 使用静态数组避免live collection问题
    const rowsArray: any[] = Array.from(table.getElementsByTagNameNS('*', 'tr'));
    if (rowsArray.length < 2) return;

    // 假设第二行是数据行（rows[0]是表头，rows[1]是模板行）
    const dataRow = rowsArray[1];
    const cells = dataRow.getElementsByTagNameNS('*', 'tc');
    if (cells.length === 0) return;

    // 1. 先处理列映射 - 保留单元格原文本，在新行追加变量
    if (tableLoop.columnMappings && Array.isArray(tableLoop.columnMappings)) {
      const columnTexts = new Map<number, string[]>();
      for (let i = 0; i < tableLoop.columnMappings.length; i++) {
        const mapping = tableLoop.columnMappings[i];
        const columnIndex = mapping.columnIndex !== undefined ? mapping.columnIndex : i;
        if (columnIndex >= cells.length || !mapping.variablePath) {
          continue;
        }
        const texts = columnTexts.get(columnIndex) || [];
        texts.push(`{${mapping.variablePath}}`);
        columnTexts.set(columnIndex, texts);
      }

      for (const [columnIndex, texts] of columnTexts.entries()) {
        const cell = cells[columnIndex];
        this.appendTextLinesToCell(cell, texts);
      }
    }

    // 2. 然后在第一个单元格开头添加循环开始标记
    const firstCell = cells[0];
    this.prefixTextToCell(firstCell, `{#${tableLoop.arrayPath}}`);

    // 3. 在最后一个单元格末尾添加循环结束标记
    const lastCell = cells[cells.length - 1];
    this.suffixTextToCell(lastCell, `{/${tableLoop.arrayPath}}`);

    // 4. 删除多余的数据行（rowsArray[2]及之后的所有行）
    // Carbone渲染时会根据数据数组长度自动复制模板行
    // 所以需要删除模板行之后的所有原始数据行
    // 从后往前删除，避免索引问题
    for (let i = rowsArray.length - 1; i >= 2; i--) {
      const row = rowsArray[i];
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
      firstT.setAttribute('xml:space', 'preserve');
    }
  }

  private suffixTextToCell(cell: any, text: string): void {
    const textNodes = cell.getElementsByTagNameNS('*', 't');
    const lastT = textNodes[textNodes.length - 1];
    if (lastT) {
      const current = lastT.textContent || '';
      lastT.textContent = current + text;
      lastT.setAttribute('xml:space', 'preserve');
    }
  }

  private appendTextLinesToCell(cell: any, texts: string[]): void {
    const lines = texts.map((text) => this.safeText(text)).filter(Boolean);
    if (lines.length === 0) {
      return;
    }

    const doc = cell.ownerDocument;
    const wNS = DocumentStructureParser.WORD_NS.w;
    const paragraphs: any[] = Array.from(cell.getElementsByTagNameNS('*', 'p'));
    let targetParagraph: any = paragraphs[paragraphs.length - 1];

    if (!targetParagraph) {
      targetParagraph = doc.createElementNS(wNS, 'w:p');
      cell.appendChild(targetParagraph);
    }

    let startIndex = 0;
    if (!this.safeText(this.getNodeText(cell))) {
      const firstRun = doc.createElementNS(wNS, 'w:r');
      const firstTextNode = doc.createElementNS(wNS, 'w:t');
      firstTextNode.setAttribute('xml:space', 'preserve');
      firstTextNode.appendChild(doc.createTextNode(lines[0]));
      firstRun.appendChild(firstTextNode);
      targetParagraph.appendChild(firstRun);
      startIndex = 1;
    }

    for (let i = startIndex; i < lines.length; i++) {
      const run = doc.createElementNS(wNS, 'w:r');
      const lineBreak = doc.createElementNS(wNS, 'w:br');
      const textNode = doc.createElementNS(wNS, 'w:t');
      textNode.setAttribute('xml:space', 'preserve');
      textNode.appendChild(doc.createTextNode(lines[i]));

      run.appendChild(lineBreak);
      run.appendChild(textNode);
      targetParagraph.appendChild(run);
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
   * Carbone格式：{d.path:formatImage(rId)}
   */
  private injectImageVariable(element: any, path: string): void {
    const drawings = element.getElementsByTagNameNS('*', 'drawing');
    if (drawings.length === 0) return;

    // 找到blip元素获取其r:embed属性
    const blips = element.getElementsByTagNameNS('*', 'blip');
    let rId = '';
    if (blips.length > 0) {
      const blip = blips[0];
      rId = blip.getAttribute('r:embed') ||
            blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') || '';
    }

    // Carbone渲染图片通常需要在同一段落有一个包含变量的文本节点
    // 格式为 {d.path:formatImage(rId)}
    const tag = rId ? `{${path}:formatImage(${rId})}` : `{${path}}`;

    const textNodes = Array.from(element.getElementsByTagNameNS('*', 't'));
    if (textNodes.length > 0) {
      // 如果已有文本节点，追加标记
      const lastT: any = textNodes[textNodes.length - 1];
      const current = lastT.textContent || '';
      lastT.textContent = current + tag;
      lastT.setAttribute('xml:space', 'preserve');
    } else {
      // 否则，创建一个新运行(r)和文本节点(t)来放置标记
      const doc = element.ownerDocument;
      const wNS = DocumentStructureParser.WORD_NS.w;
      const r = doc.createElementNS(wNS, 'w:r');
      const t = doc.createElementNS(wNS, 'w:t');
      t.setAttribute('xml:space', 'preserve');
      t.appendChild(doc.createTextNode(tag));
      r.appendChild(t);
      element.appendChild(r);
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

  private shouldSkipProtectedTitleMapping(mapping: any, node: any, protectedTitleTexts: Set<string>): boolean {
    if (protectedTitleTexts.size === 0) {
      return false;
    }

    const normalizedPath = this.safeText(mapping?.path).toLowerCase();
    if (!/(^d\.title$|\.title$)/u.test(normalizedPath)) {
      return false;
    }

    const candidateTexts = [
      this.getNodeText(node),
      mapping?.sampleValue,
      mapping?.content,
    ]
      .map((value) => this.safeText(value))
      .filter(Boolean);

    return candidateTexts.some((text) => protectedTitleTexts.has(text));
  }

  private safeText(value: any): string {
    return String(value ?? '').trim();
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
