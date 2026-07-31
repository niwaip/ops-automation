export interface ParamEnumConstraintSchema {
  enum?: unknown;
  description?: unknown;
  extractionPrompt?: unknown;
}

const LEGACY_ENUM_MARKER_PATTERN =
  /(?:仅允许(?:的)?枚举值|只允许(?:的)?枚举值|可选枚举值|枚举值|allowed values?|one of)\s*[:：]?\s*(\[[^\]]+\]|[^。；;\n]+)/giu;
const DEFAULT_SUFFIX_PATTERN = /\s+(?:默认值?|default)\s*[:：=]?.*$/iu;
const LEGACY_ENUM_SEPARATOR_PATTERN = /[、,，|/]+|\s+(?:或|或者|or)\s+/iu;
const LEGACY_ENUM_TOKEN_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u;

export function resolveParamEnumValues(
  schema: ParamEnumConstraintSchema
): Array<string | number> | undefined {
  const explicitValues = normalizeEnumValues(schema.enum);
  if (explicitValues.length > 0) {
    return explicitValues;
  }

  for (const candidate of [schema.description, schema.extractionPrompt]) {
    if (typeof candidate !== 'string' || candidate.trim().length === 0) {
      continue;
    }
    const inferredValues = inferLegacyEnumValues(candidate);
    if (inferredValues.length > 0) {
      return inferredValues;
    }
  }

  return undefined;
}

export function isParamEnumValueAllowed(
  value: unknown,
  allowedValues: Array<string | number> | undefined
): boolean {
  if (!allowedValues || allowedValues.length === 0) {
    return true;
  }
  return (typeof value === 'string' || typeof value === 'number') && allowedValues.includes(value);
}

function normalizeEnumValues(value: unknown): Array<string | number> {
  if (!Array.isArray(value)) {
    return [];
  }

  return uniqueEnumValues(
    value
      .map((item) => (typeof item === 'string' ? item.trim() : item))
      .filter(
        (item): item is string | number =>
          (typeof item === 'string' && item.length > 0) ||
          (typeof item === 'number' && Number.isFinite(item))
      )
  );
}

function inferLegacyEnumValues(text: string): Array<string | number> {
  for (const match of text.matchAll(LEGACY_ENUM_MARKER_PATTERN)) {
    const candidate = String(match[1] || '')
      .replace(DEFAULT_SUFFIX_PATTERN, '')
      .replace(/^[\s[\]（(]+|[\s[\]）)]+$/gu, '')
      .trim();
    if (!candidate) {
      continue;
    }

    const values = candidate
      .split(LEGACY_ENUM_SEPARATOR_PATTERN)
      .map((item) => item.replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/gu, '').trim())
      .filter((item) => LEGACY_ENUM_TOKEN_PATTERN.test(item));
    if (values.length > 0) {
      return uniqueEnumValues(values);
    }
  }

  return [];
}

function uniqueEnumValues(values: Array<string | number>): Array<string | number> {
  return values.filter(
    (value, index) =>
      values.findIndex((candidate) => typeof candidate === typeof value && candidate === value) ===
      index
  );
}
