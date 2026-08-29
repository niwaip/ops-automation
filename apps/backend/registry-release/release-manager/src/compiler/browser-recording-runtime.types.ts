export const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

export type BrowserRecordingRuntimeStep = {
  id: string;
  name: string;
  action: string;
  target?: string;
  args?: Record<string, unknown>;
  outputVar?: string;
  captureProfile?: Record<string, unknown>;
  branch?: {
    conditionFn: string;
    onMatch: 'continue' | 'stop';
    onMismatch: 'continue' | 'stop' | 'takeover';
    takeoverReason?: string;
    description?: string;
  };
  description?: string;
};

export type BrowserRecordingLoopCondition = {
  mode: 'repeat_until';
  stopWhen: {
    read:
      | {
          type: 'count' | 'text';
          key?: string;
          step: BrowserRecordingRuntimeStep;
        }
      | {
          type: 'page_signal';
          key: string;
          step: BrowserRecordingRuntimeStep;
        };
    conditionFn: string;
    description: string;
  };
  maxIterations: number;
  onNoProgress: 'takeover' | 'stop';
  preLoopSteps: BrowserRecordingRuntimeStep[];
  iterationSteps: BrowserRecordingRuntimeStep[];
  postLoopSteps: BrowserRecordingRuntimeStep[];
};

export type BrowserRecordingRequestedStep = {
  name?: string;
  index?: number;
};

export type BrowserRecordingRuntimePlan = {
  backend: string;
  sessionPreferences: {
    mode?: 'interactive' | 'agent';
    enableCodegen?: boolean;
    headless?: boolean;
  };
  runtimeSteps: BrowserRecordingRuntimeStep[];
  runtimeStepsToExecute: BrowserRecordingRuntimeStep[];
  targetRuntimeStep: BrowserRecordingRuntimeStep | null;
  loopPlan: BrowserRecordingLoopCondition | null;
  initialUrl?: string;
};
