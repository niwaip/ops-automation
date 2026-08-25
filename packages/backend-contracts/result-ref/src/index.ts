export interface ResultRefV1 {
  schemaVersion: 'result-ref/v1';
  id: string;
  executionId: string;
  producerStepId?: string;
  schemaDigest: string;
  sizeBytes: number;
  preview?: unknown;
}

const SAFE_SEGMENT = /^[a-zA-Z0-9_-]+$/u;
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

export function projectResultFields(
  payload: unknown,
  paths: string[],
  maxPaths = 32
): Record<string, unknown> {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('At least one result projection path is required');
  }
  if (paths.length > maxPaths) throw new Error(`Result projection exceeds ${maxPaths} paths`);
  const output: Record<string, unknown> = {};
  for (const path of paths) {
    const segments = path.split('.');
    if (
      !segments.every((segment) => SAFE_SEGMENT.test(segment) && !FORBIDDEN_SEGMENTS.has(segment))
    ) {
      throw new Error(`Unsafe result projection path: ${path}`);
    }
    let current: unknown = payload;
    for (const segment of segments) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    output[path] = current;
  }
  return output;
}

export function isResultRefV1(value: unknown): value is ResultRefV1 {
  const record = value as Partial<ResultRefV1> | null;
  return Boolean(
    record &&
    record.schemaVersion === 'result-ref/v1' &&
    typeof record.id === 'string' &&
    typeof record.executionId === 'string' &&
    typeof record.schemaDigest === 'string' &&
    typeof record.sizeBytes === 'number'
  );
}
