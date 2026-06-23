import type { RuntimeSemanticRule } from '../../../../client/browser-semantics.client';
import {
  DEFAULT_NAVIGATION_INTENT_TERMS,
  NAVIGATION_PROFILE_MAX_TERM_COUNT,
  NAVIGATION_PROFILE_MAX_TERM_LENGTH,
  NAVIGATION_PROFILE_TYPE,
} from './browser-command-navigation.constants';
import type { NavigationProfile, NavigationProfileEntry } from './browser-command-navigation.types';

function normalizeProfileTerm(term: string): string {
  return term.replace(/\s+/g, ' ').trim();
}

function normalizeProfileTerms(value: unknown, maxCount = NAVIGATION_PROFILE_MAX_TERM_COUNT): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => normalizeProfileTerm(item))
        .filter((item) => item.length > 0 && item.length <= NAVIGATION_PROFILE_MAX_TERM_LENGTH)
    )
  ).slice(0, maxCount);
}

function normalizeDestination(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toNavigationProfileEntry(rule: RuntimeSemanticRule): NavigationProfileEntry | null {
  const outputs = rule.outputs || {};
  if (outputs.profile_type !== NAVIGATION_PROFILE_TYPE) {
    return null;
  }

  const targetTerms = normalizeProfileTerms(outputs.target_terms);
  if (targetTerms.length === 0) {
    return null;
  }

  const destinationUrl = normalizeDestination(outputs.destination_url);
  const destinationPath = normalizeDestination(outputs.destination_path);
  if (!destinationUrl && !destinationPath) {
    return null;
  }

  return {
    ruleId: typeof rule.id === 'string' && rule.id.trim() ? rule.id : undefined,
    targetTerms,
    destinationUrl,
    destinationPath,
    intentTerms: normalizeProfileTerms(outputs.intent_terms),
    localeHints: normalizeProfileTerms(outputs.locale_hints),
  };
}

export function buildNavigationProfile(runtimeRules: RuntimeSemanticRule[]): NavigationProfile {
  const entries = runtimeRules
    .filter((rule) => rule.category === 'NAVIGATION')
    .map((rule) => toNavigationProfileEntry(rule))
    .filter((entry): entry is NavigationProfileEntry => Boolean(entry));

  const intentTerms = Array.from(
    new Set([
      ...DEFAULT_NAVIGATION_INTENT_TERMS,
      ...entries.flatMap((entry) => entry.intentTerms),
    ])
  );

  return {
    intentTerms,
    entries,
  };
}

export function canonicalizeNavigationText(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/[，。！？、:：()（）[\]【】]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return '';
  }

  const simplified = normalized
    .replace(/^(?:去|到|前往|访问|打开|进入|open|navigate|go to|visit)\s*/i, '')
    .replace(/(?:页面|页|界面|入口|模块|菜单|站点|网站|web|page|screen|portal)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  return simplified || normalized;
}
