import { ExecutionDto, ExecutionStepDto } from './execution.dto';
import { ApprovalStatus } from './contracts/approval-status';
import { ExecutionStatus } from './contracts/execution-status';
import { ExecutionStepStatus } from './contracts/execution-step-status';

export const mapExecutionToDto = (
  execution: Record<string, unknown>,
  createdByName?: string,
): ExecutionDto => {
  const normalizedInput = (execution.normalizedInputJson || execution.normalized_input_json) as Record<string, unknown> | undefined;
  const input = (execution.inputJson || execution.input_json) as Record<string, unknown> | undefined;

  let usage = (normalizedInput?.__usage || input?.__usage) as Record<string, unknown> | undefined;
  if (!usage && execution.usage) {
    usage = execution.usage as Record<string, unknown>;
  }

  return {
    id: execution.id as string,
    orgId: execution.orgId as string | undefined,
    createdBy: execution.createdBy as string,
    createdByName,
    skillId: execution.skillId as string,
    capabilityId: execution.skillId as string,
    skillVersion: execution.skillVersion as string | undefined,
    capabilityVersion: execution.skillVersion as string | undefined,
    status: execution.status as ExecutionStatus,
    runtimeType: execution.runtimeType as string,
    riskLevel: execution.riskLevel as string,
    input,
    normalizedInput,
    result: (execution.resultJson || execution.result_json) as Record<string, unknown> | undefined,
    failureReason: execution.failureReason as string | undefined,
    failureCode: execution.failureCode as string | undefined,
    currentStepId: execution.currentStepId as string | undefined,
    requiresApproval: execution.requiresApproval as boolean,
    approvalStatus: execution.approvalStatus as ApprovalStatus | undefined,
    takeoverRequired: execution.takeoverRequired as boolean,
    takeoverReason: execution.takeoverReason as string | undefined,
    usage,
    startedAt: execution.startedAt as Date | undefined,
    endedAt: execution.endedAt as Date | undefined,
    createdAt: execution.createdAt as Date,
    updatedAt: execution.updatedAt as Date,
  };
};

export const mapExecutionStepToDto = (
  step: Record<string, unknown>,
): ExecutionStepDto => {
  return {
    id: step.id as string,
    executionId: step.executionId as string,
    stepIndex: step.stepIndex as number,
    name: step.name as string | undefined,
    type: step.type as string,
    status: step.status as ExecutionStepStatus,
    action: step.action as string | undefined,
    target: step.targetJson as Record<string, unknown> | undefined,
    input: step.inputJson as Record<string, unknown> | undefined,
    output: step.outputJson as Record<string, unknown> | undefined,
    assertion: step.assertionJson as Record<string, unknown> | undefined,
    errorMessage: step.errorMessage as string | undefined,
    errorCode: step.errorCode as string | undefined,
    retryCount: step.retryCount as number,
    snapshotId: step.snapshotId as string | undefined,
    takeoverTriggered: step.takeoverTriggered as boolean,
    startedAt: step.startedAt as Date | undefined,
    endedAt: step.endedAt as Date | undefined,
    createdAt: step.createdAt as Date,
    updatedAt: step.updatedAt as Date,
  };
};
