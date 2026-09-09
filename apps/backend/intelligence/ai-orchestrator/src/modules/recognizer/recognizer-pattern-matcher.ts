import { isPlaceholderTextValue } from "../../common/placeholder-value";
import { normalizeSemanticRole } from "./semantic-role.registry";
import { extractUrlFromInput } from "./recognizer-url-extractor";

export interface ParamSchemaProperty {
  type: string;
  description?: string;
  required?: boolean;
  default?: string | number | boolean;
  enum?: Array<string | number>;
  exampleValue?: unknown;
  extractionPrompt?: string;
  semanticRole?: string;
  extractionHints?: string[];
  displayName?: string;
}

function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function resolveExpectedValueType(
  key: string,
  expectedType: string,
  schema?: ParamSchemaProperty
): string {
  if (expectedType !== "array") {
    return expectedType;
  }
  if (!key.includes("[]")) {
    return "array";
  }

  const signalText = buildSignalText(key, schema).toLowerCase();
  if (
    /(arrivaldate|installationdate|signdate|date|日期|签署日期|签订日期|到货日期|交付日期|安装完成日期|安装日期)/i.test(
      signalText
    )
  ) {
    return "date";
  }
  if (
    /(amount|price|ratio|quantity|count|number|subtotal|total|序号|行号|数量|金额|单价|比例|月数)/i.test(
      signalText
    )
  ) {
    return "number";
  }
  if (/(boolean|bool|flag|是否|include|包含)/i.test(signalText)) {
    return "boolean";
  }
  return "string";
}

export function inferFieldValueFromExplicitPatterns(
  key: string,
  schema: ParamSchemaProperty,
  userInput: string
): unknown {
  const aliases = buildFieldAliases(key, schema);
  const isLineItemArrayField = isEnumeratedLineItemArrayField(key, schema, aliases);
  const isDeliveryArrayField = isDeliveryScopedArrayField(key, schema, aliases);
  const isPaymentArrayField = isPaymentClauseArrayField(key, schema, aliases);
  if (key.includes('[]')) {
    if (isLineItemArrayField && hasAliasKeyword(aliases, ['行号', '序号'])) {
      return extractItemSequenceNumbers(userInput);
    }
    if (isLineItemArrayField && hasAliasKeyword(aliases, ['名称'])) {
      return extractEnumeratedItemNames(userInput);
    }
    if (isLineItemArrayField) {
      const expectedType = resolveExpectedValueType(key, schema.type, schema);
      const itemValues = extractEnumeratedItemFieldValues(
        userInput,
        aliases,
        expectedType === 'date' ? 'date' : expectedType === 'number' ? 'number' : 'string'
      );
      if (itemValues && itemValues.length > 0) {
        return itemValues;
      }
    }
    if (isDeliveryArrayField) {
      const expectedType = resolveExpectedValueType(key, schema.type, schema);
      if (hasExactAliasKeyword(aliases, ['批次'])) {
        return extractBatchValues(userInput);
      }
      if (hasExactAliasKeyword(aliases, ['地点', '地址'])) {
        const locations = extractDeliveryLocations(userInput);
        if (locations.length > 0) {
          return locations;
        }
        const location = extractLocationValue(userInput);
        if (location) {
          return [location];
        }
      }
      if (expectedType === 'date') {
        const explicitDates = extractDateValuesByAliases(userInput, aliases);
        if (explicitDates && explicitDates.length > 0) {
          return explicitDates;
        }
      }
      if (expectedType === 'date' || hasAliasKeyword(aliases, ['验收方式', '验收类型'])) {
        const deliveryValues = extractBatchScopedFieldValues(
          userInput,
          aliases,
          expectedType === 'date' ? 'date' : 'string'
        );
        if (deliveryValues && deliveryValues.length > 0) {
          return deliveryValues;
        }
      }
    }
    if (hasAliasKeyword(aliases, ['应付金额', '付款金额'])) {
      return extractPaymentAmounts(userInput);
    }
    if (hasAliasKeyword(aliases, ['付款阶段', '阶段标识'])) {
      return extractPaymentStages(userInput);
    }
    if (hasAliasKeyword(aliases, ['付款前置条件', '付款条件', '支付条件'])) {
      return extractPaymentConditions(userInput);
    }
    if (hasAliasKeyword(aliases, ['付款比例', '支付比例', '比例'])) {
      return extractPaymentRatios(userInput);
    }
    if (isPaymentArrayField) {
      return undefined;
    }

    const expectedType = resolveExpectedValueType(key, schema.type, schema);
    if (expectedType === 'date') {
      return extractAllLabeledValues(userInput, aliases, 'date');
    }
    if (expectedType === 'number') {
      return extractAllLabeledValues(userInput, aliases, 'number');
    }
    if (hasAliasKeyword(aliases, ['验收方式', '验收类型'])) {
      const explicitAcceptanceValues = extractAllLabeledValues(userInput, aliases, 'string');
      if (Array.isArray(explicitAcceptanceValues) && explicitAcceptanceValues.length > 0) {
        return explicitAcceptanceValues;
      }
      const normalizedAcceptance = extractAcceptanceTypeValue(userInput);
      if (normalizedAcceptance) {
        return [normalizedAcceptance];
      }
    }
    const explicitValues = extractAllLabeledValues(userInput, aliases, 'string');
    if (Array.isArray(explicitValues) && explicitValues.length > 0) {
      return explicitValues;
    }

    return undefined;
  }

  const expectedType = resolveExpectedValueType(key, schema.type, schema);
  if (isBooleanLikeField(aliases)) {
    const booleanValue = extractBooleanLikeValue(userInput, aliases);
    if (booleanValue !== undefined) {
      return booleanValue;
    }
  }

  if (
    hasAliasKeyword(aliases, [
      'query',
      'keyword',
      'keywords',
      'search',
      'searchterm',
      'querytext',
      'searchquery',
      '搜索',
      '检索',
      '查询',
      '关键词',
    ])
  ) {
    const searchMatch = userInput.match(/(?:检索|搜索|查找|查询|搜|找)\s*(.+)/i);
    if (searchMatch?.[1]?.trim()) {
      return searchMatch[1].trim();
    }
  }

  if (
    hasAliasKeyword(aliases, [
      'url',
      'start_url',
      'starturl',
      'start-url',
      'target_url',
      'targeturl',
      'page_url',
      'pageurl',
      'link',
      'link_url',
      'address',
      'web_url',
      'website',
      '网址',
      '链接',
      '页面地址',
      '目标地址',
      '网站',
    ])
  ) {
    const urlCandidate = extractUrlFromInput(userInput);
    if (urlCandidate) {
      return urlCandidate;
    }
  }

  if (expectedType === 'number') {
    const explicitNumber = extractFirstLabeledValue(userInput, aliases, 'number');
    if (explicitNumber !== undefined) {
      return explicitNumber;
    }
  }

  if (expectedType === 'date') {
    return extractFirstLabeledValue(userInput, aliases, 'date');
  }
  if (expectedType === 'string' && shouldSkipBroadScalarAliasExtraction(aliases)) {
    return undefined;
  }

  return extractFirstLabeledValue(userInput, aliases, 'string');
}

export function isDeliveryScopedArrayField(
  key: string,
  schema: ParamSchemaProperty,
  aliases: string[]
): boolean {
  if (key.startsWith('deliveryItems[]')) {
    return true;
  }

  const semanticRole = normalizeSemanticRole(schema.semanticRole);
  if (
    semanticRole &&
    [
      'delivery_batch',
      'delivery_location',
      'acceptance_type',
      'arrival_date',
      'installation_date',
    ].includes(semanticRole)
  ) {
    return true;
  }

  return (
    hasAliasKeyword(aliases, ['批次', '地点', '地址', '验收方式', '验收类型']) ||
    hasDateLikeAlias(aliases)
  );
}

export function isEnumeratedLineItemArrayField(
  key: string,
  schema: ParamSchemaProperty,
  aliases: string[]
): boolean {
  const signalText = buildSignalText(key, schema);
  const hasLineItemContext =
    /(item|line|row|detail|material|product|sku|物料|设备|明细|标的|清单)/i.test(signalText);
  const hasLineItemFieldAlias = hasAliasKeyword(aliases, [
    '行号',
    '序号',
    '名称',
    '编码',
    '型号',
    '规格',
    '单位',
    '数量',
    '单价',
    '金额',
    '小计',
  ]);

  return hasLineItemContext && hasLineItemFieldAlias;
}

export function isPaymentClauseArrayField(
  key: string,
  schema: ParamSchemaProperty,
  aliases: string[]
): boolean {
  if (key.startsWith('paymentSchedule[]')) {
    return true;
  }

  const signalText = buildSignalText(key, schema);
  if (/(付款|支付|payment)/i.test(signalText)) {
    return true;
  }

  return aliases.some((alias) => /(付款|支付)/.test(alias));
}

export function hasDateLikeAlias(aliases: string[]): boolean {
  return aliases.some((alias) => /日期|date/i.test(alias));
}

export function buildSignalText(key: string, schema?: ParamSchemaProperty): string {
  return [
    key,
    schema?.displayName,
    schema?.description,
    schema?.extractionPrompt,
    ...(Array.isArray(schema?.extractionHints) ? schema!.extractionHints : []),
  ]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .join(' ');
}

export function buildFieldAliases(key: string, schema?: ParamSchemaProperty): string[] {
  const candidates = new Set<string>();
  const sources = [
    schema?.displayName,
    schema?.description,
    schema?.extractionPrompt,
    ...(Array.isArray(schema?.extractionHints) ? schema!.extractionHints : []),
    extractKeyLeafLabel(key),
  ];

  for (const source of sources) {
    if (typeof source !== 'string' || !source.trim()) {
      continue;
    }
    collectAliasVariants(candidates, source);
    const firstClause = source.split(/[，,；;。]/)[0]?.trim();
    if (firstClause && firstClause !== source.trim()) {
      collectAliasVariants(candidates, firstClause);
    }
  }

  return [...candidates]
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .sort((left, right) => right.length - left.length);
}

export function collectAliasVariants(aliases: Set<string>, raw: string): void {
  const value = raw.trim();
  if (!value) {
    return;
  }

  const variants = new Set<string>([
    value,
    value.replace(/\s+/g, ''),
    value.replace(/[（(][^()（）]+[）)]/g, '').trim(),
    value.replace(/^是否/, '').trim(),
    value.replace(/^是否(?:包含|需要|支持|有)/, '').trim(),
    value.replace(/唯一标识/g, '').trim(),
    value.replace(/期限月数/g, '期').trim(),
  ]);

  const parentheticalMatches = [...value.matchAll(/[（(]([^()（）]+)[）)]/g)];
  for (const match of parentheticalMatches) {
    if (match[1]) {
      variants.add(match[1].trim());
    }
  }

  for (const variant of variants) {
    const normalized = variant.trim();
    if (!normalized || normalized.length < 2) {
      continue;
    }
    aliases.add(normalized);
    addMeaningfulSuffixAliases(aliases, normalized);
  }
}

export function addMeaningfulSuffixAliases(aliases: Set<string>, value: string): void {
  const exactSuffixes = ['小计', '小计金额', '规格型号'];
  const standaloneHeadBlacklist = new Set(['名称', '日期', '期']);
  for (const suffix of exactSuffixes) {
    if (value.length > suffix.length && value.endsWith(suffix)) {
      aliases.add(suffix);
    }
  }

  const suffixHeads = [
    '名称',
    '编号',
    '币种',
    '期限',
    '期',
    '行号',
    '序号',
    '编码',
    '型号',
    '单位',
    '数量',
    '单价',
    '金额',
    '批次',
    '地点',
    '地址',
    '日期',
    '方式',
    '类型',
    '条件',
    '比例',
    '阶段',
    '范围',
    '标的',
    '条款',
    '约定',
  ];
  for (const head of suffixHeads) {
    const match = value.match(new RegExp(`([\\u4e00-\\u9fff]{0,6}${head})$`));
    if (match?.[1]) {
      if (!standaloneHeadBlacklist.has(head)) {
        aliases.add(head);
      }
      if (match[1] !== value) {
        aliases.add(match[1]);
      }

      const prefix = value
        .slice(0, -head.length)
        .replace(/[的之]/g, '')
        .trim();
      if (prefix.length >= 2) {
        const shortPrefix = prefix.slice(-Math.min(2, prefix.length));
        if (shortPrefix.length >= 2) {
          aliases.add(`${shortPrefix}${head}`);
        }
        if (head === '名称') {
          aliases.add(shortPrefix);
        }
      }
    }
  }
  if (value.includes('小计')) {
    aliases.add('小计');
  }
}

export function extractKeyLeafLabel(key: string): string | undefined {
  const leaf = key.split('.').pop()?.replace(/\[\]/g, '').trim();
  if (!leaf) {
    return undefined;
  }
  return leaf.replace(/_/g, ' ');
}

export function hasAliasKeyword(aliases: string[], keywords: string[]): boolean {
  return aliases.some((alias) => keywords.some((keyword) => alias.includes(keyword)));
}

export function hasExactAliasKeyword(aliases: string[], keywords: string[]): boolean {
  return aliases.some((alias) => {
    const normalized = alias.trim();
    return keywords.some((keyword) => normalized === keyword || normalized.endsWith(keyword));
  });
}

export function isBooleanLikeField(aliases: string[]): boolean {
  return aliases.some((alias) => /^是否/.test(alias) || /(true|false|yes|no)/i.test(alias));
}

export function extractBooleanLikeValue(input: string, aliases: string[]): '是' | '否' | undefined {
  const sortedAliases = [...aliases].sort((left, right) => right.length - left.length);
  for (const alias of sortedAliases) {
    const explicitPattern = new RegExp(
      `${escapeRegExp(alias)}\\s*(?:为|是|[:：=])\\s*(是|否|true|false|yes|no|有|无|包含|不包含|需要|不需要)`,
      'i'
    );
    const explicitMatch = input.match(explicitPattern);
    if (explicitMatch?.[1]) {
      return normalizeBooleanLikeValue(explicitMatch[1]);
    }

    const coreAlias = alias
      .replace(/^是否(?:包含|需要|支持|有)?/, '')
      .replace(/^是否/, '')
      .trim();
    if (!coreAlias || coreAlias.length < 2) {
      continue;
    }

    if (
      new RegExp(`(?:不含|不包含|无需|无|不需要).{0,4}${escapeRegExp(coreAlias)}`).test(
        input
      )
    ) {
      return '否';
    }
    if (new RegExp(`(?:含|包含|有|需要).{0,4}${escapeRegExp(coreAlias)}`).test(input)) {
      return '是';
    }
  }

  return undefined;
}

export function normalizeBooleanLikeValue(value: string): '是' | '否' | undefined {
  const normalized = value.trim().toLowerCase();
  if (['是', 'true', 'yes', '有', '包含', '需要'].includes(normalized)) {
    return '是';
  }
  if (['否', 'false', 'no', '无', '不包含', '不需要'].includes(normalized)) {
    return '否';
  }
  return undefined;
}

export function shouldSkipBroadScalarAliasExtraction(aliases: string[]): boolean {
  const meaningfulAliases = aliases.filter((alias) => /[\u4e00-\u9fff]/.test(alias));
  if (meaningfulAliases.some((alias) => alias.length >= 4)) {
    return false;
  }
  return meaningfulAliases.every((alias) => ['备注', '说明', '内容', '信息'].includes(alias));
}

export function extractFirstLabeledValue(
  input: string,
  labels: string[],
  valueType: 'string' | 'number' | 'date'
): string | number | undefined {
  const values = extractAllLabeledValues(input, labels, valueType);
  return Array.isArray(values) && values.length > 0 ? values[0] : undefined;
}

export function extractAllLabeledValues(
  input: string,
  labels: string[],
  valueType: 'string' | 'number' | 'date'
): Array<string | number> | undefined {
  const matches: Array<{ index: number; end: number; value: string | number }> = [];
  const occupiedRanges: Array<{ start: number; end: number }> = [];
  const sortedLabels = [...labels].sort((left, right) => right.length - left.length);
  for (const label of sortedLabels) {
    const pattern = new RegExp(
      `${escapeRegExp(label)}\\s*(?:为|是|[:：=])?\\s*([^，。；;\\n]+)`,
      'gi'
    );
    for (const match of input.matchAll(pattern)) {
      const normalized = normalizeExtractedMatch(match[1], valueType);
      const start = match.index ?? -1;
      if (normalized !== undefined && start >= 0) {
        const end = start + match[0].length;
        const overlapped = occupiedRanges.some((range) => start < range.end && end > range.start);
        if (!overlapped) {
          matches.push({ index: start, end, value: normalized });
          occupiedRanges.push({ start, end });
        }
      }
    }
  }
  if (matches.length === 0) {
    return undefined;
  }
  return matches.sort((left, right) => left.index - right.index).map((item) => item.value);
}

export function normalizeExtractedMatch(
  value: string | undefined,
  valueType: 'string' | 'number' | 'date'
): string | number | undefined {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return undefined;
  }
  if (valueType === 'number') {
    const numberMatch = trimmed.match(/-?\d+(?:\.\d+)?/);
    return numberMatch?.[0] ? Number(numberMatch[0]) : undefined;
  }
  if (valueType === 'date') {
    return normalizeDateValue(trimmed);
  }
  return trimmed.replace(/^(?:为|是)\s*/, '').trim();
}

export function extractAllMatches(
  input: string,
  pattern: RegExp,
  valueType: 'string' | 'number' | 'date' = 'string'
): Array<string | number> {
  const values: Array<string | number> = [];
  for (const match of input.matchAll(pattern)) {
    const candidate = match[1] || match[0];
    const normalized = normalizeExtractedMatch(candidate, valueType);
    if (normalized !== undefined) {
      values.push(normalized);
    }
  }
  return values;
}

export function extractDateValuesByAliases(input: string, aliases: string[]): string[] | undefined {
  const dateAliases = aliases
    .filter((alias) => /日期|date/i.test(alias))
    .sort((left, right) => right.length - left.length);
  if (dateAliases.length === 0) {
    return undefined;
  }

  const alternation = dateAliases.map((alias) => escapeRegExp(alias)).join('|');
  const pattern = new RegExp(
    `(?:${alternation})\\s*(?:为|是|[:：=])?\\s*(\\d{4}[/-]\\d{1,2}[/-]\\d{1,2}|\\d{4}年\\d{1,2}月\\d{1,2}日?)`,
    'g'
  );
  const values = extractAllMatches(input, pattern, 'date') as string[];
  return values.length > 0 ? values : undefined;
}

export function extractItemSequenceNumbers(input: string): number[] | undefined {
  const values = extractAllMatches(input, /(?:^|[：:；;\n])\s*(\d+)\s*[.、]/gm, 'number');
  return values.length > 0 ? (values as number[]) : undefined;
}

export function extractEnumeratedItemNames(input: string): string[] | undefined {
  const names = extractAllMatches(
    input,
    /(?:^|[：:；;\n])\s*\d+\s*[.、]\s*([^，。；;\n]+)/gm,
    'string'
  );
  return names.length > 0 ? (names as string[]) : undefined;
}

export function extractEnumeratedItemFieldValues(
  input: string,
  labels: string[],
  valueType: 'string' | 'number' | 'date'
): Array<string | number> | undefined {
  const blocks = extractEnumeratedItemBlocks(input);
  if (blocks.length === 0) {
    return undefined;
  }

  const values = blocks
    .map((block) => extractFirstLabeledValue(block, labels, valueType))
    .filter((item): item is string | number => item !== undefined);

  return values.length > 0 ? values : undefined;
}

export function extractEnumeratedItemBlocks(input: string): string[] {
  const pattern =
    /(?:^|[：:；;\n])\s*\d+\s*[.、]\s*([\s\S]*?)(?=(?:^|[：:；;\n])\s*\d+\s*[.、]\s*|$)/gm;
  const blocks: string[] = [];
  for (const match of input.matchAll(pattern)) {
    const content = String(match[1] || '').trim();
    if (content) {
      blocks.push(content);
    }
  }
  return blocks;
}

export function extractBatchScopedFieldValues(
  input: string,
  labels: string[],
  valueType: 'string' | 'number' | 'date'
): Array<string | number> | undefined {
  const blocks = extractBatchBlocks(input);
  if (blocks.length === 0) {
    return undefined;
  }

  const values = blocks
    .map((block) => extractFirstLabeledValue(block, labels, valueType))
    .filter((item): item is string | number => item !== undefined);

  return values.length > 0 ? values : undefined;
}

export function extractBatchBlocks(input: string): string[] {
  const pattern =
    /(首批|第[一二三四五六七八九十百千万0-9]+批)[\s\S]*?(?=(首批|第[一二三四五六七八九十百千万0-9]+批)|$)/g;
  const blocks: string[] = [];
  for (const match of input.matchAll(pattern)) {
    const content = String(match[0] || '').trim();
    if (content) {
      blocks.push(content);
    }
  }
  return blocks;
}

export function extractBatchValues(input: string): string[] | undefined {
  const values = extractAllMatches(
    input,
    /(首批|第[一二三四五六七八九十百千万0-9]+批)(?=在|，计划到货日期|，安装完成日期|，验收方式)/g,
    'string'
  ) as string[];
  return values.length > 0 ? values : undefined;
}

export function extractDeliveryLocations(input: string): string[] {
  return extractAllMatches(
    input,
    /(?:首批|第[一二三四五六七八九十百千万0-9]+批)[^，。；;\n]*?在\s*([^，。；;\n]+?)(?=，(?:计划到货日期|安装完成日期|验收方式)|；|\n|。)/g,
    'string'
  ) as string[];
}

export function extractPaymentConditions(input: string): string[] | undefined {
  return extractPaymentClauseValues(input, (clause, stage) => {
    const normalizedClause = clause.startsWith(stage)
      ? clause.slice(stage.length).trim()
      : clause;
    const match = normalizedClause.match(/^([^，。；;\n]+?)\s*支付\s*\d+(?:\.\d+)?%/);
    return match?.[1]?.trim();
  });
}

export function extractPaymentStages(input: string): string[] | undefined {
  const clauses = extractPaymentClauses(input);
  const values = clauses.map((item) => item.stage);
  return values.length > 0 ? values : undefined;
}

export function extractPaymentRatios(input: string): number[] | undefined {
  return extractPaymentClauseValues(input, (clause) => {
    const match = clause.match(/支付\s*(\d+(?:\.\d+)?)%/);
    return match?.[1] ? Number(match[1]) : undefined;
  });
}

export function extractPaymentAmounts(input: string): number[] | undefined {
  return extractPaymentClauseValues(input, (clause) => {
    const match = clause.match(/金额\s*(\d+(?:\.\d+)?)/);
    return match?.[1] ? Number(match[1]) : undefined;
  });
}

export function extractPaymentClauseValues<T extends string | number>(
  input: string,
  mapper: (clause: string, stage: string) => T | undefined
): T[] | undefined {
  const clauses = extractPaymentClauses(input);
  const values = clauses
    .map((item) => mapper(item.clause, item.stage))
    .filter((item): item is T => item !== undefined);
  return values.length > 0 ? values : undefined;
}

export function extractPaymentClauses(input: string): Array<{ stage: string; clause: string }> {
  const pattern =
    /(?:^|[：:；;\n])\s*([^，。；;\n]{2,20})[，,]([^；;\n。]*?(?:支付\s*\d+(?:\.\d+)?%|金额\s*\d+(?:\.\d+)?)[^；;\n。]*)/g;
  const clauses: Array<{ stage: string; clause: string }> = [];
  for (const match of input.matchAll(pattern)) {
    const stage = match[1]?.trim();
    const clause = `${stage || ''}${match[2] || ''}`.trim();
    if (stage && clause) {
      clauses.push({ stage, clause });
    }
  }
  return clauses;
}

export function extractBatchValue(input: string): string | undefined {
  const match = input.match(/(首批|第[一二三四五六七八九十百千0-9]+批)/);
  return match?.[1];
}

export function extractLocationValue(input: string): string | undefined {
  const patterns = [
    /(?:交付地点|交货地点|收货地址|交付地址|到货地点|送达地点|城市名称|查询城市|城市)[为是:：]?\s*([^，。；\n]+)/,
    /(?:地点为|地址为|城市为)[：: ]?\s*([^，。；\n]+)/,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  const cityMatch = input.match(
    /(?:上海|北京|广州|深圳|成都|武汉|南京|杭州|西安|重庆|天津|苏州|无锡|宁波|青岛|大连|厦门|福州|长沙|郑州|沈阳|哈尔滨|长春|济南|合肥|南昌|昆明|贵阳|海口|拉萨|乌鲁木齐|银川|西宁|呼和浩特|兰州|香港|澳门|台北|三亚|桂林|扬州|徐州|常州|南通|绍兴|嘉兴|金华|台州|温州|佛山|东莞|中山|珠海|惠州|江门|汕头|湛江|肇庆|清远|韶关|河源|梅州|潮州|揭阳|云浮)/
  );
  if (cityMatch?.[0]) {
    return cityMatch[0];
  }

  const suffixMatch = input.match(/[\u4e00-\u9fa5]{2,8}(?:省|市|区|县)/);
  if (suffixMatch?.[0]) {
    return suffixMatch[0];
  }

  const trimmed = input.trim();
  if (trimmed.length >= 2 && trimmed.length <= 20 && /^[\u4e00-\u9fa5]+$/.test(trimmed)) {
    return trimmed;
  }

  return undefined;
}

export function extractAcceptanceTypeValue(input: string): string | undefined {
  const normalized = input.replace(/\s+/g, '');
  const hasArrivalAcceptance = /(到货|交付|收货).{0,12}验收/.test(normalized);
  const hasInstallationAcceptance = /(安装|调试|联调).{0,12}验收/.test(normalized);

  if (hasArrivalAcceptance && hasInstallationAcceptance) {
    return '到货+安装验收';
  }
  if (hasArrivalAcceptance) {
    return '到货验收';
  }
  if (hasInstallationAcceptance) {
    return '安装验收';
  }

  const explicit = input.match(/(?:验收方式|验收类型)[为是:：]?\s*([^，。；\n]+)/);
  return explicit?.[1]?.trim();
}

export function extractDateByKeywords(input: string, keywords: string[]): string | undefined {
  const dateRegex = /\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日?/g;
  for (const match of input.matchAll(dateRegex)) {
    const rawDate = match[0];
    const index = match.index ?? 0;
    const clauseText = extractDateClause(input, index, rawDate.length);
    if (keywords.some((keyword) => clauseText.includes(keyword))) {
      return normalizeDateValue(rawDate);
    }
  }
  return undefined;
}

export function extractDateClause(input: string, index: number, length: number): string {
  const delimiters = /[，,。；;\n]/;
  let start = index;
  while (start > 0) {
    const prevChar = input[start - 1];
    if (!prevChar || delimiters.test(prevChar)) {
      break;
    }
    start -= 1;
  }

  let end = index + length;
  while (end < input.length) {
    const nextChar = input[end];
    if (!nextChar || delimiters.test(nextChar)) {
      break;
    }
    end += 1;
  }

  return input.slice(start, end);
}

export function normalizeDateValue(value: string): string | undefined {
  const normalized = value.trim();
  const isoMatch = normalized.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    if (year && month && day) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  const zhMatch = normalized.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/);
  if (zhMatch) {
    const [, year, month, day] = zhMatch;
    if (year && month && day) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  return undefined;
}

export function markRequiredFields(
  properties: Record<string, ParamSchemaProperty>,
  requiredFields?: string[]
): Record<string, ParamSchemaProperty> {
  const requiredSet = new Set(requiredFields || []);
  return Object.entries(properties).reduce<Record<string, ParamSchemaProperty>>(
    (acc, [name, schema]) => {
      acc[name] = {
        ...schema,
        required: schema.required === true || requiredSet.has(name),
      };
      return acc;
    },
    {}
  );
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Batch parameter recognition for multiple inputs
 */
