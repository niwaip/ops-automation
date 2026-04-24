import { randomUUID } from 'crypto';

export const TRACE_ID_HEADER = 'x-trace-id';

export function getOrCreateTraceId(value?: string): string {
  if (value && value.trim()) {
    return value.trim();
  }
  return randomUUID();
}
