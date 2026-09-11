import type {
  TemplateStepAction,
  TemplateStepExecutionPolicy,
} from '@/api/template';
import type { RecorderTakeoverViewState } from '@/features/recorder/lib/types';
import type {
  ReconcileAfterTakeoverResponse,
  RecorderPatchStep,
  RecorderTakeoverObservation,
} from '@/services/recorder.service';

// MCP-style command interface
export interface MCPCommand {
  tool: string;
  params: Record<string, unknown>;
  description?: string;
  locator?: {
    strategy?: string;
    value?: string;
    expression?: string;
    role?: string;
    name?: string;
  };
}

// AI response interface
export interface AICommandResponse {
  success: boolean;
  commands: MCPCommand[];
  explanation: string;
  result?: {
    status: string;
    message?: string;
    screenshot?: string;
  };
}

export interface ParseBrowserCommandPayload {
  input: string;
  context?: {
    commandType?: string;
    currentPageUrl?: string;
    backend?: ExecutionBackend;
  };
}

export interface RecorderDebugObservation {
  currentPageUrl?: string;
  title?: string;
  text?: string;
  inputs?: Array<Record<string, unknown>>;
  buttons?: Array<Record<string, unknown>>;
  headings?: string[];
  links?: string[];
  suggestedParameters?: Array<{
    name: string;
    label: string;
    required: boolean;
    reason: string;
  }>;
  snapshotPath?: string;
  snapshotId?: string;
  snapshotVersion?: number;
  snapshotContentHash?: string;
  reuseEligibility?: 'fresh' | 'stale' | 'reobserve-required';
  staleReason?: string;
}

export type RecorderOutcomeKind = 'action' | 'answer' | 'question';
export type RecorderOutcomeStatus = 'succeeded' | 'partial' | 'blocked' | 'failed' | 'unknown';

export interface RecorderVerificationCheck {
  code: string;
  passed: boolean | 'partial' | 'unknown';
  message: string;
  required?: boolean;
  weight?: number;
  evidencePath?: string;
}

export interface RecorderVerification {
  verifier: string;
  routeReason: 'actionType' | 'goal-pattern' | 'command-family' | 'fallback';
  level: 'tool' | 'page' | 'goal';
  success: boolean | 'partial' | 'unknown';
  confidence: number;
  checks: RecorderVerificationCheck[];
  failureReason?: string;
}

export interface RecorderOutcome {
  kind: RecorderOutcomeKind;
  status: RecorderOutcomeStatus;
  summary: {
    userVisible: string;
    compact: string;
    nextHint?: string;
  };
  verification: RecorderVerification;
  evidence?: {
    before?: RecorderDebugObservation;
    after?: RecorderDebugObservation;
    diff?: Record<string, unknown>;
    toolExecution?: Record<string, unknown>;
  };
  grounding?: Record<string, unknown>;
  artifacts?: {
    snapshotIdBefore?: string;
    snapshotIdAfter?: string;
    snapshotPathBefore?: string;
    snapshotPathAfter?: string;
    screenshotBefore?: string;
    screenshotAfter?: string;
  };
}

export type LoopScope = 'current_list' | 'current_table' | 'current_cards';

export interface RecorderLoopDraft {
  mode: 'repeat_until';
  target: {
    scope: LoopScope;
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

export interface RecorderLoopState {
  rawTokens: string[];
  loopTargetScope?: LoopScope;
  hasLoopStart: boolean;
  hasLoopEnd: boolean;
  hasConditionalBranch: boolean;
  manualInterventionLabels: string[];
  pendingLoopCaptureStartCommandIndex?: number;
  isLoopCaptureActive: boolean;
}

export interface TemplateBranchConfig {
  condition_fn: string;
  on_match: 'continue' | 'stop';
  on_mismatch: 'continue' | 'stop' | 'takeover';
  takeover_reason?: string;
  description?: string;
}

export interface BackendTemplateStepDraft {
  action: TemplateStepAction;
  params?: Record<string, string | number>;
  locator?: { type: string; value: string };
  output_var?: string;
  branch?: TemplateBranchConfig;
  description?: string;
  execution_policy?: TemplateStepExecutionPolicy;
}

export interface BackendTemplateStepPayload extends BackendTemplateStepDraft {
  step_id: string;
}

export interface TemplateStep {
  id: string;
  tool: TemplateStepAction;
  params: Record<string, unknown>;
  description: string;
  timestamp: Date;
  replaceableParams?: Record<string, boolean>;
  output_var?: string;
  branch?: TemplateBranchConfig;
  execution_policy?: TemplateStepExecutionPolicy;
}

export interface RecorderDebugExportArtifacts {
  script?: string;
  guidance?: string;
  templateSteps?: Array<{
    step_id: string;
    action: TemplateStepAction;
    locator?: { type: string; value: string; fallback?: { type: string; value: string } };
    params?: Record<string, string | number>;
    output_var?: string;
    branch?: TemplateBranchConfig;
    description?: string;
    execution_policy?: TemplateStepExecutionPolicy;
  }>;
  loopDraft?: Record<string, unknown>;
  loopPlanPreview?: Array<Record<string, unknown>>;
  skillDraft?: {
    name?: string;
    description?: string;
    invocation?: string;
    parameterOnly?: boolean;
    parameters?: Array<{
      name: string;
      description: string;
      required: boolean;
      exampleValue?: string;
      source?: string;
    }>;
    outputs?: Array<{
      name: string;
      description: string;
      location: string;
    }>;
    usageNotes?: string[];
    usageMarkdown?: string;
    publishPayload?: {
      name?: string;
      description?: string;
      triggerKeywords?: string[];
      paramsSchema?: {
        properties?: Record<
          string,
          {
            type: 'string' | 'number' | 'date' | 'boolean';
            description: string;
            required?: boolean;
            default?: string | number | boolean;
            extractionPrompt?: string;
          }
        >;
        required?: string[];
      };
      executionFlowTemplateIds?: string[];
      executionFlow?: Array<Record<string, unknown>>;
      loopPlanPreview?: Array<Record<string, unknown>>;
      tools?: string[];
      apiEndpoints?: {
        runtimeMetadata?: Record<string, unknown>;
      };
    };
    executionPlan?: {
      backend?: ExecutionBackend;
      runtimeSessionId?: string;
      commands?: MCPCommand[];
      loopDraft?: Record<string, unknown>;
    };
  };
}

export interface RecorderDebugExportResponse {
  sessionId: string;
  runtimeSessionId: string;
  currentPageUrl?: string;
  exportArtifacts: RecorderDebugExportArtifacts;
}

export interface RecorderDebugChatResponse {
  sessionId: string;
  runtimeSessionId: string;
  reply: string;
  status: 'executed' | 'answer' | 'question' | 'completed';
  currentPageUrl?: string;
  observation?: RecorderDebugObservation;
  commands?: MCPCommand[];
  execution?: {
    success?: boolean;
    message?: string;
    results?: Array<Record<string, unknown>>;
  };
  exportArtifacts?: RecorderDebugExportArtifacts;
  loopDraft?: RecorderLoopDraft;
  loopState?: RecorderLoopState;
  outcomeVersion?: 'v1';
  outcome?: RecorderOutcome;
}

export interface TemplateInfo {
  tool: string;
  params: Record<string, unknown>;
  description?: string;
}

export interface BrowserCommandExecutionResult {
  status?: string;
  message?: string;
  screenshot?: string;
  stdout?: string;
  data?: {
    url?: string;
  };
  template_info?: TemplateInfo;
}

export interface BrowserCommandExecutionResponse {
  success?: boolean;
  message?: string;
  results?: BrowserCommandExecutionResult[];
}

export type TakeoverUiMode =
  | 'idle'
  | 'required'
  | 'recording'
  | 'reconciling'
  | 'ready_to_resume'
  | 'resuming';

export interface TakeoverUiState {
  mode: TakeoverUiMode;
  runtimeSessionId?: string;
  sessionId?: string;
  backend?: ExecutionBackend;
  takeoverSessionId?: string;
  reason?: string;
  originalCommands: MCPCommand[];
  failedCommand?: MCPCommand & {
    errorMessage?: string;
  };
  patchSteps: RecorderPatchStep[];
  observation?: RecorderTakeoverObservation;
  strategy?: ReconcileAfterTakeoverResponse['strategy'];
  explanation?: string;
  resumeCommands: MCPCommand[];
}

export interface BrowserInitResponse {
  success?: boolean;
  message?: string;
  endpoints?: {
    novnc?: string;
    cdp?: string;
  };
}

export interface CommandHistoryResult {
  status?: string;
  message?: string;
  screenshot?: string;
  stdout?: string;
  data?: {
    url?: string;
  };
  template_info?: TemplateInfo;
  observation?: RecorderDebugObservation;
  commands?: MCPCommand[];
  execution?: RecorderDebugChatResponse['execution'];
  exportArtifacts?: RecorderDebugExportArtifacts;
  loopDraft?: RecorderLoopDraft;
  loopState?: RecorderLoopState;
  outcomeVersion?: 'v1';
  outcome?: RecorderOutcome;
}

// Command history entry
export interface CommandHistoryEntry {
  id: string;
  type: 'user' | 'ai' | 'system';
  content: string;
  commands?: MCPCommand[];
  result?: CommandHistoryResult;
  timestamp: Date;
  backend?: ExecutionBackend;
  sessionId?: string;
  runtimeSessionId?: string;
  // For template parameter extraction
  replaceable?: boolean;
  commandType?: string;
  rawParam?: string;
}

export interface AIControlsProps {
  onCommandExecuted?: (commands: MCPCommand[]) => void;
  // Browser ready callback
  onBrowserReady?: (ready: boolean, backend?: string) => void;
  // Browser endpoints callback
  onBrowserEndpoints?: (endpoints: { novnc?: string; cdp?: string }) => void;
  onTakeoverStateChange?: (state: RecorderTakeoverViewState) => void;
  // Manual mode props
  recorderStatus?: 'idle' | 'connecting' | 'recording' | 'paused' | 'stopped' | 'error';
  isConnected?: boolean;
  onStartRecording?: (url: string) => void;
  onStopRecording?: () => void;
  onPauseRecording?: () => void;
  onResumeRecording?: () => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  recordedScript?: string;
}

export type ExecutionBackend = 'cli' | 'chrome-devtools';

export interface RollbackConfirmationState {
  sessionId: string;
  targetExecutionIndex: number;
  sessionRevision: number;
  sideEffectDigest: string;
  sideEffects: Array<{
    executionIndex: number;
    classifiedLevel: string;
    description: string;
    matchedKeyword?: string;
  }>;
  message: string;
}

export interface PredefinedCommand {
  value: string;
  label: string;
  prefix: string;
  placeholder: string;
}
