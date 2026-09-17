import type { ExecutionDto } from '@ops/user-core';

export const getExecutionTitle = (execution: ExecutionDto): string => {
  const resultTitle = execution.normalizedResult?.title?.trim();
  if (resultTitle) {
    return resultTitle;
  }
  const resultSummary = execution.normalizedResult?.summary?.trim();
  if (resultSummary) {
    return resultSummary;
  }
  const semanticRecord =
    execution.semantic && typeof execution.semantic === 'object'
      ? (execution.semantic as unknown as Record<string, unknown>)
      : undefined;
  const semanticTitleCandidate = [
    semanticRecord?.title,
    semanticRecord?.summary,
    semanticRecord?.intent,
    semanticRecord?.task,
  ].find((item) => typeof item === 'string' && item.trim());
  if (typeof semanticTitleCandidate === 'string') {
    return semanticTitleCandidate;
  }
  const inputRecord =
    execution.normalizedInput && typeof execution.normalizedInput === 'object'
      ? (execution.normalizedInput as Record<string, unknown>)
      : undefined;
  const inputCandidate = [
    inputRecord?.user_input,
    inputRecord?.prompt,
    inputRecord?.task,
    inputRecord?.query,
    inputRecord?.goal,
    inputRecord?.url,
  ].find((item) => typeof item === 'string' && item.trim());
  if (typeof inputCandidate === 'string') {
    return inputCandidate;
  }
  return `执行单 ${execution.id.slice(0, 8)}`;
};
