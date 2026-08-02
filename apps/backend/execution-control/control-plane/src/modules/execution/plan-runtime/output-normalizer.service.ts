import { Injectable } from '@nestjs/common';

/**
 * Unified runtime output normalization (design doc §7.2 / §15.3 item 6).
 *
 * Owns the ONLY copy of the output alias/normalization logic. Previously the
 * search-results alias chain and the generic `businessData` surfacing lived in
 * two places (`CapabilityRuntimeAdapter.normalizeOutput` and
 * `LegacyOutputAdapterService.validateV1Contract`) with drift between them.
 *
 * Semantics:
 * - Pure function: never mutates the input, returns a normalized copy.
 * - The canonical `searchResults` synthesis + generic `businessData` surfacing
 *   run unconditionally (safe for schema-validated V2 paths — the JSON Schema
 *   arbiter validates the extracted payload, and synthesis only fills absent
 *   top-level keys).
 * - The legacy alias closure (`results` / `news_item_list` / `data`) runs only
 *   for `expectedKeys` the legacy contract declares, so strict
 *   `additionalProperties: false` schemas never see newly synthesized keys.
 */
@Injectable()
export class OutputNormalizerService {
  /**
   * @param output       raw runtime output
   * @param expectedKeys optional contract keys (V1 legacy path) that enable the
   *                     legacy bidirectional alias closure
   */
  public normalize(
    output: Record<string, unknown> | null | undefined,
    expectedKeys?: Iterable<string>,
  ): Record<string, unknown> | undefined {
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      return output || undefined;
    }

    const normalized: Record<string, unknown> = { ...output };

    const nestedResult = this.asRecord(normalized.result);
    const businessData =
      this.asRecord(nestedResult?.businessData) ||
      this.asRecord(normalized.businessData);

    // Canonical search-results synthesis: top-level results/news_item_list/data
    // first, then nested result.results, then businessData.results, then
    // businessData.searchResults. Never overwrites an existing searchResults.
    // When `expectedKeys` is given, synthesis is gated on the key being
    // declared — strict V2 schemas (additionalProperties: false) must never see
    // keys the schema did not authorize.
    const searchResults =
      normalized.results ??
      normalized.news_item_list ??
      normalized.data ??
      nestedResult?.results ??
      businessData?.results ??
      businessData?.searchResults;
    if (searchResults !== undefined && searchResults !== null) {
      if (!expectedKeys || Array.from(expectedKeys).includes('searchResults')) {
        normalized.searchResults ??= searchResults;
      }
    }

    // Legacy alias closure — only for contract keys that declare them
    // (mirrors the old LegacyOutputAdapter per-expected-key resolution).
    if (expectedKeys) {
      const keys = new Set(expectedKeys);
      if (keys.has('results') && normalized.results === undefined) {
        const v =
          normalized.searchResults ??
          normalized.news_item_list ??
          normalized.data ??
          nestedResult?.results ??
          businessData?.results;
        if (v !== undefined && v !== null) normalized.results = v;
      }
      if (keys.has('news_item_list') && normalized.news_item_list === undefined) {
        const v =
          normalized.results ??
          normalized.searchResults ??
          normalized.data;
        if (v !== undefined && v !== null) normalized.news_item_list = v;
      }
      if (keys.has('data') && normalized.data === undefined) {
        // 'data' is a common LLM hallucination alias for search result fields.
        const v =
          normalized.results ??
          normalized.searchResults ??
          normalized.news_item_list ??
          nestedResult?.results ??
          businessData?.results;
        if (v !== undefined && v !== null) normalized.data = v;
      }
    }

    // Generic fallback: surface every field declared on businessData onto the
    // top level when the workflow envelope nests it there. Avoids a hardcoded
    // per-field alias table that drifts as plans declare new output fields
    // (e.g. responseMetadata, totalResults, query).
    if (businessData) {
      for (const [key, value] of Object.entries(businessData)) {
        if (normalized[key] === undefined && value !== undefined && value !== null) {
          normalized[key] = value;
        }
      }
    }

    return normalized;
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }
}
