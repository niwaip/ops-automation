import { Injectable } from '@nestjs/common';
import JSZip from 'jszip';
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
} from '../studio/studio.types';
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
  extractReadableTextFromWordXml,
  normalizePlainText,
} from './utils/workflow-xml-text';
import {
  buildWorkflowUnderstandResult,
  normalizeStringArray,
  generateUnderstandingSummaryWithAI,
  prepareWorkflowUnderstandingContext,
} from './utils/workflow-ai';
import { callTemplateWorkflowAiText } from './utils/template-workflow-ai.helper';
import {
  appendFallbackRecognitionBlock,
  buildAiEmptyFallbackRecognitionBlock,
  buildAiErrorFallbackRecognitionBlock,
  discoverFields,
  mergeWorkflowRecognizedFields,
  prepareWorkflowRecognitionContext,
  buildWorkflowRecognizeResultMeta,
  buildRecognizedFieldFromSuggestion,
  mergeRecognizedField,
  buildFallbackRecognitionBlockResult,
  buildWorkflowRecognitionPrompt,
  parseWorkflowRecognitionAiResponse as parseWorkflowRecognitionAiResponseUtil,
  normalizeWorkflowRecognitionSuggestions,
  shouldAcceptWorkflowSuggestion,
  matchFieldDictionary,
  resolveAssets,
  buildRecognitionBlockResults,
} from './utils/workflow-discover';
import { buildCompareCandidates } from './utils/workflow-compare';
import { buildCompareSummary } from './utils/workflow-compare-summary';
import { resolveTemplateWorkflowCandidates } from './utils/template-workflow-candidate.helper';
import { buildSimpleWorkflowLanguageProfile } from './utils/workflow-language-profile';
import {
  resolveFieldValue,
  listBindingVariablePaths,
  compileBindingPlan,
} from './utils/workflow-render-helper';
import {
  buildRenderTranslationCandidate,
  applyBatchRenderTranslations,
  applyLocalizedLanguageAliases,
} from './utils/workflow-translation-helper';
import { readSelector, extractFieldValue } from './utils/workflow-input-helper';

@Injectable()
export class TemplateWorkflowService {
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
    const { compareCandidates, compareCandidateBuildResult } =
      await resolveTemplateWorkflowCandidates({
        templateDocumentIr,
        fields: analyzeResult.fields,
        sampleDocument,
        sourceLanguage: effectiveSourceLanguage,
        assets,
        candidateFields,
      });
    const understandingInput = await prepareWorkflowUnderstandingContext({
      templateDocumentIr,
      sampleDocument,
      targetLanguages: effectiveTargetLanguages,
      compareCandidates,
      warnings: analyzeResult.warnings,
    });
    const understandingContext = await generateUnderstandingSummaryWithAI({
      templateDocumentIr,
      sampleDocument,
      sampleText: understandingInput.sampleText,
      sourceLanguage: effectiveSourceLanguage,
      targetLanguages: effectiveTargetLanguages,
      fallbackSectionHints: understandingInput.fallbackSectionHints,
      fallbackTerminologyCandidates: understandingInput.fallbackTerminologyCandidates,
      fallbackLayoutFeatures: understandingInput.fallbackLayoutFeatures,
      fieldCandidateIds: understandingInput.fieldCandidateIds,
      candidateFields: compareCandidates,
    }, callTemplateWorkflowAiText);
    return buildWorkflowUnderstandResult({
      analysisId: analyzeResult.analysisId,
      languageProfile: analyzeResult.languageProfile,
      templateDocumentIr,
      sampleDocument,
      sourceLanguage: effectiveSourceLanguage,
      targetLanguages: effectiveTargetLanguages,
      fieldIds: analyzeResult.fields.map((field) => field.fieldId),
      understandingInput,
      understandingSummary: understandingContext.summary,
      warnings: analyzeResult.warnings,
      compareCandidateWarnings: compareCandidateBuildResult?.warnings,
      understandingContext,
    });
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
    const compareCandidateBuildResult = await buildCompareCandidates(
      templateDocumentIr,
      analyzeResult.fields,
      sampleDocument,
      effectiveSourceLanguage,
      assets,
      matchFieldDictionary,
      extractFieldValue
    );
    const compareSummary = buildCompareSummary(
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
    const normalizedSampleText = extractSampleText(sampleDocument?.contentBase64, warnings);
    const fields = discoverFields(
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
    const { compareCandidates, compareCandidateBuildResult } =
      await resolveTemplateWorkflowCandidates({
        templateDocumentIr,
        fields: analyzeResult.fields,
        sampleDocument,
        sourceLanguage: effectiveSourceLanguage,
        assets,
        candidateFields,
      });
    const {
      shouldAttemptAI,
      reusedUnderstanding,
      understandingResult,
      blockInputs,
    } = await prepareWorkflowRecognitionContext({
      templateDocumentIr,
      sampleDocument,
      effectiveSourceLanguage,
      effectiveTargetLanguages,
      termAssets,
      compareCandidates,
      analyzeFields: analyzeResult.fields,
      prefetchedUnderstanding,
      understandTemplate: this.understandTemplate.bind(this),
    });
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
      const fallbackResult = buildFallbackRecognitionBlockResult(block);

      if (!shouldAttemptAI || block.candidates.length === 0) {
        appendFallbackRecognitionBlock({
          fallbackBlock: fallbackResult,
          fallbackBlockIds,
          blockResults,
        });
        mergeWorkflowRecognizedFields(mergedFields, block.fallbackFields, mergeRecognizedField);
        continue;
      }

      const promptRequestText = buildWorkflowRecognitionPrompt({
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
        const rawAiResponse = await callTemplateWorkflowAiText(promptRequestText);
        const durationMs = Date.now() - startedAt;
        lastRawAiResponse = rawAiResponse;
        const parsed = parseWorkflowRecognitionAiResponseUtil(rawAiResponse);
        const suggestions = normalizeWorkflowRecognitionSuggestions(
          parsed?.suggestions || parsed?.fields
        );
        const aiFields = suggestions
          .filter((suggestion) => shouldAcceptWorkflowSuggestion(suggestion))
          .map((suggestion) =>
            buildRecognizedFieldFromSuggestion(
              suggestion,
              block,
              sourceLanguage,
              targetLanguages,
              assets
            )
          )
          .filter(Boolean) as WorkflowAnalyzeFieldResult[];

        if (aiFields.length === 0) {
          const fallbackBlock = buildAiEmptyFallbackRecognitionBlock({
            fallbackResult,
            requestSummary: lastRequestSummary,
            durationMs,
          });
          appendFallbackRecognitionBlock({
            fallbackBlock,
            fallbackBlockIds,
            blockResults,
          });
          mergeWorkflowRecognizedFields(mergedFields, block.fallbackFields, mergeRecognizedField);
          lastResponseSummary = fallbackBlock.contextAnalysis?.responseSummary || '';
          continue;
        }

        usedAI = true;
        aiSuccessBlockCount += 1;
        mergeWorkflowRecognizedFields(mergedFields, aiFields, mergeRecognizedField);
        const warnings = normalizeStringArray(parsed?.warnings, 6) || [];
        const responseSummary =
          safeText(parsed?.summary) || `AI 返回 ${aiFields.length} 个字段建议`;
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
        const errorMessage = error instanceof Error ? error.message : 'unknown error';
        const fallbackBlock = buildAiErrorFallbackRecognitionBlock({
          fallbackResult,
          requestSummary: lastRequestSummary,
          errorMessage,
        });
        appendFallbackRecognitionBlock({
          fallbackBlock,
          fallbackBlockIds,
          blockResults,
        });
        mergeWorkflowRecognizedFields(mergedFields, block.fallbackFields, mergeRecognizedField);
        lastResponseSummary = fallbackBlock.contextAnalysis?.responseSummary || '';
      }
    }

    if (blockResults.length === 0) {
      for (const fallbackBlock of buildRecognitionBlockResults(
        templateDocumentIr,
        analyzeResult.fields
      )) {
        appendFallbackRecognitionBlock({
          fallbackBlock,
          fallbackBlockIds,
          blockResults,
        });
      }
      mergeWorkflowRecognizedFields(mergedFields, analyzeResult.fields, mergeRecognizedField);
    }

    if (mergedFields.size === 0) {
      mergeWorkflowRecognizedFields(mergedFields, analyzeResult.fields, mergeRecognizedField);
    }

    const recognizedFields = Array.from(mergedFields.values());
    const recognizeResultMeta = buildWorkflowRecognizeResultMeta({
      analyzeWarnings: analyzeResult.warnings,
      compareCandidateWarnings: compareCandidateBuildResult?.warnings,
      recognizedFields,
      blockResults,
      requestedAI: shouldAttemptAI,
      usedAI,
      globalUnderstandingUsedAI: understandingResult?.contextAnalysis?.usedAI || false,
      sampleFileName: sampleDocument?.fileName,
      candidateFieldCount: compareCandidates.length,
      requestCount,
      lastRequestSummary,
      lastResponseSummary,
      aiSuccessBlockCount,
      fallbackBlockIds,
      understandingHit: Boolean(reusedUnderstanding),
      lastPromptRequestText,
      understandingPromptRequestText: understandingResult?.contextAnalysis?.promptRequestText,
      lastRawAiResponse,
      understandingRawAiResponse: understandingResult?.contextAnalysis?.rawAiResponse,
    });

    return {
      ...analyzeResult,
      fields: recognizedFields,
      blockResults,
      warnings: recognizeResultMeta.warnings,
      contextAnalysis: recognizeResultMeta.contextAnalysis,
    };
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
      const fieldResult = resolveFieldValue(
        spec,
        userInput,
        sourceLanguage,
        targetLanguages,
        userOverrides,
        assets
      );
      applyLocalizedLanguageAliases(fieldResult.value, sourceLanguage, targetLanguages);
      fieldValueMap.set(spec.fieldId, fieldResult.value);
      const translationCandidate = buildRenderTranslationCandidate(
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

    await applyBatchRenderTranslations(
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
      const selected = readSelector(fieldValue, binding.valueSelector);
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

}
