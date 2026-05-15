import { ExecutionDto, ExecutionStepDto } from './execution.dto';
import { ApprovalStatus } from './contracts/approval-status';
import { ExecutionStatus } from './contracts/execution-status';
import { ExecutionStepStatus } from './contracts/execution-step-status';
import type { ExecutionSemantic } from '@ops/contracts';

const asExecutionSemantic = (value: unknown): ExecutionSemantic | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.enabled !== 'boolean') {
    return null;
  }
  if (candidate.mode !== 'field_level' && candidate.mode !== 'complex_document') {
    return null;
  }
  if (typeof candidate.previewReady !== 'boolean' || typeof candidate.finalReady !== 'boolean') {
    return null;
  }
  if (typeof candidate.fallbackToFieldLevel !== 'boolean') {
    return null;
  }
  if (!Array.isArray(candidate.groupedMissing)) {
    return null;
  }
  return candidate as unknown as ExecutionSemantic;
};

export const mapExecutionToDto = (
  execution: Record<string, unknown>,
): ExecutionDto => {
  const normalizedInput =
    (execution.normalizedInputJson || execution.normalized_input_json) as Record<string, unknown> | null;
  const input =
    (execution.inputJson || execution.input_json) as Record<string, unknown> | null;
  const result =
    (execution.resultJson || execution.result_json) as Record<string, unknown> | null;
  const usage =
    (normalizedInput && typeof normalizedInput === 'object'
      ? (normalizedInput.__usage as Record<string, unknown> | undefined)
      : undefined) || null;
  const semantic = asExecutionSemantic(
    normalizedInput && typeof normalizedInput === 'object'
      ? (normalizedInput.semantic as unknown)
      : undefined,
  );

  return {
    id: execution.id as string,
    skillId: execution.skillId as string,
    capabilityId: (execution.capabilityId || execution.skillId) as string | null,
    skillVersion: (execution.skillVersion || execution.skill_version) as string | null,
    capabilityVersion: (execution.capabilityVersion || execution.skillVersion || execution.capability_version || execution.skill_version) as string | null,
    status: execution.status as ExecutionStatus,
    runtimeType: execution.runtimeType as string | null,
    riskLevel: execution.riskLevel as 'L0' | 'L1' | 'L2' | 'L3' | null,
    currentStepId: execution.currentStepId as string | null,
    requiresApproval: execution.requiresApproval as boolean,
    approvalStatus: execution.approvalStatus as ApprovalStatus | null,
    takeoverRequired: execution.takeoverRequired as boolean,
    takeoverReason: execution.takeoverReason as string | null,
    resultJson: result,
    inputJson: input,
    normalizedInputJson: normalizedInput,
    input,
    normalizedInput,
    semantic,
    result,
    usage,
    failureCode: execution.failureCode as string | null,
    failureReason: execution.failureReason as string | null,
    startedAt: execution.startedAt ? (execution.startedAt as Date).toISOString() : null,
    endedAt: execution.endedAt ? (execution.endedAt as Date).toISOString() : null,
    createdAt: (execution.createdAt as Date).toISOString(),
    updatedAt: (execution.updatedAt as Date).toISOString(),
    createdBy: (execution.createdBy || execution.created_by) as string | null,
    createdByName: (execution.createdByName || execution.created_by_name) as string | null,
  };
};

export const mapExecutionStepToDto = (
  step: Record<string, unknown>,
): ExecutionStepDto => {
  return {
    id: step.id as string,
    executionId: step.executionId as string,
    stepIndex: step.stepIndex as number,
    name: (step.name as string) || '',
    type: step.type as string,
    status: step.status as ExecutionStepStatus,
    action: step.action as string | null,
    inputJson: (step.inputJson || step.input_json) as Record<string, unknown> | null,
    outputJson: (step.outputJson || step.output_json) as Record<string, unknown> | null,
    errorCode: step.errorCode as string | null,
    errorMessage: step.errorMessage as string | null,
    snapshotId: step.snapshotId as string | null,
    takeoverTriggered: step.takeoverTriggered as boolean,
    startedAt: step.startedAt ? (step.startedAt as Date).toISOString() : null,
    endedAt: step.endedAt ? (step.endedAt as Date).toISOString() : null,
    createdAt: (step.createdAt as Date).toISOString(),
    updatedAt: (step.updatedAt as Date).toISOString(),
  };
};
