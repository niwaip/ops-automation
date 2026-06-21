import { BrowserCommand } from '../intent/browser-command.service';

export type LoopScope = 'current_list' | 'current_table' | 'current_cards';

export type RecorderManualInterventionBehavior =
  | 'stop_if_present'
  | 'optional_takeover_if_present';

export type RecorderManualInterventionReadMethod =
  | 'innerText'
  | 'textContent'
  | 'value'
  | 'attribute'
  | 'visible';

export interface RecorderManualInterventionSignal {
  selector: string;
  method: RecorderManualInterventionReadMethod;
  attribute?: string;
  expectedValue?: string;
  fallbackPattern?: string;
  precheckBeforeRecordedCommands?: boolean;
}

export interface RecorderManualInterventionToken {
  label: string;
  behavior?: RecorderManualInterventionBehavior;
  signal?: RecorderManualInterventionSignal;
}

export interface RecorderManualInterventionRecord {
  id: string;
  label: string;
  behavior: RecorderManualInterventionBehavior;
  createdAt: string;
  startCommandIndex?: number;
  endCommandIndex?: number;
  signal?: RecorderManualInterventionSignal;
}

export interface RecorderLoopDraftState {
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

export interface RecorderControlTokenStateLike {
  cleanedMessage: string;
  rawTokens: string[];
  loopTargetScope?: LoopScope;
  hasLoopStart: boolean;
  hasLoopEnd: boolean;
  hasConditionalBranch: boolean;
  manualInterventions: RecorderManualInterventionToken[];
  manualInterventionLabels: string[];
}

export interface RecorderLoopRuntimeStateLike {
  rawTokens: string[];
  loopTargetScope?: LoopScope;
  hasLoopStart: boolean;
  hasLoopEnd: boolean;
  hasConditionalBranch: boolean;
  manualInterventionLabels: string[];
  pendingLoopCaptureStartCommandIndex?: number;
  isLoopCaptureActive: boolean;
}

export interface RecorderObservationLike {
  currentPageUrl?: string;
}

export interface RecorderSessionLike {
  currentPageUrl?: string;
  loopDraft?: RecorderLoopDraftState;
  pendingLoopCaptureStartCommandIndex?: number;
  manualInterventions?: RecorderManualInterventionRecord[];
  history: Array<{
    role?: string;
    content: string;
  }>;
  executedCommands: BrowserCommand[];
}

export interface TemplateStepLike {
  step_id: string;
  action: string;
  locator?: {
    type?: string;
    value?: string;
  };
  params?: Record<string, unknown>;
  description?: string;
}
