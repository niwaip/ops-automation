import type { RecorderStatus } from '@/services/recorder.service';

export interface RecorderPageState {
  status: RecorderStatus;
  script: string;
  targetUrl: string;
  error?: string;
}

export interface MCPCommand {
  tool: string;
  params: Record<string, unknown>;
}

export type RecorderPreviewMode = 'idle' | 'shared' | 'session';

export type RecorderTakeoverMode =
  | 'idle'
  | 'required'
  | 'recording'
  | 'reconciling'
  | 'ready_to_resume'
  | 'resuming';

export interface RecorderTakeoverViewState {
  mode: RecorderTakeoverMode;
  runtimeSessionId?: string;
  sessionId?: string;
  backend?: 'cli' | 'chrome-devtools';
  takeoverSessionId?: string;
  reason?: string;
  strategy?: 'replace_failed_step' | 'insert_patch_steps' | 'replan_from_current_state';
  explanation?: string;
  currentPageUrl?: string;
  patchStepCount: number;
  resumeCommandCount: number;
}
