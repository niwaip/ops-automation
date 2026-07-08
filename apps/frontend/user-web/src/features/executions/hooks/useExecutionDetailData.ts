import { useMemo } from 'react';
import { useExecutionDetailBaseQueries } from './useExecutionDetailBaseQueries';
import { useExecutionDetailDerivedState } from './useExecutionDetailDerivedState';
import { buildExecutionDetailText } from '../lib/executionDetailText';
import { buildExecutionStatusMeta } from '../lib/executionStatusMeta';

interface UseExecutionDetailDataOptions {
  id?: string;
  isEnglish: boolean;
  text: ReturnType<typeof buildExecutionDetailText>;
  runtimeSessionLookupEnabled?: boolean;
}

export function useExecutionDetailData({
  id,
  isEnglish,
  text,
  runtimeSessionLookupEnabled = true,
}: UseExecutionDetailDataOptions) {
  const baseQueryState = useExecutionDetailBaseQueries({ id });
  const derivedState = useExecutionDetailDerivedState({
    isEnglish,
    waitingInputDesc: text.waitingInputDesc,
    runtimeSessionLookupEnabled,
    baseQueryState,
  });
  const statusMeta = useMemo(
    () =>
      buildExecutionStatusMeta({
        isEnglish,
        manualReviewPendingLabel: text.manualReviewPending,
      }),
    [isEnglish, text.manualReviewPending]
  );

  return {
    ...baseQueryState,
    ...derivedState,
    ...statusMeta,
  };
}
