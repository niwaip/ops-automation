export type Environment = 'dev' | 'staging' | 'production' | 'canary';

export interface ExecuteLlmOperationV2Request {
  executionId: string;
  stepId: string;
  planHash?: string;
  /** Registry operation key. It is intentionally open to admin-created Operations. */
  operationId: string;
  operationVersion?: string;
  operationDigest?: string;
  contractDigest?: string;
  /** Exact model pinned by the frozen deterministic plan. */
  modelId?: string;
  environment?: Environment;
  input: Record<string, unknown>;
  idempotencyKey: string;
  actor?: string;
}

export interface LlmOperationV2Result {
  success: boolean;
  operationRef: {
    id: string;
    version: string;
    digest: string;
  };
  source: 'database' | 'legacy_registry';
  data?: Record<string, unknown>;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  metadata: {
    provider: string;
    requestedModel: string;
    resolvedModel?: string;
    finishReason?: string;
    repairAttempts: number;
    latencyMs: number;
    schemaValidated: boolean;
    toolCallDetected: boolean;
    idempotentReplay?: boolean;
  };
  errorCode?: string;
  errorMessage?: string;
  promptDebug?: {
    systemPrompt: string;
    userPrompt: string;
    modelId: string;
    llmResponseText?: string;
    repairAttempts?: number;
  };
}
