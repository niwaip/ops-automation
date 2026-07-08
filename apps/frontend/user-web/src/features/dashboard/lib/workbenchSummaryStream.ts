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

  const candidates = [
    ...reducedContentCandidates,
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
