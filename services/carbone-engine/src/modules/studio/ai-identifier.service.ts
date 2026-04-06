/**
 * Carbone Engine - AI Identifier Service
 * AI自动标识服务，基于结构化文档分析生成模版配置
 */

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import axios from 'axios';
import { DocumentElement, DocumentStructure, PreserveMarker } from './document-structure.service';

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
  // 组合变量（如 Step X: screenshot + 图片）
  combinedVariables: CombinedVariable[];
  // 变量映射建议
  variableMappings: VariableMapping[];
  // 分析说明
  analysisNotes: string[];
}

export interface CombinedVariable {
  id: string;
  type: 'step-screenshot';
  stepNumber: number;
  textContent: string;
  imageId: string;
  imagePath: string;  // 如 d.steps[0].screenshot
  reason: string;
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
  type: 'text' | 'number' | 'date' | 'image' | 'heading';
  reason: string;
}

/**
 * 内容模式识别结果
 */
export interface ContentPattern {
  type: 'heading' | 'table' | 'image' | 'step' | 'summary';
  matched: boolean;
  extractedValue?: string;
  arrayPath?: string;
}

export interface AIIdentifyResponse {
  templateConfig: TemplateConfig;
  suggestions: VariableMapping[];
  loops: TableLoop[];
  images: ImageLoop[];
  combinedVariables: CombinedVariable[];  // 组合变量（文本+图片）
  analyzedAt: string;
  documentStats: {
    totalElements: number;
    tables: number;
    images: number;
    stepScreenshots: number;  // 步骤截图组合变量数量
    potentialLoops: number;
  };
  contextAnalysis?: {
    detectedTemplateType: string;
    userIntent: string;
  };
}

@Injectable()
export class AIIdentifierService {
  private readonly logger = new Logger(AIIdentifierService.name);
  private readonly aiOrchestratorUrl: string;

  constructor() {
    this.aiOrchestratorUrl = process.env.AI_ORCHESTRATOR_URL || 'http://localhost:3007';
  }

  /**
   * 分析模板文档并生成模版配置
   * @param templatePath 模板文件路径
   * @param format 文件格式
   * @param context 用户上下文（如"需要保留title，表格循环，图片循环"）
   * @param documentStructure 可选的文档结构数据（已解析好的）
   * @param manualMarkings 用户手动标记 { 元素索引: 'param'|'loop'|'static' }
   * @param markingSummary 标记摘要文本
   */
  async identifyVariables(
    templatePath: string,
    format: string,
    context?: string,
    documentStructure?: DocumentStructure,
    manualMarkings?: Record<string, string>,
    markingSummary?: string
  ): Promise<AIIdentifyResponse> {
    // 如果没有提供文档结构，则解析
    if (!documentStructure && format === 'docx') {
      documentStructure = await this.parseDocxStructure(templatePath);
    }

    const elements = documentStructure?.elements || [];

    // 分析用户上下文，提取意图
    const userIntent = this.parseUserContext(context || '');

    // 使用 AI 分析文档结构（不再使用规则分析fallback）
    const templateConfig = await this.analyzeWithAI(elements, context, manualMarkings, markingSummary);
    if (!templateConfig) {
      throw new Error('AI分析失败，请检查AI服务是否正常');
    }
    this.logger.log('AI analysis completed successfully');

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
      combinedVariables: templateConfig.combinedVariables,
      analyzedAt: new Date().toISOString(),
      documentStats: {
        totalElements: elements.length,
        tables: elements.filter(e => e.type === 'table').length,
        images: elements.filter(e => e.type === 'image').length,
        stepScreenshots: elements.filter(e => e.type === 'step-screenshot').length,
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
      preserveTitles: true,     // 默认保留标题
      preserveHeadings: true,   // 默认保留标题
      tableLoops: true,         // 默认启用表格循环
      imageLoops: false,
      customLoops: [],
      summary: context || '通用模版分析'
    };

    const lowerContext = context.toLowerCase();

    // 检测保留标题的意图（默认保留，除非明确要求替换）
    if (lowerContext.includes('保留title') ||
        lowerContext.includes('保留标题') ||
        lowerContext.includes('keep title')) {
      intent.preserveTitles = true;
    }

    // 如果要求标题也作为参数
    if (lowerContext.includes('标题参数') ||
        lowerContext.includes('title参数') ||
        lowerContext.includes('替换标题')) {
      intent.preserveTitles = false;
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
        (lowerContext.includes('图片') && lowerContext.includes('循环')) ||
        (lowerContext.includes('image') && lowerContext.includes('loop'))) {
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
   * 分析内容模式 - 识别标题、表格、截图等模式
   * 返回的内容会被转换为参数或保留
   */
  private analyzeContentPattern(text: string): ContentPattern {
    // 1. 首先检查步骤模式: Step 3: screenshot + 图片
    // 这是最重要的模式，应该优先检测
    const stepMatch = text.match(/Step\s*(\d+)[:：]\s*(.+)/i);
    if (stepMatch) {
      return {
        type: 'step',
        matched: true,
        extractedValue: stepMatch[2].trim(),
        arrayPath: 'd.steps'
      };
    }

    // 2. 检查是否是纯标题模式（以#开头）
    // 只有以#开头的才是真正的标题，应该保留
    if (/^#{1,6}\s+/.test(text)) {
      return {
        type: 'heading',
        matched: true,
        extractedValue: text.replace(/^#{1,6}\s+/, '').trim()
      };
    }

    // 3. 检查图片/截图模式
    if (text.toLowerCase().includes('screenshot') ||
        text.includes('截图') ||
        text.includes('图片')) {
      return {
        type: 'image',
        matched: true,
        extractedValue: text
      };
    }

    // 4. 检查表格模式
    if (text.includes('|') && text.split('|').length > 2) {
      return {
        type: 'table',
        matched: true,
        extractedValue: text
      };
    }

    // 5. 检查总结/日志模式
    if (text.includes('总结') ||
        text.includes('执行上下文') ||
        text.includes('日志') ||
        text.includes('log') ||
        text.includes('summary')) {
      return {
        type: 'summary',
        matched: true,
        extractedValue: text
      };
    }

    return {
      type: 'heading',
      matched: false
    };
  }

  /**
  * 基于文档结构生成模版配置
  * 根据 preserve 标记决定元素的分类：
  * - preserve static → 静态保留
  * - preserve loop → 循环表格
  * - preserve variable / step-screenshot → 变量
  */
 private generateTemplateConfig(elements: DocumentElement[], userIntent: UserIntent): TemplateConfig {
   const config: TemplateConfig = {
     templateType: this.detectTemplateType(elements),
     staticElements: [],
     tableLoops: [],
     imageLoops: [],
     combinedVariables: [],
     variableMappings: [],
     analysisNotes: []
   };

   // 收集所有步骤截图，用于生成数组参数
   const stepScreenshots: { stepNum: number; text: string; imageId: string }[] = [];

   for (const el of elements) {
     const preserveMarker = el.preserveMarker;

     // 1. 处理 step-screenshot 类型（组合元素）
     if (el.type === 'step-screenshot') {
       // Step X: screenshot + 图片 的组合变量
       stepScreenshots.push({
         stepNum: el.stepNumber || stepScreenshots.length + 1,
         text: el.content,
         imageId: el.combinedImage?.imageId || ''
       });

       config.combinedVariables.push({
         id: el.id,
         type: 'step-screenshot',
         stepNumber: el.stepNumber || stepScreenshots.length,
         textContent: el.content,
         imageId: el.combinedImage?.imageId || '',
         imagePath: `d.steps[${(el.stepNumber || stepScreenshots.length) - 1}].screenshot`,
         reason: '段落文本与图片的组合，作为步骤截图变量'
       });
       continue;
     }

     // 2. 根据 preserve 标记决定分类
     if (preserveMarker) {
       switch (preserveMarker.type) {
         case 'static':
           // preserve static → 保留为静态元素
           config.staticElements.push({
             type: el.type === 'heading1' || el.type === 'heading2' || el.type === 'heading3' ? 'heading' : 'paragraph',
             content: el.text,
             reason: `根据 preserve 标记保留为静态内容: ${preserveMarker.text || ''}`
           });
           continue;

         case 'loop':
           // preserve loop → 循环表格（在表格处理中继续）
           break;

         case 'step-screenshot':
           // 已经在上面处理了
           continue;

         case 'variable':
           // preserve variable → 变量
           config.variableMappings.push({
             path: this.generateVariablePath(el),
             content: el.text,
             type: this.detectVariableType(el),
             reason: `根据 preserve 标记作为变量: ${preserveMarker.text || ''}`
           });
           continue;
       }
     }

     // 3. 处理标题（默认保留，除非有 preserve variable 标记）
     if (el.type === 'title') {
       if (!preserveMarker || preserveMarker.type !== 'variable') {
         if (userIntent.preserveTitles) {
           config.staticElements.push({
             type: 'title',
             content: el.text,
             reason: '文档标题，保留作为静态内容'
           });
         }
       }
       continue;
     }

     // 4. 处理标题级别 - 纯标题（### 开头）保留
     if (el.type === 'heading1' || el.type === 'heading2' || el.type === 'heading3') {
       const pattern = this.analyzeContentPattern(el.text);

       if (pattern.matched && pattern.type === 'heading') {
         // 纯标题（### 开头），保留
         if (!preserveMarker || preserveMarker.type !== 'variable') {
           if (userIntent.preserveHeadings) {
             config.staticElements.push({
               type: 'heading',
               content: el.text,
               reason: '章节标题，保留作为静态内容'
             });
           }
         }
       } else if (pattern.matched && pattern.type === 'step') {
         // 标题中包含 Step X 内容，但不是组合类型，作为变量
         config.variableMappings.push({
           path: `d.steps[${pattern.extractedValue || 'content'}]`,
           content: el.text,
           type: 'text',
           reason: '检测到步骤相关标题，建议作为参数'
         });
       }
       continue;
     }

     // 5. 处理表格 - 根据 preserve loop 标记决定是否循环
     if (el.type === 'table') {
       const tableHasLoopMarker = preserveMarker?.type === 'loop' ||
                                   el.attributes?.hasLoopMarker === 'true';

       if (tableHasLoopMarker || userIntent.tableLoops) {
         const dataRows = el.dataRows || [];
         const headerRow = el.headerRow || '';
         const arrayPath = this.inferTableArrayPath(headerRow, config.templateType, el.index);
         const columnMappings = this.generateColumnMappings(headerRow, arrayPath);

         config.tableLoops.push({
           tableIndex: config.tableLoops.length,
           headerRow,
           dataRowCount: dataRows.length,
           arrayPath,
           columnMappings,
           reason: tableHasLoopMarker ?
             `根据 preserve 循环标记，建议循环处理` :
             `检测到数据表格，包含 ${dataRows.length} 行数据，建议循环`,
           confidence: tableHasLoopMarker ? 0.95 : this.calculateTableConfidence(el)
         });
       }
       continue;
     }

     // 6. 处理段落 - 检测特殊内容模式
     if (el.type === 'paragraph') {
       const pattern = this.analyzeContentPattern(el.text);

       if (pattern.matched && pattern.type === 'summary') {
         // 总结/日志类内容，建议变量化
         config.variableMappings.push({
           path: 'd.contextLog',
           content: el.text,
           type: 'text',
           reason: '检测到执行上下文日志内容，建议作为参数'
         });
       } else if (pattern.matched && pattern.type === 'image') {
         // 图片相关段落（但不是组合类型）
         config.variableMappings.push({
           path: `d.${this.slugify(pattern.extractedValue || 'screenshot')}`,
           content: el.text,
           type: 'image',
           reason: '检测到图片/截图内容，建议作为参数'
         });
       }
       continue;
     }

     // 7. 处理图片（非组合类型）
     if (el.type === 'image') {
       if (userIntent.imageLoops) {
         config.imageLoops.push({
           imageIndex: config.imageLoops.length,
           imageId: el.imageId || '',
           altText: el.altText || '',
           arrayPath: 'd.screenshots',
           reason: '检测到图片，建议作为数组循环',
           confidence: 0.8
         });
       } else {
         config.variableMappings.push({
           path: `d.screenshot${config.imageLoops.length + 1}`,
           content: el.altText || 'Image',
           type: 'image',
           reason: '检测到图片，建议作为参数'
         });
       }
     }
   }

   // 8. 如果收集到步骤截图，生成步骤数组参数
   if (stepScreenshots.length > 0) {
     for (const step of stepScreenshots) {
       config.variableMappings.push({
         path: `d.steps[${step.stepNum - 1}].screenshot`,
         content: step.text,
         type: 'image',
         reason: `步骤${step.stepNum}的截图参数 (imageId: ${step.imageId})`
       });
     }
     config.analysisNotes.push(`检测到 ${stepScreenshots.length} 个步骤截图组合变量`);
   }

   // 9. 添加分析说明
   const tables = elements.filter(e => e.type === 'table');
   config.analysisNotes.push(`检测到 ${tables.length} 个表格`);
   if (config.tableLoops.length > 0) {
     config.analysisNotes.push(`建议 ${config.tableLoops.length} 个表格使用循环`);
   }
   if (config.combinedVariables.length > 0) {
     config.analysisNotes.push(`检测到 ${config.combinedVariables.length} 个组合变量（文本+图片）`);
   }

   return config;
 }

 /**
  * 生成变量路径
  */
 private generateVariablePath(el: DocumentElement): string {
   const text = el.text;

   // 根据内容生成路径
   if (text.includes('上下文') || text.includes('日志')) {
     return 'd.contextLog';
   }

   if (text.includes('总结')) {
     return 'd.summary';
   }

   // 使用 slugify 生成路径
   return `d.${this.slugify(text)}`;
 }

 /**
  * 检测变量类型
  */
 private detectVariableType(el: DocumentElement): 'text' | 'number' | 'date' | 'image' | 'heading' {
   const text = el.text.toLowerCase();

   if (text.includes('screenshot') || text.includes('截图') || text.includes('图片')) {
     return 'image';
   }

   if (text.includes('日期') || text.includes('date')) {
     return 'date';
   }

   if (/^\d/.test(text)) {
     return 'number';
   }

   return 'text';
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

  /**
   * 检测步骤内容的类型
   * screenshot + 图片 → screenshot
   * 纯文本 → text
   */
  private detectStepContentType(content: string): string {
    const lower = content.toLowerCase();
    if (lower.includes('screenshot') || lower.includes('截图') || lower.includes('图片')) {
      return 'screenshot';
    }
    return 'text';
  }

  /**
   * 将文本转换为变量名
   * screenshot + 图片 → screenshot
   * 基于提供的执行上下文日志 → contextLog
   */
  private slugify(text: string): string {
    // 移除特殊字符，转小写
    let result = text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, '') // 保留字母数字下划线和中文
      .trim();

    // 中文关键词映射
    const chineseKeywords: Record<string, string> = {
      '截图': 'screenshot',
      '图片': 'image',
      '日志': 'log',
      '上下文': 'context',
      '执行': 'execution',
      '总结': 'summary',
      '步骤': 'step',
      '操作': 'operation'
    };

    // 替换中文关键词
    for (const [chinese, english] of Object.entries(chineseKeywords)) {
      if (result.includes(chinese)) {
        result = result.replace(chinese, english);
      }
    }

    // 如果还有中文或空白，移除
    result = result.replace(/[\u4e00-\u9fa5]/g, '').replace(/\s+/g, '_');

    // 如果结果为空，使用默认值
    if (!result) {
      result = 'value';
    }

    return result;
  }

  /**
   * 使用 AI 分析文档结构
   * 调用 AI Orchestrator 进行智能分析
   */
  private async analyzeWithAI(
    elements: DocumentElement[],
    context?: string,
    manualMarkings?: Record<string, string>,
    markingSummary?: string
  ): Promise<TemplateConfig | null> {
    try {
      // 获取可用的 AI 模型
      const modelsResponse = await axios.get(`${this.aiOrchestratorUrl}/ai/models`, {
        timeout: 5000,
      });
      const models = modelsResponse.data.models || [];

      if (models.length === 0) {
        this.logger.warn('No AI models available');
        return null;
      }

      // 选择第一个活跃的模型
      const activeModel = models.find((m: { status: string }) => m.status === 'active');
      if (!activeModel) {
        this.logger.warn('No active AI models available');
        return null;
      }

      // 构建 AI 分析提示词
      const prompt = this.buildAIAnalysisPrompt(elements, context, manualMarkings, markingSummary);

      // 调用 AI 模型（增加超时时间到180秒）
      const testResponse = await axios.post(
        `${this.aiOrchestratorUrl}/ai/models/${activeModel.id}/test`,
        { prompt },
        { timeout: 180000 },
      );

      if (!testResponse.data.success) {
        this.logger.warn(`AI call failed: ${testResponse.data.error}`);
        return null;
      }

      // 解析 AI 响应
      return this.parseAIAnalysisResponse(testResponse.data.response, elements);
    } catch (error) {
      this.logger.error(`AI analysis error: ${error}`);
      return null;
    }
  }

  /**
   * 构建 AI 分析提示词
   */
  private buildAIAnalysisPrompt(
    elements: DocumentElement[],
    context?: string,
    manualMarkings?: Record<string, string>,
    markingSummary?: string
  ): string {
    // 构建文档元素摘要（简化版）
    const elementSummary = elements.map((el, idx) => {
      const marking = manualMarkings?.[idx.toString()];
      const markingTag = marking ? ` [用户标记: ${marking}]` : '';

      if (el.type === 'table') {
        return `${idx + 1}. [TABLE] ${el.headerRow || ''}, rows=${el.attributes?.rows || el.dataRows?.length || 0}${markingTag}`;
      } else if (el.type === 'image') {
        return `${idx + 1}. [IMAGE] id="${el.imageId}"${markingTag}`;
      } else {
        const text = (el.text || '').substring(0, 80);
        return `${idx + 1}. [${el.type.toUpperCase()}] ${text}${markingTag}`;
      }
    }).join('\n');

    // 如果有手动标记，使用更详细的提示词
    if (manualMarkings && Object.keys(manualMarkings).length > 0) {
      return `用户已经手动标记了以下元素：

${markingSummary || ''}

文档元素列表：
${elementSummary}

请根据用户的手动标记，配置具体的参数名称、类型等信息。

规则：
1. 用户标记为"param"的元素 → variableMappings，需要生成合适的变量名（如d.title、d.name）
2. 用户标记为"loop"的元素 → tableLoops，需要生成循环路径（如d.steps）和列映射
3. 用户标记为"static"的元素 → staticElements，保留不变

返回JSON格式：
{
  "templateType": "类型",
  "staticElements": [{"type": "heading", "content": "...", "reason": "..."}],
  "tableLoops": [{"tableIndex": 0, "arrayPath": "d.steps", "reason": "...", "columnMappings": [...]}],
  "combinedVariables": [{"stepNumber": N, "textContent": "...", "imageId": "...", "reason": "..."}],
  "variableMappings": [{"path": "d.xxx", "content": "...", "type": "text", "reason": "..."}],
  "analysisNotes": ["..."]
}

只返回JSON，不要解释。`;
    }

    return `分析以下文档结构，返回JSON：

${elementSummary}

规则：
1. "### xxx" 标题 → staticElements (保留)
2. 表格有preserve或rows属性 → tableLoops (循环)
3. "Step N: screenshot" + 相邻图片 → combinedVariables (组合变量, stepNumber=N, imageId=图片ID)
4. 含"日志/上下文"的段落 → variableMappings

返回JSON格式：
{"templateType":"类型","staticElements":[],"tableLoops":[],"combinedVariables":[],"variableMappings":[],"analysisNotes":[]}

只返回JSON，不要解释。`;
  }

  /**
   * 解析 AI 分析响应
   */
  private parseAIAnalysisResponse(response: string, elements: DocumentElement[]): TemplateConfig {
    try {
      // 尝试提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const config: TemplateConfig = {
        templateType: parsed.templateType || '通用文档',
        staticElements: parsed.staticElements || [],
        tableLoops: this.validateTableLoops(parsed.tableLoops || [], elements),
        imageLoops: [],
        combinedVariables: this.validateCombinedVariables(parsed.combinedVariables || [], elements),
        variableMappings: parsed.variableMappings || [],
        analysisNotes: parsed.analysisNotes || [],
      };

      return config;
    } catch (error) {
      this.logger.error(`Failed to parse AI response: ${error}`);
      throw error;
    }
  }

  /**
   * 验证并补充表格循环配置
   */
  private validateTableLoops(tableLoops: any[], elements: DocumentElement[]): TableLoop[] {
    const result: TableLoop[] = [];

    for (const loop of tableLoops) {
      const tableElement = elements.find((el, idx) =>
        el.type === 'table' && idx === loop.tableIndex
      );

      if (tableElement) {
        result.push({
          tableIndex: loop.tableIndex,
          headerRow: tableElement.headerRow || '',
          dataRowCount: tableElement.dataRows?.length || 0,
          arrayPath: loop.arrayPath || 'd.items',
          columnMappings: this.generateColumnMappings(tableElement.headerRow || '', loop.arrayPath || 'd.items'),
          reason: loop.reason || 'AI 识别的循环表格',
          confidence: 0.9,
        });
      }
    }

    return result;
  }

  /**
   * 验证并补充组合变量配置
   */
  private validateCombinedVariables(combinedVars: any[], elements: DocumentElement[]): CombinedVariable[] {
    const result: CombinedVariable[] = [];

    for (const cv of combinedVars) {
      result.push({
        id: `combined-${cv.stepNumber}`,
        type: 'step-screenshot',
        stepNumber: cv.stepNumber,
        textContent: cv.textContent || '',
        imageId: cv.imageId || '',
        imagePath: `d.steps[${cv.stepNumber - 1}].screenshot`,
        reason: cv.reason || 'AI 识别的组合变量',
      });
    }

    return result;
  }

  /**
   * AI验证模版 - 利用模版自动生成验证报告
   * @param templatePath 模版文件路径
   * @param format 文件格式
   * @param prompt 验证提示词
   * @param testData 测试数据（JSON字符串）
   * @param templateConfig 模版配置
   */
  async verifyTemplate(
    templatePath: string,
    format: string,
    prompt: string,
    testData?: string,
    templateConfig?: any
  ): Promise<{ report: string; success: boolean }> {
    this.logger.log(`AI验证模版: ${templatePath}, 提示词: ${prompt}`);

    try {
      // 解析测试数据
      let parsedTestData: any = {};
      if (testData) {
        try {
          parsedTestData = JSON.parse(testData);
        } catch {
          this.logger.warn('测试数据JSON解析失败，使用空对象');
        }
      }

      // 获取模版配置或使用传入的配置
      const config = templateConfig || {};

      // 调用AI服务生成验证报告
      const aiResponse = await this.callAIForVerify(prompt, config, parsedTestData);

      return {
        report: aiResponse.report,
        success: true
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`AI验证失败: ${message}`);
      return {
        report: `验证失败: ${message}`,
        success: false
      };
    }
  }

  /**
   * 调用AI服务生成验证报告
   */
  private async callAIForVerify(
    prompt: string,
    templateConfig: any,
    testData: any
  ): Promise<{ report: string }> {
    const aiUrl = process.env.AI_ORCHESTRATOR_URL || 'http://localhost:3007';

    // 构建AI请求
    const systemPrompt = `你是一个文档模版验证助手。用户会提供一个模版配置和验证需求，你需要根据这些信息生成一份示例报告内容。

模版配置包含以下信息：
- templateType: 模版类型
- tableLoops: 表格循环配置
- imageLoops: 图片循环配置
- variableMappings: 变量映射

请根据用户的需求生成一份简洁的验证报告，说明：
1. 模版配置是否合理
2. 建议的测试数据结构
3. 生成示例内容（如果有测试数据）

回复格式使用Markdown。`;

    const userPrompt = `验证需求: ${prompt}

模版配置:
${JSON.stringify(templateConfig, null, 2)}

测试数据:
${JSON.stringify(testData, null, 2)}

请生成验证报告。`;

    try {
      // 获取活跃的AI模型
      const modelsResponse = await axios.get(`${aiUrl}/ai/models`);
      const models = modelsResponse.data?.models || [];
      const activeModel = models.find((m: { status: string }) => m.status === 'active');

      if (!activeModel) {
        this.logger.warn('No active AI models available for verification');
        return { report: '无法验证：没有可用的AI模型' };
      }

      // 调用AI模型
      const testResponse = await axios.post(
        `${aiUrl}/ai/models/${activeModel.id}/test`,
        { prompt: `${systemPrompt}\n\n${userPrompt}` },
        { timeout: 60000 },
      );

      if (!testResponse.data.success) {
        this.logger.warn(`AI verify call failed: ${testResponse.data.error}`);
        return { report: `验证失败: ${testResponse.data.error}` };
      }

      const report = testResponse.data.response || '无法生成验证报告';
      return { report };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`AI服务调用失败: ${message}`);
      return { report: `AI服务调用失败: ${message}` };
    }
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