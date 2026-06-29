function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeBindingPath(path: string): string {
  let normalized = String(path || '').trim();
  if (normalized.startsWith('{d.') && normalized.endsWith('}')) {
    normalized = normalized.slice(3, -1).trim();
  }
  if (normalized.startsWith('d.')) {
    normalized = normalized.slice(2).trim();
  }
  if (normalized.startsWith('data.')) {
    normalized = normalized.slice(5).trim();
  }
  return normalized;
}

function resolveBindingPaths(fieldName: string, rawConfig: unknown): string[] {
  if (!isRecord(rawConfig)) {
    return [];
  }

  const renderPath = rawConfig.renderPath;
  const templateBinding = rawConfig.templateBinding;
  const rawPaths =
    typeof templateBinding === 'string' && templateBinding.trim()
      ? [templateBinding.trim()]
      : typeof renderPath === 'string' && renderPath.trim()
        ? [renderPath.trim()]
        : Array.isArray(renderPath)
          ? renderPath
              .filter((item): item is string => typeof item === 'string')
              .map((item) => item.trim())
              .filter((item) => item.length > 0)
          : [];

  const normalized = Array.from(
    new Set(rawPaths.map((path) => normalizeBindingPath(path)).filter((path) => path.length > 0))
  );

  return normalized.length > 0 ? normalized : [fieldName];
}

function extractBindingLocale(path: string): 'cn' | 'jp' | undefined {
  const normalizedPath = String(path || '').trim();
  if (/_cn$/i.test(normalizedPath) || /_zh$/i.test(normalizedPath)) {
    return 'cn';
  }
  if (/_jp$/i.test(normalizedPath) || /_ja$/i.test(normalizedPath)) {
    return 'jp';
  }
  return undefined;
}

function resolveLocalizedBindingValue(path: string, value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const locale = extractBindingLocale(path);
  if (!locale) {
    if (value.value !== undefined) {
      return value.value;
    }
    return value;
  }

  const localeCandidates = locale === 'cn' ? ['cn', 'zh'] : ['jp', 'ja'];

  for (const candidate of localeCandidates) {
    if (value[candidate] !== undefined && value[candidate] !== null) {
      return value[candidate];
    }
  }

  if (value.value !== undefined && value.value !== null) {
    return value.value;
  }
  if (value.source !== undefined && value.source !== null) {
    return value.source;
  }

  return undefined;
}

function resolveBindingValue(path: string, value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => resolveLocalizedBindingValue(path, item))
      .filter((item) => item !== undefined && item !== null);
  }
  return resolveLocalizedBindingValue(path, value);
}

function setNestedValue(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = String(path || '')
    .split('.')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return;
  }

  let current: Record<string, unknown> = target;
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    if (!isRecord(existing)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }

  current[segments[segments.length - 1]] = value;
}

function ensureArrayPath(
  target: Record<string, unknown>,
  path: string
): Array<Record<string, unknown>> {
  const segments = String(path || '')
    .split('.')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return [];
  }

  let current: Record<string, unknown> = target;
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    if (!isRecord(existing)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }

  const leafKey = segments[segments.length - 1];
  const existingLeaf = current[leafKey];
  if (!Array.isArray(existingLeaf)) {
    current[leafKey] = [];
  }
  return current[leafKey] as Array<Record<string, unknown>>;
}

function setBoundValue(target: Record<string, unknown>, path: string, value: unknown): void {
  const resolvedValue = resolveBindingValue(path, value);
  if (resolvedValue === undefined || resolvedValue === null) {
    return;
  }

  const arrayPathMatch = path.match(/^(.*)\[\]\.(.+)$/);
  if (arrayPathMatch) {
    const [, rawArrayPath, rawItemPath] = arrayPathMatch;
    const arrayPath = rawArrayPath.trim();
    const itemPath = rawItemPath.trim();
    if (!arrayPath || !itemPath) {
      return;
    }

    const rows = Array.isArray(resolvedValue) ? resolvedValue : [resolvedValue];
    const list = ensureArrayPath(target, arrayPath);
    rows.forEach((itemValue, index) => {
      const existing = list[index];
      if (!isRecord(existing)) {
        list[index] = {};
      }
      setNestedValue(list[index] as Record<string, unknown>, itemPath, itemValue);
    });
    return;
  }

  setNestedValue(target, path, resolvedValue);
}

export function applyDirectRenderPaths(
  inputData: Record<string, unknown>,
  workflowInputParams?: Record<string, unknown>
): Record<string, unknown> {
  if (!workflowInputParams || !isRecord(workflowInputParams)) {
    return { ...(inputData || {}) };
  }

  const result: Record<string, unknown> = {};
  const mappedFieldNames = new Set<string>();

  for (const [fieldName, rawConfig] of Object.entries(workflowInputParams)) {
    if (!Object.prototype.hasOwnProperty.call(inputData, fieldName)) {
      continue;
    }
    const bindingPaths = resolveBindingPaths(fieldName, rawConfig);
    if (bindingPaths.length === 0) {
      continue;
    }
    mappedFieldNames.add(fieldName);
    bindingPaths.forEach((bindingPath) => {
      setBoundValue(result, bindingPath, inputData[fieldName]);
    });
  }

  for (const [key, value] of Object.entries(inputData || {})) {
    if (mappedFieldNames.has(key)) {
      continue;
    }
    result[key] = value;
  }

  return result;
}
