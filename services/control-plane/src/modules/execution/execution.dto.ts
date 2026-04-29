import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

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
}

export class ExecutionDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ required: false })
  orgId?: string;

  @ApiProperty()
  createdBy: string;

  @ApiProperty({ required: false })
  createdByName?: string;

  @ApiProperty()
  skillId: string;

  @ApiProperty({ required: false })
  capabilityId?: string;

  @ApiProperty({ required: false })
  skillVersion?: string;

  @ApiProperty({ required: false })
  capabilityVersion?: string;

  @ApiProperty({
    enum: [
      'draft',
      'queued',
      'running',
      'waiting_input',
      'pending_approval',
      'human_control',
      'paused',
      'succeeded',
      'failed',
      'cancelled',
      'rolled_back',
    ],
  })
  status: string;

  @ApiProperty({ default: 'browser' })
  runtimeType: string;

  @ApiProperty({ default: 'L0' })
  riskLevel: string;

  @ApiProperty({ required: false })
  input?: Record<string, unknown>;

  @ApiProperty({ required: false })
  normalizedInput?: Record<string, unknown>;

  @ApiProperty({ required: false })
  result?: Record<string, unknown>;

  @ApiProperty({ required: false })
  failureReason?: string;

  @ApiProperty({ required: false })
  failureCode?: string;

  @ApiProperty({ required: false })
  currentStepId?: string;

  @ApiProperty({ default: false })
  requiresApproval: boolean;

  @ApiProperty({ required: false })
  approvalStatus?: string;

  @ApiProperty({ default: false })
  takeoverRequired: boolean;

  @ApiProperty({ required: false })
  takeoverReason?: string;

  @ApiProperty({ required: false })
  startedAt?: Date;

  @ApiProperty({ required: false })
  endedAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ExecutionStepDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  executionId: string;

  @ApiProperty()
  stepIndex: number;

  @ApiProperty({ required: false })
  name?: string;

  @ApiProperty({ enum: ['browser_action', 'assertion', 'input_collection', 'system'] })
  type: string;

  @ApiProperty({ enum: ['pending', 'running', 'succeeded', 'failed', 'skipped'] })
  status: string;

  @ApiProperty({ required: false })
  action?: string;

  @ApiProperty({ required: false })
  target?: Record<string, unknown>;

  @ApiProperty({ required: false })
  input?: Record<string, unknown>;

  @ApiProperty({ required: false })
  output?: Record<string, unknown>;

  @ApiProperty({ required: false })
  assertion?: Record<string, unknown>;

  @ApiProperty({ required: false })
  errorMessage?: string;

  @ApiProperty({ required: false })
  errorCode?: string;

  @ApiProperty({ default: 0 })
  retryCount: number;

  @ApiProperty({ required: false })
  snapshotId?: string;

  @ApiProperty({ default: false })
  takeoverTriggered: boolean;

  @ApiProperty({ required: false })
  startedAt?: Date;

  @ApiProperty({ required: false })
  endedAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
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

  @ApiProperty({ description: 'User submitting the input', required: false })
  @IsOptional()
  @IsString()
  submittedBy?: string;
}
