import { useState } from 'react';
import { useQuery } from 'react-query';
import { executionApi, ExecutionDto, ExecutionStatus } from '@/api/execution';

export interface UseFailedExecutionsOptions {
  initialStatus?: ExecutionStatus | 'all';
  pageSize?: number;
}

export function useFailedExecutions(options: UseFailedExecutionsOptions = {}) {
  const { initialStatus = 'failed', pageSize = 30 } = options;
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | 'all'>(initialStatus);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery(
    ['failed-executions', statusFilter, page, pageSize],
    async () => {
      const params: Parameters<typeof executionApi.list>[0] = {
        page,
        pageSize,
      };
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      return executionApi.list(params);
    },
    {
      staleTime: 15000,
      refetchInterval: 30000,
    }
  );

  const rawList: ExecutionDto[] = query.data?.data || [];

  const filteredList = rawList.filter((item) => {
    if (!keyword.trim()) return true;
    const lower = keyword.toLowerCase();
    const idMatches = item.id.toLowerCase().includes(lower);
    const inputStr =
      typeof (item as any).input === 'string'
        ? (item as any).input
        : JSON.stringify(item.input || item.normalizedInput || '');
    const instructionMatches = inputStr.toLowerCase().includes(lower);
    const reasonMatches =
      Boolean(item.failureReason && item.failureReason.toLowerCase().includes(lower));
    const skillMatches = Boolean(item.skillId && item.skillId.toLowerCase().includes(lower));
    return idMatches || instructionMatches || reasonMatches || skillMatches;
  });

  return {
    executions: filteredList,
    total: query.data?.total || 0,
    loading: query.isLoading,
    refreshing: query.isFetching,
    refetch: query.refetch,
    statusFilter,
    setStatusFilter,
    keyword,
    setKeyword,
    page,
    setPage,
  };
}
