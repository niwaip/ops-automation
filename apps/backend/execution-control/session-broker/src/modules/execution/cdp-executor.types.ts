export interface TemplateStep {
  step_id: string;
  step_number?: number;
  action: string;
  params?: Record<string, unknown>;
  locator?: { type: string; value: string };
  wait?: { type: string; value?: string; timeout?: number };
  retry?: { max_attempts: number; delay_ms: number };
  on_fail?: string;
  selector?: string;
  target?: string;
  value?: string;
  url?: string;
  text?: string;
  key?: string;
  duration?: number;
  direction?: string;
  amount?: number;
  output_var?: string;
  description?: string;
  execution_policy?:
    | 'auto_execute'
    | 'require_confirmation'
    | 'require_takeover'
    | 'forbid_in_replay';
  branch?: {
    condition_fn: string;
    on_match: 'continue' | 'stop';
    on_mismatch: 'continue' | 'stop' | 'takeover';
    takeover_reason?: string;
    description?: string;
  };
  capture_profile?: Record<string, any>;
  captureProfile?: Record<string, any>;
}

export interface ExecutionResult {
  success: boolean;
  step_id: string;
  step?: number;
  action?: string;
  error?: string;
  message?: string;
  screenshot?: string;
  text?: string;
  html?: string;
  confirmation_required?: boolean;
  confirmation_reason?: string;
  takeover?: boolean;
  takeover_reason?: string;
  replay_forbidden?: boolean;
  replay_forbidden_reason?: string;
}

export type LoopStopReadType = 'count' | 'text' | 'page_signal';

export type LoopStopRead = {
  type: LoopStopReadType;
  key?: string;
  locator?: { type: string; value: string };
};

export interface TemplateLoopDraft {
  mode?: 'repeat_until';
  eachIteration?: {
    stepIds?: string[];
    capturedFromIndex?: number;
    capturedToIndex?: number;
    stepCount?: number;
  };
  stopWhen?: {
    read?: LoopStopRead;
    conditionFn?: string;
    description?: string;
  };
  maxIterations?: number;
  onNoProgress?: 'takeover' | 'stop';
}

export interface ExecuteStepsOptions {
  loopDraft?: TemplateLoopDraft;
}

export type LoopStopReadPlan =
  | {
      type: 'count' | 'text';
      key?: string;
      step: TemplateStep;
    }
  | {
      type: 'page_signal';
      key: string;
      step: TemplateStep;
    };

export type LoopPlan = {
  mode: 'repeat_until';
  stopWhen: {
    read: LoopStopReadPlan;
    conditionFn: string;
    description: string;
  };
  maxIterations: number;
  onNoProgress: 'takeover' | 'stop';
  preLoopSteps: TemplateStep[];
  iterationSteps: TemplateStep[];
  postLoopSteps: TemplateStep[];
};

export const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};
