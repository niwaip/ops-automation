import { useMemo, useState } from 'react';
import type { ExecutionDto, ExecutionStatus } from '@/api/execution';
import { summarizeExecutionListResult } from '@ops/user-core';
import { getExecutionTime } from '@/features/executions/list/lib/executionListView';
import { summarizeExecutionListInput } from '@/features/executions/list/lib/listHelpers';

interface UseExecutionListFiltersOptions {
  executions?: ExecutionDto[];
  getSkillDisplayName: (skillId?: string) => string;
  searchText: string;
  statusFilter?: ExecutionStatus;
}

export function useExecutionListQueryState() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | undefined>();
  const [searchText, setSearchText] = useState('');

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    statusFilter,
    setStatusFilter,
    searchText,
    setSearchText,
  };
}

export function useExecutionListFilters({
  executions,
  getSkillDisplayName,
  searchText,
  statusFilter,
}: UseExecutionListFiltersOptions) {

  const filteredAndSortedData = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    const rows = [...(executions || [])].filter((record) => {
      if (!keyword) {
        return true;
      }

      return [
        record.id,
        record.skillId,
        getSkillDisplayName(record.skillId),
        record.riskLevel,
        record.status,
        summarizeExecutionListInput(record),
        summarizeExecutionListResult(record),
      ]
        .filter(Boolean)
        .some((item) => String(item).toLowerCase().includes(keyword));
    });

    rows.sort((a, b) => getExecutionTime(b) - getExecutionTime(a));
    return rows;
  }, [executions, searchText, getSkillDisplayName]);

  const runningCount = useMemo(
    () =>
      filteredAndSortedData.filter((record) =>
        ['running', 'waiting_input', 'pending_approval'].includes(record.status)
      ).length,
    [filteredAndSortedData]
  );

  const attentionCount = useMemo(
    () =>
      filteredAndSortedData.filter((record) =>
        ['failed', 'human_control', 'pending_approval', 'waiting_input'].includes(record.status)
      ).length,
    [filteredAndSortedData]
  );

  const completedCount = useMemo(
    () => filteredAndSortedData.filter((record) => record.status === 'succeeded').length,
    [filteredAndSortedData]
  );

  const skillCoverageCount = useMemo(
    () => new Set(filteredAndSortedData.map((record) => record.skillId)).size,
    [filteredAndSortedData]
  );

  const hasActiveFilters = Boolean(searchText.trim() || statusFilter);

  const emptyStateDescription = hasActiveFilters
    ? '没有找到符合当前筛选条件的执行记录，可以调整关键词或状态后再试。'
    : '当前账号还没有执行记录，可以从新建执行开始体验。';

  return {
    filteredAndSortedData,
    hasActiveFilters,
    emptyStateDescription,
    summaryStats: {
      visibleCount: filteredAndSortedData.length,
      runningCount,
      attentionCount,
      completedCount,
      skillCoverageCount,
    },
  };
}
