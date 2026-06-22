import {
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import type { SemanticRuleCategory } from '../../types/semantic-rule.types';

const LOGIN_PROFILE_TYPE = 'login_terms';
const NAVIGATION_PROFILE_TYPE = 'navigation_target';
const READ_PROFILE_TYPE = 'read_target';
const ACTION_PROFILE_TYPE = 'action_target';
const SEARCH_PROFILE_TYPE = 'search_intent';
const FIELD_FILL_PROFILE_TYPE = 'field_fill_terms';
const LOGIN_PROFILE_MARKER_KEYS = [
  'profile_type',
  'credential_intent_terms',
  'submit_intent_terms',
  'username_terms',
  'password_terms',
  'otp_terms',
  'submit_labels',
  'trailing_action_terms',
  'login_success_hints',
  'takeover_signals',
  'unsupported_auth_signals',
  'interrupt_policy',
  'locale_hints',
] as const;
const NAVIGATION_PROFILE_MARKER_KEYS = [
  'profile_type',
  'target_terms',
  'destination_url',
  'destination_path',
  'intent_terms',
  'locale_hints',
] as const;
const READ_PROFILE_MARKER_KEYS = [
  'profile_type',
  'target_terms',
  'field_terms',
  'region_terms',
  'intent_terms',
  'locale_hints',
] as const;
const ACTION_PROFILE_MARKER_KEYS = [
  'profile_type',
  'target_terms',
  'semantic_hint',
  'action_terms',
  'region_terms',
  'role_hints',
  'category_hint',
  'intent_terms',
  'locale_hints',
] as const;
const SEARCH_PROFILE_MARKER_KEYS = [
  'profile_type',
  'search_terms',
  'smart_search_terms',
  'list_result_terms',
  'click_result_terms',
  'locale_hints',
] as const;
const FIELD_FILL_PROFILE_MARKER_KEYS = [
  'profile_type',
  'field_terms',
  'canonical_field',
  'region_terms',
  'value_hints',
  'intent_terms',
  'locale_hints',
] as const;
const LOGIN_PROFILE_ALLOWED_KEYS = new Set<string>([
  ...LOGIN_PROFILE_MARKER_KEYS,
  'semantic_key',
  'source_error_log_ids',
  'source_error_types',
  'source_sources',
  'sample_inputs',
  'suggested_hosts',
  'suggested_page_types',
  'generation_trace_id',
]);
const NAVIGATION_PROFILE_ALLOWED_KEYS = new Set<string>([
  ...NAVIGATION_PROFILE_MARKER_KEYS,
  'semantic_key',
  'source_error_log_ids',
  'source_error_types',
  'source_sources',
  'sample_inputs',
  'suggested_hosts',
  'suggested_page_types',
  'generation_trace_id',
]);
const READ_PROFILE_ALLOWED_KEYS = new Set<string>([
  ...READ_PROFILE_MARKER_KEYS,
  'semantic_key',
  'source_error_log_ids',
  'source_error_types',
  'source_sources',
  'sample_inputs',
  'suggested_hosts',
  'suggested_page_types',
  'generation_trace_id',
]);
const ACTION_PROFILE_ALLOWED_KEYS = new Set<string>([
  ...ACTION_PROFILE_MARKER_KEYS,
  'semantic_key',
  'source_error_log_ids',
  'source_error_types',
  'source_sources',
  'sample_inputs',
  'suggested_hosts',
  'suggested_page_types',
  'generation_trace_id',
]);
const SEARCH_PROFILE_ALLOWED_KEYS = new Set<string>([
  ...SEARCH_PROFILE_MARKER_KEYS,
  'semantic_key',
  'source_error_log_ids',
  'source_error_types',
  'source_sources',
  'sample_inputs',
  'suggested_hosts',
  'suggested_page_types',
  'generation_trace_id',
]);
const FIELD_FILL_PROFILE_ALLOWED_KEYS = new Set<string>([
  ...FIELD_FILL_PROFILE_MARKER_KEYS,
  'semantic_key',
  'source_error_log_ids',
  'source_error_types',
  'source_sources',
  'sample_inputs',
  'suggested_hosts',
  'suggested_page_types',
  'generation_trace_id',
]);
const LOGIN_PROFILE_STRING_ARRAY_KEYS = [
  'credential_intent_terms',
  'submit_intent_terms',
  'username_terms',
  'password_terms',
  'otp_terms',
  'submit_labels',
  'trailing_action_terms',
  'login_success_hints',
  'takeover_signals',
  'unsupported_auth_signals',
  'locale_hints',
] as const;
const NAVIGATION_PROFILE_STRING_ARRAY_KEYS = [
  'target_terms',
  'intent_terms',
  'locale_hints',
] as const;
const READ_PROFILE_STRING_ARRAY_KEYS = [
  'target_terms',
  'field_terms',
  'region_terms',
  'intent_terms',
  'locale_hints',
] as const;
const ACTION_PROFILE_STRING_ARRAY_KEYS = [
  'target_terms',
  'action_terms',
  'region_terms',
  'role_hints',
  'intent_terms',
  'locale_hints',
] as const;
const SEARCH_PROFILE_STRING_ARRAY_KEYS = [
  'search_terms',
  'smart_search_terms',
  'list_result_terms',
  'click_result_terms',
  'locale_hints',
] as const;
const FIELD_FILL_PROFILE_STRING_ARRAY_KEYS = [
  'field_terms',
  'region_terms',
  'value_hints',
  'intent_terms',
  'locale_hints',
] as const;
const LOGIN_INTERRUPT_POLICIES = ['fallback', 'takeover_required'] as const;
const LOGIN_PROFILE_MAX_TERM_LENGTH = 64;
const LOGIN_PROFILE_MAX_TERM_COUNT = 48;
const LOGIN_PROFILE_MAX_TOTAL_LENGTH = 1024;
const NAVIGATION_PROFILE_MAX_TERM_LENGTH = 96;
const NAVIGATION_PROFILE_MAX_TERM_COUNT = 24;
const NAVIGATION_PROFILE_MAX_TOTAL_LENGTH = 1024;
const READ_PROFILE_MAX_TERM_LENGTH = 96;
const READ_PROFILE_MAX_TERM_COUNT = 24;
const READ_PROFILE_MAX_TOTAL_LENGTH = 1024;
const ACTION_PROFILE_MAX_TERM_LENGTH = 96;
const ACTION_PROFILE_MAX_TERM_COUNT = 24;
const ACTION_PROFILE_MAX_TOTAL_LENGTH = 1024;
const SEARCH_PROFILE_MAX_TERM_LENGTH = 96;
const SEARCH_PROFILE_MAX_TERM_COUNT = 24;
const SEARCH_PROFILE_MAX_TOTAL_LENGTH = 1024;
const FIELD_FILL_PROFILE_MAX_TERM_LENGTH = 96;
const FIELD_FILL_PROFILE_MAX_TERM_COUNT = 24;
const FIELD_FILL_PROFILE_MAX_TOTAL_LENGTH = 1024;

type SemanticRuleShape = {
  type?: unknown;
  category?: unknown;
  tags?: unknown;
  outputs?: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string' && item.trim().length > 0)
  );
}

function validateLoginProfileTerms(key: string, value: string[]): string[] {
  const errors: string[] = [];
  if (value.length > LOGIN_PROFILE_MAX_TERM_COUNT) {
    errors.push(`outputs.${key} 数量不能超过 ${LOGIN_PROFILE_MAX_TERM_COUNT}`);
  }

  const totalLength = value.reduce((sum, item) => sum + item.trim().length, 0);
  if (totalLength > LOGIN_PROFILE_MAX_TOTAL_LENGTH) {
    errors.push(`outputs.${key} 总字符数不能超过 ${LOGIN_PROFILE_MAX_TOTAL_LENGTH}`);
  }

  for (const term of value) {
    const normalized = term.trim();
    if (normalized.length > LOGIN_PROFILE_MAX_TERM_LENGTH) {
      errors.push(`outputs.${key} 中词项长度不能超过 ${LOGIN_PROFILE_MAX_TERM_LENGTH}`);
      break;
    }
    if (/[\u0000-\u001f\u007f]/.test(normalized)) {
      errors.push(`outputs.${key} 包含控制字符，必须移除异常输入`);
      break;
    }
  }

  return errors;
}

function hasLoginProfileMarkers(outputs: Record<string, unknown>): boolean {
  return LOGIN_PROFILE_MARKER_KEYS.some((key) => key in outputs);
}

function hasNavigationProfileMarkers(outputs: Record<string, unknown>): boolean {
  if (outputs.profile_type === NAVIGATION_PROFILE_TYPE) {
    return true;
  }
  if (typeof outputs.profile_type === 'string') {
    return false;
  }

  return (
    'destination_url' in outputs ||
    'destination_path' in outputs ||
    'intent_terms' in outputs ||
    'locale_hints' in outputs
  );
}

function hasReadProfileMarkers(outputs: Record<string, unknown>): boolean {
  if (outputs.profile_type === READ_PROFILE_TYPE) {
    return true;
  }
  if (typeof outputs.profile_type === 'string') {
    return false;
  }

  return 'field_terms' in outputs || 'region_terms' in outputs;
}

function hasActionProfileMarkers(outputs: Record<string, unknown>): boolean {
  if (outputs.profile_type === ACTION_PROFILE_TYPE) {
    return true;
  }
  if (typeof outputs.profile_type === 'string') {
    return false;
  }

  return (
    'semantic_hint' in outputs ||
    'action_terms' in outputs ||
    'role_hints' in outputs ||
    'category_hint' in outputs
  );
}

function hasSearchProfileMarkers(outputs: Record<string, unknown>): boolean {
  if (outputs.profile_type === SEARCH_PROFILE_TYPE) {
    return true;
  }
  if (typeof outputs.profile_type === 'string') {
    return false;
  }

  return (
    'search_terms' in outputs ||
    'smart_search_terms' in outputs ||
    'list_result_terms' in outputs ||
    'click_result_terms' in outputs
  );
}

function hasFieldFillProfileMarkers(outputs: Record<string, unknown>): boolean {
  if (outputs.profile_type === FIELD_FILL_PROFILE_TYPE) {
    return true;
  }
  if (typeof outputs.profile_type === 'string') {
    return false;
  }

  return (
    'field_terms' in outputs ||
    'canonical_field' in outputs ||
    'value_hints' in outputs
  );
}

function validateNavigationProfileTerms(key: string, value: string[]): string[] {
  const errors: string[] = [];
  if (value.length > NAVIGATION_PROFILE_MAX_TERM_COUNT) {
    errors.push(`outputs.${key} 数量不能超过 ${NAVIGATION_PROFILE_MAX_TERM_COUNT}`);
  }

  const totalLength = value.reduce((sum, item) => sum + item.trim().length, 0);
  if (totalLength > NAVIGATION_PROFILE_MAX_TOTAL_LENGTH) {
    errors.push(`outputs.${key} 总字符数不能超过 ${NAVIGATION_PROFILE_MAX_TOTAL_LENGTH}`);
  }

  for (const term of value) {
    const normalized = term.trim();
    if (normalized.length > NAVIGATION_PROFILE_MAX_TERM_LENGTH) {
      errors.push(`outputs.${key} 中词项长度不能超过 ${NAVIGATION_PROFILE_MAX_TERM_LENGTH}`);
      break;
    }
    if (/[\u0000-\u001f\u007f]/.test(normalized)) {
      errors.push(`outputs.${key} 包含控制字符，必须移除异常输入`);
      break;
    }
  }

  return errors;
}

function validateReadProfileTerms(key: string, value: string[]): string[] {
  const errors: string[] = [];
  if (value.length > READ_PROFILE_MAX_TERM_COUNT) {
    errors.push(`outputs.${key} 数量不能超过 ${READ_PROFILE_MAX_TERM_COUNT}`);
  }

  const totalLength = value.reduce((sum, item) => sum + item.trim().length, 0);
  if (totalLength > READ_PROFILE_MAX_TOTAL_LENGTH) {
    errors.push(`outputs.${key} 总字符数不能超过 ${READ_PROFILE_MAX_TOTAL_LENGTH}`);
  }

  for (const term of value) {
    const normalized = term.trim();
    if (normalized.length > READ_PROFILE_MAX_TERM_LENGTH) {
      errors.push(`outputs.${key} 中词项长度不能超过 ${READ_PROFILE_MAX_TERM_LENGTH}`);
      break;
    }
    if (/[\u0000-\u001f\u007f]/.test(normalized)) {
      errors.push(`outputs.${key} 包含控制字符，必须移除异常输入`);
      break;
    }
  }

  return errors;
}

function validateActionProfileTerms(key: string, value: string[]): string[] {
  const errors: string[] = [];
  if (value.length > ACTION_PROFILE_MAX_TERM_COUNT) {
    errors.push(`outputs.${key} 数量不能超过 ${ACTION_PROFILE_MAX_TERM_COUNT}`);
  }

  const totalLength = value.reduce((sum, item) => sum + item.trim().length, 0);
  if (totalLength > ACTION_PROFILE_MAX_TOTAL_LENGTH) {
    errors.push(`outputs.${key} 总字符数不能超过 ${ACTION_PROFILE_MAX_TOTAL_LENGTH}`);
  }

  for (const term of value) {
    const normalized = term.trim();
    if (normalized.length > ACTION_PROFILE_MAX_TERM_LENGTH) {
      errors.push(`outputs.${key} 中词项长度不能超过 ${ACTION_PROFILE_MAX_TERM_LENGTH}`);
      break;
    }
    if (/[\u0000-\u001f\u007f]/.test(normalized)) {
      errors.push(`outputs.${key} 包含控制字符，必须移除异常输入`);
      break;
    }
  }

  return errors;
}

function validateSearchProfileTerms(key: string, value: string[]): string[] {
  const errors: string[] = [];
  if (value.length > SEARCH_PROFILE_MAX_TERM_COUNT) {
    errors.push(`outputs.${key} 数量不能超过 ${SEARCH_PROFILE_MAX_TERM_COUNT}`);
  }

  const totalLength = value.reduce((sum, item) => sum + item.trim().length, 0);
  if (totalLength > SEARCH_PROFILE_MAX_TOTAL_LENGTH) {
    errors.push(`outputs.${key} 总字符数不能超过 ${SEARCH_PROFILE_MAX_TOTAL_LENGTH}`);
  }

  for (const term of value) {
    const normalized = term.trim();
    if (normalized.length > SEARCH_PROFILE_MAX_TERM_LENGTH) {
      errors.push(`outputs.${key} 中词项长度不能超过 ${SEARCH_PROFILE_MAX_TERM_LENGTH}`);
      break;
    }
    if (/[\u0000-\u001f\u007f]/.test(normalized)) {
      errors.push(`outputs.${key} 包含控制字符，必须移除异常输入`);
      break;
    }
  }

  return errors;
}

function validateFieldFillProfileTerms(key: string, value: string[]): string[] {
  const errors: string[] = [];
  if (value.length > FIELD_FILL_PROFILE_MAX_TERM_COUNT) {
    errors.push(`outputs.${key} 数量不能超过 ${FIELD_FILL_PROFILE_MAX_TERM_COUNT}`);
  }

  const totalLength = value.reduce((sum, item) => sum + item.trim().length, 0);
  if (totalLength > FIELD_FILL_PROFILE_MAX_TOTAL_LENGTH) {
    errors.push(`outputs.${key} 总字符数不能超过 ${FIELD_FILL_PROFILE_MAX_TOTAL_LENGTH}`);
  }

  for (const term of value) {
    const normalized = term.trim();
    if (normalized.length > FIELD_FILL_PROFILE_MAX_TERM_LENGTH) {
      errors.push(`outputs.${key} 中词项长度不能超过 ${FIELD_FILL_PROFILE_MAX_TERM_LENGTH}`);
      break;
    }
    if (/[\u0000-\u001f\u007f]/.test(normalized)) {
      errors.push(`outputs.${key} 包含控制字符，必须移除异常输入`);
      break;
    }
  }

  return errors;
}

export function extractSemanticRuleCategory(rule: SemanticRuleShape): SemanticRuleCategory | undefined {
  if (typeof rule.category === 'string' && rule.category.trim()) {
    return rule.category.trim() as SemanticRuleCategory;
  }

  if (Array.isArray(rule.tags)) {
    const categoryTag = rule.tags.find(
      (item): item is string => typeof item === 'string' && item.startsWith('category:')
    );
    if (categoryTag) {
      const rawCategory = categoryTag.slice('category:'.length).trim();
      if (rawCategory) {
        return rawCategory as SemanticRuleCategory;
      }
    }
  }

  if (rule.type === 'LOGIN_PHRASE') {
    return 'LOGIN';
  }

  if (rule.type === 'READ_INTENT') {
    return 'READ_VALUE';
  }

  return undefined;
}

export function validateSemanticRuleOutputs(rule: SemanticRuleShape): string[] {
  if (!isPlainObject(rule.outputs)) {
    return ['outputs 必须是对象'];
  }

  const profileType = rule.outputs.profile_type;
  const shouldValidateLoginProfile =
    profileType === LOGIN_PROFILE_TYPE ||
    (profileType !== NAVIGATION_PROFILE_TYPE &&
      profileType !== READ_PROFILE_TYPE &&
      profileType !== ACTION_PROFILE_TYPE &&
      profileType !== SEARCH_PROFILE_TYPE &&
      profileType !== FIELD_FILL_PROFILE_TYPE &&
      hasLoginProfileMarkers(rule.outputs));
  const shouldValidateNavigationProfile =
    profileType === NAVIGATION_PROFILE_TYPE || hasNavigationProfileMarkers(rule.outputs);
  const shouldValidateReadProfile = profileType === READ_PROFILE_TYPE || hasReadProfileMarkers(rule.outputs);
  const shouldValidateActionProfile =
    profileType === ACTION_PROFILE_TYPE || hasActionProfileMarkers(rule.outputs);
  const shouldValidateSearchProfile =
    profileType === SEARCH_PROFILE_TYPE || hasSearchProfileMarkers(rule.outputs);
  const shouldValidateFieldFillProfile =
    profileType === FIELD_FILL_PROFILE_TYPE || hasFieldFillProfileMarkers(rule.outputs);

  if (shouldValidateLoginProfile) {
    const errors: string[] = [];
    const category = extractSemanticRuleCategory(rule);

    if (category !== 'LOGIN' && rule.type !== 'LOGIN_PHRASE') {
      errors.push('仅 LOGIN 类规则允许声明 login profile outputs');
    }

    for (const key of Object.keys(rule.outputs)) {
      if (!LOGIN_PROFILE_ALLOWED_KEYS.has(key)) {
        errors.push(`outputs 包含未允许的字段 ${key}`);
      }
    }

    if (rule.outputs.profile_type !== LOGIN_PROFILE_TYPE) {
      errors.push(`outputs.profile_type 必须为 ${LOGIN_PROFILE_TYPE}`);
    }

    for (const key of LOGIN_PROFILE_STRING_ARRAY_KEYS) {
      const value = rule.outputs[key];
      if (value === undefined) {
        continue;
      }

      if (!isStringArray(value)) {
        errors.push(`outputs.${key} 必须是非空字符串数组`);
        continue;
      }

      errors.push(...validateLoginProfileTerms(key, value));
    }

    const interruptPolicy = rule.outputs.interrupt_policy;
    if (
      interruptPolicy !== undefined &&
      !LOGIN_INTERRUPT_POLICIES.includes(
        interruptPolicy as (typeof LOGIN_INTERRUPT_POLICIES)[number]
      )
    ) {
      errors.push('outputs.interrupt_policy 必须是 fallback 或 takeover_required');
    }

    return errors;
  }

  if (!shouldValidateNavigationProfile) {
    if (
      !shouldValidateReadProfile &&
      !shouldValidateActionProfile &&
      !shouldValidateSearchProfile &&
      !shouldValidateFieldFillProfile
    ) {
      return [];
    }
  }

  if (shouldValidateNavigationProfile) {
    const errors: string[] = [];
    const category = extractSemanticRuleCategory(rule);

    if (category !== 'NAVIGATION') {
      errors.push('仅 NAVIGATION 类规则允许声明 navigation profile outputs');
    }

    for (const key of Object.keys(rule.outputs)) {
      if (!NAVIGATION_PROFILE_ALLOWED_KEYS.has(key)) {
        errors.push(`outputs 包含未允许的字段 ${key}`);
      }
    }

    if (rule.outputs.profile_type !== NAVIGATION_PROFILE_TYPE) {
      errors.push(`outputs.profile_type 必须为 ${NAVIGATION_PROFILE_TYPE}`);
    }

    for (const key of NAVIGATION_PROFILE_STRING_ARRAY_KEYS) {
      const value = rule.outputs[key];
      if (value === undefined) {
        continue;
      }

      if (!isStringArray(value)) {
        errors.push(`outputs.${key} 必须是非空字符串数组`);
        continue;
      }

      errors.push(...validateNavigationProfileTerms(key, value));
    }

    if (!isStringArray(rule.outputs.target_terms)) {
      errors.push('outputs.target_terms 必须是非空字符串数组');
    }

    const destinationUrl =
      typeof rule.outputs.destination_url === 'string' ? rule.outputs.destination_url.trim() : '';
    const destinationPath =
      typeof rule.outputs.destination_path === 'string' ? rule.outputs.destination_path.trim() : '';
    if (!destinationUrl && !destinationPath) {
      errors.push('outputs.destination_url 或 outputs.destination_path 至少要提供一个');
    }

    if (rule.outputs.destination_url !== undefined && !destinationUrl) {
      errors.push('outputs.destination_url 必须是非空字符串');
    }

    if (rule.outputs.destination_path !== undefined && !destinationPath) {
      errors.push('outputs.destination_path 必须是非空字符串');
    }

    return errors;
  }

  if (!shouldValidateReadProfile) {
    if (!shouldValidateActionProfile && !shouldValidateSearchProfile && !shouldValidateFieldFillProfile) {
      return [];
    }
  }

  if (shouldValidateReadProfile) {
    const errors: string[] = [];
    const category = extractSemanticRuleCategory(rule);

    if (category !== 'READ_VALUE' && rule.type !== 'READ_INTENT') {
      errors.push('仅 READ_VALUE 类规则允许声明 read profile outputs');
    }

    for (const key of Object.keys(rule.outputs)) {
      if (!READ_PROFILE_ALLOWED_KEYS.has(key)) {
        errors.push(`outputs 包含未允许的字段 ${key}`);
      }
    }

    if (rule.outputs.profile_type !== READ_PROFILE_TYPE) {
      errors.push(`outputs.profile_type 必须为 ${READ_PROFILE_TYPE}`);
    }

    for (const key of READ_PROFILE_STRING_ARRAY_KEYS) {
      const value = rule.outputs[key];
      if (value === undefined) {
        continue;
      }

      if (!isStringArray(value)) {
        errors.push(`outputs.${key} 必须是非空字符串数组`);
        continue;
      }

      errors.push(...validateReadProfileTerms(key, value));
    }

    if (!isStringArray(rule.outputs.target_terms)) {
      errors.push('outputs.target_terms 必须是非空字符串数组');
    }

    const hasFieldTerms = isStringArray(rule.outputs.field_terms);
    const hasRegionTerms = isStringArray(rule.outputs.region_terms);
    if (!hasFieldTerms && !hasRegionTerms) {
      errors.push('outputs.field_terms 或 outputs.region_terms 至少要提供一个');
    }

    return errors;
  }

  if (!shouldValidateActionProfile) {
    if (!shouldValidateSearchProfile && !shouldValidateFieldFillProfile) {
      return [];
    }
  }

  if (shouldValidateSearchProfile) {
    const errors: string[] = [];
    const category = extractSemanticRuleCategory(rule);

    if (category !== 'SEARCH') {
      errors.push('仅 SEARCH 类规则允许声明 search profile outputs');
    }

    for (const key of Object.keys(rule.outputs)) {
      if (!SEARCH_PROFILE_ALLOWED_KEYS.has(key)) {
        errors.push(`outputs 包含未允许的字段 ${key}`);
      }
    }

    if (rule.outputs.profile_type !== SEARCH_PROFILE_TYPE) {
      errors.push(`outputs.profile_type 必须为 ${SEARCH_PROFILE_TYPE}`);
    }

    for (const key of SEARCH_PROFILE_STRING_ARRAY_KEYS) {
      const value = rule.outputs[key];
      if (value === undefined) {
        continue;
      }

      if (!isStringArray(value)) {
        errors.push(`outputs.${key} 必须是非空字符串数组`);
        continue;
      }

      errors.push(...validateSearchProfileTerms(key, value));
    }

    const hasSearchTerms = isStringArray(rule.outputs.search_terms);
    const hasSmartSearchTerms = isStringArray(rule.outputs.smart_search_terms);
    const hasListResultTerms = isStringArray(rule.outputs.list_result_terms);
    const hasClickResultTerms = isStringArray(rule.outputs.click_result_terms);
    if (!hasSearchTerms && !hasSmartSearchTerms && !hasListResultTerms && !hasClickResultTerms) {
      errors.push(
        'outputs.search_terms / outputs.smart_search_terms / outputs.list_result_terms / outputs.click_result_terms 至少要提供一个'
      );
    }

    return errors;
  }

  if (!shouldValidateActionProfile) {
    if (!shouldValidateFieldFillProfile) {
      return [];
    }
  }

  if (shouldValidateFieldFillProfile) {
    const errors: string[] = [];
    const category = extractSemanticRuleCategory(rule);

    if (category !== 'FIELD_FILL') {
      errors.push('仅 FIELD_FILL 类规则允许声明 field fill profile outputs');
    }

    for (const key of Object.keys(rule.outputs)) {
      if (!FIELD_FILL_PROFILE_ALLOWED_KEYS.has(key)) {
        errors.push(`outputs 包含未允许的字段 ${key}`);
      }
    }

    if (rule.outputs.profile_type !== FIELD_FILL_PROFILE_TYPE) {
      errors.push(`outputs.profile_type 必须为 ${FIELD_FILL_PROFILE_TYPE}`);
    }

    for (const key of FIELD_FILL_PROFILE_STRING_ARRAY_KEYS) {
      const value = rule.outputs[key];
      if (value === undefined) {
        continue;
      }

      if (!isStringArray(value)) {
        errors.push(`outputs.${key} 必须是非空字符串数组`);
        continue;
      }

      errors.push(...validateFieldFillProfileTerms(key, value));
    }

    if (!isStringArray(rule.outputs.field_terms)) {
      errors.push('outputs.field_terms 必须是非空字符串数组');
    }

    if (
      rule.outputs.canonical_field !== undefined &&
      (typeof rule.outputs.canonical_field !== 'string' || !rule.outputs.canonical_field.trim())
    ) {
      errors.push('outputs.canonical_field 必须是非空字符串');
    }

    return errors;
  }

  if (!shouldValidateActionProfile) {
    return [];
  }

  const errors: string[] = [];
  const category = extractSemanticRuleCategory(rule);

  if (category !== 'DETAIL_OPEN' && category !== 'ROW_ACTION' && category !== 'MENU_SELECTION') {
    errors.push('仅 DETAIL_OPEN / ROW_ACTION / MENU_SELECTION 类规则允许声明 action profile outputs');
  }

  for (const key of Object.keys(rule.outputs)) {
    if (!ACTION_PROFILE_ALLOWED_KEYS.has(key)) {
      errors.push(`outputs 包含未允许的字段 ${key}`);
    }
  }

  if (rule.outputs.profile_type !== ACTION_PROFILE_TYPE) {
    errors.push(`outputs.profile_type 必须为 ${ACTION_PROFILE_TYPE}`);
  }

  for (const key of ACTION_PROFILE_STRING_ARRAY_KEYS) {
    const value = rule.outputs[key];
    if (value === undefined) {
      continue;
    }

    if (!isStringArray(value)) {
      errors.push(`outputs.${key} 必须是非空字符串数组`);
      continue;
    }

    errors.push(...validateActionProfileTerms(key, value));
  }

  if (!isStringArray(rule.outputs.target_terms)) {
    errors.push('outputs.target_terms 必须是非空字符串数组');
  }

  const semanticHint = rule.outputs.semantic_hint;
  if (
    semanticHint !== undefined &&
    semanticHint !== 'detail' &&
    semanticHint !== 'approve' &&
    semanticHint !== 'reject' &&
    semanticHint !== 'menu' &&
    semanticHint !== 'edit' &&
    semanticHint !== 'delete' &&
    semanticHint !== 'open'
  ) {
    errors.push('outputs.semantic_hint 必须是 detail / approve / reject / menu / edit / delete / open');
  }

  const categoryHint = rule.outputs.category_hint;
  if (
    categoryHint !== undefined &&
    categoryHint !== 'DETAIL_OPEN' &&
    categoryHint !== 'ROW_ACTION' &&
    categoryHint !== 'MENU_SELECTION'
  ) {
    errors.push('outputs.category_hint 必须是 DETAIL_OPEN / ROW_ACTION / MENU_SELECTION');
  }

  if (
    rule.outputs.role_hints !== undefined &&
    !(
      isStringArray(rule.outputs.role_hints) &&
      rule.outputs.role_hints.every(
        (item) => item === 'button' || item === 'link' || item === 'tab' || item === 'menuitem'
      )
    )
  ) {
    errors.push('outputs.role_hints 必须是 button/link/tab/menuitem 的非空字符串数组');
  }

  const hasActionTerms = isStringArray(rule.outputs.action_terms);
  if (semanticHint === undefined && !hasActionTerms) {
    errors.push('outputs.semantic_hint 或 outputs.action_terms 至少要提供一个');
  }

  return errors;
}

@ValidatorConstraint({ name: 'semanticRuleOutputs', async: false })
export class SemanticRuleOutputsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args?: ValidationArguments): boolean {
    return validateSemanticRuleOutputs({
      ...(args?.object as Record<string, unknown> | undefined),
      outputs: value,
    }).length === 0;
  }

  defaultMessage(args?: ValidationArguments): string {
    const errors = validateSemanticRuleOutputs({
      ...(args?.object as Record<string, unknown> | undefined),
      outputs: args?.value,
    });
    return errors.length > 0 ? errors.join('；') : 'outputs 配置不合法';
  }
}
