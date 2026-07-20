import type { CapabilityRelease } from '@/api/capabilities';
import type { ExecutionDto, ExecutionPhaseDto, ExecutionStatus, ExecutionStepDto } from '@/api/execution';
import {
  hasBrowserExecutionEvidence,
  type BrowserExecutionResultViewModel,
} from '@/features/executions/shared/lib/browser';
import { isBrowserWorkflowActivity } from '@/features/executions/detail/lib/executionDetailQueryUtils';
import type { RequiredInputField } from '@/features/executions/create/lib/inputFields';
import { extractExecutionDisplayInput } from '@/features/executions/list/lib/listHelpers';
import { isExecutionActivePollingStatus } from '@/features/executions/shared/lib/runtimeSession';
import { buildWaitingInputDisplayGroups } from '@/shared/lib/waitingInputDisplay';

interface ExecutionNormalizedResultLike {
  summary?: string;
  body?: string;
  title?: string;
}

interface ExecutionSemanticLike {
  summary?: string | null;
}

interface ExecutionSkillLike {
  id: string;
  name: string;
}

interface ExecutionRuntimeDerivedStateOptions {
  execution?: Pick<ExecutionDto, 'runtimeType' | 'runtimeSessionId'>;
  browserExecutionResult?: BrowserExecutionResultViewModel | null;
  sortedExecutionPhases: ExecutionPhaseDto[];
}

interface ExecutionWaitingInputStateOptions {
  execution?: ExecutionDto;
  steps?: ExecutionStepDto[];
}

export interface ExecutionWaitingInputState {
  currentStep?: ExecutionStepDto;
  executionInput?: unknown;
  requiredInputGroups: ReturnType<typeof buildRequiredInputGroups>;
  requiredInputs: RequiredInputField[];
  waitingInputStep?: ExecutionStepDto;
}

export interface ExecutionRuntimeDerivedState {
  executionRuntimeSessionId?: string;
  isBrowserExecution: boolean;
}

export interface ExecutionListDetailDerivedState {
  currentSelectedStep?: ExecutionStepDto;
  isSelectedBrowserExecution: ExecutionRuntimeDerivedState['isBrowserExecution'];
  requiredInputGroups: ExecutionWaitingInputState['requiredInputGroups'];
  requiredInputs: ExecutionWaitingInputState['requiredInputs'];
  selectedExecutionInput: ExecutionWaitingInputState['executionInput'];
  selectedExecutionRuntimeSessionId?: ExecutionRuntimeDerivedState['executionRuntimeSessionId'];
  waitingInputStep?: ExecutionWaitingInputState['waitingInputStep'];
}

export const buildExecutionSkillNameMap = (
  releases: CapabilityRelease[] = [],
  skills: ExecutionSkillLike[] = []
): Map<string, string> => {
  const map = new Map<string, string>();

  releases.forEach((release) => {
    if (!release.publishedSkillId) {
      return;
    }

    map.set(
      release.publishedSkillId,
      release.sourceName || release.sourceId || release.publishedSkillId
    );
  });

  skills.forEach((skill) => {
    if (!map.has(skill.id)) {
      map.set(skill.id, skill.name);
    }
  });

  return map;
};

export const resolveExecutionSkillDisplayName = (
  skillNameMap: ReadonlyMap<string, string>,
  skillId?: string
): string => {
  if (!skillId) {
    return '-';
  }

  return skillNameMap.get(skillId) || skillId;
};

export const findWaitingInputStep = (
  execution?: Pick<ExecutionDto, 'status' | 'currentStepId'>,
  steps?: ExecutionStepDto[]
): ExecutionStepDto | undefined =>
  execution?.status === 'waiting_input'
    ? steps?.find(
        (step) =>
          step.id === execution.currentStepId ||
          (step.type === 'input_collection' && step.status === 'running')
      )
    : undefined;

export const findCurrentExecutionStep = (
  execution?: Pick<ExecutionDto, 'currentStepId'>,
  steps?: ExecutionStepDto[]
): ExecutionStepDto | undefined =>
  execution?.currentStepId ? steps?.find((step) => step.id === execution.currentStepId) : undefined;

export const resolveExecutionDisplayInput = (execution?: ExecutionDto) =>
  execution ? extractExecutionDisplayInput(execution) : undefined;

export const getRequiredInputFields = (
  waitingInputStep?: ExecutionStepDto
): RequiredInputField[] =>
  Array.isArray(waitingInputStep?.inputJson?.requiredInputs)
    ? (waitingInputStep.inputJson.requiredInputs as unknown as RequiredInputField[])
    : [];

export const buildRequiredInputGroups = (requiredInputs: RequiredInputField[]) =>
  buildWaitingInputDisplayGroups(requiredInputs);

export const buildExecutionWaitingInputState = ({
  execution,
  steps,
}: ExecutionWaitingInputStateOptions): ExecutionWaitingInputState => {
  const waitingInputStep = findWaitingInputStep(execution, steps);
  const requiredInputs = getRequiredInputFields(waitingInputStep);
  const requiredInputGroups = buildRequiredInputGroups(requiredInputs);
  const currentStep = findCurrentExecutionStep(execution, steps);
  const executionInput = resolveExecutionDisplayInput(execution);

  return {
    currentStep,
    executionInput,
    requiredInputGroups,
    requiredInputs,
    waitingInputStep,
  };
};

export const findLatestPhaseRuntimeSessionId = (
  sortedExecutionPhases: ExecutionPhaseDto[]
): string | undefined =>
  [...sortedExecutionPhases]
    .reverse()
    .find(
      (phase) => typeof phase.runtimeSessionId === 'string' && phase.runtimeSessionId.trim().length > 0
    )?.runtimeSessionId;

export const resolveExecutionRuntimeSessionId = ({
  executionRuntimeSessionId,
  browserExecutionResult,
  phaseRuntimeSessionId,
}: {
  executionRuntimeSessionId?: string;
  browserExecutionResult?: BrowserExecutionResultViewModel | null;
  phaseRuntimeSessionId?: string;
}): string | undefined =>
  executionRuntimeSessionId || browserExecutionResult?.runtimeSessionId || phaseRuntimeSessionId;

export const buildExecutionRuntimeDerivedState = ({
  execution,
  browserExecutionResult,
  sortedExecutionPhases,
}: ExecutionRuntimeDerivedStateOptions): ExecutionRuntimeDerivedState => {
  const phaseRuntimeSessionId = findLatestPhaseRuntimeSessionId(sortedExecutionPhases);
  const executionRuntimeSessionId = resolveExecutionRuntimeSessionId({
    executionRuntimeSessionId: execution?.runtimeSessionId,
    browserExecutionResult,
    phaseRuntimeSessionId,
  });
  const isBrowserExecution = resolveIsBrowserExecution({
    runtimeType: execution?.runtimeType,
    executionRuntimeSessionId,
    browserExecutionResult,
    sortedExecutionPhases,
  });

  return {
    executionRuntimeSessionId,
    isBrowserExecution,
  };
};

export const buildExecutionListDetailDerivedState = ({
  runtimeDerivedState,
  waitingInputState,
}: {
  runtimeDerivedState: ExecutionRuntimeDerivedState;
  waitingInputState: ExecutionWaitingInputState;
}): ExecutionListDetailDerivedState => ({
  currentSelectedStep: waitingInputState.currentStep,
  isSelectedBrowserExecution: runtimeDerivedState.isBrowserExecution,
  requiredInputGroups: waitingInputState.requiredInputGroups,
  requiredInputs: waitingInputState.requiredInputs,
  selectedExecutionInput: waitingInputState.executionInput,
  selectedExecutionRuntimeSessionId: runtimeDerivedState.executionRuntimeSessionId,
  waitingInputStep: waitingInputState.waitingInputStep,
});

export const resolveIsBrowserExecution = ({
  runtimeType,
  executionRuntimeSessionId,
  browserExecutionResult,
  sortedExecutionPhases,
}: {
  runtimeType?: string | null;
  executionRuntimeSessionId?: string;
  browserExecutionResult?: BrowserExecutionResultViewModel | null;
  sortedExecutionPhases: ExecutionPhaseDto[];
}): boolean =>
  Boolean(
    hasBrowserExecutionEvidence({
      runtimeType: runtimeType || undefined,
      runtimeSessionId: executionRuntimeSessionId,
      browserExecutionResult,
      phases: sortedExecutionPhases,
    }) || sortedExecutionPhases.some((phase) => isBrowserWorkflowActivity(phase))
  );

export const resolveExecutionDisplayRuntimeType = ({
  isBrowserExecution,
  runtimeType,
}: {
  isBrowserExecution: boolean;
  runtimeType?: string | null;
}): string => (isBrowserExecution ? 'browser' : runtimeType || '-');

export const resolveWaitingInputSummary = (
  semantic: ExecutionSemanticLike | undefined,
  waitingInputDesc: string
): string =>
  typeof semantic?.summary === 'string' && semantic.summary.trim()
    ? semantic.summary.trim()
    : waitingInputDesc;

export const resolveExecutionSummaryHeadline = ({
  normalizedResult,
  loopSummaryText,
  failureReason,
  takeoverReason,
}: {
  normalizedResult?: ExecutionNormalizedResultLike;
  loopSummaryText?: string;
  failureReason?: string | null;
  takeoverReason?: string | null;
}): string | undefined =>
  normalizedResult?.summary ||
  normalizedResult?.body ||
  normalizedResult?.title ||
  loopSummaryText ||
  failureReason ||
  takeoverReason ||
  undefined;

export const buildExecutionSummaryState = ({
  normalizedResult,
  loopSummaryText,
  failureReason,
  takeoverReason,
  fallbackHeadline,
}: {
  normalizedResult?: ExecutionNormalizedResultLike;
  loopSummaryText?: string;
  failureReason?: string | null;
  takeoverReason?: string | null;
  fallbackHeadline?: string;
}) => ({
  summaryHeadline:
    resolveExecutionSummaryHeadline({
      normalizedResult,
      loopSummaryText,
      failureReason,
      takeoverReason,
    }) || fallbackHeadline,
});

export const buildExecutionStatusDerivedState = ({
  executionStatus,
  normalizedResult,
  loopSummaryText,
  failureReason,
  takeoverReason,
  fallbackSummaryHeadline,
}: {
  executionStatus?: ExecutionStatus;
  normalizedResult?: ExecutionNormalizedResultLike;
  loopSummaryText?: string;
  failureReason?: string | null;
  takeoverReason?: string | null;
  fallbackSummaryHeadline?: string;
}) => {
  const { summaryHeadline } = buildExecutionSummaryState({
    normalizedResult,
    loopSummaryText,
    failureReason,
    takeoverReason,
    fallbackHeadline: fallbackSummaryHeadline,
  });

  return {
    isExecutionActive: isExecutionActivePollingStatus(executionStatus),
    summaryHeadline,
  };
};
