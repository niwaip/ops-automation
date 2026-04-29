/**
 * Execution API
 * API client for Execution management (NIW-136, Phase 2)
 */

import { apiClient } from './client';

const CONTROL_PLANE_API_BASE_URL = import.meta.env.VITE_CONTROL_PLANE_API_URL || '';

const getExecutionApiUrl = (path: string) => {
  if (CONTROL_PLANE_API_BASE_URL) {
    return `${CONTROL_PLANE_API_BASE_URL}${path}`;
  }

  return path;
};

// Execution status type
export type ExecutionStatus =
  | 'draft'
  | 'queued'
  | 'running'
  | 'waiting_input'
  | 'pending_approval'
  | 'human_control'
  | 'paused'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'rolled_back';

// Execution DTO from control-plane
export interface ExecutionDto {
  id: string;
  orgId?: string;
  createdBy: string;
  createdByName?: string;
  skillId: string;
  skillVersion?: string;
  status: ExecutionStatus;
  runtimeType: string;
  riskLevel: string;
  input?: Record<string, unknown>;
  normalizedInput?: Record<string, unknown>;
  result?: Record<string, unknown>;
  failureReason?: string;
  failureCode?: string;
  currentStepId?: string;
  requiresApproval: boolean;
  approvalStatus?: string;
  takeoverRequired: boolean;
  takeoverReason?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// Execution step DTO
export interface ExecutionStepDto {
  id: string;
  executionId: string;
  stepIndex: number;
  name?: string;
  type: string;
  status: string;
  action?: string;
  target?: Record<string, unknown>;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  assertion?: Record<string, unknown>;
  errorMessage?: string;
  errorCode?: string;
  retryCount: number;
  snapshotId?: string;
  takeoverTriggered: boolean;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
}

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

// Execution API
export const executionApi = {
  // Create a new execution
  create: (data: CreateExecutionRequest) => {
    return apiClient.post<ExecutionDto>(getExecutionApiUrl('/executions'), data);
  },

  // Get execution by ID
  getById: (id: string) => {
    return apiClient.get<ExecutionDto>(getExecutionApiUrl(`/executions/${id}`));
  },

  // Get execution steps
  getSteps: (id: string) => {
    return apiClient.get<ExecutionStepDto[]>(getExecutionApiUrl(`/executions/${id}/steps`));
  },

  // List executions
  list: (params?: ListExecutionsRequest) => {
    return apiClient.get<{ data: ExecutionDto[]; total: number; page: number; pageSize: number }>(getExecutionApiUrl('/executions'), {
      params,
    });
  },

  // Request human takeover
  takeover: (id: string, data: TakeoverExecutionRequest) => {
    return apiClient.post<ExecutionDto>(getExecutionApiUrl(`/executions/${id}/takeover`), data);
  },

  // Resume execution from human_control
  resume: (id: string, data?: ResumeExecutionRequest) => {
    return apiClient.post<ExecutionDto>(getExecutionApiUrl(`/executions/${id}/resume`), data || {});
  },

  // v3-preferred route for releasing takeover control
  releaseHumanControl: (id: string, data?: ResumeExecutionRequest) => {
    return apiClient.post<ExecutionDto>(getExecutionApiUrl(`/executions/${id}/release-human-control`), data || {});
  },

  approve: (id: string, data?: ApprovalDecisionRequest) => {
    return apiClient.post<ExecutionDto>(getExecutionApiUrl(`/executions/${id}/approve`), data || {});
  },

  reject: (id: string, data?: ApprovalDecisionRequest) => {
    return apiClient.post<ExecutionDto>(getExecutionApiUrl(`/executions/${id}/reject`), data || {});
  },

  // Submit missing input and resume from waiting_input
  submitInput: (id: string, data: SubmitInputRequest) => {
    return apiClient.post<ExecutionDto>(getExecutionApiUrl(`/executions/${id}/submit-input`), data);
  },

  // Cancel execution
  cancel: (id: string) => {
    return apiClient.post<ExecutionDto>(getExecutionApiUrl(`/executions/${id}/cancel`), {});
  },

  // Delete execution
  delete: (id: string) => {
    return apiClient.delete<{ success: boolean }>(getExecutionApiUrl(`/executions/${id}`));
  },
};

export default executionApi;
