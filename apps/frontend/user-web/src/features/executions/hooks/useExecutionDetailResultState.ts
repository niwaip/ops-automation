import React from 'react';
import type { ExecutionDto, ExecutionPhaseDto } from '@/api/execution';
import { buildExecutionResultState } from '@/features/executions/lib/executionResultState';

interface UseExecutionDetailResultStateOptions {
  execution?: ExecutionDto;
  sortedExecutionPhases: ExecutionPhaseDto[];
}

export function useExecutionDetailResultState({
  execution,
  sortedExecutionPhases,
}: UseExecutionDetailResultStateOptions) {
  return React.useMemo(
    () =>
      buildExecutionResultState({
        execution,
        sortedExecutionPhases,
      }),
    [execution, sortedExecutionPhases]
  );
}
