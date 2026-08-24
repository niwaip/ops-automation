import {
  LOGIN_PROFILE_ARRAY_OUTPUT_KEYS,
  MAX_PROFILE_TERM_COUNT,
  MAX_PROFILE_TERM_LENGTH,
} from './browser-command-login.constants';
import type { LoginProfile } from './browser-command-login.types';

type LoginProfileArrayOutputKey = (typeof LOGIN_PROFILE_ARRAY_OUTPUT_KEYS)[number];

type LoginProfileArrayField = keyof Pick<
  LoginProfile,
  | 'credentialIntentTerms'
  | 'submitIntentTerms'
  | 'usernameTerms'
  | 'passwordTerms'
  | 'otpTerms'
  | 'submitLabels'
  | 'trailingActionTerms'
  | 'loginSuccessHints'
  | 'takeoverSignals'
  | 'unsupportedAuthSignals'
  | 'localeHints'
>;

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeProfileTerm(term: unknown): string | null {
  if (typeof term !== 'string') {
    return null;
  }

  const normalized = normalizeWhitespace(term);
  if (!normalized || normalized.length > MAX_PROFILE_TERM_LENGTH) {
    return null;
  }

  // eslint-disable-next-line no-control-regex -- reject ASCII control characters by design
  if (/[\u0000-\u001f\u007f]/.test(normalized)) {
    return null;
  }

  return normalized;
}

export function normalizeProfileTerms(terms: string[]): string[] {
  return [...new Set(terms.map(normalizeProfileTerm).filter((term): term is string => Boolean(term)))]
    .sort((left, right) => right.length - left.length)
    .slice(0, MAX_PROFILE_TERM_COUNT);
}

export function mergeStringArrays(base: string[], next: string[]): string[] {
  if (next.length === 0) {
    return base;
  }

  return normalizeProfileTerms([...base, ...next]);
}

export function mapProfileOutputKey(key: LoginProfileArrayOutputKey): LoginProfileArrayField {
  const mappings = {
    credential_intent_terms: 'credentialIntentTerms',
    submit_intent_terms: 'submitIntentTerms',
    username_terms: 'usernameTerms',
    password_terms: 'passwordTerms',
    otp_terms: 'otpTerms',
    submit_labels: 'submitLabels',
    trailing_action_terms: 'trailingActionTerms',
    login_success_hints: 'loginSuccessHints',
    takeover_signals: 'takeoverSignals',
    unsupported_auth_signals: 'unsupportedAuthSignals',
    locale_hints: 'localeHints',
  } as const;

  return mappings[key];
}

export function mergeLoginProfiles(
  base: LoginProfile,
  overrides: Partial<LoginProfile>
): LoginProfile {
  return {
    credentialIntentTerms: mergeStringArrays(
      base.credentialIntentTerms,
      overrides.credentialIntentTerms || []
    ),
    submitIntentTerms: mergeStringArrays(base.submitIntentTerms, overrides.submitIntentTerms || []),
    usernameTerms: mergeStringArrays(base.usernameTerms, overrides.usernameTerms || []),
    passwordTerms: mergeStringArrays(base.passwordTerms, overrides.passwordTerms || []),
    otpTerms: mergeStringArrays(base.otpTerms, overrides.otpTerms || []),
    submitLabels: mergeStringArrays(base.submitLabels, overrides.submitLabels || []),
    trailingActionTerms: mergeStringArrays(
      base.trailingActionTerms,
      overrides.trailingActionTerms || []
    ),
    loginSuccessHints: mergeStringArrays(
      base.loginSuccessHints,
      overrides.loginSuccessHints || []
    ),
    takeoverSignals: mergeStringArrays(base.takeoverSignals, overrides.takeoverSignals || []),
    unsupportedAuthSignals: mergeStringArrays(
      base.unsupportedAuthSignals,
      overrides.unsupportedAuthSignals || []
    ),
    interruptPolicy: overrides.interruptPolicy || base.interruptPolicy,
    localeHints: mergeStringArrays(base.localeHints, overrides.localeHints || []),
  };
}
