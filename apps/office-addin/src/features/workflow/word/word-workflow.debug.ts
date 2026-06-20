import type { TemplateUnderstandResponse } from '../../../api/carbone-api';
import type { AISuggestion } from '../../../app/store';

export function buildWordUnderstandingSummaryText(
  result: TemplateUnderstandResponse | null
): string {
  if (!result) {
    return '全篇文档理解结果暂不可用，请仅基于当前章节候选生成参数。';
  }

  if (result.summary.understandingSummaryText) {
    return result.summary.understandingSummaryText;
  }

  const { languageProfile, summary } = result;
  const targetLanguages =
    languageProfile.targetLanguages.length > 0
      ? languageProfile.targetLanguages.join('、')
      : '无目标语言';
  const sectionText =
    summary.sectionHints.length > 0
      ? `主要章节包括 ${summary.sectionHints.slice(0, 6).join('、')}`
      : '当前未提取到明确章节标题';
  const layoutText =
    summary.layoutFeatures.length > 0
      ? `版式特征判断为 ${summary.layoutFeatures.join('、')}`
      : '版式特征仍以基础结构判断为主';

  return [
    summary.sampleFileName
      ? `系统已结合模板与参考示例文件《${summary.sampleFileName}》完成整篇理解。`
      : '系统已结合当前模板与参考示例文件完成整篇理解。',
    `当前按 ${languageProfile.sourceLanguage} 作为源语言，目标语言为 ${targetLanguages}。`,
    `文档结构上识别到 ${summary.paragraphCount} 个段落、${summary.tableCount} 个表格，${sectionText}。`,
    `${layoutText}。`,
  ].join('');
}

export function buildSuggestionGroupSummary(groupSuggestions: AISuggestion[]) {
  const total = groupSuggestions.length;
  const pendingReviewCount = groupSuggestions.filter(
    (suggestion) => suggestion.details?.needsReview
  ).length;
  const highRiskCount = groupSuggestions.filter(
    (suggestion) => suggestion.details?.riskLevel === 'high'
  ).length;
  const matchedTermCount = groupSuggestions.filter(
    (suggestion) => suggestion.details?.termMatchStatus === 'matched'
  ).length;
  const averageConfidence =
    total > 0
      ? groupSuggestions.reduce((sum, suggestion) => sum + suggestion.confidence, 0) / total
      : 0;

  return {
    total,
    pendingReviewCount,
    highRiskCount,
    matchedTermCount,
    averageConfidence,
  };
}

export function buildUnderstandingDebugText(
  result: TemplateUnderstandResponse,
  fallbackNarrative: string
): string {
  return [
    '【理解摘要】',
    result.summary.understandingSummaryText ||
      fallbackNarrative ||
      result.summary.documentTitle ||
      '已生成整体理解结果',
    '',
    '【发送给 AI 的请求原文】',
    result.contextAnalysis?.promptRequestText || '无',
    '',
    '【AI 原始返回】',
    result.contextAnalysis?.rawAiResponse || '无',
  ].join('\n');
}

export function buildPromptTraceDebugText(
  promptRequestText?: string,
  rawAiResponse?: string
): string {
  return [
    '【发送给 AI 的完整提示词】',
    promptRequestText || '无',
    '',
    '【AI 完整原始返回】',
    rawAiResponse || '无',
  ].join('\n');
}
