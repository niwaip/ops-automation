import * as crypto from 'crypto';

export function computePdfRequestDigest(parts: Array<string | Uint8Array>): string {
  const hash = crypto.createHash('sha256');
  for (const part of parts) {
    if (typeof part === 'string') {
      hash.update(Buffer.from(part, 'utf8'));
    } else {
      hash.update(part);
    }
    hash.update(Buffer.from([0]));
  }
  return `sha256:${hash.digest('hex')}`;
}

export function stablePdfRequestJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stablePdfRequestJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stablePdfRequestJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
