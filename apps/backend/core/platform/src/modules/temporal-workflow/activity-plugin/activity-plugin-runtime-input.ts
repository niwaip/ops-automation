const TEMPLATE_PATTERN = /\{([^{}]+)\}/g;

function sanitizeTemplateString(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/^`+/, '')
    .replace(/`+$/, '')
    .replace(/`/g, '')
    .trim();
}

function sanitizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      sanitizeTemplateString(key),
      typeof item === 'string' ? sanitizeTemplateString(item) : item,
    ])
  );
}

function render(value: unknown, params: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const exact = value.match(/^\{([^{}]+)\}$/);
    if (exact) {
      const resolved = params[String(exact[1] || '').trim()];
      return resolved === undefined || resolved === null ? '' : resolved;
    }
    return value.replace(TEMPLATE_PATTERN, (_match, key) => {
      const resolved = params[String(key).trim()];
      return resolved === undefined || resolved === null ? '' : String(resolved);
    });
  }
  if (Array.isArray(value)) return value.map((item) => render(item, params));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, render(item, params)])
    );
  }
  return value;
}

function prune(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(prune).filter((item) => item !== undefined && item !== null && item !== '');
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (result, [key, item]) => {
        const next = prune(item);
        if (next === undefined || next === null || next === '') return result;
        if (Array.isArray(next) && next.length === 0) return result;
        if (typeof next === 'object' && !Array.isArray(next) && Object.keys(next).length === 0) {
          return result;
        }
        result[key] = next;
        return result;
      },
      {}
    );
  }
  return value;
}

export function normalizeHttpPluginConfig(config: Record<string, unknown>): Record<string, unknown> {
  const timeout = Number(config.timeout ?? 30);
  return {
    method: String(config.method || 'GET').toUpperCase(),
    urlTemplate: sanitizeTemplateString(config.urlTemplate),
    queryTemplate: sanitizeRecord(config.queryTemplate),
    headersTemplate: sanitizeRecord(config.headersTemplate),
    jsonTemplate: sanitizeRecord(config.jsonTemplate),
    dataTemplate:
      config.dataTemplate && typeof config.dataTemplate === 'object'
        ? sanitizeRecord(config.dataTemplate)
        : config.dataTemplate,
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 30,
    responseMode: String(config.responseMode || 'body'),
    responseBodyPath: String(config.responseBodyPath || ''),
    responseFieldMappings: sanitizeRecord(config.responseFieldMappings),
  };
}

export function buildHttpPluginRuntimeInput(
  config: Record<string, unknown>,
  params: Record<string, unknown>
): Record<string, unknown> {
  const normalized = normalizeHttpPluginConfig(config);
  const renderedHeaders = prune(render(normalized.headersTemplate, params));
  const headers =
    renderedHeaders && typeof renderedHeaders === 'object' && !Array.isArray(renderedHeaders)
      ? { ...(renderedHeaders as Record<string, unknown>) }
      : {};
  if (!Object.keys(headers).some((key) => key.toLowerCase() === 'user-agent')) {
    headers['User-Agent'] = 'ops-automation-httpRequest-probe/1.0';
  }
  if (!Object.keys(headers).some((key) => key.toLowerCase() === 'accept')) {
    headers.Accept = 'application/json, text/plain, */*';
  }

  const runtimeInput: Record<string, unknown> = {
    method: normalized.method,
    url: String(render(normalized.urlTemplate, params) || '').trim(),
    headers,
    params: prune(render(normalized.queryTemplate, params)) || {},
    timeout: normalized.timeout,
  };
  const json = prune(render(normalized.jsonTemplate, params));
  const data = prune(render(normalized.dataTemplate, params));
  if (json && typeof json === 'object' && Object.keys(json).length > 0) runtimeInput.json = json;
  if (data !== undefined && data !== null && data !== '') runtimeInput.data = data;
  return runtimeInput;
}

export function buildStructuredTransformRuntimeInput(
  config: Record<string, unknown>,
  sampleInput: unknown,
  params: Record<string, unknown>
): Record<string, unknown> {
  const contentTemplate = String(config.contentTemplate || '{content}').trim() || '{content}';
  const values = { ...params, content: sampleInput };
  return {
    content: render(contentTemplate, values),
    contentType: String(config.contentType || 'text').toLowerCase(),
    instruction: render(String(config.instructionTemplate || ''), values),
    outputMode: String(config.outputMode || 'json').toLowerCase(),
    outputSchema:
      config.outputSchema && typeof config.outputSchema === 'object' ? config.outputSchema : {},
    context: render(String(config.contextTemplate || ''), values),
    fieldMappings:
      config.fieldMappings && typeof config.fieldMappings === 'object' ? config.fieldMappings : {},
    textTemplate: String(config.textTemplate || ''),
  };
}

export function extractPluginPath(value: unknown, path: string): unknown {
  const segments = String(path || '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
  let current = value;
  for (const segment of segments) {
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      current = current[Number(segment)];
    } else if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}
