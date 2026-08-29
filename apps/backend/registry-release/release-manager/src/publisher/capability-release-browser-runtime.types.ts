import type {
  BrowserRecordingLoopCondition,
  BrowserRecordingRuntimeStep,
} from '../compiler/browser-recording-runtime.types';
import type {
  CapabilityReleaseDTO,
  ExecuteCapabilityRuntimeResultDTO,
} from '../interfaces';
import type {
  CapabilityReleaseRuntimeAccessors,
  CapabilityReleaseRuntimeExecutionOptions,
} from '../publisher/capability-release-runtime.service';

type BrowserRuntimePlanValidationIssue = {
  message: string;
};

export type BrowserRuntimePlanValidation = {
  valid: boolean;
  errors: BrowserRuntimePlanValidationIssue[];
  degradedMode: boolean;
  degradeReason: string | null;
  executionPlanVersion: string | null;
  trace: Record<string, unknown>;
  outputNames: string[];
  browserRunOutputV2: boolean;
  composition?: Record<string, unknown>;
};

export type BrowserRuntimeMutableState = {
  preserveRuntimeSession: boolean;
  startedAt: string;
  currentPageUrl?: string;
  captureOrdinal: number;
  attemptByStepId: Record<string, number>;
  stepResults: Array<Record<string, unknown>>;
  variables: Record<string, unknown>;
  runtimeEvidence: Record<string, unknown>;
  warnings: Array<{ code: string; message: string; stepId?: string }>;
  contentCandidates?: Array<Record<string, unknown>>;
  logs: string[];
};

export type BrowserRuntimeFailWithAuditInput = {
  message: string;
  status?: 'blocked' | 'takeover_required';
  takeoverReason?: string;
  eventType?: string;
  summary?: string;
  details?: Record<string, unknown>;
};

export type BrowserRuntimeExecutionContext = {
  release: CapabilityReleaseDTO;
  skillId: string;
  options: CapabilityReleaseRuntimeExecutionOptions | undefined;
  accessors: CapabilityReleaseRuntimeAccessors;
  runtimeInput: Record<string, unknown>;
  runtimeSessionId: string;
  runtimeExecutionId: string;
  browserWorkerUrl: string;
  backend: string;
  planValidation: BrowserRuntimePlanValidation;
  runtimeStepsToExecute: BrowserRecordingRuntimeStep[];
  targetRuntimeStep: BrowserRecordingRuntimeStep | null;
  loopPlan: BrowserRecordingLoopCondition | null;
  state: BrowserRuntimeMutableState;
  failWithAudit(
    input: BrowserRuntimeFailWithAuditInput
  ): Promise<ExecuteCapabilityRuntimeResultDTO>;
};
