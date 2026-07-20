import { useCallback, useMemo } from 'react';
import styles from '../../pages/ExecutionListPage.module.css';
import type { TableProps } from 'antd';
import type { ExecutionDto } from '@/api/execution';
import ExecutionListEmptyState from '@/features/executions/list/components/ExecutionListEmptyState';
import { getExecutionRowStyle } from '@/features/executions/list/lib/listView';

interface UseExecutionListTablePropsOptions {
  columns: TableProps<ExecutionDto>['columns'];
  dataSource: ExecutionDto[];
  emptyStateDescription: string;
  hasActiveFilters: boolean;
  isDarkTheme: boolean;
  isLoading: boolean;
  navigate: (path: string) => void;
  onClearFilters: () => void;
  onExecutionRowClick: (record: ExecutionDto) => void;
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  total: number;
}

export function useExecutionListTableProps({
  columns,
  dataSource,
  emptyStateDescription,
  hasActiveFilters,
  isDarkTheme,
  isLoading,
  navigate,
  onClearFilters,
  onExecutionRowClick,
  page,
  pageSize,
  setPage,
  setPageSize,
  total,
}: UseExecutionListTablePropsOptions): TableProps<ExecutionDto> {
  const locale = useMemo<TableProps<ExecutionDto>['locale']>(
    () => ({
      emptyText: (
        <ExecutionListEmptyState
          description={emptyStateDescription}
          hasActiveFilters={hasActiveFilters}
          onCreate={() => navigate('/executions/new')}
          onViewPublishedSkills={() => navigate('/published-skills')}
          onClearFilters={onClearFilters}
        />
      ),
    }),
    [emptyStateDescription, hasActiveFilters, navigate, onClearFilters]
  );

  const pagination = useMemo<NonNullable<TableProps<ExecutionDto>['pagination']>>(
    () => ({
      current: page,
      pageSize,
      total,
      showSizeChanger: true,
      showTotal: (count) => `共 ${count} 条执行记录`,
      onChange: (nextPage, nextPageSize) => {
        setPage(nextPage);
        setPageSize(nextPageSize);
      },
    }),
    [page, pageSize, setPage, setPageSize, total]
  );

  const onRow = useCallback<NonNullable<TableProps<ExecutionDto>['onRow']>>(
    (record) => ({
      style: {
        cursor: 'pointer',
        transition: 'background 0.2s ease',
        ...getExecutionRowStyle(record.status, isDarkTheme),
      },
      onClick: () => onExecutionRowClick(record),
    }),
    [isDarkTheme, onExecutionRowClick]
  );

  return {
    className: styles['execution-list-table'],
    columns,
    dataSource,
    rowKey: 'id',
    size: 'middle',
    loading: isLoading,
    locale,
    showSorterTooltip: false,
    pagination,
    rowClassName: () => styles['execution-list-table-row'],
    onRow,
  };
}
