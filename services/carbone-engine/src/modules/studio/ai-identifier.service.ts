/**
 * Carbone Engine - AI Identifier Service
 * AI自动标识服务，识别文档中可能需要标记为变量的内容
 */

import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

export interface VariableSuggestion {
  path: string;           // 建议的变量路径，如 d.user.name
  location: string;       // 在文档中的位置描述
  content: string;        // 原始文本内容
  reason: string;         // AI的建议理由
  confidence: number;     // 置信度 0-1
  type: 'text' | 'number' | 'date' | 'boolean';  // 变量类型
}

export interface LoopSuggestion {
  arrayPath: string;       // 循环路径，如 d.steps
  loopStart: string;       // 循环开始标记 {#d.steps}
  loopEnd: string;         // 循环结束标记 {/d.steps}
  tableIndex: number;      // 表格索引
  headerRow: string;       // 表头内容
  rowCount: number;        // 数据行数
  confidence: number;      // 置信度
  reason: string;          // 建议理由
}

export interface AIIdentifyResponse {
  suggestions: VariableSuggestion[];
  loops: LoopSuggestion[];   // 检测到的循环
  analyzedAt: string;
  documentStats: {
    totalTexts: number;
    potentialVariables: number;
    potentialLoops: number;
  };
  contextAnalysis?: {
    detectedTemplateType: string;
    suggestedVariables: string[];
  };
}

// 规则定义
interface IdentificationRule {
  name: string;
  pattern: RegExp;
  type: 'text' | 'number' | 'date' | 'boolean';
  pathSuggestion: (match: string, context?: string) => string;
  reason: string;
  confidence: number;
}

@Injectable()
export class AIIdentifierService {
  private rules: IdentificationRule[] = [
    // Carbone占位符模式 - 识别已有的占位符标记
    {
      name: 'carbone-placeholder',
      pattern: /\{([cdt]\.[a-zA-Z0-9_.]+)\}/g,
      type: 'text',
      pathSuggestion: (match) => match,
      reason: '检测到已有的Carbone变量标记',
      confidence: 1.0
    },
    // 简单占位符模式 - 如 {date}, {name} 等
    {
      name: 'simple-placeholder',
      pattern: /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
      type: 'text',
      pathSuggestion: (match) => {
        const name = match.replace('{', '').replace('}', '');
        return `d.${name}`;
      },
      reason: '检测到简单占位符，建议转换为Carbone变量格式',
      confidence: 0.95
    },
    // 日期模式
    {
      name: 'date-iso',
      pattern: /\b(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?)\b/g,
      type: 'date',
      pathSuggestion: () => 'd.date',
      reason: '检测到日期格式，建议标记为日期变量',
      confidence: 0.9
    },
    {
      name: 'date-chinese',
      pattern: /\b(\d{1,2}月\d{1,2}日)\b/g,
      type: 'date',
      pathSuggestion: () => 'd.date',
      reason: '检测到中文日期格式',
      confidence: 0.85
    },
    // 金额模式
    {
      name: 'currency',
      pattern: /[￥¥$]\s*([\d,]+\.?\d*)\s*(元|美元|EUR)?/g,
      type: 'number',
      pathSuggestion: () => 'd.amount',
      reason: '检测到金额格式，建议标记为金额变量',
      confidence: 0.95
    },
    {
      name: 'number-with-unit',
      pattern: /\b(\d+\.?\d*)\s*(元|件|个|张|份|次|人|天|小时|步)\b/g,
      type: 'number',
      pathSuggestion: (match, context) => {
        const unit = match.match(/(元|件|个|张|份|次|人|天|小时|步)/)?.[1];
        const unitPaths: Record<string, string> = {
          '元': 'd.amount',
          '件': 'd.quantity',
          '个': 'd.count',
          '张': 'd.count',
          '份': 'd.count',
          '次': 'd.times',
          '人': 'd.peopleCount',
          '天': 'd.days',
          '小时': 'd.hours',
          '步': 'd.steps'
        };
        return unitPaths[unit || ''] || 'd.number';
      },
      reason: '检测到带单位的数字',
      confidence: 0.8
    },
    // 电话号码
    {
      name: 'phone',
      pattern: /\b((?:\+?86[-\s]?)?1[3-9]\d{9}|0\d{2,3}[-\s]?\d{7,8})\b/g,
      type: 'text',
      pathSuggestion: () => 'd.phone',
      reason: '检测到电话号码格式',
      confidence: 0.9
    },
    // 邮箱
    {
      name: 'email',
      pattern: /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
      type: 'text',
      pathSuggestion: () => 'd.email',
      reason: '检测到电子邮箱格式',
      confidence: 0.95
    },
    // 身份证号
    {
      name: 'id-card',
      pattern: /\b(\d{17}[\dXx])\b/g,
      type: 'text',
      pathSuggestion: () => 'd.idNumber',
      reason: '检测到身份证号码格式',
      confidence: 0.9
    },
    // 中文名称模式（如"姓名：张三"）
    {
      name: 'name-field',
      pattern: /(?:姓名|名字|客户名|用户名|收件人|发件人|联系人)[：:]\s*([^\s\n\r,，。；;]+)/g,
      type: 'text',
      pathSuggestion: () => 'd.name',
      reason: '检测到姓名字段，建议标记为姓名变量',
      confidence: 0.85
    },
    // 地址模式
    {
      name: 'address',
      pattern: /(?:地址|住址|收货地址)[：:]\s*([^\n\r]+)/g,
      type: 'text',
      pathSuggestion: () => 'd.address',
      reason: '检测到地址字段',
      confidence: 0.85
    },
    // 公司/组织名称
    {
      name: 'company',
      pattern: /(?:公司|单位|企业)[：:]\s*([^\n\r,，]+)/g,
      type: 'text',
      pathSuggestion: () => 'd.company',
      reason: '检测到公司名称字段',
      confidence: 0.8
    },
    // 编号/单号
    {
      name: 'serial-number',
      pattern: /(?:编号|单号|订单号|合同号|发票号)[：:]\s*([A-Za-z0-9\-_]+)/g,
      type: 'text',
      pathSuggestion: () => 'd.serialNumber',
      reason: '检测到编号字段',
      confidence: 0.85
    },
    // 百分比
    {
      name: 'percentage',
      pattern: /\b(\d+\.?\d*)\s*%/g,
      type: 'number',
      pathSuggestion: () => 'd.percentage',
      reason: '检测到百分比数值',
      confidence: 0.9
    },
    // 运维报告特定模式
    {
      name: 'step-count',
      pattern: /(?:总步骤数|步骤数)[：:]*\s*(\d+)\s*步/g,
      type: 'number',
      pathSuggestion: () => 'd.totalSteps',
      reason: '检测到步骤数统计',
      confidence: 0.95
    },
    {
      name: 'success-count',
      pattern: /(?:成功步骤数|成功数)[：:]*\s*(\d+)\s*步/g,
      type: 'number',
      pathSuggestion: () => 'd.successSteps',
      reason: '检测到成功步骤数',
      confidence: 0.95
    },
    {
      name: 'search-keyword',
      pattern: /(?:搜索|查询)[：:]*\s*[\""]([^\"\"]+)[\""]/g,
      type: 'text',
      pathSuggestion: () => 'd.searchKeyword',
      reason: '检测到搜索关键词',
      confidence: 0.9
    },
    {
      name: 'operation-type',
      pattern: /\((\w+)\)[：:]/g,
      type: 'text',
      pathSuggestion: (match) => {
        const op = match.replace(/[()：:]/g, '').trim();
        return `d.operations.${op}`;
      },
      reason: '检测到操作类型标记',
      confidence: 0.85
    },
    {
      name: 'screenshot-count',
      pattern: /(?:截图|捕获)[：:]*\s*(\d+)\s*次/g,
      type: 'number',
      pathSuggestion: () => 'd.screenshotCount',
      reason: '检测到截图次数',
      confidence: 0.9
    },
    // 时间戳模式
    {
      name: 'timestamp',
      pattern: /\b(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})\b/g,
      type: 'date',
      pathSuggestion: () => 'd.timestamp',
      reason: '检测到时间戳格式',
      confidence: 0.95
    },
    // URL模式
    {
      name: 'url',
      pattern: /\b(https?:\/\/[^\s<>"{}|\\^`[\]]+)\b/g,
      type: 'text',
      pathSuggestion: () => 'd.url',
      reason: '检测到URL地址',
      confidence: 0.9
    },
    // 版本号
    {
      name: 'version',
      pattern: /\b(v?\d+\.\d+\.\d+)\b/g,
      type: 'text',
      pathSuggestion: () => 'd.version',
      reason: '检测到版本号格式',
      confidence: 0.85
    }
  ];

  /**
   * 分析模板文档并生成变量建议
   */
  async identifyVariables(
    templatePath: string,
    format: string,
    context?: string
  ): Promise<AIIdentifyResponse> {
    // 读取文档内容
    const content = await this.extractDocumentContent(templatePath, format);

    // 应用规则进行识别
    const suggestions: VariableSuggestion[] = [];
    const processedContents = new Set<string>();

    let totalTexts = 0;

    for (const rule of this.rules) {
      const matches = content.matchAll(rule.pattern);

      for (const match of matches) {
        const content_text = match[1] || match[0];

        // 避免重复
        if (processedContents.has(content_text)) continue;
        processedContents.add(content_text);

        // 计算位置
        const location = this.findLocation(content, match.index || 0);

        suggestions.push({
          path: rule.pathSuggestion(content_text, context),
          location,
          content: content_text,
          reason: rule.reason,
          confidence: rule.confidence,
          type: rule.type
        });

        totalTexts++;
      }
    }

    // 检测已有的变量标记
    const existingVariables = this.extractExistingVariables(content);

    // 排除已存在的变量
    const filteredSuggestions = suggestions.filter(s =>
      !existingVariables.some(v => s.content.includes(v) || v.includes(s.content))
    );

    // 检测循环结构
    const loops = await this.detectLoops(templatePath, format, context);

    // 分析上下文
    const contextAnalysis = context ? this.analyzeContext(context, content) : undefined;

    return {
      suggestions: filteredSuggestions,
      loops,
      analyzedAt: new Date().toISOString(),
      documentStats: {
        totalTexts,
        potentialVariables: filteredSuggestions.length,
        potentialLoops: loops.length
      },
      contextAnalysis
    };
  }

  /**
   * 检测文档中的循环结构
   */
  private async detectLoops(
    templatePath: string,
    format: string,
    context?: string
  ): Promise<LoopSuggestion[]> {
    const loops: LoopSuggestion[] = [];

    if (format !== 'docx') {
      return loops;
    }

    try {
      const buffer = fs.readFileSync(templatePath);
      const zip = await JSZip.loadAsync(buffer);
      const documentFile = zip.file('word/document.xml');

      if (!documentFile) {
        return loops;
      }

      const xmlContent = await documentFile.async('text');

      // 查找所有表格
      const tablePattern = /<w:tbl[^>]*>([\s\S]*?)<\/w:tbl>/g;
      let tableMatch;
      let tableIndex = 0;

      while ((tableMatch = tablePattern.exec(xmlContent)) !== null) {
        const tableContent = tableMatch[1];

        // 提取行
        const rowPattern = /<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g;
        const rows: string[] = [];
        let rowMatch;

        while ((rowMatch = rowPattern.exec(tableContent)) !== null) {
          rows.push(rowMatch[1]);
        }

        // 如果表格有多于2行，可能是数据表格
        if (rows.length > 2) {
          // 提取表头
          const headerCells = this.extractCellTexts(rows[0]);
          const headerText = headerCells.join(' | ');

          // 根据表头内容推断循环路径
          let arrayPath = this.inferLoopPath(headerText, context);

          loops.push({
            arrayPath,
            loopStart: `{#${arrayPath}}`,
            loopEnd: `{/${arrayPath}}`,
            tableIndex,
            headerRow: headerText.substring(0, 100),
            rowCount: rows.length - 1, // 减去表头行
            confidence: this.calculateLoopConfidence(headerText, rows.length),
            reason: `检测到数据表格，包含 ${rows.length - 1} 行数据，表头: "${headerText.substring(0, 50)}..."`
          });
        }

        tableIndex++;
      }
    } catch (error) {
      console.error('Error detecting loops:', error);
    }

    return loops;
  }

  /**
   * 提取单元格文本
   */
  private extractCellTexts(rowXml: string): string[] {
    const cells: string[] = [];
    const cellPattern = /<w:tc[^>]*>([\s\S]*?)<\/w:tc>/g;
    let cellMatch;

    while ((cellMatch = cellPattern.exec(rowXml)) !== null) {
      const cellContent = cellMatch[1];
      const textPattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      let textMatch;
      let cellText = '';

      while ((textMatch = textPattern.exec(cellContent)) !== null) {
        cellText += textMatch[1];
      }

      cells.push(cellText.trim());
    }

    return cells;
  }

  /**
   * 根据表头推断循环路径
   */
  private inferLoopPath(headerText: string, context?: string): string {
    const headerLower = headerText.toLowerCase();

    // 基于表头关键词推断
    if (headerLower.includes('step') || headerLower.includes('步骤')) {
      return 'd.steps';
    }
    if (headerLower.includes('item') || headerLower.includes('项目') || headerLower.includes('商品')) {
      return 'd.items';
    }
    if (headerLower.includes('user') || headerLower.includes('用户') || headerLower.includes('人员')) {
      return 'd.users';
    }
    if (headerLower.includes('product') || headerLower.includes('产品')) {
      return 'd.products';
    }
    if (headerLower.includes('action') || headerLower.includes('操作')) {
      return 'd.actions';
    }
    if (headerLower.includes('result') || headerLower.includes('结果')) {
      return 'd.results';
    }
    if (headerLower.includes('log') || headerLower.includes('日志')) {
      return 'd.logs';
    }
    if (headerLower.includes('screenshot') || headerLower.includes('截图')) {
      return 'd.screenshots';
    }
    if (headerLower.includes('error') || headerLower.includes('错误')) {
      return 'd.errors';
    }

    // 基于上下文推断
    if (context) {
      const contextLower = context.toLowerCase();
      if (contextLower.includes('运维') || contextLower.includes('自动化')) {
        return 'd.steps';
      }
      if (contextLower.includes('订单') || contextLower.includes('购物')) {
        return 'd.orders';
      }
      if (contextLower.includes('报告')) {
        return 'd.items';
      }
    }

    return 'd.items';
  }

  /**
   * 计算循环置信度
   */
  private calculateLoopConfidence(headerText: string, rowCount: number): number {
    let confidence = 0.5;

    // 数据行越多，置信度越高
    if (rowCount > 5) confidence += 0.2;
    else if (rowCount > 3) confidence += 0.1;

    // 表头包含常见关键词
    const keywords = ['step', 'action', 'result', 'status', 'name', 'date', '步骤', '操作', '结果', '状态', '名称', '日期'];
    const headerLower = headerText.toLowerCase();
    for (const keyword of keywords) {
      if (headerLower.includes(keyword)) {
        confidence += 0.1;
        break;
      }
    }

    return Math.min(confidence, 0.95);
  }

  /**
   * 分析用户上下文
   */
  private analyzeContext(context: string, content: string): { detectedTemplateType: string; suggestedVariables: string[] } {
    const contextLower = context.toLowerCase();
    const suggestedVariables: string[] = [];

    // 检测模板类型
    let detectedTemplateType = '通用模板';

    if (contextLower.includes('运维') || contextLower.includes('自动化') || content.includes('步骤') || content.includes('操作')) {
      detectedTemplateType = '运维自动化报告';
      suggestedVariables.push('d.totalSteps', 'd.successSteps', 'd.failedSteps', 'd.successRate');
      suggestedVariables.push('d.startTime', 'd.endTime', 'd.duration');
      suggestedVariables.push('d.steps[].step', 'd.steps[].action', 'd.steps[].result', 'd.steps[].status');
    }

    if (contextLower.includes('订单') || contextLower.includes('购物') || content.includes('订单号')) {
      detectedTemplateType = '订单报告';
      suggestedVariables.push('d.orderId', 'd.customerName', 'd.totalAmount', 'd.orderDate');
      suggestedVariables.push('d.items[].name', 'd.items[].quantity', 'd.items[].price');
    }

    if (contextLower.includes('报告') || content.includes('报告')) {
      detectedTemplateType = '分析报告';
      suggestedVariables.push('d.title', 'd.author', 'd.date', 'd.summary');
    }

    return {
      detectedTemplateType,
      suggestedVariables: [...new Set(suggestedVariables)]
    };
  }

  /**
   * 提取文档文本内容
   */
  private async extractDocumentContent(filePath: string, format: string): Promise<string> {
    const buffer = fs.readFileSync(filePath);

    switch (format) {
      case 'docx':
        return this.extractDocxContent(buffer);
      case 'xlsx':
        return this.extractXlsxContent(buffer);
      case 'pptx':
        return this.extractPptxContent(buffer);
      case 'html':
        return buffer.toString('utf-8');
      default:
        return buffer.toString('utf-8');
    }
  }

  /**
   * 提取Word文档文本
   */
  private async extractDocxContent(buffer: Buffer): Promise<string> {
    const zip = await JSZip.loadAsync(buffer);
    const documentFile = zip.file('word/document.xml');

    if (!documentFile) {
      throw new Error('Invalid DOCX file: document.xml not found');
    }

    const xmlContent = await documentFile.async('text');

    // 提取所有文本节点
    const textMatches = xmlContent.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    const texts = textMatches.map(m => m.replace(/<[^>]+>/g, '')).join(' ');

    return texts;
  }

  /**
   * 提取Excel文档文本
   */
  private async extractXlsxContent(buffer: Buffer): Promise<string> {
    const zip = await JSZip.loadAsync(buffer);
    const texts: string[] = [];

    // 获取所有工作表
    const sheetFiles = Object.keys(zip.files).filter(name =>
      name.match(/xl\/worksheets\/sheet\d+\.xml$/)
    );

    for (const sheetFile of sheetFiles) {
      const file = zip.file(sheetFile);
      if (file) {
        const content = await file.async('text');
        const textMatches = content.match(/<v>([^<]*)<\/v>/g) || [];
        texts.push(...textMatches.map(m => m.replace(/<[^>]+>/g, '')));
      }
    }

    // 也检查共享字符串
    const sharedStrings = zip.file('xl/sharedStrings.xml');
    if (sharedStrings) {
      const content = await sharedStrings.async('text');
      const textMatches = content.match(/<t[^>]*>([^<]*)<\/t>/g) || [];
      texts.push(...textMatches.map(m => m.replace(/<[^>]+>/g, '')));
    }

    return texts.join(' ');
  }

  /**
   * 提取PPT文档文本
   */
  private async extractPptxContent(buffer: Buffer): Promise<string> {
    const zip = await JSZip.loadAsync(buffer);
    const texts: string[] = [];

    // 获取所有幻灯片
    const slideFiles = Object.keys(zip.files).filter(name =>
      name.match(/ppt\/slides\/slide\d+\.xml$/)
    );

    for (const slideFile of slideFiles) {
      const file = zip.file(slideFile);
      if (file) {
        const content = await file.async('text');
        const textMatches = content.match(/<a:t>([^<]*)<\/a:t>/g) || [];
        texts.push(...textMatches.map(m => m.replace(/<[^>]+>/g, '')));
      }
    }

    return texts.join(' ');
  }

  /**
   * 提取已存在的变量标记
   */
  private extractExistingVariables(content: string): string[] {
    const variablePattern = /\{[cdt]\.([^}]+)\}/g;
    const variables: string[] = [];

    let match;
    while ((match = variablePattern.exec(content)) !== null) {
      variables.push(match[1]);
    }

    return variables;
  }

  /**
   * 计算文本在文档中的位置
   */
  private findLocation(content: string, index: number): string {
    const beforeMatch = content.substring(0, index);
    const lines = beforeMatch.split('\n');
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;

    // 获取周围上下文
    const start = Math.max(0, index - 20);
    const end = Math.min(content.length, index + 30);
    const context = content.substring(start, end).replace(/\s+/g, ' ').trim();

    return `位置: 第${line}行, 上下文: "...${context}..."`;
  }
}