import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { ExecutionSemantic } from '@ops/backend-execution-core';
import { ApprovalStatus, APPROVAL_STATUS_VALUES } from '../contracts/approval-status';
import { ExecutionStatus, EXECUTION_STATUS_VALUES } from '../contracts/execution-status';
import {
  ExecutionStepStatus,
  EXECUTION_STEP_STATUS_VALUES,
} from '../contracts/execution-step-status';

export type ExecutionParamSource =
  | 'user_input'
  | 'default'
  | 'workflow_default'
  | 'recognized'
  | 'external'
  | 'unresolved';

export type ExecutionParamRequiredMode = 'always' | 'conditional' | 'optional' | 'system_required';

export interface ExecutionRequiredInput {
  name: string;
  type: string;
  description?: string;
  enum?: Array<string | number>;
  required: boolean;
  required_mode?: ExecutionParamRequiredMode;
  value?: unknown;
  missing: boolean;
  source: ExecutionParamSource;
  source_priority?: string[];
  confidence?: number;
  needs_confirmation?: boolean;
  confirmation_threshold?: number;
  missing_reason?: string;
  display_name?: string;
  group_label?: string;
  render_path?: string | string[];
  template_binding?: string;
  preview_blocking?: boolean;
}

export interface ExecutionParamResolutionEntry {
  type: string;
  enum?: Array<string | number>;
  required: boolean;
  value?: unknown;
  source: ExecutionParamSource;
  requiredMode: ExecutionParamRequiredMode;
  valueSourcePriority?: string[];
  missing: boolean;
  needsConfirmation?: boolean;
  confirmed?: boolean;
  final: boolean;
  description?: string;
  display_name?: string;
  group_label?: string;
  render_path?: string | string[];
  template_binding?: string;
  confidence?: number;
  confirmation_threshold?: number;
  missing_reason?: string;
  preview_blocking?: boolean;
}

export interface ExecutionNormalizedInputJson extends Record<string, unknown> {
  objective?: string;
  plannerMode?: string;
  plannerSummary?: string;
  requiredInputs?: ExecutionRequiredInput[];
  input?: Record<string, unknown>;
  paramResolution?: Record<string, ExecutionParamResolutionEntry>;
  semantic?: ExecutionSemantic | null;
  __usage?: Record<string, unknown>;
}

export interface WorkflowResultExecution {
  status?: 'success' | 'partial_success' | 'failed' | 'cancelled';
  executionId?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
}

export interface WorkflowResultTrigger {
  type?: 'manual' | 'schedule' | 'api' | 'resume';
  scheduleId?: string;
  scheduledAt?: string;
  windowStart?: string;
  windowEnd?: string;
}

export interface WorkflowResultNextAction {
  type?: string;
  label?: string;
  value?: string;
}

export interface WorkflowResultArtifact {
  type?: string;
  artifactType?: string;
  name?: string;
  label?: string;
  downloadUrl?: string;
  url?: string;
  path?: string;
  mimeType?: string;
}

export type WorkflowResultTextFormat = 'plain_text' | 'markdown';

export interface WorkflowResultPresentation {
  preferAiSummary?: boolean;
  preferStructuredView?: boolean;
  chatSummary?: string;
  notificationSummary?: string;
  summaryFormat?: WorkflowResultTextFormat;
  detailText?: string;
  detailFormat?: WorkflowResultTextFormat;
}

export interface WorkflowResultBusinessSection {
  resultType?: string;
  title?: string;
  summary?: string;
  businessData?: unknown;
  metrics?: Record<string, unknown>;
  nextActions?: WorkflowResultNextAction[];
}

export interface WorkflowResultEnvelope {
  execution?: WorkflowResultExecution;
  trigger?: WorkflowResultTrigger;
  result?: WorkflowResultBusinessSection;
  artifacts?: WorkflowResultArtifact[];
  presentation?: WorkflowResultPresentation;
  delivery?: Record<string, unknown>;
}

export interface NormalizedExecutionResult {
  envelope: WorkflowResultEnvelope;
  resultType?: string;
  title?: string;
  summary?: string;
  body?: string;
  summaryFormat?: WorkflowResultTextFormat;
  detailText?: string;
  detailFormat?: WorkflowResultTextFormat;
  structuredData?: unknown;
  artifacts: WorkflowResultArtifact[];
  downloadUrl?: string;
  temporalLink?: string;
  hasBusinessResult: boolean;
  rawResult: unknown;
}

export interface BrowserPhaseCheck {
  [key: string]: unknown;
  matched?: boolean;
  ok?: boolean;
  satisfied?: boolean;
  pageUrl?: string;
  page_url?: string;
  pageUrlIncludes?: string;
  page_url_includes?: string;
  pageTitle?: string;
  page_title?: string;
  pageTitleIncludes?: string;
  page_title_includes?: string;
  pageFingerprint?: string;
  page_fingerprint?: string;
  readyState?: string;
  ready_state?: string;
  selectorExists?: string;
  selector_exists?: string;
  textIncludes?: string;
  text_includes?: string;
}

export class CreateExecutionDto {
  @ApiProperty({ description: 'Skill ID', example: 'skill-123', required: false })
  @IsOptional()
  @IsString()
  skillId?: string;

  @ApiProperty({
    description: 'Capability ID, alias of skillId for unified runtime',
    required: false,
  })
  @IsOptional()
  @IsString()
  capabilityId?: string;

  @ApiProperty({ description: 'Skill version', example: 'v1', required: false })
  @IsOptional()
  @IsString()
  skillVersion?: string;

  @ApiProperty({
    description: 'Capability version, alias of skillVersion for unified runtime',
    required: false,
  })
  @IsOptional()
  @IsString()
  capabilityVersion?: string;

  @ApiProperty({
    description: 'Runtime type',
    example: 'browser',
    default: 'browser',
    required: false,
  })
  @IsOptional()
  @IsString()
  runtimeType?: string;

  @ApiProperty({
    description: 'Execution input parameters',
    example: { url: 'https://example.com' },
  })
  @IsObject()
  input: Record<string, unknown>;

  @ApiProperty({
    description: 'Execution mode',
    example: 'single_skill',
    required: false,
  })
  @IsOptional()
  @IsString()
  executionMode?: 'single_skill' | 'deterministic_plan';

  @ApiProperty({
    description: 'Deterministic plan draft v1 for multi-step task execution',
    required: false,
  })
  @IsOptional()
  @IsObject()
  deterministicPlan?: Record<string, unknown>;

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

  @ApiProperty({ description: 'Trigger type (manual, schedule, etc.)', required: false })
  @IsOptional()
  @IsString()
  triggerType?: string;

  @ApiProperty({ description: 'ID of the schedule that triggered this execution', required: false })
  @IsOptional()
  @IsString()
  scheduleId?: string;
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

  @ApiProperty({
    description: 'Execution mode: single_skill (legacy) or deterministic_plan (multi-step)',
    required: false,
  })
  @IsOptional()
  executionMode?: 'single_skill' | 'deterministic_plan' | null;

  @ApiProperty({ required: false })
  @IsOptional()
  currentStepId?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  runtimeSessionId?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  currentPhaseKey?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  currentPhaseStatus?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  takeoverStatus?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  triggerType?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  scheduleId?: string | null;

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
  normalizedInputJson?: ExecutionNormalizedInputJson | null;

  @ApiProperty({ required: false })
  @IsOptional()
  input?: Record<string, unknown> | null;

  @ApiProperty({ required: false })
  @IsOptional()
  normalizedInput?: ExecutionNormalizedInputJson | null;

  @ApiProperty({ required: false })
  @IsOptional()
  semantic?: ExecutionSemantic | null;

  @ApiProperty({ required: false })
  @IsOptional()
  result?: Record<string, unknown> | null;

  @ApiProperty({ required: false })
  @IsOptional()
  normalizedResult?: NormalizedExecutionResult | null;

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

  @ApiProperty({ required: false, type: () => [ExecutionPhaseDto] })
  @IsOptional()
  phases?: ExecutionPhaseDto[];
}

export class ExecutionPhaseArtifactDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  artifactType: string;

  @ApiProperty({ required: false })
  @IsOptional()
  snapshotId?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  pageUrl?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  pageFingerprint?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  payload?: Record<string, unknown> | null;

  @ApiProperty()
  createdAt: string;
}

export class ExecutionTakeoverRecordDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  status: string;

  @ApiProperty({ required: false })
  @IsOptional()
  reason?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  requestedBy?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  resolvedBy?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  resolutionNote?: string | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty({ required: false })
  @IsOptional()
  resolvedAt?: string | null;
}

export class ExecutionPhaseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  executionId: string;

  @ApiProperty()
  phaseKey: string;

  @ApiProperty()
  phaseName: string;

  @ApiProperty()
  phaseType: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  attempt: number;

  @ApiProperty({ required: false })
  @IsOptional()
  runtimeSessionId?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  input?: Record<string, unknown> | null;

  @ApiProperty({ required: false })
  @IsOptional()
  output?: Record<string, unknown> | null;

  @ApiProperty({ required: false })
  @IsOptional()
  precheck?: BrowserPhaseCheck | null;

  @ApiProperty({ required: false })
  @IsOptional()
  postcheck?: BrowserPhaseCheck | null;

  @ApiProperty({ required: false })
  @IsOptional()
  errorCode?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  errorMessage?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  recoveryDecision?: Record<string, unknown> | null;

  @ApiProperty({ required: false })
  @IsOptional()
  startedAt?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  completedAt?: string | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  @ApiProperty({ required: false, type: () => [ExecutionPhaseArtifactDto] })
  @IsOptional()
  artifacts?: ExecutionPhaseArtifactDto[];

  @ApiProperty({ required: false, type: () => [ExecutionPhaseStepDto] })
  @IsOptional()
  steps?: ExecutionPhaseStepDto[];

  @ApiProperty({ required: false, type: () => [ExecutionTakeoverRecordDto] })
  @IsOptional()
  takeovers?: ExecutionTakeoverRecordDto[];
}

export class ExecutionPhaseStepDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  phaseId: string;

  @ApiProperty()
  stepIndex: number;

  @ApiProperty({ required: false })
  @IsOptional()
  stepId?: string | null;

  @ApiProperty()
  action: string;

  @ApiProperty()
  status: string;

  @ApiProperty({ required: false })
  @IsOptional()
  input?: Record<string, unknown> | null;

  @ApiProperty({ required: false })
  @IsOptional()
  output?: Record<string, unknown> | null;

  @ApiProperty({ required: false })
  @IsOptional()
  errorMessage?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  errorCode?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  snapshotId?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  startedAt?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  endedAt?: string | null;

  @ApiProperty()
  createdAt: string;
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
  @IsString()
  reason: string;

  @ApiProperty({ description: 'User requesting takeover', required: false })
  @IsOptional()
  @IsString()
  requestedBy?: string;
}

export class ResumeExecutionDto {
  @ApiProperty({ description: 'Step ID to resume from', required: false })
  @IsOptional()
  @IsString()
  stepId?: string;

  @ApiProperty({ description: 'Comment about resume action', required: false })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiProperty({ description: 'User resuming execution', required: false })
  @IsOptional()
  @IsString()
  resumedBy?: string;
}

export class ReleaseHumanControlDto extends ResumeExecutionDto {}

export class ReconcilePhaseTakeoverDto {
  @ApiProperty({ description: 'Comment about the manual intervention outcome', required: false })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiProperty({ description: 'User reconciling the phase takeover', required: false })
  @IsOptional()
  @IsString()
  resolvedBy?: string;

  @ApiProperty({ description: 'Optional recovery patch to apply when resuming', required: false })
  @IsOptional()
  patch?: Record<string, unknown> | null;
}

export class UpdateWorkflowActivityProgressDto {
  @ApiProperty({ description: 'Parent phase key for the workflow skill execution' })
  @IsString()
  parentPhaseKey: string;

  @ApiProperty({ description: '1-based activity order within the workflow', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activityOrder?: number;

  @ApiProperty({ description: 'Workflow activity display name', required: false })
  @IsOptional()
  @IsString()
  activityName?: string;

  @ApiProperty({ description: 'Runtime session bound to this workflow execution', required: false })
  @IsOptional()
  @IsString()
  runtimeSessionId?: string;
}

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

  @ApiProperty({
    description: 'Token usage collected while resolving missing inputs',
    required: false,
  })
  @IsOptional()
  @IsObject()
  usage?: Record<string, unknown>;

  @ApiProperty({ description: 'User submitting the input', required: false })
  @IsOptional()
  @IsString()
  submittedBy?: string;
}

export class CleanupExecutionsBeforeDateDto {
  @ApiProperty({
    description: 'Delete executions created before this date (YYYY-MM-DD)',
    example: '2026-05-13',
  })
  @IsDateString()
  beforeDate: string;
}
