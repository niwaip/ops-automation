export type TemporalSchemaValueType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'date';

export interface TemporalJsonSchemaTypeProjection {
  type: 'string' | 'number' | 'integer' | 'boolean';
  format?: 'date' | 'date-time';
  'x-temporal-format'?: 'unix-seconds' | 'unix-milliseconds';
}

const normalizeToken = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase();

/**
 * Convert the Temporal authoring type system into standards-compliant JSON
 * Schema. Temporal's `date` and unix timestamp formats are authoring metadata,
 * not JSON Schema primitive types.
 */
export const projectTemporalTypeToJsonSchema = (
  valueType: TemporalSchemaValueType,
  declaredFormat?: unknown
): TemporalJsonSchemaTypeProjection => {
  const format = normalizeToken(declaredFormat);

  if (format === 'unix-milliseconds' || format === 'unix-seconds') {
    return {
      type: 'integer',
      'x-temporal-format': format,
    };
  }

  if (valueType === 'date' || format === 'date' || format === 'date-time') {
    return {
      type: 'string',
      format: format === 'date-time' ? 'date-time' : 'date',
    };
  }

  return { type: valueType };
};

/**
 * Normalize stale/hand-authored Temporal property schemas before merging them
 * with the authoritative projection from Workflow DSL.
 */
export const normalizeTemporalJsonSchemaProperty = (
  property: Record<string, unknown>
): Record<string, unknown> => {
  const normalized = { ...property };
  const type = normalizeToken(normalized.type);
  const format = normalizeToken(normalized.format);
  const temporalFormat = normalizeToken(normalized['x-temporal-format']);

  if (temporalFormat === 'unix-milliseconds' || temporalFormat === 'unix-seconds') {
    normalized.type = 'integer';
    delete normalized.format;
    normalized['x-temporal-format'] = temporalFormat;
    return normalized;
  }

  if (type === 'date' || type === 'datetime' || type === 'date-time') {
    normalized.type = 'string';
    normalized.format = type === 'date' && format !== 'date-time' ? 'date' : 'date-time';
  } else if (type === 'int' || type === 'int32' || type === 'int64' || type === 'long') {
    normalized.type = 'integer';
  } else if (type === 'float' || type === 'double' || type === 'decimal') {
    normalized.type = 'number';
  } else if (type === 'bool') {
    normalized.type = 'boolean';
  }

  if (format === 'unix-milliseconds' || format === 'unix-seconds') {
    normalized.type = 'integer';
    delete normalized.format;
    normalized['x-temporal-format'] = format;
  }

  return normalized;
};
