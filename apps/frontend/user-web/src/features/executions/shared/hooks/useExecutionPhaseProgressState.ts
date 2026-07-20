import React from 'react';
import type { ExecutionDto, ExecutionPhaseDto, ExecutionStepDto } from '@/api/execution';
import {
  buildExecutionPhaseProgressState,
} from '@/features/executions/shared/lib/executionPhaseState';

interface UseExecutionPhaseProgressStateOptions {
  execution?: ExecutionDto;
  steps?: ExecutionStepDto[];
  displayActivityPhases: ExecutionPhaseDto[];
  sortedExecutionPhases: ExecutionPhaseDto[];
  workflowActivityPhases: ExecutionPhaseDto[];
  currentPhase?: ExecutionPhaseDto;
  isEnglish: boolean;
}

export function useExecutionPhaseProgressState({
  execution,
  steps,
  displayActivityPhases,
  sortedExecutionPhases,
  workflowActivityPhases,
  currentPhase,
  isEnglish,
}: UseExecutionPhaseProgressStateOptions) {
  return React.useMemo(
    () =>
      buildExecutionPhaseProgressState({
        execution,
        steps,
        displayActivityPhases,
        sortedExecutionPhases,
        workflowActivityPhases,
        currentPhase,
        isEnglish,
      }),
    [
      currentPhase,
      displayActivityPhases,
      execution,
      isEnglish,
      sortedExecutionPhases,
      steps,
      workflowActivityPhases,
    ]
  );
}
