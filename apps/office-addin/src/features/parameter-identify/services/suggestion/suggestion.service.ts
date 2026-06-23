import { HostAdapter } from '../../../../host/adapters';
import { resolveAnalysisExecutor } from '../analysis-executor';
import type {
  AnalyzeDocumentOptions,
  AnalyzeDocumentResult,
} from '../identify/common/identify.types';
import {
  analyzeExcelDocumentWithAI,
  analyzeExcelWorkbookUnderstanding,
} from './suggestion.service.excel';
import {
  annotateSuggestionSource,
  summarizeSuggestionSources,
} from '../identify/excel/excel-suggestion-merge';
import { enrichWordSuggestionAnchors } from '../identify/word/word-anchor-enricher';
import { buildAnalyzeRequestPayload } from './suggestion.service.shared';

export async function analyzeDocumentWithAI(
  adapter: HostAdapter,
  options: AnalyzeDocumentOptions
): Promise<AnalyzeDocumentResult> {
  const documentIR = await adapter.extractDocument();
  const requestPayload = buildAnalyzeRequestPayload(adapter, options, documentIR);

  const executor = resolveAnalysisExecutor({
    apiBaseUrl: options.apiBaseUrl,
    useMultiStage: options.useMultiStage,
    requestedKind: options.analysisExecutor,
    thinking: options.thinking,
    aiOrchestratorBaseUrl: (options as AnalyzeDocumentOptions & { aiOrchestratorBaseUrl?: string })
      .aiOrchestratorBaseUrl,
    aiOrchestratorAuthToken: (
      options as AnalyzeDocumentOptions & { aiOrchestratorAuthToken?: string }
    ).aiOrchestratorAuthToken,
  });
  const requestMode =
    executor.kind === 'chat' ? 'chat' : options.useMultiStage ? 'multi-stage' : 'direct';

  if (adapter.host === 'excel') {
    const excelResult = await analyzeExcelDocumentWithAI({
      documentIR,
      documentType: 'xlsx',
      options,
      executor,
    });

    return {
      documentIR,
      suggestions: excelResult.suggestions,
      contextAnalysis: excelResult.contextAnalysis,
    };
  }

  let response;

  try {
    response = await executor.analyze(requestPayload);
  } catch (error) {
    throw error;
  }

  const remoteSuggestions = annotateSuggestionSource(
    response.rawSuggestions || response.suggestions,
    'ai'
  );
  const finalSuggestions =
    adapter.host === 'word'
      ? enrichWordSuggestionAnchors(documentIR, remoteSuggestions)
      : remoteSuggestions;
  const summary = summarizeSuggestionSources(finalSuggestions);

  return {
    documentIR,
    suggestions: finalSuggestions,
    templateConfig: response.templateConfig,
    contextAnalysis: {
      ...(response.contextAnalysis as Record<string, unknown> | undefined),
      requestMode,
      analysisExecutor: executor.kind,
      requestedAnalysisExecutor: executor.requestedKind,
      analysisExecutorFallbackReason: executor.fallbackReason,
      supportsThinking: executor.supportsThinking,
      requestedAI: true,
      aiCallSucceeded: true,
      usedAI: response.contextAnalysis?.usedAI ?? true,
      resultSource: summary.resultSource,
      sourceCounts: summary.sourceCounts,
      descriptionOrigin: '当前建议主要来自后端 AI 返回。',
    },
  };
}

export { analyzeExcelWorkbookUnderstanding, enrichWordSuggestionAnchors };
