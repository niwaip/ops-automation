import { ERROR_CODES } from '@ops/backend-error-codes';

/**
 * Structured error context (design doc §12.1).
 */
export interface ContractViolationContext {
  executionId?: string;
  nodeId?: string;
  capabilityId?: string;
  capabilityVersion?: string;
  contractDigest?: string;
  contractCheckMode?: 'schema' | 'heuristic';
  instancePath?: string;
  keyword?: string;
}

/**
 * Structured contract violation error (design doc §12.1): carries a stable
 * error code plus machine-readable context for events/metrics, while keeping
 * the human-readable message format used by existing consumers.
 */
export class ContractViolationError extends Error {
  public readonly code: string;
  public readonly context: ContractViolationContext;

  constructor(code: string, message: string, context: ContractViolationContext) {
    super(message);
    this.name = 'ContractViolationError';
    this.code = code || ERROR_CODES.OUTPUT_SCHEMA_VIOLATION;
    this.context = context;
  }
}
