import type { ExecutionDto } from '../state/execution.dto';
import { mapExecutionToDto } from '../state/execution.mapper';

const briefText = (value: unknown, limit: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  // Slice before processing: a summary may itself contain an entire HTML report.
  const text = value
    .slice(0, limit)
    .split(/```|<!doctype|<html/i)[0]
    .trim();
  return text || undefined;
};

/** Opt-in list projection. Full payloads remain available from execution detail. */
export function mapExecutionListSummary(record: Record<string, unknown>): ExecutionDto {
  const full = mapExecutionToDto(record);
  const normalized = full.normalizedResult;
  const input = full.normalizedInput || full.input || {};
  const title =
    briefText(normalized?.title, 160) ||
    briefText(input.user_input || input.prompt || input.task || input.query || input.goal, 160);
  const summary = briefText(normalized?.summary || normalized?.detailText || normalized?.body, 600);

  // Do not spread the full DTO: compatibility aliases and normalizedResult.rawResult
  // otherwise serialize the same attachments/report several times.
  const result = mapExecutionToDto({
    ...record,
    inputJson: null,
    input_json: null,
    normalizedInputJson: null,
    normalized_input_json: null,
    resultJson: null,
    result_json: null,
    phases: [],
    executionPhases: [],
    failureReason: briefText(full.failureReason, 600),
    takeoverReason: briefText(full.takeoverReason, 600),
  });
  result.normalizedResult = {
    title,
    summary,
    resultType: briefText(normalized?.resultType, 80),
    summaryFormat: 'plain_text',
    envelope: {},
    artifacts: [],
    rawResult: null,
    hasBusinessResult: normalized?.hasBusinessResult || false,
  };
  return result;
}
