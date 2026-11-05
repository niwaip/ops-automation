// A remote service can echo credentials in plain text or in a percent-encoded URL.
// Walk decoded fields, including object keys, before persistence or disclosure.
export function redactTransportSecret(value: any, token: string): any {
  if (!token) return value;
  const encoded = [encodeURIComponent(token), new URLSearchParams({ key: token }).toString().slice(4)];
  const patterns = [...new Set(encoded)].filter(part => part !== token).map(part => {
    const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped.replace(/%[0-9A-F]{2}/g, code => code.replace(/[A-F]/g, c => `[${c}${c.toLowerCase()}]`)), 'g');
  });
  const clean = (text: string) => {
    let result = text;
    for (const pattern of patterns) result = result.replace(pattern, '[REDACTED]');
    return result.split(token).join('[REDACTED]');
  };
  const walk = (item: any): any => {
    if (typeof item === 'string') return clean(item);
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, field]) => [clean(key), walk(field)]));
    return item;
  };
  return walk(value);
}
