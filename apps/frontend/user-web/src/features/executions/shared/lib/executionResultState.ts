import { resolveExecutionNormalizedResult } from '@ops/user-core';
import { formatStructuredDataToMarkdown } from '@chat-web/lib/tableNormalizer';
import type { ExecutionDto, ExecutionPhaseDto } from '@/api/execution';
import { extractBrowserExecutionResult } from '@/features/executions/shared/lib/browser';
import {
  asRecord,
  hasMeaningfulExecutionResult,
  tryParseJsonValue,
} from '@/features/executions/shared/lib/common';

/** Fields tried in order to extract a human-readable text from a result/phase JSON object */
const READABLE_TEXT_FIELDS = [
  'chatSummary',
  'detailText',
  'formatted_output',
  'finalAnswer',
  'summary',
  'result',
  'text',
  'content',
  'message',
  'body',
] as const;

const extractReadableText = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    for (const field of READABLE_TEXT_FIELDS) {
      if (typeof rec[field] === 'string' && (rec[field] as string).trim()) {
        return (rec[field] as string).trim();
      }
    }
  }
  return undefined;
};

export interface ExecutionResultState {
  semantic: ExecutionDto['semantic'];
  parsedResult: Record<string, unknown> | undefined;
  normalizedResult: ReturnType<typeof resolveExecutionNormalizedResult> | undefined;
  effectiveResultJson: unknown;
  effectiveBrowserExecutionResult: ReturnType<typeof extractBrowserExecutionResult>;
  resultPreviewValue: unknown;
  primaryResultText: string | undefined;
  shouldRenderPrimaryAsMarkdown: boolean;
  shouldShowStructuredResult: boolean;
}

export interface ExecutionListDetailResultState {
  effectiveSelectedResultJson: ExecutionResultState['effectiveResultJson'];
  selectedBrowserExecutionResult: ExecutionResultState['effectiveBrowserExecutionResult'];
  selectedExecutionNormalizedResult: ExecutionResultState['normalizedResult'];
}

export const buildExecutionResultState = ({
  execution,
  sortedExecutionPhases,
}: {
  execution?: ExecutionDto;
  sortedExecutionPhases: ExecutionPhaseDto[];
}): ExecutionResultState => {
  const semantic = execution?.semantic;
  const parsedResult = asRecord(tryParseJsonValue(execution?.resultJson));
  const normalizedResult = execution ? resolveExecutionNormalizedResult(execution) : undefined;
  const browserExecutionResult = extractBrowserExecutionResult(execution?.resultJson);

  const effectiveResultJson = hasMeaningfulExecutionResult(parsedResult)
    ? parsedResult
    : (() => {
        const phaseWithOutput = [...sortedExecutionPhases]
          .reverse()
          .find((phase) => hasMeaningfulExecutionResult(tryParseJsonValue(phase.output)));

        return phaseWithOutput ? tryParseJsonValue(phaseWithOutput.output) : undefined;
      })();

  const effectiveBrowserExecutionResult =
    browserExecutionResult || extractBrowserExecutionResult(effectiveResultJson);
  const resultPreviewValue = normalizedResult?.structuredData ?? normalizedResult?.envelope;
  // Try normalizedResult fields first, then scan resultJson and phases for readable text
  const primaryResultTextFromNormalized =
    normalizedResult?.detailText || normalizedResult?.summary || normalizedResult?.body;

  const primaryResultTextFromRaw = !primaryResultTextFromNormalized
    ? extractReadableText(tryParseJsonValue(execution?.resultJson))
    : undefined;

  const primaryResultTextFromPhases = !primaryResultTextFromNormalized && !primaryResultTextFromRaw
    ? (() => {
        const phasesInOrder = [...sortedExecutionPhases].reverse();
        for (const phase of phasesInOrder) {
          const phaseOutput = tryParseJsonValue(phase.output);
          const text = extractReadableText(phaseOutput);
          if (text) return text;
        }
        return undefined;
      })()
    : undefined;

  const primaryResultTextFromStructured =
    !primaryResultTextFromNormalized && !primaryResultTextFromRaw && !primaryResultTextFromPhases
      ? formatStructuredDataToMarkdown(tryParseJsonValue(execution?.resultJson)) ||
        formatStructuredDataToMarkdown(effectiveResultJson)
      : undefined;

  const primaryResultText =
    primaryResultTextFromNormalized ||
    primaryResultTextFromRaw ||
    primaryResultTextFromPhases ||
    primaryResultTextFromStructured;

  const detailFormat = normalizedResult?.detailFormat;
  const summaryFormat = normalizedResult?.summaryFormat;
  const textFromRawOrPhase = Boolean(primaryResultTextFromRaw || primaryResultTextFromPhases);
  const shouldRenderPrimaryAsMarkdown =
    detailFormat === 'markdown' || summaryFormat === 'markdown' ||
    // If text came from raw/phases and contains Markdown syntax, auto-enable
    (textFromRawOrPhase && Boolean(
      primaryResultText && /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|.+\|)|\*\*[^*]+\*\*/.test(primaryResultText)
    ));
  const shouldShowStructuredResult = Boolean(
    resultPreviewValue !== undefined &&
      resultPreviewValue !== null &&
      (normalizedResult?.envelope?.presentation?.preferStructuredView ||
        normalizedResult?.structuredData !== undefined ||
        !primaryResultText)
  );

  return {
    semantic,
    parsedResult,
    normalizedResult,
    effectiveResultJson,
    effectiveBrowserExecutionResult,
    resultPreviewValue,
    primaryResultText,
    shouldRenderPrimaryAsMarkdown,
    shouldShowStructuredResult,
  };
};

export const buildExecutionListDetailResultState = (
  resultState: Pick<
    ExecutionResultState,
    'effectiveResultJson' | 'effectiveBrowserExecutionResult' | 'normalizedResult'
  >
): ExecutionListDetailResultState => ({
  effectiveSelectedResultJson: resultState.effectiveResultJson,
  selectedBrowserExecutionResult: resultState.effectiveBrowserExecutionResult,
  selectedExecutionNormalizedResult: resultState.normalizedResult,
});
