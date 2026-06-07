import { TemplateFieldCandidate } from '../../../api/carbone-api';
import { extractWordParamName, resolveWordHeaderFieldKey } from '../../../host/office/word/parameter';

export type WordRecognitionBatchOptions = {
  retryLoopIds: string[];
  unsentLoopIds: string[];
  retryNormalIds: string[];
  unsentNormalIds: string[];
  candidateById: Map<string, TemplateFieldCandidate>;
  acceptedIds: Set<string>;
};

function normalizeCompareLookupText(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/[：:，,。；;、（）()\[\]{}]/g, '')
    .toLowerCase()
    .trim();
}

function getWordCandidateLanguageHint(candidate: TemplateFieldCandidate): 'zh' | 'ja' | 'en' | 'mixed' | 'unknown' {
  const explicitHint = candidate.languageRelation?.currentLanguageHint;
  if (explicitHint) {
    return explicitHint;
  }

  const combinedText = [
    candidate.localAnchorText,
    candidate.anchorText,
    candidate.parameterSlot,
    candidate.segmentText,
    candidate.sampleValue,
  ]
    .map((value) => String(value || ''))
    .join(' ');

  const normalizedText = combinedText
    .replace(/[_＿\-\s0-9:：/\\()[\]{}]+/gu, '')
    .trim();
  if (!normalizedText) {
    return 'unknown';
  }

  const hasKana = /[\u3040-\u30ff]/u.test(normalizedText);
  const hasHan = /[\u3400-\u9fff]/u.test(normalizedText);
  const hasLatin = /[A-Za-z]/.test(normalizedText);
  if (hasKana) {
    return 'ja';
  }
  if (hasHan && !hasLatin) {
    return 'zh';
  }
  if (hasLatin && !hasHan) {
    return 'en';
  }
  if ((hasHan && hasLatin) || (hasHan && hasKana) || (hasKana && hasLatin)) {
    return 'mixed';
  }
  return 'unknown';
}

function sortWordCandidatesByPosition(candidates: TemplateFieldCandidate[]): TemplateFieldCandidate[] {
  return [...candidates].sort((left, right) => {
    const leftLocation = left.location || {};
    const rightLocation = right.location || {};
    return (
      (Number(leftLocation.tableIndex ?? Number.MAX_SAFE_INTEGER) - Number(rightLocation.tableIndex ?? Number.MAX_SAFE_INTEGER))
      || (Number(leftLocation.rowIndex ?? Number.MAX_SAFE_INTEGER) - Number(rightLocation.rowIndex ?? Number.MAX_SAFE_INTEGER))
      || (Number(leftLocation.cellIndex ?? Number.MAX_SAFE_INTEGER) - Number(rightLocation.cellIndex ?? Number.MAX_SAFE_INTEGER))
      || (Number(leftLocation.paragraphIndex ?? Number.MAX_SAFE_INTEGER) - Number(rightLocation.paragraphIndex ?? Number.MAX_SAFE_INTEGER))
      || (Number(leftLocation.anchorStart ?? Number.MAX_SAFE_INTEGER) - Number(rightLocation.anchorStart ?? Number.MAX_SAFE_INTEGER))
      || left.candidateId.localeCompare(right.candidateId)
    );
  });
}

function getWordCandidateSlotMergeLabel(candidate: TemplateFieldCandidate): string {
  return extractWordParamName(candidate.localAnchorText || candidate.anchorText || '').trim();
}

function buildWordCandidateSlotMergeKey(candidate: TemplateFieldCandidate): string {
  if (typeof candidate.location?.contentControlId === 'number') {
    return `content-control|${candidate.location.contentControlId}`;
  }

  if (
    typeof candidate.location?.tableIndex === 'number'
    && typeof candidate.location?.rowIndex === 'number'
    && typeof candidate.location?.cellIndex === 'number'
  ) {
    return `table-cell|${candidate.location.tableIndex}|${candidate.location.rowIndex}|${candidate.location.cellIndex}`;
  }

  if (
    typeof candidate.location?.paragraphIndex === 'number'
    && typeof candidate.location?.anchorStart === 'number'
    && typeof candidate.location?.anchorEnd === 'number'
  ) {
    return [
      'text-range',
      candidate.location.paragraphIndex,
      candidate.location.anchorStart,
      candidate.location.anchorEnd,
      candidate.sourceBlockId || '',
    ].join('|');
  }

  return `source-block|${candidate.sourceBlockId || candidate.candidateId}`;
}

function isPairedWordLanguageRelationMode(
  mode?: 'single_language' | 'adjacent_bilingual_block' | 'same_block_mixed_language' | 'unknown',
): boolean {
  return mode === 'adjacent_bilingual_block' || mode === 'same_block_mixed_language';
}

function isBilingualWordCandidateSet(slotCandidates: TemplateFieldCandidate[]): boolean {
  if (slotCandidates.length < 2) {
    return false;
  }

  const candidateIds = new Set(slotCandidates.map((candidate) => candidate.candidateId));
  const hasExplicitPeerPair = slotCandidates.some((candidate) => {
    const peerCandidateId = String(candidate.languageRelation?.peerCandidateId || '').trim();
    return isPairedWordLanguageRelationMode(candidate.languageRelation?.mode)
      && Boolean(peerCandidateId)
      && candidateIds.has(peerCandidateId);
  });
  if (hasExplicitPeerPair) {
    return true;
  }

  const concreteLanguages = new Set(
    slotCandidates
      .map((candidate) => candidate.languageRelation?.currentLanguageHint || getWordCandidateLanguageHint(candidate))
      .filter((language): language is 'zh' | 'ja' | 'en' => language === 'zh' || language === 'ja' || language === 'en')
  );
  return concreteLanguages.has('zh') && concreteLanguages.has('ja');
}

function shouldMergeWordCandidatesInSameSlot(slotCandidates: TemplateFieldCandidate[]): boolean {
  if (slotCandidates.length < 2) {
    return false;
  }

  if (isBilingualWordCandidateSet(slotCandidates)) {
    return false;
  }

  const distinctLabels = new Set(
    slotCandidates
      .map((candidate) => normalizeCompareLookupText(getWordCandidateSlotMergeLabel(candidate) || candidate.anchorText || ''))
      .filter(Boolean)
  );

  // Keep identical bilingual headers like "品名 / 品名" and "数量 / 数量" separate.
  return distinctLabels.size >= 2;
}

function pickPrimaryWordSlotCandidate(slotCandidates: TemplateFieldCandidate[]): TemplateFieldCandidate {
  const getScore = (candidate: TemplateFieldCandidate): number => {
    const anchorText = candidate.localAnchorText || candidate.anchorText || '';
    const anchorLabel = getWordCandidateSlotMergeLabel(candidate);
    const headerFieldKey = resolveWordHeaderFieldKey(anchorText)
      || resolveWordHeaderFieldKey(anchorLabel);
    const languageHint = candidate.languageRelation?.currentLanguageHint || getWordCandidateLanguageHint(candidate);

    let score = 0;
    if (headerFieldKey) {
      score += 200;
    }
    if (languageHint === 'zh') {
      score += 80;
    } else if (languageHint === 'mixed') {
      score += 20;
    }
    if (candidate.fieldIdHint) {
      score += 24;
    }
    if (candidate.sampleValue) {
      score += 8;
    }
    score += Math.min(anchorLabel.length, 40);
    score += Math.round((candidate.confidence || 0) * 10);
    return score;
  };

  return [...slotCandidates].sort((left, right) => {
    const scoreDiff = getScore(right) - getScore(left);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    const labelLengthDiff = getWordCandidateSlotMergeLabel(right).length - getWordCandidateSlotMergeLabel(left).length;
    if (labelLengthDiff !== 0) {
      return labelLengthDiff;
    }

    return left.candidateId.localeCompare(right.candidateId);
  })[0];
}

export function mergeWordCandidatesBySlotForRecognition(candidates: TemplateFieldCandidate[]): TemplateFieldCandidate[] {
  if (candidates.length <= 1) {
    return candidates;
  }

  const sortedCandidates = sortWordCandidatesByPosition(candidates);
  const candidatesBySlot = new Map<string, TemplateFieldCandidate[]>();

  sortedCandidates.forEach((candidate) => {
    const slotKey = buildWordCandidateSlotMergeKey(candidate);
    const current = candidatesBySlot.get(slotKey) || [];
    current.push(candidate);
    candidatesBySlot.set(slotKey, current);
  });

  const mergedCandidates: TemplateFieldCandidate[] = [];
  candidatesBySlot.forEach((slotCandidates) => {
    if (!shouldMergeWordCandidatesInSameSlot(slotCandidates)) {
      mergedCandidates.push(...slotCandidates);
      return;
    }

    mergedCandidates.push(pickPrimaryWordSlotCandidate(slotCandidates));
  });

  return sortWordCandidatesByPosition(mergedCandidates);
}

export function buildWordSectionBilingualPairsForRecognition(
  candidates: TemplateFieldCandidate[],
): Array<{
  pairKey: string;
  candidates: [TemplateFieldCandidate, TemplateFieldCandidate];
}> {
  const seenPairKeys = new Set<string>();
  const pairs: Array<{
    pairKey: string;
    candidates: [TemplateFieldCandidate, TemplateFieldCandidate];
  }> = [];
  const candidateById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate] as const));

  candidates.forEach((candidate) => {
    const peerCandidateId = String(candidate.languageRelation?.peerCandidateId || '').trim();
    if (!isPairedWordLanguageRelationMode(candidate.languageRelation?.mode) || !peerCandidateId) {
      return;
    }
    const peerCandidate = candidateById.get(peerCandidateId);
    if (!peerCandidate) {
      return;
    }

    const pairKey = [candidate.candidateId, peerCandidate.candidateId].sort().join('|');
    if (!pairKey || seenPairKeys.has(pairKey)) {
      return;
    }

    seenPairKeys.add(pairKey);
    const orderedCandidates = sortWordCandidatesByPosition([candidate, peerCandidate]) as [TemplateFieldCandidate, TemplateFieldCandidate];
    pairs.push({
      pairKey,
      candidates: orderedCandidates,
    });
  });

  return pairs;
}

function removeCandidateIdFromQueues(candidateId: string, queues: string[][]): void {
  queues.forEach((queue) => {
    const index = queue.indexOf(candidateId);
    if (index >= 0) {
      queue.splice(index, 1);
    }
  });
}

function tryAddBatchCandidate(
  candidateId: string,
  batch: TemplateFieldCandidate[],
  batchCandidateIds: Set<string>,
  options: WordRecognitionBatchOptions,
): TemplateFieldCandidate | undefined {
  if (!candidateId || options.acceptedIds.has(candidateId) || batchCandidateIds.has(candidateId)) {
    return undefined;
  }

  const candidate = options.candidateById.get(candidateId);
  if (!candidate) {
    return undefined;
  }

  batch.push(candidate);
  batchCandidateIds.add(candidateId);
  return candidate;
}

function tryAddPeerCandidate(
  candidate: TemplateFieldCandidate,
  batch: TemplateFieldCandidate[],
  batchCandidateIds: Set<string>,
  options: WordRecognitionBatchOptions,
  sourceQueues: string[][],
): void {
  if (batch.length >= 6) {
    return;
  }

  const peerCandidateId = String(candidate.languageRelation?.peerCandidateId || '').trim();
  if (!isPairedWordLanguageRelationMode(candidate.languageRelation?.mode) || !peerCandidateId) {
    return;
  }

  const peerCandidate = tryAddBatchCandidate(peerCandidateId, batch, batchCandidateIds, options);
  if (!peerCandidate) {
    return;
  }

  removeCandidateIdFromQueues(peerCandidateId, sourceQueues);
}

export function takeWordRecognitionBatchForRecognition(
  options: WordRecognitionBatchOptions,
): TemplateFieldCandidate[] {
  const batch: TemplateFieldCandidate[] = [];
  const batchCandidateIds = new Set<string>();
  const sourceQueues = (
    options.retryLoopIds.length > 0 || options.unsentLoopIds.length > 0
      ? [options.retryLoopIds, options.unsentLoopIds]
      : [options.retryNormalIds, options.unsentNormalIds]
  );

  sourceQueues.forEach((queue) => {
    while (batch.length < 6 && queue.length > 0) {
      const candidateId = String(queue.shift() || '');
      const candidate = tryAddBatchCandidate(candidateId, batch, batchCandidateIds, options);
      if (!candidate) {
        continue;
      }

      // Keep bilingual pairs in the same prompt whenever there is still room in the batch.
      tryAddPeerCandidate(candidate, batch, batchCandidateIds, options, sourceQueues);
    }
  });

  return batch;
}
