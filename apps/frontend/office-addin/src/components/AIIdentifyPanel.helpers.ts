import { AISuggestion } from '../taskpane/store';
import { analyzeDocumentWithAI } from '../services/suggestion-service';

export interface AnalysisSummary {
  requestedAI: boolean;
  aiCallSucceeded: boolean;
  usedAI: boolean;
  usedCachedGlobalUnderstanding?: boolean;
  salvagedMalformedJson?: boolean;
  requestMode: string;
  resultSource: string;
  analysisExecutor: string;
  requestedAnalysisExecutor: string;
  analysisExecutorFallbackReason?: string;
  supportsThinking: boolean;
  fallback?: string;
  aiServiceUrl?: string;
  sourceCounts: Record<string, number>;
  descriptionOrigin?: string;
  pipeline?: string;
  globalUnderstandingSummary?: string;
  promptDebugSummary?: string;
  promptRequestText?: string;
  rawAiResponse?: string;
  globalUnderstandingError?: {
    message?: string;
    reason?: string;
    url?: string;
    status?: number;
  };
  pairResults: Array<{
    pairIndex: number;
    pairLabel: string;
    aiCallSucceeded: boolean;
    candidateCount: number;
    loopDetected: boolean;
    suggestionCount: number;
    promptDebugSummary?: string;
    promptRequestText?: string;
    rawAiResponse?: string;
    error?: {
      message?: string;
      reason?: string;
      url?: string;
      status?: number;
    };
  }>;
}

function inferSourceCounts(suggestions: AISuggestion[]): Record<string, number> {
  return suggestions.reduce<Record<string, number>>((counts, suggestion) => {
    const source = suggestion.details?.source || 'unknown';
    counts[source] = (counts[source] || 0) + 1;
    return counts;
  }, {});
}

export function buildAnalysisSummary(result: Awaited<ReturnType<typeof analyzeDocumentWithAI>>): AnalysisSummary {
  const contextAnalysis = result.contextAnalysis || {};
  const sourceCounts =
    (contextAnalysis.sourceCounts as Record<string, number> | undefined) ||
    inferSourceCounts(result.suggestions);

  return {
    requestedAI: Boolean(contextAnalysis.requestedAI ?? true),
    aiCallSucceeded: Boolean(contextAnalysis.aiCallSucceeded ?? true),
    usedAI: Boolean(contextAnalysis.usedAI ?? true),
    usedCachedGlobalUnderstanding: Boolean(contextAnalysis.usedCachedGlobalUnderstanding ?? false),
    salvagedMalformedJson: Boolean(contextAnalysis.salvagedMalformedJson ?? false),
    requestMode: String(contextAnalysis.requestMode || 'unknown'),
    resultSource: String(contextAnalysis.resultSource || 'unknown'),
    analysisExecutor: String(contextAnalysis.analysisExecutor || 'studio'),
    requestedAnalysisExecutor: String(contextAnalysis.requestedAnalysisExecutor || contextAnalysis.analysisExecutor || 'studio'),
    analysisExecutorFallbackReason: contextAnalysis.analysisExecutorFallbackReason
      ? String(contextAnalysis.analysisExecutorFallbackReason)
      : undefined,
    supportsThinking: Boolean(contextAnalysis.supportsThinking ?? false),
    fallback: contextAnalysis.fallback ? String(contextAnalysis.fallback) : undefined,
    aiServiceUrl: contextAnalysis.aiServiceUrl ? String(contextAnalysis.aiServiceUrl) : undefined,
    sourceCounts,
    descriptionOrigin: contextAnalysis.descriptionOrigin
      ? String(contextAnalysis.descriptionOrigin)
      : undefined,
    pipeline: contextAnalysis.pipeline ? String(contextAnalysis.pipeline) : undefined,
    globalUnderstandingSummary: contextAnalysis.globalUnderstandingSummary
      ? String(contextAnalysis.globalUnderstandingSummary)
      : undefined,
    promptDebugSummary: contextAnalysis.promptDebugSummary
      ? String(contextAnalysis.promptDebugSummary)
      : undefined,
    promptRequestText: contextAnalysis.promptRequestText
      ? String(contextAnalysis.promptRequestText)
      : undefined,
    rawAiResponse: contextAnalysis.rawAiResponse
      ? String(contextAnalysis.rawAiResponse)
      : undefined,
    globalUnderstandingError:
      contextAnalysis.globalUnderstandingError && typeof contextAnalysis.globalUnderstandingError === 'object'
        ? {
            message: (contextAnalysis.globalUnderstandingError as Record<string, unknown>).message
              ? String((contextAnalysis.globalUnderstandingError as Record<string, unknown>).message)
              : undefined,
            reason: (contextAnalysis.globalUnderstandingError as Record<string, unknown>).reason
              ? String((contextAnalysis.globalUnderstandingError as Record<string, unknown>).reason)
              : undefined,
            url: (contextAnalysis.globalUnderstandingError as Record<string, unknown>).url
              ? String((contextAnalysis.globalUnderstandingError as Record<string, unknown>).url)
              : undefined,
            status: (contextAnalysis.globalUnderstandingError as Record<string, unknown>).status
              ? Number((contextAnalysis.globalUnderstandingError as Record<string, unknown>).status)
              : undefined,
          }
        : undefined,
    pairResults: Array.isArray(contextAnalysis.pairResults)
      ? (contextAnalysis.pairResults as Array<Record<string, unknown>>).map((pair) => ({
          pairIndex: Number(pair.pairIndex ?? -1),
          pairLabel: String(pair.pairLabel || ''),
          aiCallSucceeded: Boolean(pair.aiCallSucceeded),
          candidateCount: Number(pair.candidateCount ?? 0),
          loopDetected: Boolean(pair.loopDetected),
          suggestionCount: Number(pair.suggestionCount ?? 0),
          promptDebugSummary: pair.promptDebugSummary ? String(pair.promptDebugSummary) : undefined,
          promptRequestText: pair.promptRequestText ? String(pair.promptRequestText) : undefined,
          rawAiResponse: pair.rawAiResponse ? String(pair.rawAiResponse) : undefined,
          error:
            pair.error && typeof pair.error === 'object'
              ? {
                  message: (pair.error as Record<string, unknown>).message
                    ? String((pair.error as Record<string, unknown>).message)
                    : undefined,
                  reason: (pair.error as Record<string, unknown>).reason
                    ? String((pair.error as Record<string, unknown>).reason)
                    : undefined,
                  url: (pair.error as Record<string, unknown>).url
                    ? String((pair.error as Record<string, unknown>).url)
                    : undefined,
                  status: (pair.error as Record<string, unknown>).status
                    ? Number((pair.error as Record<string, unknown>).status)
                    : undefined,
                }
              : undefined,
        }))
      : [],
  };
}

function getExcelSuggestionSheetNames(suggestion: AISuggestion): string[] {
  const names = new Set<string>();
  const anchorSheetName = suggestion.details?.excelAnchor?.sheetName?.trim();
  if (anchorSheetName) {
    names.add(anchorSheetName);
  }

  const chapter = suggestion.details?.chapter?.trim();
  if (chapter) {
    names.add(chapter);
  }

  const displayPosition = suggestion.details?.displayPosition || suggestion.elementPath || '';
  const match = displayPosition.match(/^(.+?)![A-Z]+\d+(?::[A-Z]+\d+)?$/i);
  if (match?.[1]) {
    names.add(match[1].trim());
  }

  return Array.from(names);
}

function suggestionBelongsToExcelPair(suggestion: AISuggestion, pair: AnalysisSummary['pairResults'][number]): boolean {
  const anchorPairIndex = suggestion.details?.excelAnchor?.pairIndex;
  if (typeof anchorPairIndex === 'number') {
    return anchorPairIndex === pair.pairIndex;
  }

  const sheetNames = getExcelSuggestionSheetNames(suggestion);
  if (sheetNames.length === 0) {
    return false;
  }

  const pairSheetNames = pair.pairLabel
    .split('↔')
    .map((value) => value.trim())
    .filter(Boolean);

  return sheetNames.some((sheetName) => pairSheetNames.includes(sheetName));
}

function collectProcessedExcelSheetNames(
  summary: AnalysisSummary,
  nextSuggestions: AISuggestion[]
): string[] {
  const names = new Set<string>();

  summary.pairResults
    .filter((pair) => pair.pairIndex >= 0)
    .forEach((pair) => {
      pair.pairLabel
        .split('↔')
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((sheetName) => names.add(sheetName));
    });

  nextSuggestions.forEach((suggestion) => {
    getExcelSuggestionSheetNames(suggestion).forEach((sheetName) => names.add(sheetName));
  });

  return Array.from(names);
}

export function mergeExcelSuggestionsByPairResult(
  previousSuggestions: AISuggestion[],
  nextSuggestions: AISuggestion[],
  summary: AnalysisSummary
): AISuggestion[] {
  if (summary.pairResults.length === 0) {
    return nextSuggestions;
  }

  const processedPairs = summary.pairResults.filter((pair) => pair.pairIndex >= 0);
  const processedSheetNames = collectProcessedExcelSheetNames(summary, nextSuggestions);
  const preservedSuggestions = previousSuggestions.filter(
    (suggestion) => {
      if (processedPairs.some((pair) => suggestionBelongsToExcelPair(suggestion, pair))) {
        return false;
      }
      const suggestionSheetNames = getExcelSuggestionSheetNames(suggestion);
      if (suggestionSheetNames.some((sheetName) => processedSheetNames.includes(sheetName))) {
        return false;
      }
      return true;
    }
  );

  return [...preservedSuggestions, ...nextSuggestions];
}

export function countPreservedExcelSuggestions(
  previousSuggestions: AISuggestion[],
  summary: AnalysisSummary
): number {
  if (summary.pairResults.length === 0) {
    return 0;
  }

  const processedPairs = summary.pairResults.filter((pair) => pair.pairIndex >= 0);
  const processedSheetNames = collectProcessedExcelSheetNames(summary, []);
  return previousSuggestions.filter(
    (suggestion) => {
      if (processedPairs.some((pair) => suggestionBelongsToExcelPair(suggestion, pair))) {
        return false;
      }
      const suggestionSheetNames = getExcelSuggestionSheetNames(suggestion);
      if (suggestionSheetNames.some((sheetName) => processedSheetNames.includes(sheetName))) {
        return false;
      }
      return true;
    }
  ).length;
}
