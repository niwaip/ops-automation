import type { FormInstance } from 'antd/es/form';
import type { ExecutionDto, ExecutionPhaseDto, ExecutionStepDto } from '@/api/execution';
import type { ExecutionResultState } from '@/features/executions/lib/executionResultState';
import type { RequiredInputField } from '@/features/executions/lib/inputFields';
import { summarizeSteps } from '@/features/executions/lib/listView';
import type { ExecutionLoopSummary } from '@/features/executions/lib/executionSummary';
import {
  getRuntimeSessionStatusLabel,
  isPreviewRuntimeSessionState,
} from '@/features/executions/lib/runtimeSession';
import type { WaitingInputDisplayGroup } from '@/shared/lib/waitingInputDisplay';

export interface ExecutionListDetailDrawerProps {
  open: boolean;
  isDetailLoading: boolean;
  selectedExecution?: ExecutionDto;
  onClose: () => void;
  onOpenExecutionDetailPage: (executionId: string) => void;
  getSkillDisplayName: (skillId?: string) => string;
  shouldShowSelectedCurrentPhaseInfo: boolean;
  selectedExecutionRuntimeSessionId?: string;
  stableSelectedRuntimeSessionNovncUrl?: string;
  isSelectedBrowserExecution: boolean;
  shouldShowLivePreview: boolean;
  runtimeSessionStatusLabel?: string;
  selectedExecutionInput?: unknown;
  selectedExecutionNormalizedResult?: ExecutionResultState['normalizedResult'];
  effectiveSelectedResultJson?: unknown;
  currentSelectedPhase?: ExecutionPhaseDto;
  currentSelectedStep?: ExecutionStepDto;
  displaySelectedPhases: ExecutionPhaseDto[];
  selectedCurrentPhaseIndex: number;
  selectedCompletedPhaseCount: number;
  selectedLoopCount: number;
  shouldShowSelectedExecutionSummary: boolean;
  selectedSummaryHeadline: string;
  selectedLoopSummary?: ExecutionLoopSummary | null;
  waitingInputStep?: ExecutionStepDto;
  requiredInputs: RequiredInputField[];
  requiredInputGroups: WaitingInputDisplayGroup<RequiredInputField>[];
  submitInputLoading: boolean;
  onSubmitWaitingInput: (values: Record<string, unknown>) => void;
  onResumeInAi: (form?: FormInstance) => void;
  onTakeoverPhase: (phase: ExecutionPhaseDto) => void;
  phaseTakeoverLoading: boolean;
  shouldShowLegacySteps: boolean;
  selectedSteps?: ExecutionStepDto[];
  isStepsLoading: boolean;
  legacyStepsSummary: string;
}

export interface BuildExecutionListDetailDrawerPropsOptions {
  selectedExecutionId?: string;
  isDetailLoading: boolean;
  selectedExecution?: ExecutionDto;
  navigate: (path: string) => void;
  updateExecutionSelection: (executionId?: string) => void;
  getSkillDisplayName: (skillId?: string) => string;
  shouldShowSelectedCurrentPhaseInfo: boolean;
  selectedExecutionRuntimeSessionId?: string;
  stableSelectedRuntimeSessionNovncUrl?: string;
  isSelectedBrowserExecution: boolean;
  isSelectedExecutionActive: boolean;
  selectedRuntimeSession?: { state?: string };
  selectedExecutionInput?: unknown;
  selectedExecutionNormalizedResult?: ExecutionResultState['normalizedResult'];
  effectiveSelectedResultJson?: unknown;
  currentSelectedPhase?: ExecutionPhaseDto;
  currentSelectedStep?: ExecutionStepDto;
  displaySelectedPhases: ExecutionPhaseDto[];
  selectedCurrentPhaseIndex: number;
  selectedCompletedPhaseCount: number;
  selectedLoopCount: number;
  shouldShowSelectedExecutionSummary: boolean;
  selectedSummaryHeadline: string;
  selectedLoopSummary?: ExecutionLoopSummary | null;
  waitingInputStep?: ExecutionStepDto;
  requiredInputs: RequiredInputField[];
  requiredInputGroups: WaitingInputDisplayGroup<RequiredInputField>[];
  submitInputLoading: boolean;
  onSubmitWaitingInput: (values: Record<string, unknown>) => void;
  onResumeInAi: (form?: FormInstance) => void;
  onTakeoverPhase: (phase: ExecutionPhaseDto) => void;
  phaseTakeoverLoading: boolean;
  shouldShowLegacySteps: boolean;
  selectedSteps?: ExecutionStepDto[];
  isStepsLoading: boolean;
}

export const buildExecutionListDetailDrawerProps = ({
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
  submitInputLoading,
  onSubmitWaitingInput,
  onResumeInAi,
  onTakeoverPhase,
  phaseTakeoverLoading,
  shouldShowLegacySteps,
  selectedSteps,
  isStepsLoading,
}: BuildExecutionListDetailDrawerPropsOptions): ExecutionListDetailDrawerProps => ({
  open: Boolean(selectedExecutionId),
  isDetailLoading,
  selectedExecution,
  onClose: () => updateExecutionSelection(undefined),
  onOpenExecutionDetailPage: (executionId: string) => navigate(`/executions/${executionId}`),
  getSkillDisplayName,
  shouldShowSelectedCurrentPhaseInfo,
  selectedExecutionRuntimeSessionId,
  stableSelectedRuntimeSessionNovncUrl,
  isSelectedBrowserExecution,
  shouldShowLivePreview:
    Boolean(stableSelectedRuntimeSessionNovncUrl) &&
    (isSelectedExecutionActive || isPreviewRuntimeSessionState(selectedRuntimeSession?.state)),
  runtimeSessionStatusLabel: getRuntimeSessionStatusLabel(selectedRuntimeSession?.state),
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
  submitInputLoading,
  onSubmitWaitingInput,
  onResumeInAi,
  onTakeoverPhase,
  phaseTakeoverLoading,
  shouldShowLegacySteps,
  selectedSteps,
  isStepsLoading,
  legacyStepsSummary: summarizeSteps(selectedSteps, isStepsLoading),
});
