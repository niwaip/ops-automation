import type { DocumentIR } from '../../../host/adapters/document-ir';
import type { TemplateCompareResponse, TemplateFieldCandidate } from '../../../api/carbone-api';
import { deriveWordSectionsFromDocumentIr, type WordDetectedSection } from '../../../host/office/word/chapter';
import { mergeWordCandidatesBySlotForRecognition } from '../../parameter-identify/shared/word-section-recognition';

export type CompareCandidateSection = {
  sectionKey: string;
  sectionId?: string;
  sectionTitle: string;
  candidates: TemplateCompareResponse['candidateFields'];
  previewCandidates?: TemplateCompareResponse['candidateFields'];
  hiddenCandidateCount?: number;
  isAttachment?: boolean;
};

function toDisplaySection(section: Omit<CompareCandidateSection, 'previewCandidates' | 'hiddenCandidateCount'>): CompareCandidateSection {
  return {
    ...section,
    previewCandidates: section.candidates,
    hiddenCandidateCount: 0,
  };
}

export function buildCompareCandidateSections(
  compareResult: TemplateCompareResponse | null,
  compareDocumentIr: Record<string, any> | null,
): CompareCandidateSection[] {
  if (!compareResult) {
    return [];
  }

  const detectedSections = compareDocumentIr
    ? deriveWordSectionsFromDocumentIr(compareDocumentIr)
    : [];

  if (detectedSections.length > 0) {
    const chapterMap = new Map<string, CompareCandidateSection>(
      detectedSections.map((chapter: WordDetectedSection) => [
        chapter.sectionKey,
        {
          sectionKey: chapter.sectionKey,
          sectionId: chapter.sectionKey,
          sectionTitle: chapter.sectionTitle,
          candidates: [] as TemplateCompareResponse['candidateFields'],
          isAttachment: chapter.isAttachment,
        },
      ])
    );
    const unmatchedSections = new Map<string, CompareCandidateSection>();

    compareResult.candidateFields.forEach((candidate) => {
      const paragraphIndex = candidate.location?.paragraphIndex;
      const matchedChapter = typeof paragraphIndex === 'number'
        ? detectedSections.find((chapter: WordDetectedSection) =>
            paragraphIndex >= chapter.startParagraphIndex && paragraphIndex <= chapter.endParagraphIndex
          )
        : undefined;

      if (matchedChapter) {
        chapterMap.get(matchedChapter.sectionKey)?.candidates.push(candidate);
        return;
      }

      const fallbackKey = candidate.sectionId || candidate.sectionTitle || `__ungrouped__${candidate.sourceBlockId}`;
      const current: CompareCandidateSection = unmatchedSections.get(fallbackKey) || {
        sectionKey: fallbackKey,
        sectionId: candidate.sectionId,
        sectionTitle: candidate.sectionTitle || '未归类章节',
        candidates: [] as TemplateCompareResponse['candidateFields'],
        isAttachment: false,
      };
      current.candidates.push(candidate);
      unmatchedSections.set(fallbackKey, current);
    });

    return [
      ...Array.from(chapterMap.values()).filter((section) => section.candidates.length > 0),
      ...Array.from(unmatchedSections.values()),
    ].map(toDisplaySection);
  }

  const sectionOrder = new Map(
    compareResult.compareSummary.sections.map((section, index) => [section.sectionId, index])
  );
  const sectionMap = new Map<string, {
    sectionKey: string;
    sectionId?: string;
    sectionTitle: string;
    candidates: TemplateCompareResponse['candidateFields'];
    isAttachment?: boolean;
  }>();

  compareResult.candidateFields.forEach((candidate) => {
    const sectionKey = candidate.sectionId || candidate.sectionTitle || `__ungrouped__${candidate.sourceBlockId}`;
    const current = sectionMap.get(sectionKey) || {
      sectionKey,
      sectionId: candidate.sectionId,
      sectionTitle: candidate.sectionTitle || '未归类章节',
      candidates: [] as TemplateCompareResponse['candidateFields'],
      isAttachment: false,
    };
    current.candidates.push(candidate);
    sectionMap.set(sectionKey, current);
  });

  return Array.from(sectionMap.values())
    .sort((left, right) => {
      const leftOrder = left.sectionId ? sectionOrder.get(left.sectionId) : undefined;
      const rightOrder = right.sectionId ? sectionOrder.get(right.sectionId) : undefined;

      if (leftOrder !== undefined && rightOrder !== undefined) {
        return leftOrder - rightOrder;
      }
      if (leftOrder !== undefined) {
        return -1;
      }
      if (rightOrder !== undefined) {
        return 1;
      }
      return left.sectionTitle.localeCompare(right.sectionTitle, 'zh-Hans-CN');
    })
    .map(toDisplaySection);
}

export function buildSelectedRecognitionSections(
  compareCandidateSections: CompareCandidateSection[],
  selectedCompareSections: Record<string, boolean>,
  effectiveCompareCandidateFields: TemplateFieldCandidate[],
): CompareCandidateSection[] {
  const selectedSections = compareCandidateSections
    .filter((section) => selectedCompareSections[section.sectionKey] ?? true)
    .map((section) => ({
      sectionKey: section.sectionKey,
      sectionId: section.sectionId,
      sectionTitle: section.sectionTitle,
      candidates: mergeWordCandidatesBySlotForRecognition(section.candidates),
      isAttachment: section.isAttachment,
    }));

  if (selectedSections.length > 0) {
    return selectedSections;
  }

  if (effectiveCompareCandidateFields.length === 0) {
    return [];
  }

  return [{
    sectionKey: 'selected-word-candidates',
    sectionId: 'selected-word-candidates',
    sectionTitle: '已选章节',
    candidates: mergeWordCandidatesBySlotForRecognition(effectiveCompareCandidateFields),
    isAttachment: false,
  }];
}

export function buildWordSectionExcerpt(
  documentIr: DocumentIR,
  section: CompareCandidateSection,
  detectedSection?: WordDetectedSection
): string {
  const paragraphLines = documentIr.elements
    .filter((element) => {
      if (element.type !== 'paragraph') {
        return false;
      }
      const paragraphIndex = Number(element.hostData?.index);
      if (!Number.isFinite(paragraphIndex)) {
        return false;
      }
      if (detectedSection) {
        return paragraphIndex >= detectedSection.startParagraphIndex && paragraphIndex <= detectedSection.endParagraphIndex;
      }
      return section.candidates.some((candidate) => candidate.location?.paragraphIndex === paragraphIndex);
    })
    .map((element) => String(element.text || '').trim())
    .filter(Boolean)
    .slice(0, 12);

  if (paragraphLines.length > 0) {
    return paragraphLines.join('\n');
  }

  return section.candidates
    .map((candidate) => [candidate.anchorText, candidate.segmentText, candidate.sampleValue].filter(Boolean).join(' | '))
    .filter(Boolean)
    .slice(0, 10)
    .join('\n') || section.sectionTitle;
}

export function buildWordSectionDocumentIR(
  documentIr: DocumentIR,
  section: CompareCandidateSection,
  detectedSection?: WordDetectedSection
): DocumentIR {
  const sourceBlockIds = new Set(section.candidates.map((candidate) => candidate.sourceBlockId).filter(Boolean));
  const paragraphIndexes = new Set(
    section.candidates
      .map((candidate) => candidate.location?.paragraphIndex)
      .filter((value): value is number => typeof value === 'number')
  );

  const elements = documentIr.elements.filter((element) => {
    if (sourceBlockIds.has(element.id)) {
      return true;
    }

    if (element.type === 'paragraph') {
      const paragraphIndex = Number(element.hostData?.index);
      if (!Number.isFinite(paragraphIndex)) {
        return false;
      }
      if (detectedSection) {
        return paragraphIndex >= detectedSection.startParagraphIndex && paragraphIndex <= detectedSection.endParagraphIndex;
      }
      return paragraphIndexes.has(paragraphIndex);
    }

    if (element.type === 'cell') {
      return sourceBlockIds.has(element.id);
    }

    return false;
  });

  const paragraphCount = elements.filter((element) => element.type === 'paragraph').length;
  const tableCount = elements.filter((element) => element.type === 'table').length;
  const cellCount = elements.filter((element) => element.type === 'cell').length;

  return {
    ...documentIr,
    elements,
    anchors: documentIr.anchors,
    stats: {
      ...documentIr.stats,
      paragraphCount,
      tableCount,
      cellCount,
    },
  };
}

export function buildWordSectionDocumentContent(
  documentIr: DocumentIR,
  section: CompareCandidateSection,
  detectedSection?: WordDetectedSection
): string {
  const sectionDocumentIr = buildWordSectionDocumentIR(documentIr, section, detectedSection);
  const sectionTexts = sectionDocumentIr.elements
    .map((element) => String(element.text || '').trim())
    .filter(Boolean)
    .slice(0, 40);

  const sampleTexts = section.candidates
    .map((candidate) => {
      const matchText = String(candidate.matchText || '').trim();
      if (matchText) {
        return matchText;
      }

      const sampleValue = String(candidate.sampleValue || '').trim();
      const anchorText = String(candidate.anchorText || '').trim();
      if (sampleValue && anchorText) {
        return `${anchorText}：${sampleValue}`;
      }

      return '';
    })
    .filter(Boolean);
  const uniqueSampleTexts = Array.from(new Set(sampleTexts)).slice(0, 20);

  const combinedTexts: string[] = [];

  if (sectionTexts.length > 0) {
    combinedTexts.push('【模板段落】', ...sectionTexts);
  }

  if (uniqueSampleTexts.length > 0) {
    if (combinedTexts.length > 0) combinedTexts.push('');
    combinedTexts.push('【真实文档段落（辅助语境）】', ...uniqueSampleTexts);
  }

  if (combinedTexts.length > 0) {
    return combinedTexts.join('\n');
  }

  return buildWordSectionExcerpt(documentIr, section, detectedSection);
}
