export type BrowserNlAgentSession = {
  sessionId: string;
  userGoal: string;
  runtimeSessionId?: string;
  currentUrl?: string;
  memory?: Record<string, unknown>;
};

export type BrowserObservationSnapshot = {
  url?: string;
  title?: string;
  text?: string;
  html?: string;
  screenshotUrl?: string;
  metadata?: Record<string, unknown>;
};

export type BrowserAtomicAction = {
  actionId: string;
  tool:
    | 'navigate'
    | 'click'
    | 'type'
    | 'scroll'
    | 'read_page'
    | 'get_text'
    | 'assert_state'
    | 'freeze'
    | 'resume';
  params: Record<string, unknown>;
  rationale?: string;
};

export type BrowserNlAgentTurnResult = {
  status: 'running' | 'blocked' | 'completed' | 'failed';
  observation?: BrowserObservationSnapshot;
  nextActions?: BrowserAtomicAction[];
  message?: string;
  requiresTakeover?: boolean;
};
