/**
 * LLM Operation Catalog Projection Types
 * 
 * 对齐后端 LlmOperationCatalogProjection 结构
 */

export interface LlmOperationCatalogEntry {
  capabilityRef: {
    id: string;
    version: string;
    digest: string;
  };
  capabilityKind: 'llm_operation';
  displayName: string;
  summary: string;
  goals: string[];
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
  runtime: {
    type: 'llm_operation';
    executionRuntimeType?: string;
  };
  lifecycle: {
    status: 'active' | 'deprecated' | 'disabled';
  };
  governance: {
    attestationId?: string;
    evaluatedAt?: string;
    approvedAt?: string;
  };
}

export interface LlmOperationCatalogResponse {
  operations: LlmOperationCatalogEntry[];
}

export type LlmOperationVersionState =
  | 'draft'
  | 'validating'
  | 'candidate'
  | 'approved'
  | 'deprecated'
  | 'retired'
  | 'rejected'
  | 'validation_failed'
  | 'approval_rejected'
  | 'activation_failed';

export interface LlmOperationRecord {
  id: string;
  operationKey: string;
  displayName: string;
  description: string;
  owner: string;
  status: 'active' | 'deprecated' | 'disabled';
  source: 'system_seed' | 'admin_created' | 'imported';
  createdAt: string;
  updatedAt: string;
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
  source: 'system_seed' | 'admin_created' | 'imported';
  approvedBy: string | null;
  approvedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LlmOperationActivationRecord {
  id: string;
  operationId: string;
  versionId: string;
  environment: 'dev' | 'staging' | 'production' | 'canary';
  activatedBy: string;
  reason: string;
  rolloutPercent: number | null;
  activatedAt: string;
  updatedAt: string;
}

export interface LlmOperationDetail {
  operation: LlmOperationRecord;
  versions: LlmOperationVersionRecord[];
  activations: LlmOperationActivationRecord[];
}

export interface SaveLlmOperationDraftInput {
  version: string;
  manifestJson: Record<string, unknown>;
  changeSummary: string;
}

export interface LlmOperationValidationSubmission {
  version: LlmOperationVersionRecord;
  validation: {
    manifest: {
      passed: true;
      promptVariables: string[];
      inputFields: string[];
      outputFields: string[];
      checks: string[];
    };
    fixture: { totalCases: number; passed: number; failed: number };
    eval: {
      runId: string;
      passed: boolean;
      metrics: {
        schemaPassRate: number;
        taskSuccessRate: number;
        safetyRejectRate: number;
      };
    };
    attestation: { id: string };
    suite: { id: string; digest: string; name: string };
  };
}
