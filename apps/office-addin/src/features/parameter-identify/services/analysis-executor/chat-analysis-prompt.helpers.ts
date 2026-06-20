import { buildPairAnalysisChatPrompt } from '../analysis-pair-prompt/excel';
import { buildWordSectionAnalysisChatPrompt } from '../analysis-pair-prompt/word';
import {
  buildGeneralPromptTemplate,
  buildGlobalUnderstandingPromptTemplate,
} from './chat-analysis-prompt-templates';
import type { StructuredAnalyzeRequest } from './types';
import {
  buildCompactDocumentContext,
  buildExcelBusinessExcerpt,
  buildExcelVisibleSheetSummary,
  truncateText,
} from './chat-analysis-suggestion.helpers';

function buildGlobalUnderstandingChatPrompt(request: StructuredAnalyzeRequest): string {
  const visibleSheetSummary = buildExcelVisibleSheetSummary(request.documentIR, 'all');
  const businessExcerpt = buildExcelBusinessExcerpt(request.documentIR, 'all').slice(0, 5000);
  return buildGlobalUnderstandingPromptTemplate({
    host: request.host,
    documentType: request.documentType,
    context: request.context,
    visibleSheetSummary,
    businessExcerpt,
  });
}

function buildGeneralChatPrompt(request: StructuredAnalyzeRequest): string {
  const compactDocumentContext = buildCompactDocumentContext(request);
  const serializedContent = String(request.documentContent || '').slice(0, 8000);
  return buildGeneralPromptTemplate({
    host: request.host,
    documentType: request.documentType,
    templateType: request.templateType,
    context: request.context,
    compactDocumentContext,
    serializedContent,
  });
}

export function buildChatAnalysisPrompt(request: StructuredAnalyzeRequest): string {
  if (request.analysisStage === 'excel-global-understanding') {
    return buildGlobalUnderstandingChatPrompt(request);
  }

  if (request.analysisStage === 'excel-pair-analysis') {
    return buildPairAnalysisChatPrompt(request);
  }

  if (request.analysisStage === 'word-section-analysis') {
    return buildWordSectionAnalysisChatPrompt(request);
  }

  return buildGeneralChatPrompt(request);
}

export function buildPromptDebugSummary(request: StructuredAnalyzeRequest): string {
  const excelVisibleSheets =
    request.host === 'excel'
      ? truncateText(buildExcelVisibleSheetSummary(request.documentIR, 'all'), 800)
      : undefined;
  const contentExcerpt =
    request.host === 'excel'
      ? truncateText(
          buildExcelBusinessExcerpt(
            request.documentIR,
            request.analysisStage === 'excel-global-understanding' ? 'all' : 'all'
          )
            .replace(/\s+/g, ' ')
            .trim(),
          1000
        )
      : truncateText(
          String(request.documentContent || '')
            .replace(/\s+/g, ' ')
            .trim(),
          600
        );
  const lines = [
    `stage=${request.analysisStage || 'general'}`,
    request.pairLabel ? `pair=${request.pairLabel}` : undefined,
    request.globalUnderstandingSummary
      ? `global=${truncateText(request.globalUnderstandingSummary, 220)}`
      : undefined,
    request.diffSummary ? `diff=${truncateText(request.diffSummary, 220)}` : undefined,
    excelVisibleSheets ? `sheets=${excelVisibleSheets}` : undefined,
    contentExcerpt ? `content=${contentExcerpt}` : undefined,
  ].filter(Boolean);

  return lines.join('\n');
}
