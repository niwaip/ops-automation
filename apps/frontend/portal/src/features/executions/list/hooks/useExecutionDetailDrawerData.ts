import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "react-query";
import {
  executionApi,
  ExecutionDto,
  ExecutionPhaseDto,
  ExecutionStepDto,
} from "@/api/execution";
import { runtimeSessionApi } from "@/api/runtimeSession";
import { EXECUTION_ACTIVE_POLLING_STATUSES } from "@/shared/lib/executionStatusMeta";
import { resolveExecutionNormalizedResult } from "@ops/user-core";
import {
  extractBrowserExecutionResult,
  hasBrowserExecutionEvidence,
} from "@/features/executions/shared/browser";
import {
  hasMeaningfulExecutionResult,
  tryParseJsonValue,
} from "@/features/executions/shared/common";
import {
  compareExecutionPhases,
  compareExecutionPhasesByTime,
} from "@/features/executions/shared/phase";
import {
  getRuntimeSessionNovncUrl,
  isLiveRuntimeSessionState,
} from "@/features/executions/shared/runtimeSession";
import { buildExecutionLoopSummary } from "@/features/executions/shared/executionSummary";
import { buildWaitingInputDisplayGroups } from "@/shared/lib/waitingInputDisplay";
import type { RequiredInputField } from "@/features/executions/create/inputFields";
import { extractExecutionDisplayInput } from "@/features/executions/list/listHelpers";
import {
  getPhaseLoopIteration,
  isBrowserWorkflowActivity,
} from "../components/executionDetailDrawerHelpers";

export interface UseExecutionDetailDrawerDataOptions {
  open: boolean;
  executionId?: string;
  skillNameMap: Map<string, string>;
}

export function useExecutionDetailDrawerData({
  open,
  executionId,
  skillNameMap,
}: UseExecutionDetailDrawerDataOptions) {
  const getSkillDisplayName = (skillId?: string) => {
    if (!skillId) return "-";
    return skillNameMap.get(skillId) || skillId;
  };

  const { data: selectedExecution, isLoading: isDetailLoading } = useQuery<
    ExecutionDto,
    Error
  >(
    ["execution-detail", executionId],
    () => executionApi.getById(executionId!),
    {
      enabled: Boolean(open && executionId),
      refetchInterval: (data) => {
        if (!data) return false;
        return EXECUTION_ACTIVE_POLLING_STATUSES.includes(data.status) ? 3000 : false;
      },
    }
  );

  const { data: selectedSteps, isLoading: isStepsLoading } = useQuery<
    ExecutionStepDto[],
    Error
  >(
    ["execution-steps", executionId],
    () => executionApi.getSteps(executionId!),
    {
      enabled: Boolean(open && executionId),
      refetchInterval: () => {
        if (!selectedExecution) return false;
        return EXECUTION_ACTIVE_POLLING_STATUSES.includes(selectedExecution.status)
          ? 3000
          : false;
      },
    }
  );

  const { data: selectedPhasesData } = useQuery<ExecutionPhaseDto[], Error>(
    ["execution-phases", executionId],
    () => executionApi.getPhases(executionId!),
    {
      enabled: Boolean(open && executionId),
      refetchInterval: () => {
        if (!selectedExecution) return false;
        return EXECUTION_ACTIVE_POLLING_STATUSES.includes(selectedExecution.status)
          ? 3000
          : false;
      },
    }
  );

  const selectedExecutionPhases =
    selectedPhasesData || selectedExecution?.phases || [];
  const sortedSelectedExecutionPhases = useMemo(
    () => [...selectedExecutionPhases].sort(compareExecutionPhases),
    [selectedExecutionPhases]
  );
  const timeSortedSelectedExecutionPhases = useMemo(
    () => [...selectedExecutionPhases].sort(compareExecutionPhasesByTime),
    [selectedExecutionPhases]
  );

  const effectiveSelectedResultJson = useMemo(() => {
    const parsedTopLevelResult = tryParseJsonValue(selectedExecution?.resultJson);
    if (hasMeaningfulExecutionResult(parsedTopLevelResult)) {
      return parsedTopLevelResult;
    }
    const phaseWithOutput = [...sortedSelectedExecutionPhases]
      .reverse()
      .find((phase) => hasMeaningfulExecutionResult(tryParseJsonValue(phase.output)));
    return phaseWithOutput ? tryParseJsonValue(phaseWithOutput.output) : undefined;
  }, [selectedExecution?.resultJson, sortedSelectedExecutionPhases]);

  const selectedBrowserExecutionResult = useMemo(
    () =>
      extractBrowserExecutionResult(selectedExecution?.resultJson) ||
      extractBrowserExecutionResult(effectiveSelectedResultJson),
    [effectiveSelectedResultJson, selectedExecution?.resultJson]
  );

  const selectedExecutionRuntimeSessionId =
    selectedExecution?.runtimeSessionId ||
    selectedBrowserExecutionResult?.runtimeSessionId;

  const isSelectedBrowserExecution = useMemo(
    () =>
      hasBrowserExecutionEvidence({
        runtimeType: selectedExecution?.runtimeType,
        runtimeSessionId: selectedExecutionRuntimeSessionId,
        browserExecutionResult: selectedBrowserExecutionResult,
        phases: sortedSelectedExecutionPhases,
      }) ||
      sortedSelectedExecutionPhases.some((phase) => isBrowserWorkflowActivity(phase)),
    [
      selectedBrowserExecutionResult,
      selectedExecution?.runtimeType,
      selectedExecutionRuntimeSessionId,
      sortedSelectedExecutionPhases,
    ]
  );

  const displaySelectedPhases = useMemo(
    () => timeSortedSelectedExecutionPhases,
    [timeSortedSelectedExecutionPhases]
  );

  const isSelectedExecutionActive = Boolean(
    selectedExecution &&
      EXECUTION_ACTIVE_POLLING_STATUSES.includes(selectedExecution.status)
  );
  const shouldShowLegacySteps = sortedSelectedExecutionPhases.length === 0;

  const currentSelectedPhase = useMemo(() => {
    const latestPhases = [...displaySelectedPhases].reverse();
    return (
      latestPhases.find(
        (phase) =>
          phase.phaseKey === selectedExecution?.currentPhaseKey &&
          ["running", "retrying", "waiting_takeover", "resumable", "pending"].includes(
            phase.status
          )
      ) ||
      latestPhases.find(
        (phase) => phase.phaseKey === selectedExecution?.currentPhaseKey
      ) ||
      latestPhases.find((phase) => ["running", "retrying"].includes(phase.status)) ||
      latestPhases.find((phase) =>
        ["waiting_takeover", "resumable", "pending"].includes(phase.status)
      ) ||
      latestPhases[0]
    );
  }, [displaySelectedPhases, selectedExecution?.currentPhaseKey]);

  const shouldShowSelectedCurrentPhaseInfo = Boolean(
    selectedExecution &&
      (selectedExecution.status === "running" ||
        selectedExecution.status === "human_control" ||
        selectedExecution.status === "failed")
  );

  const { data: selectedRuntimeSession } = useQuery(
    ["execution-runtime-session", selectedExecutionRuntimeSessionId],
    () =>
      runtimeSessionApi.getByIdOrExecutionId(
        selectedExecutionRuntimeSessionId!,
        selectedExecution?.id
      ),
    {
      enabled: Boolean(selectedExecutionRuntimeSessionId),
      refetchInterval: (data) => {
        if (isLiveRuntimeSessionState(data?.state)) return 3000;
        return selectedExecution &&
          EXECUTION_ACTIVE_POLLING_STATUSES.includes(selectedExecution.status)
          ? 3000
          : false;
      },
    }
  );

  const selectedRuntimeSessionNovncUrl = getRuntimeSessionNovncUrl(
    selectedRuntimeSession
  );
  const lastKnownSelectedRuntimeSessionNovncUrlRef = useRef<string | undefined>(
    undefined
  );
  useEffect(() => {
    if (selectedRuntimeSessionNovncUrl) {
      lastKnownSelectedRuntimeSessionNovncUrlRef.current =
        selectedRuntimeSessionNovncUrl;
    }
  }, [selectedRuntimeSessionNovncUrl]);
  const stableSelectedRuntimeSessionNovncUrl =
    selectedRuntimeSessionNovncUrl ||
    lastKnownSelectedRuntimeSessionNovncUrlRef.current;

  const selectedExecutionInput = selectedExecution
    ? extractExecutionDisplayInput(selectedExecution)
    : undefined;
  const selectedExecutionNormalizedResult = selectedExecution
    ? resolveExecutionNormalizedResult(selectedExecution)
    : undefined;

  const waitingInputStep =
    selectedExecution?.status === "waiting_input"
      ? selectedSteps?.find(
          (step) =>
            step.id === selectedExecution.currentStepId ||
            (step.type === "input_collection" && step.status === "running")
        )
      : undefined;

  const currentSelectedStep = selectedExecution?.currentStepId
    ? selectedSteps?.find((step) => step.id === selectedExecution.currentStepId)
    : undefined;

  const selectedCompletedPhaseCount = displaySelectedPhases.filter(
    (phase) => phase.status === "completed"
  ).length;

  const selectedLoopCount = displaySelectedPhases.reduce((maxLoop, phase) => {
    const loopIteration = getPhaseLoopIteration(phase);
    return loopIteration && loopIteration > maxLoop ? loopIteration : maxLoop;
  }, 0);

  const shouldShowSelectedExecutionSummary =
    selectedExecution &&
    ["succeeded", "failed", "cancelled"].includes(selectedExecution.status);

  const selectedCurrentPhaseIndex = Math.max(
    displaySelectedPhases.findIndex(
      (phase) => phase.id === currentSelectedPhase?.id
    ),
    0
  );

  const selectedSummaryHeadline =
    selectedExecutionNormalizedResult?.summary ||
    selectedExecutionNormalizedResult?.body ||
    selectedExecutionNormalizedResult?.title ||
    buildExecutionLoopSummary(displaySelectedPhases, false)?.summaryText ||
    selectedExecution?.failureReason ||
    selectedExecution?.takeoverReason ||
    "暂无总结信息";

  const selectedLoopSummary = buildExecutionLoopSummary(
    displaySelectedPhases,
    false
  );

  const requiredInputs = Array.isArray(
    waitingInputStep?.inputJson?.requiredInputs
  )
    ? (waitingInputStep?.inputJson
        ?.requiredInputs as unknown as RequiredInputField[])
    : [];

  const requiredInputGroups = useMemo(
    () => buildWaitingInputDisplayGroups(requiredInputs),
    [requiredInputs]
  );

  return {
    selectedExecution,
    isDetailLoading,
    selectedSteps,
    isStepsLoading,
    displaySelectedPhases,
    currentSelectedPhase,
    currentSelectedStep,
    effectiveSelectedResultJson,
    isSelectedBrowserExecution,
    isSelectedExecutionActive,
    shouldShowLegacySteps,
    selectedRuntimeSession,
    stableSelectedRuntimeSessionNovncUrl,
    selectedExecutionInput,
    selectedExecutionNormalizedResult,
    waitingInputStep,
    requiredInputs,
    requiredInputGroups,
    selectedCompletedPhaseCount,
    selectedLoopCount,
    shouldShowSelectedExecutionSummary,
    selectedCurrentPhaseIndex,
    selectedSummaryHeadline,
    selectedLoopSummary,
    shouldShowSelectedCurrentPhaseInfo,
    getSkillDisplayName,
  };
}
