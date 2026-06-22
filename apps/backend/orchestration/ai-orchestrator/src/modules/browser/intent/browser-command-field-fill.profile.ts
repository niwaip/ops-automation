import type { RuntimeSemanticRule } from '../../../client/browser-semantics.client';
import {
  DEFAULT_FIELD_FILL_INTENT_TERMS,
  FIELD_FILL_PROFILE_MAX_TERM_COUNT,
  FIELD_FILL_PROFILE_MAX_TERM_LENGTH,
  FIELD_FILL_PROFILE_TYPE,
} from './browser-command-field-fill.constants';
import type {
  FieldFillProfile,
  FieldFillProfileEntry,
} from './browser-command-field-fill.types';

function normalizeProfileTerm(term: string): string {
  return term.replace(/\s+/g, ' ').trim();
}

function normalizeProfileTerms(
  value: unknown,
  maxCount = FIELD_FILL_PROFILE_MAX_TERM_COUNT
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => normalizeProfileTerm(item))
        .filter((item) => item.length > 0 && item.length <= FIELD_FILL_PROFILE_MAX_TERM_LENGTH)
    )
  ).slice(0, maxCount);
}

function toFieldFillProfileEntry(rule: RuntimeSemanticRule): FieldFillProfileEntry | null {
  const outputs = rule.outputs || {};
  if (outputs.profile_type !== FIELD_FILL_PROFILE_TYPE) {
    return null;
  }

  const fieldTerms = normalizeProfileTerms(outputs.field_terms);
  if (fieldTerms.length === 0) {
    return null;
  }

  const canonicalField =
    typeof outputs.canonical_field === 'string' && outputs.canonical_field.trim()
      ? outputs.canonical_field.trim()
      : undefined;

  return {
    ruleId: typeof rule.id === 'string' && rule.id.trim() ? rule.id : undefined,
    fieldTerms,
    canonicalField,
    regionTerms: normalizeProfileTerms(outputs.region_terms),
    valueHints: normalizeProfileTerms(outputs.value_hints),
    intentTerms: normalizeProfileTerms(outputs.intent_terms),
    localeHints: normalizeProfileTerms(outputs.locale_hints),
  };
}

export function buildFieldFillProfile(runtimeRules: RuntimeSemanticRule[]): FieldFillProfile {
  const entries = runtimeRules
    .filter((rule) => rule.category === 'FIELD_FILL')
    .map((rule) => toFieldFillProfileEntry(rule))
    .filter((entry): entry is FieldFillProfileEntry => Boolean(entry));

  const intentTerms = Array.from(
    new Set([
      ...DEFAULT_FIELD_FILL_INTENT_TERMS,
      ...entries.flatMap((entry) => entry.intentTerms),
    ])
  );

  return {
    intentTerms,
    entries,
  };
}

export function canonicalizeFieldFillText(value: string): string {
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
    .replace(/^(?:填写|输入|写入|设置|set)\s*/i, '')
    .replace(/^(?:把|将)\s*/i, '')
    .replace(/(?:输入框|文本框|字段|栏位|内容|值)$/gi, '')
    .replace(/[的"'\s:=|]/g, '')
    .trim();
}
