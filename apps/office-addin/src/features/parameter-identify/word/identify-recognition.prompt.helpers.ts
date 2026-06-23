import type { DocumentIR } from '../../../host/adapters/document-ir';
import type { TemplateFieldCandidate } from '../../../api/carbone-api';
import { buildWordParamPromptParts } from '../../../host/office/word/parameter';
import {
  type WordSectionPromptBilingualGroup,
  type WordSectionPromptCandidate,
} from '../services/analysis-executor';
import {
  getWordCandidateLanguageHint,
  sortWordCandidatesByPosition,
} from '../../parameter-query/word/query-candidate-language.helpers';
import {
  getLanguageHintLabel,
  inferWordCandidateHints,
} from '../../parameter-query/word/query-compare.helpers';
import {
  buildWordSectionParagraphGroups,
  isWordAdjacentBilingualParagraphGroup,
} from '../../parameter-query/word/query-display.helpers';
import type { CompareCandidateSectionLike as CompareCandidateSection } from '../../parameter-query/word/query.types';
import {
  buildWordSectionBilingualPairsForRecognition,
  takeWordRecognitionBatchForRecognition,
} from '../shared/word-section-recognition';

function safeCompareText(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactWordPromptText(value: unknown, maxLength = 160): string {
  const normalized = safeCompareText(value);
  if (!normalized) {
    return '';
  }
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function buildWordSectionParagraphTextMap(documentIr: DocumentIR): Map<number, string> {
  return new Map(
    documentIr.elements
      .filter((element) => element.type === 'paragraph')
      .map((element) => [Number(element.hostData?.index), String(element.text || '')] as const)
      .filter(([index]) => Number.isFinite(index))
  );
}

function buildWordCandidatePromptSlot(
  candidate: CompareCandidateSection['candidates'][number],
  siblingCandidates: CompareCandidateSection['candidates'],
  paragraphTextByIndex: Map<number, string>
): { localAnchorText: string; parameterSlot?: string } {
  const paragraphIndex = candidate.location?.paragraphIndex;
  const paragraphText =
    typeof paragraphIndex === 'number'
      ? String(paragraphTextByIndex.get(paragraphIndex) || '')
      : '';
  const anchorStart = candidate.location?.anchorStart;
  const anchorEnd = candidate.location?.anchorEnd;
  const rawAnchorText = compactWordPromptText(candidate.anchorText || '无');

  if (!paragraphText || typeof anchorStart !== 'number' || typeof anchorEnd !== 'number') {
    return {
      localAnchorText: rawAnchorText,
      parameterSlot: rawAnchorText === '无' ? undefined : `[参数] ${rawAnchorText}`,
    };
  }

  const sameParagraphCandidates = siblingCandidates
    .filter(
      (item) =>
        item.candidateId !== candidate.candidateId &&
        item.location?.paragraphIndex === paragraphIndex &&
        typeof item.location?.anchorStart === 'number' &&
        typeof item.location?.anchorEnd === 'number'
    )
    .sort(
      (left, right) =>
        Number(left.location?.anchorStart || 0) - Number(right.location?.anchorStart || 0)
    );

  const promptParts = buildWordParamPromptParts({
    paragraphText,
    start: anchorStart,
    end: anchorEnd,
    siblingRanges: sameParagraphCandidates.map((item) => ({
      start: Number(item.location?.anchorStart),
      end: Number(item.location?.anchorEnd),
    })),
    fallbackAnchorText: candidate.anchorText || rawAnchorText,
  });

  return {
    localAnchorText:
      compactWordPromptText(promptParts.localAnchorText || rawAnchorText, 48) || rawAnchorText,
    parameterSlot: promptParts.parameterSlot
      ? compactWordPromptText(promptParts.parameterSlot, 120)
      : undefined,
  };
}

export function buildWordSectionPromptCandidates(
  documentIr: DocumentIR,
  section: CompareCandidateSection
): WordSectionPromptCandidate[] {
  const paragraphTextByIndex = buildWordSectionParagraphTextMap(documentIr);

  return section.candidates.map((candidate) => {
    const { localAnchorText, parameterSlot } = candidate.parameterSlot
      ? {
          localAnchorText: candidate.localAnchorText || candidate.anchorText || '无',
          parameterSlot: candidate.parameterSlot,
        }
      : buildWordCandidatePromptSlot(candidate, section.candidates, paragraphTextByIndex);
    const hints = inferWordCandidateHints(candidate);
    const isLoopCandidate = isWordLoopCompareCandidate(candidate);
    return {
      candidateId: candidate.candidateId,
      sourceBlockId: candidate.sourceBlockId,
      anchorText: compactWordPromptText(
        localAnchorText || candidate.localAnchorText || candidate.anchorText || '无'
      ),
      parameterSlot,
      sampleValue: compactWordPromptText(candidate.sampleValue || '无'),
      fieldIdHint: candidate.fieldIdHint || hints.fieldIdHint,
      fieldTypeHint: candidate.fieldTypeHint || hints.fieldTypeHint,
      generationPolicyHint: candidate.generationPolicyHint || hints.generationPolicyHint,
      language:
        candidate.languageRelation?.currentLanguageHint || getWordCandidateLanguageHint(candidate),
      paragraphIndex: candidate.location?.paragraphIndex,
      candidateType: isLoopCandidate ? 'loop_column' : 'variable',
      loopGroupKey:
        isLoopCandidate && typeof candidate.location?.tableIndex === 'number'
          ? `table-${candidate.location.tableIndex}`
          : undefined,
      tableIndex: candidate.location?.tableIndex,
      rowIndex: candidate.location?.rowIndex,
      cellIndex: candidate.location?.cellIndex,
    };
  });
}

export function buildWordSectionCandidateList(
  documentIr: DocumentIR,
  section: CompareCandidateSection
): string {
  if (section.candidates.length === 0) {
    return '当前章节没有显式候选参数。';
  }

  const paragraphTextByIndex = buildWordSectionParagraphTextMap(documentIr);

  return section.candidates
    .map((candidate, index) => {
      const { localAnchorText, parameterSlot } = candidate.parameterSlot
        ? {
            localAnchorText: candidate.localAnchorText || candidate.anchorText || '无',
            parameterSlot: candidate.parameterSlot,
          }
        : buildWordCandidatePromptSlot(candidate, section.candidates, paragraphTextByIndex);
      const anchorText = compactWordPromptText(
        localAnchorText || candidate.localAnchorText || candidate.anchorText || '无'
      );
      const sampleValue = compactWordPromptText(candidate.sampleValue || '无');
      const hints = inferWordCandidateHints(candidate);
      return [
        `[候选 ${index + 1}]`,
        `candidateId: ${candidate.candidateId}`,
        `anchorText: ${anchorText}`,
        parameterSlot ? `parameterSlot: ${parameterSlot}` : undefined,
        `sampleValue: ${sampleValue}`,
        candidate.fieldIdHint || hints.fieldIdHint
          ? `fieldIdHint: ${candidate.fieldIdHint || hints.fieldIdHint}`
          : undefined,
        isWordLoopCompareCandidate(candidate)
          ? `candidateType: loop_column(table-${candidate.location?.tableIndex ?? '?'})`
          : 'candidateType: variable',
        candidate.fieldTypeHint || hints.fieldTypeHint
          ? `fieldTypeHint: ${candidate.fieldTypeHint || hints.fieldTypeHint}`
          : undefined,
        candidate.generationPolicyHint || hints.generationPolicyHint
          ? `generationPolicyHint: ${candidate.generationPolicyHint || hints.generationPolicyHint}`
          : undefined,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

function buildWordSectionBilingualPairs(section: CompareCandidateSection): Array<{
  pairKey: string;
  candidates: [TemplateFieldCandidate, TemplateFieldCandidate];
}> {
  return buildWordSectionBilingualPairsForRecognition(section.candidates);
}

export function buildWordSectionBilingualPairList(
  documentIr: DocumentIR,
  section: CompareCandidateSection
): string {
  const sentenceGroups = buildWordSectionParagraphGroups(section.candidates, {
    sortWordCandidatesByPosition,
    getWordCandidateLanguageHint,
  });
  const bilingualGroups: Array<{
    left: (typeof sentenceGroups)[number];
    right: (typeof sentenceGroups)[number];
  }> = [];

  for (let index = 0; index < sentenceGroups.length - 1; index += 1) {
    const currentGroup = sentenceGroups[index];
    const nextGroup = sentenceGroups[index + 1];
    if (
      !currentGroup ||
      !nextGroup ||
      !isWordAdjacentBilingualParagraphGroup(currentGroup, nextGroup)
    ) {
      continue;
    }
    bilingualGroups.push(
      currentGroup.languageHint === 'zh'
        ? { left: currentGroup, right: nextGroup }
        : { left: nextGroup, right: currentGroup }
    );
    index += 1;
  }

  if (bilingualGroups.length === 0) {
    return '未识别到显式双语句子对照组。';
  }

  const paragraphTextByIndex = new Map(
    documentIr.elements
      .filter((element) => element.type === 'paragraph')
      .map((element) => [Number(element.hostData?.index), String(element.text || '')] as const)
      .filter(([index]) => Number.isFinite(index))
  );

  return bilingualGroups
    .map((group, index) => {
      const renderGroupLines = (
        candidates: TemplateFieldCandidate[],
        languageLabel: string,
        paragraphIndex: number
      ) => {
        const candidateLines = candidates.map((candidate) => {
          const { localAnchorText, parameterSlot } = candidate.parameterSlot
            ? {
                localAnchorText: candidate.localAnchorText || candidate.anchorText || '无',
                parameterSlot: candidate.parameterSlot,
              }
            : buildWordCandidatePromptSlot(candidate, section.candidates, paragraphTextByIndex);
          return [
            `${languageLabel} candidateId: ${candidate.candidateId}`,
            `sourceBlockId: ${candidate.sourceBlockId}`,
            `anchorText: ${compactWordPromptText(localAnchorText || candidate.localAnchorText || candidate.anchorText || '无')}`,
            parameterSlot ? `parameterSlot: ${parameterSlot}` : undefined,
          ]
            .filter(Boolean)
            .join('\n');
        });

        return [
          `${languageLabel} paragraphIndex: ${paragraphIndex}`,
          `${languageLabel} candidateCount: ${candidates.length}`,
          ...candidateLines,
        ].join('\n');
      };

      return [
        `[双语句子对照组 ${index + 1}]`,
        'pairRule: 当前对照组按句子为单位比较，参数顺序不要求一致；同一组内可出现 1比1 或 3比3。',
        renderGroupLines(
          group.left.candidates,
          getLanguageHintLabel(group.left.languageHint),
          group.left.paragraphIndex
        ),
        renderGroupLines(
          group.right.candidates,
          getLanguageHintLabel(group.right.languageHint),
          group.right.paragraphIndex
        ),
      ].join('\n');
    })
    .join('\n\n');
}

export function buildWordSectionPromptBilingualGroups(
  section: CompareCandidateSection
): WordSectionPromptBilingualGroup[] {
  return buildWordSectionBilingualPairs(section)
    .map((pair) => {
      const zhCandidateIds = pair.candidates
        .filter(
          (candidate) =>
            (candidate.languageRelation?.currentLanguageHint ||
              getWordCandidateLanguageHint(candidate)) === 'zh'
        )
        .map((candidate) => candidate.candidateId);
      const jpCandidateIds = pair.candidates
        .filter(
          (candidate) =>
            (candidate.languageRelation?.currentLanguageHint ||
              getWordCandidateLanguageHint(candidate)) === 'ja'
        )
        .map((candidate) => candidate.candidateId);

      if (zhCandidateIds.length === 0 || jpCandidateIds.length === 0) {
        return undefined;
      }

      return {
        groupKey: `pair:${zhCandidateIds.join(',')}|${jpCandidateIds.join(',')}`,
        pairType: 'candidate_pair' as const,
        zhCandidateIds,
        jpCandidateIds,
      };
    })
    .filter((group): group is WordSectionPromptBilingualGroup => Boolean(group));
}

export function buildWordSectionSubset(
  section: CompareCandidateSection,
  candidates: TemplateFieldCandidate[]
): CompareCandidateSection {
  return {
    ...section,
    candidates,
    previewCandidates: candidates,
    hiddenCandidateCount: 0,
  };
}

export function isWordLoopCompareCandidate(candidate: TemplateFieldCandidate): boolean {
  return String(candidate.matchReason || '').includes('标准表格列标题');
}

export function filterWordPromptBilingualGroupsByCandidates(
  groups: WordSectionPromptBilingualGroup[],
  candidates: TemplateFieldCandidate[]
): WordSectionPromptBilingualGroup[] {
  if (groups.length === 0 || candidates.length === 0) {
    return [];
  }

  const candidateIds = new Set(candidates.map((candidate) => candidate.candidateId));
  return groups.filter((group) => {
    const allIds = [...group.zhCandidateIds, ...group.jpCandidateIds];
    return allIds.every((candidateId) => candidateIds.has(candidateId));
  });
}

export function appendUniqueCandidateIds(targetQueue: string[], candidateIds: string[]): void {
  candidateIds.forEach((candidateId) => {
    if (!targetQueue.includes(candidateId)) {
      targetQueue.push(candidateId);
    }
  });
}

export function takeWordRecognitionBatch(options: {
  retryLoopIds: string[];
  unsentLoopIds: string[];
  retryNormalIds: string[];
  unsentNormalIds: string[];
  candidateById: Map<string, TemplateFieldCandidate>;
  acceptedIds: Set<string>;
}): TemplateFieldCandidate[] {
  return takeWordRecognitionBatchForRecognition(options);
}
