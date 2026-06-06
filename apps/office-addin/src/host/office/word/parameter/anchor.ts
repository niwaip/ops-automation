import { normalizeWordLookupText, safeWordRuleText } from '../shared/text';
import { HEADER_FIELD_SPECS, HeaderFieldSpec } from './profiles';

export function normalizeAnchorCore(value: string): string {
  return normalizeWordLookupText(String(value || '').replace(/[：:]$/u, ''))
    .replace(/[，。、．,.・]/g, '');
}

export function extractWordAnchorLabelText(anchorText: string): string {
  const normalized = safeWordRuleText(anchorText);
  if (!normalized) {
    return '';
  }

  const prefixMatch = normalized.match(/^([^：:]{1,40})[：:]/u);
  if (prefixMatch?.[1]) {
    return prefixMatch[1].trim();
  }

  return normalized.replace(/[：:]$/u, '').trim();
}

export function resolveHeaderFieldSpec(anchorText: string): HeaderFieldSpec | null {
  const normalizedAnchor = normalizeAnchorCore(extractWordAnchorLabelText(anchorText));
  if (!normalizedAnchor) {
    return null;
  }

  return HEADER_FIELD_SPECS.find((spec) =>
    spec.aliases.some((alias) => normalizedAnchor.includes(normalizeWordLookupText(alias)))
  ) || null;
}

export function resolveExactHeaderFieldSpec(anchorText: string): HeaderFieldSpec | null {
  const normalizedAnchor = normalizeAnchorCore(extractWordAnchorLabelText(anchorText));
  if (!normalizedAnchor) {
    return null;
  }

  return HEADER_FIELD_SPECS.find((spec) =>
    spec.aliases.some((alias) => normalizedAnchor === normalizeWordLookupText(alias))
  ) || null;
}

export function isExplicitWordParamLabelAnchor(anchorText: string): boolean {
  const normalizedAnchor = safeWordRuleText(anchorText);
  if (!normalizedAnchor) {
    return false;
  }
  if (/[：:]$/u.test(normalizedAnchor)) {
    return true;
  }
  if (resolveExactHeaderFieldSpec(normalizedAnchor)) {
    return true;
  }

  const displayAnchor = normalizedAnchor.replace(/[：:]$/u, '').trim();
  if (!displayAnchor || displayAnchor.length > 24) {
    return false;
  }
  if (/(?:\.{3,}|…+)/u.test(displayAnchor)) {
    return false;
  }
  if (/[，。；;、]/u.test(displayAnchor)) {
    return false;
  }

  return Boolean(resolveHeaderFieldSpec(displayAnchor));
}

function resolveWordAnchorAliasSpec(anchorText: string): HeaderFieldSpec | null {
  if (!isExplicitWordParamLabelAnchor(anchorText)) {
    return null;
  }
  return resolveHeaderFieldSpec(anchorText);
}

export function resolveWordHeaderFieldKey(anchorText: string): string | undefined {
  if (!isExplicitWordParamLabelAnchor(anchorText)) {
    return undefined;
  }
  return resolveHeaderFieldSpec(anchorText)?.key;
}

export function getWordHeaderAliasCandidates(anchorText: string): string[] {
  const normalizedAnchor = safeWordRuleText(anchorText);
  if (!normalizedAnchor) {
    return [];
  }

  const trailingSeparatorMatch = normalizedAnchor.match(/[：:]$/u);
  const trailingSeparator = trailingSeparatorMatch?.[0] || '';
  const anchorCore = normalizedAnchor.replace(/[：:]$/u, '').trim();
  const spec = resolveHeaderFieldSpec(anchorCore || normalizedAnchor);
  const aliases = spec?.aliases || [];

  return Array.from(new Set(
    [anchorCore, ...aliases]
      .map((alias) => safeWordRuleText(alias))
      .filter(Boolean)
      .map((alias) => (trailingSeparator ? `${alias}${trailingSeparator}` : alias))
  ));
}

export function buildWordAnchorCandidates(anchorText: string): string[] {
  const directAnchor = safeWordRuleText(anchorText).replace(/[：:]$/u, '');
  const spec = resolveWordAnchorAliasSpec(anchorText);
  const aliases = spec?.aliases || [];
  return Array.from(new Set([directAnchor, ...aliases].map((item) => safeWordRuleText(item)).filter(Boolean)));
}

export function extractWordParamName(anchorText: string): string {
  const normalizedAnchor = safeWordRuleText(anchorText);
  const colonMatch = normalizedAnchor.match(/([^：:]{1,40})[：:]$/u);
  if (colonMatch?.[1]) {
    return colonMatch[1].trim();
  }
  return normalizedAnchor || '未命名参数';
}

export function extractWordParamAnchorText(paragraphText: string, start: number, end: number): string {
  const prefix = safeWordRuleText(paragraphText.slice(Math.max(0, start - 32), start));
  const suffix = safeWordRuleText(paragraphText.slice(end, Math.min(paragraphText.length, end + 24)));
  const normalizedPrefix = safeWordRuleText(paragraphText.slice(0, start));
  const labelMatch = normalizedPrefix.match(/([^，。；;、\n]{1,40}[：:])\s*$/u);

  if (labelMatch?.[1]) {
    return labelMatch[1];
  }
  if (prefix && suffix) {
    return `${prefix} ... ${suffix}`.slice(0, 48);
  }
  if (prefix) {
    return prefix.slice(-24);
  }
  if (suffix) {
    return suffix.slice(0, 24);
  }
  return '未命名参数';
}
