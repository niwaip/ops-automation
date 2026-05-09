export type BrowserExecutionBackend = 'cli' | 'chrome-devtools' | 'mcp';

export interface BrowserSessionPreferences {
  mode?: 'interactive' | 'agent';
  enableCodegen?: boolean;
  headless?: boolean;
}

export interface BrowserEndpoints {
  novnc?: string;
  cdp?: string;
  vnc?: string;
}

export type BrowserSessionStatus =
  | 'ready'
  | 'recording'
  | 'executing'
  | 'paused'
  | 'frozen'
  | 'closed'
  | 'error';

export interface BrowserRuntimeSessionState {
  runtimeSessionId: string;
  backend: BrowserExecutionBackend;
  status: BrowserSessionStatus;
  currentUrl?: string;
  endpoints?: BrowserEndpoints;
  controlMode?: 'AGENT_RUNNING' | 'HUMAN_CONTROL';
  reason?: string;
  updatedAt: string;
}
