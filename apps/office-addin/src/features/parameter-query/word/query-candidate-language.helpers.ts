import type { TemplateFieldCandidate } from '../../../api/carbone-api';

export type WordCandidateLanguageHint = 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';

type WordTableCellBilingualGroup = {
  cellKey: string;
  sourceBlockId: string;
  candidates: TemplateFieldCandidate[];
  leftCandidates: TemplateFieldCandidate[];
  rightCandidates: TemplateFieldCandidate[];
  leftLanguage: WordCandidateLanguageHint;
  rightLanguage: WordCandidateLanguageHint;
  tableIndex?: number;
  rowIndex?: number;
  cellIndex?: number;
};

export function inferWordTextLanguageHint(text: string): WordCandidateLanguageHint {
  const value = String(text || '').trim();
  if (!value) {
    return 'unknown';
  }

  const hasKana = /[\u3040-\u30ff]/u.test(value);
  const hasCjk = /[\u4e00-\u9fff]/u.test(value);
  const hasLatin = /[A-Za-z]/u.test(value);

  if (hasKana && hasCjk) {
    return 'ja';
  }
  if (hasKana) {
    return 'ja';
  }
  if (hasCjk && hasLatin) {
    return 'mixed';
  }
  if (hasCjk) {
    return 'zh';
  }
  if (hasLatin) {
    return 'en';
  }

  return 'unknown';
}

export function getWordCandidateLanguageHint(candidate: TemplateFieldCandidate): WordCandidateLanguageHint {
  const anchorSnippet = String(candidate.localAnchorText || candidate.anchorText || '').trim();
  const slotSnippet = String(candidate.parameterSlot || '').trim();
  const paragraphSnippet = String(candidate.segmentText || '').trim();
  const matchSnippet = String(candidate.matchText || '').trim();

  const orderedTexts = [anchorSnippet, slotSnippet, paragraphSnippet, matchSnippet];
  for (const text of orderedTexts) {
    const hint = inferWordTextLanguageHint(text);
    if (hint !== 'unknown') {
      return hint;
    }
  }

  return 'unknown';
}

function getWordCandidatePositionOrder(candidate: TemplateFieldCandidate): number {
  if (typeof candidate.location?.anchorStart === 'number') {
    return candidate.location.anchorStart;
  }
  if (typeof candidate.location?.cellIndex === 'number') {
    return candidate.location.cellIndex;
  }
  if (typeof candidate.location?.rowIndex === 'number') {
    return candidate.location.rowIndex;
  }
  return Number.MAX_SAFE_INTEGER;
}

export function sortWordCandidatesByPosition(candidates: TemplateFieldCandidate[]): TemplateFieldCandidate[] {
  return [...candidates].sort((left, right) => {
    const leftParagraph = typeof left.location?.paragraphIndex === 'number' ? left.location.paragraphIndex : Number.MAX_SAFE_INTEGER;
    const rightParagraph = typeof right.location?.paragraphIndex === 'number' ? right.location.paragraphIndex : Number.MAX_SAFE_INTEGER;
    if (leftParagraph !== rightParagraph) {
      return leftParagraph - rightParagraph;
    }

    const leftOrder = getWordCandidatePositionOrder(left);
    const rightOrder = getWordCandidatePositionOrder(right);
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.candidateId.localeCompare(right.candidateId);
  });
}

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

function buildWordTableCellBilingualGroups(candidates: TemplateFieldCandidate[]): WordTableCellBilingualGroup[] {
  const groupsByCell = new Map<string, TemplateFieldCandidate[]>();
  sortWordCandidatesByPosition(candidates).forEach((candidate) => {
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
    const orderedCandidates = sortWordCandidatesByPosition(cellCandidates);
    if (orderedCandidates.length < 2) {
      return;
    }

    const zhCandidates = orderedCandidates.filter(
      (candidate) => (candidate.languageRelation?.currentLanguageHint || getWordCandidateLanguageHint(candidate)) === 'zh'
    );
    const jaCandidates = orderedCandidates.filter(
      (candidate) => (candidate.languageRelation?.currentLanguageHint || getWordCandidateLanguageHint(candidate)) === 'ja'
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

function attachWordTableCellBilingualRelations(candidateFields: TemplateFieldCandidate[]): void {
  buildWordTableCellBilingualGroups(candidateFields).forEach((group) => {
    const pairCount = Math.min(group.leftCandidates.length, group.rightCandidates.length);
    for (let pairOrdinal = 0; pairOrdinal < pairCount; pairOrdinal += 1) {
      const leftCandidate = group.leftCandidates[pairOrdinal];
      const rightCandidate = group.rightCandidates[pairOrdinal];
      if (!leftCandidate || !rightCandidate) {
        continue;
      }
      if (leftCandidate.languageRelation?.mode !== 'single_language' || rightCandidate.languageRelation?.mode !== 'single_language') {
        continue;
      }

      leftCandidate.languageRelation = {
        mode: 'same_block_mixed_language',
        currentLanguageHint: group.leftLanguage,
        peerBlockId: group.sourceBlockId,
        peerLanguageHint: group.rightLanguage,
        peerCandidateId: rightCandidate.candidateId,
        pairOrdinal,
      };
      rightCandidate.languageRelation = {
        mode: 'same_block_mixed_language',
        currentLanguageHint: group.rightLanguage,
        peerBlockId: group.sourceBlockId,
        peerLanguageHint: group.leftLanguage,
        peerCandidateId: leftCandidate.candidateId,
        pairOrdinal,
      };
    }
  });
}

export function attachWordCandidateLanguageRelations(candidateFields: TemplateFieldCandidate[]): TemplateFieldCandidate[] {
  const nextCandidates = candidateFields.map((candidate) => ({
    ...candidate,
    languageRelation: {
      mode: 'single_language' as const,
      currentLanguageHint: candidate.languageRelation?.currentLanguageHint || getWordCandidateLanguageHint(candidate),
    },
  }));

  attachWordTableCellBilingualRelations(nextCandidates);

  const candidatesBySection = new Map<string, TemplateFieldCandidate[]>();
  nextCandidates.forEach((candidate) => {
    if (candidate.languageRelation?.mode !== 'single_language') {
      return;
    }
    const paragraphIndex = candidate.location?.paragraphIndex;
    if (typeof paragraphIndex !== 'number') {
      return;
    }
    const sectionKey = String(candidate.sectionId || candidate.sectionTitle || 'ungrouped');
    const existing = candidatesBySection.get(sectionKey) || [];
    existing.push(candidate);
    candidatesBySection.set(sectionKey, existing);
  });

  candidatesBySection.forEach((sectionCandidates) => {
    const paragraphGroups = Array.from(
      sectionCandidates.reduce((map, candidate) => {
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
        const sortedCandidates = sortWordCandidatesByPosition(paragraphCandidates);
        const paragraphLanguageHint = sortedCandidates[0]?.languageRelation?.currentLanguageHint
          || getWordCandidateLanguageHint(sortedCandidates[0]);
        return {
          paragraphIndex,
          candidates: sortedCandidates,
          languageHint: paragraphLanguageHint,
          sourceBlockId: String(sortedCandidates[0]?.sourceBlockId || `paragraph-${paragraphIndex}`),
        };
      });

    for (let index = 0; index < paragraphGroups.length - 1; index += 1) {
      const currentGroup = paragraphGroups[index];
      const nextGroup = paragraphGroups[index + 1];
      if (!currentGroup || !nextGroup) {
        continue;
      }

      const currentLang = currentGroup.languageHint;
      const nextLang = nextGroup.languageHint;
      const isBilingualAdjacentPair = (
        Math.abs(nextGroup.paragraphIndex - currentGroup.paragraphIndex) <= 1
        && ((currentLang === 'zh' && nextLang === 'ja') || (currentLang === 'ja' && nextLang === 'zh'))
      );

      if (!isBilingualAdjacentPair) {
        continue;
      }

      const pairCount = Math.min(currentGroup.candidates.length, nextGroup.candidates.length);
      for (let pairOrdinal = 0; pairOrdinal < pairCount; pairOrdinal += 1) {
        const currentCandidate = currentGroup.candidates[pairOrdinal];
        const nextCandidate = nextGroup.candidates[pairOrdinal];
        if (
          !currentCandidate
          || !nextCandidate
          || currentCandidate.languageRelation?.mode !== 'single_language'
          || nextCandidate.languageRelation?.mode !== 'single_language'
        ) {
          continue;
        }

        currentCandidate.languageRelation = {
          mode: 'adjacent_bilingual_block',
          currentLanguageHint: currentLang,
          peerBlockId: nextGroup.sourceBlockId,
          peerLanguageHint: nextLang,
          peerCandidateId: nextCandidate.candidateId,
          pairOrdinal,
        };
        nextCandidate.languageRelation = {
          mode: 'adjacent_bilingual_block',
          currentLanguageHint: nextLang,
          peerBlockId: currentGroup.sourceBlockId,
          peerLanguageHint: currentLang,
          peerCandidateId: currentCandidate.candidateId,
          pairOrdinal,
        };
      }

      index += 1;
    }
  });

  return nextCandidates;
}
