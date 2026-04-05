/**
 * Carbone Engine - AI Identifier Service
 * AI自动标识服务，基于结构化文档分析生成模版配置
 */

import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { DocumentElement, DocumentStructure } from './document-structure.service';

/**
 * 模版配置 - 描述整个模版的结构和变量映射
 */
export interface TemplateConfig {
  // 模版类型（根据文档内容自动识别）
  templateType: string;
  // 需要保留的静态元素（如标题）
  staticElements: StaticElement[];
  // 需要循环的表格
  tableLoops: TableLoop[];
  // 需要循环的图片
  imageLoops: ImageLoop[];
  // 变量映射建议
  variableMappings: VariableMapping[];
  // 分析说明
  analysisNotes: string[];
}

export interface StaticElement {
  type: 'title' | 'heading' | 'paragraph';
  content: string;
  reason: string;
}

export interface TableLoop {
  tableIndex: number;
  headerRow: string;
  dataRowCount: number;
  arrayPath: string;       // 如 d.steps
  columnMappings: ColumnMapping[];
  reason: string;
  confidence: number;
}

export interface ColumnMapping {
  headerName: string;
  variablePath: string;    // 如 d.steps[].action
  sampleValue: string;
}

export interface ImageLoop {
  imageIndex: number;
  imageId: string;
  altText: string;
  arrayPath: string;       // 如 d.screenshots
  reason: string;
  confidence: number;
}

export interface VariableMapping {
  path: string;
  content: string;
  type: 'text' | 'number' | 'date' | 'image';
  reason: string;
}

export interface AIIdentifyResponse {
  templateConfig: TemplateConfig;
  suggestions: VariableMapping[];
  loops: TableLoop[];
  images: ImageLoop[];
  analyzedAt: string;
  documentStats: {
    totalElements: number;
    tables: number;
    images: number;
    potentialLoops: number;
  };
  contextAnalysis?: {
    detectedTemplateType: string;
    userIntent: string;
  };
}

@Injectable()
export class AIIdentifierService {

  /**
   * 分析模板文档并生成模版配置
   * @param templatePath 模板文件路径
   * @param format 文件格式
   * @param context 用户上下文（如"需要保留title，表格循环，图片循环"）
   * @param documentStructure 可选的文档结构数据（已解析好的）
   */
  async identifyVariables(
    templatePath: string,
    format: string,
    context?: string,
    documentStructure?: DocumentStructure
  ): Promise<AIIdentifyResponse> {
    // 如果没有提供文档结构，则解析
    if (!documentStructure && format === 'docx') {
      documentStructure = await this.parseDocxStructure(templatePath);
    }

    const elements = documentStructure?.elements || [];

    // 分析用户上下文，提取意图
    const userIntent = this.parseUserContext(context || '');

    // 基于结构分析生成模版配置
    const templateConfig = this.generateTemplateConfig(elements, userIntent);

    // 生成变量建议
    const suggestions = this.generateVariableSuggestions(elements, templateConfig);

    // 生成循环配置
    const loops = templateConfig.tableLoops;
    const images = templateConfig.imageLoops;

    return {
      templateConfig,
      suggestions,
      loops,
      images,
      analyzedAt: new Date().toISOString(),
      documentStats: {
        totalElements: elements.length,
        tables: elements.filter(e => e.type === 'table').length,
        images: elements.filter(e => e.type === 'image').length,
        potentialLoops: loops.length + images.length
      },
      contextAnalysis: {
        detectedTemplateType: templateConfig.templateType,
        userIntent: userIntent.summary
      }
    };
  }

  /**
   * 解析用户上下文，提取意图
   */
  private parseUserContext(context: string): UserIntent {
    const intent: UserIntent = {
      preserveTitles: false,
      preserveHeadings: false,
      tableLoops: true,      // 默认启用表格循环
      imageLoops: false,
      customLoops: [],
      summary: context || '通用模版分析'
    };

    const lowerContext = context.toLowerCase();

    // 检测保留标题的意图
    if (lowerContext.includes('保留title') ||
        lowerContext.includes('保留标题') ||
        lowerContext.includes('keep title')) {
      intent.preserveTitles = true;
    }

    // 检测保留标题的意图
    if (lowerContext.includes('保留heading') ||
        lowerContext.includes('保留标题') ||
        lowerContext.includes('keep heading')) {
      intent.preserveHeadings = true;
    }

    // 检测表格循环意图
    if (lowerContext.includes('表格循环') ||
        lowerContext.includes('table loop') ||
        lowerContext.includes('循环表格')) {
      intent.tableLoops = true;
    }

    // 检测图片循环意图
    if (lowerContext.includes('图片循环') ||
        lowerContext.includes('image loop') ||
        lowerContext.includes('循环图片') ||
        lowerContext.includes('screenshot') ||
        lowerContext.includes('图片') && lowerContext.includes('循环') ||
        lowerContext.includes('image') && lowerContext.includes('loop')) {
      intent.imageLoops = true;
    }

    // 检测特定循环路径
    const loopMatches = context.match(/循环[:：]\s*(\w+)/g);
    if (loopMatches) {
      for (const match of loopMatches) {
        const path = match.replace(/循环[:：]\s*/, '');
        intent.customLoops.push(path);
      }
    }

    return intent;
  }

  /**
   * 基于文档结构生成模版配置
   */
  private generateTemplateConfig(elements: DocumentElement[], userIntent: UserIntent): TemplateConfig {
    const config: TemplateConfig = {
      templateType: this.detectTemplateType(elements),
      staticElements: [],
      tableLoops: [],
      imageLoops: [],
      variableMappings: [],
      analysisNotes: []
    };

    // 分析静态元素（需要保留的标题等）
    for (const el of elements) {
      if (el.type === 'title' && userIntent.preserveTitles) {
        config.staticElements.push({
          type: 'title',
          content: el.text,
          reason: '文档标题，保留作为静态内容'
        });
      }
      if ((el.type === 'heading1' || el.type === 'heading2' || el.type === 'heading3') &&
          userIntent.preserveHeadings) {
        config.staticElements.push({
          type: 'heading',
          content: el.text,
          reason: '章节标题，保留作为静态内容'
        });
      }
    }

    // 分析表格循环
    const tables = elements.filter(e => e.type === 'table');
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      const dataRows = table.dataRows || [];
      const headerRow = table.headerRow || '';

      // 判断是否需要循环
      if (userIntent.tableLoops && dataRows.length > 0) {
        const arrayPath = this.inferTableArrayPath(headerRow, config.templateType, i);
        const columnMappings = this.generateColumnMappings(headerRow, arrayPath);

        config.tableLoops.push({
          tableIndex: i,
          headerRow,
          dataRowCount: dataRows.length,
          arrayPath,
          columnMappings,
          reason: `检测到数据表格，包含 ${dataRows.length} 行数据，建议循环`,
          confidence: this.calculateTableConfidence(table)
        });
      }
    }

    // 分析图片循环
    const images = elements.filter(e => e.type === 'image');
    if (userIntent.imageLoops && images.length > 0) {
      // 如果有多张图片，建议放入数组循环
      if (images.length > 1) {
        const arrayPath = this.inferImageArrayPath(config.templateType);
        for (let i = 0; i < images.length; i++) {
          config.imageLoops.push({
            imageIndex: i,
            imageId: images[i].imageId || '',
            altText: images[i].altText || '',
            arrayPath,
            reason: '检测到多张图片，建议放入数组循环',
            confidence: 0.8
          });
        }
      } else {
        // 单张图片，可能需要变量化
        config.variableMappings.push({
          path: 'd.screenshot',
          content: images[0].altText || 'Image',
          type: 'image',
          reason: '检测到单张图片，建议变量化'
        });
      }
    }

    // 添加分析说明
    config.analysisNotes.push(`检测到 ${tables.length} 个表格`);
    if (config.tableLoops.length > 0) {
      config.analysisNotes.push(`建议 ${config.tableLoops.length} 个表格使用循环`);
    }
    if (config.imageLoops.length > 0) {
      config.analysisNotes.push(`建议 ${images.length} 张图片使用循环`);
    }

    return config;
  }

  /**
   * 检测模版类型
   */
  private detectTemplateType(elements: DocumentElement[]): string {
    const text = elements.map(e => e.text || '').join(' ').toLowerCase();

    if (text.includes('step') || text.includes('步骤') ||
        text.includes('action') || text.includes('操作')) {
      return '运维自动化报告';
    }

    if (text.includes('订单') || text.includes('order') ||
        text.includes('商品') || text.includes('product')) {
      return '订单报告';
    }

    if (text.includes('报告') || text.includes('report')) {
      return '分析报告';
    }

    return '通用文档';
  }

  /**
   * 推断表格的数组路径
   */
  private inferTableArrayPath(headerRow: string, templateType: string, tableIndex: number): string {
    const headerLower = headerRow.toLowerCase();

    // 基于表头内容推断
    if (headerLower.includes('step') || headerLower.includes('步骤')) {
      return 'd.steps';
    }
    if (headerLower.includes('action') || headerLower.includes('操作')) {
      return 'd.actions';
    }
    if (headerLower.includes('item') || headerLower.includes('项目') || headerLower.includes('商品')) {
      return 'd.items';
    }
    if (headerLower.includes('product') || headerLower.includes('产品')) {
      return 'd.products';
    }
    if (headerLower.includes('user') || headerLower.includes('用户')) {
      return 'd.users';
    }
    if (headerLower.includes('result') || headerLower.includes('结果')) {
      return 'd.results';
    }

    // 基于模版类型推断
    if (templateType === '运维自动化报告') {
      return tableIndex === 0 ? 'd.steps' : `d.table${tableIndex + 1}`;
    }

    if (templateType === '订单报告') {
      return 'd.items';
    }

    return `d.items`;
  }

  /**
   * 生成列映射
   */
  private generateColumnMappings(headerRow: string, arrayPath: string): ColumnMapping[] {
    const headers = headerRow.split(/[|,，]/).map(h => h.trim()).filter(h => h);
    const mappings: ColumnMapping[] = [];

    for (const header of headers) {
      const varName = this.headerToVariableName(header);
      mappings.push({
        headerName: header,
        variablePath: `${arrayPath}[].${varName}`,
        sampleValue: this.getSampleValue(varName)
      });
    }

    return mappings;
  }

  /**
   * 表头名称转变量名
   */
  private headerToVariableName(header: string): string {
    const mappings: Record<string, string> = {
      'step': 'step',
      '步骤': 'step',
      'action': 'action',
      '操作': 'action',
      'result': 'result',
      '结果': 'result',
      'status': 'status',
      '状态': 'status',
      'name': 'name',
      '名称': 'name',
      'date': 'date',
      '日期': 'date',
      'time': 'time',
      '时间': 'time',
      'description': 'description',
      '描述': 'description',
      'note': 'note',
      '备注': 'note',
      'comment': 'comment',
      '评论': 'comment'
    };

    const lower = header.toLowerCase();
    return mappings[lower] || mappings[header] || lower.replace(/\s+/g, '_');
  }

  /**
   * 获取示例值
   */
  private getSampleValue(varName: string): string {
    const samples: Record<string, string> = {
      'step': '1',
      'action': '点击按钮',
      'result': '成功',
      'status': 'completed',
      'name': '示例名称',
      'date': '2024-01-01',
      'time': '10:00:00',
      'description': '示例描述',
      'note': '示例备注'
    };
    return samples[varName] || '示例值';
  }

  /**
   * 推断图片数组路径
   */
  private inferImageArrayPath(templateType: string): string {
    if (templateType === '运维自动化报告') {
      return 'd.screenshots';
    }
    return 'd.images';
  }

  /**
   * 计算表格置信度
   */
  private calculateTableConfidence(table: DocumentElement): number {
    let confidence = 0.5;
    const dataRows = table.dataRows || [];

    // 数据行越多，置信度越高
    if (dataRows.length > 5) confidence += 0.3;
    else if (dataRows.length > 2) confidence += 0.2;
    else if (dataRows.length > 0) confidence += 0.1;

    // 表头包含常见关键词
    const headerLower = (table.headerRow || '').toLowerCase();
    const keywords = ['step', 'action', 'result', 'status', 'name', '步骤', '操作', '结果', '状态', '名称'];
    for (const keyword of keywords) {
      if (headerLower.includes(keyword)) {
        confidence += 0.15;
        break;
      }
    }

    return Math.min(confidence, 0.95);
  }

  /**
   * 生成变量建议
   */
  private generateVariableSuggestions(elements: DocumentElement[], config: TemplateConfig): VariableMapping[] {
    const suggestions: VariableMapping[] = [];

    // 从表格循环中提取变量
    for (const loop of config.tableLoops) {
      for (const col of loop.columnMappings) {
        suggestions.push({
          path: col.variablePath,
          content: col.sampleValue,
          type: 'text',
          reason: `来自表格 "${loop.headerRow}" 的列 "${col.headerName}"`
        });
      }
    }

    // 从图片循环中提取变量
    for (const img of config.imageLoops) {
      suggestions.push({
        path: `${img.arrayPath}[].url`,
        content: img.altText || 'image.png',
        type: 'image',
        reason: '图片URL变量'
      });
    }

    return suggestions;
  }

  /**
   * 解析DOCX文档结构
   */
  private async parseDocxStructure(filePath: string): Promise<DocumentStructure> {
    const buffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buffer);
    const documentFile = zip.file('word/document.xml');

    if (!documentFile) {
      throw new Error('Invalid DOCX file: document.xml not found');
    }

    // 简单解析，返回基本结构
    const xmlContent = await documentFile.async('text');
    return this.parseXmlToStructure(xmlContent);
  }

  /**
   * 解析XML到结构
   */
  private parseXmlToStructure(xmlContent: string): DocumentStructure {
    const elements: DocumentElement[] = [];

    // 提取表格
    const tablePattern = /<w:tbl[^>]*>([\s\S]*?)<\/w:tbl>/g;
    let tableMatch;
    let tableIndex = 0;

    while ((tableMatch = tablePattern.exec(xmlContent)) !== null) {
      const tableContent = tableMatch[1];
      const rows = this.extractTableRows(tableContent);

      if (rows.length > 0) {
        const headerRow = rows[0].join(' | ');
        const dataRows = rows.slice(1).map(r => r.join(' | '));

        elements.push({
          id: `table-${tableIndex}`,
          type: 'table',
          content: headerRow,
          text: `[表格] ${headerRow}`,
          xpath: `/w:document/w:body/w:tbl[${tableIndex}]`,
          index: tableIndex,
          headerRow,
          dataRows: dataRows.slice(0, 3),
          tableHeaders: rows[0].map((text, i) => ({ text, index: i })),
          tableRows: rows.map((cells, i) => ({
            cells,
            hasPreserve: false,
            isHeader: i === 0
          }))
        });
        tableIndex++;
      }
    }

    // 提取图片
    const imagePattern = /<wp:docPr[^>]*descr="([^"]*)"[^>]*>/g;
    let imageMatch;
    let imageIndex = 0;

    while ((imageMatch = imagePattern.exec(xmlContent)) !== null) {
      elements.push({
        id: `image-${imageIndex}`,
        type: 'image',
        content: imageMatch[1] || 'Image',
        text: `[图片] ${imageMatch[1] || 'Image'}`,
        xpath: `/w:document/w:body/w:p/w:r/w:drawing[${imageIndex}]`,
        index: imageIndex,
        altText: imageMatch[1]
      });
      imageIndex++;
    }

    return { elements, styles: {}, namespaces: {} };
  }

  /**
   * 提取表格行
   */
  private extractTableRows(tableContent: string): string[][] {
    const rows: string[][] = [];
    const rowPattern = /<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g;
    let rowMatch;

    while ((rowMatch = rowPattern.exec(tableContent)) !== null) {
      const rowContent = rowMatch[1];
      const cells = this.extractRowCells(rowContent);
      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    return rows;
  }

  /**
   * 提取行单元格
   */
  private extractRowCells(rowContent: string): string[] {
    const cells: string[] = [];
    const cellPattern = /<w:tc[^>]*>([\s\S]*?)<\/w:tc>/g;
    let cellMatch;

    while ((cellMatch = cellPattern.exec(rowContent)) !== null) {
      const cellContent = cellMatch[1];
      const text = this.extractCellText(cellContent);
      cells.push(text.trim());
    }

    return cells;
  }

  /**
   * 提取单元格文本
   */
  private extractCellText(cellContent: string): string {
    const textPattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let text = '';
    let match;

    while ((match = textPattern.exec(cellContent)) !== null) {
      text += match[1];
    }

    return text;
  }
}

/**
 * 用户意图
 */
interface UserIntent {
  preserveTitles: boolean;
  preserveHeadings: boolean;
  tableLoops: boolean;
  imageLoops: boolean;
  customLoops: string[];
  summary: string;
}