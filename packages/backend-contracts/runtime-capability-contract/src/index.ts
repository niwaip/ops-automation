export type RuntimeType = 'browser' | 'document' | 'workflow' | 'api' | 'code' | 'custom';

export interface PolicyContext {
  riskLevel?: 'L0' | 'L1' | 'L2' | 'L3';
  requiresApproval?: boolean;
  requiresConfirmation?: boolean;
  environmentTag?: string;
  allowExternalNetwork?: boolean;
  allowPersistentSession?: boolean;
  allowedDomains?: string[];
  allowedResourceScopes?: string[];
}

export interface TraceContext {
  traceId?: string;
  userId?: string;
  actorType?: 'system' | 'user' | 'approver' | 'operator';
  sourceService?: string;
}

export interface ArtifactRef {
  type: string;
  id?: string;
  name?: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  metadata?: Record<string, unknown>;
}

export interface RuntimePhaseArtifact {
  artifactType: string;
  snapshotId?: string | null;
  pageUrl?: string | null;
  pageFingerprint?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface SnapshotRef {
  id: string;
  type?: 'browser' | 'document' | 'workflow' | 'api' | 'custom';
  url?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface RuntimeMetrics {
  durationMs?: number;
  attemptCount?: number;
  cpuMs?: number;
  memoryBytes?: number;
}

export interface RuntimeStepInvokeRequest {
  requestId: string;
  executionId: string;
  stepId: string;
  runtimeType: RuntimeType;
  runtimeSessionId?: string | null;
  skillId?: string | null;
  publishedSkillId?: string | null;
  capabilityType: string;
  action: string;
  input: Record<string, unknown>;
  policyContext?: PolicyContext;
  traceContext?: TraceContext;
  metadata?: Record<string, unknown>;
}

export interface RuntimeStepInvokeResult {
  success: boolean;
  status: 'completed' | 'failed' | 'blocked' | 'waiting' | 'takeover_required';
  output?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  requiresTakeover?: boolean;
  takeoverReason?: string;
  artifacts?: ArtifactRef[];
  snapshot?: SnapshotRef | null;
  metrics?: RuntimeMetrics;
  rawResult?: Record<string, unknown>;
}

export interface RuntimePhaseInvokeRequest {
  executionId: string;
  phaseKey: string;
  phaseName?: string;
  phaseType?: string;
  runtimeSessionId?: string | null;
  steps: RuntimeStepInvokeRequest[];
  metadata?: Record<string, unknown>;
}

export interface RuntimePhaseInvokeResult {
  success: boolean;
  status: 'completed' | 'failed' | 'blocked' | 'waiting' | 'takeover_required';
  stepResults: RuntimeStepInvokeResult[];
  failedStepId?: string;
  failedAction?: string;
  snapshotId?: string | null;
  pageUrl?: string | null;
  pageFingerprint?: string | null;
  artifacts?: RuntimePhaseArtifact[];
  output?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  requiresTakeover?: boolean;
  takeoverReason?: string;
}

export * from './capability-contract-v2';
export * from './json-schema-validator';
export * from './planning-contract';
