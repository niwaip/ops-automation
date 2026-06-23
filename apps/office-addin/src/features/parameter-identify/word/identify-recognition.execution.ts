import type { TemplateUnderstandResponse } from '../../../api/carbone-api';
import type { AISuggestion } from '../../../app/store';
import type { DocumentIR } from '../../../host/adapters/document-ir';
import { resolveAnalysisExecutor } from '../services/analysis-executor';
import type {
  CreateWordIdentifyRecognitionControllerOptions,
  RecognitionResultLike,
  WordSectionGenerationResultLike,
} from './identify-recognition.types';

export async function executeWordRecognitionSections(
  options: CreateWordIdentifyRecognitionControllerOptions,
  args: {
    templateDocumentIr: DocumentIR;
    prefetchedUnderstanding: TemplateUnderstandResponse;
  }
): Promise<{
  sectionResults: WordSectionGenerationResultLike[];
  nextSuggestions: AISuggestion[];
}> {
  const sectionResults: WordSectionGenerationResultLike[] = [];
  const sectionSuggestions: AISuggestion[] = [];
  const understandingSummaryText = options.buildWordUnderstandingSummaryText(
    args.prefetchedUnderstanding
  );

  options.addDebugLog(
    'info',
    'Word 章节参数生成开始',
    [
      `executor: ${options.analysisExecutor}`,
      `thinking: ${options.analysisThinkingEnabled ? 'on' : 'off'}`,
      `章节数: ${options.selectedRecognitionSections.length}`,
      `语言配置: ${options.workflowSourceLanguage} -> ${options.workflowTargetLanguages.join(', ') || '单语言'}`,
      '',
      '章节列表:',
      ...options.selectedRecognitionSections.map(
        (section) => `- ${section.sectionTitle} | 候选 ${section.candidates.length}`
      ),
    ].join('\n')
  );

  for (const section of options.selectedRecognitionSections) {
    const detectedSection = options.detectedSectionMap.get(section.sectionKey);
    const excerpt = options.buildWordSectionExcerpt(
      args.templateDocumentIr,
      section,
      detectedSection
    );
    const sectionDocumentIr = options.buildWordSectionDocumentIR(
      args.templateDocumentIr,
      section,
      detectedSection
    );
    const sectionDocumentContent = options.buildWordSectionDocumentContent(
      args.templateDocumentIr,
      section,
      detectedSection
    );
    const structuredBilingualGroups = options.buildWordSectionPromptBilingualGroups(section);
    const candidateFieldList = options.buildWordSectionCandidateList(
      args.templateDocumentIr,
      section
    );
    const bilingualCandidatePairs = options.buildWordSectionBilingualPairList(
      args.templateDocumentIr,
      section
    );

    options.addDebugLog(
      'info',
      `Word 章节请求详情: ${section.sectionTitle}`,
      [
        `原始候选数: ${section.candidates.length}`,
        `分批上限: ${options.wordSectionRecognitionBatchSize}`,
        `最大轮次: ${options.wordSectionRecognitionMaxRounds}`,
        '【双语配对参考】',
        bilingualCandidatePairs,
        '',
        '',
        '【章节候选列表】',
        candidateFieldList,
        '',
        '【章节内容摘要】',
      ].join('\n')
    );

    const candidateById = new Map(
      section.candidates.map((candidate) => [candidate.candidateId, candidate] as const)
    );
    const acceptedSuggestionsByCandidateId = new Map<string, AISuggestion>();
    const acceptedCandidateIds = new Set<string>();
    const retryLoopIds: string[] = [];
    const retryNormalIds: string[] = [];
    const unsentLoopIds = section.candidates
      .filter((candidate) => options.isWordLoopCompareCandidate(candidate))
      .map((candidate) => candidate.candidateId);
    const unsentNormalIds = section.candidates
      .filter((candidate) => !options.isWordLoopCompareCandidate(candidate))
      .map((candidate) => candidate.candidateId);
    const aggregatedQualityIssues = new Set<string>();
    const aggregatedPromptRequests: string[] = [];
    const aggregatedRawResponses: string[] = [];
    const chatSessionId = `office-word-section-${section.sectionKey}-${Date.now()}`;
    let executedRounds = 0;
    let aiCallSucceeded = false;
    let lastPromptDebugSummary: string | undefined;
    let lastError: any;

    for (
      let roundIndex = 1;
      roundIndex <= options.wordSectionRecognitionMaxRounds;
      roundIndex += 1
    ) {
      const currentBatch = options.takeWordRecognitionBatch({
        retryLoopIds,
        unsentLoopIds,
        retryNormalIds,
        unsentNormalIds,
        candidateById,
        acceptedIds: acceptedCandidateIds,
      });
      if (currentBatch.length === 0) {
        break;
      }

      executedRounds = roundIndex;
      const batchSection = options.buildWordSectionSubset(section, currentBatch);
      const batchStructuredCandidates = options.buildWordSectionPromptCandidates(
        args.templateDocumentIr,
        batchSection
      );
      const batchStructuredBilingualGroups = options.filterWordPromptBilingualGroupsByCandidates(
        structuredBilingualGroups,
        currentBatch
      );
      const batchCandidateFieldList = options.buildWordSectionCandidateList(
        args.templateDocumentIr,
        batchSection
      );
      const batchBilingualCandidatePairs = options.buildWordSectionBilingualPairList(
        args.templateDocumentIr,
        batchSection
      );
      const batchContainsLoop = currentBatch.some((candidate) =>
        options.isWordLoopCompareCandidate(candidate)
      );

      options.addDebugLog(
        'info',
        `Word 章节批次识别: ${section.sectionTitle}`,
        [
          `轮次: ${roundIndex}/${options.wordSectionRecognitionMaxRounds}`,
          `会话: ${chatSessionId}`,
          `批次类型: ${batchContainsLoop ? '循环单独批次' : '普通批次'}`,
          `批次候选数: ${currentBatch.length}`,
          `已保留参数: ${acceptedCandidateIds.size}`,
          `批次 candidateIds: ${currentBatch.map((candidate) => candidate.candidateId).join(', ')}`,
        ].join('\n')
      );

      try {
        const executor = resolveAnalysisExecutor({
          apiBaseUrl: options.apiBaseUrl,
          useMultiStage: options.useMultiStage,
          requestedKind: options.analysisExecutor,
          thinking: roundIndex > 1 ? true : options.analysisThinkingEnabled,
          aiOrchestratorBaseUrl: options.aiOrchestratorBaseUrl,
          aiOrchestratorAuthToken: options.aiOrchestratorAuthToken,
        });
        const response = await executor.analyze({
          host: 'word',
          documentIR: sectionDocumentIr,
          documentContent: sectionDocumentContent,
          documentType: 'docx',
          templateType: options.selectedTemplateType,
          context: [
            `当前阶段为 Word 章节参数生成。`,
            `只允许分析当前章节：${section.sectionTitle}。`,
            `当前为第 ${roundIndex}/${options.wordSectionRecognitionMaxRounds} 轮批次识别。`,
            `源语言=${options.workflowSourceLanguage}，目标语言=${options.workflowTargetLanguages.join(', ') || '单语言'}。`,
          ].join('\n'),
          analysisStage: 'word-section-analysis',
          pairLabel: section.sectionTitle,
          globalUnderstandingSummary: understandingSummaryText,
          diffSummary: excerpt,
          diffOverview: excerpt,
          candidateFieldList: batchCandidateFieldList,
          bilingualCandidatePairs: batchBilingualCandidatePairs,
          wordSectionCandidates: batchStructuredCandidates,
          wordSectionBilingualGroups: batchStructuredBilingualGroups,
          wordSectionAcceptedSuggestions: options.buildAcceptedWordSuggestionSummaries(
            Array.from(acceptedSuggestionsByCandidateId.values())
          ),
          wordSectionRoundIndex: roundIndex,
          wordSectionMaxRounds: options.wordSectionRecognitionMaxRounds,
          chatSessionId,
        });

        aiCallSucceeded = true;
        lastPromptDebugSummary = response?.contextAnalysis?.promptDebugSummary
          ? String(response.contextAnalysis.promptDebugSummary)
          : lastPromptDebugSummary;
        if (response?.contextAnalysis?.promptRequestText) {
          aggregatedPromptRequests.push(
            `【第 ${roundIndex} 轮请求】\n${String(response.contextAnalysis.promptRequestText)}`
          );
        }
        if (response?.contextAnalysis?.rawAiResponse) {
          aggregatedRawResponses.push(
            `【第 ${roundIndex} 轮返回】\n${String(response.contextAnalysis.rawAiResponse)}`
          );
        }

        const currentSuggestions = options.hydrateWordSectionSuggestions(
          args.templateDocumentIr,
          batchSection,
          excerpt,
          Array.isArray(response?.suggestions) ? (response.suggestions as AISuggestion[]) : []
        );
        const promptTraceDebugText = options.buildPromptTraceDebugText(
          response?.contextAnalysis?.promptRequestText
            ? String(response.contextAnalysis.promptRequestText)
            : undefined,
          response?.contextAnalysis?.rawAiResponse
            ? String(response.contextAnalysis.rawAiResponse)
            : undefined
        );

        const failedCandidateIds: string[] = [];
        currentBatch.forEach((candidate) => {
          const bestSuggestion = options.selectBestWordSuggestionForCandidate(
            currentSuggestions,
            candidate.candidateId
          );
          if (options.isWordSuggestionHighQuality(bestSuggestion, candidate.candidateId)) {
            acceptedCandidateIds.add(candidate.candidateId);
            acceptedSuggestionsByCandidateId.set(
              candidate.candidateId,
              bestSuggestion as AISuggestion
            );
            return;
          }
          failedCandidateIds.push(candidate.candidateId);
        });

        if (response?.contextAnalysis?.salvagedMalformedJson) {
          aggregatedQualityIssues.add(
            `第 ${roundIndex} 轮 AI 返回存在轻度 JSON 污染，结果已按容错逻辑修复`
          );
        }
        if (currentSuggestions.length === 0) {
          aggregatedQualityIssues.add(`第 ${roundIndex} 轮当前批次未返回结构化参数建议`);
        }
        if (failedCandidateIds.length > 0) {
          aggregatedQualityIssues.add(
            `第 ${roundIndex} 轮有 ${failedCandidateIds.length} 个候选未通过质量校验`
          );
        }

        options.appendUniqueCandidateIds(
          batchContainsLoop ? retryLoopIds : retryNormalIds,
          failedCandidateIds.filter((candidateId) => !acceptedCandidateIds.has(candidateId))
        );

        options.addDebugLog(
          failedCandidateIds.length > 0 ? 'warn' : 'info',
          `Word 章节批次完成: ${section.sectionTitle}`,
          [
            `轮次: ${roundIndex}/${options.wordSectionRecognitionMaxRounds}`,
            `批次候选: ${currentBatch.length}`,
            `本轮通过: ${currentBatch.length - failedCandidateIds.length}`,
            `累计保留: ${acceptedCandidateIds.size}/${section.candidates.length}`,
            failedCandidateIds.length > 0
              ? `待继续识别: ${failedCandidateIds.join(', ')}`
              : '本轮全部通过质量校验',
            '',
            promptTraceDebugText,
          ]
            .filter(Boolean)
            .join('\n')
        );
      } catch (error: any) {
        lastError = error;
        options.appendUniqueCandidateIds(
          retryLoopIds,
          currentBatch
            .filter((candidate) => options.isWordLoopCompareCandidate(candidate))
            .map((candidate) => candidate.candidateId)
        );
        options.appendUniqueCandidateIds(
          retryNormalIds,
          currentBatch
            .filter((candidate) => !options.isWordLoopCompareCandidate(candidate))
            .map((candidate) => candidate.candidateId)
        );

        const errorMessage = error?.message || '章节参数生成失败';
        const errorPromptTraceDebugText = options.buildPromptTraceDebugText(
          error?.details?.promptRequestText
            ? String(error.details.promptRequestText)
            : error?.response?.data?.contextAnalysis?.promptRequestText
              ? String(error.response.data.contextAnalysis.promptRequestText)
              : undefined,
          error?.details?.rawAiResponse
            ? String(error.details.rawAiResponse)
            : error?.response?.data?.contextAnalysis?.rawAiResponse
              ? String(error.response.data.contextAnalysis.rawAiResponse)
              : undefined
        );
        aggregatedQualityIssues.add(`第 ${roundIndex} 轮调用执行器失败: ${errorMessage}`);

        options.addDebugLog(
          roundIndex < options.wordSectionRecognitionMaxRounds ? 'warn' : 'error',
          roundIndex < options.wordSectionRecognitionMaxRounds
            ? `Word 章节批次失败，准备下一轮: ${section.sectionTitle}`
            : `Word 章节批次失败，已达最大轮次: ${section.sectionTitle}`,
          [
            `轮次: ${roundIndex}/${options.wordSectionRecognitionMaxRounds}`,
            `错误: ${errorMessage}`,
            error?.details ? JSON.stringify(error.details, null, 2) : '',
            '',
            errorPromptTraceDebugText,
          ]
            .filter(Boolean)
            .join('\n')
        );
      }

      if (acceptedCandidateIds.size >= section.candidates.length) {
        break;
      }
    }

    const acceptedSuggestions = options.dedupeWordSectionSuggestions(
      Array.from(acceptedSuggestionsByCandidateId.values())
    );
    sectionSuggestions.push(...acceptedSuggestions);

    const unresolvedCount = section.candidates.length - acceptedCandidateIds.size;
    if (unresolvedCount > 0) {
      aggregatedQualityIssues.add(
        `章节仍有 ${unresolvedCount} 个候选在 ${options.wordSectionRecognitionMaxRounds} 轮内未通过质量校验`
      );
    }

    sectionResults.push({
      sectionKey: section.sectionKey,
      sectionTitle: section.sectionTitle,
      candidateCount: section.candidates.length,
      suggestionCount: acceptedSuggestions.length,
      suggestionIds: acceptedSuggestions.map((suggestion) => suggestion.id),
      aiCallSucceeded,
      usedRetry: executedRounds > 1,
      retryCount: Math.max(0, executedRounds - 1),
      excerpt,
      promptDebugSummary: lastPromptDebugSummary,
      promptRequestText: aggregatedPromptRequests.join('\n\n'),
      rawAiResponse: aggregatedRawResponses.join('\n\n'),
      qualityIssues: Array.from(aggregatedQualityIssues),
      error:
        !aiCallSucceeded && lastError
          ? {
              message: lastError?.message || '章节参数生成失败',
              reason: lastError?.details?.reason,
              url: lastError?.details?.url,
              status: lastError?.details?.status,
            }
          : undefined,
    });

    options.addDebugLog(
      acceptedSuggestions.length > 0 ? 'info' : 'warn',
      `Word 章节参数生成完成: ${section.sectionTitle}`,
      [
        `候选数: ${section.candidates.length}`,
        `保留参数: ${acceptedSuggestions.length}`,
        `执行轮次: ${executedRounds}`,
        `会话: ${chatSessionId}`,
        unresolvedCount > 0 ? `未完成候选: ${unresolvedCount}` : '全部候选已完成识别',
      ].join('\n')
    );
  }

  options.addDebugLog(
    'info',
    'Word 参数识别总览',
    [
      sectionSuggestions.length > 0
        ? `本次共处理 ${sectionResults.length} 个章节，累计候选 ${sectionResults.reduce((sum, section) => sum + section.candidateCount, 0)} 个，生成参数 ${sectionSuggestions.length} 个。`
        : `本次已处理 ${sectionResults.length} 个章节，但当前还没有产出可落地的参数建议。`,
      '',
      '【章节处理明细】',
      ...sectionResults.map((section, index) => {
        const status = section.error ? '失败' : section.suggestionCount > 0 ? '成功' : '空结果';
        const detailLines = [
          `${index + 1}. ${section.sectionTitle}`,
          `状态: ${status}`,
          `候选: ${section.candidateCount}`,
          `参数: ${section.suggestionCount}`,
          `重试: ${section.usedRetry ? `是（${section.retryCount} 次）` : '否'}`,
        ];

        if (section.promptDebugSummary) {
          detailLines.push(`摘要: ${section.promptDebugSummary}`);
        }
        if (section.promptRequestText || section.rawAiResponse) {
          detailLines.push(
            options.buildPromptTraceDebugText(section.promptRequestText, section.rawAiResponse)
          );
        }
        if (section.qualityIssues && section.qualityIssues.length > 0) {
          detailLines.push(`质量提示: ${section.qualityIssues.join(' | ')}`);
        }
        if (section.error?.message) {
          detailLines.push(`错误: ${section.error.message}`);
        }

        return detailLines.join('\n');
      }),
    ].join('\n')
  );

  return {
    sectionResults,
    nextSuggestions: options.dedupeWordSectionSuggestions(sectionSuggestions),
  };
}

export function commitWordRecognitionResult(
  options: CreateWordIdentifyRecognitionControllerOptions,
  args: {
    sectionResults: WordSectionGenerationResultLike[];
    nextSuggestions: AISuggestion[];
  }
): RecognitionResultLike {
  const nextCollapsedRecognitionSections = options.selectedRecognitionSections.reduce<
    Record<string, boolean>
  >((acc, section) => {
    acc[section.sectionKey] = options.collapsedRecognitionSections[section.sectionKey] ?? false;
    return acc;
  }, {});
  const recognitionUpdatedAt = Date.now();
  const cachedRecognitionEntry = options.recognitionCacheKey
    ? options.loadWordRecognitionCache()[options.recognitionCacheKey]
    : undefined;
  const mergedRecognitionResult = options.mergeRecognitionResultWithAppliedCache(
    {
      suggestions: args.nextSuggestions,
      sectionGenerationResults: args.sectionResults,
      collapsedSections: nextCollapsedRecognitionSections,
    },
    cachedRecognitionEntry
  );

  options.setRecognitionResult(null);
  options.setSectionGenerationResults(mergedRecognitionResult.sectionGenerationResults);
  options.setSuggestions(mergedRecognitionResult.suggestions);
  options.setCollapsedRecognitionSections(mergedRecognitionResult.collapsedSections || {});
  if (options.recognitionCacheKey) {
    options.saveWordRecognitionCacheEntry({
      cacheKey: options.recognitionCacheKey,
      result: mergedRecognitionResult,
      updatedAt: recognitionUpdatedAt,
    });
  }
  options.persistCompareCacheRecognitionSnapshot(mergedRecognitionResult);
  options.setRecognitionCacheStatus('miss');
  options.setRecognitionCacheUpdatedAt(recognitionUpdatedAt);

  return mergedRecognitionResult;
}
