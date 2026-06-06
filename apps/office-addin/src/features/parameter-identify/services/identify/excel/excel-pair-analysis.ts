import { DocumentIR } from '../../../../../host/adapters/document-ir';
import { AISuggestion } from '../../../../../app/store';
import { resolveAnalysisExecutor, AnalysisExecutorKind, StructuredAnalyzeRequest } from '../../analysis-executor';
import { serializeDocument } from '../common/document-serialize';
import type { AnalyzeResponse, ExcelGlobalUnderstandingCache } from '../common/identify.types';
import {
  buildExcelGlobalUnderstandingContext,
  buildExcelGlobalUnderstandingSummary,
} from './excel-global-understanding';

type AnalysisExecutorLike = {
  kind: AnalysisExecutorKind;
  requestedKind?: AnalysisExecutorKind;
  fallbackReason?: string;
  supportsThinking: boolean;
  analyze: (payload: StructuredAnalyzeRequest) => Promise<AnalyzeResponse>;
};

export type ExcelPairAttemptQuality = {
  salvagedMalformedJson: boolean;
  qualityIssues: string[];
  needsRetry: boolean;
};

export type ExcelPairAttemptResult = {
  pairSuggestions: AISuggestion[];
  aiCallSucceeded: boolean;
  error?: Record<string, unknown>;
  promptDebugSummary?: string;
  promptRequestText?: string;
  rawAiResponse?: string;
  salvagedMalformedJson: boolean;
  qualityIssues: string[];
  needsRetry: boolean;
};

export type ExcelPairAnalysisOptions<TPairInput> = {
  documentIR: DocumentIR;
  documentType: 'docx' | 'xlsx' | 'pptx';
  templateType: string;
  apiBaseUrl: string;
  useMultiStage: boolean;
  analysisExecutor?: AnalysisExecutorKind;
  thinking?: boolean;
  aiOrchestratorBaseUrl?: string;
  aiOrchestratorAuthToken?: string;
  excelGlobalUnderstandingCache?: ExcelGlobalUnderstandingCache;
  executor: AnalysisExecutorLike;
  pairInputs: TPairInput[];
  globalDataDocumentIR: DocumentIR;
  excelHeuristicSuggestions: AISuggestion[];
  buildPairPayload: (
    pair: TPairInput,
    documentType: 'docx' | 'xlsx' | 'pptx',
    templateType: string,
    globalUnderstandingSummary: string
  ) => StructuredAnalyzeRequest;
  normalizePairSuggestions: (pair: TPairInput, response: AnalyzeResponse) => AISuggestion[];
  evaluatePairAttempt: (
    pair: TPairInput,
    pairSuggestions: AISuggestion[],
    contextAnalysis?: Record<string, unknown>
  ) => ExcelPairAttemptQuality;
  summarizeSuggestionSources: (suggestions: AISuggestion[]) => {
    resultSource: 'ai' | 'heuristic' | 'manual' | 'ai+heuristic' | 'mixed' | 'unknown';
    sourceCounts: Record<string, number>;
  };
  dedupeRemoteSuggestions: (suggestions: AISuggestion[]) => AISuggestion[];
  dedupeHeuristicSuggestions: (suggestions: AISuggestion[]) => AISuggestion[];
  toErrorInfo: (error: unknown) => Record<string, unknown> | undefined;
  getPairMeta: (pair: TPairInput) => {
    pairIndex: number;
    pairLabel: string;
    candidateCount: number;
    loopDetected: boolean;
  };
};

function scoreExcelPairAttempt(attempt: ExcelPairAttemptResult): number {
  let score = attempt.aiCallSucceeded ? 100 : -100;
  score += attempt.pairSuggestions.length * 10;
  score -= attempt.qualityIssues.length * 20;
  if (attempt.salvagedMalformedJson) {
    score -= 30;
  }
  return score;
}

function choosePreferredExcelPairAttempt(
  primaryAttempt: ExcelPairAttemptResult,
  retryAttempt?: ExcelPairAttemptResult
): ExcelPairAttemptResult {
  if (!retryAttempt) {
    return primaryAttempt;
  }

  if (retryAttempt.aiCallSucceeded && !retryAttempt.needsRetry) {
    return retryAttempt;
  }

  if (primaryAttempt.aiCallSucceeded && !primaryAttempt.needsRetry) {
    return primaryAttempt;
  }

  return scoreExcelPairAttempt(retryAttempt) >= scoreExcelPairAttempt(primaryAttempt)
    ? retryAttempt
    : primaryAttempt;
}

async function executeExcelPairAttempt<TPairInput>(
  executor: AnalysisExecutorLike,
  pair: TPairInput,
  options: ExcelPairAnalysisOptions<TPairInput>,
  globalUnderstandingSummary: string
): Promise<ExcelPairAttemptResult> {
  try {
    const pairResponse = await executor.analyze(
      options.buildPairPayload(pair, options.documentType, options.templateType, globalUnderstandingSummary)
    );
    const pairSuggestions = options.normalizePairSuggestions(pair, pairResponse);
    const quality = options.evaluatePairAttempt(
      pair,
      pairSuggestions,
      pairResponse.contextAnalysis as Record<string, unknown> | undefined
    );

    return {
      pairSuggestions,
      aiCallSucceeded: true,
      promptDebugSummary: pairResponse.contextAnalysis?.promptDebugSummary
        ? String(pairResponse.contextAnalysis.promptDebugSummary)
        : undefined,
      promptRequestText: pairResponse.contextAnalysis?.promptRequestText
        ? String(pairResponse.contextAnalysis.promptRequestText)
        : undefined,
      rawAiResponse: pairResponse.contextAnalysis?.rawAiResponse
        ? String(pairResponse.contextAnalysis.rawAiResponse)
        : undefined,
      salvagedMalformedJson: quality.salvagedMalformedJson,
      qualityIssues: quality.qualityIssues,
      needsRetry: quality.needsRetry,
    };
  } catch (error) {
    return {
      pairSuggestions: [],
      aiCallSucceeded: false,
      error: options.toErrorInfo(error),
      salvagedMalformedJson: false,
      qualityIssues: ['request-failed'],
      needsRetry: true,
    };
  }
}

export async function analyzeExcelPairWorkflow<TPairInput>(
  options: ExcelPairAnalysisOptions<TPairInput>
): Promise<{
  suggestions: AISuggestion[];
  contextAnalysis: Record<string, unknown>;
}> {
  const pairResults: Array<Record<string, unknown>> = [];
  let globalUnderstandingSummary = '全局真实数据理解暂不可用，按当前对照组局部分析。';
  let globalUnderstandingUsedAI = false;
  let usedCachedGlobalUnderstanding = false;
  let globalPromptDebugSummary: string | undefined;
  let globalPromptRequestText: string | undefined;
  let globalRawAiResponse: string | undefined;
  let globalUnderstandingError: Record<string, unknown> | undefined;

  if (options.excelGlobalUnderstandingCache?.summary) {
    globalUnderstandingSummary = options.excelGlobalUnderstandingCache.summary;
    usedCachedGlobalUnderstanding = true;
    globalPromptRequestText = options.excelGlobalUnderstandingCache.promptRequestText;
    globalPromptDebugSummary = options.excelGlobalUnderstandingCache.promptDebugSummary;
    globalRawAiResponse = options.excelGlobalUnderstandingCache.rawAiResponse;
  } else if (options.globalDataDocumentIR.elements.length > 0) {
    const globalUnderstandingPayload = {
      host: 'excel' as const,
      documentIR: options.globalDataDocumentIR,
      documentContent: serializeDocument(options.globalDataDocumentIR),
      documentType: options.documentType,
      templateType: options.templateType,
      context: buildExcelGlobalUnderstandingContext(options.globalDataDocumentIR, options.templateType),
      analysisStage: 'excel-global-understanding' as const,
    };

    try {
      const globalResponse = await options.executor.analyze(globalUnderstandingPayload);
      globalUnderstandingSummary = buildExcelGlobalUnderstandingSummary(globalResponse);
      globalUnderstandingUsedAI = true;
      globalPromptDebugSummary = globalResponse.contextAnalysis?.promptDebugSummary
        ? String(globalResponse.contextAnalysis.promptDebugSummary)
        : undefined;
      globalPromptRequestText = globalResponse.contextAnalysis?.promptRequestText
        ? String(globalResponse.contextAnalysis.promptRequestText)
        : undefined;
      globalRawAiResponse = globalResponse.contextAnalysis?.rawAiResponse
        ? String(globalResponse.contextAnalysis.rawAiResponse)
        : undefined;
    } catch (error) {
      globalUnderstandingSummary = '全局真实数据理解阶段未成功调用 AI，后续对照组分析将仅依赖局部差异与规则摘要。';
      globalUnderstandingError = options.toErrorInfo(error);
    }
  }

  const remotePairSuggestionsByIndex = new Map<number, AISuggestion[]>();
  const retryExecutor = options.executor.supportsThinking && options.thinking !== true
    ? resolveAnalysisExecutor({
        apiBaseUrl: options.apiBaseUrl,
        useMultiStage: options.useMultiStage,
        requestedKind: options.analysisExecutor,
        thinking: true,
        aiOrchestratorBaseUrl: options.aiOrchestratorBaseUrl,
        aiOrchestratorAuthToken: options.aiOrchestratorAuthToken,
      })
    : options.executor;
  let retriedPairCount = 0;

  for (const pair of options.pairInputs) {
    const firstAttempt = await executeExcelPairAttempt(
      options.executor,
      pair,
      options,
      globalUnderstandingSummary
    );

    let retryAttempt: ExcelPairAttemptResult | undefined;
    if (firstAttempt.needsRetry) {
      retriedPairCount += 1;
      retryAttempt = await executeExcelPairAttempt(
        retryExecutor,
        pair,
        options,
        globalUnderstandingSummary
      );
    }

    const finalAttempt = choosePreferredExcelPairAttempt(firstAttempt, retryAttempt);
    const pairMeta = options.getPairMeta(pair);
    if (finalAttempt.pairSuggestions.length > 0) {
      remotePairSuggestionsByIndex.set(pairMeta.pairIndex, finalAttempt.pairSuggestions);
    }

    pairResults.push({
      pairIndex: pairMeta.pairIndex,
      pairLabel: pairMeta.pairLabel,
      aiCallSucceeded: finalAttempt.aiCallSucceeded,
      candidateCount: pairMeta.candidateCount,
      loopDetected: pairMeta.loopDetected,
      suggestionCount: finalAttempt.pairSuggestions.length,
      promptDebugSummary: finalAttempt.promptDebugSummary,
      promptRequestText: finalAttempt.promptRequestText,
      rawAiResponse: finalAttempt.rawAiResponse,
      error: finalAttempt.error,
      salvagedMalformedJson: finalAttempt.salvagedMalformedJson,
      localRetryCount: retryAttempt ? 1 : 0,
      qualityIssues: finalAttempt.qualityIssues,
    });
  }

  const remotePairSuggestions = Array.from(remotePairSuggestionsByIndex.values()).flat();
  const finalSuggestions = remotePairSuggestions.length > 0
    ? options.dedupeRemoteSuggestions(remotePairSuggestions)
    : options.dedupeHeuristicSuggestions(options.excelHeuristicSuggestions);
  const summary = options.summarizeSuggestionSources(finalSuggestions);
  const succeededPairCount = pairResults.filter((pair) => pair.aiCallSucceeded === true).length;
  const aiCallCompleted = succeededPairCount > 0 || globalUnderstandingUsedAI;

  if (remotePairSuggestions.length === 0 && options.excelHeuristicSuggestions.length > 0) {
    return {
      suggestions: options.excelHeuristicSuggestions,
      contextAnalysis: {
        requestMode: `excel-pair-loop-${options.executor.kind === 'chat' ? 'chat' : options.useMultiStage ? 'multi-stage' : 'direct'}`,
        analysisExecutor: options.executor.kind,
        requestedAnalysisExecutor: options.executor.requestedKind,
        analysisExecutorFallbackReason: options.executor.fallbackReason,
        supportsThinking: options.executor.supportsThinking,
        requestedAI: true,
        aiCallSucceeded: aiCallCompleted,
        usedAI: aiCallCompleted,
        globalUnderstandingUsedAI,
        usedCachedGlobalUnderstanding,
        fallback: aiCallCompleted ? 'excel-heuristic-no-ai-suggestions' : 'excel-heuristic',
        resultSource: 'heuristic',
        sourceCounts: options.summarizeSuggestionSources(options.excelHeuristicSuggestions).sourceCounts,
        pairResults,
        descriptionOrigin:
          aiCallCompleted
            ? 'AI 已完成全局理解或对照组分析，但当前未返回可直接落地的结构化建议，因此结果列表来自 Excel 启发式规则。'
            : 'Excel 启发式规则生成。典型文案如“模板 sheet 留白、数据 sheet 有值，识别为可参数化字段”来自前端成对 sheet 差异识别，不是 AI 返回。',
        pipeline:
          options.excelGlobalUnderstandingCache?.summary
            ? '本次参数识别复用已缓存的全局文档理解结果，再逐个对照组调用 AI；当前未产出可直接落地的结构化建议，因此展示启发式建议。'
            : aiCallCompleted
              ? 'Office API 先读取全部参与分析的真实数据 sheet 做全局理解，再逐个对照组调用 AI；本次 AI 调用已成功完成，但未产出结构化建议，因此当前展示启发式建议。'
              : 'Office API 先读取全部参与分析的真实数据 sheet 做全局理解，再逐个对照组调用 AI；本次 AI 未成功返回对照组结果，因此回退为启发式建议。',
        promptDebugSummary: globalPromptDebugSummary,
        promptRequestText: globalPromptRequestText,
        rawAiResponse: globalRawAiResponse,
        globalUnderstandingError,
      },
    };
  }

  return {
    suggestions: finalSuggestions,
    contextAnalysis: {
      requestMode: `excel-pair-loop-${options.executor.kind === 'chat' ? 'chat' : options.useMultiStage ? 'multi-stage' : 'direct'}`,
      analysisExecutor: options.executor.kind,
      requestedAnalysisExecutor: options.executor.requestedKind,
      analysisExecutorFallbackReason: options.executor.fallbackReason,
      supportsThinking: options.executor.supportsThinking,
      requestedAI: true,
      aiCallSucceeded: succeededPairCount > 0 || globalUnderstandingUsedAI,
      usedAI: succeededPairCount > 0,
      globalUnderstandingUsedAI,
      usedCachedGlobalUnderstanding,
      resultSource: summary.resultSource,
      sourceCounts: summary.sourceCounts,
      pairResults,
      retriedPairCount,
      succeededPairCount,
      totalPairCount: options.pairInputs.length,
      descriptionOrigin:
        remotePairSuggestions.length > 0
          ? '当前结果优先使用逐对照组 AI 返回；由于本次已产出 AI 建议，启发式结果不再混入最终列表。'
          : '当前建议主要来自 Excel 启发式兜底结果。',
      pipeline:
        options.excelGlobalUnderstandingCache?.summary
          ? '本次参数识别复用已缓存的全局文档理解结果；随后对每个对照组单独传递全局理解、差异摘要和当前业务摘录，循环生成 suggestions。'
          : 'Office API 先读取全部参与分析的真实数据 sheet，生成整份工作簿的自然语言理解；再对每个对照组单独传递全局理解、差异摘要和当前业务摘录，循环生成 suggestions。',
      globalUnderstandingSummary,
      promptDebugSummary: globalPromptDebugSummary,
      promptRequestText: globalPromptRequestText,
      rawAiResponse: globalRawAiResponse,
      globalUnderstandingError,
    },
  };
}
