import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export type CapabilitySourceType =
  | 'execution_flow_template'
  | 'temporal_workflow'
  | 'browser_recording';

export type CapabilityReleaseStatus =
  | 'draft'
  | 'building'
  | 'build_failed'
  | 'validating'
  | 'validation_failed'
  | 'draft_ready'
  | 'pending_approval'
  | 'approved'
  | 'published'
  | 'deploying'
  | 'deployed'
  | 'deploy_failed'
  | 'rolled_back';

export type CapabilityBuildType =
  | 'config_enhancement'
  | 'codegen_activity'
  | 'codegen_workflow'
  | 'skill_draft_generation';

export type CapabilityBuildStatus = 'running' | 'succeeded' | 'failed';

export type CapabilityValidationType = 'static' | 'sandbox' | 'post_deploy_smoke';

export type CapabilityApprovalDecision = 'approved' | 'rejected';

export type CapabilityDeploymentEnvironment = 'dev' | 'test' | 'staging' | 'prod';

export type CapabilityDeploymentRuntimeType = 'flow_runtime' | 'temporal_worker';

export type CapabilityDeploymentStatus = 'running' | 'succeeded' | 'failed' | 'rolled_back';

export interface WorkflowArtifactRefDTO {
  workflowId: string;
  artifactVersion?: number | null;
  artifactHash?: string | null;
}

export interface CreateCapabilityReleaseDTO {
  sourceType: CapabilitySourceType;
  sourceId?: string;
  sourceName?: string;
  workflowArtifactRef?: WorkflowArtifactRefDTO;
  workflowId?: string;
  artifactVersion?: number;
  artifactHash?: string;
  sourcePayload?: Record<string, unknown>;
}

export interface UpdateCapabilitySourceDTO {
  sourceName?: string;
  workflowArtifactRef?: WorkflowArtifactRefDTO;
  workflowId?: string;
  artifactVersion?: number;
  artifactHash?: string;
  sourcePayload: Record<string, unknown>;
}

export interface CreateCapabilityBuildDTO {
  buildType?: CapabilityBuildType;
  modelId?: string;
  errorContext?: string;
}

export interface ValidateCapabilityDTO {
  buildId?: string;
  input?: Record<string, unknown>;
  testUserInput?: string;
  testCases?: string[];
  fn?: string;
}

export interface GenerateSkillDraftDTO {
  validationId?: string;
  modelId?: string;
}

export class RecorderBridgePublishPayloadDTO {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  triggerKeywords?: string[];

  @IsOptional()
  @IsObject()
  paramsSchema?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  executionFlowTemplateIds?: string[];

  @IsOptional()
  @IsArray()
  executionFlow?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tools?: string[];

  @IsOptional()
  @IsObject()
  apiEndpoints?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  loopPlanPreview?: Array<Record<string, unknown>>;
}

export class RecorderBridgeSkillDraftDTO {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecorderBridgePublishPayloadDTO)
  publishPayload?: RecorderBridgePublishPayloadDTO;

  @IsOptional()
  @ValidateIf((_: object, value: unknown) => typeof value === 'string')
  @IsString()
  @ValidateIf(
    (_: object, value: unknown) =>
      Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  )
  @IsObject()
  invocation?: string | Record<string, unknown>;

  @IsOptional()
  parameterOnly?: boolean;

  @IsOptional()
  @IsArray()
  parameters?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsArray()
  outputs?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  usageNotes?: string[];

  @IsOptional()
  @IsString()
  usageMarkdown?: string;

  @IsOptional()
  @IsObject()
  executionPlan?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  commands?: Array<Record<string, unknown>>;
}

export class RecorderBridgeExportArtifactsDTO {
  @IsOptional()
  @IsString()
  guidance?: string;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  commands?: Array<Record<string, unknown>>;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecorderBridgeSkillDraftDTO)
  skillDraft?: RecorderBridgeSkillDraftDTO;

  @IsOptional()
  @IsString()
  script?: string;

  @IsOptional()
  @IsArray()
  templateSteps?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsObject()
  loopDraft?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  loopPlanPreview?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsObject()
  scriptValidation?: Record<string, unknown>;
}

export class BridgeRecorderExportDTO {
  @IsOptional()
  @IsUUID()
  releaseId?: string;

  @IsOptional()
  @IsString()
  userGoal?: string;

  @IsOptional()
  @IsString()
  sourceName?: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => RecorderBridgeExportArtifactsDTO)
  exportArtifacts!: RecorderBridgeExportArtifactsDTO;
}

export interface UpdateSkillDraftDTO {
  name?: string;
  description?: string;
  triggerKeywords?: string[];
  paramsSchema?: Record<string, unknown>;
  executionFlow?: Array<Record<string, unknown>>;
  executionFlowTemplateIds?: string[];
  tools?: string[];
  apiEndpoints?: Record<string, unknown>;
}

export interface PublishSkillDraftDTO {
  draftId?: string;
}

export interface ApproveCapabilityReleaseDTO {
  decision: CapabilityApprovalDecision;
  comment?: string;
}

export interface DeployCapabilityReleaseDTO {
  environment?: CapabilityDeploymentEnvironment;
  strategy?: 'hot_reload' | 'rolling_restart' | 'full_restart';
  configOverrides?: Record<string, unknown>;
}

export interface RollbackCapabilityReleaseDTO {
  targetReleaseId?: string;
  reason?: string;
}

export interface AnalyzeFailureDTO {
  recordId: string;
  recordType: 'build' | 'validation' | 'deployment';
}

export interface AnalyzeFailureResultDTO {
  analysis: string;
  explanation: string;
  isParameterIssue: boolean;
  suggestedParams?: Record<string, unknown> | null;
  suggestedAction?: string | null;
}

export interface SuggestReleaseWizardAssistDTO {
  environment?: CapabilityDeploymentEnvironment;
}

export interface SuggestReleaseWizardAssistResultDTO {
  explanation: string;
  deployConfig: Record<string, unknown>;
  testInput: Record<string, unknown>;
  testUserInput?: string | null;
}

export interface RefineSkillDraftResultDTO {
  name: string;
  description: string;
  triggerKeywords: string[];
}

export interface ExecuteCapabilityRuntimeDTO {
  capabilityId?: string;
  capabilityVersion?: string;
  publishedSkillId?: string;
  runtimeType?: string;
  executionId?: string;
  stepId?: string;
  runtimeSessionId?: string;
  phaseKey?: string;
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
}

export interface ExecuteCapabilityRuntimeResultDTO {
  releaseId: string;
  capabilityId: string;
  capabilityVersion?: string | null;
  publishedSkillId: string;
  runtime: string;
  status?: 'completed' | 'failed' | 'blocked' | 'waiting' | 'takeover_required';
  runtimeSessionId?: string | null;
  fn?: string;
  taskQueue?: string;
  success: boolean;
  downloadUrl?: string | null;
  temporalWorkflowId?: string | null;
  output?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  usage?: LLMUsage;
  retryable?: boolean;
  requiresTakeover?: boolean;
  takeoverReason?: string | null;
  logs: string[];
  error?: string | null;
}

export interface CapabilityReleaseDTO {
  id: string;
  sourceType: CapabilitySourceType;
  sourceId?: string | null;
  sourceName?: string | null;
  sourceStatus: string;
  releaseVersion: number;
  status: CapabilityReleaseStatus;
  approvalStatus: string;
  deploymentStatus: string;
  currentSourceSnapshotId?: string | null;
  currentBuildId?: string | null;
  latestSuccessfulBuildId?: string | null;
  latestValidationId?: string | null;
  latestSuccessfulValidationId?: string | null;
  currentSkillDraftId?: string | null;
  publishedSkillId?: string | null;
  lastDeploymentId?: string | null;
  lastDeploymentEnvironment?: string | null;
  rollbackOfReleaseId?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CapabilitySourceSnapshotDTO {
  id: string;
  releaseId: string;
  snapshotVersion: number;
  sourceType: CapabilitySourceType;
  sourceId?: string | null;
  workflowArtifactRef?: WorkflowArtifactRefDTO | null;
  sourcePayload: Record<string, unknown>;
  summary?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface CapabilityBuildDTO {
  id: string;
  releaseId: string;
  sourceSnapshotId: string;
  buildType: CapabilityBuildType;
  modelId: string;
  promptVersion?: string | null;
  inputSnapshot: Record<string, unknown>;
  generatedCode?: string | null;
  generatedConfig?: Record<string, unknown> | null;
  logs: string[];
  diffSummary?: string | null;
  status: CapabilityBuildStatus;
  errorSummary?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface CapabilityValidationDTO {
  id: string;
  releaseId: string;
  buildId: string;
  validationType: CapabilityValidationType;
  inputSnapshot?: Record<string, unknown> | null;
  resultSnapshot?: Record<string, unknown> | null;
  logs: string[];
  score: number;
  success: boolean;
  errorSummary?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface SkillDraftDTO {
  id: string;
  releaseId: string;
  generatedFromBuildId?: string | null;
  generatedFromValidationId?: string | null;
  sourceType: CapabilitySourceType;
  name: string;
  description: string;
  triggerKeywords: string[];
  paramsSchema: Record<string, unknown>;
  executionFlowTemplateIds: string[];
  tools: string[];
  apiEndpoints?: Record<string, unknown> | null;
  draftPayload: Record<string, unknown>;
  status: string;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentRecordDTO {
  id: string;
  releaseId: string;
  publishedSkillId?: string | null;
  environment: CapabilityDeploymentEnvironment;
  runtimeType: CapabilityDeploymentRuntimeType;
  artifactUri?: string | null;
  artifactHash?: string | null;
  workerVersion?: string | null;
  reloadStrategy?: string | null;
  requestPayload?: Record<string, unknown> | null;
  resultSnapshot?: Record<string, unknown> | null;
  logs: string[];
  status: CapabilityDeploymentStatus;
  success: boolean;
  smokeValidationId?: string | null;
  rollbackTargetReleaseId?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface ReleaseAuditEventDTO {
  id: string;
  releaseId: string;
  eventType: string;
  actorId?: string | null;
  actorName?: string | null;
  success: boolean;
  summary: string;
  details?: Record<string, unknown> | null;
  createdAt: string;
}

export interface CapabilityReleaseDetailDTO {
  release: CapabilityReleaseDTO;
  currentSourceSnapshot?: CapabilitySourceSnapshotDTO | null;
  sourceSnapshots?: CapabilitySourceSnapshotDTO[];
  builds: CapabilityBuildDTO[];
  validations: CapabilityValidationDTO[];
  currentSkillDraft?: SkillDraftDTO | null;
  deployments?: DeploymentRecordDTO[];
  auditEvents?: ReleaseAuditEventDTO[];
}

export interface BridgeRecorderExportResultDTO {
  release: CapabilityReleaseDTO;
  skillDraft: SkillDraftDTO;
  bridgeMode: 'browser_recording_native';
}
