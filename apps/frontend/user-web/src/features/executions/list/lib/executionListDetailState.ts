import type { ExecutionDto, ExecutionPhaseDto, ExecutionStepDto } from '@/api/execution';
import {
  buildExecutionListDetailDerivedState,
  buildExecutionRuntimeDerivedState,
  buildExecutionStatusDerivedState,
  buildExecutionWaitingInputState,
  type ExecutionListDetailDerivedState,
} from '@/features/executions/shared/lib/executionDerivedState';
import {
  buildExecutionPhaseCollections,
  buildExecutionListDetailPhaseProgressState,
  buildExecutionPhaseProgressState,
  type ExecutionListDetailPhaseProgressState,
  findCurrentExecutionPhase,
} from '@/features/executions/shared/lib/executionPhaseState';
import {
  buildExecutionListDetailResultState,
  buildExecutionResultState,
  type ExecutionListDetailResultState,
} from '@/features/executions/shared/lib/executionResultState';
import {
  buildExecutionListDetailOverviewState,
  type ExecutionListDetailOverviewState,
} from '@/features/executions/list/lib/executionListDetailOverviewState';

export interface ExecutionListDetailStateResult {
  currentSelectedPhase?: ExecutionListDetailOverviewState['currentSelectedPhase'];
  currentSelectedStep?: ExecutionListDetailDerivedState['currentSelectedStep'];
  displaySelectedPhases: ExecutionPhaseDto[];
  effectiveSelectedResultJson: ExecutionListDetailResultState['effectiveSelectedResultJson'];
  isSelectedBrowserExecution: ExecutionListDetailDerivedState['isSelectedBrowserExecution'];
  isSelectedExecutionActive: ExecutionListDetailOverviewState['isSelectedExecutionActive'];
  requiredInputGroups: ExecutionListDetailDerivedState['requiredInputGroups'];
  requiredInputs: ExecutionListDetailDerivedState['requiredInputs'];
  selectedBrowserExecutionResult: ExecutionListDetailResultState['selectedBrowserExecutionResult'];
  selectedCompletedPhaseCount: ExecutionListDetailPhaseProgressState['selectedCompletedPhaseCount'];
  selectedCurrentPhaseIndex: ExecutionListDetailPhaseProgressState['selectedCurrentPhaseIndex'];
  selectedExecutionInput: ExecutionListDetailDerivedState['selectedExecutionInput'];
  selectedExecutionNormalizedResult: ExecutionListDetailResultState['selectedExecutionNormalizedResult'];
  selectedExecutionRuntimeSessionId?: ExecutionListDetailDerivedState['selectedExecutionRuntimeSessionId'];
  selectedLoopCount: ExecutionListDetailPhaseProgressState['selectedLoopCount'];
  selectedLoopSummary: ExecutionListDetailPhaseProgressState['selectedLoopSummary'];
  selectedSummaryHeadline: ExecutionListDetailOverviewState['selectedSummaryHeadline'];
  shouldShowLegacySteps: ExecutionListDetailPhaseProgressState['shouldShowLegacySteps'];
  shouldShowSelectedCurrentPhaseInfo: ExecutionListDetailPhaseProgressState['shouldShowSelectedCurrentPhaseInfo'];
  shouldShowSelectedExecutionSummary: ExecutionListDetailPhaseProgressState['shouldShowSelectedExecutionSummary'];
  waitingInputStep?: ExecutionListDetailDerivedState['waitingInputStep'];
}

export const buildExecutionListDetailState = ({
  selectedExecution,
  selectedPhasesData,
  selectedSteps,
}: {
  selectedExecution?: ExecutionDto;
  selectedPhasesData?: ExecutionPhaseDto[];
  selectedSteps?: ExecutionStepDto[];
}): ExecutionListDetailStateResult => {
  const {
    displayActivityPhases: displaySelectedPhases,
    sortedExecutionPhases: sortedSelectedExecutionPhases,
    workflowActivityPhases: selectedWorkflowActivityPhases,
  } = buildExecutionPhaseCollections({
    execution: selectedExecution,
    phasesData: selectedPhasesData,
  });
  const resultState = buildExecutionResultState({
    execution: selectedExecution,
    sortedExecutionPhases: sortedSelectedExecutionPhases,
  });
  const listDetailResultState = buildExecutionListDetailResultState(resultState);
  const runtimeDerivedState = buildExecutionRuntimeDerivedState({
    execution: selectedExecution,
    browserExecutionResult: listDetailResultState.selectedBrowserExecutionResult,
    sortedExecutionPhases: sortedSelectedExecutionPhases,
  });
  const currentSelectedPhase = findCurrentExecutionPhase(
    displaySelectedPhases,
    selectedExecution?.currentPhaseKey
  );
  const waitingInputState = buildExecutionWaitingInputState({
    execution: selectedExecution,
    steps: selectedSteps,
  });
  const listDetailDerivedState = buildExecutionListDetailDerivedState({
    runtimeDerivedState,
    waitingInputState,
  });
  const phaseProgressState = buildExecutionPhaseProgressState({
    execution: selectedExecution,
    steps: selectedSteps,
    displayActivityPhases: displaySelectedPhases,
    sortedExecutionPhases: sortedSelectedExecutionPhases,
    workflowActivityPhases: selectedWorkflowActivityPhases,
    currentPhase: currentSelectedPhase,
    isEnglish: false,
  });
  const listDetailPhaseProgressState = buildExecutionListDetailPhaseProgressState(phaseProgressState);
  const { isExecutionActive, summaryHeadline } = buildExecutionStatusDerivedState({
    executionStatus: selectedExecution?.status,
    normalizedResult: listDetailResultState.selectedExecutionNormalizedResult,
    loopSummaryText: listDetailPhaseProgressState.selectedLoopSummary?.summaryText,
    failureReason: selectedExecution?.failureReason,
    takeoverReason: selectedExecution?.takeoverReason,
    fallbackSummaryHeadline: '暂无总结信息',
  });
  const overviewState = buildExecutionListDetailOverviewState({
    currentSelectedPhase,
    isExecutionActive,
    summaryHeadline,
    fallbackSummaryHeadline: '暂无总结信息',
  });

  return {
    displaySelectedPhases,
    ...listDetailDerivedState,
    ...listDetailPhaseProgressState,
    ...listDetailResultState,
    ...overviewState,
  };
};
