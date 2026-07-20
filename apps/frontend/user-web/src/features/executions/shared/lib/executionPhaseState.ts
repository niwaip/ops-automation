import type {
  ExecutionDto,
  ExecutionPhaseDto,
  ExecutionPhaseStepDto,
  ExecutionStepDto,
  ExecutionStatus,
} from '@/api/execution';
import { extractPhaseStepUrl, getVisiblePhaseSteps } from '@/features/executions/shared/lib/artifacts';
import {
  fixLocalhostLink,
  getPhaseSteps,
  getPhaseTakeovers,
  isExecutionPhaseLike,
} from '@/features/executions/detail/lib/executionDetailQueryUtils';
import { compareExecutionPhases, compareExecutionPhasesByTime } from '@/features/executions/shared/lib/phase';
import { buildExecutionLoopSummary, type ExecutionLoopSummary } from './executionSummary';
import { asRecord, tryParseJsonValue } from './common';
import { getPhaseLoopIteration } from './phaseText';

export interface ExecutionReviewEntry {
  phaseKey?: string;
  phaseName?: string;
  note?: string;
  reason?: string;
  createdAt?: string;
  resolvedAt?: string;
  status?: string;
}

export interface ExecutionActivityProgressSummary {
  activityProgressCurrent: number;
  completedActivityCount: number;
  pendingActivityCount: number;
  totalLoopCount: number;
  loopSummary: ExecutionLoopSummary | null;
}

export interface ExecutionPhaseCollections {
  displayActivityPhases: ExecutionPhaseDto[];
  executionPhases: ExecutionPhaseDto[];
  sortedExecutionPhases: ExecutionPhaseDto[];
  timeSortedExecutionPhases: ExecutionPhaseDto[];
  workflowActivityPhases: ExecutionPhaseDto[];
}

export interface ExecutionPhaseProgressState
  extends ExecutionActivityProgressSummary,
    ReturnType<typeof resolveCurrentExecutionStepProgress> {
  hasWorkflowActivityPhases: boolean;
  latestActivityUpdateAt?: string;
  shouldShowCurrentPhaseInfo: boolean;
  shouldShowExecutionSummary: boolean;
  shouldShowLegacySteps: boolean;
  shouldShowLiveProgressInfo: boolean;
}

export interface ExecutionListDetailPhaseProgressState {
  selectedCompletedPhaseCount: ExecutionPhaseProgressState['completedActivityCount'];
  selectedCurrentPhaseIndex: ExecutionPhaseProgressState['activityProgressCurrent'];
  selectedLoopCount: ExecutionPhaseProgressState['totalLoopCount'];
  selectedLoopSummary: ExecutionPhaseProgressState['loopSummary'];
  shouldShowLegacySteps: ExecutionPhaseProgressState['shouldShowLegacySteps'];
  shouldShowSelectedCurrentPhaseInfo: ExecutionPhaseProgressState['shouldShowCurrentPhaseInfo'];
  shouldShowSelectedExecutionSummary: ExecutionPhaseProgressState['shouldShowExecutionSummary'];
}

const ACTIVE_CURRENT_PHASE_STATUSES = ['running', 'retrying', 'waiting_takeover', 'resumable', 'pending'];
const RUNNING_PHASE_STATUSES = ['running', 'retrying'];
const TAKEOVER_PHASE_STATUSES = ['waiting_takeover', 'resumable', 'pending'];
const FAILED_PHASE_STEP_STATUSES = ['failed', 'takeover_required', 'blocked'];
const EXECUTION_PHASE_INFO_STATUSES: ExecutionStatus[] = ['running', 'human_control', 'failed'];
const EXECUTION_SUMMARY_STATUSES: ExecutionStatus[] = ['succeeded', 'failed', 'cancelled'];

const hasPhaseReviewSignal = (phase?: ExecutionPhaseDto): boolean => {
  const recoveryDecision = asRecord(tryParseJsonValue(phase?.recoveryDecision));
  return Boolean(phase && (getPhaseTakeovers(phase).length > 0 || recoveryDecision));
};

const getExecutionPhaseStepId = (step?: ExecutionPhaseStepDto): string | undefined =>
  step?.stepId || step?.id;

export const buildExecutionPhaseCollections = ({
  execution,
  phasesData,
}: {
  execution?: Pick<ExecutionDto, 'phases'>;
  phasesData?: ExecutionPhaseDto[];
}): ExecutionPhaseCollections => {
  const executionPhases = (phasesData || execution?.phases || []).filter(isExecutionPhaseLike);
  const sortedExecutionPhases = [...executionPhases].sort(compareExecutionPhases);
  const timeSortedExecutionPhases = [...executionPhases].sort(compareExecutionPhasesByTime);
  const workflowActivityPhases = timeSortedExecutionPhases.filter(
    (phase) => phase.phaseType === 'workflow_activity'
  );

  return {
    displayActivityPhases: timeSortedExecutionPhases,
    executionPhases,
    sortedExecutionPhases,
    timeSortedExecutionPhases,
    workflowActivityPhases,
  };
};

export const resolveCurrentExecutionStepProgress = ({
  execution,
  steps,
}: {
  execution?: Pick<ExecutionDto, 'currentStepId'>;
  steps?: ExecutionStepDto[];
}) => {
  const currentStepIndex =
    steps && execution?.currentStepId
      ? steps.findIndex((step) => step.id === execution.currentStepId)
      : -1;
  const currentExecutionStep =
    currentStepIndex >= 0 && steps?.[currentStepIndex] ? steps[currentStepIndex] : undefined;

  return {
    currentExecutionStep,
    currentStepIndex,
  };
};

export const buildExecutionPhaseProgressState = ({
  execution,
  steps,
  displayActivityPhases,
  sortedExecutionPhases,
  workflowActivityPhases,
  currentPhase,
  isEnglish,
}: {
  execution?: ExecutionDto;
  steps?: ExecutionStepDto[];
  displayActivityPhases: ExecutionPhaseDto[];
  sortedExecutionPhases: ExecutionPhaseDto[];
  workflowActivityPhases: ExecutionPhaseDto[];
  currentPhase?: ExecutionPhaseDto;
  isEnglish: boolean;
}): ExecutionPhaseProgressState => {
  const { currentExecutionStep, currentStepIndex } = resolveCurrentExecutionStepProgress({
    execution,
    steps,
  });
  const {
    activityProgressCurrent,
    completedActivityCount,
    pendingActivityCount,
    totalLoopCount,
    loopSummary,
  } = buildExecutionActivityProgressSummary({
    displayActivityPhases,
    currentPhase,
    isEnglish,
  });
  const shouldShowCurrentPhaseInfo = shouldShowCurrentExecutionPhaseInfo(execution?.status);

  return {
    activityProgressCurrent,
    completedActivityCount,
    currentExecutionStep,
    currentStepIndex,
    hasWorkflowActivityPhases: workflowActivityPhases.length > 0,
    latestActivityUpdateAt: resolveLatestActivityUpdateAt({
      currentPhase,
      execution,
    }),
    loopSummary,
    pendingActivityCount,
    shouldShowCurrentPhaseInfo,
    shouldShowExecutionSummary: shouldShowExecutionSummary(execution?.status),
    shouldShowLegacySteps: sortedExecutionPhases.length === 0,
    shouldShowLiveProgressInfo: shouldShowCurrentPhaseInfo,
    totalLoopCount,
  };
};

export const buildExecutionListDetailPhaseProgressState = (
  phaseProgressState: Pick<
    ExecutionPhaseProgressState,
    | 'activityProgressCurrent'
    | 'completedActivityCount'
    | 'loopSummary'
    | 'shouldShowCurrentPhaseInfo'
    | 'shouldShowExecutionSummary'
    | 'shouldShowLegacySteps'
    | 'totalLoopCount'
  >
): ExecutionListDetailPhaseProgressState => ({
  selectedCompletedPhaseCount: phaseProgressState.completedActivityCount,
  selectedCurrentPhaseIndex: phaseProgressState.activityProgressCurrent,
  selectedLoopCount: phaseProgressState.totalLoopCount,
  selectedLoopSummary: phaseProgressState.loopSummary,
  shouldShowLegacySteps: phaseProgressState.shouldShowLegacySteps,
  shouldShowSelectedCurrentPhaseInfo: phaseProgressState.shouldShowCurrentPhaseInfo,
  shouldShowSelectedExecutionSummary: phaseProgressState.shouldShowExecutionSummary,
});

export const findCurrentExecutionPhase = (
  displayActivityPhases: ExecutionPhaseDto[],
  currentPhaseKey?: string
): ExecutionPhaseDto | undefined => {
  const latestPhases = [...displayActivityPhases].reverse();

  return (
    latestPhases.find(
      (phase) =>
        phase.phaseKey === currentPhaseKey && ACTIVE_CURRENT_PHASE_STATUSES.includes(phase.status)
    ) ||
    latestPhases.find((phase) => phase.phaseKey === currentPhaseKey) ||
    latestPhases.find((phase) => RUNNING_PHASE_STATUSES.includes(phase.status)) ||
    latestPhases.find((phase) => TAKEOVER_PHASE_STATUSES.includes(phase.status)) ||
    latestPhases[0]
  );
};

export const findLatestPhaseWithReview = (
  sortedExecutionPhases: ExecutionPhaseDto[]
): ExecutionPhaseDto | undefined =>
  [...sortedExecutionPhases].reverse().find((phase) => hasPhaseReviewSignal(phase));

export const resolveTakeoverFocusPhase = ({
  currentPhase,
  latestPhaseWithReview,
}: {
  currentPhase?: ExecutionPhaseDto;
  latestPhaseWithReview?: ExecutionPhaseDto;
}): ExecutionPhaseDto | undefined =>
  hasPhaseReviewSignal(currentPhase) ? currentPhase : latestPhaseWithReview;

export const findFailedExecutionPhaseStep = (
  currentPhase?: ExecutionPhaseDto
): ExecutionPhaseStepDto | undefined => {
  const phaseSteps = getPhaseSteps(currentPhase);
  return (
    phaseSteps.find((step) => FAILED_PHASE_STEP_STATUSES.includes(step.status)) ||
    phaseSteps.find((step) => step.status !== 'completed') ||
    phaseSteps[phaseSteps.length - 1]
  );
};

export const resolveFailedExecutionPhaseStepId = ({
  failedCurrentPhaseStep,
  currentStepId,
}: {
  failedCurrentPhaseStep?: ExecutionPhaseStepDto;
  currentStepId?: string;
}): string | undefined => getExecutionPhaseStepId(failedCurrentPhaseStep) || currentStepId;

export const resolveCurrentPhaseDetailUrl = (
  currentPhase?: ExecutionPhaseDto
): string | undefined => {
  if (!currentPhase) {
    return undefined;
  }

  const phaseSteps = [
    ...getVisiblePhaseSteps({ ...currentPhase, steps: getPhaseSteps(currentPhase) }),
  ].reverse();

  for (const step of phaseSteps) {
    const stepUrl = fixLocalhostLink(extractPhaseStepUrl(step));
    if (stepUrl) {
      return stepUrl;
    }
  }

  return undefined;
};

export const resolveDefaultResumeStepId = ({
  currentPhase,
  failedCurrentPhaseStepId,
}: {
  currentPhase?: ExecutionPhaseDto;
  failedCurrentPhaseStepId?: string;
}): string | undefined => {
  const phaseSteps = getPhaseSteps(currentPhase);
  if (!failedCurrentPhaseStepId) {
    return undefined;
  }

  const failedIndex = phaseSteps.findIndex(
    (step) => getExecutionPhaseStepId(step) === failedCurrentPhaseStepId
  );

  if (failedIndex >= 0 && phaseSteps[failedIndex + 1]) {
    return getExecutionPhaseStepId(phaseSteps[failedIndex + 1]);
  }

  return failedCurrentPhaseStepId;
};

export const buildLatestExecutionReview = (
  sortedExecutionPhases: ExecutionPhaseDto[]
): ExecutionReviewEntry | undefined => {
  const entries = sortedExecutionPhases.flatMap((phase) => {
    const recoveryDecision = asRecord(tryParseJsonValue(phase.recoveryDecision));
    const recoveryComment =
      typeof recoveryDecision?.comment === 'string' && recoveryDecision.comment.trim()
        ? recoveryDecision.comment.trim()
        : undefined;
    const takeoverEntries = getPhaseTakeovers(phase).map((takeover) => ({
      phaseKey: phase.phaseKey,
      phaseName: phase.phaseName,
      note: takeover.resolutionNote || recoveryComment,
      reason: takeover.reason || phase.errorMessage,
      createdAt: takeover.createdAt,
      resolvedAt: takeover.resolvedAt,
      status: takeover.status,
    }));

    if (takeoverEntries.length > 0) {
      return takeoverEntries;
    }
    if (!recoveryComment) {
      return [];
    }

    return [
      {
        phaseKey: phase.phaseKey,
        phaseName: phase.phaseName,
        note: recoveryComment,
        reason: phase.errorMessage,
        createdAt: phase.createdAt,
        resolvedAt: phase.completedAt || phase.updatedAt,
        status: phase.status,
      },
    ];
  });

  const meaningfulEntries = entries.filter((entry) => entry.note || entry.reason);
  meaningfulEntries.sort((left, right) => {
    const leftTime = new Date(left.resolvedAt || left.createdAt || 0).getTime();
    const rightTime = new Date(right.resolvedAt || right.createdAt || 0).getTime();
    return leftTime - rightTime;
  });

  return meaningfulEntries[meaningfulEntries.length - 1];
};

export const shouldShowCurrentExecutionPhaseInfo = (status?: ExecutionStatus): boolean =>
  Boolean(status && EXECUTION_PHASE_INFO_STATUSES.includes(status));

export const shouldShowExecutionSummary = (status?: ExecutionStatus): boolean =>
  Boolean(status && EXECUTION_SUMMARY_STATUSES.includes(status));

export const buildExecutionActivityProgressSummary = ({
  displayActivityPhases,
  currentPhase,
  isEnglish,
}: {
  displayActivityPhases: ExecutionPhaseDto[];
  currentPhase?: ExecutionPhaseDto;
  isEnglish: boolean;
}): ExecutionActivityProgressSummary => {
  const completedActivityCount = displayActivityPhases.filter(
    (phase) => phase.status === 'completed'
  ).length;
  const pendingActivityCount = Math.max(displayActivityPhases.length - completedActivityCount, 0);
  const totalLoopCount = displayActivityPhases.reduce((maxLoop, phase) => {
    const loopIteration = getPhaseLoopIteration(phase);
    return loopIteration && loopIteration > maxLoop ? loopIteration : maxLoop;
  }, 0);
  const activityProgressCurrent = Math.max(
    displayActivityPhases.findIndex((phase) => phase.id === currentPhase?.id),
    0
  );

  return {
    activityProgressCurrent,
    completedActivityCount,
    pendingActivityCount,
    totalLoopCount,
    loopSummary: buildExecutionLoopSummary(displayActivityPhases, isEnglish),
  };
};

export const resolveLatestActivityUpdateAt = ({
  currentPhase,
  execution,
}: {
  currentPhase?: ExecutionPhaseDto;
  execution?: ExecutionDto;
}): string | undefined =>
  currentPhase?.updatedAt ||
  currentPhase?.completedAt ||
  currentPhase?.startedAt ||
  currentPhase?.createdAt ||
  execution?.endedAt ||
  execution?.updatedAt;
