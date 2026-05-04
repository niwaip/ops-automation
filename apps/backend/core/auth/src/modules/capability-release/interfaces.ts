export type CapabilitySourceType = 'execution_flow_template' | 'temporal_workflow';

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

export interface CreateCapabilityReleaseDTO {
  sourceType: CapabilitySourceType;
  sourceId?: string;
  sourceName?: string;
  sourcePayload?: Record<string, unknown>;
}

export interface UpdateCapabilitySourceDTO {
  sourceName?: string;
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

export interface UpdateSkillDraftDTO {
  name?: string;
  description?: string;
  triggerKeywords?: string[];
  paramsSchema?: Record<string, unknown>;
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
  input?: Record<string, unknown>;
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
  fn?: string;
  taskQueue?: string;
  success: boolean;
  downloadUrl?: string | null;
  temporalWorkflowId?: string | null;
  output?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  usage?: LLMUsage;
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
