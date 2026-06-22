import type { RuntimeSemanticRule } from '../../../client/browser-semantics.client';
import {
  DEFAULT_READ_INTENT_TERMS,
  READ_PROFILE_MAX_TERM_COUNT,
  READ_PROFILE_MAX_TERM_LENGTH,
  READ_PROFILE_TYPE,
} from './browser-command-read.constants';
import type { ReadProfile, ReadProfileEntry } from './browser-command-read.types';

function normalizeProfileTerm(term: string): string {
  return term.replace(/\s+/g, ' ').trim();
}

function normalizeProfileTerms(value: unknown, maxCount = READ_PROFILE_MAX_TERM_COUNT): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => normalizeProfileTerm(item))
        .filter((item) => item.length > 0 && item.length <= READ_PROFILE_MAX_TERM_LENGTH)
    )
  ).slice(0, maxCount);
}

function toReadProfileEntry(rule: RuntimeSemanticRule): ReadProfileEntry | null {
  const outputs = rule.outputs || {};
  if (outputs.profile_type !== READ_PROFILE_TYPE) {
    return null;
  }

  const targetTerms = normalizeProfileTerms(outputs.target_terms);
  const fieldTerms = normalizeProfileTerms(outputs.field_terms);
  const regionTerms = normalizeProfileTerms(outputs.region_terms);
  if (targetTerms.length === 0 || (fieldTerms.length === 0 && regionTerms.length === 0)) {
    return null;
  }

  return {
    ruleId: typeof rule.id === 'string' && rule.id.trim() ? rule.id : undefined,
    targetTerms,
    fieldTerms,
    regionTerms,
    intentTerms: normalizeProfileTerms(outputs.intent_terms),
    localeHints: normalizeProfileTerms(outputs.locale_hints),
  };
}

export function buildReadProfile(runtimeRules: RuntimeSemanticRule[]): ReadProfile {
  const entries = runtimeRules
    .filter((rule) => rule.category === 'READ_VALUE')
    .map((rule) => toReadProfileEntry(rule))
    .filter((entry): entry is ReadProfileEntry => Boolean(entry));

  const intentTerms = Array.from(
    new Set([
      ...DEFAULT_READ_INTENT_TERMS,
      ...entries.flatMap((entry) => entry.intentTerms),
    ])
  );

  return {
    intentTerms,
    entries,
  };
}

export function canonicalizeReadText(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/[，。！？、:：()（）[\]【】]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return '';
  }

  return normalized
    .replace(/^(?:读取|获取|查看|提取|read|get|extract)\s*/i, '')
    .replace(
      /^(?:(?:当前的|当前页的|当前页|当前案件的|当前案件|页面上的|页面中|页面里|页面|区域里的|区域中)\s*)+/i,
      ''
    )
    .replace(
      /(?:当前的|当前页的|当前页|当前案件的|当前案件|页面上的|页面中|页面里|页面|区域里的|区域中|值|字段)$/gi,
      ''
    )
    .replace(/^的+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
