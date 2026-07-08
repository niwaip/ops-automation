import { useMemo } from 'react';
import type { ExecutionDto, ExecutionPhaseDto, ExecutionStepDto } from '@/api/execution';
import {
  buildExecutionListDetailState,
  type ExecutionListDetailStateResult,
} from '@/features/executions/lib/executionListDetailState';

interface UseExecutionListDetailStateOptions {
  selectedExecution?: ExecutionDto;
  selectedPhasesData?: ExecutionPhaseDto[];
  selectedSteps?: ExecutionStepDto[];
}

export function useExecutionListDetailState({
  selectedExecution,
  selectedPhasesData,
  selectedSteps,
}: UseExecutionListDetailStateOptions): ExecutionListDetailStateResult {
  return useMemo(
    () =>
      buildExecutionListDetailState({
        selectedExecution,
        selectedPhasesData,
        selectedSteps,
      }),
    [selectedExecution, selectedPhasesData, selectedSteps]
  );
}
