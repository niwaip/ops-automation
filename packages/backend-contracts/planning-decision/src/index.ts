export const PLANNING_CLASSES_V1 = [
  'replay_workflow',
  'single_capability',
  'recipe_plan',
  'generated_plan',
  'exploratory_agent',
] as const;

export type PlanningClassV1 = (typeof PLANNING_CLASSES_V1)[number];

export const PLANNING_ROUTE_SOURCES_V1 = [
  'explicit_reference',
  'saved_workflow',
  'deterministic_match',
  'recipe',
  'llm_topology',
  'exploratory',
] as const;

export type PlanningRouteSourceV1 = (typeof PLANNING_ROUTE_SOURCES_V1)[number];

export interface PlanningDecisionV1 {
  schemaVersion: 'planning-decision/v1';
  routeClass: PlanningClassV1;
  routeSource: PlanningRouteSourceV1;
  confidence: number;
  reasonCodes: string[];
  candidateIds: string[];
  selectedCapabilityIds: string[];
  catalogSnapshotDigest: string;
  routingPolicyVersion: string;
  routingPolicyDigest: string;
  estimatedModelCalls: number;
  estimatedInputTokens: number;
  tokenBudget: number;
  riskLevel: 'L0' | 'L1' | 'L2' | 'L3';
  requiresApproval: boolean;
  replayability: 'exact' | 'contract' | 'best_effort';
}

export interface PlanningDecisionValidationResult {
  valid: boolean;
  errors: string[];
}

const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;

export function validatePlanningDecisionV1(value: unknown): PlanningDecisionValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, errors: ['decision must be an object'] };
  }

  if (value.schemaVersion !== 'planning-decision/v1') {
    errors.push('schemaVersion must equal planning-decision/v1');
  }
  if (!PLANNING_CLASSES_V1.includes(value.routeClass as PlanningClassV1)) {
    errors.push('routeClass is invalid');
  }
  if (!PLANNING_ROUTE_SOURCES_V1.includes(value.routeSource as PlanningRouteSourceV1)) {
    errors.push('routeSource is invalid');
  }
  validateBoundedNumber(value.confidence, 'confidence', 0, 1, errors);
  validateStringArray(value.reasonCodes, 'reasonCodes', errors);
  validateStringArray(value.candidateIds, 'candidateIds', errors);
  validateStringArray(value.selectedCapabilityIds, 'selectedCapabilityIds', errors);
  validateDigest(value.catalogSnapshotDigest, 'catalogSnapshotDigest', errors);
  validateNonEmptyString(value.routingPolicyVersion, 'routingPolicyVersion', errors);
  validateDigest(value.routingPolicyDigest, 'routingPolicyDigest', errors);
  validateNonNegativeInteger(value.estimatedModelCalls, 'estimatedModelCalls', errors);
  validateNonNegativeInteger(value.estimatedInputTokens, 'estimatedInputTokens', errors);
  validateNonNegativeInteger(value.tokenBudget, 'tokenBudget', errors);
  if (!['L0', 'L1', 'L2', 'L3'].includes(String(value.riskLevel))) {
    errors.push('riskLevel is invalid');
  }
  if (typeof value.requiresApproval !== 'boolean') {
    errors.push('requiresApproval must be a boolean');
  }
  if (!['exact', 'contract', 'best_effort'].includes(String(value.replayability))) {
    errors.push('replayability is invalid');
  }

  return { valid: errors.length === 0, errors };
}

export function assertPlanningDecisionV1(value: unknown): asserts value is PlanningDecisionV1 {
  const result = validatePlanningDecisionV1(value);
  if (!result.valid) {
    throw new Error(`Invalid PlanningDecisionV1: ${result.errors.join('; ')}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateBoundedNumber(
  value: unknown,
  field: string,
  min: number,
  max: number,
  errors: string[]
): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    errors.push(`${field} must be a number between ${min} and ${max}`);
  }
}

function validateNonNegativeInteger(value: unknown, field: string, errors: string[]): void {
  if (!Number.isInteger(value) || Number(value) < 0) {
    errors.push(`${field} must be a non-negative integer`);
  }
}

function validateNonEmptyString(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${field} must be a non-empty string`);
  }
}

function validateDigest(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    errors.push(`${field} must be a lowercase sha256 digest`);
  }
}

function validateStringArray(value: unknown, field: string, errors: string[]): void {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.trim() === '')
  ) {
    errors.push(`${field} must be an array of non-empty strings`);
  }
}
