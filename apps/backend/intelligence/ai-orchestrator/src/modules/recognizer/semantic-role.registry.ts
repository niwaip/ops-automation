type SemanticRoleExtractorContext = {
  extractBatchValue: (input: string) => string | undefined;
  extractLocationValue: (input: string) => string | undefined;
  extractAcceptanceTypeValue: (input: string) => string | undefined;
  extractDateByKeywords: (input: string, keywords: string[]) => string | undefined;
};

type SemanticRoleExtractor = (
  input: string,
  context: SemanticRoleExtractorContext,
  definition: SemanticRoleDefinition
) => string | undefined;

type BuiltInExtractorKind =
  | 'delivery_batch'
  | 'delivery_location'
  | 'acceptance_type'
  | 'date_by_keywords';

type SemanticRoleDefinition = {
  role: string;
  aliases: string[];
  extractor: {
    kind: BuiltInExtractorKind;
    keywords?: string[];
  };
  hintKeywords?: string[];
};

const SEMANTIC_ROLE_DEFINITIONS: SemanticRoleDefinition[] = [
  {
    role: 'delivery_batch',
    aliases: ['batch', 'delivery_batch'],
    extractor: { kind: 'delivery_batch' },
    hintKeywords: ['batch', '批次', '交付批次'],
  },
  {
    role: 'delivery_location',
    aliases: ['location', 'delivery_location', 'address'],
    extractor: { kind: 'delivery_location' },
    hintKeywords: ['location', 'address', 'place', '地点', '地址', '收货'],
  },
  {
    role: 'acceptance_type',
    aliases: ['acceptance_type', 'acceptance_mode'],
    extractor: { kind: 'acceptance_type' },
    hintKeywords: [
      'acceptancetype',
      'acceptance type',
      '验收方式',
      '验收类型',
      '到货验收',
      '安装验收',
    ],
  },
  {
    role: 'arrival_date',
    aliases: ['arrival_date', 'delivery_date'],
    extractor: { kind: 'date_by_keywords', keywords: ['到货', '交付', '送达', '收货'] },
    hintKeywords: [
      'arrivaldate',
      'arrival date',
      'delivery date',
      '交付日期',
      '到货日期',
      '计划到货日期',
      '计划交付日期',
    ],
  },
  {
    role: 'installation_date',
    aliases: ['installation_date', 'install_date'],
    extractor: { kind: 'date_by_keywords', keywords: ['安装', '调试', '联调', '上线'] },
    hintKeywords: ['installationdate', 'installation date', '安装日期', '安装完成', '调试完成'],
  },
];

const SEMANTIC_ROLE_ALIASES = SEMANTIC_ROLE_DEFINITIONS.reduce<Record<string, string>>(
  (acc, definition) => {
    definition.aliases.forEach((alias) => {
      acc[alias] = definition.role;
    });
    return acc;
  },
  {}
);

const BUILTIN_SEMANTIC_EXTRACTORS: Record<BuiltInExtractorKind, SemanticRoleExtractor> = {
  delivery_batch: (input, context) => context.extractBatchValue(input),
  delivery_location: (input, context) => context.extractLocationValue(input),
  acceptance_type: (input, context) => context.extractAcceptanceTypeValue(input),
  date_by_keywords: (input, context, definition) =>
    context.extractDateByKeywords(input, definition.extractor.keywords || []),
};

const normalizeSemanticToken = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const normalizeHintText = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ');

const findSemanticRoleDefinition = (role: unknown): SemanticRoleDefinition | undefined => {
  const normalizedRole = normalizeSemanticToken(role);
  if (!normalizedRole) {
    return undefined;
  }
  const canonicalRole = SEMANTIC_ROLE_ALIASES[normalizedRole] || normalizedRole;
  return SEMANTIC_ROLE_DEFINITIONS.find((definition) => definition.role === canonicalRole);
};

const inferSemanticRoleDefinitionFromHints = (
  hintText: unknown
): SemanticRoleDefinition | undefined => {
  const normalizedHint = normalizeHintText(hintText);
  if (!normalizedHint) {
    return undefined;
  }

  return SEMANTIC_ROLE_DEFINITIONS.find((definition) =>
    (definition.hintKeywords || []).some((keyword) =>
      normalizedHint.includes(keyword.toLowerCase())
    )
  );
};

export const normalizeSemanticRole = (role: unknown): string | undefined => {
  return findSemanticRoleDefinition(role)?.role || normalizeSemanticToken(role) || undefined;
};

export const inferValueBySemanticRole = (
  role: unknown,
  input: string,
  context: SemanticRoleExtractorContext
): string | undefined => {
  const definition = findSemanticRoleDefinition(role);
  if (!definition) {
    return undefined;
  }
  const extractor = BUILTIN_SEMANTIC_EXTRACTORS[definition.extractor.kind];
  return extractor ? extractor(input, context, definition) : undefined;
};

export const inferValueBySemanticSignal = (input: {
  role?: unknown;
  hintText?: unknown;
  userInput: string;
  context: SemanticRoleExtractorContext;
}): string | undefined => {
  const definition =
    findSemanticRoleDefinition(input.role) || inferSemanticRoleDefinitionFromHints(input.hintText);
  if (!definition) {
    return undefined;
  }
  const extractor = BUILTIN_SEMANTIC_EXTRACTORS[definition.extractor.kind];
  return extractor ? extractor(input.userInput, input.context, definition) : undefined;
};
