import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import JSZip from 'jszip';
import { getAiOrchestratorUrl } from '../../config/service-endpoints';
import { buildWorkflowUnderstandingPromptText } from './template-workflow.prompt';
import {
  safeText,
  escapeRegExp,
  numberOrUndefined,
  hasBlankPlaceholder,
  getElementHostData,
  getElementFormat,
  isLikelyDocumentTitle,
  isLikelySectionHeading,
  isLikelyTableLabel,
  isLikelyTableHeaderRow,
  isBlankTableTemplateCell,
  findNearestLeftTableLabel,
  findNearestRightTableLabel,
  splitTableCellLines,
  extractCompareLabels as parserExtractCompareLabels,
  extractWordTableCellText,
  isStandardLoopTable,
  classifyTemplateTableStructure,
  extractTableCellCompareAnchors,
  extractTableCellSampleValueByAnchor,
  extractPlaceholderMatcher,
  extractPlaceholderSampleValue,
  buildSampleTableMatrices,
  extractTableMatricesFromWordXml,
  extractSampleTableMatrices,
} from './utils/document-xml-parser';
import {
  DEFAULT_RENDER_PLAN_VERSION,
  TEMPLATE_ASSET_MANIFEST_VERSION,
  TEMPLATE_ASSET_SOURCE_OFFICE_ADDIN,
  TEMPLATE_DOCUMENT_MODE_BILINGUAL,
  TEMPLATE_DOCUMENT_MODE_SINGLE_LANGUAGE,
  TemplateAssetManifest,
  RenderPlan,
} from './studio.types';
import {
  Primitive,
  WorkflowDocumentIR,
  WorkflowDocumentElement,
  WorkflowAnchor,
  WorkflowLanguageProfile,
  WorkflowAssetScope,
  WorkflowAssetStatus,
  WorkflowSourceBinding,
  WorkflowTemplateFieldSpec,
  WorkflowFieldDictionaryEntry,
  WorkflowTermEntry,
  WorkflowEnumItem,
  WorkflowTermAssets,
  WorkflowResolvedAssets,
  WorkflowBindingPlanBinding,
  WorkflowBindingPlan,
  WorkflowAnalyzeFieldResult,
  WorkflowAnalyzeResult,
  WorkflowCandidateLocation,
  WorkflowCandidateLanguageRelation,
  WorkflowFieldCandidate,
  WorkflowCompareResult,
  WorkflowRecognizeBlockResult,
  WorkflowRecognizeContextAnalysis,
  WorkflowRecognizeResult,
  WorkflowRecognitionBlockInput,
  WorkflowCompareSectionContext,
  WorkflowCompareCandidateBuildResult,
  WorkflowRecognitionAiSuggestion,
  WorkflowUnderstandResult,
  WorkflowSaveMeta,
  WorkflowSaveResult,
  WorkflowRenderResult,
  WorkflowRenderTranslationCandidate,
  GLOBAL_FIELD_DICTIONARY,
  GLOBAL_TERMBASE,
  TENANT_TERMBASE,
  GLOBAL_ENUM_MAPPINGS,
  resolveDocumentMode,
} from './utils/workflow-assets';
export {
  Primitive,
  WorkflowDocumentIR,
  WorkflowDocumentElement,
  WorkflowAnchor,
  WorkflowLanguageProfile,
  WorkflowAssetScope,
  WorkflowAssetStatus,
  WorkflowSourceBinding,
  WorkflowTemplateFieldSpec,
  WorkflowFieldDictionaryEntry,
  WorkflowTermEntry,
  WorkflowEnumItem,
  WorkflowTermAssets,
  WorkflowResolvedAssets,
  WorkflowBindingPlanBinding,
  WorkflowBindingPlan,
  WorkflowAnalyzeFieldResult,
  WorkflowAnalyzeResult,
  WorkflowCandidateLocation,
  WorkflowCandidateLanguageRelation,
  WorkflowFieldCandidate,
  WorkflowCompareResult,
  WorkflowRecognizeBlockResult,
  WorkflowRecognizeContextAnalysis,
  WorkflowRecognizeResult,
  WorkflowRecognitionBlockInput,
  WorkflowCompareSectionContext,
  WorkflowCompareCandidateBuildResult,
  WorkflowRecognitionAiSuggestion,
  WorkflowUnderstandResult,
  WorkflowSaveMeta,
  WorkflowSaveResult,
  WorkflowRenderResult,
  WorkflowRenderTranslationCandidate,
  GLOBAL_FIELD_DICTIONARY,
  GLOBAL_TERMBASE,
  TENANT_TERMBASE,
  GLOBAL_ENUM_MAPPINGS,
  resolveDocumentMode,
};
import {
  splitSampleTextIntoChunks,
  buildFallbackSectionHints,
  splitTemplateTextIntoCompareSegments,
  buildTextCompareInputs,
  findBestSectionSampleChunk,
  findDirectCompareMatch,
  extractCompareLabels,
  findAdjacentBilingualPeerText,
  extractLooseCandidateContext,
  scoreLooseTextMatch,
  computeLooseBigramOverlap,
  shouldIncludeSectionCompareProbe,
  isCompactCompareBlock,
  isLikelyNarrativeCompareText,
  shouldKeepCompareCandidateUnnamed,
  inferSectionInfo,
} from './utils/workflow-similarity';
import {
  resolveTabularRowWidth,
  shouldMergeBilingualTabularRows,
  mergeTabularCellText,
  resolveListColumnKeys,
  normalizeTableListRows,
  normalizeTableListRow,
  resolveTableRowLanguages,
  extractTableFieldBaseKey,
  resolveTableCellAliasMap,
  extractTableLanguageSuffix,
  orderTableLanguagesForCell,
  mergeTableLanguageValues,
  isLanguageNeutralTableValue,
} from './utils/workflow-table-normalizer';
import {
  parseAmount,
  parseDate,
  formatCurrency,
  formatDate,
  extractAnchorPrefix,
  inferRecognitionBlockTitle,
  hasCompareFieldShape,
  detectTextLanguageHint,
  isConcreteLanguageHint,
  normalizeLookupText,
} from './utils/workflow-parser-format';
import {
  extractSampleText,
  extractSampleTextRich,
  extractReadableTextFromWordXml,
  normalizePlainText,
} from './utils/workflow-xml-text';
import {
  buildWorkflowUnderstandingPrompt,
  buildFallbackWorkflowUnderstandingSummaryText,
  buildWorkflowTemplateExcerpt,
  parseWorkflowUnderstandingAiResponse,
  normalizeWorkflowUnderstandingText,
  tryParseJsonObject,
  normalizeStringArray,
  generateUnderstandingSummaryWithAI,
  buildUnderstandingSectionSummaries,
} from './utils/workflow-ai';
import {
  discoverFields,
  buildRecognitionBlocks,
  buildRecognizedFieldFromSuggestion,
  mergeRecognizedField,
  buildFallbackRecognitionBlockResult,
  buildWorkflowRecognitionPrompt,
  parseWorkflowRecognitionAiResponse as parseWorkflowRecognitionAiResponseUtil,
  normalizeWorkflowRecognitionSuggestions,
  shouldAcceptWorkflowSuggestion,
  normalizeWorkflowFieldId,
  resolveTemplateFieldLanguage,
  mapTemplateLanguageSuffix,
  inferPolicyFromType,
  normalizeWorkflowPolicy,
  inferRiskLevelFromType,
  normalizeConfidence,
  isCandidateMatchedToBlock,
  extractBlockSampleExcerpt,
  computeCandidateGroupCompareScore,
  computeCandidateGroupCompareMode,
  computeCandidateGroupCompareStatus,
  matchFieldDictionary,
  findEnumMatch,
  findTermMatch,
  isAssetActive,
  scopePriority,
  resolveAssets,
  buildAnalyzeFieldResult,
  buildRecognitionBlockResults,
} from './utils/workflow-discover';
import { buildCompareCandidates, buildCompareSummary } from './utils/workflow-compare';
import { buildSimpleWorkflowLanguageProfile } from './utils/workflow-language-profile';
import {
  resolveFieldValue,
  buildRenderTranslationCandidate,
  applyBatchRenderTranslations,
  applyLocalizedLanguageAliases,
  listBindingVariablePaths,
  readSelector,
  extractFieldValue,
  compileBindingPlan,
} from './utils/workflow-render-helper';

@Injectable()
export class TemplateWorkflowService {
  private readonly logger = new Logger(TemplateWorkflowService.name);

  private resolveDocumentMode(targetLanguages?: string[], explicitDocumentMode?: string): string {
    if (typeof explicitDocumentMode === 'string' && explicitDocumentMode.trim()) {
      return explicitDocumentMode;
    }
    return Array.isArray(targetLanguages) && targetLanguages.length > 0
      ? TEMPLATE_DOCUMENT_MODE_BILINGUAL
      : TEMPLATE_DOCUMENT_MODE_SINGLE_LANGUAGE;
  }

  async understandTemplate(
    templateDocumentIr: WorkflowDocumentIR,
    sampleDocument: { fileName?: string; contentBase64?: string } | undefined,
    sourceLanguage = 'zh',
    targetLanguages: string[] = [],
    termAssets?: WorkflowTermAssets,
    candidateFields?: WorkflowFieldCandidate[]
  ): Promise<WorkflowUnderstandResult> {
    const assets = this.resolveAssets(termAssets);
    const analyzeResult = this.analyzeTemplate(
      templateDocumentIr,
      sampleDocument,
      sourceLanguage,
      targetLanguages,
      termAssets
    );
    const effectiveSourceLanguage = analyzeResult.languageProfile.sourceLanguage;
    const effectiveTargetLanguages = analyzeResult.languageProfile.targetLanguages;
    const compareCandidateBuildResult =
      candidateFields && candidateFields.length > 0
        ? undefined
        : await this.buildCompareCandidates(
            templateDocumentIr,
            analyzeResult.fields,
            sampleDocument,
            effectiveSourceLanguage,
            assets
          );
    const compareCandidates =
      candidateFields && candidateFields.length > 0
        ? candidateFields
        : compareCandidateBuildResult?.candidates || [];
    const elements = Array.isArray(templateDocumentIr.elements) ? templateDocumentIr.elements : [];
    const paragraphElements = elements.filter((element) => element.type === 'paragraph');
    const tableElements = elements.filter((element) => element.type === 'table');
    const sectionHints = buildFallbackSectionHints(elements);
    const fallbackTerminologyCandidates = Array.from(
      new Set(
        compareCandidates
          .flatMap((candidate) => [
            this.safeText(candidate.sampleValue),
            this.safeText(candidate.anchorText),
            this.safeText(candidate.sectionTitle),
          ])
          .filter((text) => Boolean(text) && text.length <= 40)
      )
    ).slice(0, 8);
    const fallbackLayoutFeatures = [
      paragraphElements.length > 0 ? `paragraphs:${paragraphElements.length}` : '',
      tableElements.length > 0 ? `tables:${tableElements.length}` : '',
      effectiveTargetLanguages.length > 0
        ? `targets:${effectiveTargetLanguages.join(',')}`
        : 'single_language',
      sampleDocument?.contentBase64 ? 'sample_attached' : 'template_only',
    ].filter(Boolean);
    const sampleText = await this.extractSampleTextRich(
      sampleDocument?.contentBase64,
      analyzeResult.warnings
    );
    const understandingContext = await this.generateUnderstandingSummaryWithAI({
      templateDocumentIr,
      sampleDocument,
      sampleText,
      sourceLanguage: effectiveSourceLanguage,
      targetLanguages: effectiveTargetLanguages,
      fallbackSectionHints: sectionHints,
      fallbackTerminologyCandidates,
      fallbackLayoutFeatures,
      fieldCandidateIds: compareCandidates.map(
        (candidate) => candidate.fieldIdHint || candidate.candidateId
      ),
      candidateFields: compareCandidates,
    });

    return {
      analysisId: analyzeResult.analysisId,
      languageProfile: analyzeResult.languageProfile,
      summary: {
        documentTitle:
          this.safeText(understandingContext.summary.documentTitle) ||
          this.safeText(templateDocumentIr.metadata?.title) ||
          undefined,
        understandingSummaryText:
          this.safeText(understandingContext.summary.understandingSummaryText) ||
          this.buildFallbackWorkflowUnderstandingSummaryText({
            documentTitle:
              this.safeText(understandingContext.summary.documentTitle) ||
              this.safeText(templateDocumentIr.metadata?.title) ||
              this.safeText(sampleDocument?.fileName),
            sourceLanguage: effectiveSourceLanguage,
            targetLanguages: effectiveTargetLanguages,
            paragraphCount: paragraphElements.length,
            tableCount: tableElements.length,
            sectionHints: understandingContext.summary.sectionHints,
            terminologyCandidates: understandingContext.summary.terminologyCandidates,
            layoutFeatures: understandingContext.summary.layoutFeatures,
            fieldCandidateIds: analyzeResult.fields.map((field) => field.fieldId),
            sampleFileName: sampleDocument?.fileName,
          }),
        sampleFileName: sampleDocument?.fileName,
        paragraphCount: paragraphElements.length,
        tableCount: tableElements.length,
        sectionHints: understandingContext.summary.sectionHints,
        sectionSummaries: understandingContext.summary.sectionSummaries,
        terminologyCandidates: understandingContext.summary.terminologyCandidates,
        fieldCandidateIds: compareCandidates.map(
          (candidate) => candidate.fieldIdHint || candidate.candidateId
        ),
        layoutFeatures: understandingContext.summary.layoutFeatures,
      },
      warnings: Array.from(
        new Set([
          ...analyzeResult.warnings,
          ...(compareCandidateBuildResult?.warnings || []),
          ...understandingContext.summary.warnings,
        ])
      ),
      contextAnalysis: {
        usedAI: understandingContext.usedAI,
        aiServiceUrl: understandingContext.aiServiceUrl,
        promptRequestText: understandingContext.promptRequestText,
        rawAiResponse: understandingContext.rawAiResponse,
      },
    };
  }

  async compareTemplate(
    templateDocumentIr: WorkflowDocumentIR,
    sampleDocument: { fileName?: string; contentBase64?: string } | undefined,
    sourceLanguage = 'zh',
    targetLanguages: string[] = [],
    termAssets?: WorkflowTermAssets,
    workflowId?: string
  ): Promise<WorkflowCompareResult> {
    const assets = this.resolveAssets(termAssets);
    const analyzeResult = this.analyzeTemplate(
      templateDocumentIr,
      sampleDocument,
      sourceLanguage,
      targetLanguages,
      termAssets
    );
    const effectiveSourceLanguage = analyzeResult.languageProfile.sourceLanguage;
    const compareCandidateBuildResult = await this.buildCompareCandidates(
      templateDocumentIr,
      analyzeResult.fields,
      sampleDocument,
      effectiveSourceLanguage,
      assets
    );
    const compareSummary = this.buildCompareSummary(
      compareCandidateBuildResult.candidates,
      Array.from(new Set([...analyzeResult.warnings, ...compareCandidateBuildResult.warnings])),
      compareCandidateBuildResult.sectionContexts
    );

    return {
      workflowId: workflowId || `wf_${Date.now()}`,
      compareId: `cmp_${Date.now()}`,
      candidateFields: compareCandidateBuildResult.candidates,
      compareSummary,
      cacheStatus: {
        compareHit: false,
      },
    };
  }

  analyzeTemplate(
    templateDocumentIr: WorkflowDocumentIR,
    sampleDocument: { fileName?: string; contentBase64?: string } | undefined,
    sourceLanguage = 'zh',
    targetLanguages: string[] = [],
    termAssets?: WorkflowTermAssets
  ): WorkflowAnalyzeResult {
    const warnings: string[] = [];
    const languageProfile = this.buildLanguageProfile(
      templateDocumentIr,
      sourceLanguage,
      targetLanguages
    );
    const normalizedSampleText = this.extractSampleText(sampleDocument?.contentBase64, warnings);
    const fields = this.discoverFields(
      templateDocumentIr,
      languageProfile,
      normalizedSampleText,
      this.resolveAssets(termAssets)
    );

    return {
      analysisId: `ana_${Date.now()}`,
      languageProfile,
      fields,
      warnings,
    };
  }

  async recognizeTemplate(
    templateDocumentIr: WorkflowDocumentIR,
    sampleDocument: { fileName?: string; contentBase64?: string } | undefined,
    sourceLanguage = 'zh',
    targetLanguages: string[] = [],
    termAssets?: WorkflowTermAssets,
    candidateFields?: WorkflowFieldCandidate[],
    prefetchedUnderstanding?: WorkflowUnderstandResult,
    skill?: any
  ): Promise<WorkflowRecognizeResult> {
    const assets = this.resolveAssets(termAssets);
    const analyzeResult = this.analyzeTemplate(
      templateDocumentIr,
      sampleDocument,
      sourceLanguage,
      targetLanguages,
      termAssets
    );
    const effectiveSourceLanguage = analyzeResult.languageProfile.sourceLanguage;
    const effectiveTargetLanguages = analyzeResult.languageProfile.targetLanguages;
    const compareCandidateBuildResult =
      candidateFields && candidateFields.length > 0
        ? undefined
        : await this.buildCompareCandidates(
            templateDocumentIr,
            analyzeResult.fields,
            sampleDocument,
            effectiveSourceLanguage,
            assets
          );
    const compareCandidates =
      candidateFields && candidateFields.length > 0
        ? candidateFields
        : compareCandidateBuildResult?.candidates || [];
    const shouldAttemptAI = Boolean(sampleDocument?.contentBase64) && compareCandidates.length > 0;
    const reusedUnderstanding =
      prefetchedUnderstanding &&
      prefetchedUnderstanding.languageProfile?.sourceLanguage === effectiveSourceLanguage &&
      JSON.stringify(prefetchedUnderstanding.languageProfile?.targetLanguages || []) ===
        JSON.stringify(effectiveTargetLanguages)
        ? prefetchedUnderstanding
        : undefined;
    const understandingResult =
      reusedUnderstanding ||
      (shouldAttemptAI
        ? await this.understandTemplate(
            templateDocumentIr,
            sampleDocument,
            effectiveSourceLanguage,
            effectiveTargetLanguages,
            termAssets,
            compareCandidates
          )
        : undefined);
    const sampleText = shouldAttemptAI
      ? await this.extractSampleTextRich(sampleDocument?.contentBase64, [])
      : '';
    const blockInputs = this.buildRecognitionBlocks(
      templateDocumentIr,
      compareCandidates,
      analyzeResult.fields,
      sampleText
    );
    const mergedFields = new Map<string, WorkflowAnalyzeFieldResult>();
    const blockResults: WorkflowRecognizeBlockResult[] = [];
    let usedAI = false;
    let requestCount = 0;
    let lastPromptRequestText = '';
    let lastRawAiResponse = '';
    let lastRequestSummary = '';
    let lastResponseSummary = '';
    let aiSuccessBlockCount = 0;
    const fallbackBlockIds: string[] = [];

    for (const block of blockInputs) {
      const fallbackResult = this.buildFallbackRecognitionBlockResult(block);

      if (!shouldAttemptAI || block.candidates.length === 0) {
        if (fallbackResult.resultStatus === 'fallback_success') {
          fallbackBlockIds.push(block.blockId);
        }
        blockResults.push(fallbackResult);
        for (const field of block.fallbackFields) {
          this.mergeRecognizedField(mergedFields, field);
        }
        continue;
      }

      const promptRequestText = this.buildWorkflowRecognitionPrompt({
        block,
        understandingSummary:
          understandingResult?.summary.understandingSummaryText ||
          understandingResult?.summary.documentTitle ||
          '暂无整体理解摘要',
        sectionSummary: block.sectionTitle,
        sourceLanguage,
        targetLanguages,
        assets,
        skill,
      });
      requestCount += 1;
      lastPromptRequestText = promptRequestText;
      lastRequestSummary = `当前块 ${block.blockId} (${block.sectionTitle || block.title})，候选数 ${block.candidates.length}`;

      try {
        const startedAt = Date.now();
        const rawAiResponse = await this.callWorkflowRecognitionAI(promptRequestText);
        const durationMs = Date.now() - startedAt;
        lastRawAiResponse = rawAiResponse;
        const parsed = this.parseWorkflowRecognitionAiResponse(rawAiResponse);
        const suggestions = this.normalizeWorkflowRecognitionSuggestions(
          parsed?.suggestions || parsed?.fields
        );
        const aiFields = suggestions
          .filter((suggestion) => this.shouldAcceptWorkflowSuggestion(suggestion))
          .map((suggestion) =>
            this.buildRecognizedFieldFromSuggestion(
              suggestion,
              block,
              sourceLanguage,
              targetLanguages,
              assets
            )
          )
          .filter(Boolean) as WorkflowAnalyzeFieldResult[];

        if (aiFields.length === 0) {
          const fallbackBlock = {
            ...fallbackResult,
            durationMs,
            contextAnalysis: {
              ...fallbackResult.contextAnalysis,
              requestSummary: lastRequestSummary,
              responseSummary: 'AI 返回未形成可用字段，已回退到规则结果',
              errorMessage: 'AI 返回为空或无可接受字段',
            },
          };
          fallbackBlockIds.push(block.blockId);
          blockResults.push(fallbackBlock);
          for (const field of block.fallbackFields) {
            this.mergeRecognizedField(mergedFields, field);
          }
          lastResponseSummary = fallbackBlock.contextAnalysis?.responseSummary || '';
          continue;
        }

        usedAI = true;
        aiSuccessBlockCount += 1;
        for (const field of aiFields) {
          this.mergeRecognizedField(mergedFields, field);
        }
        const warnings = this.normalizeStringArray(parsed?.warnings, 6) || [];
        const responseSummary =
          this.safeText(parsed?.summary) || `AI 返回 ${aiFields.length} 个字段建议`;
        lastResponseSummary = responseSummary;
        blockResults.push({
          blockId: block.blockId,
          blockType: block.blockType,
          title: block.title,
          sectionTitle: block.sectionTitle,
          sourceExcerpt: block.templateText.slice(0, 120),
          suggestionCount: aiFields.length,
          fieldIds: aiFields.map((field) => field.fieldId),
          aiCallSucceeded: true,
          resultStatus:
            block.fallbackFields.length > aiFields.length ? 'partial_success' : 'succeeded',
          warnings,
          retryCount: 0,
          durationMs,
          contextAnalysis: {
            requestSummary: lastRequestSummary,
            responseSummary,
            cacheHit: false,
            retryCount: 0,
          },
        });
      } catch (error) {
        const durationMs = 0;
        const errorMessage = error instanceof Error ? error.message : 'unknown error';
        const fallbackBlock = {
          ...fallbackResult,
          durationMs,
          errorCode: 'ai_call_failed',
          contextAnalysis: {
            ...fallbackResult.contextAnalysis,
            requestSummary: lastRequestSummary,
            responseSummary: 'AI 调用失败，已回退到规则结果',
            errorMessage,
          },
        };
        fallbackBlockIds.push(block.blockId);
        blockResults.push(fallbackBlock);
        for (const field of block.fallbackFields) {
          this.mergeRecognizedField(mergedFields, field);
        }
        lastResponseSummary = fallbackBlock.contextAnalysis?.responseSummary || '';
      }
    }

    if (blockResults.length === 0) {
      for (const fallbackBlock of this.buildRecognitionBlockResults(
        templateDocumentIr,
        analyzeResult.fields
      )) {
        if (fallbackBlock.resultStatus === 'fallback_success') {
          fallbackBlockIds.push(fallbackBlock.blockId);
        }
        blockResults.push(fallbackBlock);
      }
      for (const field of analyzeResult.fields) {
        this.mergeRecognizedField(mergedFields, field);
      }
    }

    if (mergedFields.size === 0) {
      for (const field of analyzeResult.fields) {
        this.mergeRecognizedField(mergedFields, field);
      }
    }

    const recognizedFields = Array.from(mergedFields.values());
    const recognizedBlockCount = blockResults.filter((block) => block.suggestionCount > 0).length;
    const fallbackBlockCount = blockResults.filter(
      (block) => block.resultStatus === 'fallback_success'
    ).length;
    const failedBlockCount = blockResults.filter((block) => block.resultStatus === 'failed').length;
    const resultStatus: WorkflowRecognizeContextAnalysis['resultStatus'] = usedAI
      ? fallbackBlockCount > 0
        ? 'partial_success'
        : 'succeeded'
      : recognizedFields.length > 0
        ? 'fallback_success'
        : 'failed';
    const resultSource: WorkflowRecognizeContextAnalysis['resultSource'] = usedAI
      ? fallbackBlockCount > 0
        ? 'ai+rule_fallback'
        : 'ai'
      : 'rule_fallback';

    return {
      ...analyzeResult,
      fields: recognizedFields,
      blockResults,
      warnings: Array.from(
        new Set([...analyzeResult.warnings, ...(compareCandidateBuildResult?.warnings || [])])
      ),
      contextAnalysis: {
        requestedAI: shouldAttemptAI,
        usedAI,
        globalUnderstandingUsedAI: understandingResult?.contextAnalysis?.usedAI || false,
        resultSource,
        resultStatus,
        requestTrace: {
          summary: usedAI
            ? `已对 ${requestCount} 个块发起 AI 识别请求，并在服务端完成结果合并`
            : `基于 ${blockResults.length} 个文档块执行模板字段识别，当前回退到结构锚点与词典规则链路`,
          sampleFileName: sampleDocument?.fileName,
          blockCount: blockResults.length,
          candidateFieldCount: compareCandidates.length,
          requestCount,
          promptTemplateVersion: usedAI ? 'word-recognize-v1' : undefined,
          lastRequestSummary: lastRequestSummary || undefined,
        },
        responseTrace: {
          summary:
            recognizedFields.length > 0
              ? `已合并 ${recognizedFields.length} 个字段候选，命中 ${recognizedBlockCount} 个块`
              : '已完成块级扫描，但当前未返回字段候选',
          mergedFieldCount: recognizedFields.length,
          recognizedBlockCount,
          successBlockCount: aiSuccessBlockCount,
          failedBlockCount,
          lastResponseSummary: lastResponseSummary || undefined,
        },
        fallbackTrace: {
          usedFallback: fallbackBlockIds.length > 0 || !usedAI,
          reason: usedAI
            ? fallbackBlockIds.length > 0
              ? '部分块 AI 结果为空或失败，已降级回退'
              : undefined
            : '当前请求未提供可用于块级 AI 识别的样本文档，已回退到规则链路',
          fallbackBlockCount,
          fallbackLevel: fallbackBlockIds.length > 0 ? 'block' : 'task',
          fallbackBlockIds:
            fallbackBlockIds.length > 0 ? Array.from(new Set(fallbackBlockIds)) : undefined,
        },
        cacheTrace: {
          compareHit: false,
          understandingHit: Boolean(reusedUnderstanding),
          recognitionHit: false,
        },
        debugArtifacts: {
          promptRequestText:
            lastPromptRequestText || understandingResult?.contextAnalysis?.promptRequestText,
          rawAiResponse: lastRawAiResponse || understandingResult?.contextAnalysis?.rawAiResponse,
        },
      },
    };
  }

  private buildRecognitionBlocks(
    templateDocumentIr: WorkflowDocumentIR,
    candidateFields: WorkflowFieldCandidate[],
    fields: WorkflowAnalyzeFieldResult[],
    sampleText: string
  ): WorkflowRecognitionBlockInput[] {
    return buildRecognitionBlocks(templateDocumentIr, candidateFields, fields, sampleText);
  }

  private computeCandidateGroupCompareStatus(
    candidates: WorkflowFieldCandidate[]
  ): 'aligned' | 'partial' | 'attention' {
    return computeCandidateGroupCompareStatus(candidates);
  }

  private computeCandidateGroupCompareMode(
    candidates: WorkflowFieldCandidate[]
  ): 'section_loose_compare' | 'global_probe_fallback' | 'structure_only' {
    return computeCandidateGroupCompareMode(candidates);
  }

  private computeCandidateGroupCompareScore(candidates: WorkflowFieldCandidate[]): number {
    return computeCandidateGroupCompareScore(candidates);
  }

  private isCandidateMatchedToBlock(
    candidate: WorkflowFieldCandidate,
    blockId: string,
    templateText: string,
    sectionTitle: string
  ): boolean {
    return isCandidateMatchedToBlock(candidate, blockId, templateText, sectionTitle);
  }

  private extractBlockSampleExcerpt(
    sampleText: string,
    candidates: WorkflowFieldCandidate[],
    fallbackText: string
  ): string {
    return extractBlockSampleExcerpt(sampleText, candidates, fallbackText);
  }

  private buildFallbackRecognitionBlockResult(
    block: WorkflowRecognitionBlockInput
  ): WorkflowRecognizeBlockResult {
    return buildFallbackRecognitionBlockResult(block);
  }

  private buildWorkflowRecognitionPrompt(input: {
    block: WorkflowRecognitionBlockInput;
    understandingSummary: string;
    sectionSummary: string;
    sourceLanguage: string;
    targetLanguages: string[];
    assets: WorkflowResolvedAssets;
    skill?: any;
  }): string {
    return buildWorkflowRecognitionPrompt(input);
  }

  private async callWorkflowRecognitionAI(prompt: string, retryCount = 0): Promise<string> {
    const aiOrchestratorUrl = getAiOrchestratorUrl();
    const aiModelId = process.env.AI_MODEL_ID || 'default';
    const maxRetries = 2;
    const actualPrompt =
      retryCount > 0
        ? `${prompt}\n\n【重要】请只返回 JSON 对象，不要 markdown，不要解释文字。`
        : prompt;

    try {
      const response = await axios.post<{ response?: string }>(
        `${aiOrchestratorUrl}/ai/models/${aiModelId}/test`,
        { prompt: actualPrompt },
        { timeout: 180000 }
      );
      const content = String(response.data?.response || '')
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();

      if (content) {
        return content;
      }

      if (retryCount < maxRetries) {
        return this.callWorkflowRecognitionAI(prompt, retryCount + 1);
      }

      throw new Error('AI 返回为空');
    } catch (error) {
      if (retryCount < maxRetries) {
        return this.callWorkflowRecognitionAI(prompt, retryCount + 1);
      }
      throw error;
    }
  }

  private parseWorkflowRecognitionAiResponse(content: string): Record<string, unknown> | undefined {
    return parseWorkflowRecognitionAiResponseUtil(content);
  }

  private normalizeWorkflowRecognitionSuggestions(
    value: unknown
  ): WorkflowRecognitionAiSuggestion[] {
    return normalizeWorkflowRecognitionSuggestions(value);
  }

  private shouldAcceptWorkflowSuggestion(suggestion: WorkflowRecognitionAiSuggestion): boolean {
    return shouldAcceptWorkflowSuggestion(suggestion);
  }

  private buildRecognizedFieldFromSuggestion(
    suggestion: WorkflowRecognitionAiSuggestion,
    block: WorkflowRecognitionBlockInput,
    sourceLanguage: string,
    targetLanguages: string[],
    assets: WorkflowResolvedAssets
  ): WorkflowAnalyzeFieldResult | undefined {
    return buildRecognizedFieldFromSuggestion(
      suggestion,
      block,
      sourceLanguage,
      targetLanguages,
      assets
    );
  }

  private mergeRecognizedField(
    target: Map<string, WorkflowAnalyzeFieldResult>,
    field: WorkflowAnalyzeFieldResult
  ): void {
    mergeRecognizedField(target, field);
  }

  private normalizeWorkflowFieldId(value: string): string {
    return normalizeWorkflowFieldId(value);
  }

  private resolveTemplateFieldLanguage(fieldId: string): string | undefined {
    return resolveTemplateFieldLanguage(fieldId);
  }

  private mapTemplateLanguageSuffix(suffix: string): string | undefined {
    return mapTemplateLanguageSuffix(suffix);
  }

  private inferPolicyFromType(fieldType: string): WorkflowTemplateFieldSpec['policy'] {
    return inferPolicyFromType(fieldType);
  }

  private normalizeWorkflowPolicy(
    value: unknown
  ): NonNullable<WorkflowTemplateFieldSpec['policy']> {
    return normalizeWorkflowPolicy(value);
  }

  private inferRiskLevelFromType(fieldType: string): WorkflowTemplateFieldSpec['riskLevel'] {
    return inferRiskLevelFromType(fieldType);
  }

  private normalizeConfidence(value: unknown, fallback = 0.72): number {
    return normalizeConfidence(value, fallback);
  }

  /**
   * 构建模板资产清单
   */
  buildTemplateAssetManifest(
    templateId: string,
    fileName: string,
    format: string,
    templateFieldSpecs: WorkflowTemplateFieldSpec[],
    languageProfile: WorkflowLanguageProfile,
    termAssets?: WorkflowTermAssets,
    source = TEMPLATE_ASSET_SOURCE_OFFICE_ADDIN,
    addinVersion?: string
  ): TemplateAssetManifest {
    const renderPlan = this.compileBindingPlan(
      templateId,
      DEFAULT_RENDER_PLAN_VERSION,
      templateFieldSpecs,
      languageProfile.sourceLanguage,
      languageProfile.targetLanguages
    );

    return {
      assetVersion: TEMPLATE_ASSET_MANIFEST_VERSION,
      templateId,
      fileName,
      format,
      fieldCount: templateFieldSpecs.length,
      templateFieldSpecs,
      languageProfile,
      renderPlan: {
        templateId: renderPlan.templateId,
        version: renderPlan.version,
        bindings: renderPlan.bindings.map((b) => ({
          fieldId: b.fieldId,
          variablePath: b.variablePath,
          valueSelector: b.valueSelector,
          language: b.language,
          transform: b.transform,
          required: b.required,
        })),
      },
      renderPlanVersion: renderPlan.version,
      termAssets,
      metadata: {
        generatedAt: new Date().toISOString(),
        source,
        addinVersion,
      },
    };
  }

  compileAndPersistTemplate(
    templateId: string,
    templateMeta: WorkflowSaveMeta | undefined,
    templateFieldSpecs: WorkflowTemplateFieldSpec[],
    saveMode: 'draft_or_publish' | 'draft' | 'publish' | undefined,
    templateFormat = 'docx' // 新增：支持传入格式
  ): WorkflowSaveResult {
    const version = 1;
    const carboneBindingPlan = this.compileBindingPlan(
      templateId,
      version,
      templateFieldSpecs,
      templateMeta?.sourceLanguage || 'zh',
      templateMeta?.targetLanguages || []
    );
    const status =
      saveMode === 'publish'
        ? 'published'
        : carboneBindingPlan.bindings.length > 0
          ? 'ready'
          : 'draft';

    const languageProfile: WorkflowLanguageProfile = {
      sourceLanguage: templateMeta?.sourceLanguage || 'zh',
      targetLanguages: templateMeta?.targetLanguages || [],
      documentMode: this.resolveDocumentMode(
        templateMeta?.targetLanguages,
        templateMeta?.documentMode
      ),
    };

    const templateAssetManifest = this.buildTemplateAssetManifest(
      templateId,
      templateMeta?.templateName || `template-${templateId}`,
      templateFormat,
      templateFieldSpecs,
      languageProfile,
      templateMeta?.termAssets,
      TEMPLATE_ASSET_SOURCE_OFFICE_ADDIN,
      templateMeta?.addinVersion
    );

    return {
      templateId,
      version,
      bindingPlanVersion: version,
      status,
      updatedAt: new Date().toISOString(),
      carboneBindingPlan,
      renderPlan: templateAssetManifest.renderPlan,
      templateAssetManifest,
    };
  }

  async renderData(
    userInput: string,
    templateFieldSpecs: WorkflowTemplateFieldSpec[],
    carboneBindingPlan: WorkflowBindingPlan | undefined,
    sourceLanguage = 'zh',
    targetLanguages: string[] = [],
    userOverrides?: Record<string, unknown>,
    termAssets?: WorkflowTermAssets
  ): Promise<WorkflowRenderResult> {
    const warnings: string[] = [];
    const missingFields: string[] = [];
    const needsReviewFields: string[] = [];
    const sourceTrace: Record<string, Record<string, unknown>> = {};
    const fieldValueMap = new Map<string, Record<string, unknown>>();
    const translationCandidates: WorkflowRenderTranslationCandidate[] = [];
    const assets = this.resolveAssets(termAssets);

    for (const spec of templateFieldSpecs) {
      const fieldResult = this.resolveFieldValue(
        spec,
        userInput,
        sourceLanguage,
        targetLanguages,
        userOverrides,
        assets
      );
      this.applyLocalizedLanguageAliases(fieldResult.value, sourceLanguage, targetLanguages);
      fieldValueMap.set(spec.fieldId, fieldResult.value);
      const translationCandidate = this.buildRenderTranslationCandidate(
        spec,
        fieldResult.value,
        sourceLanguage,
        targetLanguages
      );
      if (translationCandidate) {
        translationCandidates.push(translationCandidate);
      }
      sourceTrace[spec.fieldId] = fieldResult.sourceTrace;
      warnings.push(...fieldResult.warnings);
      missingFields.push(...fieldResult.missingFields);
      needsReviewFields.push(...fieldResult.needsReviewFields);
    }

    await this.applyBatchRenderTranslations(
      translationCandidates,
      fieldValueMap,
      sourceTrace,
      warnings,
      needsReviewFields
    );

    const bindings =
      carboneBindingPlan?.bindings ||
      this.compileBindingPlan('ad_hoc', 1, templateFieldSpecs, sourceLanguage, targetLanguages)
        .bindings;

    const data: WorkflowRenderResult['data'] = {};
    for (const binding of bindings) {
      const fieldValue = fieldValueMap.get(binding.fieldId);
      if (!fieldValue) {
        continue;
      }
      const selected = this.readSelector(fieldValue, binding.valueSelector);
      if (selected === undefined) {
        continue;
      }
      for (const variablePath of listBindingVariablePaths(binding)) {
        if (data[variablePath] === undefined) {
          data[variablePath] = selected as Primitive;
        }
      }
    }

    return {
      data,
      sourceTrace,
      warnings: Array.from(new Set(warnings)),
      missingFields: Array.from(new Set(missingFields)),
      needsReviewFields: Array.from(new Set(needsReviewFields)),
    };
  }

  private discoverFields(
    templateDocumentIr: WorkflowDocumentIR,
    languageProfile: WorkflowLanguageProfile,
    normalizedSampleText: string,
    assets: WorkflowResolvedAssets
  ): WorkflowAnalyzeFieldResult[] {
    return discoverFields(templateDocumentIr, languageProfile, normalizedSampleText, assets);
  }

  private buildAnalyzeFieldResult(
    dictionaryMatch: WorkflowFieldDictionaryEntry,
    languageProfile: WorkflowLanguageProfile,
    sourceBinding: WorkflowSourceBinding,
    normalizedSampleText: string,
    assets: WorkflowResolvedAssets
  ): WorkflowAnalyzeFieldResult {
    return buildAnalyzeFieldResult(
      dictionaryMatch,
      languageProfile,
      sourceBinding,
      normalizedSampleText,
      assets
    );
  }

  private buildRecognitionBlockResults(
    templateDocumentIr: WorkflowDocumentIR,
    fields: WorkflowAnalyzeFieldResult[]
  ): WorkflowRecognizeBlockResult[] {
    return buildRecognitionBlockResults(templateDocumentIr, fields);
  }

  private async buildCompareCandidates(
    templateDocumentIr: WorkflowDocumentIR,
    fields: WorkflowAnalyzeFieldResult[],
    sampleDocument: { fileName?: string; contentBase64?: string } | undefined,
    sourceLanguage: string,
    assets: WorkflowResolvedAssets
  ): Promise<WorkflowCompareCandidateBuildResult> {
    return buildCompareCandidates(
      templateDocumentIr,
      fields,
      sampleDocument,
      sourceLanguage,
      assets,
      this.matchFieldDictionary.bind(this),
      this.extractFieldValue.bind(this)
    );
  }

  private buildCompareSummary(
    candidateFields: WorkflowFieldCandidate[],
    warnings: string[],
    sectionContexts: WorkflowCompareSectionContext[] = []
  ): WorkflowCompareResult['compareSummary'] {
    return buildCompareSummary(candidateFields, warnings, sectionContexts);
  }

  private detectTextLanguageHint(text: string): 'zh' | 'ja' | 'en' | 'mixed' | 'unknown' {
    return detectTextLanguageHint(text);
  }

  private isConcreteLanguageHint(
    hint: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown'
  ): hint is 'zh' | 'ja' | 'en' {
    return isConcreteLanguageHint(hint);
  }

  private inferSectionInfo(
    elements: WorkflowDocumentElement[],
    sourceBlockId: string,
    fallbackText: string
  ): { sectionId: string; sectionTitle: string } {
    return inferSectionInfo(elements, sourceBlockId, fallbackText);
  }

  private getElementFormat(element?: WorkflowDocumentElement): {
    fontSize?: number;
    isBold?: boolean;
    alignment?: string;
    isTitle?: boolean;
  } {
    return getElementFormat(element);
  }

  private isLikelyDocumentTitle(text: string, element?: WorkflowDocumentElement): boolean {
    return isLikelyDocumentTitle(text, element);
  }

  private isLikelySectionHeading(text: string, element?: WorkflowDocumentElement): boolean {
    return isLikelySectionHeading(text, element);
  }

  private hasCompareFieldShape(text: string): boolean {
    return hasCompareFieldShape(text);
  }

  private resolveFieldValue(
    spec: WorkflowTemplateFieldSpec,
    userInput: string,
    sourceLanguage: string,
    targetLanguages: string[],
    userOverrides?: Record<string, unknown>,
    assets?: WorkflowResolvedAssets
  ): {
    value: Record<string, unknown>;
    sourceTrace: Record<string, unknown>;
    warnings: string[];
    missingFields: string[];
    needsReviewFields: string[];
  } {
    return resolveFieldValue(
      spec,
      userInput,
      sourceLanguage,
      targetLanguages,
      userOverrides,
      assets
    );
  }

  private buildRenderTranslationCandidate(
    spec: WorkflowTemplateFieldSpec,
    value: Record<string, unknown>,
    sourceLanguage: string,
    targetLanguages: string[]
  ): WorkflowRenderTranslationCandidate | undefined {
    return buildRenderTranslationCandidate(spec, value, sourceLanguage, targetLanguages);
  }

  private async applyBatchRenderTranslations(
    candidates: WorkflowRenderTranslationCandidate[],
    fieldValueMap: Map<string, Record<string, unknown>>,
    sourceTrace: Record<string, Record<string, unknown>>,
    warnings: string[],
    needsReviewFields: string[]
  ): Promise<void> {
    return applyBatchRenderTranslations(
      candidates,
      fieldValueMap,
      sourceTrace,
      warnings,
      needsReviewFields
    );
  }

  private applyLocalizedLanguageAliases(
    value: Record<string, unknown>,
    sourceLanguage: string,
    targetLanguages: string[]
  ): void {
    return applyLocalizedLanguageAliases(value, sourceLanguage, targetLanguages);
  }

  compileBindingPlan(
    templateId: string,
    version: number,
    templateFieldSpecs: WorkflowTemplateFieldSpec[],
    sourceLanguage = 'zh',
    targetLanguages: string[] = []
  ): WorkflowBindingPlan {
    return compileBindingPlan(
      templateId,
      version,
      templateFieldSpecs,
      sourceLanguage,
      targetLanguages
    );
  }

  private extractSampleText(contentBase64: string | undefined, warnings: string[]): string {
    return extractSampleText(contentBase64, warnings);
  }

  private async extractSampleTextRich(
    contentBase64: string | undefined,
    warnings: string[]
  ): Promise<string> {
    return extractSampleTextRich(contentBase64, warnings);
  }

  private extractReadableTextFromWordXml(xml: string): string {
    return extractReadableTextFromWordXml(xml);
  }

  private normalizePlainText(value: string): string {
    return normalizePlainText(value);
  }

  private async generateUnderstandingSummaryWithAI(input: {
    templateDocumentIr: WorkflowDocumentIR;
    sampleDocument?: { fileName?: string; contentBase64?: string };
    sampleText: string;
    sourceLanguage: string;
    targetLanguages: string[];
    fallbackSectionHints: string[];
    fallbackTerminologyCandidates: string[];
    fallbackLayoutFeatures: string[];
    fieldCandidateIds: string[];
    candidateFields: WorkflowFieldCandidate[];
  }) {
    return generateUnderstandingSummaryWithAI(input, this.callWorkflowUnderstandingAI.bind(this));
  }

  private buildLanguageProfile(
    templateDocumentIr: WorkflowDocumentIR,
    sourceLanguage: string,
    targetLanguages: string[]
  ): WorkflowLanguageProfile {
    return buildSimpleWorkflowLanguageProfile(templateDocumentIr, sourceLanguage, targetLanguages);
  }

  private resolveAssets(termAssets?: WorkflowTermAssets): WorkflowResolvedAssets {
    return resolveAssets(termAssets);
  }

  private matchFieldDictionary(
    text: string,
    assets: WorkflowResolvedAssets
  ): WorkflowFieldDictionaryEntry | undefined {
    return matchFieldDictionary(text, assets);
  }

  private buildWorkflowUnderstandingPrompt(input: {
    templateDocumentIr: WorkflowDocumentIR;
    sampleDocument?: { fileName?: string; contentBase64?: string };
    sampleText: string;
    sourceLanguage: string;
    targetLanguages: string[];
    fallbackSectionHints: string[];
    fallbackTerminologyCandidates: string[];
    fallbackLayoutFeatures: string[];
    fieldCandidateIds: string[];
    candidateFields: WorkflowFieldCandidate[];
  }): string {
    return buildWorkflowUnderstandingPrompt(input);
  }

  private buildFallbackWorkflowUnderstandingSummaryText(input: {
    documentTitle?: string;
    sourceLanguage: string;
    targetLanguages: string[];
    paragraphCount: number;
    tableCount: number;
    sectionHints: string[];
    terminologyCandidates: string[];
    layoutFeatures: string[];
    fieldCandidateIds: string[];
    sampleFileName?: string;
  }): string {
    return buildFallbackWorkflowUnderstandingSummaryText(input);
  }

  private buildWorkflowTemplateExcerpt(templateDocumentIr: WorkflowDocumentIR): string {
    return buildWorkflowTemplateExcerpt(templateDocumentIr);
  }

  private async callWorkflowUnderstandingAI(prompt: string, retryCount = 0): Promise<string> {
    const aiOrchestratorUrl = getAiOrchestratorUrl();
    const aiModelId = process.env.AI_MODEL_ID || 'default';
    const maxRetries = 2;
    const actualPrompt =
      retryCount > 0
        ? `${prompt}\n\n【重要】请只返回 JSON 对象，不要 markdown，不要解释文字。`
        : prompt;

    try {
      const response = await axios.post<{ response?: string }>(
        `${aiOrchestratorUrl}/ai/models/${aiModelId}/test`,
        { prompt: actualPrompt },
        { timeout: 180000 }
      );
      const content = String(response.data?.response || '')
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();

      if (content) {
        return content;
      }

      if (retryCount < maxRetries) {
        return this.callWorkflowUnderstandingAI(prompt, retryCount + 1);
      }

      throw new Error('AI 返回为空');
    } catch (error) {
      if (retryCount < maxRetries) {
        return this.callWorkflowUnderstandingAI(prompt, retryCount + 1);
      }
      throw error;
    }
  }

  private parseWorkflowUnderstandingAiResponse(
    content: string
  ): Record<string, unknown> | undefined {
    return parseWorkflowUnderstandingAiResponse(content);
  }

  private normalizeWorkflowUnderstandingText(content: string): string | undefined {
    return normalizeWorkflowUnderstandingText(content);
  }

  private tryParseJsonObject(value: string): Record<string, unknown> | undefined {
    return tryParseJsonObject(value);
  }

  private normalizeStringArray(value: unknown, limit: number): string[] | undefined {
    return normalizeStringArray(value, limit);
  }

  private findTermMatch(
    fieldId: string,
    text: string,
    assets: WorkflowResolvedAssets
  ): WorkflowTermEntry | undefined {
    return findTermMatch(fieldId, text, assets);
  }

  private findEnumMatch(
    fieldId: string,
    sourceValue: string,
    assets: WorkflowResolvedAssets
  ): WorkflowEnumItem | undefined {
    return findEnumMatch(fieldId, sourceValue, assets);
  }

  private normalizeLookupText(value: unknown): string {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[（）()]/g, '')
      .replace(/\s+/g, '');
  }

  private escapeRegExp(value: string): string {
    return escapeRegExp(value);
  }

  private scopePriority(scope?: WorkflowAssetScope): number {
    return scopePriority(scope);
  }

  private isAssetActive(status?: WorkflowAssetStatus): boolean {
    return isAssetActive(status);
  }

  private readSelector(value: Record<string, unknown>, selector: string): unknown {
    return readSelector(value, selector);
  }

  private extractFieldValue(fieldId: string, userInput: string, overrideValue: unknown): unknown {
    return extractFieldValue(fieldId, userInput, overrideValue);
  }

  private safeText(value: unknown): string {
    return safeText(value);
  }
}
