export type BrowserLoopSegment = 'pre_loop' | 'iteration' | 'post_loop' | 'control';

export interface BrowserLoopIterationDraftLike {
  capturedFromIndex?: number;
  capturedToIndex?: number;
  stepIds?: string[];
  stepCount?: number;
}

export interface BrowserLoopStopWhenDraftLike {
  read?: Record<string, unknown>;
  conditionFn?: string;
  description?: string;
}

export interface BrowserLoopDraftLike {
  mode?: 'repeat_until';
  eachIteration?: BrowserLoopIterationDraftLike;
  stopWhen?: BrowserLoopStopWhenDraftLike;
  onNoProgress?: 'takeover' | 'stop';
  maxIterations?: number;
  target?: Record<string, unknown>;
  sampleRow?: Record<string, unknown>;
  updatedAt?: string;
}

export interface BrowserLoopWorkflowPlanLike {
  loopId: string;
  mode: 'repeat_until';
  preLoopStepIds: string[];
  iterationStepIds: string[];
  postLoopStepIds: string[];
  maxIterations: number;
  onNoProgress: 'takeover' | 'stop';
  stopWhen?: BrowserLoopStopWhenDraftLike;
  target?: Record<string, unknown>;
  sampleRow?: Record<string, unknown>;
  updatedAt?: string;
}

export interface BrowserLoopWorkflowStepPartition {
  loopPlan: BrowserLoopWorkflowPlanLike;
  preLoopSteps: Record<string, unknown>[];
  iterationSteps: Record<string, unknown>[];
  postLoopSteps: Record<string, unknown>[];
}

const readNonEmptyString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const readRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
};

const normalizeStepId = (step: Record<string, unknown>, fallbackIndex: number): string =>
  readNonEmptyString(step.step_id, step.id, step.name, step.description) || `template_step_${fallbackIndex + 1}`;

const uniqueStrings = (values: unknown[]): string[] => {
  const result: string[] = [];
  values.forEach((value) => {
    if (typeof value !== 'string' || !value.trim()) {
      return;
    }
    const normalized = value.trim();
    if (!result.includes(normalized)) {
      result.push(normalized);
    }
  });
  return result;
};

export const partitionBrowserTemplateStepsForLoopWorkflow = (input: {
  templateSteps: Record<string, unknown>[];
  loopDraft?: BrowserLoopDraftLike;
  loopId?: string;
}): BrowserLoopWorkflowStepPartition => {
  const templateSteps = Array.isArray(input.templateSteps) ? input.templateSteps : [];
  const loopDraft = readRecord(input.loopDraft) as BrowserLoopDraftLike | undefined;
  const normalizedTemplateSteps = templateSteps.map((step, index) => ({
    ...step,
    step_id: normalizeStepId(step, index),
  }));

  const iterationStepIds = uniqueStrings(loopDraft?.eachIteration?.stepIds || []);
  const firstIterationIndex =
    iterationStepIds.length === 0
      ? -1
      : normalizedTemplateSteps.findIndex((step) => iterationStepIds.includes(String(step.step_id)));
  const lastIterationIndex =
    iterationStepIds.length === 0
      ? -1
      : normalizedTemplateSteps.reduce((lastIndex, step, index) => {
          return iterationStepIds.includes(String(step.step_id)) ? index : lastIndex;
        }, -1);

  const preLoopSteps =
    firstIterationIndex <= 0 ? [] : normalizedTemplateSteps.slice(0, firstIterationIndex);
  const iterationSteps =
    iterationStepIds.length === 0
      ? []
      : normalizedTemplateSteps.filter((step) => iterationStepIds.includes(String(step.step_id)));
  const postLoopSteps =
    lastIterationIndex < 0 || lastIterationIndex >= normalizedTemplateSteps.length - 1
      ? []
      : normalizedTemplateSteps.slice(lastIterationIndex + 1);

  return {
    loopPlan: {
      loopId: readNonEmptyString(input.loopId) || 'browser_loop_workflow_1',
      mode: 'repeat_until',
      preLoopStepIds: preLoopSteps.map((step) => String(step.step_id)),
      iterationStepIds:
        iterationStepIds.length > 0
          ? iterationStepIds
          : iterationSteps.map((step) => String(step.step_id)),
      postLoopStepIds: postLoopSteps.map((step) => String(step.step_id)),
      maxIterations:
        typeof loopDraft?.maxIterations === 'number' && loopDraft.maxIterations > 0
          ? loopDraft.maxIterations
          : 100,
      onNoProgress: loopDraft?.onNoProgress === 'stop' ? 'stop' : 'takeover',
      ...(readRecord(loopDraft?.stopWhen) ? { stopWhen: loopDraft?.stopWhen } : {}),
      ...(readRecord(loopDraft?.target) ? { target: loopDraft?.target } : {}),
      ...(readRecord(loopDraft?.sampleRow) ? { sampleRow: loopDraft?.sampleRow } : {}),
      ...(readNonEmptyString(loopDraft?.updatedAt) ? { updatedAt: loopDraft?.updatedAt } : {}),
    },
    preLoopSteps,
    iterationSteps,
    postLoopSteps,
  };
};
