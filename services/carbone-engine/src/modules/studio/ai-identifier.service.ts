/**
 * Carbone Engine - AI Identifier Service
 * AI自动标识服务，基于多阶段AI分析生成模版配置
 *
 * 新的多阶段处理流程：
 * 1. 文档理解 - AI分析文档整体内容、结构、章节
 * 2. 分段参数化 - 根据理解结果，对每个章节进行语义识别和参数化
 * 3. 整合确认 - 对所有结果进行整合和最终确认
 */

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import axios from 'axios';
import { DocumentElement, DocumentStructure, PreserveMarker } from './document-structure.service';

/**
 * 处理阶段枚举
 */
export enum ProcessingStage {
  DOCUMENT_UNDERSTANDING = 'document_understanding',
  SECTION_ANALYSIS = 'section_analysis',
  INTEGRATION = 'integration',
  COMPLETE = 'complete'
}

/**
 * 进度信息
 */
export interface ProcessingProgress {
  stage: ProcessingStage;
  stageName: string;  // 中文阶段名称
  progress: number;   // 0-100
  message: string;    // 详细进度消息
  currentSection?: string;  // 当前处理的章节
}

/**
 * 文档理解结果
 */
export interface DocumentUnderstanding {
  documentType: string;      // 文档类型判断
  mainPurpose: string;       // 文档主要用途
  sections: Array<{
    name: string;            // 章节名称（如"第一条"、"第二条"）
    content: string;         // 章节内容摘要
    purpose: string;         // 章节用途说明
    needsParameterization: boolean;  // 是否需要参数化
    estimatedParams: string[];  // 预估可能需要的参数
  }>;
  parties: Array<{
    role: string;            // 角色（甲方、乙方）
    fieldsNeeded: string[];  // 需要的字段（名称、地址等）
  }>;
}

/**
 * 章节参数化结果
 */
export interface SectionParameterization {
  sectionName: string;
  suggestions: Array<{
    originalText: string;
    variablePath: string;
    variableName: string;
    significance: string;    // 字段意义说明
    context: string;         // 原文上下文
    confidence: number;
  }>;
}

/**
 * 参数路径映射规则
 * 用于将AI生成的变量路径规范化为标准路径
 */
export interface PathMappingRule {
  patterns: string[];      // 匹配模式（支持通配符）
  standardPath: string;    // 标准路径
  description: string;     // 描述
}

/**
 * 默认参数路径映射表
 * 定义AI可能生成的变量路径到标准路径的映射
 */
const DEFAULT_PATH_MAPPINGS: PathMappingRule[] = [
  // 执行摘要/总结相关
  {
    patterns: ['d.executionSummary', 'd.executionsummary', 'd.execution_summary', 'd.summaryText', 'd.summarytext'],
    standardPath: 'd.summary',
    description: '执行摘要/总结内容'
  },
  // 分析报告相关
  {
    patterns: ['d.analysisReport', 'd.analysisreport', 'd.analysis_report', 'd.analysisText', 'd.analysistext', 'd.analysisResult', 'd.analysisresult'],
    standardPath: 'd.analysis',
    description: '分析报告内容'
  },
  // 日期/时间相关
  {
    patterns: ['d.generatedDate', 'd.generateddate', 'd.generated_date', 'd.datetime', 'd.timestamp', 'd.createTime', 'd.createtime', 'd.createdAt'],
    standardPath: 'd.date',
    description: '日期/时间'
  },
  // 标题相关
  {
    patterns: ['d.docTitle', 'd.doctitle', 'd.doc_title', 'd.reportTitle', 'd.reporttitle', 'd.mainTitle', 'd.maintitle'],
    standardPath: 'd.title',
    description: '文档标题'
  },
  // 内容相关
  {
    patterns: ['d.mainContent', 'd.maincontent', 'd.main_content', 'd.bodyContent', 'd.bodycontent', 'd.contentText', 'd.contenttext'],
    standardPath: 'd.content',
    description: '主要内容'
  },
  // 描述相关
  {
    patterns: ['d.descriptionText', 'd.descriptiontext', 'd.desc', 'd.detail', 'd.details'],
    standardPath: 'd.description',
    description: '描述内容'
  },
  // 结果相关
  {
    patterns: ['d.resultText', 'd.resulttext', 'd.outcome', 'd.conclusion'],
    standardPath: 'd.result',
    description: '结果内容'
  },
  // 备注相关
  {
    patterns: ['d.noteText', 'd.notetext', 'd.comment', 'd.comments', 'd.remark'],
    standardPath: 'd.notes',
    description: '备注/注释'
  },
];

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
  // 分组循环（用户手动指定的一组连续元素作为循环）
  groupLoops?: GroupLoop[];
  // 分组循环（用户手动指定的一组连续元素作为循环）
  elementGroups?: Record<string, number[]>;
  // 忽略的元素索引
  ignoredElements?: number[];
  // 忽略的分组ID
  ignoredGroups?: string[];
  // 分析说明
  analysisNotes: string[];
}

/**
 * 分组循环配置
 * 用户手动创建的一组元素，作为循环体
 */
export interface GroupLoop {
  // 分组ID
  groupId?: string;
  // 元素索引列表
  groupIndices: number[];
  // 循环数组路径
  arrayPath: string;
  // 文本元素索引（如果分组中包含文本）
  textElement?: number;
  // 图片元素索引（如果分组中包含图片）
  imageElement?: number;
  // 原因说明
  reason: string;
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
  columnIndex?: number;    // 列索引（可选）
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
  sampleValue: string;
  index: number;
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
  rawSuggestions?: any[];  // 原始建议数据，用于前端显示更详细的信息
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
    usedAI?: boolean;  // 是否使用了AI分析
    aiServiceUrl?: string;  // AI服务地址
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
   * 直接从文档内容进行AI识别 - 用于Office插件
   * 无需上传模板文件，直接对从Office获取的文本内容进行AI分析
   * 识别需要填充的空白部分（如合同中的空格），生成模板变量建议
   *
   * @param documentContent 文档文本内容
   * @param documentType 文档类型
   * @param templateType 模板类型
   * @param context 上下文信息
   * @param customRules 自定义识别规则
   */
  async identifyFromContent(
    documentContent: string,
    documentType: string,
    templateType: string,
    context?: string,
    customRules?: Array<{ pattern: string; targetPath: string; description?: string }>
  ): Promise<AIIdentifyResponse> {
    this.logger.log(`Direct AI identify from content, type: ${templateType}, content length: ${documentContent.length}`);

    // 1. 预处理文档内容，提取需要填充的部分
    const blankPatterns = this.extractBlankPatterns(documentContent, templateType);
    this.logger.log(`Found ${blankPatterns.length} blank patterns`);

    // 2. 调用AI分析空白部分，生成变量建议
    // 返回建议以及是否使用了AI的标记
    const { suggestions, usedAI } = await this.analyzeBlankPatternsWithAI(blankPatterns, documentContent, templateType, context, customRules);

    // 记录识别方式（AI还是规则）
    this.logger.log(`识别方式: ${usedAI ? 'AI智能识别' : '规则匹配（AI服务不可用）'}`);

    // 3. 生成模板配置
    const templateConfig: TemplateConfig = {
      templateType,
      staticElements: [],
      tableLoops: [],
      imageLoops: [],
      combinedVariables: [],
      variableMappings: [],  // 不再使用 suggestions 生成 variableMappings
      analysisNotes: []  // 分析说明
    };

    // 4. 生成统计信息
    const documentStats = {
      totalElements: blankPatterns.length,
      tables: 0,
      images: 0,
      stepScreenshots: 0,
      potentialLoops: 0
    };

    // 转换 suggestions 为 VariableMapping 格式
    const variableMappings: VariableMapping[] = suggestions.map((s, idx) => ({
      path: s.suggestedName,
      sampleValue: s.originalText,
      index: idx,
      type: 'text' as const,
      reason: s.details?.significance || ''
    }));

    return {
      templateConfig,
      suggestions: variableMappings,  // 使用正确格式的 suggestions
      rawSuggestions: suggestions,  // 保留原始建议数据用于前端显示
      loops: [],
      images: [],
      combinedVariables: [],
      analyzedAt: new Date().toISOString(),
      documentStats,
      contextAnalysis: {
        detectedTemplateType: templateType,
        userIntent: context || 'Office文档模板化',
        usedAI,  // 标记是否使用了真正的AI分析
        aiServiceUrl: this.aiOrchestratorUrl  // 显示AI服务地址
      }
    };
  }

  /**
   * 多阶段AI识别 - 用于Office插件
   * 新的处理流程：
   * 1. 文档理解 - AI分析文档整体内容、结构、章节、当事人等
   * 2. 分段参数化 - 根据理解结果，对每个需要参数化的章节进行语义识别
   * 3. 整合确认 - 对所有结果进行整合和最终确认
   * 4. 返回结果
   *
   * @param documentContent 文档文本内容
   * @param documentType 文档类型
   * @param templateType 模板类型
   * @param context 上下文信息
   * @param progressCallback 进度回调函数，用于实时报告处理进度
   */
  async identifyFromContentMultiStage(
    documentContent: string,
    documentType: string,
    templateType: string,
    context?: string,
    progressCallback?: (progress: ProcessingProgress) => void
  ): Promise<AIIdentifyResponse> {
    this.logger.log(`开始多阶段AI识别, 类型: ${templateType}, 内容长度: ${documentContent.length}`);

    // 定义进度报告辅助函数
    const reportProgress = (stage: ProcessingStage, stageName: string, progress: number, message: string, currentSection?: string) => {
      const progressInfo: ProcessingProgress = {
        stage,
        stageName,
        progress,
        message,
        currentSection
      };
      this.logger.log(`进度报告: [${stageName}] ${progress}% - ${message}`);
      if (progressCallback) {
        progressCallback(progressInfo);
      }
    };

    try {
      // ===== 阶段1: 文档理解 =====
      reportProgress(ProcessingStage.DOCUMENT_UNDERSTANDING, '文档理解', 0, '正在分析文档整体结构和内容...');

      const documentUnderstanding = await this.analyzeDocumentUnderstanding(documentContent, templateType, context);

      reportProgress(ProcessingStage.DOCUMENT_UNDERSTANDING, '文档理解', 100,
        `文档理解完成，识别到 ${documentUnderstanding.sections.length} 个章节，${documentUnderstanding.parties.length} 个当事人`);

      // ===== 预处理：提取所有空白位置 =====
      // 使用规则预处理，确保所有空白都被识别出来
      reportProgress(ProcessingStage.SECTION_ANALYSIS, '预处理', 0, '正在预提取文档中的空白位置...');

      const preExtractedBlanks = this.extractBlankPatterns(documentContent, templateType);
      this.logger.log(`预处理提取到 ${preExtractedBlanks.length} 个空白位置`);

      reportProgress(ProcessingStage.SECTION_ANALYSIS, '预处理', 10,
        `预提取完成，发现 ${preExtractedBlanks.length} 个潜在空白位置`);

      // ===== 阶段2: 分段参数化 =====
      reportProgress(ProcessingStage.SECTION_ANALYSIS, '分段参数化', 0, '开始对各章节进行语义分析...');

      const allSectionResults: SectionParameterization[] = [];
      const sectionsToProcess = documentUnderstanding.sections.filter(s => s.needsParameterization);

      for (let i = 0; i < sectionsToProcess.length; i++) {
        const section = sectionsToProcess[i];
        const sectionProgress = Math.round((i / sectionsToProcess.length) * 80);

        reportProgress(ProcessingStage.SECTION_ANALYSIS, '分段参数化', sectionProgress,
          `正在分析章节: ${section.name}`, section.name);

        // 提取该章节的完整内容（从原文中提取）
        const sectionContent = this.extractSectionContent(documentContent, section.name);

        // 调用AI进行语义参数化（传入预处理的空白位置）
        // 将预处理的空白按章节分组，传递给AI分析
        const sectionBlanks = preExtractedBlanks.filter(b =>
          b.chapter === section.name || b.chapter.includes(section.name) || section.name.includes(b.chapter)
        );

        const sectionResult = await this.parameterizeSection(
          section.name,
          sectionContent,
          documentUnderstanding,
          templateType,
          sectionBlanks  // 传入预处理的空白位置
        );

        allSectionResults.push(sectionResult);

        reportProgress(ProcessingStage.SECTION_ANALYSIS, '分段参数化', sectionProgress + Math.round(80 / sectionsToProcess.length),
          `章节 ${section.name} 分析完成，识别到 ${sectionResult.suggestions.length} 个参数`);
      }

      reportProgress(ProcessingStage.SECTION_ANALYSIS, '分段参数化', 100,
        `分段参数化完成，共识别到 ${allSectionResults.reduce((sum, s) => sum + s.suggestions.length, 0)} 个潜在参数`);

      // ===== 阶段3: 整合确认 =====
      reportProgress(ProcessingStage.INTEGRATION, '整合确认', 0, '正在整合和确认所有识别结果...');

      const finalSuggestions = await this.integrateAndConfirm(
        allSectionResults,
        documentUnderstanding,
        documentContent,
        templateType
      );

      reportProgress(ProcessingStage.INTEGRATION, '整合确认', 100,
        `整合确认完成，最终确认 ${finalSuggestions.length} 个有效参数`);

      // ===== 阶段4: 完成 =====
      reportProgress(ProcessingStage.COMPLETE, '完成', 100, 'AI识别处理完成');

      // 构建返回结果
      const templateConfig: TemplateConfig = {
        templateType: documentUnderstanding.documentType,
        staticElements: [],
        tableLoops: [],
        imageLoops: [],
        combinedVariables: [],
        variableMappings: [],
        analysisNotes: [`文档类型: ${documentUnderstanding.documentType}`, `主要用途: ${documentUnderstanding.mainPurpose}`]
      };

      const variableMappings: VariableMapping[] = finalSuggestions.map((s, idx) => ({
        path: s.variablePath,
        sampleValue: s.originalText,
        index: idx,
        type: 'text' as const,
        reason: s.significance
      }));

      const documentStats = {
        totalElements: finalSuggestions.length,
        tables: 0,
        images: 0,
        stepScreenshots: 0,
        potentialLoops: 0
      };

      return {
        templateConfig,
        suggestions: variableMappings,
        rawSuggestions: finalSuggestions,
        loops: [],
        images: [],
        combinedVariables: [],
        analyzedAt: new Date().toISOString(),
        documentStats,
        contextAnalysis: {
          detectedTemplateType: documentUnderstanding.documentType,
          userIntent: documentUnderstanding.mainPurpose,
          usedAI: true,
          aiServiceUrl: this.aiOrchestratorUrl
        }
      };
    } catch (error: any) {
      this.logger.error('多阶段AI识别失败:', error);
      reportProgress(ProcessingStage.COMPLETE, '处理失败', 0, `处理失败: ${error.message}`);

      // 失败时回退到简化处理
      this.logger.warn('回退到简化处理模式');
      return this.identifyFromContent(documentContent, documentType, templateType, context);
    }
  }

  /**
   * 阶段1: 文档理解
   * AI分析文档整体内容，识别文档类型、结构、章节、当事人等
   */
  private async analyzeDocumentUnderstanding(
    documentContent: string,
    templateType: string,
    context?: string
  ): Promise<DocumentUnderstanding> {
    this.logger.log('阶段1: 开始文档理解分析');

    const prompt = `你是一个专业的文档分析专家。请仔细阅读以下文档内容，分析并理解文档的整体结构。

文档类型提示: ${templateType}
${context ? `用户说明: ${context}` : ''}

【文档内容】
${documentContent.substring(0, Math.min(3000, documentContent.length))}
${documentContent.length > 3000 ? '\n...(文档较长，已截取前3000字符)' : ''}

请返回JSON格式的分析结果：
{
  "documentType": "合同/协议/报告/证书等",
  "mainPurpose": "文档的主要用途和目的",
  "sections": [
    {
      "name": "第一条 协议双方",
      "content": "该章节的主要内容摘要",
      "purpose": "该章节在文档中的作用",
      "needsParameterization": true,
      "estimatedParams": ["甲方名称", "甲方地址"]
    }
  ],
  "parties": [
    {
      "role": "甲方",
      "fieldsNeeded": ["名称", "地址", "代表人", "联系方式"]
    }
  ]
}

【分析要求】
1. 识别文档的主要类型和用途
2. 提取所有章节/条款的结构（如"第一条"、"第二条"等）
3. 判断每个章节是否需要参数化（是否包含空白、待填写内容）
4. 识别文档涉及的当事人角色（如甲方、乙方、委托方等）
5. estimatedParams 列出该章节预估可能需要的参数名称

只返回JSON格式，不要其他解释。`;

    try {
      const aiResponse = await this.callAIService(prompt);

      // 解析AI返回的文档理解结果
      if (aiResponse && aiResponse.documentType) {
        this.logger.log(`文档理解成功: 类型=${aiResponse.documentType}, 章节数=${aiResponse.sections?.length || 0}`);
        return {
          documentType: aiResponse.documentType || templateType,
          mainPurpose: aiResponse.mainPurpose || '文档模板化处理',
          sections: aiResponse.sections || [],
          parties: aiResponse.parties || []
        };
      }

      // 如果AI返回格式不正确，使用基础理解
      this.logger.warn('AI文档理解返回格式异常，使用基础理解');
      return this.buildBasicDocumentUnderstanding(documentContent, templateType);
    } catch (error: any) {
      this.logger.error('文档理解AI调用失败:', error);
      return this.buildBasicDocumentUnderstanding(documentContent, templateType);
    }
  }

  /**
   * 构建基础文档理解（当AI失败时的后备方案）
   */
  private buildBasicDocumentUnderstanding(content: string, templateType: string): DocumentUnderstanding {
    // 提取章节结构
    const chapterStructure = this.extractChapterStructure(content);

    const sections = chapterStructure.map(chapter => ({
      name: chapter.title,
      content: content.substring(chapter.startPos, Math.min(chapter.endPos, chapter.startPos + 200)),
      purpose: '文档章节内容',
      needsParameterization: this.checkNeedsParameterization(content.substring(chapter.startPos, chapter.endPos)),
      estimatedParams: []
    }));

    // 检测当事人角色
    const partyKeywords = ['甲方', '乙方', '委托方', '受托方', '买方', '卖方', '出租方', '承租方'];
    const parties = partyKeywords
      .filter(keyword => content.includes(keyword))
      .map(role => ({
        role,
        fieldsNeeded: ['名称', '地址']
      }));

    return {
      documentType: templateType,
      mainPurpose: '文档模板化处理',
      sections,
      parties
    };
  }

  /**
   * 检查章节内容是否需要参数化
   */
  private checkNeedsParameterization(content: string): boolean {
    // 检查是否有空白、冒号后空白、日期格式空白等
    const patterns = [
      /[：:]\s+/,           // 冒号后空白
      /[_＿]{2,}/,         // 下划线空白
      /[ 　]{4,}/,         // 多个空格
      /[（【\(][　 ]*[）】\)]/,  // 括号空白
      /[\s　]+年[\s　]+月[\s　]+日/,  // 日期空白
    ];

    return patterns.some(pattern => pattern.test(content));
  }

  /**
   * 阶段2: 章节参数化
   * AI对单个章节进行语义分析，识别该章节中的空白参数
   * @param preExtractedBlanks 预处理的空白位置（用于确保所有空白都被识别）
   */
  private async parameterizeSection(
    sectionName: string,
    sectionContent: string,
    documentUnderstanding: DocumentUnderstanding,
    templateType: string,
    preExtractedBlanks: Array<{ text: string; context: string; beforeBlank: string; position: number; type: string; significance: string }> = []
  ): Promise<SectionParameterization> {
    this.logger.log(`阶段2: 参数化章节 "${sectionName}", 预处理空白 ${preExtractedBlanks.length} 个`);

    // 获取该章节相关的当事人信息
    const relevantParties = documentUnderstanding.parties;

    // 构建预处理空白列表（用于提示AI）
    const preBlanksList = preExtractedBlanks.length > 0
      ? `\n【已识别的空白位置】（共${preExtractedBlanks.length}个，请确认并为每个生成变量建议）\n${preExtractedBlanks.map((b, i) =>
        `[${i + 1}] 标签: "${b.beforeBlank}", 类型: ${b.type}, 上下文: "${b.context.substring(0, 50)}...", 意义: "${b.significance.substring(0, 30)}..."`
      ).join('\n')}`
      : '';

    const prompt = `你是一个专业的文档模板化专家。请分析以下章节内容，识别其中所有需要填充的空白部分，并给出语义化的变量建议。

文档类型: ${documentUnderstanding.documentType}
章节名称: ${sectionName}
章节用途: 从${documentUnderstanding.mainPurpose}中提取该章节内容

【当事人信息】
${relevantParties.map(p => `${p.role} 需要字段: ${p.fieldsNeeded.join(', ')}`).join('\n')}
${preBlanksList}

【章节内容】
${sectionContent}

请返回JSON格式的分析结果：
{
  "sectionName": "${sectionName}",
  "suggestions": [
    {
      "originalText": "空白位置的原文内容（如空白前后的文字）",
      "variablePath": "d.partyA.name",
      "variableName": "甲方名称",
      "significance": "该参数的具体用途和意义，如'合同第一签署方的公司名称'",
      "context": "空白所在的完整句子或上下文，格式为【前文 _____ 后文】",
      "confidence": 0.95
    }
  ]
}

【识别规则】
1. 识别所有空白填充位置（包括冒号后空白、下划线空白、括号空白、日期空白等）
2. 对于已识别的空白位置，必须为每个生成变量建议，不要遗漏
3. 根据上下文语义判断每个空白的具体含义，而非仅根据位置
4. 变量路径使用标准格式：
   - 甲方相关: d.partyA.name, d.partyA.address, d.partyA.phone, d.partyA.representative, d.partyA.signature
   - 乙方相关: d.partyB.name, d.partyB.address, d.partyB.phone, d.partyB.representative, d.partyB.signature
   - 日期相关: d.signDate, d.effectiveDate, d.endDate
   - 附件相关: d.attachmentName
   - 保密期限: d.confidentialityPeriod
5. significance 必须清晰说明该字段的用途和意义
6. context 格式必须为【前文 _____ 后文】，用于前端显示位置

只返回JSON格式，不要其他解释。`;

    try {
      const aiResponse = await this.callAIService(prompt);

      if (aiResponse && aiResponse.suggestions && Array.isArray(aiResponse.suggestions)) {
        this.logger.log(`章节 "${sectionName}" AI参数化成功，识别到 ${aiResponse.suggestions.length} 个参数`);

        // 合并预处理空白和AI建议
        // 如果AI返回的建议少于预处理空白，补充缺失的
        const aiSuggestions = aiResponse.suggestions.map((s: any) => ({
          originalText: s.originalText || '',
          variablePath: s.variablePath || 'd.unknown',
          variableName: s.variableName || '未知字段',
          significance: s.significance || '文档填充字段',
          context: s.context || sectionContent.substring(0, 50),
          confidence: s.confidence || 0.7
        }));

        // 检查预处理空白是否都被AI覆盖
        const missingBlanks = preExtractedBlanks.filter(pre => {
          // 检查AI是否覆盖了这个空白（通过位置或上下文匹配）
          return !aiSuggestions.some((ai: any) =>
            ai.context.includes(pre.beforeBlank) ||
            ai.originalText.includes(pre.text) ||
            Math.abs(ai.context.length - pre.context.length) < 50
          );
        });

        // 补充缺失的预处理空白
        if (missingBlanks.length > 0) {
          this.logger.log(`补充 ${missingBlanks.length} 个预处理空白（AI未覆盖）`);
          for (const blank of missingBlanks) {
            // 根据空白类型推断变量路径
            const inferredPath = this.inferVariablePath(blank.beforeBlank, blank.type, templateType);
            aiSuggestions.push({
              originalText: blank.text,
              variablePath: inferredPath,
              variableName: blank.beforeBlank || '未知字段',
              significance: blank.significance,
              context: blank.context,
              confidence: 0.6  // 补充的空白置信度较低
            });
          }
        }

        return { sectionName, suggestions: aiSuggestions };
      }

      // AI返回格式异常，使用预处理空白作为后备
      if (preExtractedBlanks.length > 0) {
        this.logger.warn(`章节 "${sectionName}" AI返回格式异常，使用预处理空白 ${preExtractedBlanks.length} 个作为后备`);
        return {
          sectionName,
          suggestions: preExtractedBlanks.map(b => ({
            originalText: b.text,
            variablePath: this.inferVariablePath(b.beforeBlank, b.type, templateType),
            variableName: b.beforeBlank || '未知字段',
            significance: b.significance,
            context: b.context,
            confidence: 0.5
          }))
        };
      }

      return { sectionName, suggestions: [] };
    } catch (error: any) {
      this.logger.error(`章节 "${sectionName}" 参数化失败:`, error);

      // 使用预处理空白作为后备
      if (preExtractedBlanks.length > 0) {
        this.logger.log(`使用预处理空白 ${preExtractedBlanks.length} 个作为后备`);
        return {
          sectionName,
          suggestions: preExtractedBlanks.map(b => ({
            originalText: b.text,
            variablePath: this.inferVariablePath(b.beforeBlank, b.type, templateType),
            variableName: b.beforeBlank || '未知字段',
            significance: b.significance,
            context: b.context,
            confidence: 0.5
          }))
        };
      }

      return { sectionName, suggestions: [] };
    }
  }

  /**
   * 根据空白信息推断变量路径
   */
  private inferVariablePath(beforeBlank: string, type: string, templateType: string): string {
    // 使用已有标签映射进行推断
    const labelMappings: Record<string, string> = {
      '甲方': 'd.partyA.name',
      '甲方地址': 'd.partyA.address',
      '甲方签字': 'd.partyA.signature',
      '乙方': 'd.partyB.name',
      '乙方地址': 'd.partyB.address',
      '乙方签字': 'd.partyB.signature',
      '地址': 'd.address',
      '签字': 'd.signature',
      '盖章': 'd.seal',
      '年份': 'd.year',
      '附件': 'd.attachmentName',
      '保密期限': 'd.confidentialityPeriod',
      '签订日期': 'd.signDate',
      '日期': 'd.date',
    };

    // 直接匹配
    for (const [label, path] of Object.entries(labelMappings)) {
      if (beforeBlank.includes(label) || label.includes(beforeBlank)) {
        return path;
      }
    }

    // 默认路径
    return `d.field${Date.now() % 100}`;
  }

  /**
   * 从原文中提取指定章节的内容
   */
  private extractSectionContent(fullContent: string, sectionName: string): string {
    // 尝试匹配章节标题
    const sectionPattern = new RegExp(`${sectionName.replace(/[：:]/g, '[：:]')}[\\s\\S]*?(?=第[一二三四五六七八九十]+条|第[一二三四五六七八九十]+章|$)`, 'i');
    const match = fullContent.match(sectionPattern);

    if (match) {
      return match[0].substring(0, Math.min(500, match[0].length));
    }

    // 如果无法精确匹配，返回文档背景部分
    return fullContent.substring(0, Math.min(500, fullContent.length));
  }

  /**
   * 阶段3: 整合确认
   * AI对所有章节的参数化结果进行整合和最终确认
   */
  private async integrateAndConfirm(
    sectionResults: SectionParameterization[],
    documentUnderstanding: DocumentUnderstanding,
    fullContent: string,
    templateType: string
  ): Promise<any[]> {
    this.logger.log('阶段3: 开始整合确认');

    // 合并所有章节的建议
    const allSuggestions = sectionResults.flatMap(sr => sr.suggestions);

    if (allSuggestions.length === 0) {
      this.logger.warn('没有识别到任何参数');
      return [];
    }

    const prompt = `你是一个专业的文档模板化审核专家。请审核以下识别结果，进行整合和确认。

文档类型: ${documentUnderstanding.documentType}
文档用途: ${documentUnderstanding.mainPurpose}

【已识别的所有参数】
${JSON.stringify(allSuggestions, null, 2)}

【文档背景内容】
${fullContent.substring(0, Math.min(1000, fullContent.length))}

请返回JSON格式的最终确认结果：
{
  "confirmedSuggestions": [
    {
      "originalText": "原文内容",
      "variablePath": "最终确认的变量路径",
      "variableName": "变量名称",
      "significance": "字段意义的详细说明",
      "context": "原文上下文（用于前端显示位置，格式：【前文 _____ 后文】）",
      "confidence": 0.95,
      "chapter": "所在章节名称"
    }
  ],
  "removedDuplicates": ["说明哪些参数被合并或删除"]
}

【整合要求】
1. 去除重复或相似的参数（如"甲方名称"和"甲方"应该合并）
2. 确认变量路径的一致性和规范性
3. 补充或修正 significance 字段，使其更有意义
4. 根据原文内容生成准确的 context 字段，格式为【前文 _____ 后文】
5. 为每个参数添加 chapter 字段，标注所属章节
6. 最终确认的参数应该准确、完整、无重复

只返回JSON格式，不要其他解释。`;

    try {
      const aiResponse = await this.callAIService(prompt);

      if (aiResponse && aiResponse.confirmedSuggestions && Array.isArray(aiResponse.confirmedSuggestions)) {
        this.logger.log(`整合确认完成，最终确认 ${aiResponse.confirmedSuggestions.length} 个参数`);
        return aiResponse.confirmedSuggestions.map((s: any, idx: number) => ({
          id: `sugg-${Date.now()}-${idx}`,
          type: 'variable',
          elementPath: s.context || `【${s.originalText}】`,
          suggestedName: s.variablePath,
          originalText: s.originalText,
          confidence: s.confidence || 0.8,
          applied: false,
          context: s.context,
          details: {
            chapter: s.chapter || '正文',
            significance: s.significance,
            variableName: s.variableName,
            formatter: this.extractFormatter(s.variablePath)
          }
        }));
      }

      // AI返回格式异常，使用原始合并结果
      this.logger.warn('整合确认AI返回格式异常，使用原始合并结果');
      return this.formatRawSuggestions(allSuggestions);
    } catch (error: any) {
      this.logger.error('整合确认失败:', error);
      return this.formatRawSuggestions(allSuggestions);
    }
  }

  /**
   * 格式化原始建议（当整合AI失败时的后备）
   */
  private formatRawSuggestions(rawSuggestions: any[]): any[] {
    return rawSuggestions.map((s, idx) => ({
      id: `sugg-${Date.now()}-${idx}`,
      type: 'variable',
      elementPath: s.context || `【${s.originalText}】`,
      suggestedName: s.variablePath,
      originalText: s.originalText,
      confidence: s.confidence || 0.7,
      applied: false,
      context: s.context,
      details: {
        chapter: '正文',
        significance: s.significance || '文档填充字段',
        variableName: s.variableName,
        formatter: null
      }
    }));
  }

  /**
   * 提取文档中需要填充的空白部分
   * 识别多种空白模式：
   * - 多个空格/空白线（如：______、          ）
   * - 单个空格跟随冒号（如：甲方： 、地址： ）
   * - 中文括号内的空白（如：（ ）、【 】）
   * - 日期格式空白（如： 年 月 日）
   * - 填充提示（如：填写、待填、XXX）
   * 同时提取章节信息用于精确定位
   */
  private extractBlankPatterns(content: string, templateType: string): Array<{
    text: string;
    context: string;  // 前后文本作为上下文
    beforeBlank: string;  // 空白前面的文本（用于精确标签匹配）
    position: number;
    type: 'blank' | 'date' | 'bracket' | 'placeholder' | 'colon-space';
    chapter: string;  // 所在章节信息（如"第一条"、"第二条"）
    significance: string;  // 项目意义/用途说明
  }> {
    const patterns: Array<{
      text: string;
      context: string;
      beforeBlank: string;
      position: number;
      type: 'blank' | 'date' | 'bracket' | 'placeholder' | 'colon-space';
      chapter: string;
      significance: string;
    }> = [];

    // 首先提取章节结构，用于后续定位
    const chapterStructure = this.extractChapterStructure(content);

    // 1. 匹配冒号后的空白（如：甲方： 、地址： ）
    // 这是最常见的合同空白格式
    const colonSpaceRegex = /[：:]\s+/g;
    let match;
    while ((match = colonSpaceRegex.exec(content)) !== null) {
      // 获取冒号前面的完整上下文（包含前面的标签如"甲方"或"乙方"）
      const labelStart = Math.max(0, match.index - 50);
      const beforeColon = content.substring(labelStart, match.index);

      // 提取冒号前面的最后一个词作为标签
      const labelMatch = beforeColon.match(/([^\s：:]+)[：:]?$/);
      if (labelMatch) {
        let label = labelMatch[1].trim();

        // 检查是否前面有甲方/乙方等前缀（如"甲方地址"、"乙方地址"）
        // 尝试提取复合标签
        const compoundMatch = beforeColon.match(/(甲方|乙方|委托方|受托方|买方|卖方|出租方|承租方)[^\s]*([^\s：:]+)?[：:]?$/);
        if (compoundMatch) {
          // 如果有甲方/乙方前缀，使用完整复合标签
          label = compoundMatch[1] + (compoundMatch[2] || '');
        }

        // 获取空白部分的长度
        const blankEnd = match.index + match[0].length;
        // 查找空白结束位置（下一个非空白字符）
        let blankLength = match[0].length - 1; // 减去冒号本身
        // 检查后面是否还有更多空白
        const afterColon = content.substring(blankEnd);
        const additionalSpaceMatch = afterColon.match(/^[\s　]+/);
        if (additionalSpaceMatch) {
          blankLength += additionalSpaceMatch[0].length;
        }

        const startPos = Math.max(0, match.index - 30);
        const endPos = Math.min(content.length, match.index + blankLength + 30);

        // 获取章节信息
        const chapterInfo = this.getChapterForPosition(match.index, chapterStructure);
        const significance = this.getSignificanceForLabel(label, templateType);

        patterns.push({
          text: ' ', // 单个空格作为标记
          context: content.substring(startPos, endPos),
          beforeBlank: label,  // 使用复合标签（如"甲方地址"）
          position: match.index + 1, // 冒号后第一个空格的位置
          type: 'colon-space',
          chapter: chapterInfo,
          significance
        });
      }
    }

    // 2. 匹配日期格式空白（如： 年 月 日）
    const dateBlankRegex = /[\s　]+年[\s　]+月[\s　]+日/g;
    while ((match = dateBlankRegex.exec(content)) !== null) {
      const startPos = Math.max(0, match.index - 30);
      const endPos = Math.min(content.length, match.index + match[0].length + 30);
      const beforeBlankStart = Math.max(0, match.index - 20);
      const beforeBlank = content.substring(beforeBlankStart, match.index);

      const chapterInfo = this.getChapterForPosition(match.index, chapterStructure);
      const significance = '合同签署日期，用于记录合同正式签订的时间';

      patterns.push({
        text: match[0],
        context: content.substring(startPos, endPos),
        beforeBlank: beforeBlank.trim() || '签订日期',
        position: match.index,
        type: 'date',
        chapter: chapterInfo,
        significance
      });
    }

    // 3. 匹配多个连续空格/下划线（如：______、          ）
    // 改进：放宽检测条件，单个下划线和少量空格也能识别
    // 匹配：1个以上下划线、2个以上空格（原来是4个）
    const blankRegex = /[＿_]{1,}|[ 　]{2,}/g;
    while ((match = blankRegex.exec(content)) !== null) {
      const startPos = Math.max(0, match.index - 30);
      const endPos = Math.min(content.length, match.index + match[0].length + 30);
      const beforeBlankStart = Math.max(0, match.index - 20);
      const beforeBlank = content.substring(beforeBlankStart, match.index);

      // 检查是否有特殊上下文模式（如"位于...的...公司"）
      // 这表示可能有两个不同的空白字段
      const extendedContext = content.substring(Math.max(0, match.index - 50), Math.min(content.length, match.index + match[0].length + 50));

      // 特殊模式检测：甲方/乙方地址和名称组合
      // 例如："鉴于位于            的             公司(以下称为"甲方")"
      // 第一个空白是地址，第二个空白是公司名称
      const specialPatternMatch = extendedContext.match(/(鉴于|甲方|乙方|位于)[^\s]*(位于|的)?\s*[＿_ ]{2,}\s*(的|公司|名称)/);
      if (specialPatternMatch) {
        // 检查空白后面是否有"的"和更多空白（表示地址+名称组合）
        const afterBlankPattern = content.substring(match.index + match[0].length, match.index + match[0].length + 100);
        const nextBlankMatch = afterBlankPattern.match(/^\s*(的)\s*[＿_ ]{2,}/);
        if (nextBlankMatch) {
          // 这是一个地址+名称的组合，第一个空白是地址
          const addressEndPos = match.index + match[0].length;
          const nameStartPos = addressEndPos + nextBlankMatch[0].length - nextBlankMatch[1].length - 2; // 减去"的"和空白

          // 获取空白前的标签（如"甲方"、"乙方"）
          const partyMatch = beforeBlank.match(/(甲方|乙方|委托方|受托方)/);
          const partyLabel = partyMatch ? partyMatch[1] : '甲方';

          const chapterInfo = this.getChapterForPosition(match.index, chapterStructure);

          // 第一个空白：地址
          patterns.push({
            text: match[0],
            context: extendedContext,
            beforeBlank: `${partyLabel}地址`,
            position: match.index,
            type: 'blank',
            chapter: chapterInfo,
            significance: `${partyLabel}的注册地址或办公地址，用于填写公司所在地点`
          });

          // 第二个空白：名称（从nextBlankMatch提取）
          const nameBlankStart = match.index + match[0].length + nextBlankMatch[0].indexOf(nextBlankMatch[1]) + 1;
          const nameBlankEnd = nameBlankStart + nextBlankMatch[0].length - nextBlankMatch[1].length - 1;

          patterns.push({
            text: content.substring(nameBlankStart, nameBlankEnd) || ' ',
            context: content.substring(Math.max(0, nameBlankStart - 30), Math.min(content.length, nameBlankEnd + 30)),
            beforeBlank: `${partyLabel}名称`,
            position: nameBlankStart,
            type: 'blank',
            chapter: chapterInfo,
            significance: `${partyLabel}的公司全称，用于填写公司名称`
          });

          // 跳过已处理的区域
          blankRegex.lastIndex = nameBlankEnd;
          continue;
        }
      }

      const chapterInfo = this.getChapterForPosition(match.index, chapterStructure);
      const significance = this.getSignificanceForLabel(beforeBlank.trim(), templateType);

      patterns.push({
        text: match[0],
        context: content.substring(startPos, endPos),
        beforeBlank,
        position: match.index,
        type: 'blank',
        chapter: chapterInfo,
        significance
      });
    }

    // 4. 匹配中文括号内的空白（如：（ ）、【 】）
    const bracketRegex = /[（【\(][　 ]*[）】\)]/g;
    while ((match = bracketRegex.exec(content)) !== null) {
      const startPos = Math.max(0, match.index - 30);
      const endPos = Math.min(content.length, match.index + match[0].length + 30);
      const beforeBlankStart = Math.max(0, match.index - 20);
      const beforeBlank = content.substring(beforeBlankStart, match.index);

      const chapterInfo = this.getChapterForPosition(match.index, chapterStructure);
      const significance = this.getSignificanceForLabel(beforeBlank.trim(), templateType);

      patterns.push({
        text: match[0],
        context: content.substring(startPos, endPos),
        beforeBlank,
        position: match.index,
        type: 'bracket',
        chapter: chapterInfo,
        significance
      });
    }

    // 5. 匹配占位符（如：XXX、待填写、请填写）
    const placeholderRegex = /(XXX+|待填[写名]|请填[写名]|此处填[写名])/g;
    while ((match = placeholderRegex.exec(content)) !== null) {
      const startPos = Math.max(0, match.index - 30);
      const endPos = Math.min(content.length, match.index + match[0].length + 30);
      const beforeBlankStart = Math.max(0, match.index - 20);
      const beforeBlank = content.substring(beforeBlankStart, match.index);

      const chapterInfo = this.getChapterForPosition(match.index, chapterStructure);
      const significance = this.getSignificanceForLabel(beforeBlank.trim(), templateType);

      patterns.push({
        text: match[0],
        context: content.substring(startPos, endPos),
        beforeBlank,
        position: match.index,
        type: 'placeholder',
        chapter: chapterInfo,
        significance
      });
    }

    // 6. 匹配年份空白（如"     年"、"  年"）
    const yearBlankRegex = /[ 　＿_]+年/g;
    while ((match = yearBlankRegex.exec(content)) !== null) {
      const startPos = Math.max(0, match.index - 30);
      const endPos = Math.min(content.length, match.index + match[0].length + 30);
      const beforeBlankStart = Math.max(0, match.index - 20);
      const beforeBlank = content.substring(beforeBlankStart, match.index);

      const chapterInfo = this.getChapterForPosition(match.index, chapterStructure);
      const significance = '年份填写位置，用于填写合同签订或生效年份';

      patterns.push({
        text: match[0],
        context: content.substring(startPos, endPos),
        beforeBlank: beforeBlank.trim() || '年份',
        position: match.index,
        type: 'date',
        chapter: chapterInfo,
        significance
      });
    }

    // 7. 匹配附件后空白（如"附件一："、"附件二："等）
    const attachmentBlankRegex = /附件[一二三四五六七八九十\d]+[：:]\s*[ 　＿_]+/g;
    while ((match = attachmentBlankRegex.exec(content)) !== null) {
      const startPos = Math.max(0, match.index - 30);
      const endPos = Math.min(content.length, match.index + match[0].length + 30);

      const chapterInfo = this.getChapterForPosition(match.index, chapterStructure);
      const significance = '附件名称或描述填写位置';

      patterns.push({
        text: match[0],
        context: content.substring(startPos, endPos),
        beforeBlank: match[0].replace(/\s+$/, '').trim(),
        position: match.index,
        type: 'blank',
        chapter: chapterInfo,
        significance
      });
    }

    // 8. 匹配签字/盖章空白（如"甲方："、"乙方："后面没有文字）
    // 特别处理签字行的空白
    const signatureBlankRegex = /(甲方|乙方|委托方|受托方|签字|盖章|法定代表人)[：:]\s*(?=\n|$|[ 　]{2,})/g;
    while ((match = signatureBlankRegex.exec(content)) !== null) {
      const startPos = Math.max(0, match.index - 30);
      const endPos = Math.min(content.length, match.index + match[0].length + 30);
      const label = match[1];

      const chapterInfo = this.getChapterForPosition(match.index, chapterStructure);
      const significance = label === '签字' || label === '盖章'
        ? `${label}位置，用于确认合同内容`
        : `${label}名称或信息填写位置`;

      patterns.push({
        text: match[0],
        context: content.substring(startPos, endPos),
        beforeBlank: label,
        position: match.index,
        type: 'colon-space',
        chapter: chapterInfo,
        significance
      });
    }

    // 按位置排序，避免顺序混乱
    patterns.sort((a, b) => a.position - b.position);

    // 去重逻辑：基于完整上下文而非仅标签
    // "甲方地址："和"乙方地址："虽然标签都是"地址"，但上下文不同，应该都保留
    const uniquePatterns = [];
    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      // 检查是否与前一个完全重复（相同位置和相同完整上下文）
      if (i === 0 ||
          pattern.position !== patterns[i - 1].position ||
          pattern.context !== patterns[i - 1].context) {
        uniquePatterns.push(pattern);
        this.logger.debug(`保留空白: 标签="${pattern.beforeBlank || '未知'}", 位置=${pattern.position}, 类型=${pattern.type}`);
      } else {
        this.logger.debug(`跳过完全重复空白: 标签="${pattern.beforeBlank || '未知'}", 位置=${pattern.position}`);
      }
    }

    this.logger.log(`提取到 ${uniquePatterns.length} 个唯一空白模式（原始 ${patterns.length} 个）`);
    return uniquePatterns;
  }

  /**
   * 提取文档章节结构
   * 用于精确定位空白所在位置
   */
  private extractChapterStructure(content: string): Array<{ title: string; startPos: number; endPos: number }> {
    const chapters: Array<{ title: string; startPos: number; endPos: number }> = [];

    // 匹配常见的章节标题格式
    // 第X条、第一条、第二条、第一章、第二章、一、二、1.、2.、1.1等
    const chapterPatterns = [
      // 第X条格式
      /第[一二三四五六七八九十百千]+条[：:\s]*/g,
      // 第X章格式
      /第[一二三四五六七八九十百千]+章[：:\s]*/g,
      // 数字编号格式（如：一、二、三、）
      /^[一二三四五六七八九十]+[、：:\s]+/g,
      // 数字点格式（如：1. 2. 3.）
      /^\d+[.、：:\s]+/g,
      // 数字子章节格式（如：1.1 1.2）
      /^\d+\.\d+[.、：:\s]+/g,
    ];

    // 合并所有匹配结果
    const allMatches: Array<{ title: string; position: number }> = [];

    for (const pattern of chapterPatterns) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(content)) !== null) {
        // 获取完整的章节标题行
        const lineStart = content.lastIndexOf('\n', match.index) + 1;
        const lineEnd = content.indexOf('\n', match.index);
        const fullLine = content.substring(lineStart, lineEnd > 0 ? lineEnd : content.length).trim();

        if (fullLine.length > 0) {
          allMatches.push({
            title: fullLine.substring(0, Math.min(50, fullLine.length)), // 截取前50字符
            position: lineStart
          });
        }
      }
    }

    // 按位置排序并设置结束位置
    allMatches.sort((a, b) => a.position - b.position);

    for (let i = 0; i < allMatches.length; i++) {
      const chapter = allMatches[i];
      const nextChapter = allMatches[i + 1];
      chapters.push({
        title: chapter.title,
        startPos: chapter.position,
        endPos: nextChapter ? nextChapter.position : content.length
      });
    }

    // 如果没有找到章节，添加一个默认的"正文"章节
    if (chapters.length === 0) {
      chapters.push({
        title: '正文',
        startPos: 0,
        endPos: content.length
      });
    }

    this.logger.log(`提取到 ${chapters.length} 个章节结构`);
    return chapters;
  }

  /**
   * 根据位置获取所在章节
   */
  private getChapterForPosition(position: number, chapters: Array<{ title: string; startPos: number; endPos: number }>): string {
    for (const chapter of chapters) {
      if (position >= chapter.startPos && position < chapter.endPos) {
        return chapter.title;
      }
    }
    return '正文';
  }

  /**
   * 根据标签获取字段意义说明
   */
  private getSignificanceForLabel(label: string, templateType: string): string {
    const significanceMap: Record<string, Record<string, string>> = {
      'contract': {
        '甲方': '合同第一签署方，通常是合同的主要责任方',
        '乙方': '合同第二签署方，通常是合同的配合责任方',
        '甲方名称': '甲方公司或个人的完整名称',
        '乙方名称': '乙方公司或个人的完整名称',
        '甲方地址': '甲方注册地址或实际办公地址',
        '乙方地址': '乙方注册地址或实际办公地址',
        '签订日期': '合同签署日期，记录合同正式签订的时间',
        '生效日期': '合同开始生效的日期',
        '截止日期': '合同有效期终止的日期',
        '合同金额': '合同涉及的金额总数',
        '合同编号': '合同唯一编号，用于归档和查询',
        '法定代表人': '公司法定的代表人姓名',
        '联系电话': '用于业务沟通的电话号码',
        '地址': '地址信息，用于联系和送达',
        '签字': '签字区域，用于确认合同内容',
        '盖章': '盖章区域，用于公司公章确认',
      },
      'report': {
        '标题': '报告的标题名称',
        '日期': '报告生成日期',
        '作者': '报告撰写人',
        '摘要': '报告内容摘要',
        '结论': '报告结论或建议',
      },
      'invoice': {
        '金额': '发票金额',
        '日期': '发票开具日期',
        '编号': '发票编号',
        '公司': '公司名称',
        '项目': '项目名称',
      },
      'certificate': {
        '姓名': '证书持有者姓名',
        '日期': '证书颁发日期',
        '编号': '证书编号',
        '有效期': '证书有效期限',
      },
    };

    const templateMap = significanceMap[templateType] || significanceMap['contract'];

    // 尝试直接匹配
    if (templateMap[label]) {
      return templateMap[label];
    }

    // 尝试关键词匹配
    for (const [key, value] of Object.entries(templateMap)) {
      if (label.includes(key) || key.includes(label)) {
        return value;
      }
    }

    return '文档中需要填充的字段';
  }

  /**
   * 使用AI分析空白部分，生成变量建议
   * 返回建议列表以及是否使用了AI的标记
   */
  private async analyzeBlankPatternsWithAI(
    patterns: Array<{ text: string; context: string; beforeBlank?: string; position: number; type: string; chapter?: string; significance?: string }>,
    fullContent: string,
    templateType: string,
    context?: string,
    customRules?: Array<{ pattern: string; targetPath: string; description?: string }>
  ): Promise<{ suggestions: any[]; usedAI: boolean }> {
    if (patterns.length === 0) {
      return { suggestions: [], usedAI: false };
    }

    // 构建AI提示并调用AI服务
    // 如果空白数量较多，分段调用AI以减少复杂度
    try {
      let suggestions: any[] = [];

      // 分段调用策略：每次最多处理15个空白
      const batchSize = 15;
      const batches = [];

      for (let i = 0; i < patterns.length; i += batchSize) {
        batches.push(patterns.slice(i, i + batchSize));
      }

      this.logger.log(`将${patterns.length}个空白分成${batches.length}批进行AI分析`);

      // 对每批调用AI
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batchPatterns = batches[batchIndex];
        this.logger.log(`处理第${batchIndex + 1}批，共${batchPatterns.length}个空白`);

        // 构建针对这批空白的提示（包含完整文档上下文）
        const prompt = this.buildAIPromptForBlanks(batchPatterns, fullContent, templateType, context, customRules, batchIndex * batchSize);

        try {
          const aiResponse = await this.callAIService(prompt);
          const batchSuggestions = this.parseAIResponseToSuggestions(aiResponse, batchPatterns, batchIndex * batchSize);
          suggestions = suggestions.concat(batchSuggestions);
          this.logger.log(`第${batchIndex + 1}批AI分析完成，返回${batchSuggestions.length}个建议`);
        } catch (batchError) {
          this.logger.warn(`第${batchIndex + 1}批AI分析失败，使用规则后备`);
          const fallbackSuggestions = this.generateFallbackSuggestions(batchPatterns, templateType, batchIndex * batchSize);
          suggestions = suggestions.concat(fallbackSuggestions);
        }
      }

      // 如果总建议数量太少，使用规则补充
      if (suggestions.length < Math.min(patterns.length, 3)) {
        this.logger.warn(`AI总建议数量不足(${suggestions.length}/${patterns.length})，使用规则补充`);
        const fallbackSuggestions = this.generateFallbackSuggestions(patterns, templateType, 0);
        const mergedSuggestions = this.mergeSuggestions(suggestions, fallbackSuggestions, patterns);
        return { suggestions: mergedSuggestions, usedAI: suggestions.length > 0 };
      }

      return { suggestions, usedAI: true };
    } catch (error) {
      this.logger.error('AI analysis failed:', error);
      this.logger.warn('使用规则匹配作为后备方案');
      const suggestions = this.generateFallbackSuggestions(patterns, templateType, 0);
      return { suggestions, usedAI: false };
    }
  }

  /**
   * 合并AI建议和规则建议
   * AI建议优先，规则建议补充缺失的部分
   */
  private mergeSuggestions(aiSuggestions: any[], fallbackSuggestions: any[], patterns: any[]): any[] {
    const result: any[] = [...aiSuggestions];

    // 对于AI没有覆盖的空白模式，使用规则建议
    const coveredIndices = new Set(aiSuggestions.map(s => {
      const match = s.id.match(/sugg-\d+-(\d+)/);
      return match ? parseInt(match[1]) : -1;
    }));

    for (let i = 0; i < fallbackSuggestions.length; i++) {
      if (!coveredIndices.has(i)) {
        result.push(fallbackSuggestions[i]);
      }
    }

    // 按原始顺序排序
    result.sort((a, b) => {
      const aIdx = parseInt(a.id.match(/sugg-\d+-(\d+)/)?.[1] || '0');
      const bIdx = parseInt(b.id.match(/sugg-\d+-(\d+)/)?.[1] || '0');
      return aIdx - bIdx;
    });

    return result;
  }

  /**
   * 构建AI分析提示（改进版）
   * 添加更详细的语义说明和上下文分析
   */
  private buildAIPromptForBlanks(
    patterns: Array<{ text: string; context: string; beforeBlank?: string; position: number; type: string }>,
    fullContent: string,
    templateType: string,
    context?: string,
    customRules?: Array<{ pattern: string; targetPath: string; description?: string }>,
    startIndex: number = 0  // 空白的起始索引（用于分批处理）
  ): string {
    const templateTypeDescriptions: Record<string, string> = {
      'report': '报告文档，包含标题、日期、正文、总结等',
      'invoice': '发票/账单，包含金额、日期、项目、公司信息等',
      'certificate': '证书/证明，包含姓名、日期、证书编号、内容等',
      'contract': '合同/协议，包含甲方乙方、签署日期、条款内容、违约金额等',
      'letter': '信函/通知，包含收件人、日期、正文、签名等',
      'custom': '自定义模板'
    };

    const typeDesc = templateTypeDescriptions[templateType] || templateTypeDescriptions['report'];

    // 提取文档前800字符作为背景（增加上下文长度）
    const background = fullContent.substring(0, Math.min(800, fullContent.length));

    // 构建空白部分列表（包含更详细的信息）
    const blankList = patterns.map((p, i) =>
      `[${startIndex + i + 1}] 类型: ${p.type}\n    空白内容: "${p.text}"\n    前文标签: "${p.beforeBlank || '未知'}"\n    上下文片段: "${p.context}"\n    位置: ${p.position}`
    ).join('\n\n');

    // 自定义规则提示
    const customRulesPrompt = customRules && customRules.length > 0
      ? `\n自定义规则:\n${customRules.map(r => `- 如果上下文包含"${r.pattern}", 变量路径使用 "${r.targetPath}"`).join('\n')}`
      : '';

    // 合同特殊语义说明
    const contractSemanticGuide = templateType === 'contract' ? `
【合同特殊语义识别规则】
1. 地址+名称组合模式：
   - "位于____的____公司(以下称为甲方)" → 第一个空白是甲方地址(d.partyA.address)，第二个空白是甲方名称(d.partyA.name)
   - "位于____的____公司(以下称为乙方)" → 第一个空白是乙方地址(d.partyB.address)，第二个空白是乙方名称(d.partyB.name)

2. 项目/合作名称：
   - "就有关____合作过程中" → 项目名称(d.projectName)

3. 金额填写：
   - "支付违约金人民币____万元" → 违约金额(d.penaltyAmount)

4. 签署位置：
   - "甲方：" 后的空白 → 甲方签署名称(d.partyA.signature)
   - "乙方：" 后的空白 → 乙方签署名称(d.partyB.signature)

请根据上下文语义准确判断每个空白的具体含义，不要仅根据位置推断。
` : '';

    return `你是一个专业的文档模板化专家。请仔细分析以下文档中的空白填充部分，根据上下文语义为每个空白建议合适的Carbone模板变量。

文档类型: ${typeDesc}
${context ? `用户说明: ${context}` : ''}
${customRulesPrompt}
${contractSemanticGuide}

【文档背景内容】
${background}

【需要分析的空白部分】（共${patterns.length}个）
${blankList}

请为每个空白返回JSON格式的建议：
{
  "suggestions": [
    {
      "index": ${startIndex + 1},
      "variablePath": "d.xxx",
      "variableName": "变量中文名称",
      "confidence": 0.85,
      "reason": "基于上下文'...'的语义分析，这是XX字段，用于填写..."
    }
  ]
}

【变量路径规范】
- 合同甲方: d.partyA.name, d.partyA.address, d.partyA.phone, d.partyA.representative
- 合同乙方: d.partyB.name, d.partyB.address, d.partyB.phone, d.partyB.representative
- 项目信息: d.projectName, d.projectDescription
- 日期时间: d.signDate, d.effectiveDate, d.endDate (使用:formatDate(YYYY-MM-DD))
- 金额数值: d.contractAmount, d.penaltyAmount (使用:formatNumber(#,##0.00))

【输出要求】
1. 只返回JSON格式，不要其他解释
2. 每个空白必须有对应的建议
3. reason字段必须说明该空白在文档中的具体用途
4. 根据上下文语义而非仅位置来推断变量含义`;
  }

  /**
   * 调用AI服务
   * 使用 ops-ai-orchestrator 的 /ai/models/{id}/test 端点
   */
  private async callAIService(prompt: string): Promise<any> {
    const aiOrchestratorUrl = process.env.AI_ORCHESTRATOR_URL || 'http://localhost:3007';
    const aiModelId = process.env.AI_MODEL_ID || '00ddd35d-6578-4acb-bc09-d629560f6ab6';  // 默认使用 qwen3.5-plus

    this.logger.log(`Calling AI service at ${aiOrchestratorUrl}/ai/models/${aiModelId}/test`);

    try {
      // 使用正确的 ops-ai-orchestrator 端点
      const response = await axios.post(
        `${aiOrchestratorUrl}/ai/models/${aiModelId}/test`,
        {
          prompt: prompt  // ops-ai-orchestrator 使用 prompt 字段
        },
        { timeout: 360000 }  // 6分钟超时，AI分析可能需要较长时间
      );

      this.logger.log('AI service responded successfully');

      // ops-ai-orchestrator 返回格式: {success: true, response: "..."}
      const content = response.data?.response || '';

      // 提取JSON部分
      const jsonMatch = content.match(/\{[\s\S]*"suggestions"[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // 尝试另一种格式：直接JSON数组
      const arrayMatch = content.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        return { suggestions: JSON.parse(arrayMatch[0]) };
      }

      this.logger.warn('No valid JSON found in AI response');
      return { suggestions: [] };
    } catch (error: any) {
      this.logger.error('AI service call failed:', error.message);
      this.logger.error('AI service URL attempted:', `${aiOrchestratorUrl}/ai/models/${aiModelId}/test`);
      throw error;
    }
  }

  /**
   * 解析AI响应为建议列表
   * @param startIndex 空白的起始索引（用于分批处理时的索引偏移）
   */
  private parseAIResponseToSuggestions(
    aiResponse: any,
    patterns: Array<{ text: string; context: string; position: number; type: string; beforeBlank?: string }>,
    startIndex: number = 0
  ): any[] {
    const suggestions: any[] = [];

    if (!aiResponse.suggestions || !Array.isArray(aiResponse.suggestions)) {
      return suggestions;
    }

    for (const aiSuggestion of aiResponse.suggestions) {
      // AI返回的index是全局索引（从startIndex开始），需要转换为批次内的索引
      const globalIndex = aiSuggestion.index - 1;  // 转换为0-based
      const patternIndex = globalIndex - startIndex;

      if (patternIndex < 0 || patternIndex >= patterns.length) {
        this.logger.warn(`AI suggestion index ${aiSuggestion.index} out of range for batch (start=${startIndex}, size=${patterns.length})`);
        continue;
      }

      const pattern = patterns[patternIndex];
      suggestions.push({
        id: `sugg-${Date.now()}-${globalIndex}`,
        type: 'variable',
        elementPath: `【${pattern.beforeBlank || pattern.context?.slice(0, 10) || ''} _____ ${pattern.context?.slice(-10) || ''}】`,
        suggestedName: aiSuggestion.variablePath,
        originalText: pattern.text,
        confidence: aiSuggestion.confidence || 0.7,
        applied: false,
        context: pattern.context,
        details: {
          formatter: this.extractFormatter(aiSuggestion.variablePath),
          variableName: aiSuggestion.variableName,
          reason: aiSuggestion.reason,
          significance: aiSuggestion.reason || `文档中的${aiSuggestion.variableName || '填充字段'}`
        }
      });
    }

    return suggestions;
  }

  /**
   * 从变量路径中提取格式化器
   */
  private extractFormatter(variablePath: string): string | null {
    const colonIndex = variablePath.indexOf(':');
    if (colonIndex > 0) {
      return variablePath.substring(colonIndex + 1);
    }
    return null;
  }

  /**
   * AI失败时的后备建议生成
   * @param startIndex 空白的起始索引（用于分批处理时的索引偏移）
   */
  private generateFallbackSuggestions(
    patterns: Array<{ text: string; context: string; beforeBlank?: string; position: number; type: string; chapter?: string; significance?: string }>,
    templateType: string,
    startIndex: number = 0
  ): any[] {
    const suggestions: any[] = [];
    this.logger.log(`Generating suggestions for ${patterns.length} patterns, templateType: ${templateType}`);

    // 更精确的关键词映射 - 根据空白前面的标签来匹配
    // 每个标签映射到具体的变量路径，包含详细的语言说明
    const labelMappings: Record<string, { path: string; confidence: number; description: string }> = {
      // ===== 甲乙双方相关 =====
      // 甲方信息（合同的第一个签署方）
      '甲方': { path: 'd.partyA.name', confidence: 0.9, description: '甲方名称，合同的第一个签署方名称' },
      '甲方名称': { path: 'd.partyA.name', confidence: 0.95, description: '甲方公司或个人名称' },
      '甲方地址': { path: 'd.partyA.address', confidence: 0.95, description: '甲方注册地址或办公地址' },
      '甲方电话': { path: 'd.partyA.phone', confidence: 0.95, description: '甲方联系电话' },
      '甲方联系人': { path: 'd.partyA.contact', confidence: 0.95, description: '甲方联系人姓名' },
      '甲方代表': { path: 'd.partyA.representative', confidence: 0.95, description: '甲方法定代表人或授权代表' },
      '甲方签字': { path: 'd.partyA.signature', confidence: 0.95, description: '甲方签字区域' },
      '甲方盖章': { path: 'd.partyA.seal', confidence: 0.9, description: '甲方公章印章位置' },
      '甲方身份证': { path: 'd.partyA.idNumber', confidence: 0.95, description: '甲方身份证号码' },
      '甲方开户行': { path: 'd.partyA.bank', confidence: 0.95, description: '甲方开户银行名称' },
      '甲方账号': { path: 'd.partyA.accountNo', confidence: 0.95, description: '甲方银行账号' },

      // 乙方信息（合同的第二个签署方）
      '乙方': { path: 'd.partyB.name', confidence: 0.9, description: '乙方名称，合同的第二个签署方名称' },
      '乙方名称': { path: 'd.partyB.name', confidence: 0.95, description: '乙方公司或个人名称' },
      '乙方地址': { path: 'd.partyB.address', confidence: 0.95, description: '乙方注册地址或办公地址' },
      '乙方电话': { path: 'd.partyB.phone', confidence: 0.95, description: '乙方联系电话' },
      '乙方联系人': { path: 'd.partyB.contact', confidence: 0.95, description: '乙方联系人姓名' },
      '乙方代表': { path: 'd.partyB.representative', confidence: 0.95, description: '乙方法定代表人或授权代表' },
      '乙方签字': { path: 'd.partyB.signature', confidence: 0.95, description: '乙方签字区域' },
      '乙方盖章': { path: 'd.partyB.seal', confidence: 0.9, description: '乙方公章印章位置' },
      '乙方身份证': { path: 'd.partyB.idNumber', confidence: 0.95, description: '乙方身份证号码' },
      '乙方开户行': { path: 'd.partyB.bank', confidence: 0.95, description: '乙方开户银行名称' },
      '乙方账号': { path: 'd.partyB.accountNo', confidence: 0.95, description: '乙方银行账号' },

      // ===== 日期时间相关 =====
      // 合同签署和生效日期
      '签订日期': { path: 'd.signDate', confidence: 0.95, description: '合同签署日期' },
      '签署日期': { path: 'd.signDate', confidence: 0.95, description: '合同签署日期' },
      '签订于': { path: 'd.signDate', confidence: 0.9, description: '合同签订时间点' },
      '生效日期': { path: 'd.effectiveDate', confidence: 0.95, description: '合同开始生效的日期' },
      '截止日期': { path: 'd.endDate', confidence: 0.95, description: '合同终止日期' },
      '有效期': { path: 'd.validPeriod', confidence: 0.9, description: '合同有效期限' },
      '日期': { path: 'd.date', confidence: 0.85, description: '通用日期字段' },
      '时间': { path: 'd.time', confidence: 0.85, description: '时间字段' },
      '年月日': { path: 'd.date', confidence: 0.85, description: '日期格式 年 月 日' },

      // ===== 合同编号相关 =====
      '合同编号': { path: 'd.contractNo', confidence: 0.95, description: '合同唯一编号' },
      '合同号': { path: 'd.contractNo', confidence: 0.95, description: '合同编号' },
      '合同名称': { path: 'd.contractName', confidence: 0.9, description: '合同标题名称' },
      '编号': { path: 'd.serialNo', confidence: 0.8, description: '通用编号' },
      '文号': { path: 'd.documentNo', confidence: 0.9, description: '文件编号' },

      // ===== 公司信息 =====
      '公司': { path: 'd.companyName', confidence: 0.8, description: '公司名称' },
      '公司名称': { path: 'd.companyName', confidence: 0.95, description: '公司全称' },
      '公司地址': { path: 'd.companyAddress', confidence: 0.95, description: '公司注册地址' },
      '法定代表人': { path: 'd.legalRepresentative', confidence: 0.95, description: '公司法定代表人姓名' },

      // ===== 地址相关 =====
      '地址': { path: 'd.address', confidence: 0.85, description: '地址信息' },
      '住所': { path: 'd.address', confidence: 0.9, description: '住所地址' },
      '住所地': { path: 'd.address', confidence: 0.9, description: '住所所在地' },

      // ===== 金额相关 =====
      '金额': { path: 'd.amount', confidence: 0.85, description: '金额数值' },
      '总金额': { path: 'd.totalAmount', confidence: 0.95, description: '合同总金额' },
      '合同金额': { path: 'd.contractAmount', confidence: 0.95, description: '合同涉及的金额' },
      '付款金额': { path: 'd.paymentAmount', confidence: 0.95, description: '付款金额' },
      '单价': { path: 'd.unitPrice', confidence: 0.9, description: '单位价格' },
      '总价': { path: 'd.totalPrice', confidence: 0.9, description: '总价金额' },
      '定金': { path: 'd.deposit', confidence: 0.9, description: '定金金额' },
      '保证金': { path: 'd.securityDeposit', confidence: 0.9, description: '保证金金额' },

      // ===== 项目/产品相关 =====
      '项目': { path: 'd.projectName', confidence: 0.85, description: '项目名称' },
      '项目名称': { path: 'd.projectName', confidence: 0.95, description: '项目全称' },
      '产品': { path: 'd.productName', confidence: 0.85, description: '产品名称' },
      '产品名称': { path: 'd.productName', confidence: 0.95, description: '产品全称' },
      '商品': { path: 'd.productName', confidence: 0.85, description: '商品名称' },

      // ===== 数量相关 =====
      '数量': { path: 'd.quantity', confidence: 0.9, description: '数量' },
      '规格': { path: 'd.specification', confidence: 0.85, description: '产品规格' },

      // ===== 签字/盖章相关 =====
      '签字': { path: 'd.signature', confidence: 0.85, description: '签字区域' },
      '盖章': { path: 'd.seal', confidence: 0.85, description: '盖章区域' },
      '签名': { path: 'd.signature', confidence: 0.85, description: '签名' },

      // ===== 联系方式 =====
      '电话': { path: 'd.phone', confidence: 0.85, description: '电话号码' },
      '联系电话': { path: 'd.phone', confidence: 0.95, description: '联系电话' },
      '手机': { path: 'd.mobile', confidence: 0.9, description: '手机号码' },
      '邮箱': { path: 'd.email', confidence: 0.85, description: '电子邮箱' },
      '传真': { path: 'd.fax', confidence: 0.85, description: '传真号码' },

      // ===== 其他常见字段 =====
      '备注': { path: 'd.notes', confidence: 0.8, description: '备注说明' },
      '说明': { path: 'd.description', confidence: 0.8, description: '说明内容' },
      '附件': { path: 'd.attachments', confidence: 0.8, description: '附件列表' },
      '名称': { path: 'd.name', confidence: 0.75, description: '通用名称字段' },
      '账号': { path: 'd.accountNo', confidence: 0.9, description: '账号号码' },
      '开户行': { path: 'd.bank', confidence: 0.9, description: '开户银行' },
      '身份证': { path: 'd.idNumber', confidence: 0.9, description: '身份证号码' },
      '税号': { path: 'd.taxNo', confidence: 0.9, description: '纳税人识别号' },
    };

    // 记录已使用的路径和标签，避免重复
    const usedPaths: Set<string> = new Set();
    const usedLabels: Set<string> = new Set();

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      let suggestedPath = `d.field${i + 1}`;
      let confidence = 0.5;

      // 使用 beforeBlank 进行精确标签匹配（如果可用）
      // 提取冒号/等号前面的文字作为标签
      const beforeBlankText = pattern.beforeBlank || pattern.context;
      const labelMatch = beforeBlankText.match(/([^\s：:=]+)[：:=]?$/);
      if (labelMatch) {
        const label = labelMatch[1].trim();
        this.logger.log(`Pattern ${i}: beforeBlank="${beforeBlankText}", extracted label="${label}"`);

        // 精确匹配标签
        for (const [mappingLabel, mapping] of Object.entries(labelMappings)) {
          if (label === mappingLabel || label.includes(mappingLabel) || mappingLabel.includes(label)) {
            if (!usedPaths.has(mapping.path)) {
              suggestedPath = mapping.path;
              confidence = mapping.confidence;
              this.logger.log(`Pattern ${i}: matched label "${label}" -> ${suggestedPath} (confidence: ${confidence})`);
              break;
            }
          }
        }
      }

      // 如果标签匹配失败，尝试从完整上下文的关键词匹配
      if (suggestedPath === `d.field${i + 1}`) {
        for (const [keyword, mapping] of Object.entries(labelMappings)) {
          if (pattern.context.includes(keyword) && !usedPaths.has(mapping.path)) {
            suggestedPath = mapping.path;
            confidence = mapping.confidence - 0.1;
            this.logger.log(`Pattern ${i}: matched keyword "${keyword}" -> ${suggestedPath}`);
            break;
          }
        }
      }

      // 确保路径唯一
      if (suggestedPath !== `d.field${i + 1}` && !usedPaths.has(suggestedPath)) {
        usedPaths.add(suggestedPath);
      } else if (suggestedPath !== `d.field${i + 1}` && usedPaths.has(suggestedPath)) {
        let counter = 1;
        const base = suggestedPath.replace(/\d+$/, '');
        while (usedPaths.has(`${base}${counter}`)) {
          counter++;
        }
        suggestedPath = `${base}${counter}`;
        confidence = 0.6;
        usedPaths.add(suggestedPath);
      } else if (!usedPaths.has(suggestedPath)) {
        usedPaths.add(suggestedPath);
      }

      // 获取匹配到的描述（用于显示项目意义）
      let matchedDescription = '';
      if (suggestedPath !== `d.field${i + 1}`) {
        for (const [mappingLabel, mapping] of Object.entries(labelMappings)) {
          if (suggestedPath === mapping.path) {
            matchedDescription = mapping.description;
            break;
          }
        }
      }

      // 优先使用pattern中的significance，如果没有则使用matchedDescription
      const finalSignificance = pattern.significance || matchedDescription || '文档中需要填充的字段';
      const finalChapter = pattern.chapter || '正文';

      // 生成格式化的显示位置：【前文空白后文】格式
      const beforeText = pattern.beforeBlank || pattern.context?.slice(0, 10) || '';
      const afterText = pattern.context?.slice(-10) || '';
      const displayPosition = `【${beforeText.trim().slice(-8)} _____ ${afterText.trim().slice(0, 8)}】`;

      suggestions.push({
        id: `sugg-${Date.now()}-${startIndex + i}`,  // 使用全局索引
        type: 'variable',
        elementPath: displayPosition,  // 使用格式化的显示位置
        suggestedName: suggestedPath,
        originalText: pattern.text,
        confidence,
        applied: false,
        context: pattern.context,
        details: {
          chapter: finalChapter,  // 章节信息（用于分组显示）
          significance: finalSignificance,  // 项目意义说明
          displayPosition,  // 格式化的位置显示
          formatter: suggestedPath.includes('date') || suggestedPath.includes('Date') ? 'formatDate(YYYY-MM-DD)' :
                     suggestedPath.includes('amount') || suggestedPath.includes('Price') ? 'formatNumber(#,##0.00)' : null
        }
      });
    }

    return suggestions;
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
             sampleValue: el.text,
             index: el.index,
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
           sampleValue: el.text,
           index: el.index,
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
           tableIndex: el.index, // <--- Corrected to el.index
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
           sampleValue: el.text,
           index: el.index,
           type: 'text',
           reason: '检测到执行上下文日志内容，建议作为参数'
         });
       } else if (pattern.matched && pattern.type === 'image') {
         // 图片相关段落（但不是组合类型）
         config.variableMappings.push({
           path: `d.${this.slugify(pattern.extractedValue || 'screenshot')}`,
           sampleValue: el.text,
           index: el.index,
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
           imageIndex: el.index, // <--- Corrected to el.index
           imageId: el.imageId || '',
           altText: el.altText || '',
           arrayPath: 'd.screenshots',
           reason: '检测到图片，建议作为数组循环',
           confidence: 0.8
         });
       } else {
         config.variableMappings.push({
           path: `d.screenshot${config.imageLoops.length + 1}`,
           sampleValue: el.altText || 'Image',
           index: el.index,
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
         sampleValue: step.text,
         index: -1, // No specific index for this derived mapping
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
    // 支持多种分隔符：| , ，以及空格分隔的驼峰格式
    let headers: string[];
    if (headerRow.includes('|')) {
      headers = headerRow.split('|').map(h => h.trim()).filter(h => h);
    } else if (headerRow.includes(',')) {
      headers = headerRow.split(',').map(h => h.trim()).filter(h => h);
    } else {
      // 尝试按空格或大写字母分割（驼峰格式）
      headers = headerRow.split(/\s+/).filter(h => h);
    }

    const mappings: ColumnMapping[] = [];

    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      const varName = this.headerToVariableName(header);
      mappings.push({
        headerName: header,
        variablePath: `${arrayPath}[].${varName}`,
        sampleValue: this.getSampleValue(varName),
        columnIndex: i,
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
  generateVariableSuggestions(elements: DocumentElement[], config: TemplateConfig): VariableMapping[] {
    const suggestions: VariableMapping[] = [];

    // 从表格循环中提取变量
    for (const loop of config.tableLoops) {
      for (const col of loop.columnMappings) {
        suggestions.push({
          path: col.variablePath,
          sampleValue: col.sampleValue,
          index: -1,
          type: 'text',
          reason: `来自表格 "${loop.headerRow}" 的列 "${col.headerName}"`
        });
      }
    }

    // 从图片循环中提取变量
    for (const img of config.imageLoops) {
      suggestions.push({
        path: `${img.arrayPath}[].url`,
        sampleValue: img.altText || 'image.png',
        index: -1,
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
   * 使用SSE流式调用AI模型
   * @param elements 文档元素列表
   * @param context 上下文
   * @param manualMarkings 手动标记
   * @param markingSummary 标记摘要
   * @param onProgress 进度回调
   */
  async analyzeWithAIStream(
    elements: DocumentElement[],
    context?: string,
    manualMarkings?: Record<string, string>,
    markingSummary?: string,
    onProgress?: (chunk: string) => void,
  ): Promise<TemplateConfig | null> {
    try {
      this.logger.log('Starting AI stream analysis...');
      // 获取活跃的AI模型
      const modelsResponse = await axios.get(`${this.aiOrchestratorUrl}/ai/models`, {
        timeout: 5000,
      });
      const models = modelsResponse.data?.models || [];

      if (models.length === 0) {
        this.logger.warn('No AI models available');
        return null;
      }

      const activeModel = models.find((m: { status: string }) => m.status === 'active');
      if (!activeModel) {
        this.logger.warn('No active AI models available');
        return null;
      }

      const prompt = this.buildAIAnalysisPrompt(elements, context, manualMarkings, markingSummary);
      this.logger.log(`Prompt length: ${prompt.length} characters`);

      // 使用SSE流式调用
      this.logger.log(`Calling AI stream: ${this.aiOrchestratorUrl}/ai/models/${activeModel.id}/stream`);
      const response = await fetch(`${this.aiOrchestratorUrl}/ai/models/${activeModel.id}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      this.logger.log(`AI stream response status: ${response.status}`);

      if (!response.ok) {
        this.logger.warn(`AI stream call failed: ${response.status}`);
        return null;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        this.logger.warn('No reader available for stream');
        return null;
      }

      const decoder = new TextDecoder();
      let fullResponse = '';
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          this.logger.log(`Stream completed, total chunks: ${chunkCount}`);
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.chunk) {
                fullResponse += data.chunk;
                chunkCount++;
                if (onProgress) {
                  onProgress(data.chunk);
                }
              }
              if (data.error) {
                this.logger.error(`AI stream error: ${data.error}`);
                return null;
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }

      this.logger.log(`Full response length: ${fullResponse.length} characters`);
      return this.parseAIAnalysisResponse(fullResponse, elements);
    } catch (error) {
      this.logger.error(`AI stream analysis error: ${error}`);
      return null;
    }
  }

  /**
   * 构建 AI 分析提示词
   * 第一步：生成参数对照表
   * 第二步：使用对照表生成模版配置
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
        const headers = el.tableHeaders?.map(h => h.text).join(', ') || el.headerRow || '';
        return `${idx + 1}. [TABLE] headers=[${headers}], rows=${el.attributes?.rows || el.dataRows?.length || 0}${markingTag}`;
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

文档元素列表（每行开头的数字是 elementIndex）：
${elementSummary}

请按两步完成分析：

## 第一步：生成参数对照表
分析文档内容，推断可能的参数路径变体，生成标准化对照表。
例如：
- "执行摘要"、"总结"、"summary" → d.summary
- "分析报告"、"分析"、"analysis" → d.analysis
- "日期"、"时间"、"date" → d.date

## 第二步：使用对照表生成模版配置
根据用户的手动标记和第一步的对照表，生成具体配置。

规则：
1. 用户标记为"param"的元素 → variableMappings，使用对照表中的标准路径
2. 用户标记为"loop"的元素 → tableLoops，生成循环路径和列映射
3. 用户标记为"static"的元素 → staticElements，保留不变
4. 图片类型的元素使用 path 格式：d.images[].url 或 d.steps[].screenshot
5. **分组循环（重要）**：如果标记摘要中有"元素分组（循环）"，表示用户创建了一组元素作为循环体
   - 这组元素应该生成 groupLoops 配置
   - 例如：分组包含 "Step 3: screenshot" 文本 + 图片，表示每个步骤都有截图
   - 应该生成：groupLoops 中包含这组元素，使用 arrayPath 如 d.steps
   - 这样在渲染时，每个步骤都会显示对应的截图

表格循环配置：
- 步骤表格使用 arrayPath: d.steps
- 列映射必须包含 columnIndex，对应表格列的位置（从0开始）
- 列映射示例：columnIndex=0 → d.steps[].step, columnIndex=1 → d.steps[].action

分组循环配置：
- 当用户创建分组时，这组元素应该作为循环体重复出现
- 例如：分组索引[7,8]包含 "Step X: screenshot" 文本 + 图片
- 应该生成 groupLoops: [{"groupIndices": [7,8], "arrayPath": "d.steps", "textElement": 7, "imageElement": 8, "reason": "每个步骤显示截图"}]

返回JSON格式：
{
  "parameterMappings": [
    {"patterns": ["可能的路径变体"], "standardPath": "d.xxx", "description": "用途描述"}
  ],
  "templateType": "类型",
  "staticElements": [{"type": "heading", "content": "...", "reason": "..."}],
  "tableLoops": [{"elementIndex": N, "arrayPath": "d.steps", "reason": "...", "columnMappings": [{"columnIndex": 0, "headerName": "Step", "variablePath": "d.steps[].step"}]}],
  "groupLoops": [{"groupIndices": [7,8], "arrayPath": "d.steps", "textElement": 7, "imageElement": 8, "reason": "每个步骤显示截图"}],
  "combinedVariables": [{"stepNumber": N, "textContent": "...", "imageId": "...", "reason": "..."}],
  "variableMappings": [{"elementIndex": N, "path": "d.xxx", "content": "...", "type": "text|image", "reason": "..."}],
  "analysisNotes": ["..."]
}

注意：
- elementIndex 是列表左侧的编号（1-based）
- columnIndex 是表格列的索引（0-based）
- 分组循环优先级高于单独的 combinedVariables，如果用户创建了分组，应该在 groupLoops 中处理
- 只返回JSON，不要解释`;
    }

    return `分析以下文档结构，按两步完成：

## 第一步：生成参数对照表
分析文档内容语义，推断参数路径可能的变化形式，生成标准化对照表。
例如文档中有"执行总结"内容，可能对应路径：
- d.executionSummary、d.summaryText、d.executionsummary → 都应该标准化为 d.summary

## 第二步：使用对照表生成模版配置
根据第一步的对照表和文档结构，生成模版配置。

文档元素列表（每行开头的数字是 elementIndex）：
${elementSummary}

规则：
1. "### xxx" 标题 → staticElements (保留)
2. 表格 → tableLoops (循环)，必须包含 elementIndex 和 columnMappings（带 columnIndex）
3. 图片 → variableMappings (type=image)，路径格式如 d.screenshots[].url
4. 含"日志/上下文/总结/分析"的段落 → variableMappings，使用对照表标准路径

返回JSON格式：
{
  "parameterMappings": [
    {"patterns": ["可能的路径变体"], "standardPath": "d.xxx", "description": "用途描述"}
  ],
  "templateType": "类型",
  "staticElements": [],
  "tableLoops": [{"elementIndex": N, "arrayPath": "d.steps", "columnMappings": [{"columnIndex": 0, "headerName": "Step", "variablePath": "d.steps[].step"}]}],
  "combinedVariables": [],
  "variableMappings": [{"elementIndex": N, "path": "d.xxx", "type": "text|image"}],
  "analysisNotes": []
}

注意：
- elementIndex 是列表左侧的编号（1-based）
- columnIndex 是表格列的索引（0-based）
- 图片类型标记为 type: "image"
- 只返回JSON，不要解释`;
  }

  /**
   * 解析 AI 分析响应
   * 处理AI生成的参数对照表和模版配置
   */
  private parseAIAnalysisResponse(response: string, elements: DocumentElement[]): TemplateConfig {
    try {
      // 尝试提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // 1. 提取并应用AI生成的参数对照表
      let pathMappings: PathMappingRule[] = [];
      if (parsed.parameterMappings && Array.isArray(parsed.parameterMappings)) {
        pathMappings = this.parseAIParameterMappings(parsed.parameterMappings);
        this.logger.log(`AI generated ${pathMappings.length} parameter mapping rules`);
      }

      // 2. 合并AI生成的对照表和默认对照表（AI生成的优先）
      const mergedMappings = this.mergePathMappings(pathMappings, DEFAULT_PATH_MAPPINGS);

      // 3. 使用合并后的对照表规范化配置中的路径
      const config: TemplateConfig = {
        templateType: parsed.templateType || '通用文档',
        staticElements: parsed.staticElements || [],
        tableLoops: this.validateTableLoops(parsed.tableLoops || [], elements, mergedMappings),
        imageLoops: [],
        groupLoops: this.validateGroupLoops(parsed.groupLoops || []),
        combinedVariables: this.validateCombinedVariables(parsed.combinedVariables || [], elements),
        variableMappings: this.validateVariableMappings(parsed.variableMappings || [], elements, mergedMappings),
        analysisNotes: parsed.analysisNotes || [],
      };

      // 保存参数对照表到配置中（供后续使用）
      (config as any).parameterMappings = mergedMappings;

      return config;
    } catch (error) {
      this.logger.error(`Failed to parse AI response: ${error}`);
      throw error;
    }
  }

  /**
   * 解析AI生成的参数对照表
   */
  private parseAIParameterMappings(aiMappings: any[]): PathMappingRule[] {
    const mappings: PathMappingRule[] = [];

    for (const mapping of aiMappings) {
      if (mapping.patterns && Array.isArray(mapping.patterns) && mapping.standardPath) {
        mappings.push({
          patterns: mapping.patterns,
          standardPath: mapping.standardPath,
          description: mapping.description || ''
        });
      }
    }

    return mappings;
  }

  /**
   * 合并AI生成的参数对照表和默认对照表
   * AI生成的规则优先（排在前面）
   */
  private mergePathMappings(aiMappings: PathMappingRule[], defaultMappings: PathMappingRule[]): PathMappingRule[] {
    const merged: PathMappingRule[] = [...aiMappings];

    // 添加默认映射，但跳过已被AI覆盖的标准路径
    const aiStandardPaths = new Set(aiMappings.map(m => m.standardPath));

    for (const defaultMapping of defaultMappings) {
      if (!aiStandardPaths.has(defaultMapping.standardPath)) {
        merged.push(defaultMapping);
      }
    }

    return merged;
  }

  /**
   * 验证并补充表格循环配置
   */
  /**
   * 验证并补充表格循环配置
   * 使用参数对照表规范化变量路径
   */
  private validateTableLoops(tableLoops: any[], elements: DocumentElement[], pathMappings?: PathMappingRule[]): TableLoop[] {
    const result: TableLoop[] = [];

    for (const loop of tableLoops) {
      // AI返回的索引可能是 1-based (elementIndex)
      const elementIndex = loop.elementIndex !== undefined ? loop.elementIndex - 1 : loop.tableIndex;

      // 直接通过索引检查元素是否存在且为表格
      if (elementIndex >= 0 && elementIndex < elements.length) {
        const tableElement = elements[elementIndex];

        if (tableElement && tableElement.type === 'table') {
          // 检查列映射是否是AI自动生成的通用名称（如 "Column 1", "col0" 等）
          const isGenericColumnNames = (mappings: any[]): boolean => {
            if (!mappings || mappings.length === 0) return true;
            // 检查是否有真实的表头名称（非 "Column N" 或 "colN" 格式）
            const hasRealHeaderNames = mappings.some(m => {
              const header = m.headerName || '';
              const varPath = m.variablePath || '';
              // 如果headerName不是 "Column N" 格式，且variablePath不是 "colN" 结尾
              const isGenericHeader = /^Column\s+\d+$/i.test(header);
              const isGenericVarPath = /\[\]\.col\d+$/.test(varPath);
              return !isGenericHeader && !isGenericVarPath;
            });
            return !hasRealHeaderNames;
          };

          let columnMappings = loop.columnMappings;
          // 如果没有列映射，或者列映射是通用名称，则从实际表头重新生成
          if (!columnMappings || columnMappings.length === 0 ||
              (columnMappings.length === 1 && !columnMappings[0].headerName?.includes('|')) ||
              isGenericColumnNames(columnMappings)) {
            // 使用表格结构中的表头信息生成列映射
            columnMappings = this.generateColumnMappingsFromHeaders(tableElement, loop.arrayPath || 'd.items');
          } else {
            // 规范化AI返回的列映射
            columnMappings = this.normalizeColumnMappings(columnMappings, loop.arrayPath || 'd.items', pathMappings);
          }

          result.push({
            tableIndex: elementIndex,
            headerRow: tableElement.headerRow || '',
            dataRowCount: tableElement.dataRows?.length || tableElement.dataRowCount || 0,
            arrayPath: loop.arrayPath || 'd.items',
            columnMappings: columnMappings,
            reason: loop.reason || 'AI 识别的循环表格',
            confidence: 0.9,
          });
        }
      }
    }

    return result;
  }

  /**
   * 从表格结构生成列映射
   */
  private generateColumnMappingsFromHeaders(tableElement: DocumentElement, arrayPath: string): ColumnMapping[] {
    const headers = tableElement.tableHeaders || [];
    const mappings: ColumnMapping[] = [];

    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].text || '';
      const varName = this.headerToVariableName(header);
      mappings.push({
        headerName: header,
        variablePath: `${arrayPath}[].${varName}`,
        sampleValue: this.getSampleValue(varName),
        columnIndex: i,
      });
    }

    // 如果没有tableHeaders，从headerRow解析
    if (mappings.length === 0 && tableElement.headerRow) {
      return this.generateColumnMappings(tableElement.headerRow, arrayPath);
    }

    return mappings;
  }

  /**
   * 规范化AI返回的列映射
   */
  /**
   * 规范化AI返回的列映射
   * 使用参数对照表规范化变量路径
   */
  private normalizeColumnMappings(mappings: any[], arrayPath: string, pathMappings?: PathMappingRule[]): ColumnMapping[] {
    return mappings.map((mapping, index) => {
      // 使用columnIndex（优先AI返回的，否则使用数组索引）
      const columnIndex = mapping.columnIndex !== undefined ? mapping.columnIndex : index;

      // 优先使用 headerName 转换字段名，确保与表格头一致
      let varName = '';
      if (mapping.headerName) {
        // 使用 headerToVariableName 方法转换表头名称
        varName = this.headerToVariableName(mapping.headerName);
      } else if (mapping.variablePath) {
        // 从 variablePath 提取字段名
        const fieldMatch = mapping.variablePath.match(/\[\]\.(\w+)$/);
        varName = fieldMatch ? fieldMatch[1] : `col${columnIndex}`;
      } else {
        varName = `col${columnIndex}`;
      }

      return {
        headerName: mapping.headerName || `Column ${columnIndex + 1}`,
        variablePath: `${arrayPath}[].${varName}`,
        sampleValue: mapping.sampleValue || this.getSampleValue(varName),
        columnIndex: columnIndex,
      };
    });
  }

  /**
   * 验证并补充变量映射配置
   * 使用参数对照表规范化变量路径
   */
  /**
   * 验证并补充变量映射配置
   * 使用参数对照表规范化变量路径
   */
  private validateVariableMappings(mappings: any[], elements: DocumentElement[], pathMappings?: PathMappingRule[]): VariableMapping[] {
    const result: VariableMapping[] = [];

    for (const mapping of mappings) {
      // 转换 1-based 索引为 0-based
      const index = mapping.elementIndex !== undefined ? mapping.elementIndex - 1 : mapping.index;

      if (index !== undefined && index >= 0 && index < elements.length) {
        const element = elements[index];

        // 修正变量路径（使用参数对照表）
        let path = mapping.path || `d.var_${index}`;
        path = this.normalizeVariablePath(path, pathMappings);

        // 检测元素类型，图片类型需要特殊处理
        let type = mapping.type || 'text';
        if (element.type === 'image' || (element.imageId && element.imageId !== '')) {
          type = 'image';
        }

        result.push({
          path: path,
          sampleValue: element.text || mapping.sampleValue || mapping.content || '',
          index: index,
          type: type,
          reason: mapping.reason || 'AI 识别的变量',
        });
      }
    }

    return result;
  }

  /**
   * 使用参数对照表规范化变量路径
   * @param originalPath AI生成的原始路径
   * @param pathMappings 可选的参数对照表（优先使用）
   * @returns 规范化后的标准路径
   */
  private normalizeVariablePath(originalPath: string, pathMappings?: PathMappingRule[]): string {
    // 使用传入的对照表或默认对照表
    const mappings = pathMappings || DEFAULT_PATH_MAPPINGS;

    // 遍历参数对照表，查找匹配的规则
    for (const rule of mappings) {
      // 检查是否精确匹配
      if (rule.patterns.includes(originalPath)) {
        this.logger.debug(`Path mapping: ${originalPath} -> ${rule.standardPath} (${rule.description})`);
        return rule.standardPath;
      }

      // 检查是否匹配模式（支持简单的通配符匹配）
      for (const pattern of rule.patterns) {
        if (this.matchPathPattern(originalPath, pattern)) {
          this.logger.debug(`Path mapping (pattern): ${originalPath} -> ${rule.standardPath} (${rule.description})`);
          return rule.standardPath;
        }
      }
    }

    // 没有匹配的规则，检查路径格式是否正确
    if (!originalPath.startsWith('d.')) {
      // 尝试自动修正为 d.xxx 格式
      const correctedPath = `d.${originalPath.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()}`;
      this.logger.debug(`Auto-correcting path: ${originalPath} -> ${correctedPath}`);
      return correctedPath;
    }

    return originalPath;
  }

  /**
   * 检查路径是否匹配模式
   * 支持简单的通配符匹配
   */
  private matchPathPattern(path: string, pattern: string): boolean {
    // 精确匹配
    if (path === pattern) return true;

    // 转换为小写后比较（不区分大小写）
    if (path.toLowerCase() === pattern.toLowerCase()) return true;

    // 驼峰转下划线后比较
    const snakeCase = (s: string) => s.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    if (snakeCase(path) === snakeCase(pattern)) return true;

    return false;
  }

  /**
   * 规范化模版配置
   * 使用参数对照表规范化变量路径，确保路径一致性
   * 此方法为公开方法，可在加载已保存的配置时调用
   * @param config 原始模版配置
   * @returns 规范化后的模版配置
   */
  normalizeTemplateConfig(config: TemplateConfig): TemplateConfig {
    if (!config) return config;

    // 规范化变量映射路径
    if (config.variableMappings && Array.isArray(config.variableMappings)) {
      config.variableMappings = config.variableMappings.map(mapping => ({
        ...mapping,
        path: this.normalizeVariablePath(mapping.path)
      }));
    }

    // 规范化表格循环中的列映射路径
    if (config.tableLoops && Array.isArray(config.tableLoops)) {
      config.tableLoops = config.tableLoops.map(loop => ({
        ...loop,
        columnMappings: (loop.columnMappings || []).map(col => ({
          ...col,
          variablePath: this.normalizeColumnPath(col.variablePath)
        }))
      }));
    }

    return config;
  }

  /**
   * 规范化列路径（保持数组标记）
   * d.steps[].stepAction -> d.steps[].action
   */
  private normalizeColumnPath(path: string): string {
    if (!path) return path;

    // 提取数组部分和字段部分
    const arrayMatch = path.match(/^(d\.\w+)\[\]\.(\w+)$/);
    if (arrayMatch) {
      const arrayPath = arrayMatch[1];
      const fieldName = arrayMatch[2];
      // 规范化字段名
      const normalizedFieldName = this.normalizeFieldName(fieldName);
      return `${arrayPath}[].${normalizedFieldName}`;
    }

    return path;
  }

  /**
   * 规范化字段名
   */
  private normalizeFieldName(fieldName: string): string {
    const fieldMappings: Record<string, string> = {
      'stepaction': 'action',
      'stepAction': 'action',
      'stepResult': 'result',
      'stepresult': 'result',
      'stepStatus': 'status',
      'stepstatus': 'status',
      'resultAction': 'result',
      'resultaction': 'result',
    };

    return fieldMappings[fieldName] || fieldName.toLowerCase();
  }

  /**
   * 验证并补充分组循环配置
   */
  private validateGroupLoops(groupLoops: any[]): GroupLoop[] {
    const result: GroupLoop[] = [];

    for (const gl of groupLoops) {
      if (gl.groupIndices && Array.isArray(gl.groupIndices) && gl.groupIndices.length > 0) {
        result.push({
          groupId: gl.groupId,
          groupIndices: gl.groupIndices,
          arrayPath: gl.arrayPath || 'd.items',
          textElement: gl.textElement,
          imageElement: gl.imageElement,
          reason: gl.reason || '用户创建的分组循环',
        });
      }
    }

    return result;
  }

  /**
   * 验证并补充组合变量配置
   * 合并AI生成的组合变量和文档中检测到的step-screenshot元素
   */
  private validateCombinedVariables(combinedVars: any[], elements: DocumentElement[]): CombinedVariable[] {
    const result: CombinedVariable[] = [];
    const existingStepNumbers = new Set<number>();

    // 1. 先添加AI生成的组合变量
    for (const cv of combinedVars) {
      const stepNumber = cv.stepNumber || 0;
      existingStepNumbers.add(stepNumber);
      result.push({
        id: `combined-${stepNumber}`,
        type: 'step-screenshot',
        stepNumber: stepNumber,
        textContent: cv.textContent || '',
        imageId: cv.imageId || '',
        imagePath: `d.steps[${stepNumber - 1}].screenshot`,
        reason: cv.reason || 'AI 识别的组合变量',
      });
    }

    // 2. 添加文档中检测到的step-screenshot元素（如果不在AI结果中）
    for (const el of elements) {
      if (el.type === 'step-screenshot' && el.stepNumber) {
        if (!existingStepNumbers.has(el.stepNumber)) {
          existingStepNumbers.add(el.stepNumber);
          result.push({
            id: el.id,
            type: 'step-screenshot',
            stepNumber: el.stepNumber,
            textContent: el.content || '',
            imageId: el.combinedImage?.imageId || '',
            imagePath: `d.steps[${el.stepNumber - 1}].screenshot`,
            reason: '文档解析检测到的step-screenshot组合元素',
          });
        }
      }
    }

    // 按步骤号排序
    result.sort((a, b) => a.stepNumber - b.stepNumber);

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