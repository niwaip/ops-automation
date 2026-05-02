export type RuntimeType = 'browser' | 'document' | 'workflow' | 'api' | 'code' | 'custom';
export type RuntimeAdapterRouteKey = `${RuntimeType}:${string}`;

export const buildRuntimeAdapterRouteKey = (
  runtimeType: RuntimeType,
  capabilityType: string,
): RuntimeAdapterRouteKey => `${runtimeType}:${capabilityType}`;

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

export interface RuntimeAdapter {
  readonly runtimeType: RuntimeType;
  readonly routeKeys?: readonly RuntimeAdapterRouteKey[];
  supports(request: RuntimeStepInvokeRequest): boolean;
  initializeSession?(runtimeSessionId: string): Promise<void>;
  invokeStep(request: RuntimeStepInvokeRequest): Promise<RuntimeStepInvokeResult>;
}
