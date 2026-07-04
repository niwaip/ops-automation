export interface BrowserCommand {
  tool: string;
  params: Record<string, unknown>;
  description?: string;
  locator?: {
    strategy?: string;
    value?: string;
    expression?: string;
    role?: string;
    name?: string;
    exact?: boolean;
    generatedBy?: string;
    confidence?: number;
    matchedCandidateId?: string;
    resolutionMode?: string;
    ref?: string;
    contextLabel?: string;
    regionId?: string;
  };
  /**
   * v4.1 P0 rollback side-effect classification (doc §2.5).
   * - `none`     : no side effect (snapshot / get_text / observe)
   * - `read`     : read-only (navigate / hover / click that only queries)
   * - `mutate`   : front-end state change without persistence (fill / type_text / expand toggle)
   * - `persist`  : triggers backend persistence (submit / approve / delete / save)
   *
   * When undefined, the rollback service treats it conservatively as `persist`
   * after a retrospective classifier pass (rule layer + optional LLM).
   * The classifier runs once per rollback if any historical command lacks this field.
   */
  sideEffectLevel?: 'none' | 'read' | 'mutate' | 'persist';
  /**
   * Internal metadata: which recorder execution step this command belongs to.
   * Set by RecorderDebugChatExecutionService when capturing pre-action state.
   * Independent of session.history.length — see doc §4.3.4.
   */
  executionIndex?: number;
}

export interface ParseBrowserCommandRequest {
  input: string;
  context?: Record<string, unknown>;
}

export interface BrowserCommandCandidateLocator {
  type: 'ref' | 'css' | 'role' | 'text' | 'testid';
  value: string;
}

export interface BrowserCommandFailureContext {
  lastAction: Record<string, unknown>;
  errorMessage: string;
  errorType?: string;
  retryable?: boolean;
  failedStepIndex?: number;
}

export interface BrowserCommandCandidate {
  candidateId: string;
  kind: 'action' | 'input' | 'field' | 'row' | 'region';
  label: string;
  summary: string;
  source: 'snapshot' | 'probe' | 'row' | 'region' | 'semantic';
  entityType?: string;
  entityId?: string;
  semanticPath?: string[];
  priority?: number;
  score?: number;
  ref?: string;
  role?: string;
  elementId?: string;
  dataTestId?: string;
  text?: string;
  action?: string;
  field?: string;
  stableName?: string;
  row?: {
    index?: number;
    key?: string;
    text?: string;
  };
  region?: {
    name?: string;
    type?: string;
  };
  preferredLocator?: BrowserCommandCandidateLocator;
}

export interface BrowserCommandContext {
  forceAI?: boolean;
  commandType?: string;
  pageType?: string;
  traceId?: string;
  observationSummary?: string;
  currentPageUrl?: string;
  backend?: string;
  lastObservationText?: string;
  availableInputs?: string[];
  availableButtons?: string[];
  availableCandidates?: BrowserCommandCandidate[];
  controlHints?: string[];
  lastFailureContext?: BrowserCommandFailureContext;
}

export type BrowserPlanAction =
  | 'navigate'
  | 'click'
  | 'list_search_results'
  | 'click_result'
  | 'switch_latest_tab'
  | 'close_tab'
  | 'fill'
  | 'screenshot'
  | 'snapshot'
  | 'read_page'
  | 'get_text'
  | 'scroll'
  | 'type_text'
  | 'wait'
  | 'hover'
  | 'press_key'
  | 'search'
  | 'smart_search';

export interface BrowserPlanStep {
  action: BrowserPlanAction;
  params?: Record<string, unknown>;
  description?: string;
}

export interface BrowserPlanResponse {
  steps: BrowserPlanStep[];
  explanation: string;
}

export interface ParseBrowserCommandResponse {
  success: boolean;
  commands: BrowserCommand[];
  explanation: string;
  parserMetadata?: Record<string, unknown>;
}
