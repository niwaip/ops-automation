import {
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from 'class-validator';
import type {
  SemanticRuleCategory,
  SemanticRuleType,
} from '../types/semantic-rule.types';

type ValidationInput = {
  type: SemanticRuleType;
  category?: SemanticRuleCategory;
  tags?: unknown;
  outputs: unknown;
};

const KNOWN_CATEGORIES: SemanticRuleCategory[] = [
  'LOGIN',
  'NAVIGATION',
  'FIELD_FILL',
  'MENU_SELECTION',
  'DETAIL_OPEN',
  'READ_VALUE',
  'ROW_ACTION',
  'SEARCH',
  'GENERIC_ALIAS',
];

const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;
const DEFAULT_ARRAY_LIMIT = 48;

export function extractSemanticRuleCategory(input: {
  type: SemanticRuleType;
  tags?: unknown;
}): SemanticRuleCategory | undefined {
  const tags = Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === 'string') : [];
  const categoryTag = tags.find((tag) => {
    const normalized = tag.replace(/^category:/, '') as SemanticRuleCategory;
    return KNOWN_CATEGORIES.includes(normalized);
  });

  if (categoryTag) {
    return categoryTag.replace(/^category:/, '') as SemanticRuleCategory;
  }

  switch (input.type) {
    case 'LOGIN_PHRASE':
      return 'LOGIN';
    case 'READ_INTENT':
      return 'READ_VALUE';
    case 'FIELD_ALIAS':
      return 'FIELD_FILL';
    default:
      return undefined;
  }
}

export function validateSemanticRuleOutputs(input: ValidationInput): string[] {
  const errors: string[] = [];
  const category = input.category ?? extractSemanticRuleCategory(input);
  const outputs = input.outputs;

  if (!outputs || typeof outputs !== 'object' || Array.isArray(outputs)) {
    return ['outputs 必须是对象'];
  }

  const outputMap = outputs as Record<string, unknown>;

  const requireNonEmptyStringArray = (key: string, limit = DEFAULT_ARRAY_LIMIT) => {
    const value = outputMap[key];
    if (!Array.isArray(value) || value.length === 0) {
      errors.push(`outputs.${key} 必须是非空字符串数组`);
      return;
    }
    if (value.length > limit) {
      errors.push(`outputs.${key} 数量不能超过 ${limit}`);
    }
    value.forEach((item) => {
      if (typeof item !== 'string' || !item.trim()) {
        errors.push(`outputs.${key} 必须是非空字符串数组`);
        return;
      }
      if (CONTROL_CHAR_PATTERN.test(item)) {
        errors.push(`outputs.${key} 包含控制字符，必须移除异常输入`);
      }
    });
  };

  const validateOptionalStringArray = (key: string, limit = DEFAULT_ARRAY_LIMIT) => {
    const value = outputMap[key];
    if (value === undefined) {
      return;
    }
    if (!Array.isArray(value)) {
      errors.push(`outputs.${key} 必须是字符串数组`);
      return;
    }
    if (value.length > limit) {
      errors.push(`outputs.${key} 数量不能超过 ${limit}`);
    }
    value.forEach((item) => {
      if (typeof item !== 'string' || !item.trim()) {
        errors.push(`outputs.${key} 必须是字符串数组`);
        return;
      }
      if (CONTROL_CHAR_PATTERN.test(item)) {
        errors.push(`outputs.${key} 包含控制字符，必须移除异常输入`);
      }
    });
  };

  const hasNonEmptyStringArray = (key: string) =>
    Array.isArray(outputMap[key]) &&
    (outputMap[key] as unknown[]).some((item) => typeof item === 'string' && item.trim());

  if (category === 'LOGIN') {
    ['credential_intent_terms', 'username_terms', 'password_terms', 'submit_intent_terms', 'submit_labels'].forEach(
      (key) => validateOptionalStringArray(key)
    );
  }

  if (category === 'NAVIGATION') {
    requireNonEmptyStringArray('target_terms');
    validateOptionalStringArray('intent_terms');
    if (typeof outputMap.destination_url !== 'string' && typeof outputMap.destination_path !== 'string') {
      errors.push('outputs.destination_url 或 outputs.destination_path 至少要提供一个');
    }
  }

  if (category === 'READ_VALUE') {
    requireNonEmptyStringArray('target_terms');
    validateOptionalStringArray('field_terms');
    validateOptionalStringArray('region_terms');
    validateOptionalStringArray('intent_terms');
    if (!hasNonEmptyStringArray('field_terms') && !hasNonEmptyStringArray('region_terms')) {
      errors.push('outputs.field_terms 或 outputs.region_terms 至少要提供一个');
    }
  }

  if (category === 'ROW_ACTION' || category === 'DETAIL_OPEN' || category === 'MENU_SELECTION') {
    requireNonEmptyStringArray('target_terms');
    validateOptionalStringArray('action_terms');
    validateOptionalStringArray('region_terms');
    validateOptionalStringArray('role_hints');
    if (typeof outputMap.semantic_hint !== 'string' && !hasNonEmptyStringArray('action_terms')) {
      errors.push('outputs.semantic_hint 或 outputs.action_terms 至少要提供一个');
    }
  }

  if (category === 'SEARCH') {
    ['search_terms', 'smart_search_terms', 'list_result_terms', 'click_result_terms'].forEach((key) =>
      validateOptionalStringArray(key)
    );
    if (
      !hasNonEmptyStringArray('search_terms') &&
      !hasNonEmptyStringArray('smart_search_terms') &&
      !hasNonEmptyStringArray('list_result_terms') &&
      !hasNonEmptyStringArray('click_result_terms')
    ) {
      errors.push(
        'outputs.search_terms / outputs.smart_search_terms / outputs.list_result_terms / outputs.click_result_terms 至少要提供一个'
      );
    }
  }

  if (category === 'FIELD_FILL') {
    requireNonEmptyStringArray('field_terms');
    validateOptionalStringArray('region_terms');
    validateOptionalStringArray('value_hints');
    validateOptionalStringArray('intent_terms');
  }

  return [...new Set(errors)];
}

@ValidatorConstraint({ name: 'SemanticRuleOutputsConstraint', async: false })
export class SemanticRuleOutputsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const rule = args.object as {
      type: SemanticRuleType;
      category?: SemanticRuleCategory;
      tags?: string[];
    };

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    return (
      validateSemanticRuleOutputs({
        type: rule.type,
        category: rule.category,
        tags: rule.tags,
        outputs: value as Record<string, unknown>,
      }).length === 0
    );
  }

  defaultMessage(args: ValidationArguments): string {
    const rule = args.object as {
      type: SemanticRuleType;
      category?: SemanticRuleCategory;
      tags?: string[];
    };

    if (!args.value || typeof args.value !== 'object' || Array.isArray(args.value)) {
      return 'outputs 必须是对象';
    }

    return validateSemanticRuleOutputs({
      type: rule.type,
      category: rule.category,
      tags: rule.tags,
      outputs: args.value as Record<string, unknown>,
    }).join('; ');
  }
}
