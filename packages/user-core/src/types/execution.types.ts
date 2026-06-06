import type {
  ApprovalStatus,
  ExecutionSemantic,
  ExecutionStatus,
  ExecutionStepStatus,
} from "@ops/contracts";

export type {
  ApprovalStatus,
  ExecutionSemantic,
  ExecutionStatus,
  ExecutionStepStatus,
};

export interface ExecutionDto {
  id: string;
  skillId: string;
  status: ExecutionStatus;
  runtimeType?: string;
  riskLevel?: "L0" | "L1" | "L2" | "L3";
  currentStepId?: string;
  runtimeSessionId?: string;
  currentPhaseKey?: string;
  currentPhaseStatus?: string;
  approvalStatus?: ApprovalStatus;
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
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
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
  errorCode?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  steps?: ExecutionPhaseStepDto[];
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
