/**
 * ExecutionListPage
 * List all executions with filtering and pagination
 * Phase 4: Portal Execution views
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table } from 'antd';
import '@/features/chat/ChatMessage.css';
import ExecutionListDetailDrawer from '@/features/executions/list/components/ExecutionListDetailDrawer';
import ExecutionListSummaryStrip from '@/features/executions/list/components/ExecutionListSummaryStrip';
import ExecutionListToolbar from '@/features/executions/list/components/ExecutionListToolbar';
import {
  buildExecutionListColumns,
  buildExecutionListOverviewItems,
} from '@/features/executions/list/components/executionListView';
import { useExecutionListActions } from '@/features/executions/list/hooks/useExecutionListActions';
import { useExecutionListCleanupState } from '@/features/executions/list/hooks/useExecutionListCleanupState';
import { useExecutionListData } from '@/features/executions/list/hooks/useExecutionListData';
import { useExecutionListDrawerProps } from '@/features/executions/list/hooks/useExecutionListDrawerProps';
import { useExecutionListDetailQueries } from '@/features/executions/list/hooks/useExecutionListDetailQueries';
import {
  useExecutionListFilters,
  useExecutionListQueryState,
} from '@/features/executions/list/hooks/useExecutionListFilters';
import { useExecutionListSelection } from '@/features/executions/list/hooks/useExecutionListSelection';
import { useExecutionListTableProps } from '@/features/executions/list/hooks/useExecutionListTableProps';
import { useExecutionListToolbarProps } from '@/features/executions/list/hooks/useExecutionListToolbarProps';
import {
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_ZH,
} from '@/shared/constants/executionStatusMeta';
import { usePreferencesStore } from '@/shared/store/preferencesStore';
import styles from './ExecutionListPage.module.css';

const statusColors = EXECUTION_STATUS_COLORS;
const statusLabels = EXECUTION_STATUS_LABELS_ZH;

const ExecutionListPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = usePreferencesStore((state) => state.theme);
  const isDarkTheme = theme === 'dark';
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    statusFilter,
    setStatusFilter,
    searchText,
    setSearchText,
  } = useExecutionListQueryState();
  const {
    selectedExecutionId,
    updateExecutionSelection,
    handleExecutionRowClick,
  } = useExecutionListSelection({
    navigate,
  });
  const { data, isLoading, isFetching, refetch, getSkillDisplayName } = useExecutionListData({
    page,
    pageSize,
    statusFilter,
  });

  const {
    selectedExecution,
    isDetailLoading,
    selectedSteps,
    isStepsLoading,
    currentSelectedPhase,
    currentSelectedStep,
    displaySelectedPhases,
    effectiveSelectedResultJson,
    isSelectedBrowserExecution,
    isSelectedExecutionActive,
    requiredInputGroups,
    requiredInputs,
    selectedCompletedPhaseCount,
    selectedCurrentPhaseIndex,
    selectedExecutionInput,
    selectedExecutionNormalizedResult,
    selectedExecutionRuntimeSessionId,
    selectedLoopCount,
    selectedLoopSummary,
    selectedSummaryHeadline,
    shouldShowLegacySteps,
    shouldShowSelectedCurrentPhaseInfo,
    shouldShowSelectedExecutionSummary,
    selectedRuntimeSession,
    stableSelectedRuntimeSessionNovncUrl,
    waitingInputStep,
  } = useExecutionListDetailQueries({
    selectedExecutionId,
  });

  const {
    filteredAndSortedData,
    hasActiveFilters,
    emptyStateDescription,
    summaryStats,
  } = useExecutionListFilters({
    executions: data?.data,
    getSkillDisplayName,
    searchText,
    statusFilter,
  });
  const clearFilters = React.useCallback(() => {
    setSearchText('');
    setStatusFilter(undefined);
  }, [setSearchText, setStatusFilter]);
  const {
    cleanupExecutionsMutation,
    submitInputMutation,
    phaseTakeoverMutation,
    submitWaitingInput,
    handleResumeExecution,
    handleCleanupBeforeDate,
  } = useExecutionListActions({
    selectedExecutionId,
    selectedExecution,
    waitingInputStep,
    requiredInputs,
    clearSelection: () => updateExecutionSelection(undefined),
  });
  const {
    clearBeforeDate,
    handleClearBeforeDateChange,
    handleCleanup,
  } = useExecutionListCleanupState({
    onCleanupBeforeDate: handleCleanupBeforeDate,
  });

  const overviewItems = useMemo(() => buildExecutionListOverviewItems(summaryStats), [summaryStats]);

  const columns = useMemo(
    () =>
      buildExecutionListColumns({
        getSkillDisplayName,
        statusColors,
        statusLabels,
      }),
    [getSkillDisplayName]
  );
  const tableProps = useExecutionListTableProps({
    columns,
    dataSource: filteredAndSortedData,
    emptyStateDescription,
    hasActiveFilters,
    isDarkTheme,
    isLoading,
    navigate,
    onClearFilters: clearFilters,
    onExecutionRowClick: handleExecutionRowClick,
    page,
    pageSize,
    setPage,
    setPageSize,
    total: data?.total || 0,
  });
  const detailDrawerProps = useExecutionListDrawerProps({
    selectedExecutionId,
    isDetailLoading,
    selectedExecution,
    navigate,
    updateExecutionSelection,
    getSkillDisplayName,
    shouldShowSelectedCurrentPhaseInfo,
    selectedExecutionRuntimeSessionId,
    stableSelectedRuntimeSessionNovncUrl,
    isSelectedBrowserExecution,
    isSelectedExecutionActive,
    selectedRuntimeSession,
    selectedExecutionInput,
    selectedExecutionNormalizedResult,
    effectiveSelectedResultJson,
    currentSelectedPhase,
    currentSelectedStep,
    displaySelectedPhases,
    selectedCurrentPhaseIndex,
    selectedCompletedPhaseCount,
    selectedLoopCount,
    shouldShowSelectedExecutionSummary,
    selectedSummaryHeadline,
    selectedLoopSummary,
    waitingInputStep,
    requiredInputs,
    requiredInputGroups,
    submitInputLoading: submitInputMutation.isLoading,
    onSubmitWaitingInput: submitWaitingInput,
    onResumeInAi: (form) => {
      void handleResumeExecution(true, form);
    },
    onTakeoverPhase: (phase) => phaseTakeoverMutation.mutate(phase),
    phaseTakeoverLoading: phaseTakeoverMutation.isLoading,
    shouldShowLegacySteps,
    selectedSteps,
    isStepsLoading,
  });
  const toolbarProps = useExecutionListToolbarProps({
    filteredCount: filteredAndSortedData.length,
    total: data?.total || 0,
    searchText,
    onSearchTextChange: setSearchText,
    statusFilter,
    onStatusFilterChange: setStatusFilter,
    hasActiveFilters,
    onClearFilters: clearFilters,
    isFetching,
    refetch,
    navigate,
    clearBeforeDate,
    onClearBeforeDateChange: handleClearBeforeDateChange,
    onCleanup: handleCleanup,
    cleanupLoading: cleanupExecutionsMutation.isLoading,
  });

  return (
    <div className={styles['execution-list-page']}>
      <ExecutionListSummaryStrip
        items={overviewItems}
        activeStatusFilter={statusFilter}
        onSelectFilter={setStatusFilter}
      />

      <Card className={styles['execution-list-card']} styles={{ body: { padding: 0 } }}>
        <ExecutionListToolbar {...toolbarProps} />
        <Table {...tableProps} />
      </Card>

      <ExecutionListDetailDrawer {...detailDrawerProps} />
    </div>
  );
};

export default ExecutionListPage;
