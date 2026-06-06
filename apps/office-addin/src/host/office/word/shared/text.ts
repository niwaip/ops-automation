export function safeWordRuleText(value: unknown): string {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeWordLookupText(value: string): string {
  return safeWordRuleText(value)
    .toLowerCase()
    .replace(/[（）()【】\[\]]/g, '')
    .replace(/\s+/g, '');
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function truncateWordRuleText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
