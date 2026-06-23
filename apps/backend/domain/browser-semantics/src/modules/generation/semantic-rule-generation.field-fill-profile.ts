const FIELD_FILL_PROFILE_TYPE = 'field_fill_terms';

type FieldFillProfileDraftSource = {
  sampleText: string;
  normalizedSemantic?: unknown;
  parserOutput?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeTerm(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function buildFieldFillProfileDraftOutputs(input: {
  sources: FieldFillProfileDraftSource[];
}): Record<string, unknown> | null {
  const fieldTerms = new Set<string>();
  const regionTerms = new Set<string>();
  const valueHints = new Set<string>();
  const intentTerms = new Set<string>();
  let canonicalField: string | undefined;

  for (const source of input.sources) {
    const normalizedSemantic = asRecord(source.normalizedSemantic);
    const parserOutput = asRecord(source.parserOutput);
    const normalizedFieldFill = asRecord(asRecord(normalizedSemantic?.parser_metadata)?.fieldFill);
    const parserFieldFill = asRecord(asRecord(parserOutput?.metadata)?.fieldFill);
    const fieldFill = normalizedFieldFill || parserFieldFill;

    if (!fieldFill) {
      continue;
    }

    if (typeof fieldFill.resolvedField === 'string' && fieldFill.resolvedField.trim()) {
      fieldTerms.add(normalizeTerm(fieldFill.resolvedField));
    }
    if (
      typeof fieldFill.resolvedCanonicalField === 'string' &&
      fieldFill.resolvedCanonicalField.trim()
    ) {
      canonicalField = normalizeTerm(fieldFill.resolvedCanonicalField);
    }
    if (typeof fieldFill.resolvedRegion === 'string' && fieldFill.resolvedRegion.trim()) {
      regionTerms.add(normalizeTerm(fieldFill.resolvedRegion));
    }
    if (typeof fieldFill.value === 'string' && fieldFill.value.trim()) {
      valueHints.add(normalizeTerm(fieldFill.value));
    }
  }

  if (fieldTerms.size === 0 && canonicalField) {
    fieldTerms.add(canonicalField);
  }

  intentTerms.add('填写');

  return {
    profile_type: FIELD_FILL_PROFILE_TYPE,
    field_terms: Array.from(fieldTerms),
    canonical_field: canonicalField,
    region_terms: Array.from(regionTerms),
    value_hints: Array.from(valueHints).slice(0, 5),
    intent_terms: Array.from(intentTerms),
  };
}
