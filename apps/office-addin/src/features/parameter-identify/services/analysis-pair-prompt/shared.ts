import type { StructuredAnalyzeRequest } from '../analysis-executor';

export function buildPromptShortContext(request: StructuredAnalyzeRequest): string {
  return String(request.globalUnderstandingSummary || '')
    .split('\n')
    .filter((line) => line.trim().length > 0 && !line.includes('##'))[0] || '未提供';
}
