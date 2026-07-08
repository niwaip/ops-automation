import { resolveExecutionNormalizedResult } from '@ops/user-core';
import type { ExecutionDto, ExecutionPhaseDto } from '@/api/execution';
import { extractBrowserExecutionResult } from '@/features/executions/lib/browser';
import {
  asRecord,
  hasMeaningfulExecutionResult,
  tryParseJsonValue,
} from '@/features/executions/lib/common';

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
  const primaryResultText =
    normalizedResult?.detailText || normalizedResult?.summary || normalizedResult?.body;
  const shouldRenderPrimaryAsMarkdown =
    normalizedResult?.detailFormat === 'markdown' || normalizedResult?.summaryFormat === 'markdown';
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
