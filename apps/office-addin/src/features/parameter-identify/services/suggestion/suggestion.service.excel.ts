import { DocumentIR } from '../../../../host/adapters/document-ir';
import type { StructuredAnalysisExecutor } from '../analysis-executor';
import type { AnalyzeDocumentOptions } from '../identify/common/identify.types';
import {
  analyzeExcelWorkbookUnderstanding,
  buildExcelGlobalDataDocumentIR,
} from '../identify/excel/excel-global-understanding';
import { buildExcelHeuristicSuggestions } from '../identify/excel/excel-heuristic';
import {
  buildExcelPairAnalysisInputs,
  buildExcelPairPayload,
} from '../identify/excel/excel-pair-analysis.helpers';
import { analyzeExcelPairWorkflow } from '../identify/excel/excel-pair-analysis';
import {
  annotateSuggestionSource,
  buildExcelColumnMappingsForTable,
  dedupeExcelArraySuggestions,
  evaluateExcelPairAttempt,
  expandExcelLoopColumnSuggestions,
  normalizeExcelPairSuggestions,
  summarizeSuggestionSources,
} from '../identify/excel/excel-suggestion-merge';
import { toErrorInfo } from './suggestion.service.shared';

interface AnalyzeExcelDocumentOptions {
  documentIR: DocumentIR;
  documentType: 'xlsx';
  options: AnalyzeDocumentOptions;
  executor: StructuredAnalysisExecutor;
}

export async function analyzeExcelDocumentWithAI({
  documentIR,
  documentType,
  options,
  executor,
}: AnalyzeExcelDocumentOptions): Promise<{
  suggestions: ReturnType<typeof annotateSuggestionSource>;
  contextAnalysis: Record<string, unknown> | undefined;
}> {
  const excelHeuristicSuggestions = annotateSuggestionSource(
    buildExcelHeuristicSuggestions(documentIR, {
      buildExcelColumnMappingsForTable,
    }),
    'heuristic'
  );
  const pairInputs = buildExcelPairAnalysisInputs(documentIR);
  const globalDataDocumentIR = buildExcelGlobalDataDocumentIR(documentIR);
  const excelResult = await analyzeExcelPairWorkflow({
    documentIR,
    documentType,
    templateType: options.templateType,
    apiBaseUrl: options.apiBaseUrl,
    useMultiStage: options.useMultiStage,
    analysisExecutor: options.analysisExecutor,
    thinking: options.thinking,
    aiOrchestratorBaseUrl: options.aiOrchestratorBaseUrl,
    aiOrchestratorAuthToken: options.aiOrchestratorAuthToken,
    excelGlobalUnderstandingCache: options.excelGlobalUnderstandingCache,
    executor,
    pairInputs,
    globalDataDocumentIR,
    excelHeuristicSuggestions,
    buildPairPayload: buildExcelPairPayload,
    normalizePairSuggestions: normalizeExcelPairSuggestions,
    evaluatePairAttempt: evaluateExcelPairAttempt,
    summarizeSuggestionSources,
    dedupeRemoteSuggestions: dedupeExcelArraySuggestions,
    dedupeHeuristicSuggestions: (suggestions) =>
      dedupeExcelArraySuggestions(expandExcelLoopColumnSuggestions(suggestions)),
    toErrorInfo,
    getPairMeta: (pair) => ({
      pairIndex: pair.pairIndex,
      pairLabel: pair.pairLabel,
      candidateCount: pair.candidateCount,
      loopDetected: pair.loopDetected,
    }),
  });

  return {
    suggestions: excelResult.suggestions,
    contextAnalysis: excelResult.contextAnalysis as Record<string, unknown> | undefined,
  };
}

export { analyzeExcelWorkbookUnderstanding };
