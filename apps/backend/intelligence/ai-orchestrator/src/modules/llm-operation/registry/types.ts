export type LlmOperationStatus = 'active' | 'deprecated' | 'disabled';
export type LlmOperationSource = 'system_seed' | 'admin_created' | 'imported';
export type LlmOperationVersionState =
  | 'draft' | 'validating' | 'candidate' | 'approved'
  | 'deprecated' | 'retired' | 'rejected'
  | 'validation_failed' | 'approval_rejected' | 'activation_failed';
export type Environment = 'dev' | 'staging' | 'production' | 'canary';
export type ActivationLabel = 'staging' | 'production' | 'canary';
export type GateResult = 'passed' | 'failed' | 'skipped';

export interface LlmOperationRecord {
  id: string;
  operationKey: string;
  displayName: string;
  description: string;
  owner: string;
  status: LlmOperationStatus;
  source: LlmOperationSource;
  createdAt: Date;
  updatedAt: Date;
}

export interface LlmOperationVersionRecord {
  id: string;
  operationId: string;
  version: string;
  state: LlmOperationVersionState;
  manifestJson: Record<string, unknown>;
  operationDigest: string;
  contractDigest: string;
  changeSummary: string;
  source: LlmOperationSource;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LlmOperationActivationRecord {
  id: string;
  operationId: string;
  versionId: string;
  environment: Environment;
  label: ActivationLabel | null;
  activatedBy: string;
  reason: string;
  rolloutPercent: number | null;
  activatedAt: Date;
  updatedAt: Date;
}

export interface LlmOperationActivationEventRecord {
  id: string;
  operationId: string;
  previousVersionId: string | null;
  newVersionId: string;
  environment: Environment;
  action: 'activate' | 'rollback' | 'disable' | 'canary_adjust';
  actor: string;
  reason: string;
  metadataJson: Record<string, unknown> | null;
  createdAt: Date;
}

export interface LegacyLlmOperationVersion {
  id: string;
  operationId: string | null;
  version: string;
  state: 'approved';
  manifestJson: Record<string, unknown>;
  operationDigest: string;
  contractDigest: string;
  changeSummary: string;
  source: 'legacy_registry';
  approvedBy: string | null;
  approvedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LlmOperationSummary {
  operation: LlmOperationRecord;
  currentVersion: LlmOperationVersionRecord;
  activation: LlmOperationActivationRecord | null;
}

export interface LlmOperationDetail {
  operation: LlmOperationRecord;
  versions: LlmOperationVersionRecord[];
  activations: LlmOperationActivationRecord[];
}

export interface LlmOperationInvocationRecord {
  id: string;
  versionId: string;
  executionId?: string;
  stepId?: string;
  tenantId?: string;
  provider: string;
  requestedModel: string;
  resolvedModel?: string;
  inputDigest?: string;
  outputDigest?: string;
  idempotencyKey?: string;
  resultJson?: Record<string, unknown>;
  inputStorageRef?: string;
  outputStorageRef?: string;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  latencyMs?: number;
  estimatedCost?: number;
  parseAttempts: number;
  repairAttempts: number;
  validationResult: 'passed' | 'failed' | 'skipped';
  finishReason?: string;
  errorCode?: string;
  actor: string;
  environment: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface LlmOperationAttestationRecord {
  id: string;
  operationId: string;
  versionId: string;
  operationDigest: string;
  contractDigest: string;
  evalSuiteDigest: string | null;
  validatorVersion: string;
  schemaTests: GateResult;
  offlineEvals: GateResult;
  liveEvals: GateResult;
  securityEvals: GateResult;
  gateResultsJson: Record<string, unknown>;
  createdBy: string;
  createdAt: Date;
}

export interface LlmOperationEvalSuiteRecord {
  id: string;
  operationId: string;
  versionId: string | null;
  name: string;
  description: string | null;
  suiteDigest: string;
  createdBy: string;
  createdAt: Date;
}

export interface LlmOperationEvalCaseRecord {
  id: string;
  suiteId: string;
  name: string;
  inputJson: Record<string, unknown>;
  expectedJson: Record<string, unknown> | null;
  isNegative: boolean;
  errorContains: string | null;
  createdAt: Date;
}

export interface LlmOperationEvalRunRecord {
  id: string;
  versionId: string;
  suiteId: string;
  modelPolicySnapshot: Record<string, unknown>;
  resultsJson: Record<string, unknown>;
  metricsJson: Record<string, unknown>;
  baselineVersionId: string | null;
  executedBy: string;
  startedAt: Date;
  completedAt: Date | null;
}
