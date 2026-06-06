import type { AISuggestion } from '../../../../app/store';
import type { AnalysisSummary } from '../AIIdentifyPanel.helpers';

const LOW_QUALITY_SUGGESTION_NAME_PATTERN =
  /^(?:d\.)?(?:[A-Za-z_][A-Za-z0-9_]*\[\]\.)?(field\d*|textValue|textField\d*|value\d*|var\d*|param\d*|undefined|null|unknown)$/i;

export function buildCollapsedSuggestionGroups(
  suggestions: AISuggestion[],
  hostKind: 'word' | 'excel'
): Record<string, boolean> {
  const nextCollapsed: Record<string, boolean> = {};
  suggestions.forEach((suggestion) => {
    const groupName = hostKind === 'excel'
      ? suggestion.details?.excelAnchor?.sheetName || suggestion.details?.chapter || '未归属 Sheet'
      : suggestion.details?.chapter || '正文';
    nextCollapsed[groupName] = true;
  });
  return nextCollapsed;
}

export function buildCollapsedPairDetails(summary: AnalysisSummary | null): Record<string, boolean> {
  const nextCollapsedPairs: Record<string, boolean> = {};
  summary?.pairResults.forEach((pair) => {
    nextCollapsedPairs[pair.pairIndex] = true;
  });
  return nextCollapsedPairs;
}

export function shouldRetryIdentify(summary: AnalysisSummary, suggestions: AISuggestion[]): boolean {
  return Boolean(summary.salvagedMalformedJson) || suggestions.some((suggestion) => {
    const normalizedName = String(suggestion.suggestedName || '').replace(/[{}]/g, '').trim();
    return suggestion.confidence < 0.8 || LOW_QUALITY_SUGGESTION_NAME_PATTERN.test(normalizedName);
  });
}

export function buildIdentifyDebugDetails(
  summary: AnalysisSummary,
  contextAnalysis: Record<string, unknown> | undefined,
  suggestionCount: number
): string {
  const pairPrompts = summary.pairResults
    .filter((pair) => pair.promptRequestText)
    .map((pair) => `【对照组: ${pair.pairLabel}】\n${pair.promptRequestText}`)
    .join('\n\n');
  const pairResponses = summary.pairResults
    .filter((pair) => pair.rawAiResponse)
    .map((pair) => `【对照组: ${pair.pairLabel}】\n${pair.rawAiResponse}`)
    .join('\n\n');
  const finalPrompt = pairPrompts || String(contextAnalysis?.promptRequestText || '未记录请求原文');
  const finalResponse = pairResponses || String(contextAnalysis?.rawAiResponse || '未记录原始返回');

  return [
    '【识别摘要】',
    `识别到 ${suggestionCount} 个参数。`,
    '',
    '【发送给 AI 的请求原文】',
    finalPrompt,
    '',
    '【AI 原始返回】',
    finalResponse,
  ].join('\n');
}

export function formatIdentifyError(error: any): {
  errorMessage: string;
  errorDetails: string;
} {
  const errorMessage = error?.message || 'AI 分析失败';
  const responseStatus = error?.response?.status;
  const responseData = error?.response?.data;
  const requestMethod = String(error?.config?.method || 'post').toUpperCase();
  const requestUrl = error?.config?.url || '';
  const backendMessage = typeof responseData === 'string'
    ? responseData
    : responseData?.message || responseData?.error || '';
  const serializedResponse = responseData
    ? (typeof responseData === 'string' ? responseData : JSON.stringify(responseData, null, 2))
    : '';

  return {
    errorMessage,
    errorDetails: [
      responseStatus ? `状态码: ${responseStatus}` : null,
      requestUrl ? `请求: ${requestMethod} ${requestUrl}` : null,
      backendMessage ? `后端消息: ${backendMessage}` : null,
      serializedResponse ? `响应体:\n${serializedResponse}` : null,
      !responseStatus ? `请求配置错误: ${errorMessage}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}
