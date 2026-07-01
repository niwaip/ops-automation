import type {
  ApprovalStatus,
  ExecutionSemantic,
  ExecutionStatus,
  ExecutionStepStatus,
} from '@ops/backend-execution-core';

export type { ApprovalStatus, ExecutionSemantic, ExecutionStatus, ExecutionStepStatus };

export interface WorkflowResultExecution {
  status?: 'success' | 'partial_success' | 'failed' | 'cancelled';
  executionId?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
}

export interface WorkflowResultTrigger {
  type?: 'manual' | 'schedule' | 'api' | 'resume';
  scheduleId?: string;
  scheduledAt?: string;
  windowStart?: string;
  windowEnd?: string;
}

export interface WorkflowResultNextAction {
  type?: string;
  label?: string;
  value?: string;
}

export interface WorkflowResultArtifact {
  type?: string;
  name?: string;
  label?: string;
  downloadUrl?: string;
  url?: string;
  path?: string;
  mimeType?: string;
}

export type WorkflowResultTextFormat = 'plain_text' | 'markdown';

export interface WorkflowResultPresentation {
  preferAiSummary?: boolean;
  preferStructuredView?: boolean;
  chatSummary?: string;
  notificationSummary?: string;
  summaryFormat?: WorkflowResultTextFormat;
  detailText?: string;
  detailFormat?: WorkflowResultTextFormat;
}

export interface WorkflowResultBusinessSection {
  resultType?: string;
  title?: string;
  summary?: string;
  businessData?: unknown;
  metrics?: Record<string, unknown>;
  nextActions?: WorkflowResultNextAction[];
}

export interface WorkflowResultEnvelope {
  execution?: WorkflowResultExecution;
  trigger?: WorkflowResultTrigger;
  result?: WorkflowResultBusinessSection;
  artifacts?: WorkflowResultArtifact[];
  presentation?: WorkflowResultPresentation;
  delivery?: Record<string, unknown>;
}

export interface NormalizedExecutionResult {
  envelope: WorkflowResultEnvelope;
  resultType?: string;
  title?: string;
  summary?: string;
  body?: string;
  summaryFormat?: WorkflowResultTextFormat;
  detailText?: string;
  detailFormat?: WorkflowResultTextFormat;
  structuredData?: unknown;
  artifacts: WorkflowResultArtifact[];
  downloadUrl?: string;
  temporalLink?: string;
  hasBusinessResult: boolean;
  rawResult: unknown;
}

export interface ExecutionDto {
  id: string;
  skillId: string;
  status: ExecutionStatus;
  runtimeType?: string;
  riskLevel?: 'L0' | 'L1' | 'L2' | 'L3';
  currentStepId?: string;
  runtimeSessionId?: string;
  currentPhaseKey?: string;
  currentPhaseStatus?: string;
  takeoverStatus?: string;
  requiresApproval?: boolean;
  approvalStatus?: ApprovalStatus;
  takeoverRequired?: boolean;
  takeoverReason?: string;
  resultJson?: Record<string, unknown>;
  failureCode?: string;
  failureReason?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
  input?: Record<string, unknown>;
  normalizedInput?: Record<string, unknown>;
  semantic?: ExecutionSemantic;
  result?: Record<string, unknown>;
  normalizedResult?: NormalizedExecutionResult;
  createdBy?: string;
  createdByName?: string;
  phases?: ExecutionPhaseDto[];
}

export interface ExecutionStepDto {
  id: string;
  executionId: string;
  stepIndex: number;
  name: string;
  type: string;
  status: ExecutionStepStatus;
  action?: string;
  inputJson?: Record<string, unknown>;
  outputJson?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  snapshotId?: string;
  takeoverTriggered?: boolean;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  target?: Record<string, unknown>;
  retryCount?: number;
}

export interface ExecutionPhaseArtifactDto {
  id: string;
  artifactType: string;
  snapshotId?: string;
  pageUrl?: string;
  pageFingerprint?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface ExecutionTakeoverRecordDto {
  id: string;
  status: string;
  reason?: string;
  requestedBy?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface BrowserPhaseCheck {
  matched?: boolean;
  ok?: boolean;
  satisfied?: boolean;
  pageUrl?: string;
  page_url?: string;
  pageUrlIncludes?: string;
  page_url_includes?: string;
  pageTitle?: string;
  page_title?: string;
  pageTitleIncludes?: string;
  page_title_includes?: string;
  pageFingerprint?: string;
  page_fingerprint?: string;
  readyState?: string;
  ready_state?: string;
  selectorExists?: string;
  selector_exists?: string;
  textIncludes?: string;
  text_includes?: string;
  [key: string]: unknown;
}

export interface ExecutionPhaseStepDto {
  id: string;
  phaseId: string;
  stepIndex: number;
  stepId?: string;
  action: string;
  status: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorMessage?: string;
  errorCode?: string;
  snapshotId?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
}

export interface ExecutionPhaseDto {
  id: string;
  executionId: string;
  phaseKey: string;
  phaseName: string;
  phaseType: string;
  status: string;
  attempt: number;
  runtimeSessionId?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  precheck?: BrowserPhaseCheck;
  postcheck?: BrowserPhaseCheck;
  errorCode?: string;
  errorMessage?: string;
  recoveryDecision?: Record<string, unknown>;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  artifacts?: ExecutionPhaseArtifactDto[];
  steps?: ExecutionPhaseStepDto[];
  takeovers?: ExecutionTakeoverRecordDto[];
}

export interface WaitingInputDisplayField {
  name: string;
  description?: string;
  display_name?: string;
  group_label?: string;
}

export interface WaitingInputDisplayGroup<T> {
  label: string;
  items: T[];
}
