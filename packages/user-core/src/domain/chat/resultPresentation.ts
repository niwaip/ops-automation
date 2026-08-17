import type { NormalizedChatExecutionResult } from '../../types/chat.types.js';
import type { NormalizedExecutionResult } from '../../types/execution.types.js';
import { normalizeWorkflowExecutionResult } from '../executions/result.js';

export interface ChatOutcomePresentationInput {
  finalResult?: string;
  finalSummary?: string;
  normalizedResult?: NormalizedChatExecutionResult;
  rawResult?: unknown;
}

export interface ChatOutcomePresentation {
  normalizedResult?: NormalizedChatExecutionResult | NormalizedExecutionResult;
  primaryText?: string;
  structuredData?: unknown;
  structuredText?: string;
  hasBusinessResult: boolean;
}

const nonEmpty = (value?: string): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const comparable = (value?: string): string =>
  String(value || '')
    .replace(/\s+/g, '')
    .replace(/[。.!！]+$/g, '')
    .toLowerCase();

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export const isCompletionOnlyResultText = (value?: string, title?: string): boolean => {
  const normalized = comparable(value);
  if (!normalized) {
    return false;
  }

  const genericMessages = new Set([
    '任务已完成',
    '任务完成',
    '工作流已完成',
    'workflowcompleted',
  ]);
  if (genericMessages.has(normalized)) {
    return true;
  }

  const normalizedTitle = comparable(title);
  return Boolean(normalizedTitle && normalized === `${normalizedTitle}已完成`);
};

const stringifyStructuredData = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return nonEmpty(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

/**
 * Resolve a task card from the standard Workflow result contract. This also rebuilds the
 * normalized view for historical chat messages that persisted only the raw result envelope.
 */
export const resolveChatOutcomePresentation = (
  input: ChatOutcomePresentationInput
): ChatOutcomePresentation => {
  const normalizedResult =
    input.normalizedResult ||
    (input.rawResult !== undefined && input.rawResult !== null
      ? normalizeWorkflowExecutionResult(input.rawResult)
      : undefined);
  const structuredData = normalizedResult?.structuredData;
  const title = normalizedResult?.title;
  const envelope = asRecord(normalizedResult?.envelope);
  const presentation = asRecord(envelope?.presentation);
  const textCandidates = [
    typeof presentation?.chatSummary === 'string' ? presentation.chatSummary : undefined,
    normalizedResult?.summary,
    normalizedResult?.detailText,
    normalizedResult?.body,
    input.finalResult,
    input.finalSummary,
  ]
    .map(nonEmpty)
    .filter((value): value is string => Boolean(value));
  const primaryText = textCandidates.find(
    (value) => !isCompletionOnlyResultText(value, title)
  );
  const structuredText = stringifyStructuredData(structuredData);
  const hasBusinessResult = Boolean(
    normalizedResult?.hasBusinessResult || primaryText || structuredText
  );

  return {
    normalizedResult,
    primaryText: primaryText || structuredText,
    structuredData,
    structuredText,
    hasBusinessResult,
  };
};
