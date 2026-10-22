import { useCallback, useMemo } from 'react';
import { useQuery } from 'react-query';
import type { ExecutionStatus } from '@/api/execution';
import { capabilityReleaseApi } from '@/api/capabilities';
import { executionApi } from '@/api/execution';
import { skillApi } from '@/api/skill';
import {
  buildExecutionSkillNameMap,
  resolveExecutionSkillDisplayName,
} from '@/features/executions/shared/lib/executionDerivedState';

interface UseExecutionListDataOptions {
  page: number;
  pageSize: number;
  statusFilter?: ExecutionStatus;
  q?: string;
}

export function useExecutionListData({
  page,
  pageSize,
  statusFilter,
  q,
}: UseExecutionListDataOptions) {
  const { data: skillsData } = useQuery(['skills-name-map'], () => skillApi.list());
  const { data: releasesData } = useQuery(['published-skills-name-map'], () =>
    capabilityReleaseApi.listReleaseCenter()
  );
  const cleanQ = q?.trim() || undefined;
  const executionsQuery = useQuery(
    ['executions', page, pageSize, statusFilter, cleanQ],
    () => executionApi.list({ page, pageSize, status: statusFilter, q: cleanQ }),
    { keepPreviousData: true }
  );

  const skillNameMap = useMemo(
    () => buildExecutionSkillNameMap(releasesData?.releases, skillsData?.skills),
    [releasesData?.releases, skillsData?.skills]
  );

  const getSkillDisplayName = useCallback(
    (skillId?: string) => resolveExecutionSkillDisplayName(skillNameMap, skillId),
    [skillNameMap]
  );

  return {
    ...executionsQuery,
    getSkillDisplayName,
  };
}
