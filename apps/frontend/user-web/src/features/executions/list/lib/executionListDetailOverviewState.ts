import type { ExecutionPhaseDto } from '@/api/execution';

export interface ExecutionListDetailOverviewState {
  currentSelectedPhase?: ExecutionPhaseDto;
  isSelectedExecutionActive: boolean;
  selectedSummaryHeadline: string;
}

export const buildExecutionListDetailOverviewState = ({
  currentSelectedPhase,
  isExecutionActive,
  summaryHeadline,
  fallbackSummaryHeadline,
}: {
  currentSelectedPhase?: ExecutionPhaseDto;
  isExecutionActive: boolean;
  summaryHeadline?: string;
  fallbackSummaryHeadline: string;
}): ExecutionListDetailOverviewState => ({
  currentSelectedPhase,
  isSelectedExecutionActive: isExecutionActive,
  selectedSummaryHeadline: summaryHeadline || fallbackSummaryHeadline,
});
