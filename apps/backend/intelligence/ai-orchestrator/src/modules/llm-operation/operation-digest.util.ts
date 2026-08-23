import { createHash } from 'crypto';

/**
 * Input for computing operation digest (Design §8.2)
 * Includes prompt fields to ensure prompt changes affect digest
 */
export interface OperationDigestInput {
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
  promptSystemTemplate?: string;
  promptUserTemplate?: string;
  promptVariables?: string[];
  promptTemplateId: string;
  version: string;
  modelPolicyId: string;
  temperature: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  modelOutputMode?: 'text' | 'json';
  repairPromptTemplate?: string;
  inputPolicyOversize?: 'reject' | 'truncate';
  evalPolicyExempt?: string[];
  executionPolicyTools?: 'disabled' | 'enabled';
}

/**
 * Recursively canonicalize JSON value for deterministic hashing:
 * - Object keys sorted lexicographically
 * - Arrays preserve business order
 * - Primitives preserved as-is
 */
export function canonicalizeJson(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = canonicalizeJson(obj[key]);
    }
    return result;
  }

  return value;
}

/**
 * Compute stable SHA-256 digest for operation manifest.
 * Returns 'sha256:<hex>' format (64 hex characters).
 *
 * Deterministic canonicalization ensures:
 * - Same logical schema produces same digest regardless of key order
 * - Changes to version, modelPolicy, temperature, or tokens change digest
 */
export function computeOperationDigest(input: OperationDigestInput): string {
  const canonicalInput = canonicalizeJson({
    inputSchema: input.inputSchema,
    outputSchema: input.outputSchema,
    promptSystemTemplate: input.promptSystemTemplate || '',
    promptUserTemplate: input.promptUserTemplate || '',
    promptVariables: [...(input.promptVariables || [])].sort(),
    promptTemplateId: input.promptTemplateId,
    version: input.version,
    modelPolicyId: input.modelPolicyId,
    temperature: input.temperature,
    maxInputTokens: input.maxInputTokens,
    maxOutputTokens: input.maxOutputTokens,
    modelOutputMode: input.modelOutputMode || 'json',
    repairPromptTemplate: input.repairPromptTemplate,
    inputPolicyOversize: input.inputPolicyOversize || 'reject',
    evalPolicyExempt: [...(input.evalPolicyExempt || [])].sort(),
    executionPolicyTools: input.executionPolicyTools || 'disabled',
  });

  const jsonString = JSON.stringify(canonicalInput);
  const hash = createHash('sha256').update(jsonString, 'utf8').digest('hex');

  return `sha256:${hash}`;
}
