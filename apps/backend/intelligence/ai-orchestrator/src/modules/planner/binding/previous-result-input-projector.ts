interface JsonSchemaProperty {
  type?: string | string[];
  'x-ops-input-role'?: unknown;
}

export type LlmOperationInputRole = 'content' | 'instruction' | 'configuration';

export interface PreviousResultProjection {
  value: unknown;
  sourceExecutionId?: string;
}

const MAX_COLLECTION_ITEMS = 20;
const MAX_STRING_LENGTH = 4000;
const MAX_OBJECT_KEYS = 40;
const MAX_DEPTH = 6;

/**
 * Projects a completed execution snapshot into the input shape required by a
 * root LLM Operation. The projection is schema-driven: arrays receive the
 * richest collection, objects receive the structured snapshot, and strings
 * receive the best available detail text.
 */
export function projectPreviousResultInput(
  property: JsonSchemaProperty | undefined,
  systemInputs?: Record<string, unknown>,
  fieldName?: string,
): PreviousResultProjection | undefined {
  const inputRole = resolveLlmOperationInputRole(fieldName, property);
  if (inputRole && inputRole !== 'content') {
    return undefined;
  }
  if (!inputRole && fieldName) {
    return undefined;
  }

  const reference = asRecord(systemInputs?.previousResultRef);
  const sourceExecutionId = asString(reference?.executionId);
  const structuredData = systemInputs?.previousResultData;
  const detailText = asString(systemInputs?.previousResultText);

  if (structuredData === undefined && !detailText) {
    return undefined;
  }

  const declaredTypes = Array.isArray(property?.type)
    ? property.type
    : property?.type
      ? [property.type]
      : [];

  if (declaredTypes.includes('array')) {
    const collection = selectRichestCollection(structuredData);
    const value = collection?.length
      ? collection.slice(0, MAX_COLLECTION_ITEMS).map((item) => compactValue(item, 0))
      : detailText
        ? [detailText.slice(0, MAX_STRING_LENGTH)]
        : undefined;
    return value === undefined ? undefined : { value, sourceExecutionId };
  }

  if (declaredTypes.includes('object')) {
    const record = asRecord(structuredData);
    if (record) {
      return { value: compactValue(record, 0), sourceExecutionId };
    }
    return detailText
      ? { value: { text: detailText.slice(0, MAX_STRING_LENGTH) }, sourceExecutionId }
      : undefined;
  }

  if (declaredTypes.includes('string') || declaredTypes.length === 0) {
    const value =
      selectPrimaryText(structuredData) ||
      selectPrimaryText(parseJsonText(detailText)) ||
      detailText ||
      stringifyCompact(structuredData);
    return value ? { value: value.slice(0, MAX_STRING_LENGTH), sourceExecutionId } : undefined;
  }

  return undefined;
}

const CONTENT_FIELD_NAMES = new Set([
  'content',
  'text',
  'items',
  'sources',
  'documents',
  'results',
  'markdown',
  'markdown_content',
  'summary',
  'body',
  'content_text',
  'input_text',
]);

/**
 * Resolves how an LLM Operation input is sourced. Built-in Operations declare
 * the role explicitly in their JSON Schema. The field-name fallback keeps
 * older manifests compatible without treating every string as prior content.
 */
export function resolveLlmOperationInputRole(
  fieldName: string | undefined,
  property: JsonSchemaProperty | undefined,
): LlmOperationInputRole | undefined {
  const explicitRole = property?.['x-ops-input-role'];
  if (
    explicitRole === 'content' ||
    explicitRole === 'instruction' ||
    explicitRole === 'configuration'
  ) {
    return explicitRole;
  }
  return fieldName && CONTENT_FIELD_NAMES.has(fieldName) ? 'content' : undefined;
}

const PRIMARY_TEXT_KEYS = [
  'markdown_content',
  'markdownContent',
  'summary',
  'content',
  'text',
  'body',
  'detailText',
  'chatSummary',
  'finalAnswer',
  'formatted_output',
];

const ENVELOPE_KEYS = [
  'result',
  'presentation',
  'businessData',
  'data',
  'output',
  'finalOutputs',
  'value',
];

function selectPrimaryText(value: unknown, depth = 0): string | undefined {
  if (depth > MAX_DEPTH) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = parseJsonText(trimmed);
    return parsed === undefined ? trimmed : selectPrimaryText(parsed, depth + 1) || trimmed;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = selectPrimaryText(item, depth + 1);
      if (candidate) return candidate;
    }
    return undefined;
  }
  const record = asRecord(value);
  if (!record) return undefined;

  for (const key of PRIMARY_TEXT_KEYS) {
    const candidate = record[key];
    const primaryText = selectPrimaryText(candidate, depth + 1);
    if (primaryText) return primaryText;
  }

  for (const key of ENVELOPE_KEYS) {
    const candidate = selectPrimaryText(record[key], depth + 1);
    if (candidate) return candidate;
  }
  return undefined;
}

function parseJsonText(value: string | undefined): unknown {
  if (!value || (!value.startsWith('{') && !value.startsWith('['))) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function selectRichestCollection(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) {
    return value as unknown[];
  }

  const candidates: Array<{ items: unknown[]; score: number }> = [];
  collectCollections(value, 0, candidates);
  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.items;
}

function collectCollections(
  value: unknown,
  depth: number,
  candidates: Array<{ items: unknown[]; score: number }>,
): void {
  if (depth > MAX_DEPTH || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    const items = value as unknown[];
    if (items.length > 0) {
      const informationSize = items
        .slice(0, MAX_COLLECTION_ITEMS)
        .reduce<number>((sum, item) => sum + estimateInformationSize(item), 0);
      candidates.push({
        items,
        score: informationSize + Math.min(items.length, MAX_COLLECTION_ITEMS) * 20 - depth * 50,
      });
    }
    return;
  }

  const record = asRecord(value);
  if (!record) return;
  for (const child of Object.values(record)) {
    collectCollections(child, depth + 1, candidates);
  }
}

function estimateInformationSize(value: unknown): number {
  if (typeof value === 'string') return Math.min(value.length, MAX_STRING_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean') return 8;
  if (Array.isArray(value)) {
    return (value as unknown[])
      .slice(0, 5)
      .reduce<number>((sum, item) => sum + estimateInformationSize(item), 0);
  }
  const record = asRecord(value);
  if (!record) return 0;
  return Object.entries(record)
    .slice(0, MAX_OBJECT_KEYS)
    .reduce((sum, [key, child]) => sum + key.length + estimateInformationSize(child), 0);
}

function compactValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (depth >= MAX_DEPTH) return stringifyCompact(value).slice(0, MAX_STRING_LENGTH);
  if (Array.isArray(value)) {
    return (value as unknown[])
      .slice(0, MAX_COLLECTION_ITEMS)
      .map((item) => compactValue(item, depth + 1));
  }
  const record = asRecord(value);
  if (!record) return String(value);
  return Object.fromEntries(
    Object.entries(record)
      .slice(0, MAX_OBJECT_KEYS)
      .map(([key, child]) => [key, compactValue(child, depth + 1)]),
  );
}

function stringifyCompact(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(compactValue(value, 0));
  } catch {
    return String(value);
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
