import { useQuery } from 'react-query';
import { executionApi } from '@/api/execution';
import { EXECUTION_ACTIVE_POLLING_STATUSES } from '@/shared/lib/executionStatusMeta';

export function useExecutionDetailQueries(id?: string) {
  const executionQuery = useQuery(
    ['execution-detail', id],
    () => executionApi.getById(id as string),
    {
      enabled: Boolean(id),
      refetchInterval: (data) => {
        if (!data) return 2000;
        const activeArray = Array.from(EXECUTION_ACTIVE_POLLING_STATUSES as any);
        return activeArray.includes(data.status) ? 2000 : false;
      },
    }
  );

  return {
    executionQuery,
    execution: executionQuery.data,
    isLoading: executionQuery.isLoading,
    refetch: executionQuery.refetch,
  };
}
