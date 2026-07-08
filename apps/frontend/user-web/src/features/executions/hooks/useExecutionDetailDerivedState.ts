import React from 'react';
import {
  buildExecutionRuntimeDerivedState,
  buildExecutionSkillNameMap,
  buildExecutionStatusDerivedState,
  buildExecutionWaitingInputState,
  resolveExecutionDisplayRuntimeType,
  resolveExecutionSkillDisplayName,
  resolveWaitingInputSummary,
} from '@/features/executions/lib/executionDerivedState';
import type { UseExecutionDetailBaseQueriesResult } from '@/features/executions/hooks/useExecutionDetailBaseQueries';
import { useExecutionDetailPhaseState } from '@/features/executions/hooks/useExecutionDetailPhaseState';
import { useExecutionDetailResultState } from '@/features/executions/hooks/useExecutionDetailResultState';
import { useExecutionRuntimeSessionQuery } from '@/features/executions/hooks/useExecutionRuntimeSessionQuery';

interface UseExecutionDetailDerivedStateOptions {
  isEnglish: boolean;
  waitingInputDesc: string;
  runtimeSessionLookupEnabled?: boolean;
  baseQueryState: UseExecutionDetailBaseQueriesResult;
}

export function useExecutionDetailDerivedState({
  isEnglish,
  waitingInputDesc,
  runtimeSessionLookupEnabled = true,
  baseQueryState,
}: UseExecutionDetailDerivedStateOptions) {
  const { execution, steps, phasesData, skillsData, releasesData } = baseQueryState;

  const phaseState = useExecutionDetailPhaseState({
    execution,
    steps,
    phasesData,
    isEnglish,
  });

  const resultState = useExecutionDetailResultState({
    execution,
    sortedExecutionPhases: phaseState.sortedExecutionPhases,
  });

  const skillNameMap = React.useMemo(
    () => buildExecutionSkillNameMap(releasesData?.releases, skillsData?.skills),
    [releasesData?.releases, skillsData?.skills]
  );

  const getSkillDisplayName = React.useCallback(
    (skillId?: string) => resolveExecutionSkillDisplayName(skillNameMap, skillId),
    [skillNameMap]
  );

  const { executionInput, requiredInputGroups, requiredInputs, waitingInputStep } = React.useMemo(
    () =>
      buildExecutionWaitingInputState({
        execution,
        steps,
      }),
    [execution, steps]
  );

  const { executionRuntimeSessionId, isBrowserExecution } = React.useMemo(
    () =>
      buildExecutionRuntimeDerivedState({
        execution,
        browserExecutionResult: resultState.effectiveBrowserExecutionResult,
        sortedExecutionPhases: phaseState.sortedExecutionPhases,
      }),
    [execution, phaseState.sortedExecutionPhases, resultState.effectiveBrowserExecutionResult]
  );

  const displayRuntimeType = resolveExecutionDisplayRuntimeType({
    isBrowserExecution,
    runtimeType: execution?.runtimeType,
  });
  const waitingInputSummary = resolveWaitingInputSummary(resultState.semantic, waitingInputDesc);

  const { runtimeSession, stableRuntimeSessionNovncUrl } = useExecutionRuntimeSessionQuery({
    executionId: execution?.id,
    executionStatus: execution?.status,
    executionRuntimeSessionId,
    runtimeSessionLookupEnabled,
  });
  const { isExecutionActive, summaryHeadline } = buildExecutionStatusDerivedState({
    executionStatus: execution?.status,
    normalizedResult: resultState.normalizedResult,
    loopSummaryText: phaseState.loopSummary?.summaryText,
    failureReason: execution?.failureReason,
    takeoverReason: execution?.takeoverReason,
  });

  return {
    ...phaseState,
    ...resultState,
    displayRuntimeType,
    executionInput,
    executionRuntimeSessionId,
    getSkillDisplayName,
    isBrowserExecution,
    isExecutionActive,
    requiredInputGroups,
    requiredInputs,
    runtimeSession,
    stableRuntimeSessionNovncUrl,
    summaryHeadline,
    waitingInputStep,
    waitingInputSummary,
  };
}
