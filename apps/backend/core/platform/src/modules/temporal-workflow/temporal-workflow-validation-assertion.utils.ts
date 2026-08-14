import type { WorkflowValidationAssertionOperator } from './temporal-workflow.types';

const ASSERTION_OPERATOR_ALIASES: Record<string, WorkflowValidationAssertionOperator> = {
  exists: 'exists',
  exist: 'exists',
  present: 'exists',
  required: 'exists',
  nonempty: 'nonEmpty',
  notempty: 'nonEmpty',
  equals: 'equals',
  equal: 'equals',
  eq: 'equals',
  notequals: 'notEquals',
  notequal: 'notEquals',
  neq: 'notEquals',
  minitems: 'minItems',
  min: 'min',
  minimum: 'min',
  gte: 'min',
  greaterthanorequal: 'min',
  max: 'max',
  maximum: 'max',
  lte: 'max',
  lessthanorequal: 'max',
};

function assertionOperatorKey(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/[\s_-]+/g, '')
    .toLowerCase();
}

export function normalizeWorkflowValidationAssertionOperator(
  value: unknown
): WorkflowValidationAssertionOperator | undefined {
  return ASSERTION_OPERATOR_ALIASES[assertionOperatorKey(value)];
}

export function isLegacyRequiredAssertionOperator(value: unknown): boolean {
  return assertionOperatorKey(value) === 'required';
}
