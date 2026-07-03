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
  };
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
