import { ExecutionDto, ExecutionStepDto } from './execution.dto';
import { ApprovalStatus } from './contracts/approval-status';
import { ExecutionStatus } from './contracts/execution-status';
import { ExecutionStepStatus } from './contracts/execution-step-status';

export const mapExecutionToDto = (
  execution: Record<string, unknown>,
): ExecutionDto => {
  return {
    id: execution.id as string,
    skillId: execution.skillId as string,
    status: execution.status as ExecutionStatus,
    runtimeType: execution.runtimeType as string | null,
    riskLevel: execution.riskLevel as 'L0' | 'L1' | 'L2' | 'L3' | null,
    currentStepId: execution.currentStepId as string | null,
    requiresApproval: execution.requiresApproval as boolean,
    approvalStatus: execution.approvalStatus as ApprovalStatus | null,
    takeoverRequired: execution.takeoverRequired as boolean,
    takeoverReason: execution.takeoverReason as string | null,
    resultJson: (execution.resultJson || execution.result_json) as Record<string, unknown> | null,
    failureCode: execution.failureCode as string | null,
    failureReason: execution.failureReason as string | null,
    startedAt: execution.startedAt ? (execution.startedAt as Date).toISOString() : null,
    endedAt: execution.endedAt ? (execution.endedAt as Date).toISOString() : null,
    createdAt: (execution.createdAt as Date).toISOString(),
    updatedAt: (execution.updatedAt as Date).toISOString(),
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
