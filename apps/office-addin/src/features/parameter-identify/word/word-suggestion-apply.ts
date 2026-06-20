import type { AISuggestion } from '../../../app/store';

export type BatchApplyItem = {
  suggestion: AISuggestion;
  sourceSuggestions: AISuggestion[];
  targetKey?: string;
};

function normalizeSuggestionPath(value: string): string {
  return String(value || '')
    .replace(/[{}]/g, '')
    .trim();
}

function extractSuggestionLanguageSuffix(value: string): 'zh' | 'ja' | undefined {
  const normalizedPath = normalizeSuggestionPath(value);
  if (/(?:_|\.)(?:cn|zh)$/iu.test(normalizedPath)) {
    return 'zh';
  }
  if (/(?:_|\.)(?:jp|ja)$/iu.test(normalizedPath)) {
    return 'ja';
  }
  return undefined;
}

function getSuggestionLanguageHint(
  suggestion: AISuggestion
): 'zh' | 'ja' | 'en' | 'mixed' | 'unknown' {
  return (
    suggestion.details?.currentLanguageHint ||
    extractSuggestionLanguageSuffix(suggestion.suggestedName) ||
    'unknown'
  );
}

function stripSuggestionLanguageSuffix(value: string): string {
  return normalizeSuggestionPath(value)
    .replace(/(?:_|\.)(?:cn|zh|jp|ja)$/iu, '')
    .trim();
}

function isWordTableCellTarget(targetKey: string | undefined): boolean {
  return Boolean(targetKey) && String(targetKey).startsWith('word:table-cell:');
}

export function isWordTableLoopCellTarget(targetKey: string | undefined): boolean {
  return Boolean(targetKey) && String(targetKey).startsWith('word:table-loop-cell:');
}

function buildSuggestionPairKey(suggestion: AISuggestion): string | undefined {
  const candidateId = String(suggestion.details?.candidateId || '').trim();
  const peerCandidateId = String(suggestion.details?.peerCandidateId || '').trim();
  if (candidateId && peerCandidateId) {
    return `candidate-pair:${[candidateId, peerCandidateId].sort().join('|')}`;
  }

  const language = getSuggestionLanguageHint(suggestion);
  const basePath = stripSuggestionLanguageSuffix(suggestion.suggestedName);
  if ((language === 'zh' || language === 'ja') && basePath) {
    return `path-pair:${basePath}`;
  }

  return undefined;
}

function hasBilingualSuggestionPair(items: AISuggestion[]): boolean {
  const languagesByPair = new Map<string, Set<'zh' | 'ja'>>();

  items.forEach((item) => {
    const pairKey = buildSuggestionPairKey(item);
    const language = getSuggestionLanguageHint(item);
    if (!pairKey || (language !== 'zh' && language !== 'ja')) {
      return;
    }
    const current = languagesByPair.get(pairKey) || new Set<'zh' | 'ja'>();
    current.add(language);
    languagesByPair.set(pairKey, current);
  });

  return Array.from(languagesByPair.values()).some(
    (languages) => languages.has('zh') && languages.has('ja')
  );
}

function sortSuggestionsForMergedApply(items: AISuggestion[]): AISuggestion[] {
  const firstIndexByPairKey = new Map<string, number>();
  items.forEach((item, index) => {
    const pairKey = buildSuggestionPairKey(item);
    if (pairKey && !firstIndexByPairKey.has(pairKey)) {
      firstIndexByPairKey.set(pairKey, index);
    }
  });

  const getLanguageOrder = (suggestion: AISuggestion): number => {
    const language = getSuggestionLanguageHint(suggestion);
    if (language === 'zh') {
      return 0;
    }
    if (language === 'ja') {
      return 1;
    }
    return 9;
  };

  return [...items].sort((left, right) => {
    const leftPairKey = buildSuggestionPairKey(left);
    const rightPairKey = buildSuggestionPairKey(right);
    const leftPairIndex = firstIndexByPairKey.get(leftPairKey || '') ?? Number.MAX_SAFE_INTEGER;
    const rightPairIndex = firstIndexByPairKey.get(rightPairKey || '') ?? Number.MAX_SAFE_INTEGER;
    const leftPairOrdinal =
      typeof left.details?.pairOrdinal === 'number'
        ? left.details.pairOrdinal
        : Number.MAX_SAFE_INTEGER;
    const rightPairOrdinal =
      typeof right.details?.pairOrdinal === 'number'
        ? right.details.pairOrdinal
        : Number.MAX_SAFE_INTEGER;

    if (leftPairKey && rightPairKey && leftPairKey === rightPairKey) {
      return getLanguageOrder(left) - getLanguageOrder(right);
    }

    if (leftPairOrdinal !== rightPairOrdinal) {
      return leftPairOrdinal - rightPairOrdinal;
    }

    if (leftPairIndex !== rightPairIndex) {
      return leftPairIndex - rightPairIndex;
    }

    return items.indexOf(left) - items.indexOf(right);
  });
}

function buildMergedSuggestionName(items: AISuggestion[]): string {
  const orderedSuggestions = sortSuggestionsForMergedApply(items);
  return Array.from(
    new Set(
      orderedSuggestions.map((item) => String(item.suggestedName || '').trim()).filter(Boolean)
    )
  ).join('\n');
}

function shouldMergeSuggestionsForTarget(
  targetKey: string | undefined,
  items: AISuggestion[]
): boolean {
  if (!targetKey || items.length <= 1) {
    return false;
  }

  if (isWordTableLoopCellTarget(targetKey)) {
    return false;
  }

  return isWordTableCellTarget(targetKey) && hasBilingualSuggestionPair(items);
}

function formatSuggestionSummaryLine(suggestion: AISuggestion, index: number): string {
  return [
    `${index + 1}. ${suggestion.originalText || suggestion.elementPath || suggestion.id}`,
    `marker=${String(suggestion.suggestedName || '').trim() || '(empty)'}`,
    `candidateId=${String(suggestion.details?.candidateId || '').trim() || '(none)'}`,
    `lang=${getSuggestionLanguageHint(suggestion)}`,
  ].join(' | ');
}

export function formatApplyDebugBlock(
  title: string,
  item: BatchApplyItem,
  extraLines: Array<string | undefined> = []
): string {
  return [
    `[${title}]`,
    `target=${item.targetKey || item.suggestion.elementPath || 'unknown'}`,
    `sourceCount=${item.sourceSuggestions.length}`,
    ...extraLines.filter(Boolean),
    'sources:',
    ...sortSuggestionsForMergedApply(item.sourceSuggestions).map(formatSuggestionSummaryLine),
    'mergedOutput:',
    item.suggestion.suggestedName || '(empty)',
  ].join('\n');
}

export function extractWordLoopArrayPath(suggestion: AISuggestion): string {
  const directPath = String(suggestion.details?.arrayPath || '').trim();
  if (directPath) {
    return directPath.replace(/\[(?:i(?:\+\d+)?)?\]$/u, '');
  }

  const normalizedName = String(suggestion.suggestedName || '').trim();
  const loopMatch = normalizedName.match(/\{#([^}]+)\}/u);
  if (loopMatch?.[1]) {
    return loopMatch[1].trim();
  }

  const variableMatch = normalizedName
    .replace(/[{}]/g, '')
    .match(/^(d\.[A-Za-z_][A-Za-z0-9_.]*)\[(?:i(?:\+\d+)?)?\]\.[A-Za-z_][A-Za-z0-9_]*$/u);
  return variableMatch?.[1]?.trim() || '';
}

function buildSuggestionTargetKey(suggestion: AISuggestion): string | undefined {
  const wordAnchor = suggestion.details?.wordAnchor as
    | {
        type?: string;
        contentControlId?: number;
        tableIndex?: number;
        rowIndex?: number;
        cellIndex?: number;
        paragraphIndex?: number;
        start?: number;
        end?: number;
      }
    | undefined;

  const normalizedSuggestedName = String(suggestion.suggestedName || '').trim();
  const isWordTableLoopRelated =
    wordAnchor?.type === 'table-cell' &&
    (suggestion.type === 'loop' ||
      Boolean(String(suggestion.details?.arrayPath || '').trim()) ||
      /\{#.+\}.*\{\/.+\}/u.test(normalizedSuggestedName) ||
      /\[[^\]]*\]\./u.test(normalizedSuggestedName.replace(/[{}]/g, '')));

  if (isWordTableLoopRelated) {
    const loopArrayPath = extractWordLoopArrayPath(suggestion);
    if (
      suggestion.type !== 'loop' &&
      typeof wordAnchor?.tableIndex === 'number' &&
      typeof wordAnchor?.rowIndex === 'number' &&
      typeof wordAnchor?.cellIndex === 'number' &&
      loopArrayPath
    ) {
      return `word:table-loop-cell:${wordAnchor.tableIndex}:${wordAnchor.rowIndex}:${wordAnchor.cellIndex}:${loopArrayPath}`;
    }
    return undefined;
  }

  if (wordAnchor?.type === 'content-control' && typeof wordAnchor.contentControlId === 'number') {
    return `word:content-control:${wordAnchor.contentControlId}`;
  }

  if (
    wordAnchor?.type === 'table-cell' &&
    typeof wordAnchor.tableIndex === 'number' &&
    typeof wordAnchor.rowIndex === 'number' &&
    typeof wordAnchor.cellIndex === 'number'
  ) {
    return `word:table-cell:${wordAnchor.tableIndex}:${wordAnchor.rowIndex}:${wordAnchor.cellIndex}`;
  }

  if (
    wordAnchor?.type === 'text-range' &&
    typeof wordAnchor.paragraphIndex === 'number' &&
    typeof wordAnchor.start === 'number' &&
    typeof wordAnchor.end === 'number'
  ) {
    return `word:text-range:${wordAnchor.paragraphIndex}:${wordAnchor.start}:${wordAnchor.end}`;
  }

  const underlineInfo = suggestion.underlineInfo;
  if (
    typeof underlineInfo?.paragraphIndex === 'number' &&
    typeof underlineInfo?.position?.start === 'number' &&
    typeof underlineInfo?.position?.end === 'number'
  ) {
    return `word:underline:${underlineInfo.paragraphIndex}:${underlineInfo.position.start}:${underlineInfo.position.end}`;
  }

  const excelAnchor = suggestion.details?.excelAnchor as
    | {
        type?: string;
        sheetName?: string;
        address?: string;
        tableName?: string;
        pairIndex?: number;
      }
    | undefined;
  if (excelAnchor?.type === 'cell' && excelAnchor.sheetName && excelAnchor.address) {
    return `excel:cell:${excelAnchor.sheetName}:${excelAnchor.address}`;
  }
  if (excelAnchor?.type === 'table' && excelAnchor.sheetName && excelAnchor.tableName) {
    return `excel:table:${excelAnchor.sheetName}:${excelAnchor.tableName}:${excelAnchor.pairIndex ?? 'na'}`;
  }

  const contextKey = String(suggestion.context || suggestion.details?.context || '').trim();
  if (contextKey) {
    return `context:${contextKey}`;
  }

  return undefined;
}

export function buildBatchApplyItems(items: AISuggestion[]): BatchApplyItem[] {
  const indexedItems = items.map((suggestion, index) => ({
    suggestion,
    index,
    targetKey: buildSuggestionTargetKey(suggestion),
  }));
  const groupedIndexes = new Set<number>();
  const indexedSuggestionsByTarget = new Map<string, Array<(typeof indexedItems)[number]>>();

  indexedItems.forEach((entry) => {
    if (!entry.targetKey) {
      return;
    }
    const current = indexedSuggestionsByTarget.get(entry.targetKey) || [];
    current.push(entry);
    indexedSuggestionsByTarget.set(entry.targetKey, current);
  });

  const result: BatchApplyItem[] = [];
  indexedItems.forEach((entry) => {
    if (groupedIndexes.has(entry.index)) {
      return;
    }

    const targetEntries = entry.targetKey
      ? indexedSuggestionsByTarget.get(entry.targetKey) || []
      : [];
    const sourceSuggestions = shouldMergeSuggestionsForTarget(
      entry.targetKey,
      targetEntries.map((item) => item.suggestion)
    )
      ? targetEntries.map((item) => item.suggestion)
      : [entry.suggestion];

    if (sourceSuggestions.length > 1) {
      targetEntries.forEach((item) => groupedIndexes.add(item.index));
    } else {
      groupedIndexes.add(entry.index);
    }

    result.push({
      suggestion:
        sourceSuggestions.length > 1
          ? {
              ...entry.suggestion,
              suggestedName: buildMergedSuggestionName(sourceSuggestions),
            }
          : entry.suggestion,
      sourceSuggestions,
      targetKey: entry.targetKey,
    });
  });

  return result;
}
