import { useQuery } from 'react-query';
import { capabilityReleaseApi } from '@/api/capabilities';
import { skillApi } from '@/api/skill';
import type { ExecutionDto, ExecutionPhaseDto, ExecutionStepDto } from '@/api/execution';
import { useExecutionRecordQueries } from '@/features/executions/shared/hooks/useExecutionRecordQueries';

interface UseExecutionDetailBaseQueriesOptions {
  id?: string;
}

export interface UseExecutionDetailBaseQueriesResult {
  execution?: ExecutionDto;
  steps?: ExecutionStepDto[];
  phasesData?: ExecutionPhaseDto[];
  skillsData?: Awaited<ReturnType<typeof skillApi.list>>;
  releasesData?: Awaited<ReturnType<typeof capabilityReleaseApi.listReleaseCenter>>;
  isLoadingExecution: boolean;
  errorExecution?: Error | null;
}

export function useExecutionDetailBaseQueries({
  id,
}: UseExecutionDetailBaseQueriesOptions): UseExecutionDetailBaseQueriesResult {
  const { execution, steps, phasesData, isLoadingExecution, errorExecution } =
    useExecutionRecordQueries({ id });

  const { data: skillsData } = useQuery(['execution-detail-skills-name-map'], () => skillApi.list());
  const { data: releasesData } = useQuery(['execution-detail-published-skills-name-map'], () =>
    capabilityReleaseApi.listReleaseCenter()
  );

  return {
    execution,
    steps,
    phasesData,
    skillsData,
    releasesData,
    isLoadingExecution,
    errorExecution,
  };
}
