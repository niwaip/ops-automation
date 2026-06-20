/**
 * Carbone Engine - File Handler
 * 处理Office Open XML文件的ZIP结构
 */

import JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';
import { Parser, ParsedTemplate } from './parser';
import { Builder, BuildResult } from './builder';
import { XmlPreprocessor } from './xml-preprocessor';

export interface TemplateInfo {
  format: 'docx' | 'xlsx' | 'pptx' | 'html';
  fileName: string;
  size: number;
  variables: string[];
  loops: Array<{ arrayPath: string }>;
}

export interface OfficeDocumentStructure {
  contentTypes: string;
  mainDocument: string;
  worksheets?: string[];
  slides?: string[];
  styles?: string;
  headers?: string[];
  footers?: string[];
}

export interface ImageRelationship {
  rId: string;
  target: string; // 如 word/media/image1.png
  type: string; // 如 http://schemas.openxmlformats.org/officeDocument/2006/relationships/image
}

export interface ImageInfo {
  fileName: string;
  extension: string;
  contentType: string;
  width?: number;
  height?: number;
}

interface WorksheetRenderContext {
  numericColumns: Set<string>;
  headerLabels: Map<string, string>;
}

export class FileHandler {
  private parser: Parser;
  private builder: Builder;
  private preprocessor: XmlPreprocessor;

  constructor() {
    this.parser = new Parser();
    this.builder = new Builder();
    this.preprocessor = new XmlPreprocessor();
  }

  /**
   * 根据文件扩展名确定文档格式
   */
  getFormat(fileName: string): 'docx' | 'xlsx' | 'pptx' | 'html' {
    const ext = path.extname(fileName).toLowerCase();
    switch (ext) {
      case '.docx':
        return 'docx';
      case '.xlsx':
        return 'xlsx';
      case '.pptx':
        return 'pptx';
      case '.html':
      case '.htm':
        return 'html';
      default:
        throw new Error(`Unsupported file format: ${ext}`);
    }
  }

  /**
   * 获取Office文档的主XML文件路径
   */
  getMainDocumentPath(format: string): string {
    switch (format) {
      case 'docx':
        return 'word/document.xml';
      case 'xlsx':
        return 'xl/worksheets/sheet1.xml';
      case 'pptx':
        return 'ppt/slides/slide1.xml';
      default:
        return '';
    }
  }

  /**
   * 加载ZIP文件并解析结构
   */
  async loadZip(filePath: string): Promise<JSZip> {
    const buffer = fs.readFileSync(filePath);
    const zip = new JSZip();
    return zip.loadAsync(buffer);
  }

  /**
   * 从buffer加载ZIP
   */
  async loadZipFromBuffer(buffer: Buffer): Promise<JSZip> {
    const zip = new JSZip();
    return zip.loadAsync(buffer);
  }

  /**
   * 获取ZIP中的特定文件内容
   */
  async getFileContent(zip: JSZip, filePath: string): Promise<string> {
    const file = zip.file(filePath);
    if (!file) {
      throw new Error(`File not found in ZIP: ${filePath}`);
    }
    return file.async('text');
  }

  /**
   * 获取ZIP中的特定文件内容（可选）
   */
  async getOptionalFileContent(zip: JSZip, filePath: string): Promise<string | null> {
    const file = zip.file(filePath);
    if (!file) {
      return null;
    }
    return file.async('text');
  }

  /**
   * 设置ZIP中的文件内容
   */
  setFileContent(zip: JSZip, filePath: string, content: string): void {
    zip.file(filePath, content);
  }

  /**
   * 解析模板文件，提取变量信息
   */
  async parseTemplate(filePath: string): Promise<TemplateInfo> {
    const format = this.getFormat(filePath);
    const zip = await this.loadZip(filePath);
    const fileName = path.basename(filePath);
    const size = fs.statSync(filePath).size;

    // 获取主文档内容
    const mainDocPath = this.getMainDocumentPath(format);
    const mainXml = await this.getFileContent(zip, mainDocPath);

    // 解析变量和循环
    const parsed = this.parser.parse(mainXml);

    return {
      format,
      fileName,
      size,
      variables: parsed.variables,
      loops: parsed.loops.map((l) => ({ arrayPath: l.arrayPath })),
    };
  }

  /**
   * 解析模板buffer
   */
  async parseTemplateBuffer(buffer: Buffer, fileName: string): Promise<TemplateInfo> {
    const format = this.getFormat(fileName);
    const zip = await this.loadZipFromBuffer(buffer);

    const mainDocPath = this.getMainDocumentPath(format);
    const mainXml = await this.getFileContent(zip, mainDocPath);

    const parsed = this.parser.parse(mainXml);

    return {
      format,
      fileName,
      size: buffer.length,
      variables: parsed.variables,
      loops: parsed.loops.map((l) => ({ arrayPath: l.arrayPath })),
    };
  }

  /**
   * 渲染模板并生成文档
   */
  async renderTemplate(templateBuffer: Buffer, data: any, fileName: string): Promise<Buffer> {
    const format = this.getFormat(fileName);
    const zip = await this.loadZipFromBuffer(templateBuffer);
    const originalSharedStringsXml =
      format === 'xlsx' ? await this.getOptionalFileContent(zip, 'xl/sharedStrings.xml') : null;

    // 获取所有需要处理的XML文件
    const xmlFiles = this.getXmlFilesToProcess(zip, format);

    for (const xmlPath of xmlFiles) {
      const xml = await this.getFileContent(zip, xmlPath);

      // 预处理XML（扁平化被拆分的文本节点）
      const { xml: processedXml, issues } = this.preprocessor.process(xml);

      // 记录预处理问题（如果有）
      if (issues.length > 0) {
        console.warn(`Preprocessing issues in ${xmlPath}:`, issues);
      }

      const result = this.builder.buildXML(processedXml, data);
      this.setFileContent(zip, xmlPath, result.xml);
    }

    // 处理sharedStrings（Excel特有）
    if (format === 'xlsx') {
      await this.processSharedStrings(zip, data);
      if (originalSharedStringsXml) {
        await this.expandSharedStringLoopRows(zip, data, originalSharedStringsXml);
      }
    }

    // 处理图片替换
    await this.processMediaFiles(zip, data, format);

    // 生成输出ZIP
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  /**
   * 获取需要处理的XML文件列表
   */
  private getXmlFilesToProcess(zip: JSZip, format: string): string[] {
    const files: string[] = [];

    switch (format) {
      case 'docx':
        files.push('word/document.xml');

        // 处理headers和footers
        const headerFiles = zip.file(/word\/header\d+\.xml/);
        const footerFiles = zip.file(/word\/footer\d+\.xml/);
        headerFiles.forEach((f) => files.push(f.name));
        footerFiles.forEach((f) => files.push(f.name));

        // 处理脚注和尾注
        const footnotesFile = zip.file('word/footnotes.xml');
        const endnotesFile = zip.file('word/endnotes.xml');
        if (footnotesFile) files.push('word/footnotes.xml');
        if (endnotesFile) files.push('word/endnotes.xml');

        // 处理批注
        const commentsFile = zip.file('word/comments.xml');
        if (commentsFile) files.push('word/comments.xml');

        // 处理图表数据
        const chartFiles = zip.file(/word\/charts\/chart\d+\.xml/);
        chartFiles.forEach((f) => files.push(f.name));

        // 处理文本框和其他drawing元素
        const drawingFiles = zip.file(/word\/drawings\/drawing\d+\.xml/);
        drawingFiles.forEach((f) => files.push(f.name));
        break;

      case 'xlsx':
        // 处理所有工作表
        const sheetFiles = zip.file(/xl\/worksheets\/sheet\d+\.xml/);
        sheetFiles.forEach((f) => files.push(f.name));

        // 处理图表
        const xlsxChartFiles = zip.file(/xl\/charts\/chart\d+\.xml/);
        xlsxChartFiles.forEach((f) => files.push(f.name));
        break;

      case 'pptx':
        // 处理所有幻灯片
        const slideFiles = zip.file(/ppt\/slides\/slide\d+\.xml/);
        slideFiles.forEach((f) => files.push(f.name));

        // 处理幻灯片布局
        const slideLayoutFiles = zip.file(/ppt\/slideLayouts\/slideLayout\d+\.xml/);
        slideLayoutFiles.forEach((f) => files.push(f.name));

        // 处理图表
        const pptxChartFiles = zip.file(/ppt\/charts\/chart\d+\.xml/);
        pptxChartFiles.forEach((f) => files.push(f.name));
        break;

      case 'html':
        // HTML直接处理整个文件
        const htmlFile = zip.file(/\.html$/);
        if (htmlFile.length > 0) {
          files.push(htmlFile[0].name);
        }
        break;
    }

    return files;
  }

  /**
   * 处理Excel的sharedStrings.xml
   */
  private async processSharedStrings(zip: JSZip, data: any): Promise<void> {
    const sharedStringsPath = 'xl/sharedStrings.xml';
    const sharedStringsFile = zip.file(sharedStringsPath);

    if (sharedStringsFile) {
      const xml = await sharedStringsFile.async('text');
      const { xml: processedXml } = this.preprocessor.process(xml);
      // Keep loop markers in-place so worksheet sharedString indexes stay stable.
      const result = this.builder.buildXML(processedXml, data, { skipLoops: true });
      this.setFileContent(zip, sharedStringsPath, result.xml);
    }
  }

  /**
   * 对于将循环标记放在 sharedStrings 中的 Excel 模板，
   * 需要在工作表层面把后续空白行绑定到新增的 shared string 索引。
   */
  private async expandSharedStringLoopRows(
    zip: JSZip,
    data: any,
    originalSharedStringsXml: string
  ): Promise<void> {
    const renderedSharedStringsXml = await this.getOptionalFileContent(zip, 'xl/sharedStrings.xml');
    if (!renderedSharedStringsXml) {
      return;
    }

    const originalStrings = this.extractSharedStringTexts(originalSharedStringsXml);
    const sharedStringDocument = this.parseSharedStringDocument(renderedSharedStringsXml);
    const sheetFiles = zip.file(/xl\/worksheets\/sheet\d+\.xml/);
    const sheetExpansions = new Map<
      string,
      Array<{ startRow: number; oldEndRow: number; newEndRow: number; delta: number }>
    >();

    for (const sheetFile of sheetFiles) {
      const originalSheetXml = await sheetFile.async('text');
      const { xml: expandedSheetXml, expansions } = this.expandWorksheetSharedStringLoops(
        originalSheetXml,
        originalStrings,
        sharedStringDocument,
        data
      );
      if (expandedSheetXml !== originalSheetXml) {
        zip.file(sheetFile.name, expandedSheetXml);
      }
      if (expansions.length > 0) {
        sheetExpansions.set(sheetFile.name, expansions);
      }
    }

    zip.file('xl/sharedStrings.xml', this.buildSharedStringDocument(sharedStringDocument));
    await this.updateWorksheetTables(zip, sheetExpansions);
    await this.enableWorkbookRecalculation(zip);
  }

  private extractSharedStringTexts(xml: string): string[] {
    const values: string[] = [];
    const regex = /<si\b[\s\S]*?<\/si>/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(xml)) !== null) {
      const siXml = match[0];
      const text = Array.from(siXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
        .map((item) => item[1])
        .join('');
      values.push(text);
    }

    return values;
  }

  private parseSharedStringDocument(xml: string): {
    prefix: string;
    suffix: string;
    entries: string[];
    values: string[];
  } {
    const firstSi = xml.indexOf('<si');
    const lastSi = xml.lastIndexOf('</si>');
    if (firstSi < 0 || lastSi < 0) {
      return { prefix: xml, suffix: '', entries: [], values: [] };
    }

    const prefix = xml.slice(0, firstSi);
    const suffix = xml.slice(lastSi + '</si>'.length);
    const entries = Array.from(xml.matchAll(/<si\b[\s\S]*?<\/si>/g)).map((match) => match[0]);
    const values = entries.map((entry) =>
      Array.from(entry.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
        .map((item) => item[1])
        .join('')
    );

    return { prefix, suffix, entries, values };
  }

  private buildSharedStringDocument(document: {
    prefix: string;
    suffix: string;
    entries: string[];
    values: string[];
  }): string {
    const count = document.entries.length;
    const prefix = document.prefix
      .replace(/\bcount="(\d+)"/, `count="${count}"`)
      .replace(/\buniqueCount="(\d+)"/, `uniqueCount="${count}"`);
    return `${prefix}${document.entries.join('')}${document.suffix}`;
  }

  private expandWorksheetSharedStringLoops(
    sheetXml: string,
    originalStrings: string[],
    sharedStringDocument: { prefix: string; suffix: string; entries: string[]; values: string[] },
    data: any
  ): {
    xml: string;
    expansions: Array<{ startRow: number; oldEndRow: number; newEndRow: number; delta: number }>;
  } {
    const sheetDataMatch = sheetXml.match(/<sheetData>([\s\S]*?)<\/sheetData>/);
    if (!sheetDataMatch) {
      return { xml: sheetXml, expansions: [] };
    }

    const rowRegex = /<row\b[^>]*r="(\d+)"[^>]*>[\s\S]*?<\/row>/g;
    const rows = Array.from(sheetDataMatch[1].matchAll(rowRegex)).map((match) => ({
      xml: match[0],
      rowNumber: parseInt(match[1], 10),
    }));

    if (rows.length === 0) {
      return { xml: sheetXml, expansions: [] };
    }

    const worksheetContext = this.buildWorksheetRenderContext(sheetDataMatch[1], originalStrings);
    const expansions: Array<{
      startRow: number;
      oldEndRow: number;
      newEndRow: number;
      delta: number;
    }> = [];
    const renderedRows: string[] = [];
    let rowOffset = 0;

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      const loopTemplate = this.detectLoopTemplateRow(row.xml, originalStrings, data);

      if (!loopTemplate) {
        renderedRows.push(this.shiftRowXml(row.xml, rowOffset, expansions));
        continue;
      }

      let placeholderCount = 0;
      while (rowIndex + placeholderCount + 1 < rows.length) {
        const nextRow = rows[rowIndex + placeholderCount + 1];
        if (!this.isBlankSharedStringPlaceholderRow(nextRow.xml)) {
          break;
        }
        placeholderCount++;
      }

      const capacity = 1 + placeholderCount;
      const extraRows = Math.max(0, loopTemplate.items.length - capacity);
      const oldEndRow = row.rowNumber + capacity - 1;
      const newEndRow = row.rowNumber + loopTemplate.items.length - 1;

      expansions.push({
        startRow: row.rowNumber,
        oldEndRow,
        newEndRow,
        delta: extraRows,
      });

      for (let itemIndex = 0; itemIndex < loopTemplate.items.length; itemIndex++) {
        renderedRows.push(
          this.renderLoopTemplateRow(
            row.xml,
            row.rowNumber + rowOffset + itemIndex,
            loopTemplate,
            itemIndex,
            sharedStringDocument,
            data,
            worksheetContext
          )
        );
      }

      for (let blankIndex = loopTemplate.items.length; blankIndex < capacity; blankIndex++) {
        const placeholderRow = rows[rowIndex + blankIndex];
        renderedRows.push(this.shiftRowXml(placeholderRow.xml, rowOffset, expansions));
      }

      rowIndex += placeholderCount;
      rowOffset += extraRows;
    }

    const updatedSheetData = `<sheetData>${renderedRows.join('')}</sheetData>`;
    let resultXml = sheetXml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, updatedSheetData);
    resultXml = this.updateWorksheetDimension(resultXml, renderedRows);
    resultXml = this.clearFormulaCachedValues(resultXml);

    return {
      xml: resultXml,
      expansions,
    };
  }

  private extractSharedStringCells(
    rowXml: string
  ): Array<{ cellRef: string; sharedStringIndex: number }> {
    const cells: Array<{ cellRef: string; sharedStringIndex: number }> = [];
    const cellRegex =
      /<c\b[^>]*r="([A-Z]+)(\d+)"[^>]*t="s"[^>]*>[\s\S]*?<v>(\d+)<\/v>[\s\S]*?<\/c>/g;
    let match: RegExpExecArray | null;

    while ((match = cellRegex.exec(rowXml)) !== null) {
      cells.push({
        cellRef: `${match[1]}${match[2]}`,
        sharedStringIndex: parseInt(match[3], 10),
      });
    }

    return cells;
  }

  private isBlankSharedStringPlaceholderRow(rowXml: string): boolean {
    return (
      /<c\b/i.test(rowXml) && !/<v>[\s\S]*?<\/v>/.test(rowXml) && !/<f>[\s\S]*?<\/f>/.test(rowXml)
    );
  }

  private detectLoopTemplateRow(
    rowXml: string,
    originalStrings: string[],
    data: any
  ): {
    sharedCells: Array<{ cellRef: string; sharedStringIndex: number }>;
    rowTexts: string[];
    loopStartCellIndex: number;
    loopEndCellIndex: number;
    items: any[];
  } | null {
    const sharedCells = this.extractSharedStringCells(rowXml);
    if (sharedCells.length === 0) {
      return null;
    }

    const rowTexts = sharedCells.map((cell) => originalStrings[cell.sharedStringIndex] || '');
    const combinedText = rowTexts.join('');
    const loopMatch = combinedText.match(/\{#([cdt]\.[^}]+)\}/);
    if (!loopMatch) {
      return null;
    }

    const loopStartCellIndex = rowTexts.findIndex((text) => /\{#([cdt]\.[^}]+)\}/.test(text));
    const reverseEndIndex = [...rowTexts]
      .reverse()
      .findIndex((text) => /\{\/([cdt]\.[^}]+)\}/.test(text));
    if (loopStartCellIndex < 0 || reverseEndIndex < 0) {
      return null;
    }

    const loopEndCellIndex = rowTexts.length - 1 - reverseEndIndex;
    const items = this.resolveLoopItems(data, loopMatch[1]);
    if (items.length === 0) {
      return null;
    }

    return {
      sharedCells,
      rowTexts,
      loopStartCellIndex,
      loopEndCellIndex,
      items,
    };
  }

  private renderLoopTemplateRow(
    templateRowXml: string,
    targetRowNumber: number,
    loopTemplate: {
      sharedCells: Array<{ cellRef: string; sharedStringIndex: number }>;
      rowTexts: string[];
      loopStartCellIndex: number;
      loopEndCellIndex: number;
    },
    itemIndex: number,
    sharedStringDocument: { prefix: string; suffix: string; entries: string[]; values: string[] },
    data: any,
    worksheetContext: WorksheetRenderContext
  ): string {
    let cloned = templateRowXml;

    cloned = cloned.replace(/(<row\b[^>]*r=")\d+(")/, `$1${targetRowNumber}$2`);
    cloned = cloned.replace(
      /(<c\b[^>]*r=")([A-Z]+)\d+(")/g,
      (_match, prefix, col, suffix) => `${prefix}${col}${targetRowNumber}${suffix}`
    );

    for (
      let cellIndex = loopTemplate.loopStartCellIndex;
      cellIndex <= loopTemplate.loopEndCellIndex;
      cellIndex++
    ) {
      const cell = loopTemplate.sharedCells[cellIndex];
      const targetRef = cell.cellRef.replace(/\d+$/, String(targetRowNumber));
      const templateText = loopTemplate.rowTexts[cellIndex];
      const renderedText = this.renderLoopCellText(templateText, data, itemIndex);

      if (this.shouldWriteNumericCell(templateText, renderedText, targetRef, worksheetContext)) {
        cloned = this.replaceCellWithNumber(
          cloned,
          targetRef,
          this.normalizeNumericCellValue(renderedText)
        );
      } else {
        const sharedStringIndex = this.appendSharedStringValue(sharedStringDocument, renderedText);
        const cellPattern = new RegExp(
          `(<c\\b[^>]*r="${targetRef}"[^>]*t="s"[^>]*>[\\s\\S]*?<v>)\\d+(<\\/v>)`
        );
        cloned = cloned.replace(cellPattern, `$1${sharedStringIndex}$2`);
      }
    }

    return cloned;
  }

  private shiftRowXml(
    rowXml: string,
    rowOffset: number,
    expansions: Array<{ startRow: number; oldEndRow: number; newEndRow: number; delta: number }>
  ): string {
    let shifted = rowXml;
    const originalRowNumber = parseInt(rowXml.match(/<row\b[^>]*r="(\d+)"/)?.[1] || '0', 10);
    const targetRowNumber = originalRowNumber + rowOffset;

    shifted = shifted.replace(/(<row\b[^>]*r=")\d+(")/, `$1${targetRowNumber}$2`);
    shifted = shifted.replace(
      /(<c\b[^>]*r=")([A-Z]+)\d+(")/g,
      (_match, prefix, col, suffix) => `${prefix}${col}${targetRowNumber}${suffix}`
    );
    shifted = shifted.replace(
      /<f>([\s\S]*?)<\/f>/g,
      (_match, formula) => `<f>${this.rewriteFormula(formula, expansions)}</f>`
    );

    return shifted;
  }

  private resolveLoopItems(data: any, arrayPath: string): any[] {
    const cleanPath = arrayPath.replace(/^[dct]\./, '').replace(/\[i(?:(?:\+\d+)?)?\]|\[\]/g, '');
    const parts = cleanPath.split('.').filter(Boolean);
    let current = data;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return [];
      }
      current = current[part];
    }

    return Array.isArray(current) ? current : [];
  }

  private appendSharedStringValue(
    document: { prefix: string; suffix: string; entries: string[]; values: string[] },
    value: string
  ): number {
    const escaped = this.escapeXml(value);
    document.entries.push(`<si><t>${escaped}</t></si>`);
    document.values.push(value);
    return document.values.length - 1;
  }

  private renderLoopCellText(templateText: string, data: any, loopIndex: number): string {
    const textWithoutLoopMarkers = templateText
      .replace(/\{#[cdt]\.[^}]+\}/g, '')
      .replace(/\{\/[cdt]\.[^}]+\}/g, '');

    const markerMatch = textWithoutLoopMarkers.match(
      /\{([cdt])\.([^}:]+(?:\[[^\]]*\])?(?:[^}]*)?)(:[^}]*)?\}/
    );
    if (!markerMatch) {
      return textWithoutLoopMarkers;
    }

    const contextChar = markerMatch[1];
    const path = markerMatch[2].replace(/\[\]/g, '[i]');
    const resolvedValue = this.builder.evaluatePath(`${contextChar}.${path}`, data, { loopIndex });
    return String(resolvedValue ?? '');
  }

  private shouldWriteNumericCell(
    templateText: string,
    renderedText: string,
    targetRef: string,
    worksheetContext: WorksheetRenderContext
  ): boolean {
    const normalized = renderedText.replace(/,/g, '').trim();
    if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
      return false;
    }

    const markerOnlyText = templateText
      .replace(/\{#[cdt]\.[^}]+\}/g, '')
      .replace(/\{\/[cdt]\.[^}]+\}/g, '')
      .trim();

    if (!/^\{[cdt]\.[^}]+\}$/.test(markerOnlyText)) {
      return false;
    }

    const column = this.extractColumnLetters(targetRef);
    if (worksheetContext.numericColumns.has(column)) {
      return true;
    }

    const headerLabel = worksheetContext.headerLabels.get(column) || '';
    if (this.looksLikeNumericHeader(headerLabel)) {
      return true;
    }

    // Fallback for decimal / formatted amount strings when worksheet context is unavailable.
    return renderedText.includes(',') || normalized.includes('.');
  }

  private normalizeNumericCellValue(value: string): string {
    return value.replace(/,/g, '').trim();
  }

  private replaceCellWithNumber(rowXml: string, targetRef: string, numericValue: string): string {
    const cellPattern = new RegExp(`<c\\b([^>]*r="${targetRef}"[^>]*)>[\\s\\S]*?<\\/c>`);
    return rowXml.replace(
      cellPattern,
      (_match, attrs) => `<c${String(attrs).replace(/\s+t="s"/, '')}><v>${numericValue}</v></c>`
    );
  }

  private buildWorksheetRenderContext(
    sheetDataXml: string,
    sharedStrings: string[]
  ): WorksheetRenderContext {
    const numericColumns = new Set<string>();
    const headerLabels = new Map<string, string>();
    const rowRegex = /<row\b[^>]*r="(\d+)"[^>]*>[\s\S]*?<\/row>/g;
    const rows = Array.from(sheetDataXml.matchAll(rowRegex)).map((match) => ({
      rowNumber: parseInt(match[1], 10),
      xml: match[0],
    }));

    for (const row of rows) {
      const formulaMatches = Array.from(
        row.xml.matchAll(/<c\b[^>]*r="([A-Z]+)\d+"[^>]*>[\s\S]*?<f>([\s\S]*?)<\/f>[\s\S]*?<\/c>/g)
      );
      for (const formulaMatch of formulaMatches) {
        const formula = formulaMatch[2];
        for (const rangeMatch of formula.matchAll(/([A-Z]+)\d+:([A-Z]+)\d+/g)) {
          if (rangeMatch[1] === rangeMatch[2]) {
            numericColumns.add(rangeMatch[1]);
          }
        }
      }

      for (const sharedCell of this.extractSharedStringCells(row.xml)) {
        const column = this.extractColumnLetters(sharedCell.cellRef);
        const text = (sharedStrings[sharedCell.sharedStringIndex] || '').trim();
        if (!text || /\{[#/]/.test(text)) {
          continue;
        }
        if (!headerLabels.has(column)) {
          headerLabels.set(column, text);
        }
      }
    }

    return { numericColumns, headerLabels };
  }

  private looksLikeNumericHeader(label: string): boolean {
    return /(金额|单价|总价|小计|合计|税额|数量|比例|税率|price|amount|total|subtotal|qty|quantity|rate|percent)/i.test(
      label
    );
  }

  private extractColumnLetters(cellRef: string): string {
    return cellRef.replace(/\d+/g, '');
  }

  private updateWorksheetDimension(sheetXml: string, renderedRows: string[]): string {
    const rowNumbers = renderedRows.map((row) =>
      parseInt(row.match(/<row\b[^>]*r="(\d+)"/)?.[1] || '0', 10)
    );
    const maxRow = rowNumbers.reduce((max, value) => Math.max(max, value), 0);
    if (maxRow === 0) {
      return sheetXml;
    }

    return sheetXml.replace(
      /<dimension ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/,
      (_match, startCol, startRow, endCol) => {
        return `<dimension ref="${startCol}${startRow}:${endCol}${maxRow}"/>`;
      }
    );
  }

  private clearFormulaCachedValues(sheetXml: string): string {
    return sheetXml.replace(
      /(<c\b[^>]*>\s*<f>[\s\S]*?<\/f>)\s*<v>[\s\S]*?<\/v>\s*<\/c>/g,
      '$1</c>'
    );
  }

  private rewriteFormula(
    formula: string,
    expansions: Array<{ startRow: number; oldEndRow: number; newEndRow: number; delta: number }>
  ): string {
    let rewritten = formula;

    for (const expansion of expansions) {
      rewritten = rewritten.replace(
        /([A-Z]+)(\d+):([A-Z]+)(\d+)/g,
        (_match, startCol, startRow, endCol, endRow) => {
          let fromRow = parseInt(startRow, 10);
          let toRow = parseInt(endRow, 10);
          let expandedRange = false;

          if (
            toRow === expansion.oldEndRow &&
            fromRow >= expansion.startRow &&
            fromRow <= expansion.oldEndRow
          ) {
            toRow = expansion.newEndRow;
            expandedRange = true;
          }

          if (fromRow > expansion.oldEndRow) {
            fromRow += expansion.delta;
          }
          if (!expandedRange && toRow > expansion.oldEndRow) {
            toRow += expansion.delta;
          }

          return `${startCol}${fromRow}:${endCol}${toRow}`;
        }
      );
    }

    return rewritten;
  }

  private async updateWorksheetTables(
    zip: JSZip,
    sheetExpansions: Map<
      string,
      Array<{ startRow: number; oldEndRow: number; newEndRow: number; delta: number }>
    >
  ): Promise<void> {
    for (const [sheetPath, expansions] of sheetExpansions.entries()) {
      const tablePaths = await this.getWorksheetTablePaths(zip, sheetPath);
      for (const tablePath of tablePaths) {
        const tableXml = await this.getOptionalFileContent(zip, tablePath);
        if (!tableXml) {
          continue;
        }

        let updated = tableXml;
        for (const expansion of expansions) {
          updated = updated.replace(
            /ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g,
            (_match, startCol, startRow, endCol, endRow) => {
              const bottomRow = parseInt(endRow, 10);
              if (bottomRow !== expansion.oldEndRow) {
                return `ref="${startCol}${startRow}:${endCol}${endRow}"`;
              }
              return `ref="${startCol}${startRow}:${endCol}${expansion.newEndRow}"`;
            }
          );
        }

        zip.file(tablePath, updated);
      }
    }
  }

  private async getWorksheetTablePaths(zip: JSZip, sheetPath: string): Promise<string[]> {
    const relsPath = sheetPath.replace('worksheets/', 'worksheets/_rels/') + '.rels';
    const relsXml = await this.getOptionalFileContent(zip, relsPath);
    if (!relsXml) {
      return [];
    }

    const tablePaths: string[] = [];
    const relRegex = /<Relationship[^>]*Type="[^"]*\/table"[^>]*Target="([^"]+)"[^>]*\/>/g;
    let match: RegExpExecArray | null;
    while ((match = relRegex.exec(relsXml)) !== null) {
      const target = match[1].replace(/^\.\.\//, 'xl/');
      tablePaths.push(target.startsWith('xl/') ? target : `xl/${target}`);
    }

    return tablePaths;
  }

  private async enableWorkbookRecalculation(zip: JSZip): Promise<void> {
    const workbookPath = 'xl/workbook.xml';
    const workbookXml = await this.getOptionalFileContent(zip, workbookPath);
    if (!workbookXml) {
      return;
    }

    let updated = workbookXml;
    if (/<calcPr\b/.test(updated)) {
      updated = updated.replace(/<calcPr\b[^>]*\/>/, (match) => this.upsertCalcPrTag(match));
      updated = updated.replace(/<calcPr\b[^>]*>(?![\s\S]*<calcPr\b)/, (match) =>
        this.upsertCalcPrTag(match)
      );
    } else {
      updated = updated.replace(
        '</workbook>',
        '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>'
      );
    }

    zip.file(workbookPath, updated);
    if (zip.file('xl/calcChain.xml')) {
      zip.remove('xl/calcChain.xml');
    }
  }

  private upsertCalcPrTag(tag: string): string {
    const selfClosing = /\/>$/.test(tag);
    const attrMatch = tag.match(/^<calcPr\b([\s\S]*?)(\/?>)$/);
    const rawAttrs = attrMatch?.[1] ?? '';
    let attrs = rawAttrs;

    attrs = this.upsertXmlAttribute(attrs, 'calcMode', 'auto');
    attrs = this.upsertXmlAttribute(attrs, 'fullCalcOnLoad', '1');
    attrs = this.upsertXmlAttribute(attrs, 'forceFullCalc', '1');

    return `<calcPr${attrs}${selfClosing ? '/>' : '>'}`;
  }

  private upsertXmlAttribute(attrs: string, name: string, value: string): string {
    const pattern = new RegExp(`\\s${name}="[^"]*"`);
    if (pattern.test(attrs)) {
      return attrs.replace(pattern, ` ${name}="${value}"`);
    }
    return `${attrs} ${name}="${value}"`;
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * 处理媒体文件（图片替换）
   * 支持通过数据中的图片URL或Base64数据替换模板中的图片
   * 正确处理关系文件(_rels)以确保图片引用正确
   */
  private async processMediaFiles(zip: JSZip, data: any, format: string): Promise<void> {
    // 检查数据中是否有图片数据
    if (!data.images && !data.d?.images && !data.screenshots && !data.d?.screenshots) {
      return;
    }

    const imagesData =
      data.images || data.d?.images || data.screenshots || data.d?.screenshots || [];
    if (!Array.isArray(imagesData) || imagesData.length === 0) {
      return;
    }

    // 获取媒体文件夹路径和关系文件路径
    const mediaPath =
      format === 'docx'
        ? 'word/media'
        : format === 'xlsx'
          ? 'xl/media'
          : format === 'pptx'
            ? 'ppt/media'
            : null;

    if (!mediaPath) return;

    // 解析关系文件以获取图片映射
    const relationshipsPath =
      format === 'docx'
        ? 'word/_rels/document.xml.rels'
        : format === 'xlsx'
          ? 'xl/_rels/workbook.xml.rels'
          : format === 'pptx'
            ? 'ppt/_rels/presentation.xml.rels'
            : null;

    const imageRelationships = await this.parseImageRelationships(
      zip,
      relationshipsPath,
      mediaPath
    );

    // 获取现有媒体文件列表
    const existingMediaFiles = zip.file(
      new RegExp(mediaPath.replace('/', '\\/') + '\\/image\\d+\\.[a-z]+')
    );
    const existingImageCount = existingMediaFiles.length;

    // 替换或添加图片
    for (let i = 0; i < imagesData.length; i++) {
      const imageData = imagesData[i];

      if (!imageData) continue;

      try {
        const imageBuffer = await this.loadImageBuffer(imageData);
        if (!imageBuffer) continue;

        const imageExtension = this.getImageExtension(imageBuffer, imageData);
        const imageContentType = this.getImageContentType(imageExtension);

        if (i < existingMediaFiles.length) {
          // 替换现有图片
          const existingFile = existingMediaFiles[i];
          const existingName = existingFile.name;
          const existingExt = path.extname(existingName);

          // 如果扩展名不同，需要更新关系文件和内容类型
          if (existingExt !== imageExtension) {
            await this.updateImageExtension(
              zip,
              existingName,
              imageExtension,
              imageContentType,
              format
            );
          }

          zip.file(existingName, imageBuffer);
        } else {
          // 添加新图片
          const newImageName = `${mediaPath}/image${existingImageCount + i + 1}${imageExtension}`;
          zip.file(newImageName, imageBuffer);

          // 更新关系文件
          await this.addImageRelationship(zip, relationshipsPath, newImageName, format);

          // 更新内容类型
          await this.updateContentTypes(zip, imageExtension, imageContentType);
        }
      } catch (error) {
        console.warn(`Failed to process image ${i}:`, error);
      }
    }
  }

  /**
   * 解析图片关系文件
   */
  private async parseImageRelationships(
    zip: JSZip,
    relationshipsPath: string | null,
    mediaPath: string
  ): Promise<ImageRelationship[]> {
    const relationships: ImageRelationship[] = [];

    if (!relationshipsPath) return relationships;

    const relsFile = zip.file(relationshipsPath);
    if (!relsFile) {
      // 尝试查找其他关系文件
      const allRelsFiles = zip.file(/_rels\/[^\/]+\.xml\.rels$/);
      if (allRelsFiles.length > 0) {
        for (const rels of allRelsFiles) {
          const content = await rels.async('text');
          const parsed = this.extractImageRelationshipsFromXml(content, mediaPath);
          relationships.push(...parsed);
        }
      }
      return relationships;
    }

    const relsContent = await relsFile.async('text');
    return this.extractImageRelationshipsFromXml(relsContent, mediaPath);
  }

  /**
   * 从XML内容中提取图片关系
   */
  private extractImageRelationshipsFromXml(
    xmlContent: string,
    mediaPath: string
  ): ImageRelationship[] {
    const relationships: ImageRelationship[] = [];

    // 解析 <Relationship> 元素
    const relPattern = /<Relationship\s+Id="([^"]+)"\s+Type="([^"]+)"\s+Target="([^"]+)"[^\/]*\/>/g;
    let match;

    while ((match = relPattern.exec(xmlContent)) !== null) {
      const rId = match[1];
      const type = match[2];
      const target = match[3];

      // 只处理图片类型的关系
      if (type.includes('image') || target.includes('media/image')) {
        relationships.push({
          rId,
          target: target.startsWith(mediaPath) ? target : `${mediaPath}/${target}`,
          type,
        });
      }
    }

    return relationships;
  }

  /**
   * 加载图片Buffer
   */
  private async loadImageBuffer(imageData: any): Promise<Buffer | null> {
    try {
      if (imageData.url) {
        const response = await fetch(imageData.url);
        if (!response.ok) {
          console.warn(`Failed to fetch image from URL: ${imageData.url}`);
          return null;
        }
        const buffer = await response.arrayBuffer();
        return Buffer.from(buffer);
      } else if (imageData.base64) {
        return Buffer.from(imageData.base64, 'base64');
      } else if (imageData.path) {
        return fs.readFileSync(imageData.path);
      } else if (imageData.buffer) {
        return imageData.buffer;
      }
    } catch (error) {
      console.warn('Error loading image buffer:', error);
    }
    return null;
  }

  /**
   * 获取图片扩展名
   */
  private getImageExtension(buffer: Buffer, imageData: any): string {
    // 从数据中获取扩展名
    if (imageData.extension) {
      return imageData.extension.startsWith('.') ? imageData.extension : `.${imageData.extension}`;
    }
    if (imageData.fileName) {
      const ext = path.extname(imageData.fileName);
      if (ext) return ext;
    }

    // 从buffer推断类型
    if (buffer.length >= 4) {
      // PNG signature
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return '.png';
      }
      // JPEG signature
      if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return '.jpg';
      }
      // GIF signature
      if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        return '.gif';
      }
    }

    // 默认返回PNG
    return '.png';
  }

  /**
   * 获取图片内容类型
   */
  private getImageContentType(extension: string): string {
    const ext = extension.toLowerCase().replace('.', '');
    const types: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      bmp: 'image/bmp',
      tif: 'image/tiff',
      tiff: 'image/tiff',
      webp: 'image/webp',
    };
    return types[ext] || 'image/png';
  }

  /**
   * 更新图片扩展名（需要更新关系文件和内容类型）
   */
  private async updateImageExtension(
    zip: JSZip,
    oldFileName: string,
    newExtension: string,
    newContentType: string,
    format: string
  ): Promise<void> {
    const oldExt = path.extname(oldFileName);
    const newFileName = oldFileName.replace(oldExt, newExtension);

    // 更新关系文件中的Target
    const relsPaths =
      format === 'docx'
        ? [
            'word/_rels/document.xml.rels',
            'word/_rels/header1.xml.rels',
            'word/_rels/footer1.xml.rels',
          ]
        : [];

    for (const relsPath of relsPaths) {
      const relsFile = zip.file(relsPath);
      if (relsFile) {
        const content = await relsFile.async('text');
        const updated = content.replace(
          new RegExp(`Target="${oldFileName.replace(/\//g, '\\/')}"`, 'g'),
          `Target="${newFileName.replace(oldExt, newExtension)}"`
        );
        zip.file(relsPath, updated);
      }
    }

    // 更新内容类型
    await this.updateContentTypes(zip, oldExt, newContentType, true);
  }

  /**
   * 添加新的图片关系
   */
  private async addImageRelationship(
    zip: JSZip,
    relationshipsPath: string | null,
    imageTarget: string,
    format: string
  ): Promise<void> {
    if (!relationshipsPath) return;

    const relsFile = zip.file(relationshipsPath);
    if (!relsFile) return;

    const relsContent = await relsFile.async('text');

    // 生成新的rId
    const existingIds = this.extractImageRelationshipsFromXml(relsContent, '')
      .map((r) => r.rId)
      .filter((id) => id.startsWith('rId'));

    const maxId = existingIds.reduce((max, id) => {
      const num = parseInt(id.replace('rId', ''), 10);
      return Math.max(max, num);
    }, 0);

    const newRId = `rId${maxId + 1}`;

    // 添加新的关系
    const imageType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
    const newRelationship = `<Relationship Id="${newRId}" Type="${imageType}" Target="${imageTarget}"/>`;

    // 在 </Relationships> 前插入
    const updated = relsContent.replace('</Relationships>', `${newRelationship}\n</Relationships>`);
    zip.file(relationshipsPath, updated);
  }

  /**
   * 更新内容类型定义
   */
  private async updateContentTypes(
    zip: JSZip,
    extension: string,
    contentType: string,
    isReplacement: boolean = false
  ): Promise<void> {
    const contentTypesPath = '[Content_Types].xml';
    const ctFile = zip.file(contentTypesPath);
    if (!ctFile) return;

    const ctContent = await ctFile.async('text');

    // 检查是否已存在该扩展名的定义
    const extPattern = new RegExp(
      `<Default\\s+Extension="${extension.replace('.', '')}"[^\\/]*\\/`
    );
    const exists = extPattern.test(ctContent);

    if (!exists && !isReplacement) {
      // 添加新的扩展名定义
      const newDefault = `<Default Extension="${extension.replace('.', '')}" ContentType="${contentType}"/>`;
      const updated = ctContent.replace('</Types>', `${newDefault}\n</Types>`);
      zip.file(contentTypesPath, updated);
    }
  }

  /**
   * 保存生成的文档到文件
   */
  saveDocument(buffer: Buffer, outputPath: string): string {
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  }

  /**
   * 生成唯一文件名
   */
  generateOutputFileName(templateName: string, format: string): string {
    const baseName = templateName.replace(/\.[^/.]+$/, '');
    return `${baseName}_${Date.now()}.${format}`;
  }
}
