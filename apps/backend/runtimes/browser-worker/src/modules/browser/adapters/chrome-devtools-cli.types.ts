export interface DevtoolsCliSessionState {
  runtimeSessionId: string;
  initialized: boolean;
  controlMode: 'AGENT_RUNNING' | 'HUMAN_CONTROL';
  frozenReason?: string;
  currentPageIndex: number;
  lastUrl?: string;
  lastSnapshotText?: string;
  lastSearchResults?: Array<{
    rank: number;
    uid: string;
    text: string;
    href?: string;
  }>;
}

export interface DevtoolsCliBinary {
  command: string;
  baseArgs: string[];
}

export interface DevtoolsExecResult {
  stdout: string;
  stderr: string;
}

export interface DevtoolsActionResult {
  status: 'success';
  command: string;
  stdout?: string;
  stderr?: string;
  data?: Record<string, unknown>;
  snapshot?: {
    id: string;
    path: string;
  };
}
