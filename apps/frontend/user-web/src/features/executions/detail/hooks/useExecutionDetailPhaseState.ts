import React from 'react';
import type { ExecutionDto, ExecutionPhaseDto, ExecutionStepDto } from '@/api/execution';
import {
  buildExecutionPhaseCollections,
} from '@/features/executions/shared/lib/executionPhaseState';
import { useExecutionPhaseProgressState } from '@/features/executions/shared/hooks/useExecutionPhaseProgressState';
import { useExecutionPhaseReviewState } from '@/features/executions/shared/hooks/useExecutionPhaseReviewState';

interface UseExecutionDetailPhaseStateOptions {
  execution?: ExecutionDto;
  steps?: ExecutionStepDto[];
  phasesData?: ExecutionPhaseDto[];
  isEnglish: boolean;
}

export function useExecutionDetailPhaseState({
  execution,
  steps,
  phasesData,
  isEnglish,
}: UseExecutionDetailPhaseStateOptions) {
  const {
    displayActivityPhases,
    executionPhases,
    sortedExecutionPhases,
    timeSortedExecutionPhases,
    workflowActivityPhases,
  } = React.useMemo(
    () =>
      buildExecutionPhaseCollections({
        execution,
        phasesData,
      }),
    [execution, phasesData]
  );
  const reviewState = useExecutionPhaseReviewState({
    execution,
    displayActivityPhases,
    sortedExecutionPhases,
  });

  const progressState = useExecutionPhaseProgressState({
    execution,
    steps,
    displayActivityPhases,
    sortedExecutionPhases,
    workflowActivityPhases,
    currentPhase: reviewState.currentPhase,
    isEnglish,
  });

  return {
    displayActivityPhases,
    executionPhases,
    sortedExecutionPhases,
    timeSortedExecutionPhases,
    workflowActivityPhases,
    ...reviewState,
    ...progressState,
  };
}
