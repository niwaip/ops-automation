import type {
  BrowserActionRiskLevel,
  BrowserCommand,
  BrowserCommandCandidate,
} from '../intent';
import type {
  RecorderLoopRuntimeStateLike,
  RecorderManualInterventionRecord,
} from '../loop';

export interface BrowserExecuteResponse {
  success: boolean;
  recovered?: boolean;
  recovery?: {
    code: 'NAVIGATION_TIMEOUT_RECOVERED';
    expectedUrl: string;
    observedUrl: string;
  };
  results: Array<Record<string, any>>;
  message?: string;
  steps?: Array<Record<string, any>>;
  executedCommands?: BrowserCommand[];
}

export interface RecorderDebugObservation {
  currentPageUrl?: string;
  title?: string;
  text?: string;
  inputs: Array<Record<string, unknown>>;
  buttons: Array<Record<string, unknown>>;
  rows?: Array<Record<string, unknown>>;
  regions?: RecorderObservedRegion[];
  pageSemantics?: Record<string, unknown>;
  candidates?: BrowserCommandCandidate[];
  candidateTrace?: Array<{
    candidateId: string;
    source: string;
    kind: string;
    reasons: string[];
    summary: string;
  }>;
  headings: string[];
  links: string[];
  suggestedParameters: Array<{
    name: string;
    label: string;
    required: boolean;
    reason: string;
  }>;
  snapshotPath?: string;
  observationVersion?: 'v1';
  snapshotId?: string;
  snapshotVersion?: number;
  snapshotContentHash?: string;
  observationFingerprint?: string;
  reuseEligibility?: 'fresh' | 'stale' | 'reobserve-required';
  staleReason?: string;
  capturedAt?: string;
  page?: RecorderObservationPageState;
  textState?: RecorderObservationTextState;
  interactiveState?: RecorderObservationInteractiveState;
  facts?: RecorderPageFact[];
}

export interface RecorderObservationPageState {
  url?: string;
  title?: string;
  snapshotId?: string;
  snapshotVersion?: number;
  snapshotContentHash?: string;
  observationFingerprint?: string;
  snapshotPath?: string;
  capturedAt?: string;
  reuseEligibility?: 'fresh' | 'stale' | 'reobserve-required';
  staleReason?: string;
}

export interface RecorderObservationTextState {
  visibleText?: string;
  salientTexts?: string[];
  headings?: string[];
  links?: string[];
}

export interface RecorderObservationInteractiveState {
  inputs: RecorderObservedNode[];
  buttons: RecorderObservedNode[];
  candidates?: RecorderObservedNode[];
}

export interface RecorderObservedNode {
  ref?: string;
  diffKey?: string;
  role?: string;
  name?: string;
  text?: string;
  contextLabel?: string;
  selected?: boolean;
  disabled?: boolean;
  visible?: boolean;
  value?: string;
  regionId?: string;
  ordinal?: number;
  attributes?: Record<string, string | boolean | number>;
}

export interface RecorderObservedRegion {
  regionId: string;
  label?: string;
  nodeRefs?: string[];
  text?: string;
  entryCount?: number;
  visible?: boolean;
  fields?: Array<Record<string, unknown>>;
  actions?: Array<Record<string, unknown>>;
}

export interface RecorderPageFact {
  type: string;
  value?: string | number | boolean;
  confidence?: number;
  source?: 'structure' | 'text' | 'visual';
}

export interface RecorderNodeStateChange {
  diffKey: string;
  refBefore?: string;
  refAfter?: string;
  fieldsChanged: Array<'selected' | 'disabled' | 'value' | 'visible' | 'text'>;
  before?: Partial<RecorderObservedNode>;
  after?: Partial<RecorderObservedNode>;
}

export interface RecorderTextChange {
  key: string;
  before?: string;
  after?: string;
}

export interface RecorderRegionStateChange {
  regionId: string;
  changeType: 'content' | 'visibility' | 'entry-count';
  before?: string | number | boolean;
  after?: string | number | boolean;
}

export interface RecorderObservationDiff {
  urlChanged?: boolean;
  titleChanged?: boolean;
  interactiveNodeChanges?: RecorderNodeStateChange[];
  salientTextChanges?: RecorderTextChange[];
  regionChanges?: RecorderRegionStateChange[];
}

export interface RecorderGroundedTarget {
  ref?: string;
  role?: string;
  name?: string;
  text?: string;
  contextLabel?: string;
  locator?: {
    strategy?: string;
    value?: string;
  };
  regionId?: string;
  confidence?: number;
}

export type RecorderTargetResolution =
  | 'snapshot-ref'
  | 'semantic-match'
  | 'relative-position'
  | 'vision-region'
  | 'manual';

export interface RecorderGrounding {
  targetCandidates?: RecorderGroundedTarget[];
  chosenTarget?: RecorderGroundedTarget;
  targetResolution?: RecorderTargetResolution;
}

export interface RecorderIntent {
  intentId?: string;
  parentIntentId?: string;
  taskSessionId?: string;
  userGoal: string;
  normalizedGoal?: string;
  actionType?: 'observe' | 'navigate' | 'click' | 'fill' | 'select' | 'extract' | 'loop' | 'export';
  targetHint?: string;
}

export interface RecorderBrowserExecutionSummary {
  success: boolean;
  recovered?: boolean;
  recovery?: BrowserExecuteResponse['recovery'];
  message?: string;
  commandCount: number;
  executedCommandCount: number;
  commands?: BrowserCommand[];
  results?: Array<Record<string, any>>;
}

export interface RecorderEvidence {
  before?: RecorderDebugObservation;
  after?: RecorderDebugObservation;
  diff?: RecorderObservationDiff;
  toolExecution?: RecorderBrowserExecutionSummary;
}

export type RecorderVerifierType =
  | 'click'
  | 'fill'
  | 'navigate'
  | 'search-result-open'
  | 'select'
  | 'detail-open'
  | 'form-submit'
  | 'observation-answer';

export interface RecorderVerificationCheck {
  code:
    | 'tool_command_succeeded'
    | 'url_changed'
    | 'search_submitted'
    | 'result_opened'
    | 'node_state_changed'
    | 'target_visible'
    | 'target_selected'
    | 'detail_panel_changed'
    | 'input_value_written'
    | 'list_count_changed'
    | 'blocking_overlay_detected'
    | 'confirmation_required'
    | 'intent_alignment'
    | 'export_artifacts_generated';
  passed: boolean | 'partial' | 'unknown';
  message: string;
  required?: boolean;
  weight?: number;
  evidencePath?: string;
  level?: 'tool' | 'page' | 'goal';
}

export interface RecorderVerification {
  verifier: RecorderVerifierType;
  routeReason: 'actionType' | 'goal-pattern' | 'command-family' | 'fallback';
  level: 'tool' | 'page' | 'goal';
  success: boolean | 'partial' | 'unknown';
  confidence: number;
  checks: RecorderVerificationCheck[];
  failureReason?: string;
}

export interface RecorderSummary {
  userVisible: string;
  compact: string;
  nextHint?: string;
}

export interface RecorderArtifacts {
  snapshotIdBefore?: string;
  snapshotIdAfter?: string;
  snapshotPathBefore?: string;
  snapshotPathAfter?: string;
  screenshotBefore?: string;
  screenshotAfter?: string;
}

export type RecorderOutcomeKind = 'action' | 'answer' | 'question';

export type RecorderOutcomeStatus = 'succeeded' | 'partial' | 'blocked' | 'failed' | 'unknown';

export interface RecorderOutcome {
  kind: RecorderOutcomeKind;
  status: RecorderOutcomeStatus;
  intent: RecorderIntent;
  evidence: RecorderEvidence;
  grounding?: RecorderGrounding;
  verification: RecorderVerification;
  summary: RecorderSummary;
  artifacts?: RecorderArtifacts;
}

export interface RecorderDebugPendingDisambiguationCandidate {
  index: number;
  ref: string;
  role?: string;
  text: string;
}

export interface RecorderDebugPendingDisambiguation {
  command: BrowserCommand;
  targetLabel: string;
  candidates: RecorderDebugPendingDisambiguationCandidate[];
}

export interface RecorderDebugPendingRiskConfirmation {
  commands: BrowserCommand[];
  explanation: string;
  riskLevel: BrowserActionRiskLevel;
  reason: string;
}

export interface RecorderLoopDraft {
  mode: 'repeat_until';
  target: {
    scope: 'current_list' | 'current_table' | 'current_cards';
    regionId?: string;
    currentPageUrl?: string;
    match?: {
      field?: string;
      operator?: 'equals' | 'contains' | 'lt' | 'gt';
      value?: string | number | boolean;
    };
  };
  sampleRow?: {
    rowKey?: string;
    entityType?: string;
    entityId?: string;
    semanticPath?: string[];
  };
  eachIteration?: {
    capturedFromIndex?: number;
    capturedToIndex?: number;
    stepIds: string[];
    stepCount: number;
  };
  stopWhen?: {
    read:
      | { type: 'count' | 'text'; locator: { type: string; value: string } }
      | { type: 'page_signal'; key: string };
    conditionFn: string;
    description: string;
  };
  onNoProgress?: 'takeover' | 'stop';
  maxIterations?: number;
  updatedAt?: string;
}

export interface RecorderLoopDraftRequest {
  sessionId?: string;
  runtimeSessionId?: string;
  backend?: 'cli' | 'chrome-devtools' | 'mcp';
  loopDraft: RecorderLoopDraft;
}

export interface RecorderDebugExportArtifacts {
  script: string;
  guidance: string;
  templateSteps?: Array<Record<string, unknown>>;
  loopDraft?: RecorderLoopDraft;
  loopPlanPreview?: Array<Record<string, unknown>>;
  scriptValidation?: {
    syntaxValid: boolean;
    warnings: string[];
  };
  skillDraft: {
    name: string;
    description: string;
    invocation: string;
    parameterOnly: true;
    parameters: Array<{
      name: string;
      description: string;
      required: boolean;
      exampleValue?: string;
      source?: string;
    }>;
    outputs: Array<{
      name: string;
      description: string;
      location: string;
    }>;
    usageNotes: string[];
    usageMarkdown: string;
    publishPayload: {
      name: string;
      description: string;
      triggerKeywords: string[];
      paramsSchema: {
        properties: Record<
          string,
          {
            type: 'string' | 'number' | 'date' | 'boolean';
            description: string;
            required?: boolean;
            default?: string | number | boolean;
            extractionPrompt?: string;
          }
        >;
        required: string[];
      };
      executionFlowTemplateIds: string[];
      executionFlow: Array<Record<string, unknown>>;
      loopPlanPreview?: Array<Record<string, unknown>>;
      tools: string[];
      apiEndpoints: {
        runtimeMetadata: Record<string, unknown>;
      };
    };
    executionPlan: {
      backend: 'cli' | 'chrome-devtools' | 'mcp';
      runtimeSessionId: string;
      commands: BrowserCommand[];
      templateSteps?: Array<Record<string, unknown>>;
      loopDraft?: RecorderLoopDraft;
    };
    commands: BrowserCommand[];
  };
}

export interface RecorderDebugTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  commands?: BrowserCommand[];
  execution?: BrowserExecuteResponse;
  observation?: RecorderDebugObservation;
  outcomeVersion?: 'v1';
  outcome?: RecorderOutcome;
  exportArtifacts?: RecorderDebugExportArtifacts;
  loopDraft?: RecorderLoopDraft;
  loopState?: RecorderLoopRuntimeStateLike;
  compressed?: boolean;
  compressedReason?: string;
  /**
   * v4.1 P0 (doc §4.3.4): which recorder execution step this turn was produced by.
   * Independent of history.length (which mixes user + assistant turns).
   * Used by rollback to filter assistant turns: `turn.executionIndex < target` survives.
   * Undefined on turns not produced by a real browser execution (pure user messages, system notes).
   */
  executionIndex?: number;
}

export interface RecorderDebugSession {
  sessionId: string;
  runtimeSessionId: string;
  backend: 'cli' | 'chrome-devtools' | 'mcp';
  browserInitialized: boolean;
  currentPageUrl?: string;
  lastObservation?: RecorderDebugObservation;
  loopDraft?: RecorderLoopDraft;
  pendingLoopCaptureStartCommandIndex?: number;
  manualInterventions?: RecorderManualInterventionRecord[];
  history: RecorderDebugTurn[];
  executedCommands: BrowserCommand[];
  pendingDisambiguation?: RecorderDebugPendingDisambiguation;
  pendingRiskConfirmation?: RecorderDebugPendingRiskConfirmation;
  createdAt: string;
  updatedAt: string;
  /**
   * v4.1 P0 (doc §4.3.4): monotonic execution counter, independent of history.length.
   * Starts at 1 (so pre-action state for execution N can be captured before N is dispatched).
   * Pre-action state for execution N is captured BEFORE executeAndResolve runs;
   * the assistant turn produced by execution N carries executionIndex=N on its metadata.
   * On rollback to N: nextExecutionIndex is set back to N so the next execution re-uses slot N.
   */
  nextExecutionIndex?: number;
  /**
   * v4.1 P0 (doc §5.2): version stamp for concurrency control.
   * Increments only on chat commit / rollback commit / reset.
   * Does NOT increment on observation refresh or requires_confirmation responses
   * that haven't actually mutated session state.
   * P1 will use this to invalidate stale pendingRecoverySuggestion entries.
   */
  revision?: number;
  /**
   * v4.1 P0 (doc §9.2.2): index of captured pre-action state per execution step.
   * Keyed by executionIndex. Persisted alongside session so it survives orchestrator restart.
   * Worker owns the actual state files; this index only holds the opaque stateHandle + metadata.
   */
  stateSnapshots?: Record<number, RecorderStateSnapshotMeta>;
}

/**
 * v4.1 P0 (doc §9.2.2): metadata for a captured pre-action state.
 * The stateHandle is opaque to ai-orchestrator — worker owns the actual file path.
 */
export interface RecorderStateSnapshotMeta {
  executionIndex: number;
  stateHandle: string;
  runtimeSessionId: string;
  url?: string;
  capturedAt: string;
  partial?: boolean;
  reason?: string;
}

export interface RecorderDebugChatRequest {
  sessionId?: string;
  runtimeSessionId?: string;
  message: string;
  backend?: 'cli' | 'chrome-devtools' | 'mcp';
  modelId?: string;
  userRoles?: string[];
}

export interface RecorderDebugExportRequest extends Omit<RecorderDebugChatRequest, 'message'> {
  userGoal?: string;
}

export interface RecorderDebugChatResponse {
  sessionId: string;
  runtimeSessionId: string;
  reply: string;
  status: 'executed' | 'answer' | 'question' | 'completed';
  browserReady: boolean;
  currentPageUrl?: string;
  observation?: RecorderDebugObservation;
  commands?: BrowserCommand[];
  execution?: BrowserExecuteResponse;
  outcomeVersion?: 'v1';
  outcome?: RecorderOutcome;
  exportArtifacts?: RecorderDebugExportArtifacts;
  loopDraft?: RecorderLoopDraft;
  loopState?: RecorderLoopRuntimeStateLike;
}
