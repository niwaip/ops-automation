import { Injectable, Logger } from '@nestjs/common';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import JSZip from 'jszip';
// @ts-ignore - xml2js has no bundled type declarations here.
import * as xml2js from 'xml2js';

export interface TableHeader {
  text: string;
  index: number;
}

export interface TableRow {
  cells: string[];
  hasPreserve: boolean;
  preserveType?: string;
  isHeader: boolean;
}

export interface PreserveMarker {
  type: 'static' | 'loop' | 'variable' | 'step-screenshot';
  text?: string;
  position?: number;
}

export interface DocumentElement {
  id: string;
  type:
    | 'title'
    | 'heading1'
    | 'heading2'
    | 'heading3'
    | 'paragraph'
    | 'table'
    | 'list'
    | 'image'
    | 'chart'
    | 'textbox'
    | 'step-screenshot';
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

  async parseDocx(buffer: Buffer): Promise<DocumentStructure> {
    return this.parser.parseDocx(buffer);
  }

  async applyConfigToDocx(buffer: Buffer, config: any): Promise<Buffer> {
    return this.parser.applyConfigToDocx(buffer, config);
  }
}

export class DocumentStructureParser {
  private xml2jsParser: xml2js.Parser;
  private readonly logger = new Logger(DocumentStructureParser.name);

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

  async parseDocx(buffer: Buffer): Promise<DocumentStructure> {
    const zip = new JSZip();
    await zip.loadAsync(buffer);

    const documentXml = await zip.file('word/document.xml')?.async('text');
    if (!documentXml) {
      throw new Error('Document.xml not found in DOCX');
    }

    const stylesXml = await zip.file('word/styles.xml')?.async('text');
    const styles = stylesXml ? await this.parseStyles(stylesXml) : {};

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
        const drawings = node.getElementsByTagNameNS('*', 'drawing');
        const hasImage = drawings.length > 0;
        const stepScreenshotPattern = /^Step\s+(\d+)[:：]\s*screenshot/i;
        const isStepScreenshotText = stepScreenshotPattern.test(text);

        if (text.trim() || hasImage) {
          const imageIds: string[] = [];
          if (hasImage) {
            const blips = node.getElementsByTagNameNS('*', 'blip');
            for (let i = 0; i < blips.length; i++) {
              const embed =
                blips[i].getAttribute('r:embed') ||
                blips[i].getAttributeNS(
                  'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
                  'embed'
                );
              if (embed) {
                imageIds.push(embed);
              }
            }
          }

          let elementType:
            | 'title'
            | 'heading1'
            | 'heading2'
            | 'heading3'
            | 'paragraph'
            | 'table'
            | 'list'
            | 'image'
            | 'chart'
            | 'textbox'
            | 'step-screenshot' = hasImage ? 'image' : 'paragraph';
          let stepNumber: number | undefined = undefined;
          let combinedImage: DocumentElement | undefined = undefined;

          if (isStepScreenshotText && !hasImage) {
            const match = text.match(stepScreenshotPattern);
            if (match) {
              stepNumber = parseInt(match[1], 10);
              const nextNode = rawElements[index + 1];
              if (nextNode) {
                const nextLocalName = nextNode.localName || nextNode.tagName.split(':').pop();
                if (nextLocalName === 'p') {
                  const nextDrawings = nextNode.getElementsByTagNameNS('*', 'drawing');
                  if (nextDrawings.length > 0) {
                    elementType = 'step-screenshot';
                    const nextBlips = nextNode.getElementsByTagNameNS('*', 'blip');
                    const nextImageId =
                      nextBlips.length > 0
                        ? nextBlips[0].getAttribute('r:embed') ||
                          nextBlips[0].getAttributeNS(
                            'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
                            'embed'
                          )
                        : '';
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
          } else if (hasImage && !text.trim()) {
            const prevNode = rawElements[index - 1];
            if (prevNode) {
              const prevLocalName = prevNode.localName || prevNode.tagName.split(':').pop();
              if (prevLocalName === 'p') {
                const prevText = this.getNodeText(prevNode);
                if (stepScreenshotPattern.test(prevText)) {
                  return;
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
            index,
            imageId: imageIds[0] || undefined,
            stepNumber,
            combinedImage,
          });
        }
      } else if (localName === 'tbl') {
        const rowNodes = node.getElementsByTagNameNS('*', 'tr');
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
          index,
          attributes: {
            rows: String(rowNodes.length),
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

  async applyConfigToDocx(buffer: Buffer, config: any): Promise<Buffer> {
    const zip = new JSZip();
    await zip.loadAsync(buffer);

    const documentXml = await zip.file('word/document.xml')?.async('text');
    if (!documentXml) {
      return buffer;
    }

    const doc = new DOMParser().parseFromString(documentXml, 'text/xml');
    const body = doc.getElementsByTagNameNS('*', 'body')[0];
    if (!body) {
      return buffer;
    }

    const elements = this.collectElements(body);
    const ignoredIndices = new Set<number>(config.ignoredElements || []);
    const groupLoopIndices = new Set<number>();

    if (config.elementGroups && typeof config.elementGroups === 'object') {
      for (const [groupId, indices] of Object.entries(config.elementGroups)) {
        const groupIndices = indices as number[];
        if (groupIndices.length === 0) {
          continue;
        }

        if (config.ignoredGroups && config.ignoredGroups.includes(groupId)) {
          groupIndices.forEach((idx: number) => ignoredIndices.add(idx));
          continue;
        }

        groupIndices.forEach((idx: number) => groupLoopIndices.add(idx));

        const firstIdx = Math.min(...groupIndices);
        const lastIdx = Math.max(...groupIndices);

        const firstNode = elements[firstIdx];
        const lastNode = elements[lastIdx];

        if (firstNode && lastNode) {
          const path = groupId.startsWith('#') ? groupId.substring(1) : groupId;
          this.prefixTextToElement(firstNode, `{#${path}}`);
          this.suffixTextToElement(lastNode, `{/${path}}`);
        }
      }
    }

    if (config.groupLoops && Array.isArray(config.groupLoops)) {
      for (const groupLoop of config.groupLoops) {
        const groupIndices = groupLoop.groupIndices;
        if (!groupIndices || groupIndices.length === 0) {
          continue;
        }

        groupIndices.forEach((idx: number) => groupLoopIndices.add(idx));

        const firstIdx = Math.min(...groupIndices);
        const lastIdx = Math.max(...groupIndices);

        const firstNode = elements[firstIdx];
        const lastNode = elements[lastIdx];

        if (firstNode && lastNode) {
          const arrayPath = groupLoop.arrayPath || 'd.items';

          this.prefixTextToElement(firstNode, `{#${arrayPath}}`);
          this.suffixTextToElement(lastNode, `{/${arrayPath}}`);

          if (groupLoop.textElement !== undefined) {
            const textNode = elements[groupLoop.textElement];
            if (textNode) {
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

    if (config.markings && Array.isArray(config.markings)) {
      for (const marking of config.markings) {
        if (ignoredIndices.has(marking.index)) {
          continue;
        }
        if (groupLoopIndices.has(marking.index)) {
          continue;
        }

        const node = elements[marking.index];
        if (!node) {
          continue;
        }

        if (marking.type === 'param' && marking.path) {
          this.injectTextToElement(node, `{${marking.path}}`);
        } else if (marking.type === 'loop' && marking.path) {
          this.injectTextToElement(
            node,
            `{#${marking.path}}${this.getNodeText(node)}{/${marking.path}}`
          );
        }
      }
    }

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
        if (ignoredIndices.has(mapping.index)) {
          continue;
        }

        const node = elements[mapping.index];
        if (!node) {
          continue;
        }
        if (this.shouldSkipProtectedTitleMapping(mapping, node, protectedTitleTexts)) {
          continue;
        }

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
        if (!node) {
          continue;
        }
        this.injectTextLinesToElement(node, texts);
        if (texts.length > 1) {
          this.logger.debug(
            `[DocumentStructure] merged variable mappings for index=${index}: ${texts.join(' | ')}`
          );
        }
      }
    }

    if (config.tableLoops && Array.isArray(config.tableLoops)) {
      for (const tableLoop of config.tableLoops) {
        if (ignoredIndices.has(tableLoop.tableIndex)) {
          continue;
        }

        const table = elements[tableLoop.tableIndex];
        if (!table) {
          continue;
        }
        const localName = table.localName || table.tagName.split(':').pop();
        if (localName !== 'tbl') {
          continue;
        }

        this.applyTableLoop(table, tableLoop);
      }
    }

    if (
      config.combinedVariables &&
      Array.isArray(config.combinedVariables) &&
      config.combinedVariables.length > 0
    ) {
      const stepPattern = /Step\s+(\d+)[:：]\s*screenshot/i;
      const screenshotPairs: {
        textIndex: number;
        imageIndex: number;
        textNode: any;
        imageNode: any;
      }[] = [];

      for (let i = 0; i < elements.length - 1; i++) {
        const node = elements[i];
        if (ignoredIndices.has(i)) {
          continue;
        }

        const text = this.getNodeText(node);
        const match = text.match(stepPattern);
        if (!match) {
          continue;
        }

        let nextIndex = i + 1;
        while (nextIndex < elements.length && ignoredIndices.has(nextIndex)) {
          nextIndex++;
        }

        const nextNode = elements[nextIndex];
        if (!nextNode) {
          continue;
        }

        if (this.isImageElement(nextNode)) {
          screenshotPairs.push({
            textIndex: i,
            imageIndex: nextIndex,
            textNode: node,
            imageNode: nextNode,
          });
        }
      }

      if (screenshotPairs.length > 0) {
        const templatePair = screenshotPairs[0];
        const firstConfigVar = config.combinedVariables[0];
        const imagePath = firstConfigVar.imagePath || 'd.steps[].screenshot';
        const textPath = imagePath.includes('.screenshot')
          ? imagePath.replace('.screenshot', '.description')
          : imagePath.replace('.url', '.description');

        this.injectTextToElement(templatePair.textNode, `{${textPath}}`);
        this.injectImageVariable(templatePair.imageNode, imagePath);

        const arrayPathMatch = imagePath.match(/^(d\.\w+)\[\]/);
        const arrayPath = arrayPathMatch ? arrayPathMatch[1] : 'd.steps';

        this.prefixTextToElement(templatePair.textNode, `{#${arrayPath}}`);
        this.suffixTextToElement(templatePair.imageNode, `{/${arrayPath}}`);

        for (let i = 1; i < screenshotPairs.length; i++) {
          const pair = screenshotPairs[i];
          ignoredIndices.add(pair.textIndex);
          ignoredIndices.add(pair.imageIndex);
        }
      }
    }

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

  private collectElements(body: any): any[] {
    const elements: any[] = [];
    const children = body.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === 1) {
        const localName = child.localName || child.tagName.split(':').pop();
        if (localName === 'p' || localName === 'tbl') {
          elements.push(child);
        }
      }
    }
    return elements;
  }

  private injectTextToElement(element: any, text: string): void {
    const textNodes = Array.from(element.getElementsByTagNameNS('*', 't'));
    if (textNodes.length > 0) {
      const firstT: any = textNodes[0];

      while (firstT.firstChild) {
        firstT.removeChild(firstT.firstChild);
      }
      firstT.appendChild(element.ownerDocument.createTextNode(text));
      firstT.setAttribute('xml:space', 'preserve');

      for (let i = 1; i < textNodes.length; i++) {
        const t: any = textNodes[i];
        if (t.parentNode) {
          t.parentNode.removeChild(t);
        }
      }
    } else {
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

  private applyTableLoop(table: any, tableLoop: any): void {
    const rowsArray: any[] = Array.from(table.getElementsByTagNameNS('*', 'tr'));
    if (rowsArray.length < 2) {
      return;
    }

    const dataRow = rowsArray[1];
    const cells = dataRow.getElementsByTagNameNS('*', 'tc');
    if (cells.length === 0) {
      return;
    }

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

    const firstCell = cells[0];
    this.prefixTextToCell(firstCell, `{#${tableLoop.arrayPath}}`);

    const lastCell = cells[cells.length - 1];
    this.suffixTextToCell(lastCell, `{/${tableLoop.arrayPath}}`);

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

  private isImageElement(element: any): boolean {
    const drawings = element.getElementsByTagNameNS('*', 'drawing');
    return drawings.length > 0;
  }

  private injectImageVariable(element: any, path: string): void {
    const drawings = element.getElementsByTagNameNS('*', 'drawing');
    if (drawings.length === 0) {
      return;
    }

    const blips = element.getElementsByTagNameNS('*', 'blip');
    let rId = '';
    if (blips.length > 0) {
      const blip = blips[0];
      rId =
        blip.getAttribute('r:embed') ||
        blip.getAttributeNS(
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
          'embed'
        ) ||
        '';
    }

    const tag = rId ? `{${path}:formatImage(${rId})}` : `{${path}}`;

    const textNodes = Array.from(element.getElementsByTagNameNS('*', 't'));
    if (textNodes.length > 0) {
      const lastT: any = textNodes[textNodes.length - 1];
      const current = lastT.textContent || '';
      lastT.textContent = current + tag;
      lastT.setAttribute('xml:space', 'preserve');
    } else {
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

  private shouldSkipProtectedTitleMapping(
    mapping: any,
    node: any,
    protectedTitleTexts: Set<string>
  ): boolean {
    if (protectedTitleTexts.size === 0) {
      return false;
    }

    const normalizedPath = this.safeText(mapping?.path).toLowerCase();
    if (!/(^d\.title$|\.title$)/u.test(normalizedPath)) {
      return false;
    }

    const candidateTexts = [this.getNodeText(node), mapping?.sampleValue, mapping?.content]
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
