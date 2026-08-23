import { createHash } from 'crypto';
import type { LlmOperationIdV1 } from '@ops/backend-deterministic-plan';

export interface SystemEvalFixture {
  name: string;
  inputJson: Record<string, unknown>;
  expectedJson: Record<string, unknown> | null;
  isNegative: boolean;
  errorContains: string | null;
}

interface JsonSchemaShape {
  type?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchemaShape>;
  required?: string[];
  items?: JsonSchemaShape;
}

export function buildSystemEvalFixtures(
  operationId: LlmOperationIdV1,
  manifest: Record<string, unknown>,
): { digest: string; cases: SystemEvalFixture[] } {
  const inputSchema = readSchema(manifest.inputSchema);
  const outputSchema = readSchema(manifest.outputSchema);
  const validInput = buildObjectSample(inputSchema, 'input');
  const expectedOutput = buildObjectSample(outputSchema, 'output');
  const overBudgetInput = buildOverBudgetInput(inputSchema);

  // Negative categories that intentionally do not apply to this operation
  // (declared in the manifest's evalPolicy, derived from the operation shape:
  // single-string-output fallback exempts 'invalid-json', oversize 'truncate'
  // exempts 'over-budget').
  const evalPolicy = (manifest.evalPolicy as Record<string, unknown> | undefined) ?? {};
  const exempt = new Set(
    Array.isArray(evalPolicy.exemptNegativeCategories)
      ? (evalPolicy.exemptNegativeCategories as string[])
      : [],
  );

  const allCases: Array<SystemEvalFixture & { category: string }> = [
    {
      category: 'normal',
      name: `${operationId}-normal`,
      inputJson: validInput,
      expectedJson: expectedOutput,
      isNegative: false,
      errorContains: null,
    },
    {
      category: 'schema-fail',
      name: `${operationId}-schema-fail`,
      inputJson: {},
      expectedJson: null,
      isNegative: true,
      errorContains: 'schema',
    },
    {
      category: 'invalid-json',
      name: `${operationId}-invalid-json`,
      inputJson: validInput,
      expectedJson: null,
      isNegative: true,
      errorContains: 'JSON',
    },
    {
      category: 'tool-call',
      name: `${operationId}-tool-call`,
      inputJson: validInput,
      expectedJson: null,
      isNegative: true,
      errorContains: 'tool',
    },
    {
      category: 'over-budget',
      name: `${operationId}-over-budget`,
      inputJson: overBudgetInput,
      expectedJson: null,
      isNegative: true,
      errorContains: 'budget',
    },
  ];

  const cases = allCases
    .filter((fixture) => !exempt.has(fixture.category))
    .map(({ category: _category, ...rest }) => rest);

  const digest = createHash('sha256').update(JSON.stringify(cases)).digest('hex');
  return { digest: `sha256:${digest}`, cases };
}

function readSchema(value: unknown): JsonSchemaShape {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonSchemaShape
    : {};
}

function buildObjectSample(schema: JsonSchemaShape, prefix: string): Record<string, unknown> {
  const properties = schema.properties || {};
  const required = Array.isArray(schema.required) ? schema.required : Object.keys(properties);
  const result: Record<string, unknown> = {};
  for (const name of required) {
    result[name] = buildValueSample(properties[name] || {}, `${prefix}-${name}`);
  }
  return result;
}

function buildValueSample(schema: JsonSchemaShape, label: string): unknown {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }
  switch (schema.type) {
    case 'array':
      return [buildValueSample(schema.items || { type: 'string' }, `${label}-item`)];
    case 'object':
      return buildObjectSample(schema, label);
    case 'number':
    case 'integer':
      return 1;
    case 'boolean':
      return true;
    case 'string':
    default:
      return `${label} example`;
  }
}

function buildOverBudgetInput(schema: JsonSchemaShape): Record<string, unknown> {
  const sample = buildObjectSample(schema, 'over-budget');
  const firstField = Object.keys(sample)[0] || 'text';
  const property = schema.properties?.[firstField] || {};
  sample[firstField] = property.type === 'array'
    ? ['x'.repeat(100_000)]
    : 'x'.repeat(100_000);
  return sample;
}
