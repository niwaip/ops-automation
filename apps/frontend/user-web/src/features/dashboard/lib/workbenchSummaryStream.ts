import type { StreamEvent } from '@ops/user-core';

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const asTrimmedString = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

export const extractWorkbenchSummaryContentFromEvent = (
  event: Pick<StreamEvent, 'content' | 'data'>,
  reducedContentCandidates: Array<string | undefined> = []
): string => {
  const data = asRecord(event.data);
  const normalizedResult = asRecord(data?.normalizedResult);
  const actionInput = asRecord(data?.actionInput);

  // 候选顺序：当前事件的内容字段优先，已累积的 currentContent 作为兜底。
  // 聊天模式下 OBSERVATION 携带累积可见内容、RESULT 携带完整答案，
  // 必须让它们覆盖上一轮的 "正在思考..." 前缀，否则最终总结会卡在前缀上。
  const candidates = [
    asTrimmedString(actionInput?.answer),
    asTrimmedString(actionInput?.finalAnswer),
    asTrimmedString(actionInput?.output),
    asTrimmedString(data?.resultSummary),
    asTrimmedString(data?.resultTitle),
    asTrimmedString(data?.failureReason),
    asTrimmedString(normalizedResult?.detailText),
    asTrimmedString(normalizedResult?.body),
    asTrimmedString(normalizedResult?.summary),
    asTrimmedString(normalizedResult?.output),
    asTrimmedString(event.content),
    ...reducedContentCandidates,
  ];

  return (
    candidates.find((value): value is string => typeof value === 'string' && value.length > 0) || ''
  );
};

export const reduceWorkbenchSummaryStreamContent = (
  currentContent: string,
  event: Pick<StreamEvent, 'content' | 'data'>
): string =>
  extractWorkbenchSummaryContentFromEvent(event, [currentContent]) || currentContent;
