import type { RecorderManualInterventionSignal } from '../loop';

export const BROWSER_RECORDING_EXECUTION_PLAN_VERSION = 'browser-recording-ir/v1';

type BrowserRecordingCommandLike = Record<string, unknown>;

type BrowserRecordingParameterLike = {
  name: string;
  description: string;
  required: boolean;
  exampleValue?: string;
  source?: string;
};

type BrowserRecordingOutputLike = {
  name: string;
  description: string;
  location: string;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
};

type BrowserRecordingTraceLike = {
  recorderSessionId?: string;
  exportArtifactId?: string;
};

type BrowserRecordingManualInterventionLike = {
  label: string;
  behavior: 'stop_if_present' | 'optional_takeover_if_present';
  startCommandIndex?: number;
  endCommandIndex?: number;
  signal?: RecorderManualInterventionSignal;
};

export type BrowserRecordingExecutionPlanLike = {
  executionPlanVersion: typeof BROWSER_RECORDING_EXECUTION_PLAN_VERSION;
  backend: string;
  runtimeSessionId: string;
  commands: BrowserRecordingCommandLike[];
  templateSteps?: Array<Record<string, unknown>>;
  loopDraft?: Record<string, unknown>;
  manualInterventions?: BrowserRecordingManualInterventionLike[];
  parameters: BrowserRecordingParameterLike[];
  outputs: BrowserRecordingOutputLike[];
  runtimeHints: Record<string, unknown>;
  executionLimits: Record<string, unknown>;
  trace: BrowserRecordingTraceLike;
};

export const buildBrowserRecordingExecutionPlan = (input: {
  backend: string;
  runtimeSessionId: string;
  commands: BrowserRecordingCommandLike[];
  templateSteps?: Array<Record<string, unknown>>;
  loopDraft?: Record<string, unknown>;
  manualInterventions?: BrowserRecordingManualInterventionLike[];
  parameters: BrowserRecordingParameterLike[];
  outputs: BrowserRecordingOutputLike[];
  trace: BrowserRecordingTraceLike;
}): BrowserRecordingExecutionPlanLike => ({
  executionPlanVersion: BROWSER_RECORDING_EXECUTION_PLAN_VERSION,
  backend: input.backend,
  runtimeSessionId: input.runtimeSessionId,
  commands: input.commands,
  ...(input.templateSteps ? { templateSteps: input.templateSteps } : {}),
  ...(input.loopDraft ? { loopDraft: input.loopDraft } : {}),
  ...(input.manualInterventions?.length
    ? { manualInterventions: input.manualInterventions }
    : {}),
  parameters: input.parameters,
  outputs: input.outputs,
  runtimeHints: {
    sourceType: 'browser_recording',
    parameterMode: 'collected_only',
    fixedPlan: true,
    ...(input.manualInterventions?.length
      ? {
          manualInterventions: input.manualInterventions.map((item) => ({
            label: item.label,
            behavior: item.behavior,
          })),
        }
      : {}),
  },
  executionLimits: {
    maxCommandCount: input.commands.length,
    hasLoop: Boolean(input.loopDraft),
  },
  trace: {
    ...(input.trace.recorderSessionId ? { recorderSessionId: input.trace.recorderSessionId } : {}),
    ...(input.trace.exportArtifactId ? { exportArtifactId: input.trace.exportArtifactId } : {}),
  },
});
