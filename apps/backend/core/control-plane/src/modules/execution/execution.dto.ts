import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApprovalStatus, APPROVAL_STATUS_VALUES } from './contracts/approval-status';
import { ExecutionStatus, EXECUTION_STATUS_VALUES } from './contracts/execution-status';
import { ExecutionStepStatus, EXECUTION_STEP_STATUS_VALUES } from './contracts/execution-step-status';

export class CreateExecutionDto {
  @ApiProperty({ description: 'Skill ID', example: 'skill-123', required: false })
  @IsOptional()
  @IsString()
  skillId?: string;

  @ApiProperty({ description: 'Capability ID, alias of skillId for unified runtime', required: false })
  @IsOptional()
  @IsString()
  capabilityId?: string;

  @ApiProperty({ description: 'Skill version', example: 'v1', required: false })
  @IsOptional()
  @IsString()
  skillVersion?: string;

  @ApiProperty({ description: 'Capability version, alias of skillVersion for unified runtime', required: false })
  @IsOptional()
  @IsString()
  capabilityVersion?: string;

  @ApiProperty({ description: 'Runtime type', example: 'browser', default: 'browser', required: false })
  @IsOptional()
  @IsString()
  runtimeType?: string;

  @ApiProperty({ description: 'Execution input parameters', example: { url: 'https://example.com' } })
  @IsObject()
  input: Record<string, unknown>;

  @ApiProperty({ description: 'Idempotency key for deduplication', required: false })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiProperty({ description: 'Token usage from planner phase', required: false })
  @IsOptional()
  @IsObject()
  usage?: Record<string, unknown>;

  @ApiProperty({ description: 'Pre-generated planner draft from planner facade', required: false })
  @IsOptional()
  @IsObject()
  planDraft?: Record<string, unknown>;
}

export class ExecutionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  skillId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  capabilityId?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  skillVersion?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  capabilityVersion?: string | null;

  @ApiProperty({ enum: EXECUTION_STATUS_VALUES })
  status: ExecutionStatus;

  @ApiProperty({ default: 'browser', required: false })
  @IsOptional()
  runtimeType?: string | null;

  @ApiProperty({ default: 'L0', required: false })
  @IsOptional()
  riskLevel?: 'L0' | 'L1' | 'L2' | 'L3' | null;

  @ApiProperty({ required: false })
  @IsOptional()
  currentStepId?: string | null;

  @ApiProperty({ default: false, required: false })
  @IsOptional()
  requiresApproval?: boolean;

  @ApiProperty({ required: false, enum: APPROVAL_STATUS_VALUES })
  @IsOptional()
  approvalStatus?: ApprovalStatus | null;

  @ApiProperty({ default: false, required: false })
  @IsOptional()
  takeoverRequired?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  takeoverReason?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  resultJson?: Record<string, unknown> | null;

  @ApiProperty({ required: false })
  @IsOptional()
  inputJson?: Record<string, unknown> | null;

  @ApiProperty({ required: false })
  @IsOptional()
  normalizedInputJson?: Record<string, unknown> | null;

  @ApiProperty({ required: false })
  @IsOptional()
  input?: Record<string, unknown> | null;

  @ApiProperty({ required: false })
  @IsOptional()
  normalizedInput?: Record<string, unknown> | null;

  @ApiProperty({ required: false })
  @IsOptional()
  semantic?: Record<string, unknown> | null;

  @ApiProperty({ required: false })
  @IsOptional()
  result?: Record<string, unknown> | null;

  @ApiProperty({ required: false })
  @IsOptional()
  usage?: Record<string, unknown> | null;

  @ApiProperty({ required: false })
  @IsOptional()
  failureCode?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  failureReason?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  startedAt?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  endedAt?: string | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  @ApiProperty({ required: false })
  @IsOptional()
  createdBy?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  createdByName?: string | null;
}

export class ExecutionStepDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  executionId: string;

  @ApiProperty()
  stepIndex: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  type: string;

  @ApiProperty({ enum: EXECUTION_STEP_STATUS_VALUES })
  status: ExecutionStepStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  action?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  inputJson?: Record<string, unknown> | null;

  @ApiProperty({ required: false })
  @IsOptional()
  outputJson?: Record<string, unknown> | null;

  @ApiProperty({ required: false })
  @IsOptional()
  errorCode?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  errorMessage?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  snapshotId?: string | null;

  @ApiProperty({ default: false, required: false })
  @IsOptional()
  takeoverTriggered?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  startedAt?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  endedAt?: string | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}

export class TakeoverExecutionDto {
  @ApiProperty({ description: 'Reason for takeover', example: 'Captcha detected' })
  reason: string;

  @ApiProperty({ description: 'User requesting takeover', required: false })
  requestedBy?: string;
}

export class ResumeExecutionDto {
  @ApiProperty({ description: 'Step ID to resume from', required: false })
  stepId?: string;

  @ApiProperty({ description: 'Comment about resume action', required: false })
  comment?: string;

  @ApiProperty({ description: 'User resuming execution', required: false })
  resumedBy?: string;
}

export class ReleaseHumanControlDto extends ResumeExecutionDto {}

export class ApprovalDecisionDto {
  @ApiProperty({ description: 'Comment about the approval decision', required: false })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiProperty({ description: 'User making the approval decision', required: false })
  @IsOptional()
  @IsString()
  decidedBy?: string;
}

export class RuntimeSessionSummaryDto {
  @ApiProperty()
  id: string;
}

export class ListExecutionsDto {
  @ApiProperty({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ description: 'Page size', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @ApiProperty({ description: 'Filter by status', required: false })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ description: 'Filter by skill ID', required: false })
  @IsOptional()
  @IsString()
  skillId?: string;
}

export class SubmitInputDto {
  @ApiProperty({ description: 'Step ID to submit input for' })
  @IsString()
  stepId: string;

  @ApiProperty({ description: 'Submitted input data' })
  @IsObject()
  input: Record<string, unknown>;

  @ApiProperty({ description: 'Token usage collected while resolving missing inputs', required: false })
  @IsOptional()
  @IsObject()
  usage?: Record<string, unknown>;

  @ApiProperty({ description: 'User submitting the input', required: false })
  @IsOptional()
  @IsString()
  submittedBy?: string;
}
