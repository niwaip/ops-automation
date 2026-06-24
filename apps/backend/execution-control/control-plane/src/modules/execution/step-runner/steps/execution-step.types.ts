export interface CreateBootstrapGotoStepInput {
  executionId: string;
  stepIndex: number;
  url: string;
}

export interface StartStepInput {
  targetJson?: Record<string, unknown>;
  inputJson?: Record<string, unknown>;
}

export interface FinishRuntimeStepInput {
  success: boolean;
  outputJson?: Record<string, unknown> | null;
  errorCode?: string;
  errorMessage?: string | null;
  snapshotId?: string;
  takeoverTriggered?: boolean;
}

export interface MarkStepWaitingInput {
  requiredInputs?: unknown[];
  outputJson?: Record<string, unknown> | null;
  errorCode?: string;
  errorMessage?: string | null;
}

export interface FinishBrowserStepInput {
  success: boolean;
  output?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  snapshotId?: string;
  shouldTakeover: boolean;
}

export interface FinishSystemSkillStepInput {
  success: boolean;
  runtime: string;
  releaseId: string;
  capabilityId: string;
  capabilityVersion?: string | null;
  publishedSkillId: string;
  result?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  logs: string[];
  error?: string | null;
}

export interface InsertPlannedStepsAfterStepInput {
  executionId: string;
  afterStepId: string;
  steps: Array<Record<string, unknown>>;
}
