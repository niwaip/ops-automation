/**
 * Execution API
 * API client for Execution management (NIW-136, Phase 2)
 */

import type {
  ApprovalStatus,
  ExecutionStatus,
  ExecutionSemantic,
  ExecutionStepStatus,
} from '@ops/contracts';
import { apiClient } from './client';

export type {
  ApprovalStatus,
  ExecutionStatus,
  ExecutionSemantic,
  ExecutionStepStatus,
} from '@ops/contracts';

const CONTROL_PLANE_API_BASE_URL = import.meta.env.VITE_CONTROL_PLANE_API_URL || '';

const getExecutionApiUrl = (path: string) => {
  if (CONTROL_PLANE_API_BASE_URL) {
    return `${CONTROL_PLANE_API_BASE_URL}${path}`;
  }

  return path;
};

// Execution DTO from control-plane
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
  // v3 compatibility fields for gradual portal migration.
  input?: Record<string, unknown>;
  normalizedInput?: Record<string, unknown>;
  semantic?: ExecutionSemantic;
  result?: Record<string, unknown>;
  createdBy?: string;
  createdByName?: string;
  phases?: ExecutionPhaseDto[];
}

// Execution step DTO
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
  // v3 compatibility fields for gradual portal migration.
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
  takeovers?: ExecutionTakeoverRecordDto[];
}

const normalizeExecutionPhaseArtifact = (raw: ExecutionPhaseArtifactDto): ExecutionPhaseArtifactDto => ({
  ...raw,
  snapshotId: raw.snapshotId || undefined,
  pageUrl: raw.pageUrl || undefined,
  pageFingerprint: raw.pageFingerprint || undefined,
  payload: raw.payload || undefined,
});

const normalizeExecutionTakeover = (raw: ExecutionTakeoverRecordDto): ExecutionTakeoverRecordDto => ({
  ...raw,
  reason: raw.reason || undefined,
  requestedBy: raw.requestedBy || undefined,
  resolvedBy: raw.resolvedBy || undefined,
  resolutionNote: raw.resolutionNote || undefined,
  resolvedAt: raw.resolvedAt || undefined,
});

const normalizeExecutionPhase = (raw: ExecutionPhaseDto): ExecutionPhaseDto => ({
  ...raw,
  runtimeSessionId: raw.runtimeSessionId || undefined,
  input: raw.input || undefined,
  output: raw.output || undefined,
  precheck: raw.precheck || undefined,
  postcheck: raw.postcheck || undefined,
  errorCode: raw.errorCode || undefined,
  errorMessage: raw.errorMessage || undefined,
  recoveryDecision: raw.recoveryDecision || undefined,
  startedAt: raw.startedAt || undefined,
  completedAt: raw.completedAt || undefined,
  artifacts: raw.artifacts?.map(normalizeExecutionPhaseArtifact) || [],
  takeovers: raw.takeovers?.map(normalizeExecutionTakeover) || [],
});

const normalizeExecution = (raw: ExecutionDto): ExecutionDto => ({
  ...raw,
  runtimeType: raw.runtimeType || undefined,
  riskLevel: raw.riskLevel || undefined,
  currentStepId: raw.currentStepId || undefined,
  currentPhaseKey: raw.currentPhaseKey || undefined,
  currentPhaseStatus: raw.currentPhaseStatus || undefined,
  takeoverStatus: raw.takeoverStatus || undefined,
  approvalStatus: raw.approvalStatus || undefined,
  takeoverReason: raw.takeoverReason || undefined,
  resultJson: raw.resultJson || undefined,
  failureCode: raw.failureCode || undefined,
  failureReason: raw.failureReason || undefined,
  startedAt: raw.startedAt || undefined,
  endedAt: raw.endedAt || undefined,
  semantic: raw.semantic || (raw.normalizedInput?.semantic as ExecutionSemantic | undefined) || undefined,
  result: raw.resultJson || undefined,
  phases: raw.phases?.map(normalizeExecutionPhase) || [],
});

const normalizeExecutionStep = (raw: ExecutionStepDto): ExecutionStepDto => ({
  ...raw,
  action: raw.action || undefined,
  inputJson: raw.inputJson || undefined,
  outputJson: raw.outputJson || undefined,
  errorCode: raw.errorCode || undefined,
  errorMessage: raw.errorMessage || undefined,
  snapshotId: raw.snapshotId || undefined,
  startedAt: raw.startedAt || undefined,
  endedAt: raw.endedAt || undefined,
  input: raw.inputJson || undefined,
  output: raw.outputJson || undefined,
  retryCount: raw.retryCount ?? 0,
});

// Create execution request
export interface CreateExecutionRequest {
  skillId: string;
  skillVersion?: string;
  input?: Record<string, unknown>;
  runtimeType?: string;
}

// Takeover execution request
export interface TakeoverExecutionRequest {
  reason: string;
}

// Resume execution request
export interface ResumeExecutionRequest {
  stepId?: string;
  comment?: string;
}

export interface ReconcilePhaseTakeoverRequest {
  comment?: string;
}

export interface ApprovalDecisionRequest {
  comment?: string;
  decidedBy?: string;
}

// Submit input request
export interface SubmitInputRequest {
  stepId: string;
  input: Record<string, unknown>;
  submittedBy?: string;
}

// List executions request
export interface ListExecutionsRequest {
  page?: number;
  pageSize?: number;
  status?: ExecutionStatus;
  skillId?: string;
}

export interface CleanupExecutionsBeforeDateRequest {
  beforeDate: string;
}

// Execution API
export const executionApi = {
  // Create a new execution
  create: (data: CreateExecutionRequest) => {
    return apiClient
      .post<ExecutionDto>(getExecutionApiUrl('/executions'), data)
      .then(normalizeExecution);
  },

  // Get execution by ID
  getById: (id: string) => {
    return apiClient
      .get<ExecutionDto>(getExecutionApiUrl(`/executions/${id}`))
      .then(normalizeExecution);
  },

  // Get execution steps
  getSteps: (id: string) => {
    return apiClient
      .get<ExecutionStepDto[]>(getExecutionApiUrl(`/executions/${id}/steps`))
      .then((steps) => steps.map(normalizeExecutionStep));
  },

  getPhases: (id: string) => {
    return apiClient
      .get<ExecutionPhaseDto[]>(getExecutionApiUrl(`/executions/${id}/phases`))
      .then((phases) => phases.map(normalizeExecutionPhase));
  },

  // List executions
  list: (params?: ListExecutionsRequest) => {
    return apiClient
      .get<{ data: ExecutionDto[]; total: number; page: number; pageSize: number }>(
        getExecutionApiUrl('/executions'),
        {
          params,
        },
      )
      .then((response) => ({
        ...response,
        data: response.data.map(normalizeExecution),
      }));
  },

  // Request human takeover
  takeover: (id: string, data: TakeoverExecutionRequest) => {
    return apiClient
      .post<ExecutionDto>(getExecutionApiUrl(`/executions/${id}/takeover`), data)
      .then(normalizeExecution);
  },

  takeoverPhase: (id: string, phaseKey: string, data: TakeoverExecutionRequest) => {
    return apiClient
      .post<ExecutionDto>(getExecutionApiUrl(`/executions/${id}/phases/${encodeURIComponent(phaseKey)}/takeover`), data)
      .then(normalizeExecution);
  },

  reconcilePhaseTakeover: (id: string, phaseKey: string, data?: ReconcilePhaseTakeoverRequest) => {
    return apiClient
      .post<ExecutionDto>(getExecutionApiUrl(`/executions/${id}/phases/${encodeURIComponent(phaseKey)}/reconcile`), data || {})
      .then(normalizeExecution);
  },

  resumePhaseTakeover: (id: string, phaseKey: string, data?: ResumeExecutionRequest) => {
    return apiClient
      .post<ExecutionDto>(getExecutionApiUrl(`/executions/${id}/phases/${encodeURIComponent(phaseKey)}/resume`), data || {})
      .then(normalizeExecution);
  },

  // Resume execution from human_control
  resume: (id: string, data?: ResumeExecutionRequest) => {
    return apiClient
      .post<ExecutionDto>(getExecutionApiUrl(`/executions/${id}/resume`), data || {})
      .then(normalizeExecution);
  },

  // v3-preferred route for releasing takeover control
  releaseHumanControl: (id: string, data?: ResumeExecutionRequest) => {
    return apiClient
      .post<ExecutionDto>(getExecutionApiUrl(`/executions/${id}/release-human-control`), data || {})
      .then(normalizeExecution);
  },

  approve: (id: string, data?: ApprovalDecisionRequest) => {
    return apiClient
      .post<ExecutionDto>(getExecutionApiUrl(`/executions/${id}/approve`), data || {})
      .then(normalizeExecution);
  },

  reject: (id: string, data?: ApprovalDecisionRequest) => {
    return apiClient
      .post<ExecutionDto>(getExecutionApiUrl(`/executions/${id}/reject`), data || {})
      .then(normalizeExecution);
  },

  // Submit missing input and resume from waiting_input
  submitInput: (id: string, data: SubmitInputRequest) => {
    return apiClient
      .post<ExecutionDto>(getExecutionApiUrl(`/executions/${id}/submit-input`), data)
      .then(normalizeExecution);
  },

  // Cancel execution
  cancel: (id: string) => {
    return apiClient
      .post<ExecutionDto>(getExecutionApiUrl(`/executions/${id}/cancel`), {})
      .then(normalizeExecution);
  },

  // Delete execution
  delete: (id: string) => {
    return apiClient.delete<{ success: boolean }>(getExecutionApiUrl(`/executions/${id}`));
  },

  cleanupBeforeDate: (data: CleanupExecutionsBeforeDateRequest) => {
    return apiClient.post<{ success: boolean; deletedCount: number; beforeDate: string }>(
      getExecutionApiUrl('/executions/cleanup'),
      data,
    );
  },
};

export default executionApi;
