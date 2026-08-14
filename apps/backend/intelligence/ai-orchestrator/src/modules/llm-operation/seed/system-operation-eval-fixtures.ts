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
  const cases: SystemEvalFixture[] = [
    {
      name: `${operationId}-normal`,
      inputJson: validInput,
      expectedJson: expectedOutput,
      isNegative: false,
      errorContains: null,
    },
    {
      name: `${operationId}-schema-fail`,
      inputJson: {},
      expectedJson: null,
      isNegative: true,
      errorContains: 'schema',
    },
    {
      name: `${operationId}-invalid-json`,
      inputJson: validInput,
      expectedJson: null,
      isNegative: true,
      errorContains: 'JSON',
    },
    {
      name: `${operationId}-tool-call`,
      inputJson: validInput,
      expectedJson: null,
      isNegative: true,
      errorContains: 'tool',
    },
    {
      name: `${operationId}-over-budget`,
      inputJson: overBudgetInput,
      expectedJson: null,
      isNegative: true,
      errorContains: 'budget',
    },
  ];
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
