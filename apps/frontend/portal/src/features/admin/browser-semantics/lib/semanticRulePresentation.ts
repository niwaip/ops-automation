import type {
  SemanticRule,
  SemanticRuleCategory,
  SemanticRuleErrorLog,
  SemanticRuleHitLog,
} from '@/api/browser-semantics';

type LoginProfileArrayKey =
  | 'credential_intent_terms'
  | 'submit_intent_terms'
  | 'username_terms'
  | 'password_terms'
  | 'otp_terms'
  | 'submit_labels'
  | 'trailing_action_terms'
  | 'login_success_hints'
  | 'takeover_signals'
  | 'unsupported_auth_signals'
  | 'locale_hints';

type NavigationProfileArrayKey = 'target_terms' | 'intent_terms' | 'locale_hints';
type ReadProfileArrayKey =
  | 'target_terms'
  | 'field_terms'
  | 'region_terms'
  | 'intent_terms'
  | 'locale_hints';
type ActionProfileArrayKey =
  | 'target_terms'
  | 'action_terms'
  | 'region_terms'
  | 'role_hints'
  | 'intent_terms'
  | 'locale_hints';
type SearchProfileArrayKey =
  | 'search_terms'
  | 'smart_search_terms'
  | 'list_result_terms'
  | 'click_result_terms'
  | 'locale_hints';
type FieldFillProfileArrayKey =
  | 'field_terms'
  | 'region_terms'
  | 'value_hints'
  | 'intent_terms'
  | 'locale_hints';

const LOGIN_PROFILE_LABELS: Record<LoginProfileArrayKey, string> = {
  credential_intent_terms: '凭据意图词',
  submit_intent_terms: '提交意图词',
  username_terms: '用户名词项',
  password_terms: '密码词项',
  otp_terms: '验证码词项',
  submit_labels: '提交按钮文案',
  trailing_action_terms: '尾随动作词',
  login_success_hints: '登录成功提示',
  takeover_signals: '接管信号',
  unsupported_auth_signals: '不支持认证信号',
  locale_hints: '语言提示',
};

const LOGIN_PROFILE_ARRAY_KEYS = Object.keys(LOGIN_PROFILE_LABELS) as LoginProfileArrayKey[];

const NAVIGATION_PROFILE_LABELS: Record<NavigationProfileArrayKey, string> = {
  target_terms: '目标词项',
  intent_terms: '导航意图词',
  locale_hints: '语言提示',
};

const NAVIGATION_PROFILE_ARRAY_KEYS = Object.keys(
  NAVIGATION_PROFILE_LABELS
) as NavigationProfileArrayKey[];

const READ_PROFILE_LABELS: Record<ReadProfileArrayKey, string> = {
  target_terms: '目标词项',
  field_terms: '字段词项',
  region_terms: '区域词项',
  intent_terms: '读取意图词',
  locale_hints: '语言提示',
};

const READ_PROFILE_ARRAY_KEYS = Object.keys(READ_PROFILE_LABELS) as ReadProfileArrayKey[];

const ACTION_PROFILE_LABELS: Record<ActionProfileArrayKey, string> = {
  target_terms: '目标词项',
  action_terms: '动作词项',
  region_terms: '区域词项',
  role_hints: '角色提示',
  intent_terms: '动作意图词',
  locale_hints: '语言提示',
};

const ACTION_PROFILE_ARRAY_KEYS = Object.keys(ACTION_PROFILE_LABELS) as ActionProfileArrayKey[];

const SEARCH_PROFILE_LABELS: Record<SearchProfileArrayKey, string> = {
  search_terms: '搜索触发词',
  smart_search_terms: '智搜触发词',
  list_result_terms: '列结果触发词',
  click_result_terms: '点结果触发词',
  locale_hints: '语言提示',
};

const SEARCH_PROFILE_ARRAY_KEYS = Object.keys(SEARCH_PROFILE_LABELS) as SearchProfileArrayKey[];

const FIELD_FILL_PROFILE_LABELS: Record<FieldFillProfileArrayKey, string> = {
  field_terms: '字段词项',
  region_terms: '区域词项',
  value_hints: '值提示',
  intent_terms: '填写意图词',
  locale_hints: '语言提示',
};

const FIELD_FILL_PROFILE_ARRAY_KEYS = Object.keys(
  FIELD_FILL_PROFILE_LABELS
) as FieldFillProfileArrayKey[];

export type SemanticRulePresentationKind =
  | 'login_profile'
  | 'navigation_profile'
  | 'read_profile'
  | 'action_profile'
  | 'search_profile'
  | 'field_fill_profile'
  | 'login_rewrite'
  | 'input_rewrite'
  | 'unknown';

const SEMANTIC_RULE_CATEGORY_LABELS: Record<SemanticRuleCategory, string> = {
  LOGIN: '登录',
  NAVIGATION: '页面导航',
  FIELD_FILL: '表单填写',
  MENU_SELECTION: '菜单选择',
  DETAIL_OPEN: '打开详情',
  READ_VALUE: '读取值',
  ROW_ACTION: '行操作',
  SEARCH: '搜索',
  GENERIC_ALIAS: '通用语义',
};

const SEMANTIC_RULE_TYPE_LABELS: Record<SemanticRule['type'], string> = {
  INTENT_ALIAS: '意图别名',
  FIELD_ALIAS: '字段别名',
  REGION_ALIAS: '区域别名',
  ENTITY_ALIAS: '实体别名',
  ROW_REFERENCE: '行引用',
  READ_INTENT: '读取意图',
  LOGIN_PHRASE: '登录短语',
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};

export const isLoginProfileRule = (rule: SemanticRule): boolean => {
  const outputs = rule.outputs;
  return isPlainObject(outputs) && outputs.profile_type === 'login_terms';
};

export const isNavigationProfileRule = (rule: SemanticRule): boolean => {
  const outputs = rule.outputs;
  return isPlainObject(outputs) && outputs.profile_type === 'navigation_target';
};

export const isReadProfileRule = (rule: SemanticRule): boolean => {
  const outputs = rule.outputs;
  return isPlainObject(outputs) && outputs.profile_type === 'read_target';
};

export const isActionProfileRule = (rule: SemanticRule): boolean => {
  const outputs = rule.outputs;
  return isPlainObject(outputs) && outputs.profile_type === 'action_target';
};

export const isSearchProfileRule = (rule: SemanticRule): boolean => {
  const outputs = rule.outputs;
  return isPlainObject(outputs) && outputs.profile_type === 'search_intent';
};

export const isFieldFillProfileRule = (rule: SemanticRule): boolean => {
  const outputs = rule.outputs;
  return isPlainObject(outputs) && outputs.profile_type === 'field_fill_terms';
};

export const getSemanticRulePresentationKind = (
  rule: SemanticRule
): SemanticRulePresentationKind => {
  if (rule.category === 'LOGIN') {
    return isLoginProfileRule(rule) ? 'login_profile' : 'login_rewrite';
  }

  if (rule.category === 'NAVIGATION' && isNavigationProfileRule(rule)) {
    return 'navigation_profile';
  }

  if (rule.category === 'READ_VALUE' && isReadProfileRule(rule)) {
    return 'read_profile';
  }

  if (
    (rule.category === 'DETAIL_OPEN' ||
      rule.category === 'ROW_ACTION' ||
      rule.category === 'MENU_SELECTION') &&
    isActionProfileRule(rule)
  ) {
    return 'action_profile';
  }

  if (rule.category === 'SEARCH' && isSearchProfileRule(rule)) {
    return 'search_profile';
  }

  if (rule.category === 'FIELD_FILL' && isFieldFillProfileRule(rule)) {
    return 'field_fill_profile';
  }

  if (isPlainObject(rule.outputs)) {
    if (
      typeof rule.outputs.normalized_input === 'string' ||
      typeof rule.outputs.replace_with === 'string' ||
      Array.isArray(rule.outputs.prepend_terms) ||
      Array.isArray(rule.outputs.append_terms)
    ) {
      return 'input_rewrite';
    }
  }

  return 'unknown';
};

export const getSemanticRuleKindLabel = (rule: SemanticRule): string => {
  const kind = getSemanticRulePresentationKind(rule);
  switch (kind) {
    case 'login_profile':
      return '登录画像规则';
    case 'navigation_profile':
      return '导航画像规则';
    case 'read_profile':
      return '读取画像规则';
    case 'action_profile':
      return '动作画像规则';
    case 'search_profile':
      return '搜索画像规则';
    case 'field_fill_profile':
      return '填写画像规则';
    case 'login_rewrite':
      return '登录语义改写';
    case 'input_rewrite':
      return '输入改写';
    default:
      return '通用规则';
  }
};

export const getSemanticRuleCategoryLabel = (category?: SemanticRuleCategory | null): string =>
  category ? SEMANTIC_RULE_CATEGORY_LABELS[category] || category : '未分类';

export const getSemanticRuleTypeLabel = (type?: SemanticRule['type'] | null): string =>
  type ? SEMANTIC_RULE_TYPE_LABELS[type] || type : '未知类型';

export const getSemanticRuleKindColor = (rule: SemanticRule): string => {
  const kind = getSemanticRulePresentationKind(rule);
  switch (kind) {
    case 'login_profile':
      return 'geekblue';
    case 'navigation_profile':
      return 'blue';
    case 'read_profile':
      return 'cyan';
    case 'action_profile':
      return 'volcano';
    case 'search_profile':
      return 'green';
    case 'field_fill_profile':
      return 'magenta';
    case 'login_rewrite':
      return 'purple';
    case 'input_rewrite':
      return 'cyan';
    default:
      return 'default';
  }
};

export const getSemanticRuleSummaryLines = (rule: SemanticRule): string[] => {
  const outputs = isPlainObject(rule.outputs) ? rule.outputs : {};

  if (isLoginProfileRule(rule)) {
    const stats = LOGIN_PROFILE_ARRAY_KEYS.map((key) => {
      const count = asStringArray(outputs[key]).length;
      return count > 0 ? `${LOGIN_PROFILE_LABELS[key]} ${count} 项` : null;
    }).filter((item): item is string => Boolean(item));

    const interruptPolicy =
      outputs.interrupt_policy === 'fallback' || outputs.interrupt_policy === 'takeover_required'
        ? `中断策略 ${outputs.interrupt_policy}`
        : null;

    return [...stats.slice(0, 4), ...(interruptPolicy ? [interruptPolicy] : [])];
  }

  if (isNavigationProfileRule(rule)) {
    const targetTerms = asStringArray(outputs.target_terms);
    const intentTerms = asStringArray(outputs.intent_terms);
    const destinationUrl =
      typeof outputs.destination_url === 'string' && outputs.destination_url.trim()
        ? `destination_url -> ${outputs.destination_url.trim()}`
        : null;
    const destinationPath =
      typeof outputs.destination_path === 'string' && outputs.destination_path.trim()
        ? `destination_path -> ${outputs.destination_path.trim()}`
        : null;

    return [
      targetTerms.length ? `目标词项 ${targetTerms.length} 项` : null,
      intentTerms.length ? `导航意图词 ${intentTerms.length} 项` : null,
      destinationUrl,
      destinationPath,
    ].filter((item): item is string => Boolean(item));
  }

  if (isReadProfileRule(rule)) {
    const targetTerms = asStringArray(outputs.target_terms);
    const fieldTerms = asStringArray(outputs.field_terms);
    const regionTerms = asStringArray(outputs.region_terms);
    const intentTerms = asStringArray(outputs.intent_terms);

    return [
      targetTerms.length ? `目标词项 ${targetTerms.length} 项` : null,
      fieldTerms.length ? `字段词项 ${fieldTerms.length} 项` : null,
      regionTerms.length ? `区域词项 ${regionTerms.length} 项` : null,
      intentTerms.length ? `读取意图词 ${intentTerms.length} 项` : null,
    ].filter((item): item is string => Boolean(item));
  }

  if (isActionProfileRule(rule)) {
    const targetTerms = asStringArray(outputs.target_terms);
    const actionTerms = asStringArray(outputs.action_terms);
    const regionTerms = asStringArray(outputs.region_terms);
    const roleHints = asStringArray(outputs.role_hints);

    return [
      targetTerms.length ? `目标词项 ${targetTerms.length} 项` : null,
      actionTerms.length ? `动作词项 ${actionTerms.length} 项` : null,
      regionTerms.length ? `区域词项 ${regionTerms.length} 项` : null,
      roleHints.length ? `角色提示 ${roleHints.length} 项` : null,
      typeof outputs.semantic_hint === 'string' && outputs.semantic_hint.trim()
        ? `semantic_hint -> ${outputs.semantic_hint.trim()}`
        : null,
    ].filter((item): item is string => Boolean(item));
  }

  if (isSearchProfileRule(rule)) {
    const searchTerms = asStringArray(outputs.search_terms);
    const smartSearchTerms = asStringArray(outputs.smart_search_terms);
    const listResultTerms = asStringArray(outputs.list_result_terms);
    const clickResultTerms = asStringArray(outputs.click_result_terms);

    return [
      searchTerms.length ? `搜索触发词 ${searchTerms.length} 项` : null,
      smartSearchTerms.length ? `智搜触发词 ${smartSearchTerms.length} 项` : null,
      listResultTerms.length ? `列结果触发词 ${listResultTerms.length} 项` : null,
      clickResultTerms.length ? `点结果触发词 ${clickResultTerms.length} 项` : null,
    ].filter((item): item is string => Boolean(item));
  }

  if (isFieldFillProfileRule(rule)) {
    const fieldTerms = asStringArray(outputs.field_terms);
    const regionTerms = asStringArray(outputs.region_terms);
    const valueHints = asStringArray(outputs.value_hints);
    const canonicalField =
      typeof outputs.canonical_field === 'string' && outputs.canonical_field.trim()
        ? `canonical_field -> ${outputs.canonical_field.trim()}`
        : null;

    return [
      fieldTerms.length ? `字段词项 ${fieldTerms.length} 项` : null,
      regionTerms.length ? `区域词项 ${regionTerms.length} 项` : null,
      valueHints.length ? `值提示 ${valueHints.length} 项` : null,
      canonicalField,
    ].filter((item): item is string => Boolean(item));
  }

  const normalizedInput =
    typeof outputs.normalized_input === 'string' && outputs.normalized_input.trim()
      ? `normalized_input -> ${outputs.normalized_input.trim()}`
      : null;
  const replaceWith =
    typeof outputs.replace_with === 'string' && outputs.replace_with.trim()
      ? `replace_with -> ${outputs.replace_with.trim()}`
      : null;
  const prependTerms = asStringArray(outputs.prepend_terms);
  const appendTerms = asStringArray(outputs.append_terms);
  const rewriteStats = [
    normalizedInput,
    replaceWith,
    prependTerms.length ? `prepend_terms ${prependTerms.length} 项` : null,
    appendTerms.length ? `append_terms ${appendTerms.length} 项` : null,
  ].filter((item): item is string => Boolean(item));

  return rewriteStats.length ? rewriteStats : ['查看 outputs 了解详细结构'];
};

export const getLoginProfileSections = (
  rule: SemanticRule
): Array<{ key: string; label: string; values: string[] }> => {
  if (!isLoginProfileRule(rule) || !isPlainObject(rule.outputs)) {
    return [];
  }

  return LOGIN_PROFILE_ARRAY_KEYS.map((key) => ({
    key,
    label: LOGIN_PROFILE_LABELS[key],
    values: asStringArray(rule.outputs?.[key]),
  })).filter((item) => item.values.length > 0);
};

export const getLoginProfileInterruptPolicy = (rule: SemanticRule): string | null => {
  if (!isLoginProfileRule(rule) || !isPlainObject(rule.outputs)) {
    return null;
  }

  return rule.outputs.interrupt_policy === 'fallback' ||
    rule.outputs.interrupt_policy === 'takeover_required'
    ? rule.outputs.interrupt_policy
    : null;
};

export const getNavigationProfileSections = (
  rule: SemanticRule
): Array<{ key: string; label: string; values: string[] }> => {
  if (!isNavigationProfileRule(rule) || !isPlainObject(rule.outputs)) {
    return [];
  }

  return NAVIGATION_PROFILE_ARRAY_KEYS.map((key) => ({
    key,
    label: NAVIGATION_PROFILE_LABELS[key],
    values: asStringArray(rule.outputs?.[key]),
  })).filter((item) => item.values.length > 0);
};

export const getReadProfileSections = (
  rule: SemanticRule
): Array<{ key: string; label: string; values: string[] }> => {
  if (!isReadProfileRule(rule) || !isPlainObject(rule.outputs)) {
    return [];
  }

  return READ_PROFILE_ARRAY_KEYS.map((key) => ({
    key,
    label: READ_PROFILE_LABELS[key],
    values: asStringArray(rule.outputs?.[key]),
  })).filter((item) => item.values.length > 0);
};

export const getActionProfileSections = (
  rule: SemanticRule
): Array<{ key: string; label: string; values: string[] }> => {
  if (!isActionProfileRule(rule) || !isPlainObject(rule.outputs)) {
    return [];
  }

  return ACTION_PROFILE_ARRAY_KEYS.map((key) => ({
    key,
    label: ACTION_PROFILE_LABELS[key],
    values: asStringArray(rule.outputs?.[key]),
  })).filter((item) => item.values.length > 0);
};

export const getSearchProfileSections = (
  rule: SemanticRule
): Array<{ key: string; label: string; values: string[] }> => {
  if (!isSearchProfileRule(rule) || !isPlainObject(rule.outputs)) {
    return [];
  }

  return SEARCH_PROFILE_ARRAY_KEYS.map((key) => ({
    key,
    label: SEARCH_PROFILE_LABELS[key],
    values: asStringArray(rule.outputs?.[key]),
  })).filter((item) => item.values.length > 0);
};

export const getFieldFillProfileSections = (
  rule: SemanticRule
): Array<{ key: string; label: string; values: string[] }> => {
  if (!isFieldFillProfileRule(rule) || !isPlainObject(rule.outputs)) {
    return [];
  }

  return FIELD_FILL_PROFILE_ARRAY_KEYS.map((key) => ({
    key,
    label: FIELD_FILL_PROFILE_LABELS[key],
    values: asStringArray(rule.outputs?.[key]),
  })).filter((item) => item.values.length > 0);
};

export const getFieldFillProfileBadges = (
  rule: SemanticRule
): Array<{ key: 'canonical_field'; label: string; value: string }> => {
  if (!isFieldFillProfileRule(rule) || !isPlainObject(rule.outputs)) {
    return [];
  }

  if (typeof rule.outputs.canonical_field === 'string' && rule.outputs.canonical_field.trim()) {
    return [
      {
        key: 'canonical_field',
        label: '标准字段',
        value: rule.outputs.canonical_field.trim(),
      },
    ];
  }

  return [];
};

export const getActionProfileBadges = (
  rule: SemanticRule
): Array<{ key: 'semantic_hint' | 'category_hint'; label: string; value: string }> => {
  if (!isActionProfileRule(rule) || !isPlainObject(rule.outputs)) {
    return [];
  }

  const badges: Array<{ key: 'semantic_hint' | 'category_hint'; label: string; value: string }> = [];
  if (typeof rule.outputs.semantic_hint === 'string' && rule.outputs.semantic_hint.trim()) {
    badges.push({
      key: 'semantic_hint',
      label: '语义提示',
      value: rule.outputs.semantic_hint.trim(),
    });
  }
  if (typeof rule.outputs.category_hint === 'string' && rule.outputs.category_hint.trim()) {
    badges.push({
      key: 'category_hint',
      label: '类别提示',
      value: rule.outputs.category_hint.trim(),
    });
  }
  return badges;
};

export const getNavigationProfileDestinations = (
  rule: SemanticRule
): Array<{ key: 'destination_url' | 'destination_path'; label: string; value: string }> => {
  if (!isNavigationProfileRule(rule) || !isPlainObject(rule.outputs)) {
    return [];
  }

  const destinations: Array<{ key: 'destination_url' | 'destination_path'; label: string; value: string }> = [];
  if (typeof rule.outputs.destination_url === 'string' && rule.outputs.destination_url.trim()) {
    destinations.push({
      key: 'destination_url',
      label: '目标 URL',
      value: rule.outputs.destination_url.trim(),
    });
  }
  if (typeof rule.outputs.destination_path === 'string' && rule.outputs.destination_path.trim()) {
    destinations.push({
      key: 'destination_path',
      label: '目标路径',
      value: rule.outputs.destination_path.trim(),
    });
  }

  return destinations;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const getLoginLogMetadata = (
  log: Pick<SemanticRuleErrorLog, 'normalizedSemantic' | 'parserOutput'>
): { status?: string; reason?: string } | null => {
  const normalizedSemantic = asRecord(log.normalizedSemantic);
  const parserOutput = asRecord(log.parserOutput);
  const normalizedLogin = asRecord(asRecord(normalizedSemantic?.parser_metadata)?.login);
  const parserLogin = asRecord(asRecord(parserOutput?.metadata)?.login);
  const login = normalizedLogin || parserLogin;

  if (!login) {
    return null;
  }

  return {
    status: typeof login.status === 'string' ? login.status : undefined,
    reason: typeof login.reason === 'string' ? login.reason : undefined,
  };
};

export const getLoginHitMetadata = (
  log: Pick<SemanticRuleHitLog, 'normalizedSemantic' | 'parserOutput'>
): {
  status?: string;
  reason?: string;
  filledFields: string[];
  effectiveLoginProfileVersion?: string;
  parserSource?: string;
} | null => {
  const normalizedSemantic = asRecord(log.normalizedSemantic);
  const parserOutput = asRecord(log.parserOutput);
  const normalizedLogin = asRecord(asRecord(normalizedSemantic?.parser_metadata)?.login);
  const parserLogin = asRecord(asRecord(parserOutput?.metadata)?.login);
  const login = normalizedLogin || parserLogin;

  if (!login && !normalizedSemantic) {
    return null;
  }

  return {
    status: typeof login?.status === 'string' ? login.status : undefined,
    reason: typeof login?.reason === 'string' ? login.reason : undefined,
    filledFields: Array.isArray(normalizedSemantic?.filled_fields)
      ? normalizedSemantic.filled_fields.filter((item): item is string => typeof item === 'string')
      : [],
    effectiveLoginProfileVersion:
      typeof normalizedSemantic?.effective_login_profile_version === 'string'
        ? normalizedSemantic.effective_login_profile_version
        : undefined,
    parserSource:
      typeof normalizedSemantic?.parser_source === 'string'
        ? normalizedSemantic.parser_source
        : undefined,
  };
};

export const getNavigationLogMetadata = (
  log: Pick<SemanticRuleErrorLog, 'normalizedSemantic' | 'parserOutput'>
): {
  status?: string;
  reason?: string;
  resolvedTarget?: string;
  resolvedUrl?: string;
} | null => {
  const normalizedSemantic = asRecord(log.normalizedSemantic);
  const parserOutput = asRecord(log.parserOutput);
  const normalizedNavigation = asRecord(asRecord(normalizedSemantic?.parser_metadata)?.navigation);
  const parserNavigation = asRecord(asRecord(parserOutput?.metadata)?.navigation);
  const navigation = normalizedNavigation || parserNavigation;

  if (!navigation) {
    return null;
  }

  return {
    status: typeof navigation.status === 'string' ? navigation.status : undefined,
    reason: typeof navigation.reason === 'string' ? navigation.reason : undefined,
    resolvedTarget:
      typeof navigation.resolvedTarget === 'string' ? navigation.resolvedTarget : undefined,
    resolvedUrl: typeof navigation.resolvedUrl === 'string' ? navigation.resolvedUrl : undefined,
  };
};

export const getNavigationHitMetadata = (
  log: Pick<SemanticRuleHitLog, 'normalizedSemantic' | 'parserOutput'>
): {
  status?: string;
  reason?: string;
  resolvedTarget?: string;
  resolvedUrl?: string;
  effectiveNavigationProfileVersion?: string;
  parserSource?: string;
} | null => {
  const normalizedSemantic = asRecord(log.normalizedSemantic);
  const parserOutput = asRecord(log.parserOutput);
  const normalizedNavigation = asRecord(asRecord(normalizedSemantic?.parser_metadata)?.navigation);
  const parserNavigation = asRecord(asRecord(parserOutput?.metadata)?.navigation);
  const navigation = normalizedNavigation || parserNavigation;

  if (!navigation && !normalizedSemantic) {
    return null;
  }

  return {
    status: typeof navigation?.status === 'string' ? navigation.status : undefined,
    reason: typeof navigation?.reason === 'string' ? navigation.reason : undefined,
    resolvedTarget:
      typeof navigation?.resolvedTarget === 'string' ? navigation.resolvedTarget : undefined,
    resolvedUrl: typeof navigation?.resolvedUrl === 'string' ? navigation.resolvedUrl : undefined,
    effectiveNavigationProfileVersion:
      typeof normalizedSemantic?.effective_navigation_profile_version === 'string'
        ? normalizedSemantic.effective_navigation_profile_version
        : undefined,
    parserSource:
      typeof normalizedSemantic?.parser_source === 'string'
        ? normalizedSemantic.parser_source
        : undefined,
  };
};

export const getReadLogMetadata = (
  log: Pick<SemanticRuleErrorLog, 'normalizedSemantic' | 'parserOutput'>
): {
  status?: string;
  reason?: string;
  resolvedTarget?: string;
  resolvedField?: string;
  resolvedRegion?: string;
  selector?: string;
} | null => {
  const normalizedSemantic = asRecord(log.normalizedSemantic);
  const parserOutput = asRecord(log.parserOutput);
  const normalizedRead = asRecord(asRecord(normalizedSemantic?.parser_metadata)?.read);
  const parserRead = asRecord(asRecord(parserOutput?.metadata)?.read);
  const read = normalizedRead || parserRead;

  if (!read) {
    return null;
  }

  return {
    status: typeof read.status === 'string' ? read.status : undefined,
    reason: typeof read.reason === 'string' ? read.reason : undefined,
    resolvedTarget: typeof read.resolvedTarget === 'string' ? read.resolvedTarget : undefined,
    resolvedField: typeof read.resolvedField === 'string' ? read.resolvedField : undefined,
    resolvedRegion: typeof read.resolvedRegion === 'string' ? read.resolvedRegion : undefined,
    selector: typeof read.selector === 'string' ? read.selector : undefined,
  };
};

export const getReadHitMetadata = (
  log: Pick<SemanticRuleHitLog, 'normalizedSemantic' | 'parserOutput'>
): {
  status?: string;
  reason?: string;
  resolvedTarget?: string;
  resolvedField?: string;
  resolvedRegion?: string;
  selector?: string;
  effectiveReadProfileVersion?: string;
  parserSource?: string;
} | null => {
  const normalizedSemantic = asRecord(log.normalizedSemantic);
  const parserOutput = asRecord(log.parserOutput);
  const normalizedRead = asRecord(asRecord(normalizedSemantic?.parser_metadata)?.read);
  const parserRead = asRecord(asRecord(parserOutput?.metadata)?.read);
  const read = normalizedRead || parserRead;
  const effectiveProfileVersions = asRecord(normalizedSemantic?.effective_profile_versions);

  if (!read && !normalizedSemantic) {
    return null;
  }

  return {
    status: typeof read?.status === 'string' ? read.status : undefined,
    reason: typeof read?.reason === 'string' ? read.reason : undefined,
    resolvedTarget: typeof read?.resolvedTarget === 'string' ? read.resolvedTarget : undefined,
    resolvedField: typeof read?.resolvedField === 'string' ? read.resolvedField : undefined,
    resolvedRegion: typeof read?.resolvedRegion === 'string' ? read.resolvedRegion : undefined,
    selector: typeof read?.selector === 'string' ? read.selector : undefined,
    effectiveReadProfileVersion:
      typeof effectiveProfileVersions?.read === 'string' ? effectiveProfileVersions.read : undefined,
    parserSource:
      typeof normalizedSemantic?.parser_source === 'string'
        ? normalizedSemantic.parser_source
        : undefined,
  };
};

export const READ_LOG_STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: 'success', value: 'success' },
] as const;

const READ_LOG_REASON_LABELS: Record<string, string> = {
  'read-default-candidate': '默认候选读取',
  'read-runtime-field': '运行时字段画像',
  'read-runtime-field-region': '运行时字段+区域画像',
};

export const getReadLogStatusLabel = (value?: string | null): string => {
  if (!value) {
    return '-';
  }

  return value === 'success' ? '成功' : value;
};

export const getReadLogReasonLabel = (value?: string | null): string => {
  if (!value) {
    return '-';
  }

  return READ_LOG_REASON_LABELS[value] || value;
};

export const READ_LOG_REASON_OPTIONS = [
  { label: '全部原因', value: '' },
  { label: '默认候选读取', value: 'read-default-candidate' },
  { label: '运行时字段画像', value: 'read-runtime-field' },
  { label: '运行时字段+区域画像', value: 'read-runtime-field-region' },
] as const;

export const getActionLogMetadata = (
  log: Pick<SemanticRuleErrorLog, 'normalizedSemantic' | 'parserOutput'>
): {
  status?: string;
  reason?: string;
  resolvedTarget?: string;
  resolvedActionTerm?: string;
  semanticHint?: string;
  resolvedRegion?: string;
  resolvedRoleHint?: string;
  categoryHint?: string;
} | null => {
  const normalizedSemantic = asRecord(log.normalizedSemantic);
  const parserOutput = asRecord(log.parserOutput);
  const normalizedAction = asRecord(asRecord(normalizedSemantic?.parser_metadata)?.action);
  const parserAction = asRecord(asRecord(parserOutput?.metadata)?.action);
  const action = normalizedAction || parserAction;

  if (!action) {
    return null;
  }

  return {
    status: typeof action.status === 'string' ? action.status : undefined,
    reason: typeof action.reason === 'string' ? action.reason : undefined,
    resolvedTarget:
      typeof action.resolvedTarget === 'string' ? action.resolvedTarget : undefined,
    resolvedActionTerm:
      typeof action.resolvedActionTerm === 'string' ? action.resolvedActionTerm : undefined,
    semanticHint: typeof action.semanticHint === 'string' ? action.semanticHint : undefined,
    resolvedRegion:
      typeof action.resolvedRegion === 'string' ? action.resolvedRegion : undefined,
    resolvedRoleHint:
      typeof action.resolvedRoleHint === 'string' ? action.resolvedRoleHint : undefined,
    categoryHint: typeof action.categoryHint === 'string' ? action.categoryHint : undefined,
  };
};

export const getActionHitMetadata = (
  log: Pick<SemanticRuleHitLog, 'normalizedSemantic' | 'parserOutput'>
): {
  status?: string;
  reason?: string;
  resolvedTarget?: string;
  resolvedActionTerm?: string;
  semanticHint?: string;
  resolvedRegion?: string;
  resolvedRoleHint?: string;
  categoryHint?: string;
  effectiveActionProfileVersion?: string;
  parserSource?: string;
} | null => {
  const normalizedSemantic = asRecord(log.normalizedSemantic);
  const parserOutput = asRecord(log.parserOutput);
  const normalizedAction = asRecord(asRecord(normalizedSemantic?.parser_metadata)?.action);
  const parserAction = asRecord(asRecord(parserOutput?.metadata)?.action);
  const action = normalizedAction || parserAction;
  const effectiveProfileVersions = asRecord(normalizedSemantic?.effective_profile_versions);

  if (!action && !normalizedSemantic) {
    return null;
  }

  return {
    status: typeof action?.status === 'string' ? action.status : undefined,
    reason: typeof action?.reason === 'string' ? action.reason : undefined,
    resolvedTarget:
      typeof action?.resolvedTarget === 'string' ? action.resolvedTarget : undefined,
    resolvedActionTerm:
      typeof action?.resolvedActionTerm === 'string' ? action.resolvedActionTerm : undefined,
    semanticHint: typeof action?.semanticHint === 'string' ? action.semanticHint : undefined,
    resolvedRegion:
      typeof action?.resolvedRegion === 'string' ? action.resolvedRegion : undefined,
    resolvedRoleHint:
      typeof action?.resolvedRoleHint === 'string' ? action.resolvedRoleHint : undefined,
    categoryHint: typeof action?.categoryHint === 'string' ? action.categoryHint : undefined,
    effectiveActionProfileVersion:
      typeof effectiveProfileVersions?.action === 'string'
        ? effectiveProfileVersions.action
        : undefined,
    parserSource:
      typeof normalizedSemantic?.parser_source === 'string'
        ? normalizedSemantic.parser_source
        : undefined,
  };
};

export const ACTION_LOG_STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: 'success', value: 'success' },
] as const;

const ACTION_LOG_REASON_LABELS: Record<string, string> = {
  'action-default-candidate': '默认候选动作',
  'action-runtime-target': '运行时目标画像',
  'action-runtime-region': '运行时区域画像',
  'action-runtime-row': '运行时行画像',
  'action-runtime-row-region': '运行时行+区域画像',
};

export const getActionLogStatusLabel = (value?: string | null): string => {
  if (!value) {
    return '-';
  }

  return value === 'success' ? '成功' : value;
};

export const getActionLogReasonLabel = (value?: string | null): string => {
  if (!value) {
    return '-';
  }

  return ACTION_LOG_REASON_LABELS[value] || value;
};

export const ACTION_LOG_REASON_OPTIONS = [
  { label: '全部原因', value: '' },
  { label: '默认候选动作', value: 'action-default-candidate' },
  { label: '运行时目标画像', value: 'action-runtime-target' },
  { label: '运行时区域画像', value: 'action-runtime-region' },
  { label: '运行时行画像', value: 'action-runtime-row' },
  { label: '运行时行+区域画像', value: 'action-runtime-row-region' },
] as const;

export const getSearchLogMetadata = (
  log: Pick<SemanticRuleErrorLog, 'normalizedSemantic' | 'parserOutput'>
): {
  status?: string;
  reason?: string;
  intentType?: string;
  query?: string;
  resultIndex?: number;
  triggerTerm?: string;
} | null => {
  const normalizedSemantic = asRecord(log.normalizedSemantic);
  const parserOutput = asRecord(log.parserOutput);
  const normalizedSearch = asRecord(asRecord(normalizedSemantic?.parser_metadata)?.search);
  const parserSearch = asRecord(asRecord(parserOutput?.metadata)?.search);
  const search = normalizedSearch || parserSearch;

  if (!search) {
    return null;
  }

  return {
    status: typeof search.status === 'string' ? search.status : undefined,
    reason: typeof search.reason === 'string' ? search.reason : undefined,
    intentType: typeof search.intentType === 'string' ? search.intentType : undefined,
    query: typeof search.query === 'string' ? search.query : undefined,
    resultIndex: typeof search.resultIndex === 'number' ? search.resultIndex : undefined,
    triggerTerm: typeof search.triggerTerm === 'string' ? search.triggerTerm : undefined,
  };
};

export const getSearchHitMetadata = (
  log: Pick<SemanticRuleHitLog, 'normalizedSemantic' | 'parserOutput'>
): {
  status?: string;
  reason?: string;
  intentType?: string;
  query?: string;
  resultIndex?: number;
  triggerTerm?: string;
  effectiveSearchProfileVersion?: string;
  parserSource?: string;
} | null => {
  const normalizedSemantic = asRecord(log.normalizedSemantic);
  const parserOutput = asRecord(log.parserOutput);
  const normalizedSearch = asRecord(asRecord(normalizedSemantic?.parser_metadata)?.search);
  const parserSearch = asRecord(asRecord(parserOutput?.metadata)?.search);
  const search = normalizedSearch || parserSearch;
  const effectiveProfileVersions = asRecord(normalizedSemantic?.effective_profile_versions);

  if (!search && !normalizedSemantic) {
    return null;
  }

  return {
    status: typeof search?.status === 'string' ? search.status : undefined,
    reason: typeof search?.reason === 'string' ? search.reason : undefined,
    intentType: typeof search?.intentType === 'string' ? search.intentType : undefined,
    query: typeof search?.query === 'string' ? search.query : undefined,
    resultIndex: typeof search?.resultIndex === 'number' ? search.resultIndex : undefined,
    triggerTerm: typeof search?.triggerTerm === 'string' ? search.triggerTerm : undefined,
    effectiveSearchProfileVersion:
      typeof effectiveProfileVersions?.search === 'string'
        ? effectiveProfileVersions.search
        : undefined,
    parserSource:
      typeof normalizedSemantic?.parser_source === 'string'
        ? normalizedSemantic.parser_source
        : undefined,
  };
};

export const getFieldFillLogMetadata = (
  log: Pick<SemanticRuleErrorLog, 'normalizedSemantic' | 'parserOutput'>
): {
  status?: string;
  reason?: string;
  resolvedField?: string;
  resolvedCanonicalField?: string;
  resolvedRegion?: string;
  selector?: string;
  value?: string;
} | null => {
  const normalizedSemantic = asRecord(log.normalizedSemantic);
  const parserOutput = asRecord(log.parserOutput);
  const normalizedFieldFill = asRecord(asRecord(normalizedSemantic?.parser_metadata)?.fieldFill);
  const parserFieldFill = asRecord(asRecord(parserOutput?.metadata)?.fieldFill);
  const fieldFill = normalizedFieldFill || parserFieldFill;

  if (!fieldFill) {
    return null;
  }

  return {
    status: typeof fieldFill.status === 'string' ? fieldFill.status : undefined,
    reason: typeof fieldFill.reason === 'string' ? fieldFill.reason : undefined,
    resolvedField:
      typeof fieldFill.resolvedField === 'string' ? fieldFill.resolvedField : undefined,
    resolvedCanonicalField:
      typeof fieldFill.resolvedCanonicalField === 'string'
        ? fieldFill.resolvedCanonicalField
        : undefined,
    resolvedRegion:
      typeof fieldFill.resolvedRegion === 'string' ? fieldFill.resolvedRegion : undefined,
    selector: typeof fieldFill.selector === 'string' ? fieldFill.selector : undefined,
    value: typeof fieldFill.value === 'string' ? fieldFill.value : undefined,
  };
};

export const getFieldFillHitMetadata = (
  log: Pick<SemanticRuleHitLog, 'normalizedSemantic' | 'parserOutput'>
): {
  status?: string;
  reason?: string;
  resolvedField?: string;
  resolvedCanonicalField?: string;
  resolvedRegion?: string;
  selector?: string;
  value?: string;
  effectiveFieldFillProfileVersion?: string;
  parserSource?: string;
} | null => {
  const normalizedSemantic = asRecord(log.normalizedSemantic);
  const parserOutput = asRecord(log.parserOutput);
  const normalizedFieldFill = asRecord(asRecord(normalizedSemantic?.parser_metadata)?.fieldFill);
  const parserFieldFill = asRecord(asRecord(parserOutput?.metadata)?.fieldFill);
  const fieldFill = normalizedFieldFill || parserFieldFill;
  const effectiveProfileVersions = asRecord(normalizedSemantic?.effective_profile_versions);

  if (!fieldFill && !normalizedSemantic) {
    return null;
  }

  return {
    status: typeof fieldFill?.status === 'string' ? fieldFill.status : undefined,
    reason: typeof fieldFill?.reason === 'string' ? fieldFill.reason : undefined,
    resolvedField:
      typeof fieldFill?.resolvedField === 'string' ? fieldFill.resolvedField : undefined,
    resolvedCanonicalField:
      typeof fieldFill?.resolvedCanonicalField === 'string'
        ? fieldFill.resolvedCanonicalField
        : undefined,
    resolvedRegion:
      typeof fieldFill?.resolvedRegion === 'string' ? fieldFill.resolvedRegion : undefined,
    selector: typeof fieldFill?.selector === 'string' ? fieldFill.selector : undefined,
    value: typeof fieldFill?.value === 'string' ? fieldFill.value : undefined,
    effectiveFieldFillProfileVersion:
      typeof effectiveProfileVersions?.fieldFill === 'string'
        ? effectiveProfileVersions.fieldFill
        : undefined,
    parserSource:
      typeof normalizedSemantic?.parser_source === 'string'
        ? normalizedSemantic.parser_source
        : undefined,
  };
};

export const LOGIN_LOG_STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: 'profile_miss', value: 'profile_miss' },
  { label: 'partial', value: 'partial' },
  { label: 'takeover_required', value: 'takeover_required' },
] as const;

export const LOGIN_LOG_REASON_OPTIONS = [
  { label: '全部原因', value: '' },
  { label: 'login-profile-miss', value: 'login-profile-miss' },
  { label: 'login-field-missing', value: 'login-field-missing' },
  { label: 'login-submit-target-missing', value: 'login-submit-target-missing' },
  { label: 'login-click-resolve-miss', value: 'login-click-resolve-miss' },
  { label: 'login-trailing-action-miss', value: 'login-trailing-action-miss' },
  { label: 'login-partial-step', value: 'login-partial-step' },
  { label: 'login-takeover-required', value: 'login-takeover-required' },
  { label: 'login-unsupported-auth-challenge', value: 'login-unsupported-auth-challenge' },
] as const;

export const NAVIGATION_LOG_STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: 'success', value: 'success' },
] as const;

const NAVIGATION_LOG_REASON_LABELS: Record<string, string> = {
  'navigation-direct-url': '直接 URL 导航',
  'navigation-direct-path': '直接路径导航',
  'navigation-known-site': '已知站点导航',
  'navigation-runtime-path': '运行时路径画像',
  'navigation-runtime-url': '运行时 URL 画像',
};

export const getNavigationLogStatusLabel = (value?: string | null): string => {
  if (!value) {
    return '-';
  }

  return value === 'success' ? '成功' : value;
};

export const getNavigationLogReasonLabel = (value?: string | null): string => {
  if (!value) {
    return '-';
  }

  return NAVIGATION_LOG_REASON_LABELS[value] || value;
};

export const NAVIGATION_LOG_REASON_OPTIONS = [
  { label: '全部原因', value: '' },
  { label: '直接 URL 导航', value: 'navigation-direct-url' },
  { label: '直接路径导航', value: 'navigation-direct-path' },
  { label: '已知站点导航', value: 'navigation-known-site' },
  { label: '运行时路径画像', value: 'navigation-runtime-path' },
  { label: '运行时 URL 画像', value: 'navigation-runtime-url' },
] as const;

export const FIELD_FILL_LOG_STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: 'success', value: 'success' },
] as const;

const FIELD_FILL_LOG_REASON_LABELS: Record<string, string> = {
  'field-fill-runtime-field': '运行时字段画像',
  'field-fill-runtime-field-region': '运行时字段+区域画像',
  'field-fill-default-candidate': '默认候选字段',
};

export const getFieldFillLogStatusLabel = (value?: string | null): string => {
  if (!value) {
    return '-';
  }

  return value === 'success' ? '成功' : value;
};

export const getFieldFillLogReasonLabel = (value?: string | null): string => {
  if (!value) {
    return '-';
  }

  return FIELD_FILL_LOG_REASON_LABELS[value] || value;
};

export const FIELD_FILL_LOG_REASON_OPTIONS = [
  { label: '全部原因', value: '' },
  { label: '运行时字段画像', value: 'field-fill-runtime-field' },
  { label: '运行时字段+区域画像', value: 'field-fill-runtime-field-region' },
  { label: '默认候选字段', value: 'field-fill-default-candidate' },
] as const;

export const getEmptyRuleStateCopy = (category?: SemanticRuleCategory | null) => ({
  title: category ? `当前${getSemanticRuleCategoryLabel(category)}仅有默认规则` : '当前仅有默认规则',
  description:
    '当前未配置自定义 runtime 规则，系统会继续使用默认规则；可以基于相关错误样本生成该类规则，或者手工补充规则。',
});
