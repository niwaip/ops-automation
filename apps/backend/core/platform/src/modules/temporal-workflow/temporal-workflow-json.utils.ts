export function parseJsonFromAiContent(content: string): Record<string, any> {
  const sanitized = (content || '').replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(sanitized);
    return recursiveSanitizeTemplates(parsed);
  } catch {
    const start = sanitized.indexOf('{');
    const end = sanitized.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(sanitized.slice(start, end + 1));
      return recursiveSanitizeTemplates(parsed);
    }
    throw new Error('AI 返回内容不是有效 JSON');
  }
}

export function parseJson<T = unknown>(value: unknown): T {
  if (value === null || value === undefined) {
    return value as T;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }
  return value as T;
}

export function pickFirstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

export function pickFirstPositiveNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}

function recursiveSanitizeTemplates(value: any): any {
  if (typeof value === 'string') {
    return value.replace(/`/g, '').trim();
  }
  if (Array.isArray(value)) {
    return value.map((item) => recursiveSanitizeTemplates(item));
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = recursiveSanitizeTemplates(val);
    }
    return result;
  }
  return value;
}
