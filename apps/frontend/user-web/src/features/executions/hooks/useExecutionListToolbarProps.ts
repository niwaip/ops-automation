import { useMemo } from 'react';
import type { ExecutionStatus } from '@/api/execution';
import ExecutionListToolbar from '@/features/executions/components/ExecutionListToolbar';
import { EXECUTION_STATUS_FILTER_OPTIONS } from '@/features/executions/lib/executionListView';

type ExecutionListToolbarProps = React.ComponentProps<typeof ExecutionListToolbar>;

interface UseExecutionListToolbarPropsOptions {
  filteredCount: number;
  total: number;
  searchText: string;
  onSearchTextChange: (value: string) => void;
  statusFilter?: ExecutionStatus;
  onStatusFilterChange: (value?: ExecutionStatus) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
  navigate: (path: string) => void;
  clearBeforeDate: ExecutionListToolbarProps['clearBeforeDate'];
  onClearBeforeDateChange: ExecutionListToolbarProps['onClearBeforeDateChange'];
  onCleanup: () => void;
  cleanupLoading: boolean;
}

export function useExecutionListToolbarProps({
  filteredCount,
  total,
  searchText,
  onSearchTextChange,
  statusFilter,
  onStatusFilterChange,
  hasActiveFilters,
  onClearFilters,
  isFetching,
  refetch,
  navigate,
  clearBeforeDate,
  onClearBeforeDateChange,
  onCleanup,
  cleanupLoading,
}: UseExecutionListToolbarPropsOptions): ExecutionListToolbarProps {
  return useMemo(
    () => ({
      filteredCount,
      total,
      searchText,
      onSearchTextChange,
      statusFilter,
      onStatusFilterChange,
      hasActiveFilters,
      onClearFilters,
      isFetching,
      onRefresh: () => {
        void refetch();
      },
      onCreate: () => navigate('/executions/new'),
      clearBeforeDate,
      onClearBeforeDateChange,
      onCleanup,
      cleanupLoading,
      statusOptions: EXECUTION_STATUS_FILTER_OPTIONS,
    }),
    [
      cleanupLoading,
      clearBeforeDate,
      filteredCount,
      hasActiveFilters,
      isFetching,
      navigate,
      onCleanup,
      onClearBeforeDateChange,
      onClearFilters,
      onSearchTextChange,
      onStatusFilterChange,
      refetch,
      searchText,
      statusFilter,
      total,
    ]
  );
}
