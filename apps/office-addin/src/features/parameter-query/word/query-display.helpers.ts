import type { TemplateCompareResponse, TemplateFieldCandidate } from '../../../api/carbone-api';
import type { WordCompareCandidateDisplayGroup, WordCompareDisplayLanguage, WordLoopDisplayPair } from './query.types';

type CompareCandidateSectionLike = {
  sectionKey: string;
  sectionId?: string;
  sectionTitle: string;
  candidates: TemplateCompareResponse['candidateFields'];
  previewCandidates?: TemplateCompareResponse['candidateFields'];
  hiddenCandidateCount?: number;
  isAttachment?: boolean;
};

type ParagraphGroup = {
  paragraphIndex: number;
  candidates: TemplateFieldCandidate[];
  languageHint: WordCompareDisplayLanguage;
  sourceBlockId: string;
};

type WordTableCellBilingualGroup = {
  cellKey: string;
  sourceBlockId: string;
  candidates: TemplateFieldCandidate[];
  leftCandidates: TemplateFieldCandidate[];
  rightCandidates: TemplateFieldCandidate[];
  leftLanguage: WordCompareDisplayLanguage;
  rightLanguage: WordCompareDisplayLanguage;
  tableIndex?: number;
  rowIndex?: number;
  cellIndex?: number;
};

type DisplayBuilderDeps = {
  sortWordCandidatesByPosition: (candidates: TemplateFieldCandidate[]) => TemplateFieldCandidate[];
  getWordCandidateLanguageHint: (candidate: TemplateFieldCandidate) => WordCompareDisplayLanguage;
  isWordLoopCompareCandidate: (candidate: TemplateFieldCandidate) => boolean;
};

function buildWordTableCellKey(candidate: TemplateFieldCandidate): string | undefined {
  if (
    typeof candidate.location?.tableIndex !== 'number'
    || typeof candidate.location?.rowIndex !== 'number'
    || typeof candidate.location?.cellIndex !== 'number'
  ) {
    return undefined;
  }
  return [
    candidate.location.tableIndex,
    candidate.location.rowIndex,
    candidate.location.cellIndex,
  ].join('|');
}

function buildWordTableCellBilingualGroups(
  candidates: TemplateFieldCandidate[],
  deps: DisplayBuilderDeps
): WordTableCellBilingualGroup[] {
  const groupsByCell = new Map<string, TemplateFieldCandidate[]>();
  deps.sortWordCandidatesByPosition(candidates).forEach((candidate) => {
    const cellKey = buildWordTableCellKey(candidate);
    if (!cellKey) {
      return;
    }
    const current = groupsByCell.get(cellKey) || [];
    current.push(candidate);
    groupsByCell.set(cellKey, current);
  });

  const bilingualGroups: WordTableCellBilingualGroup[] = [];
  Array.from(groupsByCell.entries()).forEach(([cellKey, cellCandidates]) => {
    const orderedCandidates = deps.sortWordCandidatesByPosition(cellCandidates);
    if (orderedCandidates.length < 2) {
      return;
    }

    const zhCandidates = orderedCandidates.filter(
      (candidate) => (candidate.languageRelation?.currentLanguageHint || deps.getWordCandidateLanguageHint(candidate)) === 'zh'
    );
    const jaCandidates = orderedCandidates.filter(
      (candidate) => (candidate.languageRelation?.currentLanguageHint || deps.getWordCandidateLanguageHint(candidate)) === 'ja'
    );
    if (zhCandidates.length === 0 || jaCandidates.length === 0) {
      return;
    }

    bilingualGroups.push({
      cellKey,
      sourceBlockId: String(orderedCandidates[0]?.sourceBlockId || `cell-${cellKey}`),
      candidates: orderedCandidates,
      leftCandidates: zhCandidates,
      rightCandidates: jaCandidates,
      leftLanguage: 'zh',
      rightLanguage: 'ja',
      tableIndex: orderedCandidates[0]?.location?.tableIndex,
      rowIndex: orderedCandidates[0]?.location?.rowIndex,
      cellIndex: orderedCandidates[0]?.location?.cellIndex,
    });
  });

  return bilingualGroups;
}

export function buildWordSectionParagraphGroups(
  candidates: TemplateFieldCandidate[],
  deps: Pick<DisplayBuilderDeps, 'sortWordCandidatesByPosition' | 'getWordCandidateLanguageHint'>
): ParagraphGroup[] {
  return Array.from(
    candidates.reduce((map, candidate) => {
      const paragraphIndex = candidate.location?.paragraphIndex;
      if (typeof paragraphIndex !== 'number') {
        return map;
      }
      const existing = map.get(paragraphIndex) || [];
      existing.push(candidate);
      map.set(paragraphIndex, existing);
      return map;
    }, new Map<number, TemplateFieldCandidate[]>())
  )
    .sort((left, right) => left[0] - right[0])
    .map(([paragraphIndex, paragraphCandidates]) => {
      const sortedCandidates = deps.sortWordCandidatesByPosition(paragraphCandidates);
      const paragraphLanguageHint = sortedCandidates[0]?.languageRelation?.currentLanguageHint
        || deps.getWordCandidateLanguageHint(sortedCandidates[0]);
      return {
        paragraphIndex,
        candidates: sortedCandidates,
        languageHint: paragraphLanguageHint,
        sourceBlockId: String(sortedCandidates[0]?.sourceBlockId || `paragraph-${paragraphIndex}`),
      };
    });
}

export function isWordAdjacentBilingualParagraphGroup(
  left: {
    paragraphIndex: number;
    languageHint: WordCompareDisplayLanguage;
  },
  right: {
    paragraphIndex: number;
    languageHint: WordCompareDisplayLanguage;
  },
): boolean {
  return (
    Math.abs(right.paragraphIndex - left.paragraphIndex) <= 1
    && ((left.languageHint === 'zh' && right.languageHint === 'ja') || (left.languageHint === 'ja' && right.languageHint === 'zh'))
  );
}

function inferWordLoopDisplayLanguage(
  candidates: TemplateFieldCandidate[],
  fallback: 'zh' | 'ja',
  deps: Pick<DisplayBuilderDeps, 'getWordCandidateLanguageHint'>
): WordCompareDisplayLanguage {
  const explicitHints = candidates
    .map((candidate) => candidate.languageRelation?.currentLanguageHint || deps.getWordCandidateLanguageHint(candidate))
    .filter((hint): hint is WordCompareDisplayLanguage => Boolean(hint) && hint !== 'unknown');

  if (explicitHints.length > 0) {
    const preferredHint = explicitHints.find((hint) => hint === 'zh' || hint === 'ja');
    return preferredHint || explicitHints[0];
  }

  return fallback;
}

function buildWordLoopDisplayPairs(
  loopCandidates: TemplateFieldCandidate[],
  deps: Pick<DisplayBuilderDeps, 'sortWordCandidatesByPosition' | 'getWordCandidateLanguageHint'>
): WordLoopDisplayPair[] {
  const pairsByCell = new Map<string, TemplateFieldCandidate[]>();

  deps.sortWordCandidatesByPosition(loopCandidates).forEach((candidate) => {
    const key = [
      candidate.location?.tableIndex ?? 'table',
      candidate.location?.rowIndex ?? 'row',
      candidate.location?.cellIndex ?? candidate.candidateId,
    ].join('|');
    const current = pairsByCell.get(key) || [];
    current.push(candidate);
    pairsByCell.set(key, current);
  });

  return Array.from(pairsByCell.entries())
    .sort((left, right) => {
      const leftCellIndex = left[1][0]?.location?.cellIndex ?? Number.MAX_SAFE_INTEGER;
      const rightCellIndex = right[1][0]?.location?.cellIndex ?? Number.MAX_SAFE_INTEGER;
      return leftCellIndex - rightCellIndex;
    })
    .map(([key, slotCandidates]) => {
      const orderedCandidates = [...slotCandidates];
      if (orderedCandidates.length >= 2) {
        const firstCandidate = orderedCandidates[0];
        const secondCandidate = orderedCandidates[1];
        const firstLanguage = firstCandidate ? inferWordLoopDisplayLanguage([firstCandidate], 'zh', deps) : 'unknown';
        const secondLanguage = secondCandidate ? inferWordLoopDisplayLanguage([secondCandidate], 'ja', deps) : 'unknown';

        if (firstLanguage === 'ja' && secondLanguage === 'zh') {
          orderedCandidates[0] = secondCandidate;
          orderedCandidates[1] = firstCandidate;
        }
      }

      const leftCandidates = orderedCandidates[0] ? [orderedCandidates[0]] : [];
      const rightCandidates = orderedCandidates.slice(1);
      const leftLanguage = inferWordLoopDisplayLanguage(leftCandidates, 'zh', deps);
      let rightLanguage = inferWordLoopDisplayLanguage(rightCandidates, 'ja', deps);

      if (rightCandidates.length > 0 && rightLanguage === leftLanguage) {
        rightLanguage = leftLanguage === 'zh' ? 'ja' : 'zh';
      }

      return {
        key,
        leftCandidates,
        rightCandidates,
        leftLanguage,
        rightLanguage,
        cellIndex: slotCandidates[0]?.location?.cellIndex,
      };
    });
}

export function buildWordCompareCandidateDisplayGroups(
  section: CompareCandidateSectionLike,
  deps: DisplayBuilderDeps
): WordCompareCandidateDisplayGroup[] {
  const previewCandidates = Array.isArray(section.previewCandidates) && section.previewCandidates.length > 0
    ? section.previewCandidates
    : section.candidates;

  const loopCandidates = previewCandidates.filter((candidate) => deps.isWordLoopCompareCandidate(candidate));
  const nonLoopCandidates = previewCandidates.filter((candidate) => !deps.isWordLoopCompareCandidate(candidate));
  const groups: WordCompareCandidateDisplayGroup[] = [];

  if (loopCandidates.length > 0) {
    const loopGroups = new Map<string, TemplateFieldCandidate[]>();
    loopCandidates.forEach((candidate) => {
      const key = typeof candidate.location?.tableIndex === 'number'
        ? `loop-table:${candidate.location.tableIndex}`
        : `loop-source:${candidate.sourceBlockId || candidate.candidateId}`;
      const current = loopGroups.get(key) || [];
      current.push(candidate);
      loopGroups.set(key, current);
    });

    loopGroups.forEach((groupCandidates, key) => {
      groups.push({
        key,
        type: 'loop_group',
        candidates: deps.sortWordCandidatesByPosition(groupCandidates),
        tableIndex: groupCandidates[0]?.location?.tableIndex,
        loopPairs: buildWordLoopDisplayPairs(groupCandidates, deps),
      });
    });
  }

  if (nonLoopCandidates.length === 0) {
    return groups;
  }

  const usedNonLoopCandidateIds = new Set<string>();
  buildWordTableCellBilingualGroups(nonLoopCandidates, deps).forEach((group) => {
    group.candidates.forEach((candidate) => usedNonLoopCandidateIds.add(candidate.candidateId));
    groups.push({
      key: `cell-pair:${group.cellKey}`,
      type: 'cell_pair',
      leftCandidates: group.leftCandidates,
      rightCandidates: group.rightCandidates,
      leftLanguage: group.leftLanguage,
      rightLanguage: group.rightLanguage,
      tableIndex: group.tableIndex,
      rowIndex: group.rowIndex,
      cellIndex: group.cellIndex,
    });
  });

  const remainingNonLoopCandidates = nonLoopCandidates.filter((candidate) => !usedNonLoopCandidateIds.has(candidate.candidateId));
  if (remainingNonLoopCandidates.length === 0) {
    return groups;
  }

  if (remainingNonLoopCandidates.length <= 1) {
    return [
      ...groups,
      ...remainingNonLoopCandidates.map((candidate) => ({
        key: candidate.candidateId,
        type: 'single_sentence' as const,
        candidates: [candidate],
      })),
    ];
  }

  const paragraphGroups = buildWordSectionParagraphGroups(remainingNonLoopCandidates, deps);
  const handledCandidateIds = new Set<string>();

  for (let index = 0; index < paragraphGroups.length; index += 1) {
    const currentGroup = paragraphGroups[index];
    const nextGroup = paragraphGroups[index + 1];
    if (currentGroup && nextGroup && isWordAdjacentBilingualParagraphGroup(currentGroup, nextGroup)) {
      const orderedGroups = currentGroup.languageHint === 'zh'
        ? [currentGroup, nextGroup]
        : [nextGroup, currentGroup];
      orderedGroups[0].candidates.forEach((candidate) => handledCandidateIds.add(candidate.candidateId));
      orderedGroups[1].candidates.forEach((candidate) => handledCandidateIds.add(candidate.candidateId));
      groups.push({
        key: `sentence-pair:${orderedGroups[0].paragraphIndex}|${orderedGroups[1].paragraphIndex}`,
        type: 'sentence_pair',
        leftCandidates: orderedGroups[0].candidates,
        rightCandidates: orderedGroups[1].candidates,
        leftLanguage: orderedGroups[0].languageHint,
        rightLanguage: orderedGroups[1].languageHint,
      });
      index += 1;
      continue;
    }

    if (currentGroup) {
      currentGroup.candidates.forEach((candidate) => handledCandidateIds.add(candidate.candidateId));
      groups.push({
        key: `sentence-single:${currentGroup.paragraphIndex}`,
        type: 'single_sentence',
        candidates: currentGroup.candidates,
      });
    }
  }

  remainingNonLoopCandidates
    .filter((candidate) => !handledCandidateIds.has(candidate.candidateId))
    .forEach((candidate) => {
      groups.push({
        key: candidate.candidateId,
        type: 'single_sentence',
        candidates: [candidate],
      });
    });

  return groups;
}
