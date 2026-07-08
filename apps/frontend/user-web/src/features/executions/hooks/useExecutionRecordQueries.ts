import { useQuery } from 'react-query';
import type { ExecutionDto, ExecutionPhaseDto, ExecutionStepDto } from '@/api/execution';
import { executionApi } from '@/api/execution';
import { getExecutionPollingInterval } from '@/features/executions/lib/runtimeSession';

interface UseExecutionRecordQueriesOptions {
  id?: string;
}

export interface UseExecutionRecordQueriesResult {
  execution?: ExecutionDto;
  steps?: ExecutionStepDto[];
  phasesData?: ExecutionPhaseDto[];
  isLoadingExecution: boolean;
  isLoadingSteps: boolean;
  errorExecution?: Error | null;
}

export function useExecutionRecordQueries({
  id,
}: UseExecutionRecordQueriesOptions): UseExecutionRecordQueriesResult {
  const {
    data: execution,
    isLoading: isLoadingExecution,
    error: errorExecution,
  } = useQuery<ExecutionDto, Error>(['execution', id], () => executionApi.getById(id!), {
    enabled: !!id,
    refetchInterval: (data) => getExecutionPollingInterval(data?.status),
  });

  const { data: steps, isLoading: isLoadingSteps } = useQuery<ExecutionStepDto[], Error>(
    ['execution-steps', id],
    () => executionApi.getSteps(id!),
    {
      enabled: !!id,
      refetchInterval: () => getExecutionPollingInterval(execution?.status),
    }
  );

  const { data: phasesData } = useQuery<ExecutionPhaseDto[], Error>(
    ['execution-phases', id],
    () => executionApi.getPhases(id!),
    {
      enabled: !!id,
      refetchInterval: () => getExecutionPollingInterval(execution?.status),
    }
  );

  return {
    execution,
    steps,
    phasesData,
    isLoadingExecution,
    isLoadingSteps,
    errorExecution,
  };
}
