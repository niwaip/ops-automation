import { BrowserActionStep } from './browser-step.types';
import { MCPCommand } from '../adapters/browser-execution.adapter';

export type TakeoverStatus =
  | 'idle'
  | 'required'
  | 'frozen'
  | 'recording'
  | 'reconciling'
  | 'ready_to_resume'
  | 'resuming'
  | 'completed'
  | 'error';

export type ResumeStrategy =
  | 'replace_failed_step'
  | 'insert_patch_steps'
  | 'replan_from_current_state';

export interface FailedCommand {
  tool: string;
  params: Record<string, unknown>;
  description?: string;
  errorMessage?: string;
  errorCode?: string;
}

export interface ObservationSnapshot {
  currentPageUrl?: string;
  title?: string;
  text?: string;
  snapshotPath?: string;
  screenshotPath?: string;
  timestamp: string;
}

export interface PatchScriptMeta {
  rawScript: string;
  lineCount: number;
  parserVersion: string;
  recordedAt: string;
}

export interface StartTakeoverRequest {
  runtimeSessionId: string;
  sessionId?: string;
  backend: 'cli' | 'chrome-devtools';
  failedStepId?: string;
  failedCommand?: FailedCommand;
  reason?: string;
  metadata?: {
    requestedBy?: string;
    source?: 'ui' | 'auto' | 'api';
  };
}

export interface StartTakeoverResponse {
  success: boolean;
  runtimeSessionId: string;
  takeoverSessionId: string;
  status: 'frozen' | 'recording';
  controlMode: 'HUMAN_CONTROL';
  endpoints?: {
    novnc?: string;
    cdp?: string;
  };
  startedAt: string;
}

export interface StopTakeoverRequest {
  runtimeSessionId: string;
  takeoverSessionId: string;
  keepHumanControl?: boolean;
}

export interface StopTakeoverResponse {
  success: boolean;
  runtimeSessionId: string;
  takeoverSessionId: string;
  status: 'reconciling' | 'ready_to_resume';
  patchScript: PatchScriptMeta;
  patchSteps: BrowserActionStep[];
  observation: ObservationSnapshot;
}

export interface ResumeAfterTakeoverRequest {
  runtimeSessionId: string;
  backend: 'cli' | 'chrome-devtools';
  takeoverSessionId?: string;
  strategy?: ResumeStrategy;
  resumeCommands: MCPCommand[];
}

export interface ResumeAfterTakeoverResponse {
  success: boolean;
  runtimeSessionId: string;
  status: 'resuming' | 'completed' | 'error';
  results: Array<Record<string, unknown>>;
  generatedSteps?: BrowserActionStep[];
}

export interface TakeoverSessionState {
  takeoverSessionId: string;
  runtimeSessionId: string;
  sessionId?: string;
  backend: 'cli' | 'chrome-devtools';
  status: TakeoverStatus;
  startedAt: string;
  stoppedAt?: string;
  failedStepId?: string;
  failedCommand?: FailedCommand;
  reason?: string;
  patchScript?: PatchScriptMeta;
  patchSteps?: BrowserActionStep[];
  observation?: ObservationSnapshot;
  strategy?: ResumeStrategy;
  resumeCommands?: MCPCommand[];
}
