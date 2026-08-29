import type { BrowserWarningCode } from './browser-warning-codes';
import type { ContentRefV1 } from './content-ref-v1.types';

export type BrowserStepStatus = 'completed' | 'failed' | 'recovered' | 'skipped' | 'blocked' | 'takeover_required';
export type BrowserRunStatus = 'completed' | 'completed_with_warnings' | 'failed' | 'blocked' | 'takeover_required';

export interface BrowserArtifactRef {
  type: string;
  id: string;
  name?: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  metadata?: Record<string, unknown>;
}

export interface BrowserPageCapture {
  pageId: string;
  stepId: string;
  attempt: number;
  captureReason: 'step_completed' | 'step_failed' | 'step_recovered' | 'final';
  url?: string;
  title?: string;
  fingerprint?: string;
  readyState?: string;
  observedAt: string;
  artifactIds: string[];
  content?: ContentRefV1;
}

export interface BrowserStepSummary {
  stepId: string;
  name?: string;
  action: string;
  status: BrowserStepStatus;
  attempt: number;
  startedAt?: string;
  endedAt?: string;
  pageId?: string;
  outputVar?: string;
  error?: { code?: string; message?: string };
  warnings?: Array<BrowserWarningCode | string>;
  metadata?: Record<string, unknown>;
}

export interface BrowserOutputValue {
  value: unknown;
  producerStepId?: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'unknown';
}

export interface BrowserWarning {
  code: BrowserWarningCode | string;
  message: string;
  stepId?: string;
}

export interface BrowserRunOutputV2 {
  schemaVersion: 'browser-run-output/v2';
  run: {
    executionId: string;
    runtimeSessionId: string;
    backend: string;
    status: BrowserRunStatus;
    startedAt: string;
    endedAt: string;
    finalPageId?: string;
    contractDigest: string;
  };
  summary: {
    totalSteps: number;
    completedSteps: number;
    recoveredSteps: number;
    failedSteps: number;
    skippedSteps: number;
  };
  steps: BrowserStepSummary[];
  pages: BrowserPageCapture[];
  artifacts: BrowserArtifactRef[];
  outputs: Record<string, BrowserOutputValue>;
  warnings: BrowserWarning[];
}
