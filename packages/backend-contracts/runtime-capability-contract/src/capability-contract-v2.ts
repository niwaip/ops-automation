import * as crypto from 'crypto';

export type CapabilitySourceTypeV2 = 'published_skill' | 'builtin_skill' | 'llm_operation';

export interface CapabilityMetadataV2 {
  id: string;
  version: string;
  sourceType: CapabilitySourceTypeV2;
  contractDigest?: string;
}

export interface CapabilitySingleContractV2 {
  schemaRef?: string;
  dataPath?: string;
  schema: Record<string, unknown>;
}

export interface CapabilityContractsV2 {
  input: CapabilitySingleContractV2;
  output: CapabilitySingleContractV2;
}

export interface CapabilityRuntimeV2 {
  type: 'temporal' | 'llm_operation' | 'builtin_handler' | 'api' | string;
  workflowType?: string;
  operationId?: string;
  promptTemplateId?: string;
  promptTemplateVersion?: string;
  modelPolicyId?: string;
  [key: string]: unknown;
}

export interface CapabilityTestFixtureV2 {
  name?: string;
  input: Record<string, unknown>;
  expectedOutput?: Record<string, unknown>;
  isNegativeFixture?: boolean;
}

export interface CapabilityContractV2 {
  apiVersion: string; // e.g. 'ops-automation/v2'
  kind: 'Capability';
  metadata: CapabilityMetadataV2;
  contracts: CapabilityContractsV2;
  runtime: CapabilityRuntimeV2;
  compatibility?: {
    policy?: 'backward' | 'none';
  };
  tests?: {
    fixtures?: CapabilityTestFixtureV2[];
  };
}

/**
 * Sort object keys recursively for canonical JSON stringification.
 */
export function canonicalizeValue(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(canonicalizeValue);
  }
  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  for (const k of keys) {
    sorted[k] = canonicalizeValue((obj as Record<string, unknown>)[k]);
  }
  return sorted;
}

/**
 * Compute SHA-256 digest of a normalized CapabilityContractV2.
 * Excludes metadata.contractDigest from calculation to avoid self-reference recursion.
 */
export function computeContractDigest(contract: CapabilityContractV2): string {
  const canonicalObj = {
    apiVersion: contract.apiVersion || 'ops-automation/v2',
    kind: contract.kind || 'Capability',
    metadata: {
      id: contract.metadata.id,
      version: contract.metadata.version,
      sourceType: contract.metadata.sourceType,
    },
    contracts: canonicalizeValue(contract.contracts),
  };

  const jsonStr = JSON.stringify(canonicalObj);
  const hash = crypto.createHash('sha256').update(jsonStr, 'utf8').digest('hex');
  return `sha256:${hash}`;
}
