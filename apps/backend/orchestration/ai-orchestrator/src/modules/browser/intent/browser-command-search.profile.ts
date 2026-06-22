import type { RuntimeSemanticRule } from '../../../client/browser-semantics.client';
import {
  DEFAULT_CLICK_RESULT_TERMS,
  DEFAULT_LIST_RESULT_TERMS,
  DEFAULT_SEARCH_TERMS,
  DEFAULT_SMART_SEARCH_TERMS,
  SEARCH_PROFILE_MAX_TERM_COUNT,
  SEARCH_PROFILE_MAX_TERM_LENGTH,
  SEARCH_PROFILE_TYPE,
} from './browser-command-search.constants';
import type { SearchProfile, SearchProfileTermEntry } from './browser-command-search.types';

function normalizeProfileTerm(term: string): string {
  return term.replace(/\s+/g, ' ').trim();
}

function normalizeProfileTerms(value: unknown, maxCount = SEARCH_PROFILE_MAX_TERM_COUNT): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => normalizeProfileTerm(item))
        .filter((item) => item.length > 0 && item.length <= SEARCH_PROFILE_MAX_TERM_LENGTH)
    )
  ).slice(0, maxCount);
}

function toTermEntries(terms: string[], ruleId?: string): SearchProfileTermEntry[] {
  return terms.map((term) => ({ term, ruleId }));
}

function toRuntimeTermEntries(rule: RuntimeSemanticRule, key: string): SearchProfileTermEntry[] {
  return toTermEntries(
    normalizeProfileTerms(rule.outputs?.[key]),
    typeof rule.id === 'string' && rule.id.trim() ? rule.id : undefined
  );
}

export function buildSearchProfile(runtimeRules: RuntimeSemanticRule[]): SearchProfile {
  const searchRules = runtimeRules.filter(
    (rule) => rule.category === 'SEARCH' && rule.outputs?.profile_type === SEARCH_PROFILE_TYPE
  );

  return {
    searchTerms: [
      ...toTermEntries([...DEFAULT_SEARCH_TERMS]),
      ...searchRules.flatMap((rule) => toRuntimeTermEntries(rule, 'search_terms')),
    ],
    smartSearchTerms: [
      ...toTermEntries([...DEFAULT_SMART_SEARCH_TERMS]),
      ...searchRules.flatMap((rule) => toRuntimeTermEntries(rule, 'smart_search_terms')),
    ],
    listResultTerms: [
      ...toTermEntries([...DEFAULT_LIST_RESULT_TERMS]),
      ...searchRules.flatMap((rule) => toRuntimeTermEntries(rule, 'list_result_terms')),
    ],
    clickResultTerms: [
      ...toTermEntries([...DEFAULT_CLICK_RESULT_TERMS]),
      ...searchRules.flatMap((rule) => toRuntimeTermEntries(rule, 'click_result_terms')),
    ],
    localeHints: Array.from(
      new Set(searchRules.flatMap((rule) => normalizeProfileTerms(rule.outputs?.locale_hints)))
    ),
  };
}

export function canonicalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/[，。！？、:：()（）[\]【】]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
