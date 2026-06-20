import type { ApiClient } from './client.js';
import type { RuntimeConfigPort } from '../ports/runtime.port.js';
import type {
  ApprovalStatus,
  BrowserPhaseCheck,
  ExecutionDto,
  ExecutionPhaseArtifactDto,
  ExecutionPhaseDto,
  ExecutionPhaseStepDto,
  ExecutionStatus,
  ExecutionStepDto,
  ExecutionTakeoverRecordDto,
} from '../types/execution.types.js';
import { resolveExecutionNormalizedResult } from '../domain/executions/result.js';

export type {
  ApprovalStatus,
  BrowserPhaseCheck,
  ExecutionDto,
  ExecutionPhaseArtifactDto,
  ExecutionPhaseDto,
  ExecutionPhaseStepDto,
  ExecutionStatus,
  ExecutionStepDto,
  ExecutionTakeoverRecordDto,
};

export interface CreateExecutionRequest {
  skillId: string;
  skillVersion?: string;
  input?: Record<string, unknown>;
  runtimeType?: string;
}

export interface TakeoverExecutionRequest {
  reason: string;
}

export interface ResumeExecutionRequest {
  stepId?: string;
  comment?: string;
}

export interface ReconcilePhaseTakeoverRequest {
  comment?: string;
  resolvedBy?: string;
  patch?: Record<string, unknown> | null;
}

export interface ApprovalDecisionRequest {
  comment?: string;
  decidedBy?: string;
}

export interface SubmitInputRequest {
  stepId: string;
  input: Record<string, unknown>;
  submittedBy?: string;
}

export interface ListExecutionsRequest {
  page?: number;
  pageSize?: number;
  status?: ExecutionStatus;
  skillId?: string;
}

export interface CleanupExecutionsBeforeDateRequest {
  beforeDate: string;
}

const normalizeExecutionPhaseArtifact = (
  raw: ExecutionPhaseArtifactDto
): ExecutionPhaseArtifactDto => ({
  ...raw,
  snapshotId: raw.snapshotId || undefined,
  pageUrl: raw.pageUrl || undefined,
  pageFingerprint: raw.pageFingerprint || undefined,
  payload: raw.payload || undefined,
});

const normalizeExecutionTakeover = (
  raw: ExecutionTakeoverRecordDto
): ExecutionTakeoverRecordDto => ({
  ...raw,
  reason: raw.reason || undefined,
  requestedBy: raw.requestedBy || undefined,
  resolvedBy: raw.resolvedBy || undefined,
  resolutionNote: raw.resolutionNote || undefined,
  resolvedAt: raw.resolvedAt || undefined,
});

const normalizeExecutionPhaseStep = (raw: ExecutionPhaseStepDto): ExecutionPhaseStepDto => ({
  ...raw,
  stepId: raw.stepId || undefined,
  input: raw.input || undefined,
  output: raw.output || undefined,
  errorMessage: raw.errorMessage || undefined,
  errorCode: raw.errorCode || undefined,
  snapshotId: raw.snapshotId || undefined,
  startedAt: raw.startedAt || undefined,
  endedAt: raw.endedAt || undefined,
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
  steps: raw.steps?.map(normalizeExecutionPhaseStep) || [],
  takeovers: raw.takeovers?.map(normalizeExecutionTakeover) || [],
});

const normalizeExecution = (raw: ExecutionDto): ExecutionDto => ({
  ...raw,
  runtimeType: raw.runtimeType || undefined,
  riskLevel: raw.riskLevel || undefined,
  currentStepId: raw.currentStepId || undefined,
  runtimeSessionId: raw.runtimeSessionId || undefined,
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
  input: raw.input || undefined,
  normalizedInput: raw.normalizedInput || undefined,
  semantic:
    raw.semantic ||
    (raw.normalizedInput?.semantic as ExecutionDto['semantic'] | undefined) ||
    undefined,
  result: raw.resultJson || raw.result || undefined,
  normalizedResult: raw.normalizedResult || resolveExecutionNormalizedResult(raw),
  createdBy: raw.createdBy || undefined,
  createdByName: raw.createdByName || undefined,
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
  input: raw.inputJson || raw.input || undefined,
  output: raw.outputJson || raw.output || undefined,
  retryCount: raw.retryCount ?? 0,
});

const resolveExecutionPath = (runtimeConfig: RuntimeConfigPort, path: string): string => {
  const baseUrl = runtimeConfig.controlPlaneApiBaseUrl?.trim();
  return baseUrl ? `${baseUrl.replace(/\/+$/, '')}${path}` : path;
};

export const createExecutionApi = (client: ApiClient, runtimeConfig: RuntimeConfigPort) => ({
  create: async (data: CreateExecutionRequest): Promise<ExecutionDto> =>
    normalizeExecution(
      await client.post<ExecutionDto>(resolveExecutionPath(runtimeConfig, '/executions'), data)
    ),
  getById: async (id: string): Promise<ExecutionDto> =>
    normalizeExecution(
      await client.get<ExecutionDto>(resolveExecutionPath(runtimeConfig, `/executions/${id}`))
    ),
  getSteps: async (id: string): Promise<ExecutionStepDto[]> =>
    (
      await client.get<ExecutionStepDto[]>(
        resolveExecutionPath(runtimeConfig, `/executions/${id}/steps`)
      )
    ).map(normalizeExecutionStep),
  getPhases: async (id: string): Promise<ExecutionPhaseDto[]> =>
    (
      await client.get<ExecutionPhaseDto[]>(
        resolveExecutionPath(runtimeConfig, `/executions/${id}/phases`)
      )
    ).map(normalizeExecutionPhase),
  list: async (
    params?: ListExecutionsRequest
  ): Promise<{
    data: ExecutionDto[];
    total: number;
    page: number;
    pageSize: number;
  }> => {
    const response = await client.get<{
      data: ExecutionDto[];
      total: number;
      page: number;
      pageSize: number;
    }>(resolveExecutionPath(runtimeConfig, '/executions'), { params });
    return {
      ...response,
      data: response.data.map(normalizeExecution),
    };
  },
  takeover: async (id: string, data: TakeoverExecutionRequest): Promise<ExecutionDto> =>
    normalizeExecution(
      await client.post<ExecutionDto>(
        resolveExecutionPath(runtimeConfig, `/executions/${id}/takeover`),
        data
      )
    ),
  takeoverPhase: async (
    id: string,
    phaseKey: string,
    data: TakeoverExecutionRequest
  ): Promise<ExecutionDto> =>
    normalizeExecution(
      await client.post<ExecutionDto>(
        resolveExecutionPath(
          runtimeConfig,
          `/executions/${id}/phases/${encodeURIComponent(phaseKey)}/takeover`
        ),
        data
      )
    ),
  reconcilePhaseTakeover: async (
    id: string,
    phaseKey: string,
    data?: ReconcilePhaseTakeoverRequest
  ): Promise<ExecutionDto> =>
    normalizeExecution(
      await client.post<ExecutionDto>(
        resolveExecutionPath(
          runtimeConfig,
          `/executions/${id}/phases/${encodeURIComponent(phaseKey)}/reconcile`
        ),
        data || {}
      )
    ),
  resumePhaseTakeover: async (
    id: string,
    phaseKey: string,
    data?: ResumeExecutionRequest
  ): Promise<ExecutionDto> =>
    normalizeExecution(
      await client.post<ExecutionDto>(
        resolveExecutionPath(
          runtimeConfig,
          `/executions/${id}/phases/${encodeURIComponent(phaseKey)}/resume`
        ),
        data || {}
      )
    ),
  resume: async (id: string, data?: ResumeExecutionRequest): Promise<ExecutionDto> =>
    normalizeExecution(
      await client.post<ExecutionDto>(
        resolveExecutionPath(runtimeConfig, `/executions/${id}/resume`),
        data || {}
      )
    ),
  releaseHumanControl: async (id: string, data?: ResumeExecutionRequest): Promise<ExecutionDto> =>
    normalizeExecution(
      await client.post<ExecutionDto>(
        resolveExecutionPath(runtimeConfig, `/executions/${id}/release-human-control`),
        data || {}
      )
    ),
  approve: async (id: string, data?: ApprovalDecisionRequest): Promise<ExecutionDto> =>
    normalizeExecution(
      await client.post<ExecutionDto>(
        resolveExecutionPath(runtimeConfig, `/executions/${id}/approve`),
        data || {}
      )
    ),
  reject: async (id: string, data?: ApprovalDecisionRequest): Promise<ExecutionDto> =>
    normalizeExecution(
      await client.post<ExecutionDto>(
        resolveExecutionPath(runtimeConfig, `/executions/${id}/reject`),
        data || {}
      )
    ),
  submitInput: async (id: string, data: SubmitInputRequest): Promise<ExecutionDto> =>
    normalizeExecution(
      await client.post<ExecutionDto>(
        resolveExecutionPath(runtimeConfig, `/executions/${id}/submit-input`),
        data
      )
    ),
  cancel: async (id: string): Promise<ExecutionDto> =>
    normalizeExecution(
      await client.post<ExecutionDto>(
        resolveExecutionPath(runtimeConfig, `/executions/${id}/cancel`),
        {}
      )
    ),
  delete: async (id: string): Promise<{ success: boolean }> =>
    client.delete<{ success: boolean }>(resolveExecutionPath(runtimeConfig, `/executions/${id}`)),
  cleanupBeforeDate: async (
    data: CleanupExecutionsBeforeDateRequest
  ): Promise<{ success: boolean; deletedCount: number; beforeDate: string }> =>
    client.post<{ success: boolean; deletedCount: number; beforeDate: string }>(
      resolveExecutionPath(runtimeConfig, '/executions/cleanup'),
      data
    ),
});
