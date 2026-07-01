/**
 * Carbone Engine - AI Identifier Service
 * AI自动标识服务，基于多阶段AI分析生成模版配置
 */

import { Injectable, Logger } from '@nestjs/common';
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
  PathMappingRule,
} from './utils/types';
export {
  ProcessingStage,
  ProcessingProgress,
  DocumentUnderstanding,
  SectionParameterization,
  TemplateConfig,
  AIIdentifyResponse,
  VariableMapping,
  PathMappingRule,
};

import { parseDocxStructure } from './utils/docx-parser';
import {
  extractBlankPatterns,
  mergeUnderlineInfo,
  extractSectionContent,
} from './utils/blank-extractor';
import { generateVariableSuggestions } from './utils/table-loop-helper';
import {
  formatRawSuggestions,
  buildVariableMappingsFromSuggestions,
} from './utils/skill-parameter.helper';
import { parseUserContext, normalizeTemplateConfig } from './utils/template-config.helper';
import { generateAISkillGuide, generateParametersFromDescription } from './utils/skill.helper';
import {
  analyzeBlankPatternsWithAI,
  buildAIAnalysisPrompt,
  parseAIAnalysisResponse,
} from './utils/ai-prompt.builder';
import { callAiJson, callAiText, streamAiText } from './utils/ai-client';
import {
  buildBasicDocumentUnderstanding,
  buildDocumentUnderstandingPrompt,
  buildFallbackQuickSuggestions,
  buildFallbackSectionSuggestions,
  buildIntegrationPrompt,
  buildQuickIdentifyResponse,
  buildQuickNamingParameterList,
  buildQuickNamingPrompt,
  buildQuickProgressInfo,
  buildSectionParameterizationPrompt,
  formatIntegratedSuggestions,
  mapQuickNamingSuggestions,
  mergeMissingBlankSuggestions,
  normalizeDocumentUnderstandingResponse,
  normalizeSectionAiSuggestions,
  resolveQuickNamingResults,
} from './utils/ai-identifier-stage.helper';

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

    const templateConfig = await this.analyzeWithAI(
      elements,
      context,
      manualMarkings,
      markingSummary
    );
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
        tables: elements.filter((e) => e.type === 'table').length,
        images: elements.filter((e) => e.type === 'image').length,
        stepScreenshots: elements.filter((e) => e.type === 'step-screenshot').length,
        potentialLoops: loops.length + images.length,
      },
      contextAnalysis: {
        detectedTemplateType: templateConfig.templateType,
        userIntent: userIntent.summary,
      },
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
    this.logger.log(
      `Direct AI identify from content, type: ${templateType}, content length: ${documentContent.length}`
    );

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
      analysisNotes: [],
    };

    const documentStats = {
      totalElements: blankPatterns.length,
      tables: 0,
      images: 0,
      stepScreenshots: 0,
      potentialLoops: 0,
    };

    const variableMappings: VariableMapping[] = suggestions.map((s, idx) => ({
      path: s.suggestedName,
      sampleValue: s.originalText,
      index: idx,
      type: 'text' as const,
      reason: s.details?.significance || '',
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
        aiServiceUrl: this.aiOrchestratorUrl,
      },
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
      return await this.quickNameParameters(
        underlineInfo,
        documentContent,
        templateType,
        progressCallback
      );
    }

    const reportProgress = (
      stage: ProcessingStage,
      stageName: string,
      progress: number,
      message: string,
      currentSection?: string
    ) => {
      const progressInfo: ProcessingProgress = {
        stage,
        stageName,
        progress,
        message,
        currentSection,
      };
      this.logger.log(`进度报告: [${stageName}] ${progress}% - ${message}`);
      if (progressCallback) {
        progressCallback(progressInfo);
      }
    };

    try {
      reportProgress(
        ProcessingStage.DOCUMENT_UNDERSTANDING,
        '文档理解',
        0,
        '正在分析文档整体结构和内容...'
      );
      const documentUnderstanding = await this.analyzeDocumentUnderstanding(
        documentContent,
        templateType,
        context
      );
      reportProgress(
        ProcessingStage.DOCUMENT_UNDERSTANDING,
        '文档理解',
        100,
        `文档理解完成，识别到 ${documentUnderstanding.sections.length} 个章节，${documentUnderstanding.parties.length} 个当事人`
      );

      reportProgress(
        ProcessingStage.SECTION_ANALYSIS,
        '预处理',
        0,
        '正在预提取文档中的空白位置...'
      );
      const preExtractedBlanks = extractBlankPatterns(documentContent, templateType);
      this.logger.log(`预处理提取到 ${preExtractedBlanks.length} 个空白位置`);

      let blanksToUse = preExtractedBlanks;
      if (underlineInfo && underlineInfo.length > 0) {
        blanksToUse = mergeUnderlineInfo([], underlineInfo, documentContent, templateType);
        this.logger.log(`使用下划线信息作为参数来源，共 ${blanksToUse.length} 个参数位置`);
        reportProgress(
          ProcessingStage.SECTION_ANALYSIS,
          '预处理',
          10,
          `使用 Word 下划线检测结果，发现 ${blanksToUse.length} 个参数位置`
        );
      } else {
        reportProgress(
          ProcessingStage.SECTION_ANALYSIS,
          '预处理',
          10,
          `预提取完成，发现 ${preExtractedBlanks.length} 个潜在空白位置`
        );
      }

      reportProgress(
        ProcessingStage.SECTION_ANALYSIS,
        '分段参数化',
        0,
        '开始对各章节进行语义分析...'
      );
      const allSectionResults: SectionParameterization[] = [];
      const sectionsToProcess = documentUnderstanding.sections.filter(
        (s) => s.needsParameterization
      );

      for (let i = 0; i < sectionsToProcess.length; i++) {
        const section = sectionsToProcess[i];
        const sectionProgress = Math.round((i / sectionsToProcess.length) * 80);

        reportProgress(
          ProcessingStage.SECTION_ANALYSIS,
          '分段参数化',
          sectionProgress,
          `正在分析章节: ${section.name}`,
          section.name
        );

        const sectionContent = extractSectionContent(documentContent, section.name);
        const sectionBlanks = blanksToUse.filter(
          (b: any) =>
            b.chapter === section.name ||
            b.chapter.includes(section.name) ||
            section.name.includes(b.chapter)
        );

        const sectionResult = await this.parameterizeSection(
          section.name,
          sectionContent,
          documentUnderstanding,
          templateType,
          sectionBlanks
        );

        allSectionResults.push(sectionResult);
        reportProgress(
          ProcessingStage.SECTION_ANALYSIS,
          '分段参数化',
          sectionProgress + Math.round(80 / sectionsToProcess.length),
          `章节 ${section.name} 分析完成，识别到 ${sectionResult.suggestions.length} 个参数`
        );
      }

      reportProgress(
        ProcessingStage.SECTION_ANALYSIS,
        '分段参数化',
        100,
        `分段参数化完成，共识别到 ${allSectionResults.reduce((sum, s) => sum + s.suggestions.length, 0)} 个潜在参数`
      );

      reportProgress(ProcessingStage.INTEGRATION, '整合确认', 0, '正在整合和确认所有识别结果...');
      const finalSuggestions = await this.integrateAndConfirm(
        allSectionResults,
        documentUnderstanding,
        documentContent,
        templateType
      );
      reportProgress(
        ProcessingStage.INTEGRATION,
        '整合确认',
        100,
        `整合确认完成，最终确认 ${finalSuggestions.length} 个有效参数`
      );

      reportProgress(ProcessingStage.COMPLETE, '完成', 100, 'AI识别处理完成');

      const templateConfig: TemplateConfig = {
        templateType: documentUnderstanding.documentType,
        staticElements: [],
        tableLoops: [],
        imageLoops: [],
        combinedVariables: [],
        variableMappings: [],
        analysisNotes: [
          `文档类型: ${documentUnderstanding.documentType}`,
          `主要用途: ${documentUnderstanding.mainPurpose}`,
        ],
      };

      const variableMappings = buildVariableMappingsFromSuggestions(finalSuggestions);
      const documentStats = {
        totalElements: finalSuggestions.length,
        tables: 0,
        images: 0,
        stepScreenshots: 0,
        potentialLoops: 0,
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
          flowType: 'multi-stage',
        },
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
    const prompt = buildDocumentUnderstandingPrompt(documentContent, templateType, context);

    try {
      const aiResponse = await this.callAIService(prompt);
      const understanding = normalizeDocumentUnderstandingResponse(aiResponse, templateType);
      if (understanding) {
        this.logger.log(
          `文档理解成功: 类型=${aiResponse.documentType}, 章节数=${aiResponse.sections?.length || 0}`
        );
        return understanding;
      }
      this.logger.warn('AI文档理解返回格式异常，使用基础理解');
      return buildBasicDocumentUnderstanding(documentContent, templateType);
    } catch (error: any) {
      this.logger.error('文档理解AI调用失败:', error);
      return buildBasicDocumentUnderstanding(documentContent, templateType);
    }
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
    this.logger.log(
      `阶段2: 参数化章节 "${sectionName}", 预处理空白 ${preExtractedBlanks.length} 个`
    );
    const prompt = buildSectionParameterizationPrompt(
      sectionName,
      sectionContent,
      documentUnderstanding,
      preExtractedBlanks
    );

    try {
      const aiResponse = await this.callAIService(prompt);
      const aiSuggestions = normalizeSectionAiSuggestions(aiResponse, sectionContent);
      if (aiSuggestions) {
        this.logger.log(
          `章节 "${sectionName}" AI参数化成功，识别到 ${aiResponse.suggestions.length} 个参数`
        );
        const mergedSuggestions = mergeMissingBlankSuggestions(
          aiSuggestions,
          preExtractedBlanks,
          templateType
        );
        const missingCount = mergedSuggestions.length - aiSuggestions.length;
        if (missingCount > 0) {
          this.logger.log(`补充 ${missingCount} 个预处理空白（AI未覆盖）`);
        }
        return { sectionName, suggestions: mergedSuggestions };
      }

      return {
        sectionName,
        suggestions: buildFallbackSectionSuggestions(preExtractedBlanks, templateType),
      };
    } catch (error: any) {
      this.logger.error(`章节 "${sectionName}" 参数化失败:`, error);
      return {
        sectionName,
        suggestions: buildFallbackSectionSuggestions(preExtractedBlanks, templateType),
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
    const allSuggestions = sectionResults.flatMap((sr) => sr.suggestions);

    if (allSuggestions.length === 0) {
      this.logger.warn('没有识别到任何参数');
      return [];
    }
    const prompt = buildIntegrationPrompt(documentUnderstanding, allSuggestions, fullContent);

    try {
      const aiResponse = await this.callAIService(prompt);
      const formattedSuggestions = formatIntegratedSuggestions(aiResponse);
      if (formattedSuggestions) {
        this.logger.log(`整合确认完成，最终确认 ${aiResponse.confirmedSuggestions.length} 个参数`);
        return formattedSuggestions;
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

    const reportProgress = (
      stage: ProcessingStage,
      stageName: string,
      progress: number,
      message: string
    ) => {
      this.logger.log(`进度: [${stageName}] ${progress}% - ${message}`);
      if (progressCallback) {
        progressCallback(buildQuickProgressInfo(stage, stageName, progress, message));
      }
    };

    reportProgress(ProcessingStage.SECTION_ANALYSIS, '快速识别', 0, '正在分析参数语义...');
    const parameterList = buildQuickNamingParameterList(underlineInfo);
    const prompt = buildQuickNamingPrompt(parameterList, templateType);

    try {
      reportProgress(ProcessingStage.SECTION_ANALYSIS, '快速识别', 50, '正在调用AI进行语义命名...');
      const aiResponseObj = await this.callAIService(prompt);

      reportProgress(ProcessingStage.SECTION_ANALYSIS, '快速识别', 90, '正在处理AI响应...');
      const namingResults = resolveQuickNamingResults(aiResponseObj, underlineInfo.length);
      const suggestions = mapQuickNamingSuggestions(namingResults, underlineInfo, parameterList);

      reportProgress(
        ProcessingStage.COMPLETE,
        '完成',
        100,
        `快速识别完成，共 ${suggestions.length} 个参数`
      );
      return buildQuickIdentifyResponse({
        templateType,
        suggestionRecords: suggestions,
        aiOrchestratorUrl: this.aiOrchestratorUrl,
        usedAI: true,
        analysisNotes: [`快速识别模式，基于 ${underlineInfo.length} 个下划线位置`],
        userIntent: '基于下划线位置的参数识别',
        flowType: 'quick',
      });
    } catch (error) {
      this.logger.error('快速命名流程失败:', error);
      reportProgress(ProcessingStage.COMPLETE, '完成', 100, '使用默认命名');
      return buildQuickIdentifyResponse({
        templateType,
        suggestionRecords: buildFallbackQuickSuggestions(underlineInfo),
        aiOrchestratorUrl: this.aiOrchestratorUrl,
        usedAI: false,
        analysisNotes: ['后备命名模式'],
        userIntent: '后备命名',
      });
    }
  }

  /**
   * 调用 AI 服务 (底层的 HTTP POST 请求)
   */
  private async callAIService(prompt: string): Promise<any> {
    try {
      return await callAiJson(this.aiOrchestratorUrl, prompt);
    } catch (error: any) {
      this.logger.error(`调用AI服务失败: ${error.message}`);
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
    return generateParametersFromDescription(description, skill, (prompt) =>
      this.callAIService(prompt)
    );
  }

  /**
   * 规范化模版配置
   */
  normalizeTemplateConfig(config: TemplateConfig): TemplateConfig {
    return normalizeTemplateConfig(config);
  }

  generateVariableSuggestions(
    elements: DocumentElement[],
    config: TemplateConfig
  ): VariableMapping[] {
    return generateVariableSuggestions(elements, config);
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
      const prompt = buildAIAnalysisPrompt(elements, context, manualMarkings, markingSummary);
      const responseText = await callAiText(this.aiOrchestratorUrl, prompt, 180000);
      if (!responseText) return null;
      return parseAIAnalysisResponse(responseText, elements);
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
      const prompt = buildAIAnalysisPrompt(elements, context, manualMarkings, markingSummary);
      const fullResponse = await streamAiText(this.aiOrchestratorUrl, prompt, onProgress);
      if (!fullResponse) return null;
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

  private async callAIForVerify(
    prompt: string,
    templateConfig: any,
    testData: any
  ): Promise<{ report: string }> {
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
      const report = await callAiText(
        this.aiOrchestratorUrl,
        `${systemPrompt}\n\n${userPrompt}`,
        60000
      );
      if (!report) return { report: '无法验证：没有可用的AI模型' };
      return { report };
    } catch (error: any) {
      return { report: `AI服务调用失败: ${error.message}` };
    }
  }
}
