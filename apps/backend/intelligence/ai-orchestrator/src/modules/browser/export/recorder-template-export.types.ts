import type { BrowserCommand, BrowserCommandCandidate } from "../intent";
import type {
  RecorderLoopDraftState,
  RecorderManualInterventionRecord,
  RecorderManualInterventionSignal,
} from "../loop";

export interface ObservationLike {
  currentPageUrl?: string;
  title?: string;
  text?: string;
  inputs: Array<Record<string, unknown>>;
  buttons: Array<Record<string, unknown>>;
  candidates?: BrowserCommandCandidate[];
  headings: string[];
  links: string[];
}

export interface SessionLike {
  runtimeSessionId: string;
  currentPageUrl?: string;
  lastObservation?: ObservationLike;
  loopDraft?: RecorderLoopDraftState;
  manualInterventions?: RecorderManualInterventionRecord[];
  history: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    observation?: ObservationLike;
    commands?: BrowserCommand[];
    execution?: {
      results?: Array<Record<string, unknown>>;
    };
  }>;
  executedCommands: BrowserCommand[];
}

export interface TemplateBranchConfigLike {
  condition_fn: string;
  on_match: "continue" | "stop";
  on_mismatch: "continue" | "stop" | "takeover";
  takeover_reason?: string;
  description?: string;
}

export interface TemplateStepArtifactLike {
  step_id: string;
  action: string;
  locator?: {
    type: string;
    value: string;
    ref?: string;
    role?: string;
    name?: string;
    contextLabel?: string;
    regionId?: string;
  };
  params?: Record<string, string | number>;
  output_var?: string;
  branch?: TemplateBranchConfigLike;
  description?: string;
}

export interface OptionalManualInterventionPlan {
  signal?: RecorderManualInterventionSignal;
  pattern?: string;
  description: string;
  takeoverReason: string;
}
