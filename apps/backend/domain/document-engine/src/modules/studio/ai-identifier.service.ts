/**
 * Carbone Engine - AI Identifier Service
 * AI自动标识服务，基于多阶段AI分析生成模版配置
 */

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DocumentStructure, DocumentElement } from './document-structure.service';
import { getAiOrchestratorUrl } from '../../config/service-endpoints';

import {
  ProcessingStage,
  ProcessingProgress,
  DocumentUnderstanding,
  SectionParameterization,
  TemplateConfig,
  AIIdentifyResponse,
  VariableMapping,
  PathMappingRule
} from './utils/types';
export {
  ProcessingStage,
  ProcessingProgress,
  DocumentUnderstanding,
  SectionParameterization,
  TemplateConfig,
  AIIdentifyResponse,
  VariableMapping,
  PathMappingRule
};

import { parseDocxStructure } from './utils/docx-parser';
import {
  extractBlankPatterns,
  mergeUnderlineInfo,
  extractSectionContent,
  inferVariablePath,
  calculateContextOverlap
} from './utils/blank-extractor';
import { generateVariableSuggestions, generateColumnMappingsFromHeaders, normalizeColumnMappings } from './utils/table-loop-helper';
import {
  validateVariableMappings,
  validateGroupLoops,
  validateCombinedVariables,
  generateFallbackSuggestions,
  parseUserContext,
  generateTemplateConfig,
  extractFormatter,
  normalizeTemplateConfig,
  formatRawSuggestions,
  buildVariableMappingsFromSuggestions
} from './utils/parameter.helper';
import {
  generateAISkillGuide,
  generateParametersFromDescription
} from './utils/skill.helper';
import {
  analyzeBlankPatternsWithAI,
  buildAIAnalysisPrompt,
  parseAIAnalysisResponse
} from './utils/ai-prompt.builder';

type AiModelDescriptor = {
  id: string;
  status: string;
  [key: string]: unknown;
};

type AiModelsResponse = {
  models?: AiModelDescriptor[];
};

type AiTestResponse = {
  success?: boolean;
  response?: any;
  error?: string;
};

@Injectable()
export class AIIdentifierService {
  private readonly logger = new Logger(AIIdentifierService.name);
  private readonly aiOrchestratorUrl: string;

  constructor() {
    this.aiOrchestratorUrl = getAiOrchestratorUrl();
  }

  /**
   * 分析模板文档并生成模版配置
   * @param templatePath 模板文件路径
   * @param format 文件格式
   * @param context 用户上下文
   * @param documentStructure 可选的文档结构数据
   * @param manualMarkings 用户手动标记
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
    if (!documentStructure && format === 'docx') {
      documentStructure = await parseDocxStructure(templatePath);
    }

    const elements = documentStructure?.elements || [];
    const userIntent = parseUserContext(context || '');

    const templateConfig = await this.analyzeWithAI(elements, context, manualMarkings, markingSummary);
    if (!templateConfig) {
      throw new Error('AI分析失败，请检查AI服务是否正常');
    }
    this.logger.log('AI analysis completed successfully');

    const suggestions = generateVariableSuggestions(elements, templateConfig);
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
   */
  async identifyFromContent(
    documentContent: string,
    documentType: string,
    templateType: string,
    context?: string,
    customRules?: Array<{ pattern: string; targetPath: string; description?: string }>,
    skill?: any
  ): Promise<AIIdentifyResponse> {
    this.logger.log(`Direct AI identify from content, type: ${templateType}, content length: ${documentContent.length}`);

    const blankPatterns = extractBlankPatterns(documentContent, templateType);
    this.logger.log(`Found ${blankPatterns.length} blank patterns`);

    const { suggestions, usedAI } = await analyzeBlankPatternsWithAI(
      blankPatterns,
      documentContent,
      templateType,
      context,
      customRules,
      skill,
      (prompt) => this.callAIService(prompt)
    );

    this.logger.log(`识别方式: ${usedAI ? 'AI智能识别' : '规则匹配（AI服务不可用）'}`);

    const templateConfig: TemplateConfig = {
      templateType,
      staticElements: [],
      tableLoops: [],
      imageLoops: [],
      combinedVariables: [],
      variableMappings: [],
      analysisNotes: []
    };

    const documentStats = {
      totalElements: blankPatterns.length,
      tables: 0,
      images: 0,
      stepScreenshots: 0,
      potentialLoops: 0
    };

    const variableMappings: VariableMapping[] = suggestions.map((s, idx) => ({
      path: s.suggestedName,
      sampleValue: s.originalText,
      index: idx,
      type: 'text' as const,
      reason: s.details?.significance || ''
    }));

    return {
      templateConfig,
      suggestions: variableMappings,
      rawSuggestions: suggestions,
      loops: [],
      images: [],
      combinedVariables: [],
      analyzedAt: new Date().toISOString(),
      documentStats,
      contextAnalysis: {
        detectedTemplateType: templateType,
        userIntent: context || 'Office文档模板化',
        usedAI,
        aiServiceUrl: this.aiOrchestratorUrl
      }
    };
  }

  /**
   * 多阶段AI识别 - 用于Office插件
   */
  async identifyFromContentMultiStage(
    documentContent: string,
    documentType: string,
    templateType: string,
    context?: string,
    progressCallback?: (progress: ProcessingProgress) => void,
    underlineInfo?: Array<{
      text: string;
      underlineType: string;
      paragraphText: string;
      paragraphIndex?: number;
      position: { start: number; end: number };
    }>,
    paragraphFormats?: Array<{
      text: string;
      index: number;
      format: {
        fontSize?: number;
        isBold?: boolean;
        alignment?: string;
        isTitle?: boolean;
      };
    }>,
    skill?: any
  ): Promise<AIIdentifyResponse> {
    this.logger.log(`开始多阶段AI识别, 类型: ${templateType}, 内容长度: ${documentContent.length}`);

    if (underlineInfo && underlineInfo.length > 0) {
      this.logger.log(`检测到 ${underlineInfo.length} 个精确下划线位置，使用快速命名流程`);
      return await this.quickNameParameters(underlineInfo, documentContent, templateType, progressCallback);
    }

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
      reportProgress(ProcessingStage.DOCUMENT_UNDERSTANDING, '文档理解', 0, '正在分析文档整体结构和内容...');
      const documentUnderstanding = await this.analyzeDocumentUnderstanding(documentContent, templateType, context);
      reportProgress(ProcessingStage.DOCUMENT_UNDERSTANDING, '文档理解', 100,
        `文档理解完成，识别到 ${documentUnderstanding.sections.length} 个章节，${documentUnderstanding.parties.length} 个当事人`);

      reportProgress(ProcessingStage.SECTION_ANALYSIS, '预处理', 0, '正在预提取文档中的空白位置...');
      const preExtractedBlanks = extractBlankPatterns(documentContent, templateType);
      this.logger.log(`预处理提取到 ${preExtractedBlanks.length} 个空白位置`);

      let blanksToUse = preExtractedBlanks;
      if (underlineInfo && underlineInfo.length > 0) {
        blanksToUse = mergeUnderlineInfo([], underlineInfo, documentContent, templateType);
        this.logger.log(`使用下划线信息作为参数来源，共 ${blanksToUse.length} 个参数位置`);
        reportProgress(ProcessingStage.SECTION_ANALYSIS, '预处理', 10,
          `使用 Word 下划线检测结果，发现 ${blanksToUse.length} 个参数位置`);
      } else {
        reportProgress(ProcessingStage.SECTION_ANALYSIS, '预处理', 10,
          `预提取完成，发现 ${preExtractedBlanks.length} 个潜在空白位置`);
      }

      reportProgress(ProcessingStage.SECTION_ANALYSIS, '分段参数化', 0, '开始对各章节进行语义分析...');
      const allSectionResults: SectionParameterization[] = [];
      const sectionsToProcess = documentUnderstanding.sections.filter(s => s.needsParameterization);

      for (let i = 0; i < sectionsToProcess.length; i++) {
        const section = sectionsToProcess[i];
        const sectionProgress = Math.round((i / sectionsToProcess.length) * 80);

        reportProgress(ProcessingStage.SECTION_ANALYSIS, '分段参数化', sectionProgress,
          `正在分析章节: ${section.name}`, section.name);

        const sectionContent = extractSectionContent(documentContent, section.name);
        const sectionBlanks = blanksToUse.filter(b =>
          b.chapter === section.name || b.chapter.includes(section.name) || section.name.includes(b.chapter)
        );

        const sectionResult = await this.parameterizeSection(
          section.name,
          sectionContent,
          documentUnderstanding,
          templateType,
          sectionBlanks
        );

        allSectionResults.push(sectionResult);
        reportProgress(ProcessingStage.SECTION_ANALYSIS, '分段参数化', sectionProgress + Math.round(80 / sectionsToProcess.length),
          `章节 ${section.name} 分析完成，识别到 ${sectionResult.suggestions.length} 个参数`);
      }

      reportProgress(ProcessingStage.SECTION_ANALYSIS, '分段参数化', 100,
        `分段参数化完成，共识别到 ${allSectionResults.reduce((sum, s) => sum + s.suggestions.length, 0)} 个潜在参数`);

      reportProgress(ProcessingStage.INTEGRATION, '整合确认', 0, '正在整合和确认所有识别结果...');
      const finalSuggestions = await this.integrateAndConfirm(
        allSectionResults,
        documentUnderstanding,
        documentContent,
        templateType
      );
      reportProgress(ProcessingStage.INTEGRATION, '整合确认', 100,
        `整合确认完成，最终确认 ${finalSuggestions.length} 个有效参数`);

      reportProgress(ProcessingStage.COMPLETE, '完成', 100, 'AI识别处理完成');

      const templateConfig: TemplateConfig = {
        templateType: documentUnderstanding.documentType,
        staticElements: [],
        tableLoops: [],
        imageLoops: [],
        combinedVariables: [],
        variableMappings: [],
        analysisNotes: [`文档类型: ${documentUnderstanding.documentType}`, `主要用途: ${documentUnderstanding.mainPurpose}`]
      };

      const variableMappings = buildVariableMappingsFromSuggestions(finalSuggestions);
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
          aiServiceUrl: this.aiOrchestratorUrl,
          flowType: 'multi-stage'
        }
      };
    } catch (error: any) {
      this.logger.error('多阶段AI识别失败:', error);
      reportProgress(ProcessingStage.COMPLETE, '处理失败', 0, `处理失败: ${error.message}`);
      this.logger.warn('回退到简化处理模式');
      return this.identifyFromContent(documentContent, documentType, templateType, context);
    }
  }

  /**
   * 阶段1: 文档理解
   */
  private async analyzeDocumentUnderstanding(
    documentContent: string,
    templateType: string,
    context?: string
  ): Promise<DocumentUnderstanding> {
    this.logger.log('阶段1: 开始文档理解分析');

    const prompt = `你是一个专业的文档分析专家。请仔细阅读以下文档内容，分析并理解文档的整体结构、主题、关键实体和数据需求。

文档类型提示: ${templateType}
${context ? `用户说明: ${context}` : ''}

【文档内容】
${documentContent.substring(0, Math.min(3000, documentContent.length))}
${documentContent.length > 3000 ? '\n...(文档较长，已截取前3000字符)' : ''}

请返回JSON格式的分析结果：
{
  "documentType": "合同/协议/报告/证书等",
  "mainPurpose": "文档的主要用途和目的",
  "keyEntities": ["甲方", "乙方", "项目名称", "日期", "地点"],
  "dataSchema": "描述该文档建议的数据模型结构，例如：{ partyA: { name, address }, project: { name, duration } }",
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

只返回JSON格式，不要其他解释。`;

    try {
      const aiResponse = await this.callAIService(prompt);
      if (aiResponse && aiResponse.documentType) {
        this.logger.log(`文档理解成功: 类型=${aiResponse.documentType}, 章节数=${aiResponse.sections?.length || 0}`);
        return {
          documentType: aiResponse.documentType || templateType,
          mainPurpose: aiResponse.mainPurpose || '文档模板化处理',
          sections: aiResponse.sections || [],
          parties: aiResponse.parties || []
        };
      }
      this.logger.warn('AI文档理解返回格式异常，使用基础理解');
      return this.buildBasicDocumentUnderstanding(documentContent, templateType);
    } catch (error: any) {
      this.logger.error('文档理解AI调用失败:', error);
      return this.buildBasicDocumentUnderstanding(documentContent, templateType);
    }
  }

  /**
   * 构建基础文档理解
   */
  private buildBasicDocumentUnderstanding(content: string, templateType: string): DocumentUnderstanding {
    const chapterStructure = extractBlankPatterns(content, templateType);
    const sections = chapterStructure.map(chapter => ({
      name: chapter.chapter || '正文',
      content: content.substring(chapter.position, Math.min(content.length, chapter.position + 200)),
      purpose: '文档章节内容',
      needsParameterization: this.checkNeedsParameterization(content.substring(chapter.position)),
      estimatedParams: []
    }));

    const parties = ['甲方', '乙方', '委托方', '受托方']
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
    const patterns = [
      /[：:]\s+/,
      /[_＿]{2,}/,
      /[ 　]{4,}/,
      /[（【\(][　 ]*[）】\)]/,
      /[\s　]+年[\s　]+月[\s　]+日/,
    ];
    return patterns.some(pattern => pattern.test(content));
  }

  /**
   * 阶段2: 章节参数化
   */
  private async parameterizeSection(
    sectionName: string,
    sectionContent: string,
    documentUnderstanding: DocumentUnderstanding,
    templateType: string,
    preExtractedBlanks: any[] = []
  ): Promise<SectionParameterization> {
    this.logger.log(`阶段2: 参数化章节 "${sectionName}", 预处理空白 ${preExtractedBlanks.length} 个`);

    const relevantParties = documentUnderstanding.parties;
    const keyEntitiesInfo = documentUnderstanding.keyEntities ? `【关键实体】: ${documentUnderstanding.keyEntities.join(', ')}` : '';
    const dataSchemaInfo = documentUnderstanding.dataSchema ? `【建议数据架构】: ${documentUnderstanding.dataSchema}` : '';

    const preBlanksList = preExtractedBlanks.length > 0
      ? `\n【已识别的空白填充位置】（共${preExtractedBlanks.length}个，每个位置都需要填写内容）\n${preExtractedBlanks.map((b, i) =>
        `[${i + 1}] 空白内容: "${b.text}"\n    前文: "${b.beforeBlank}"\n    上下文片段: "${b.context}"\n    类型: ${b.type}\n    建议意义: "${b.significance}"`
      ).join('\n')}\n\n请根据上下文为每个空白位置生成合适的变量名，变量名应反映其业务含义。`
      : '';

    const prompt = `你是一个专业的文档模板化专家。请分析以下章节内容，为每个空白填充位置生成语义化变量。

【核心原则】
- 只有”下划线+空格”才是需要填写内容的参数位置
- 变量名应反映空白所在位置的标签文字（如空白前是”甲方”则变量名应包含partyA）
- context字段必须包含空白内容本身，方便后续精确定位和替换

文档类型: ${documentUnderstanding.documentType}
章节名称: ${sectionName}
章节用途: ${documentUnderstanding.mainPurpose}
${keyEntitiesInfo}
${dataSchemaInfo}

【当事人信息】
${relevantParties.map(p => `${p.role} 需要字段: ${p.fieldsNeeded.join(', ')}`).join('\n')}

【已识别的空白位置】
${preBlanksList || '无空白位置'}

【章节内容】
${sectionContent}

请返回JSON格式的分析结果：
{
  "sectionName": "${sectionName}",
  "suggestions": [
    {
      "originalText": "空白内容本身（如______）",
      "variablePath": "d.partyA.name",
      "variableName": "甲方名称",
      "fieldType": "text/date/number/amount/enum",
      "significance": "根据上下文推断的业务意义",
      "context": "前文标签 + 空白内容 + 后文（如：甲方：______（签章））",
      "confidence": 0.95
    }
  ]
}

【重要提示】
1. originalText必须是空白内容本身（下划线或空格），不包含标签文字
2. context格式：【标签】空白内容【后文】，用于精确定位
3. 为每个空白位置生成合适的变量名

只返回JSON格式，不要其他解释。`;

    try {
      const aiResponse = await this.callAIService(prompt);
      if (aiResponse && aiResponse.suggestions && Array.isArray(aiResponse.suggestions)) {
        this.logger.log(`章节 "${sectionName}" AI参数化成功，识别到 ${aiResponse.suggestions.length} 个参数`);

        const aiSuggestions = aiResponse.suggestions.map((s: any) => ({
          originalText: s.originalText || '',
          variablePath: s.variablePath || 'd.unknown',
          variableName: s.variableName || '未知字段',
          fieldType: s.fieldType || 'text',
          significance: s.significance || '文档填充字段',
          context: s.context || sectionContent.substring(0, 50),
          confidence: s.confidence || 0.7
        }));

        const missingBlanks = preExtractedBlanks.filter(pre => {
          const inferredPath = inferVariablePath(pre.beforeBlank, pre.type, templateType);
          return !aiSuggestions.some((ai: any) => {
            if (ai.variablePath === inferredPath) return true;
            const coreKeywords = ['甲方', '乙方', '地址', '名称', '签字', '盖章', '日期', '年份', '附件', '保密期限'];
            const preKeyword = coreKeywords.find(kw => pre.beforeBlank.includes(kw));
            const aiKeyword = coreKeywords.find(kw => ai.variablePath.includes(kw) || ai.variableName?.includes(kw));
            if (preKeyword && aiKeyword && preKeyword === aiKeyword) {
              const contextOverlap = calculateContextOverlap(pre.context, ai.context || '');
              if (contextOverlap > 0.5) return true;
            }
            return false;
          });
        });

        if (missingBlanks.length > 0) {
          this.logger.log(`补充 ${missingBlanks.length} 个预处理空白（AI未覆盖）`);
          for (const blank of missingBlanks) {
            const inferredPath = inferVariablePath(blank.beforeBlank, blank.type, templateType);
            aiSuggestions.push({
              originalText: blank.text,
              variablePath: inferredPath,
              variableName: blank.beforeBlank || '未知字段',
              significance: blank.significance,
              context: blank.context,
              confidence: 0.6
            });
          }
        }

        return { sectionName, suggestions: aiSuggestions };
      }

      return {
        sectionName,
        suggestions: preExtractedBlanks.map(b => ({
          originalText: b.text,
          variablePath: inferVariablePath(b.beforeBlank, b.type, templateType),
          variableName: b.beforeBlank || '未知字段',
          significance: b.significance,
          context: b.context,
          confidence: 0.5
        }))
      };
    } catch (error: any) {
      this.logger.error(`章节 "${sectionName}" 参数化失败:`, error);
      return {
        sectionName,
        suggestions: preExtractedBlanks.map(b => ({
          originalText: b.text,
          variablePath: inferVariablePath(b.beforeBlank, b.type, templateType),
          variableName: b.beforeBlank || '未知字段',
          significance: b.significance,
          context: b.context,
          confidence: 0.5
        }))
      };
    }
  }

  /**
   * 阶段3: 整合确认
   */
  private async integrateAndConfirm(
    sectionResults: SectionParameterization[],
    documentUnderstanding: DocumentUnderstanding,
    fullContent: string,
    templateType: string
  ): Promise<any[]> {
    this.logger.log('阶段3: 开始整合确认');
    const allSuggestions = sectionResults.flatMap(sr => sr.suggestions);

    if (allSuggestions.length === 0) {
      this.logger.warn('没有识别到任何参数');
      return [];
    }

    const prompt = `你是一个专业的文档模板化审核专家。请审核以下识别结果，进行整合和确认。

文档类型: ${documentUnderstanding.documentType}
文档用途: ${documentUnderstanding.mainPurpose}

【已识别的所有参数】（共${allSuggestions.length}个，可能存在重复或冲突）
${JSON.stringify(allSuggestions, null, 2)}

【文档背景内容】
${fullContent.substring(0, Math.min(1000, fullContent.length))}

请返回JSON格式的最终确认结果：
{
  "confirmedSuggestions": [
    {
      "originalText": "原文内容",
      "variablePath": "最终确认的变量路径 (使用d.前缀，点号分隔)",
      "variableName": "变量名称 (简短中文)",
      "fieldType": "text/date/number/amount/enum",
      "significance": "【用途说明】: 该参数的详细用途；【填写示例】: 示例值；【校验规则】: 格式或逻辑要求",
      "context": "原文上下文 (格式：【前文 _____ 后文】)",
      "confidence": 0.95,
      "chapter": "所在章节名称"
    }
  ],
  "removedDuplicates": ["说明哪些参数被合并或删除及其原因"]
}

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
            usage: s.usage,
            variableName: s.variableName,
            fieldType: s.fieldType || 'text',
            formatter: extractFormatter(s.variablePath)
          }
        }));
      }
      return formatRawSuggestions(allSuggestions);
    } catch (error: any) {
      this.logger.error('整合确认失败:', error);
      return formatRawSuggestions(allSuggestions);
    }
  }

  /**
   * 快速命名流程
   */
  private async quickNameParameters(
    underlineInfo: any[],
    documentContent: string,
    templateType: string,
    progressCallback?: (progress: ProcessingProgress) => void
  ): Promise<AIIdentifyResponse> {
    this.logger.log(`快速命名流程: 处理 ${underlineInfo.length} 个参数位置`);

    const reportProgress = (stage: ProcessingStage, stageName: string, progress: number, message: string) => {
      this.logger.log(`进度: [${stageName}] ${progress}% - ${message}`);
      if (progressCallback) {
        progressCallback({ stage, stageName, progress, message });
      }
    };

    reportProgress(ProcessingStage.SECTION_ANALYSIS, '快速识别', 0, '正在分析参数语义...');

    const parameterList = underlineInfo.map((info, idx) => {
      const paraText = info.paragraphText;
      const start = Math.max(0, info.position.start - 10);
      const end = Math.min(paraText.length, info.position.end + 10);
      const context = paraText.substring(start, end);
      const beforeBlank = paraText.substring(0, info.position.start);
      const labelMatch = beforeBlank.match(/([^\s：:]+)[：:]?\s*$/);
      const label = labelMatch ? labelMatch[1].trim() : '';

      return {
        index: idx + 1,
        text: info.text,
        context: context,
        label: label,
        paragraph: paraText.substring(0, 50) + '...'
      };
    });

    const prompt = `你是一个专业的合同模板参数命名专家。请根据以下参数位置的上下文信息，为每个参数生成合适的变量名称和说明。

模板类型: ${templateType}

【参数位置列表】
${parameterList.map(p => `
#${p.index}
- 上下文: "${p.context}"
- 前置标签: "${p.label}"
- 段落: "${p.paragraph}"
`).join('\n')}

请返回JSON数组，为每个参数生成：
[
  {
    "index": 1,
    "variablePath": "{d.partyA.name}",
    "variableName": "partyA_name",
    "significance": "甲方公司名称",
    "fieldType": "text",
    "chapter": "第一章 协议双方",
    "confidence": 0.95
  }
]

只返回JSON数组，不要其他解释。`;

    try {
      reportProgress(ProcessingStage.SECTION_ANALYSIS, '快速识别', 50, '正在调用AI进行语义命名...');
      const aiResponseObj = await this.callAIService(prompt);

      reportProgress(ProcessingStage.SECTION_ANALYSIS, '快速识别', 90, '正在处理AI响应...');

      let namingResults: any[] = aiResponseObj?.suggestions || [];
      if (namingResults.length === 0 && aiResponseObj?.response) {
        const arrayMatch = aiResponseObj.response.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          namingResults = JSON.parse(arrayMatch[0]);
        }
      }

      if (namingResults.length < underlineInfo.length) {
        for (let i = namingResults.length; i < underlineInfo.length; i++) {
          namingResults.push({
            index: i + 1,
            variablePath: `{d.field_${i + 1}}`,
            variableName: `field_${i + 1}`,
            significance: '待填写内容',
            fieldType: 'text',
            confidence: 0.7
          });
        }
      }

      const suggestions = namingResults.map((result, idx) => {
        const info = underlineInfo[idx];
        const para = info?.paragraphText || '';
        const posStart = info?.position?.start || 0;
        const posEnd = info?.position?.end || 0;
        const context = para.substring(Math.max(0, posStart - 15), Math.min(para.length, posEnd + 15));

        return {
          id: `sugg-${Date.now()}-${idx}`,
          type: 'variable',
          elementPath: `【${context}】`,
          suggestedName: result.variablePath || `{d.field_${idx + 1}}`,
          originalText: underlineInfo[idx]?.text || '',
          confidence: result.confidence || 0.8,
          applied: false,
          context: context,
          underlineInfo: {
            paragraphIndex: info?.paragraphIndex,
            position: info?.position,
            paragraphText: info?.paragraphText,
            underlineType: info?.underlineType
          },
          details: {
            chapter: result.chapter || '正文',
            significance: result.significance || '文档填充字段',
            variableName: result.variableName,
            fieldType: result.fieldType || 'text',
            displayPosition: context,
            beforeBlank: parameterList[idx]?.label || '',
            afterBlank: para.substring(posEnd, Math.min(para.length, posEnd + 10)),
            formatter: extractFormatter(result.variablePath)
          }
        };
      });

      reportProgress(ProcessingStage.COMPLETE, '完成', 100, `快速识别完成，共 ${suggestions.length} 个参数`);

      return {
        templateConfig: {
          templateType: templateType,
          staticElements: [],
          tableLoops: [],
          imageLoops: [],
          combinedVariables: [],
          variableMappings: [],
          analysisNotes: [`快速识别模式，基于 ${underlineInfo.length} 个下划线位置`]
        },
        suggestions: suggestions.map((s, idx) => ({
          path: s.suggestedName,
          sampleValue: s.originalText,
          index: idx,
          type: 'text',
          reason: s.details?.significance,
          fieldType: s.details?.fieldType
        })),
        rawSuggestions: suggestions,
        loops: [],
        images: [],
        combinedVariables: [],
        analyzedAt: new Date().toISOString(),
        documentStats: {
          totalElements: suggestions.length,
          tables: 0,
          images: 0,
          stepScreenshots: 0,
          potentialLoops: 0
        },
        contextAnalysis: {
          detectedTemplateType: templateType,
          userIntent: '基于下划线位置的参数识别',
          usedAI: true,
          aiServiceUrl: this.aiOrchestratorUrl,
          flowType: 'quick'
        }
      };
    } catch (error) {
      this.logger.error('快速命名流程失败:', error);
      reportProgress(ProcessingStage.COMPLETE, '完成', 100, '使用默认命名');

      const suggestions = underlineInfo.map((info, idx) => ({
        id: `sugg-${Date.now()}-${idx}`,
        type: 'variable',
        elementPath: `【${info.paragraphText.substring(0, 30)}...】`,
        suggestedName: `{d.field_${idx + 1}}`,
        originalText: info.text,
        confidence: 0.7,
        applied: false,
        context: info.paragraphText.substring(0, 50),
        details: {
          chapter: '正文',
          significance: '待填写内容',
          variableName: `field_${idx + 1}`,
          fieldType: 'text'
        }
      }));

      return {
        templateConfig: {
          templateType: templateType,
          staticElements: [],
          tableLoops: [],
          imageLoops: [],
          combinedVariables: [],
          variableMappings: [],
          analysisNotes: ['后备命名模式']
        },
        suggestions: suggestions.map((s, idx) => ({
          path: s.suggestedName,
          sampleValue: s.originalText,
          index: idx,
          type: 'text',
          reason: s.details?.significance
        })),
        rawSuggestions: suggestions,
        loops: [],
        images: [],
        combinedVariables: [],
        analyzedAt: new Date().toISOString(),
        documentStats: {
          totalElements: suggestions.length,
          tables: 0,
          images: 0,
          stepScreenshots: 0,
          potentialLoops: 0
        },
        contextAnalysis: {
          detectedTemplateType: templateType,
          userIntent: '后备命名',
          usedAI: false,
          aiServiceUrl: this.aiOrchestratorUrl
        }
      };
    }
  }

  /**
   * 调用 AI 服务 (底层的 HTTP POST 请求)
   */
  private async callAIService(prompt: string, retryCount: number = 0): Promise<any> {
    try {
      const modelsResponse = await axios.get<AiModelsResponse>(`${this.aiOrchestratorUrl}/ai/models`, {
        timeout: 5000,
      });
      const models = modelsResponse.data?.models || [];
      const activeModel = models.find((m: { status: string }) => m.status === 'active');

      if (!activeModel) {
        throw new Error('没有可用的活跃AI模型');
      }

      const response = await axios.post<AiTestResponse>(
        `${this.aiOrchestratorUrl}/ai/models/${activeModel.id}/test`,
        { prompt },
        { timeout: 120000 }
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'AI服务返回失败');
      }

      const responseText = response.data.response || '';
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        return JSON.parse(responseText);
      } catch {
        return { response: responseText };
      }
    } catch (error: any) {
      this.logger.error(`调用AI服务失败: ${error.message}`);
      if (retryCount < 1) {
        this.logger.log('尝试重新调用AI服务...');
        return this.callAIService(prompt, retryCount + 1);
      }
      throw error;
    }
  }

  async generateAISkillGuide(
    suggestions: any[],
    templateConfig: any,
    templateType: string,
    documentDescription?: string
  ): Promise<any> {
    return generateAISkillGuide(suggestions, templateConfig, templateType, documentDescription);
  }

  async generateParametersFromDescription(description: string, skill: any): Promise<any> {
    return generateParametersFromDescription(description, skill, (prompt) => this.callAIService(prompt));
  }

  /**
   * 规范化模版配置
   */
  normalizeTemplateConfig(config: TemplateConfig): TemplateConfig {
    return normalizeTemplateConfig(config);
  }

  generateVariableSuggestions(elements: DocumentElement[], config: TemplateConfig): VariableMapping[] {
    return generateVariableSuggestions(elements, config);
  }

  private parseAIAnalysisResponse(response: string, elements: DocumentElement[]): TemplateConfig {
    return parseAIAnalysisResponse(response, elements);
  }

  private normalizeColumnMappings(mappings: any[], arrayPath: string = 'd.items'): any[] {
    return normalizeColumnMappings(mappings, arrayPath);
  }

  private generateColumnMappingsFromHeaders(tableElement: DocumentElement, arrayPath: string) {
    return generateColumnMappingsFromHeaders(tableElement, arrayPath);
  }

  /**
   * 使用 AI 分析文档结构 (Legacy/Non-stream)
   */
  private async analyzeWithAI(
    elements: any[],
    context?: string,
    manualMarkings?: Record<string, string>,
    markingSummary?: string
  ): Promise<TemplateConfig | null> {
    try {
      const modelsResponse = await axios.get<AiModelsResponse>(`${this.aiOrchestratorUrl}/ai/models`, {
        timeout: 5000,
      });
      const models = modelsResponse.data.models || [];
      const activeModel = models.find((m: { status: string }) => m.status === 'active');
      if (!activeModel) return null;

      const prompt = buildAIAnalysisPrompt(elements, context, manualMarkings, markingSummary);
      const testResponse = await axios.post<AiTestResponse>(
        `${this.aiOrchestratorUrl}/ai/models/${activeModel.id}/test`,
        { prompt },
        { timeout: 180000 }
      );

      if (!testResponse.data.success) return null;
      return parseAIAnalysisResponse(testResponse.data.response || '', elements);
    } catch (error) {
      this.logger.error(`AI analysis error: ${error}`);
      return null;
    }
  }

  /**
   * 使用 SSE 流式调用 AI 模型
   */
  async analyzeWithAIStream(
    elements: any[],
    context?: string,
    manualMarkings?: Record<string, string>,
    markingSummary?: string,
    onProgress?: (chunk: string) => void
  ): Promise<TemplateConfig | null> {
    try {
      const modelsResponse = await axios.get<AiModelsResponse>(`${this.aiOrchestratorUrl}/ai/models`, {
        timeout: 5000,
      });
      const models = modelsResponse.data?.models || [];
      const activeModel = models.find((m: { status: string }) => m.status === 'active');
      if (!activeModel) return null;

      const prompt = buildAIAnalysisPrompt(elements, context, manualMarkings, markingSummary);
      const response = await fetch(`${this.aiOrchestratorUrl}/ai/models/${activeModel.id}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) return null;
      const reader = response.body?.getReader();
      if (!reader) return null;

      const decoder = new TextDecoder();
      let fullResponse = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.chunk) {
                fullResponse += data.chunk;
                if (onProgress) onProgress(data.chunk);
              }
            } catch {}
          }
        }
      }
      return parseAIAnalysisResponse(fullResponse, elements);
    } catch (error) {
      this.logger.error(`AI stream analysis error: ${error}`);
      return null;
    }
  }

  /**
   * 验证模板配置
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
      let parsedTestData: any = {};
      if (testData) {
        try {
          parsedTestData = JSON.parse(testData);
        } catch {
          this.logger.warn('测试数据JSON解析失败，使用空对象');
        }
      }
      const config = templateConfig || {};
      const aiResponse = await this.callAIForVerify(prompt, config, parsedTestData);
      return { report: aiResponse.report, success: true };
    } catch (error: any) {
      this.logger.error(`AI验证失败: ${error.message}`);
      return { report: `验证失败: ${error.message}`, success: false };
    }
  }

  private async callAIForVerify(prompt: string, templateConfig: any, testData: any): Promise<{ report: string }> {
    const aiUrl = getAiOrchestratorUrl();
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
    const userPrompt = `验证需求: ${prompt}\n\n模版配置:\n${JSON.stringify(templateConfig, null, 2)}\n\n测试数据:\n${JSON.stringify(testData, null, 2)}`;
    try {
      const modelsResponse = await axios.get<AiModelsResponse>(`${aiUrl}/ai/models`);
      const models = modelsResponse.data?.models || [];
      const activeModel = models.find((m: { status: string }) => m.status === 'active');
      if (!activeModel) return { report: '无法验证：没有可用的AI模型' };

      const testResponse = await axios.post<AiTestResponse>(
        `${aiUrl}/ai/models/${activeModel.id}/test`,
        { prompt: `${systemPrompt}\n\n${userPrompt}` },
        { timeout: 60000 }
      );
      if (!testResponse.data.success) return { report: `验证失败: ${testResponse.data.error}` };
      return { report: testResponse.data.response || '无法生成验证报告' };
    } catch (error: any) {
      return { report: `AI服务调用失败: ${error.message}` };
    }
  }
}
