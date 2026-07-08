import { useExecutionListDetailState } from '@/features/executions/hooks/useExecutionListDetailState';
import { useExecutionRecordQueries } from '@/features/executions/hooks/useExecutionRecordQueries';
import { useExecutionRuntimeSessionQuery } from '@/features/executions/hooks/useExecutionRuntimeSessionQuery';

interface UseExecutionListDetailQueriesOptions {
  selectedExecutionId?: string;
}

export function useExecutionListDetailQueries({
  selectedExecutionId,
}: UseExecutionListDetailQueriesOptions) {
  const {
    execution: selectedExecution,
    steps: selectedSteps,
    phasesData: selectedPhasesData,
    isLoadingExecution: isDetailLoading,
    isLoadingSteps: isStepsLoading,
  } = useExecutionRecordQueries({
    id: selectedExecutionId,
  });

  const detailState = useExecutionListDetailState({
    selectedExecution,
    selectedPhasesData,
    selectedSteps,
  });

  const {
    runtimeSession: selectedRuntimeSession,
    stableRuntimeSessionNovncUrl: stableSelectedRuntimeSessionNovncUrl,
  } = useExecutionRuntimeSessionQuery({
    executionId: selectedExecution?.id,
    executionStatus: selectedExecution?.status,
    executionRuntimeSessionId: detailState.selectedExecutionRuntimeSessionId,
  });

  return {
    selectedExecution,
    isDetailLoading,
    selectedSteps,
    isStepsLoading,
    selectedPhasesData,
    selectedRuntimeSession,
    stableSelectedRuntimeSessionNovncUrl,
    ...detailState,
  };
}
