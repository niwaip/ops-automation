const SEARCH_PROFILE_TYPE = 'search_intent';

type SearchProfileDraftSource = {
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

function collectTerms(sources: SearchProfileDraftSource[], intentType: string, fallbackTerms: string[]) {
  const values = new Set<string>();

  for (const source of sources) {
    const normalizedSemantic = asRecord(source.normalizedSemantic);
    const parserOutput = asRecord(source.parserOutput);
    const normalizedSearch = asRecord(asRecord(normalizedSemantic?.parser_metadata)?.search);
    const parserSearch = asRecord(asRecord(parserOutput?.metadata)?.search);
    const search = normalizedSearch || parserSearch;

    if (search?.intentType !== intentType) {
      continue;
    }

    if (typeof search.triggerTerm === 'string' && search.triggerTerm.trim()) {
      values.add(normalizeTerm(search.triggerTerm));
    }
  }

  if (values.size === 0) {
    for (const fallback of fallbackTerms) {
      values.add(normalizeTerm(fallback));
    }
  }

  return Array.from(values);
}

export function buildSearchProfileDraftOutputs(input: {
  sources: SearchProfileDraftSource[];
}): Record<string, unknown> | null {
  const searchTerms = collectTerms(input.sources, 'search', ['搜索']);
  const smartSearchTerms = collectTerms(input.sources, 'smart_search', ['智搜']);
  const listResultTerms = collectTerms(input.sources, 'list_results', ['列出搜索结果']);
  const clickResultTerms = collectTerms(input.sources, 'click_result', ['点击']);

  return {
    profile_type: SEARCH_PROFILE_TYPE,
    search_terms: searchTerms,
    smart_search_terms: smartSearchTerms,
    list_result_terms: listResultTerms,
    click_result_terms: clickResultTerms,
  };
}
