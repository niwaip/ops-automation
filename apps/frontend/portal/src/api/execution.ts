import {
  createExecutionApi,
  type ApprovalDecisionRequest,
  type ApprovalStatus,
  type BrowserPhaseCheck,
  type CleanupExecutionsBeforeDateRequest,
  type CreateExecutionRequest,
  type ExecutionDto,
  type ExecutionPhaseArtifactDto,
  type ExecutionPhaseDto,
  type ExecutionPhaseStepDto,
  type ExecutionSemantic,
  type ExecutionStatus,
  type ExecutionStepDto,
  type ExecutionStepStatus,
  type ExecutionTakeoverRecordDto,
  type ListExecutionsRequest,
  type ReconcilePhaseTakeoverRequest,
  type ResumeExecutionRequest,
  type SubmitInputRequest,
  type TakeoverExecutionRequest,
} from '@ops/user-core';
import { runtimeConfig } from '@/shared/config/runtime';
import { apiClient } from './client';

export type {
  ApprovalDecisionRequest,
  ApprovalStatus,
  BrowserPhaseCheck,
  CleanupExecutionsBeforeDateRequest,
  CreateExecutionRequest,
  ExecutionDto,
  ExecutionPhaseArtifactDto,
  ExecutionPhaseDto,
  ExecutionPhaseStepDto,
  ExecutionSemantic,
  ExecutionStatus,
  ExecutionStepDto,
  ExecutionStepStatus,
  ExecutionTakeoverRecordDto,
  ListExecutionsRequest,
  ReconcilePhaseTakeoverRequest,
  ResumeExecutionRequest,
  SubmitInputRequest,
  TakeoverExecutionRequest,
};

export const executionApi = createExecutionApi(apiClient, runtimeConfig);

export default executionApi;
