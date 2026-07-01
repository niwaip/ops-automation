const ACTION_PROFILE_TYPE = 'action_target';

type ActionProfileDraftSource = {
  sampleText?: string | null;
  errorMessage?: string | null;
  observationSummary?: string | null;
  normalizedSemantic?: unknown;
  parserOutput?: unknown;
};

const ACTION_INTENT_CANDIDATES = ['点击', '单击', '选择', '打开', '进入', 'click', 'select', 'open'] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function collectSourceTexts(sources: ActionProfileDraftSource[]): string[] {
  return sources
    .flatMap((source) => [source.sampleText, source.errorMessage, source.observationSummary])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function getActionMetadata(source: ActionProfileDraftSource): Record<string, unknown> | null {
  const normalizedSemantic = asRecord(source.normalizedSemantic);
  const parserOutput = asRecord(source.parserOutput);
  const normalizedAction = asRecord(asRecord(normalizedSemantic?.parser_metadata)?.action);
  const parserAction = asRecord(asRecord(parserOutput?.metadata)?.action);
  return normalizedAction || parserAction;
}

function sanitizeTerm(value: string): string {
  return value
    .trim()
    .replace(/^[“"'`]+|[”"'`]+$/g, '')
    .replace(/\s+/g, ' ');
}

function inferLocaleHints(sourceTexts: string[]): string[] {
  const joined = sourceTexts.join(' ');
  const hints: string[] = [];

  if (/[\u4e00-\u9fff]/.test(joined)) {
    hints.push('zh-CN');
  }
  if (/[a-z]/i.test(joined)) {
    hints.push('en-US');
  }

  return hints;
}

function inferSemanticHintFromActionTerm(
  actionTerms: string[]
): 'detail' | 'approve' | 'reject' | 'menu' | 'edit' | 'delete' | 'open' | undefined {
  const normalizedTerms = actionTerms.map((term) => normalizeText(term));
  if (normalizedTerms.some((term) => term === 'menu')) {
    return 'menu';
  }
  if (normalizedTerms.some((term) => term === 'approve')) {
    return 'approve';
  }
  if (normalizedTerms.some((term) => term === 'reject')) {
    return 'reject';
  }
  if (normalizedTerms.some((term) => term === 'edit')) {
    return 'edit';
  }
  if (normalizedTerms.some((term) => term === 'delete')) {
    return 'delete';
  }
  if (normalizedTerms.some((term) => term === 'open')) {
    return 'open';
  }
  if (normalizedTerms.some((term) => term === 'detail' || term === '详情')) {
    return 'detail';
  }

  return undefined;
}

export function buildActionProfileDraftOutputs(input: {
  sources: ActionProfileDraftSource[];
}): Record<string, unknown> | null {
  const sourceTexts = collectSourceTexts(input.sources);
  const metadataEntries = input.sources
    .map((source) => ({ metadata: getActionMetadata(source) }))
    .filter((item): item is { metadata: Record<string, unknown> } => Boolean(item.metadata));

  const targetTerms = unique(
    metadataEntries
      .map((item) => item.metadata.resolvedTarget)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map(sanitizeTerm)
  );
  const actionTerms = unique(
    metadataEntries
      .map((item) => item.metadata.resolvedActionTerm)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map(sanitizeTerm)
  );
  const regionTerms = unique(
    metadataEntries
      .map((item) => item.metadata.resolvedRegion)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map(sanitizeTerm)
  );
  const roleHints = unique(
    metadataEntries
      .map((item) => item.metadata.resolvedRoleHint)
      .filter(
        (value): value is 'button' | 'link' | 'tab' | 'menuitem' =>
          value === 'button' || value === 'link' || value === 'tab' || value === 'menuitem'
      )
  );

  const parserSemanticHint = metadataEntries
    .map((item) => item.metadata.semanticHint)
    .find(
      (value): value is 'submit' | 'open' | 'enter' | 'confirm' | 'back' =>
        value === 'submit' || value === 'open' || value === 'enter' || value === 'confirm' || value === 'back'
    );
  const semanticHint =
    inferSemanticHintFromActionTerm(actionTerms) ||
    (parserSemanticHint === 'confirm'
      ? 'approve'
      : parserSemanticHint === 'open'
        ? 'detail'
        : parserSemanticHint);
  const categoryHint = metadataEntries
    .map((item) => item.metadata.categoryHint)
    .find(
      (value): value is 'DETAIL_OPEN' | 'ROW_ACTION' | 'MENU_SELECTION' =>
        value === 'DETAIL_OPEN' || value === 'ROW_ACTION' || value === 'MENU_SELECTION'
    );

  const intentTerms = ACTION_INTENT_CANDIDATES.filter((candidate) =>
    sourceTexts.some((text) => normalizeText(text).includes(normalizeText(candidate)))
  );
  const localeHints = inferLocaleHints(sourceTexts);

  if (targetTerms.length === 0 || (!semanticHint && actionTerms.length === 0)) {
    return null;
  }

  const outputs: Record<string, unknown> = {
    profile_type: ACTION_PROFILE_TYPE,
    target_terms: targetTerms,
  };

  if (actionTerms.length) {
    outputs.action_terms = actionTerms;
  }
  if (regionTerms.length) {
    outputs.region_terms = regionTerms;
  }
  if (roleHints.length) {
    outputs.role_hints = roleHints;
  }
  if (semanticHint) {
    outputs.semantic_hint = semanticHint;
  }
  if (categoryHint) {
    outputs.category_hint = categoryHint;
  }
  if (intentTerms.length) {
    outputs.intent_terms = intentTerms;
  }
  if (localeHints.length) {
    outputs.locale_hints = localeHints;
  }

  return outputs;
}
