import {
  WorkflowDocumentIR,
  WorkflowLanguageProfile,
  WorkflowFieldDictionaryEntry,
  WorkflowTermEntry,
  WorkflowEnumItem,
  WorkflowResolvedAssets,
  WorkflowTermAssets,
  WorkflowAnalyzeFieldResult,
  WorkflowRecognizeBlockResult,
  WorkflowRecognitionBlockInput,
  WorkflowRecognitionAiSuggestion,
  WorkflowSourceBinding,
  GLOBAL_FIELD_DICTIONARY,
  GLOBAL_TERMBASE,
  TENANT_TERMBASE,
  GLOBAL_ENUM_MAPPINGS,
} from './workflow-assets';
import {
  safeText,
  normalizeLookupText,
  extractAnchorPrefix,
  inferRecognitionBlockTitle,
} from './workflow-parser-format';
import {
  inferPolicyFromType,
  inferRiskLevelFromType,
  normalizeConfidence,
  normalizeWorkflowFieldId,
  normalizeWorkflowPolicy,
} from './workflow-recognition.helper';

export {
  appendFallbackRecognitionBlock,
  buildAiEmptyFallbackRecognitionBlock,
  buildAiErrorFallbackRecognitionBlock,
  buildFallbackRecognitionBlockResult,
  buildRecognitionBlocks,
  buildWorkflowRecognizeResultMeta,
  prepareWorkflowRecognitionContext,
  buildWorkflowRecognitionPrompt,
  computeCandidateGroupCompareMode,
  computeCandidateGroupCompareScore,
  computeCandidateGroupCompareStatus,
  extractBlockSampleExcerpt,
  isCandidateMatchedToBlock,
  mergeRecognizedField,
  normalizeConfidence,
  normalizeWorkflowFieldId,
  normalizeWorkflowPolicy,
  normalizeWorkflowRecognitionSuggestions,
  parseWorkflowRecognitionAiResponse,
  resolveTemplateFieldLanguage,
  shouldAcceptWorkflowSuggestion,
  inferPolicyFromType,
  inferRiskLevelFromType,
  mapTemplateLanguageSuffix,
  mergeWorkflowRecognizedFields,
} from './workflow-recognition.helper';

export function resolveAssets(termAssets?: WorkflowTermAssets): WorkflowResolvedAssets {
  return {
    fieldDictionary: [...(termAssets?.fieldDictionary || []), ...GLOBAL_FIELD_DICTIONARY],
    termbase: [...(termAssets?.termbase || []), ...TENANT_TERMBASE, ...GLOBAL_TERMBASE],
    enumMappings: {
      ...GLOBAL_ENUM_MAPPINGS,
      ...(termAssets?.enumMappings || {}),
    },
  };
}

export function scopePriority(scope?: 'global' | 'tenant' | 'template'): number {
  if (scope === 'template') {
    return 3;
  }
  if (scope === 'tenant') {
    return 2;
  }
  return 1;
}

export function isAssetActive(status?: string): boolean {
  return status !== 'deprecated' && status !== 'draft';
}

export function findTermMatch(
  fieldId: string,
  text: string,
  assets: WorkflowResolvedAssets
): WorkflowTermEntry | undefined {
  const normalized = normalizeLookupText(text);
  const matches = assets.termbase
    .filter((entry) => isAssetActive(entry.status) && entry.applicableFieldIds.includes(fieldId))
    .map((entry) => {
      const normalizedSource = normalizeLookupText(
        entry.normalizedSourceValue || entry.sourceValue
      );
      if (!normalizedSource) {
        return undefined;
      }
      if (!(normalized === normalizedSource || normalized.includes(normalizedSource))) {
        return undefined;
      }
      return {
        entry,
        normalizedSource,
      };
    })
    .filter(Boolean) as Array<{ entry: WorkflowTermEntry; normalizedSource: string }>;

  matches.sort((left, right) => {
    const scopeDelta = scopePriority(right.entry.scope) - scopePriority(left.entry.scope);
    if (scopeDelta !== 0) {
      return scopeDelta;
    }
    return right.normalizedSource.length - left.normalizedSource.length;
  });

  return matches[0]?.entry;
}

export function findEnumMatch(
  fieldId: string,
  sourceValue: string,
  assets: WorkflowResolvedAssets
): WorkflowEnumItem | undefined {
  const items = assets.enumMappings[fieldId] || [];
  const normalized = normalizeLookupText(sourceValue);
  const matches = items
    .filter((item) => isAssetActive(item.status))
    .filter(
      (item) =>
        item.aliases.some((alias) => normalizeLookupText(alias) === normalized) ||
        Object.values(item.labels).some((label) => normalizeLookupText(label) === normalized)
    );

  matches.sort((left, right) => scopePriority(right.scope) - scopePriority(left.scope));
  return matches[0];
}

export function matchFieldDictionary(
  text: string,
  assets: WorkflowResolvedAssets
): WorkflowFieldDictionaryEntry | undefined {
  const normalized = normalizeLookupText(text);
  const matches = assets.fieldDictionary
    .filter((entry) => isAssetActive(entry.status))
    .map((entry) => {
      const matchedAlias = entry.aliases.find((alias) => {
        const normalizedAlias = normalizeLookupText(alias);
        return (
          normalizedAlias &&
          (normalized === normalizedAlias ||
            normalized.includes(normalizedAlias) ||
            normalizedAlias.includes(normalized))
        );
      });
      if (!matchedAlias) {
        return undefined;
      }
      return {
        entry,
        aliasLength: matchedAlias.length,
      };
    })
    .filter(Boolean) as Array<{ entry: WorkflowFieldDictionaryEntry; aliasLength: number }>;

  matches.sort((left, right) => {
    const scopeDelta = scopePriority(right.entry.scope) - scopePriority(left.entry.scope);
    if (scopeDelta !== 0) {
      return scopeDelta;
    }
    return right.aliasLength - left.aliasLength;
  });

  return matches[0]?.entry;
}

export function buildRecognizedFieldFromSuggestion(
  suggestion: WorkflowRecognitionAiSuggestion,
  block: WorkflowRecognitionBlockInput,
  sourceLanguage: string,
  targetLanguages: string[],
  assets: WorkflowResolvedAssets
): WorkflowAnalyzeFieldResult | undefined {
  const matchedCandidate = block.candidates.find(
    (candidate) =>
      candidate.candidateId === suggestion.candidateId ||
      (suggestion.fieldId && candidate.fieldIdHint === suggestion.fieldId) ||
      (suggestion.anchorText &&
        normalizeLookupText(candidate.anchorText) === normalizeLookupText(suggestion.anchorText))
  );
  const fieldId = normalizeWorkflowFieldId(
    suggestion.fieldId ||
      matchedCandidate?.fieldIdHint ||
      matchedCandidate?.anchorText ||
      matchedCandidate?.candidateId ||
      ''
  );
  if (!fieldId) {
    return undefined;
  }

  const fieldType = safeText(
    suggestion.fieldType || suggestion.type || matchedCandidate?.fieldTypeHint || 'text'
  );
  const policy = normalizeWorkflowPolicy(
    suggestion.policy || matchedCandidate?.generationPolicyHint || inferPolicyFromType(fieldType)
  );
  const riskLevel = suggestion.riskLevel || inferRiskLevelFromType(fieldType);
  const sourceValue = safeText(matchedCandidate?.sampleValue);
  const termMatch =
    policy === 'dictionary_first' && sourceValue
      ? findTermMatch(fieldId, sourceValue, assets)
      : undefined;
  const sourceBinding: WorkflowSourceBinding = {
    blockId: block.blockId,
    lang: sourceLanguage,
    anchor: {
      prefix: matchedCandidate?.anchorText || extractAnchorPrefix(block.templateText),
      suffix: '',
    },
  };

  return {
    fieldId,
    valueMode: 'scalar',
    type: fieldType,
    description: matchedCandidate?.description || suggestion.description,
    sourceLanguage,
    targetLanguages,
    policy,
    required:
      ['high', 'medium'].includes(riskLevel || '') || Boolean(matchedCandidate?.fieldIdHint),
    riskLevel,
    sourceBindings: [sourceBinding],
    renderConfig: {
      flattenForCarbone: true,
      includeCanonicalValue: false,
    },
    sample: sourceValue ? { [sourceLanguage]: sourceValue } : undefined,
    termMatch: termMatch
      ? {
          status: 'matched',
          termId: termMatch.termId,
          scope: termMatch.scope,
        }
      : {
          status: 'unmatched',
        },
    confidence: normalizeConfidence(suggestion.confidence, matchedCandidate?.confidence),
    needsReview:
      suggestion.needsReview ??
      normalizeConfidence(suggestion.confidence, matchedCandidate?.confidence) < 0.8,
  };
}

export function buildAnalyzeFieldResult(
  dictionaryMatch: WorkflowFieldDictionaryEntry,
  languageProfile: WorkflowLanguageProfile,
  sourceBinding: WorkflowSourceBinding,
  normalizedSampleText: string,
  assets: WorkflowResolvedAssets
): WorkflowAnalyzeFieldResult {
  const termMatch = findTermMatch(dictionaryMatch.fieldId, normalizedSampleText, assets);
  const sample = termMatch
    ? {
        [languageProfile.sourceLanguage]: termMatch.sourceValue,
        ...termMatch.translations,
      }
    : undefined;

  return {
    fieldId: dictionaryMatch.fieldId,
    valueMode: 'scalar',
    type: dictionaryMatch.type,
    description: dictionaryMatch.description,
    sourceLanguage: languageProfile.sourceLanguage,
    targetLanguages: languageProfile.targetLanguages,
    policy: dictionaryMatch.policy,
    required: dictionaryMatch.required ?? false,
    riskLevel: dictionaryMatch.riskLevel,
    sourceBindings: [sourceBinding],
    renderConfig: {
      flattenForCarbone: true,
      includeCanonicalValue: false,
    },
    sample,
    termMatch: termMatch
      ? {
          status: 'matched',
          termId: termMatch.termId,
          scope: termMatch.scope,
        }
      : {
          status: 'unmatched',
        },
    confidence: termMatch ? 0.96 : 0.78,
    needsReview: !termMatch && dictionaryMatch.policy === 'dictionary_first',
  };
}

export function discoverFields(
  templateDocumentIr: WorkflowDocumentIR,
  languageProfile: WorkflowLanguageProfile,
  normalizedSampleText: string,
  assets: WorkflowResolvedAssets
): WorkflowAnalyzeFieldResult[] {
  const candidates = new Map<string, WorkflowAnalyzeFieldResult>();
  const anchors = Array.isArray(templateDocumentIr.anchors) ? templateDocumentIr.anchors : [];
  const elements = Array.isArray(templateDocumentIr.elements) ? templateDocumentIr.elements : [];

  for (const anchor of anchors) {
    const anchorParagraphText = safeText(anchor.ref?.paragraphText);
    const anchorContext = [safeText(anchor.text), anchorParagraphText, safeText(anchor.ref?.title)]
      .filter(Boolean)
      .join(' ');
    const dictionaryMatch = matchFieldDictionary(anchorContext, assets);
    if (!dictionaryMatch) {
      continue;
    }
    const existing = candidates.get(dictionaryMatch.fieldId);
    if (existing) {
      continue;
    }
    const matchedElement = elements.find(
      (element) => normalizeLookupText(element.text) === normalizeLookupText(anchorParagraphText)
    );
    candidates.set(
      dictionaryMatch.fieldId,
      buildAnalyzeFieldResult(
        dictionaryMatch,
        languageProfile,
        {
          blockId: matchedElement?.id || String(anchor.id || ''),
          lang: languageProfile.sourceLanguage,
          anchor: {
            prefix: extractAnchorPrefix(anchorParagraphText || anchorContext),
            suffix: '',
          },
        },
        normalizedSampleText,
        assets
      )
    );
  }

  // Fallback scan for missing high risk fields
  for (const dictionaryMatch of assets.fieldDictionary) {
    if (dictionaryMatch.riskLevel === 'high') {
      const existing = candidates.get(dictionaryMatch.fieldId);
      if (existing) {
        continue;
      }
      const matchedElement = elements.find((element) => {
        const text = safeText(element.text);
        return dictionaryMatch.aliases.some((alias) =>
          normalizeLookupText(text).includes(normalizeLookupText(alias))
        );
      });
      if (matchedElement) {
        candidates.set(
          dictionaryMatch.fieldId,
          buildAnalyzeFieldResult(
            dictionaryMatch,
            languageProfile,
            {
              blockId: matchedElement.id,
              lang: languageProfile.sourceLanguage,
              anchor: {
                prefix: extractAnchorPrefix(safeText(matchedElement.text)),
                suffix: '',
              },
            },
            normalizedSampleText,
            assets
          )
        );
      }
    }
  }

  return Array.from(candidates.values());
}

export function buildRecognitionBlockResults(
  templateDocumentIr: WorkflowDocumentIR,
  fields: WorkflowAnalyzeFieldResult[]
): WorkflowRecognizeBlockResult[] {
  const elements = Array.isArray(templateDocumentIr.elements) ? templateDocumentIr.elements : [];
  const assets = resolveAssets();
  const blockCandidates = elements.filter(
    (element) =>
      ['paragraph', 'table', 'cell'].includes(String(element.type || '')) &&
      Boolean(safeText(element.text))
  );
  const blocks = blockCandidates.map((element) => {
    const sourceExcerpt = safeText(element.text).slice(0, 120);
    const normalizedExcerpt = normalizeLookupText(sourceExcerpt);
    let matchedFields = fields.filter((field) =>
      (field.sourceBindings || []).some((binding) => {
        const bindingBlockId = safeText(binding.blockId);
        if (bindingBlockId && bindingBlockId === element.id) {
          return true;
        }
        const anchorPrefix = normalizeLookupText(binding.anchor?.prefix);
        return Boolean(anchorPrefix) && normalizedExcerpt.includes(anchorPrefix);
      })
    );
    if (matchedFields.length === 0) {
      const dictionaryMatch = matchFieldDictionary(sourceExcerpt, assets);
      if (dictionaryMatch) {
        matchedFields = fields.filter((field) => field.fieldId === dictionaryMatch.fieldId);
      }
    }
    const fallbackReason = matchedFields.length > 0 ? 'rule_based_block_scan' : undefined;
    const resultStatus: WorkflowRecognizeBlockResult['resultStatus'] =
      matchedFields.length > 0 ? 'fallback_success' : 'empty';

    return {
      blockId: element.id,
      blockType: String(element.type || 'paragraph'),
      title: inferRecognitionBlockTitle(sourceExcerpt, String(element.type || 'paragraph')),
      sectionTitle: inferRecognitionBlockTitle(sourceExcerpt, String(element.type || 'paragraph')),
      sourceExcerpt,
      suggestionCount: matchedFields.length,
      fieldIds: matchedFields.map((field) => field.fieldId),
      aiCallSucceeded: false,
      resultStatus,
      warnings: matchedFields.length > 0 ? [] : ['当前块未识别到字段候选'],
      retryCount: 0,
      durationMs: 0,
      fallbackReason,
      contextAnalysis: {
        requestSummary: `块 ${element.id} (${String(element.type || 'paragraph')}) 已进入识别队列`,
        responseSummary:
          matchedFields.length > 0
            ? `通过回退链路识别到 ${matchedFields.length} 个字段`
            : '当前块未返回字段候选',
        cacheHit: false,
        fallbackReason,
        retryCount: 0,
      },
    };
  });

  if (blocks.length > 0) {
    return blocks;
  }

  return fields.map((field, index) => {
    const sourceBinding = field.sourceBindings?.[0];
    const sourceExcerpt = safeText(sourceBinding?.anchor?.prefix || field.fieldId);
    return {
      blockId: sourceBinding?.blockId || `field-block-${index + 1}`,
      blockType: 'synthetic',
      title: sourceExcerpt || field.fieldId,
      sectionTitle: sourceExcerpt || field.fieldId,
      sourceExcerpt,
      suggestionCount: 1,
      fieldIds: [field.fieldId],
      aiCallSucceeded: false,
      resultStatus: 'fallback_success',
      warnings: [],
      retryCount: 0,
      durationMs: 0,
      fallbackReason: 'rule_based_field_mapping',
      contextAnalysis: {
        requestSummary: `字段 ${field.fieldId} 通过回退映射生成 synthetic block`,
        responseSummary: '已生成块级占位结果，便于前端展示字段来源',
        cacheHit: false,
        fallbackReason: 'rule_based_field_mapping',
        retryCount: 0,
      },
    };
  });
}
