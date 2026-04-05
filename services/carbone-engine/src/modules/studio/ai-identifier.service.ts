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

export interface AIIdentifyResponse {
  suggestions: VariableSuggestion[];
  analyzedAt: string;
  documentStats: {
    totalTexts: number;
    potentialVariables: number;
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
      pattern: /\b(\d+\.?\d*)\s*(元|件|个|张|份|次|人|天|小时)\b/g,
      type: 'number',
      pathSuggestion: (match, context) => {
        const unit = match.match(/(元|件|个|张|份|次|人|天|小时)/)?.[1];
        const unitPaths: Record<string, string> = {
          '元': 'd.amount',
          '件': 'd.quantity',
          '个': 'd.count',
          '张': 'd.count',
          '份': 'd.count',
          '次': 'd.times',
          '人': 'd.peopleCount',
          '天': 'd.days',
          '小时': 'd.hours'
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

    return {
      suggestions: filteredSuggestions,
      analyzedAt: new Date().toISOString(),
      documentStats: {
        totalTexts,
        potentialVariables: filteredSuggestions.length
      }
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