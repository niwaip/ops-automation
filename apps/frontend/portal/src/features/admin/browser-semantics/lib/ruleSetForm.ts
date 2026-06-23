import type {
  CreateSemanticRuleSetPayload,
  SemanticRule,
  SemanticRuleCategory,
  SemanticRuleSet,
  SemanticRuleTargeting,
  UpdateSemanticRuleSetPayload,
} from '@/api/browser-semantics';

export const DEFAULT_DOMAIN_CODE = 'browser_recorder';

export const RULE_TYPE_OPTIONS: Array<CreateSemanticRuleSetPayload['rules'][number]['type']> = [
  'INTENT_ALIAS',
  'FIELD_ALIAS',
  'REGION_ALIAS',
  'ENTITY_ALIAS',
  'ROW_REFERENCE',
  'READ_INTENT',
  'LOGIN_PHRASE',
];

export const RULE_CATEGORY_OPTIONS: SemanticRuleCategory[] = [
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

export interface SemanticRuleFormValuesItem {
  type: CreateSemanticRuleSetPayload['rules'][number]['type'];
  category: SemanticRuleCategory;
  name: string;
  enabled: boolean;
  priority: number;
  stop_on_match: boolean;
  flags?: string;
  patterns: string;
  outputs: string;
}

export interface SemanticRuleSetFormValues {
  domain_code: string;
  key: string;
  name: string;
  version?: string;
  created_by: string;
  description?: string;
  rules: SemanticRuleFormValuesItem[];
  targeting_enabled: boolean;
  targeting_environments?: string;
  targeting_hosts?: string;
  targeting_page_types?: string;
  targeting_item_enabled: boolean;
}

export const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
};

export const renderJsonText = (value: unknown) => {
  if (value === undefined || value === null) {
    return '-';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const renderTargetingSummary = (targeting: SemanticRuleTargeting) => {
  const items = [
    ...normalizeStringList(targeting.environments).map((item) => `环境:${item}`),
    ...normalizeStringList(targeting.hosts).map((item) => `Host:${item}`),
    ...normalizeStringList(targeting.pageTypes).map((item) => `页面:${item}`),
  ];

  if (!items.length) {
    return '全局 fallback';
  }

  return items.join(' / ');
};

export const splitMultilineOrComma = (value?: string): string[] => {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

export const parseJsonObject = (value?: string): Record<string, unknown> => {
  if (!value?.trim()) {
    return {};
  }

  const parsed = JSON.parse(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('输出配置必须是 JSON 对象');
  }

  return parsed as Record<string, unknown>;
};

const isRuleType = (
  value: unknown
): value is CreateSemanticRuleSetPayload['rules'][number]['type'] => {
  return (
    typeof value === 'string' &&
    RULE_TYPE_OPTIONS.includes(value as CreateSemanticRuleSetPayload['rules'][number]['type'])
  );
};

const isRuleCategory = (value: unknown): value is SemanticRuleCategory => {
  return typeof value === 'string' && RULE_CATEGORY_OPTIONS.includes(value as SemanticRuleCategory);
};

export const buildDefaultRuleFormValuesItem = (): SemanticRuleFormValuesItem => ({
  type: 'INTENT_ALIAS',
  category: 'GENERIC_ALIAS',
  name: '',
  enabled: true,
  priority: 100,
  stop_on_match: true,
  flags: 'i',
  patterns: '',
  outputs: '{\n  "normalized_input": ""\n}',
});

export const buildDefaultRuleSetFormValues = (
  domainCode: string = DEFAULT_DOMAIN_CODE
): SemanticRuleSetFormValues => ({
  domain_code: domainCode || DEFAULT_DOMAIN_CODE,
  key: '',
  name: '',
  version: 'v1',
  created_by: 'portal-admin',
  description: '',
  rules: [buildDefaultRuleFormValuesItem()],
  targeting_enabled: false,
  targeting_environments: '',
  targeting_hosts: '',
  targeting_page_types: '',
  targeting_item_enabled: true,
});

export const buildRuleFormValuesItemFromRule = (rule: SemanticRule): SemanticRuleFormValuesItem => ({
  type: isRuleType(rule.type) ? rule.type : 'INTENT_ALIAS',
  category: isRuleCategory(rule.category) ? rule.category : 'GENERIC_ALIAS',
  name: rule.name || '',
  enabled: rule.enabled ?? true,
  priority: rule.priority ?? 100,
  stop_on_match: rule.stopOnMatch ?? false,
  flags: rule.flags || '',
  patterns: Array.isArray(rule.patterns) ? rule.patterns.join('\n') : '',
  outputs: renderJsonText(rule.outputs),
});

export const buildRuleFormValuesItemsFromRules = (
  rules: SemanticRule[] = [],
  fallbackCategory?: SemanticRuleCategory
): SemanticRuleFormValuesItem[] => {
  if (!rules.length) {
    return [
      {
        ...buildDefaultRuleFormValuesItem(),
        category: fallbackCategory || 'GENERIC_ALIAS',
      },
    ];
  }

  return rules.map((rule) => buildRuleFormValuesItemFromRule(rule));
};

export const buildRuleSetFormValuesFromRuleSet = (
  ruleSet: SemanticRuleSet
): SemanticRuleSetFormValues => {
  const firstTargeting = ruleSet.targetings?.[0];
  const rules = buildRuleFormValuesItemsFromRules(ruleSet.rules);

  return {
    domain_code: ruleSet.domain?.code || DEFAULT_DOMAIN_CODE,
    key: ruleSet.key,
    name: ruleSet.name,
    version: ruleSet.version,
    created_by: ruleSet.createdBy,
    description: ruleSet.description || '',
    rules,
    targeting_enabled: !!firstTargeting,
    targeting_environments: normalizeStringList(firstTargeting?.environments).join('\n'),
    targeting_hosts: normalizeStringList(firstTargeting?.hosts).join('\n'),
    targeting_page_types: normalizeStringList(firstTargeting?.pageTypes).join('\n'),
    targeting_item_enabled: firstTargeting?.enabled ?? true,
  };
};

const buildTargetings = (values: SemanticRuleSetFormValues) => {
  if (!values.targeting_enabled) {
    return [];
  }

  const targeting = {
    environments: splitMultilineOrComma(values.targeting_environments),
    hosts: splitMultilineOrComma(values.targeting_hosts),
    page_types: splitMultilineOrComma(values.targeting_page_types),
    enabled: values.targeting_item_enabled ?? true,
  };

  if (
    !targeting.environments.length &&
    !targeting.hosts.length &&
    !targeting.page_types.length &&
    targeting.enabled === undefined
  ) {
    return [];
  }

  return [
    {
      environments: targeting.environments.length ? targeting.environments : undefined,
      hosts: targeting.hosts.length ? targeting.hosts : undefined,
      page_types: targeting.page_types.length ? targeting.page_types : undefined,
      enabled: targeting.enabled,
    },
  ];
};

export const buildCreateSemanticRulePayloads = (
  rules: SemanticRuleFormValuesItem[],
  fixedCategory?: SemanticRuleCategory
): CreateSemanticRuleSetPayload['rules'] => {
  if (!rules.length) {
    throw new Error('至少需要一条规则');
  }

  return rules.map((rule, index) => {
    const patterns = splitMultilineOrComma(rule.patterns);
    if (!patterns.length) {
      throw new Error(`规则 ${index + 1} 至少需要一条 pattern`);
    }

    if (!rule.name.trim()) {
      throw new Error(`规则 ${index + 1} 需要填写名称`);
    }

    return {
      type: rule.type,
      category: fixedCategory || rule.category,
      name: rule.name.trim(),
      enabled: rule.enabled ?? true,
      priority: rule.priority,
      stop_on_match: rule.stop_on_match ?? false,
      flags: rule.flags?.trim() || undefined,
      patterns,
      outputs: parseJsonObject(rule.outputs),
    };
  });
};

export const buildCreateRuleSetPayload = (
  values: SemanticRuleSetFormValues
): CreateSemanticRuleSetPayload => {
  const rules = buildCreateSemanticRulePayloads(values.rules);

  return {
    domain_code: values.domain_code.trim(),
    key: values.key.trim(),
    name: values.name.trim(),
    version: values.version?.trim() || undefined,
    description: values.description?.trim() || undefined,
    created_by: values.created_by.trim(),
    rules,
    targetings: buildTargetings(values),
  };
};

export const buildUpdateRuleSetPayload = (
  values: SemanticRuleSetFormValues
): UpdateSemanticRuleSetPayload => {
  const createPayload = buildCreateRuleSetPayload(values);
  return {
    name: createPayload.name,
    version: createPayload.version,
    description: createPayload.description,
    rules: createPayload.rules,
    targetings: createPayload.targetings,
  };
};
