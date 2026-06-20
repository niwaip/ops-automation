import type { DocumentIR } from '../../../host/adapters/document-ir';
import type { TemplateFieldCandidate } from '../../../api/carbone-api';
import type { WordSectionPromptAcceptedSuggestion } from '../services/analysis-executor';
import type { AISuggestion } from '../../../app/store';
import { enrichWordSuggestionAnchors } from '../services/index';
import { extractWordParamName } from '../../../host/office/word/parameter';
import { buildWordSectionBilingualPairsForRecognition } from '../shared/word-section-recognition';
import { inferWordCandidateHints } from '../../parameter-query/word/query-compare.helpers';

type CompareCandidateSectionLike = {
  sectionKey: string;
  sectionTitle: string;
  candidates: TemplateFieldCandidate[];
};

type SuggestionDisplayGroup = {
  key: string;
  type: 'pair' | 'single';
  suggestions: AISuggestion[];
  pairPath?: string;
};

function normalizeWordSuggestionPathForQualityCheck(value: string): string {
  return value.replace(/[{}]/g, '').trim();
}

function isGenericWordSuggestedName(value: string): boolean {
  return /^(?:d\.)?(?:[A-Za-z_][A-Za-z0-9_]*\[\]\.)?(field\d*|textValue|textField\d*|value\d*|var\d*|param\d*|undefined|null|unknown)$/i.test(
    normalizeWordSuggestionPathForQualityCheck(value)
  );
}

function isValidWordSuggestedPath(value: string): boolean {
  const normalized = normalizeWordSuggestionPathForQualityCheck(value);
  return (
    Boolean(normalized) &&
    /^[A-Za-z_][A-Za-z0-9_[\].]*$/.test(normalized) &&
    !/[^\x00-\x7F]/.test(normalized)
  );
}

export function buildAcceptedWordSuggestionSummaries(
  suggestions: AISuggestion[]
): WordSectionPromptAcceptedSuggestion[] {
  return suggestions
    .map((suggestion) => ({
      candidateId: String(suggestion.details?.candidateId || ''),
      suggestedName: suggestion.suggestedName,
      type: suggestion.type,
      fieldType: suggestion.details?.fieldType,
      confidence: suggestion.confidence,
    }))
    .filter((item) => item.candidateId && item.suggestedName);
}

export function isWordSuggestionHighQuality(
  suggestion: AISuggestion | undefined,
  expectedCandidateId: string
): boolean {
  if (!suggestion) {
    return false;
  }

  if (String(suggestion.details?.candidateId || '').trim() !== expectedCandidateId) {
    return false;
  }

  if (!isValidWordSuggestedPath(suggestion.suggestedName || '')) {
    return false;
  }

  if (isGenericWordSuggestedName(suggestion.suggestedName || '')) {
    return false;
  }

  return suggestion.confidence >= 0.75;
}

export function selectBestWordSuggestionForCandidate(
  suggestions: AISuggestion[],
  candidateId: string
): AISuggestion | undefined {
  return suggestions
    .filter((suggestion) => String(suggestion.details?.candidateId || '').trim() === candidateId)
    .sort((left, right) => right.confidence - left.confidence)[0];
}

function stripWordBilingualSuggestedNameSuffix(value: string): string {
  return String(value || '')
    .replace(/[{}]/g, '')
    .replace(/_(cn|jp)$/i, '')
    .trim();
}

function sortWordPairedSuggestions(
  suggestions: AISuggestion[],
  candidateById: Map<string, TemplateFieldCandidate>
): AISuggestion[] {
  const getOrder = (suggestion: AISuggestion): number => {
    const candidateId = suggestion.details?.candidateId;
    const languageHint = candidateId
      ? candidateById.get(candidateId)?.languageRelation?.currentLanguageHint
      : undefined;
    if (languageHint === 'zh') {
      return 0;
    }
    if (languageHint === 'ja') {
      return 1;
    }

    const normalizedName = String(suggestion.suggestedName || '').replace(/[{}]/g, '');
    if (/_cn$/i.test(normalizedName)) {
      return 0;
    }
    if (/_jp$/i.test(normalizedName)) {
      return 1;
    }

    return 9;
  };

  return [...suggestions].sort((left, right) => getOrder(left) - getOrder(right));
}

export function buildWordSectionSuggestionDisplayGroups(
  section: CompareCandidateSectionLike,
  suggestions: AISuggestion[]
): SuggestionDisplayGroup[] {
  if (suggestions.length <= 1) {
    return suggestions.map((suggestion) => ({
      key: suggestion.id,
      type: 'single' as const,
      suggestions: [suggestion],
    }));
  }

  const candidateById = new Map(
    section.candidates.map((candidate) => [candidate.candidateId, candidate] as const)
  );
  const pairCandidateLookup = new Map<string, string>();
  buildWordSectionBilingualPairsForRecognition(section.candidates).forEach((pair) => {
    const [left, right] = pair.candidates;
    pairCandidateLookup.set(left.candidateId, right.candidateId);
    pairCandidateLookup.set(right.candidateId, left.candidateId);
  });

  const suggestionByCandidateId = new Map<string, AISuggestion>();
  suggestions.forEach((suggestion) => {
    const candidateId = suggestion.details?.candidateId;
    if (candidateId && !suggestionByCandidateId.has(candidateId)) {
      suggestionByCandidateId.set(candidateId, suggestion);
    }
  });

  const seenSuggestionIds = new Set<string>();
  const groups: SuggestionDisplayGroup[] = [];

  suggestions.forEach((suggestion) => {
    if (seenSuggestionIds.has(suggestion.id)) {
      return;
    }

    const candidateId = suggestion.details?.candidateId;
    const peerCandidateId = candidateId ? pairCandidateLookup.get(candidateId) : undefined;
    const peerSuggestion = peerCandidateId
      ? suggestionByCandidateId.get(peerCandidateId)
      : undefined;

    if (peerSuggestion && !seenSuggestionIds.has(peerSuggestion.id)) {
      const orderedSuggestions = sortWordPairedSuggestions(
        [suggestion, peerSuggestion],
        candidateById
      );
      orderedSuggestions.forEach((item) => seenSuggestionIds.add(item.id));
      groups.push({
        key: `pair:${orderedSuggestions
          .map((item) => item.id)
          .sort()
          .join('|')}`,
        type: 'pair',
        suggestions: orderedSuggestions,
        pairPath: stripWordBilingualSuggestedNameSuffix(orderedSuggestions[0]?.suggestedName || ''),
      });
      return;
    }

    const basePath = stripWordBilingualSuggestedNameSuffix(suggestion.suggestedName);
    const fallbackPeer = suggestions.find(
      (candidateSuggestion) =>
        candidateSuggestion.id !== suggestion.id &&
        !seenSuggestionIds.has(candidateSuggestion.id) &&
        /_(cn|jp)$/i.test(String(candidateSuggestion.suggestedName || '').replace(/[{}]/g, '')) &&
        stripWordBilingualSuggestedNameSuffix(candidateSuggestion.suggestedName) === basePath
    );

    if (fallbackPeer) {
      const orderedSuggestions = sortWordPairedSuggestions(
        [suggestion, fallbackPeer],
        candidateById
      );
      orderedSuggestions.forEach((item) => seenSuggestionIds.add(item.id));
      groups.push({
        key: `pair:${orderedSuggestions
          .map((item) => item.id)
          .sort()
          .join('|')}`,
        type: 'pair',
        suggestions: orderedSuggestions,
        pairPath: basePath,
      });
      return;
    }

    seenSuggestionIds.add(suggestion.id);
    groups.push({
      key: suggestion.id,
      type: 'single',
      suggestions: [suggestion],
    });
  });

  return groups;
}

export function hydrateWordSectionSuggestions(
  documentIr: DocumentIR,
  section: CompareCandidateSectionLike,
  excerpt: string,
  suggestions: AISuggestion[]
): AISuggestion[] {
  const sectionScopedSuggestions = suggestions.map((suggestion, index) => ({
    ...suggestion,
    id: `${section.sectionKey}-${suggestion.id || index + 1}`,
    context: suggestion.context || excerpt,
    details: {
      ...suggestion.details,
      source: suggestion.details?.source || 'ai',
      chapter: section.sectionTitle,
    },
  }));

  return attachCompareCandidateAnchors(
    documentIr,
    section,
    enrichWordSuggestionAnchors(documentIr, sectionScopedSuggestions)
  );
}

function extractSuggestionFieldLeaf(suggestedName: string): string {
  return (
    String(suggestedName || '')
      .replace(/[{}]/g, '')
      .replace(/^d\./, '')
      .replace(/\[(?:\d+)?\]/g, '')
      .split('.')
      .map((segment) => segment.replace(/[^A-Za-z0-9_]/g, '').toLowerCase())
      .filter(Boolean)
      .pop() || ''
  );
}

function extractSuggestionPathTokens(suggestedName: string): string[] {
  return String(suggestedName || '')
    .replace(/[{}]/g, '')
    .replace(/^d\./, '')
    .replace(/\[(?:\d+)?\]/g, '')
    .split('.')
    .map((segment) => segment.replace(/[^A-Za-z0-9_]/g, '').toLowerCase())
    .filter(Boolean);
}

function splitWordIdentifierTokens(value: string): string[] {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/g)
    .map((segment) => segment.trim().toLowerCase())
    .filter((segment) => segment.length >= 2);
}

function buildWordAnchorFromCompareCandidate(
  candidate: TemplateFieldCandidate,
  paragraphTextByIndex: Map<number, string>
): NonNullable<AISuggestion['details']>['wordAnchor'] | undefined {
  const location = candidate.location;
  if (!location) {
    return undefined;
  }

  if (typeof location.contentControlId === 'number') {
    return {
      type: 'content-control',
      contentControlId: location.contentControlId,
    };
  }

  if (
    typeof location.tableIndex === 'number' &&
    typeof location.rowIndex === 'number' &&
    typeof location.cellIndex === 'number'
  ) {
    return {
      type: 'table-cell',
      tableIndex: location.tableIndex,
      rowIndex: location.rowIndex,
      cellIndex: location.cellIndex,
    };
  }

  if (
    typeof location.paragraphIndex === 'number' &&
    typeof location.anchorStart === 'number' &&
    typeof location.anchorEnd === 'number'
  ) {
    return {
      type: 'text-range',
      paragraphIndex: location.paragraphIndex,
      start: location.anchorStart,
      end: location.anchorEnd,
      paragraphText: paragraphTextByIndex.get(location.paragraphIndex) || '',
    };
  }

  return undefined;
}

function safeCompareText(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCompareLookupText(value: unknown): string {
  return safeCompareText(value)
    .toLowerCase()
    .replace(/[（）()【】\[\]]/g, '')
    .replace(/\s+/g, '');
}

function scoreCompareCandidateForSuggestion(
  suggestion: AISuggestion,
  candidate: TemplateFieldCandidate
): number {
  const candidateHints = inferWordCandidateHints(candidate);
  const candidateTexts = [
    candidate.anchorText,
    extractWordParamName(candidate.anchorText || ''),
    candidate.sampleValue,
    candidate.matchText,
    candidate.segmentText,
    candidate.fieldIdHint,
    candidateHints.fieldIdHint,
  ]
    .map((value) => normalizeCompareLookupText(value))
    .filter(Boolean);
  const suggestionTexts = [
    suggestion.originalText,
    suggestion.elementPath,
    suggestion.context,
    suggestion.details?.context,
    suggestion.details?.beforeBlank,
    suggestion.details?.afterBlank,
  ]
    .map((value) => normalizeCompareLookupText(value))
    .filter(Boolean);

  let score = 0;
  suggestionTexts.forEach((text) => {
    candidateTexts.forEach((candidateText) => {
      if (!text || !candidateText) {
        return;
      }
      if (text === candidateText) {
        score += 120;
        return;
      }
      if (text.includes(candidateText) || candidateText.includes(text)) {
        score += 48;
      }
    });
  });

  if (suggestion.details?.candidateId && suggestion.details.candidateId === candidate.candidateId) {
    score += 1000;
  }

  const suggestionFieldLeaf = extractSuggestionFieldLeaf(suggestion.suggestedName);
  const candidateFieldLeaf = String(candidate.fieldIdHint || candidateHints.fieldIdHint || '')
    .replace(/[^A-Za-z0-9_]/g, '')
    .toLowerCase();
  if (suggestionFieldLeaf && candidateFieldLeaf && suggestionFieldLeaf === candidateFieldLeaf) {
    score += 80;
  }

  const suggestionPathTokens = extractSuggestionPathTokens(suggestion.suggestedName).flatMap(
    (token) => splitWordIdentifierTokens(token)
  );
  const candidateFieldTokens = splitWordIdentifierTokens(
    candidate.fieldIdHint || candidateHints.fieldIdHint || ''
  );
  if (suggestionPathTokens.length > 0 && candidateFieldTokens.length > 0) {
    const overlapCount = candidateFieldTokens.filter((token) =>
      suggestionPathTokens.includes(token)
    ).length;
    score += Math.min(40, overlapCount * 18);
  }

  if (
    candidate.sectionTitle &&
    suggestion.details?.chapter &&
    normalizeCompareLookupText(candidate.sectionTitle) ===
      normalizeCompareLookupText(suggestion.details.chapter)
  ) {
    score += 12;
  }

  return score;
}

function attachCompareCandidateAnchors(
  documentIr: DocumentIR,
  section: CompareCandidateSectionLike,
  suggestions: AISuggestion[]
): AISuggestion[] {
  if (section.candidates.length === 0 || suggestions.length === 0) {
    return suggestions;
  }

  const paragraphTextByIndex = new Map(
    documentIr.elements
      .filter((element) => element.type === 'paragraph')
      .map((element) => [Number(element.hostData?.index), String(element.text || '')] as const)
      .filter(([index]) => Number.isFinite(index))
  );
  const candidateById = new Map(
    section.candidates.map((candidate) => [candidate.candidateId, candidate] as const)
  );
  const unusedCandidateIndexes = new Set(section.candidates.map((_, index) => index));

  return suggestions.map((suggestion, suggestionIndex) => {
    const explicitCandidateId = String(suggestion.details?.candidateId || '').trim();
    if (explicitCandidateId) {
      const matchedCandidate = candidateById.get(explicitCandidateId);
      if (matchedCandidate) {
        const wordAnchor = buildWordAnchorFromCompareCandidate(
          matchedCandidate,
          paragraphTextByIndex
        );
        if (wordAnchor) {
          const matchedCandidateIndex = section.candidates.findIndex(
            (candidate) => candidate.candidateId === explicitCandidateId
          );
          if (matchedCandidateIndex >= 0) {
            unusedCandidateIndexes.delete(matchedCandidateIndex);
          }
          return {
            ...suggestion,
            underlineInfo:
              suggestion.underlineInfo ||
              (wordAnchor.type === 'text-range'
                ? {
                    paragraphIndex: wordAnchor.paragraphIndex,
                    position: { start: wordAnchor.start || 0, end: wordAnchor.end || 0 },
                    paragraphText: wordAnchor.paragraphText,
                  }
                : undefined),
            details: {
              ...suggestion.details,
              candidateId: explicitCandidateId,
              peerCandidateId: matchedCandidate.languageRelation?.peerCandidateId,
              currentLanguageHint: matchedCandidate.languageRelation?.currentLanguageHint,
              pairOrdinal: matchedCandidate.languageRelation?.pairOrdinal,
              wordAnchor,
            },
          };
        }
      }
    }

    if (suggestion.details?.wordAnchor) {
      return suggestion;
    }

    let matchedCandidateIndex = -1;
    let matchedScore = -1;

    unusedCandidateIndexes.forEach((candidateIndex) => {
      const candidate = section.candidates[candidateIndex];
      const score = scoreCompareCandidateForSuggestion(suggestion, candidate);
      if (score > matchedScore) {
        matchedScore = score;
        matchedCandidateIndex = candidateIndex;
      }
    });

    if (
      matchedScore <= 0 &&
      section.candidates.length === suggestions.length &&
      unusedCandidateIndexes.has(suggestionIndex)
    ) {
      matchedCandidateIndex = suggestionIndex;
    }

    if (matchedCandidateIndex < 0) {
      return suggestion;
    }

    const matchedCandidate = section.candidates[matchedCandidateIndex];
    const wordAnchor = buildWordAnchorFromCompareCandidate(matchedCandidate, paragraphTextByIndex);
    if (!wordAnchor) {
      return suggestion;
    }

    unusedCandidateIndexes.delete(matchedCandidateIndex);

    return {
      ...suggestion,
      underlineInfo:
        suggestion.underlineInfo ||
        (wordAnchor.type === 'text-range'
          ? {
              paragraphIndex: wordAnchor.paragraphIndex,
              position: { start: wordAnchor.start || 0, end: wordAnchor.end || 0 },
              paragraphText: wordAnchor.paragraphText,
            }
          : undefined),
      details: {
        ...suggestion.details,
        candidateId: suggestion.details?.candidateId || matchedCandidate.candidateId,
        peerCandidateId: matchedCandidate.languageRelation?.peerCandidateId,
        currentLanguageHint: matchedCandidate.languageRelation?.currentLanguageHint,
        pairOrdinal: matchedCandidate.languageRelation?.pairOrdinal,
        wordAnchor,
      },
    };
  });
}

export function dedupeWordSectionSuggestions(suggestions: AISuggestion[]): AISuggestion[] {
  const deduped = new Map<string, AISuggestion>();

  suggestions.forEach((suggestion) => {
    const key = [
      suggestion.type,
      suggestion.suggestedName,
      suggestion.elementPath,
      suggestion.originalText,
      suggestion.details?.chapter,
    ]
      .map((value) => String(value || ''))
      .join('|');
    const existing = deduped.get(key);
    if (!existing || suggestion.confidence > existing.confidence) {
      deduped.set(key, suggestion);
    }
  });

  return Array.from(deduped.values());
}
