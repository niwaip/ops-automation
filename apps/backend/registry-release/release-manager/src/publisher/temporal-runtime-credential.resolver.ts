const SENSITIVE_RUNTIME_FIELD =
  /(?:api[_-]?key|device[_-]?key|access[_-]?key|private[_-]?key|access[_-]?token|refresh[_-]?token|authorization|credential|password|secret|token)$/i;
const ENV_KEY = /^[A-Z][A-Z0-9_]*$/;

type RuntimeEnvironment = Record<string, string | undefined>;

export interface TemporalRuntimeCredentialResolution {
  input: Record<string, unknown>;
  missing: Array<{ field: string; envKeys: string[] }>;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const readEnvKey = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return ENV_KEY.test(normalized) ? normalized : undefined;
};

const isPlaceholderCredential = (value: unknown): boolean =>
  typeof value === 'string' &&
  (/^test[_-]/i.test(value.trim()) ||
    /^(?:\[redacted\]|\*{4,}|•{4,})$/i.test(value.trim()));

const resolveCredentialEnvKeys = (
  field: string,
  definition: Record<string, unknown>
): string[] => {
  const explicit = [
    definition.credentialEnvKey,
    definition.secretEnvKey,
    definition.envVar,
  ]
    .map(readEnvKey)
    .filter((value): value is string => Boolean(value));
  if (explicit.length > 0) return Array.from(new Set(explicit));

  // Backward compatibility for older Tavily workflow snapshots, which only
  // described the provider in the schema and persisted apiKey as a default.
  const schemaText = [
    field,
    definition.title,
    definition.displayName,
    definition.description,
    definition.extractionPrompt,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  return /tavily/i.test(schemaText) ? ['TAVILY_API_KEY', 'SEARCH_API_KEY'] : [];
};

export const findTemporalCredentialDefaults = (
  sourcePayload: Record<string, unknown>
): string[] => {
  const paramsSchema = asRecord(sourcePayload.paramsSchema);
  const properties = asRecord(paramsSchema?.properties) || {};
  return Object.entries(properties).flatMap(([field, rawDefinition]) => {
    const definition = asRecord(rawDefinition) || {};
    return SENSITIVE_RUNTIME_FIELD.test(field) &&
      definition.default !== undefined &&
      definition.default !== null &&
      definition.default !== ''
      ? [field]
      : [];
  });
};

/**
 * Resolves workflow credentials and parameters. Credentials (such as apiKey)
 * configured in the workflow definition/snapshot or passed in execution input
 * are respected directly per workflow/user. Environment variables serve as optional fallback.
 */
export const resolveTemporalRuntimeCredentials = (
  input: Record<string, unknown> | undefined,
  sourcePayload: Record<string, unknown>,
  environment: RuntimeEnvironment = process.env
): TemporalRuntimeCredentialResolution => {
  const result = { ...(input || {}) };
  const paramsSchema = asRecord(sourcePayload.paramsSchema);
  const properties = asRecord(paramsSchema?.properties) || {};
  const requiredFields = Array.isArray(paramsSchema?.required)
    ? (paramsSchema?.required as string[])
    : [];
  const missing: Array<{ field: string; envKeys: string[] }> = [];

  for (const [field, rawDefinition] of Object.entries(properties)) {
    const definition = asRecord(rawDefinition) || {};
    const envKeys = resolveCredentialEnvKeys(field, definition);

    // 1. If explicit value is provided in input (non-empty string or defined value), keep it
    const suppliedValue = result[field];
    if (
      suppliedValue !== undefined &&
      suppliedValue !== null &&
      suppliedValue !== '' &&
      !(SENSITIVE_RUNTIME_FIELD.test(field) && isPlaceholderCredential(suppliedValue))
    ) {
      continue;
    }
    if (isPlaceholderCredential(suppliedValue)) {
      delete result[field];
    }

    // 2. If workflow snapshot definition provides a default value, use it directly (workflow-scoped)
    if (
      !SENSITIVE_RUNTIME_FIELD.test(field) &&
      definition.default !== undefined &&
      definition.default !== null &&
      definition.default !== ''
    ) {
      result[field] = definition.default;
      continue;
    }

    // 3. Fallback to runtime environment variable if configured
    const configured = envKeys
      .map((envKey) => environment[envKey]?.trim())
      .find((value): value is string => Boolean(value));

    if (configured) {
      result[field] = configured;
      continue;
    }

    // 4. If required and no value was found across input, default, or environment
    if (
      (SENSITIVE_RUNTIME_FIELD.test(field) || envKeys.length > 0) &&
      requiredFields.includes(field)
    ) {
      missing.push({ field, envKeys });
    }
  }

  return { input: result, missing };
};
