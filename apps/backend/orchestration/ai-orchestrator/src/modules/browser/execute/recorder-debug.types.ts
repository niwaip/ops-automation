import type {
  BrowserActionRiskLevel,
  BrowserCommand,
  BrowserCommandCandidate,
} from '../intent';
import type {
  RecorderLoopRuntimeStateLike,
  RecorderManualInterventionRecord,
} from '../loop/recorder-loop.types';

export interface BrowserExecuteResponse {
  success: boolean;
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
  regions?: Array<Record<string, unknown>>;
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
  exportArtifacts?: RecorderDebugExportArtifacts;
  loopDraft?: RecorderLoopDraft;
  loopState?: RecorderLoopRuntimeStateLike;
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
}

export interface RecorderDebugChatRequest {
  sessionId?: string;
  runtimeSessionId?: string;
  message: string;
  backend?: 'cli' | 'chrome-devtools' | 'mcp';
  modelId?: string;
  userRoles?: string[];
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
  exportArtifacts?: RecorderDebugExportArtifacts;
  loopDraft?: RecorderLoopDraft;
  loopState?: RecorderLoopRuntimeStateLike;
}
