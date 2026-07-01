interface RecoveryPhaseStepLike {
  id?: string;
  stepId?: string;
  status?: string;
  errorMessage?: string;
  errorCode?: string;
}

interface RecoveryPhaseLike {
  phaseKey: string;
  status?: string;
  input?: Record<string, unknown>;
  steps?: RecoveryPhaseStepLike[];
}

interface RecoveryExecutionLike {
  currentPhaseKey?: string;
  currentStepId?: string;
  status?: string;
  phases?: RecoveryPhaseLike[];
}

interface ResumeExecutionPayload {
  stepId?: string;
  comment?: string;
}

interface ReconcilePhaseTakeoverPayload {
  comment?: string;
  patch?: Record<string, unknown> | null;
}

interface RecoverableExecutionApi<TExecution> {
  reconcilePhaseTakeover: (
    executionId: string,
    phaseKey: string,
    payload?: ReconcilePhaseTakeoverPayload
  ) => Promise<TExecution>;
  resumePhaseTakeover: (
    executionId: string,
    phaseKey: string,
    payload?: ResumeExecutionPayload
  ) => Promise<TExecution>;
  releaseHumanControl: (
    executionId: string,
    payload?: ResumeExecutionPayload
  ) => Promise<TExecution>;
}

const asPositiveInteger = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;

const getPhaseLoopIteration = (phase?: RecoveryPhaseLike): number | undefined =>
  asPositiveInteger(phase?.input?.loopIteration);

const getFailedPhaseStepId = (phase?: RecoveryPhaseLike): string | undefined => {
  if (!Array.isArray(phase?.steps)) {
    return undefined;
  }

  const failedStep = [...phase.steps]
    .reverse()
    .find((step) => step.status === 'failed' || step.errorMessage || step.errorCode);

  return failedStep?.stepId || failedStep?.id;
};

const getResumeStepId = (
  phase: RecoveryPhaseLike | undefined,
  failedStepId: string | undefined,
  fallbackStepId: string | undefined
): string | undefined => {
  const phaseSteps = Array.isArray(phase?.steps) ? phase.steps : [];
  if (!failedStepId) {
    return fallbackStepId;
  }

  const failedIndex = phaseSteps.findIndex((step) => (step.stepId || step.id) === failedStepId);
  if (failedIndex >= 0 && phaseSteps[failedIndex + 1]) {
    return phaseSteps[failedIndex + 1].stepId || phaseSteps[failedIndex + 1].id || fallbackStepId;
  }

  return failedStepId || fallbackStepId;
};

export interface ResumeHumanControlOptions<TExecution extends RecoveryExecutionLike> {
  executionId: string;
  execution: TExecution;
  executionApi: RecoverableExecutionApi<TExecution>;
  comment?: string;
}

export const resumeHumanControlExecution = async <TExecution extends RecoveryExecutionLike>({
  executionId,
  execution,
  executionApi,
  comment = '同意并继续',
}: ResumeHumanControlOptions<TExecution>): Promise<TExecution> => {
  const currentPhase = execution.phases?.find((phase) => phase.phaseKey === execution.currentPhaseKey);
  const failedStepId = getFailedPhaseStepId(currentPhase);
  const resumeStepId = getResumeStepId(currentPhase, failedStepId, execution.currentStepId);
  const payload: ResumeExecutionPayload = {
    stepId: resumeStepId,
    comment,
  };

  if (execution.currentPhaseKey) {
    if (currentPhase?.status === 'waiting_takeover' && failedStepId) {
      await executionApi.reconcilePhaseTakeover(executionId, execution.currentPhaseKey, {
        comment,
        patch: {
          type: 'resolve_by_human',
          failedStepId,
          ...(getPhaseLoopIteration(currentPhase)
            ? { loopIteration: getPhaseLoopIteration(currentPhase) }
            : {}),
          ...(resumeStepId && resumeStepId !== failedStepId
            ? { resumeFromStepId: resumeStepId }
            : {}),
          note: comment,
        },
      });
    }

    return executionApi.resumePhaseTakeover(executionId, execution.currentPhaseKey, payload);
  }

  return executionApi.releaseHumanControl(executionId, payload);
};
