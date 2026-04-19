/**
 * Execution API
 * API client for Execution management (NIW-136, Phase 2)
 */

import { apiClient } from './client';

// Execution status type
export type ExecutionStatus = 'queued' | 'running' | 'pending_approval' | 'human_control' | 'succeeded' | 'failed' | 'cancelled';

// Execution DTO from control-plane
export interface ExecutionDto {
  id: string;
  orgId?: string;
  createdBy: string;
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
    return apiClient.post<ExecutionDto>('/executions', data);
  },

  // Get execution by ID
  getById: (id: string) => {
    return apiClient.get<ExecutionDto>(`/executions/${id}`);
  },

  // Get execution steps
  getSteps: (id: string) => {
    return apiClient.get<ExecutionStepDto[]>(`/executions/${id}/steps`);
  },

  // List executions
  list: (params?: ListExecutionsRequest) => {
    return apiClient.get<{ data: ExecutionDto[]; total: number; page: number; pageSize: number }>('/executions', { params });
  },

  // Request human takeover
  takeover: (id: string, data: TakeoverExecutionRequest) => {
    return apiClient.post<ExecutionDto>(`/executions/${id}/takeover`, data);
  },

  // Resume execution from human_control
  resume: (id: string, data?: ResumeExecutionRequest) => {
    return apiClient.post<ExecutionDto>(`/executions/${id}/resume`, data || {});
  },

  // Cancel execution
  cancel: (id: string) => {
    return apiClient.post<ExecutionDto>(`/executions/${id}/cancel`, {});
  },
};

export default executionApi;