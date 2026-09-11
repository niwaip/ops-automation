export type ResumeStrategy =
  | 'replace_failed_step'
  | 'insert_patch_steps'
  | 'replan_from_current_state';

export interface BrowserActionStep {
  id?: string;
  action: string;
  params?: Record<string, unknown>;
  locator?: {
    type?: 'selector' | 'role' | 'text' | 'label' | 'placeholder' | 'testid';
    strategy?: 'css' | 'role' | 'text' | 'label' | 'placeholder' | 'testid' | 'ref';
    value?: string;
    role?: string;
    name?: string;
  };
  source?: 'ai' | 'manual' | 'manual_takeover';
  backend?: 'cli' | 'chrome-devtools' | 'legacy';
  replayable?: boolean;
  scriptFragment?: string;
  createdAt?: string;
}

export interface TakeoverObservation {
  currentPageUrl?: string;
  title?: string;
  text?: string;
  snapshotPath?: string;
  screenshotPath?: string;
  timestamp?: string;
}

export interface ReconcileAfterTakeoverRequest {
  sessionId: string;
  runtimeSessionId: string;
  backend?: 'cli' | 'chrome-devtools';
  failedStepId?: string;
  failedCommand?: Record<string, unknown>;
  originalCommands: Array<Record<string, unknown>>;
  patchSteps: BrowserActionStep[];
  observation: TakeoverObservation;
}

export interface ReconcileAfterTakeoverResponse {
  strategy: ResumeStrategy;
  explanation: string;
  confidence?: number;
  resumeCommands: Array<Record<string, unknown>>;
}

export interface BrowserPhaseRecoveryResult {
  phaseId: string;
  status: 'recovered' | 'takeover_required' | 'aborted';
  recoveredAt: string;
  details?: Record<string, unknown>;
}
