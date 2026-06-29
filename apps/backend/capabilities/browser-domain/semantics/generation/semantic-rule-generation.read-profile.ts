const READ_PROFILE_TYPE = 'read_target';

type ReadProfileDraftSource = {
  sampleText?: string | null;
  errorMessage?: string | null;
  observationSummary?: string | null;
  normalizedSemantic?: unknown;
  parserOutput?: unknown;
};

const READ_INTENT_CANDIDATES = ['读取', '获取', '查看', '提取', 'read', 'get', 'extract'] as const;

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

function collectSourceTexts(sources: ReadProfileDraftSource[]): string[] {
  return sources
    .flatMap((source) => [source.sampleText, source.errorMessage, source.observationSummary])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function getReadMetadata(source: ReadProfileDraftSource): Record<string, unknown> | null {
  const normalizedSemantic = asRecord(source.normalizedSemantic);
  const parserOutput = asRecord(source.parserOutput);
  const normalizedRead = asRecord(asRecord(normalizedSemantic?.parser_metadata)?.read);
  const parserRead = asRecord(asRecord(parserOutput?.metadata)?.read);
  return normalizedRead || parserRead;
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

export function buildReadProfileDraftOutputs(input: {
  sources: ReadProfileDraftSource[];
}): Record<string, unknown> | null {
  const sourceTexts = collectSourceTexts(input.sources);
  const metadataEntries = input.sources
    .map((source) => ({
      metadata: getReadMetadata(source),
    }))
    .filter((item): item is { metadata: Record<string, unknown> } => Boolean(item.metadata));

  const targetTerms = unique(
    metadataEntries
      .map((item) => item.metadata.resolvedTarget)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map(sanitizeTerm)
  );
  const fieldTerms = unique(
    metadataEntries
      .map((item) => item.metadata.resolvedField)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map(sanitizeTerm)
  );
  const regionTerms = unique(
    metadataEntries
      .map((item) => item.metadata.resolvedRegion)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map(sanitizeTerm)
  );

  const intentTerms = READ_INTENT_CANDIDATES.filter((candidate) =>
    sourceTexts.some((text) => normalizeText(text).includes(normalizeText(candidate)))
  );
  const localeHints = inferLocaleHints(sourceTexts);

  if (targetTerms.length === 0 || (fieldTerms.length === 0 && regionTerms.length === 0)) {
    return null;
  }

  const outputs: Record<string, unknown> = {
    profile_type: READ_PROFILE_TYPE,
    target_terms: targetTerms,
  };

  if (fieldTerms.length) {
    outputs.field_terms = fieldTerms;
  }
  if (regionTerms.length) {
    outputs.region_terms = regionTerms;
  }
  if (intentTerms.length) {
    outputs.intent_terms = intentTerms;
  }
  if (localeHints.length) {
    outputs.locale_hints = localeHints;
  }

  return outputs;
}
