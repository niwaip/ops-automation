import type { TemplateCompareResponse } from '../../../api/carbone-api';
import {
  deriveWordSectionsFromParagraphs,
  type WordDetectedSection,
  type WordSectionDisplayLanguage,
} from '../../../host/office/word/chapter';
import { detectWordParameterChecks } from '../../../host/office/word/parameter';
import { attachWordCandidateLanguageRelations } from './query-candidate-language.helpers';
import { inferWordCandidateHints, rebuildCompareSummary } from './query-compare.helpers';

export type CompareParagraphLike = {
  id: string;
  text: string;
  index: number;
  format: {
    fontSize?: number;
    isBold?: boolean;
    alignment?: string;
    isTitle?: boolean;
    style?: string;
    styleBuiltIn?: string;
  };
};

export type CompareUnderlineRangeLike = {
  text: string;
  underlineType: string;
  index: number;
  paragraphIndex: number;
  paragraphText: string;
  position: { start: number; end: number };
};

export type CompareTableCellInfoLike = {
  sourceBlockId?: string;
  tableIndex: number;
  rowIndex: number;
  cellIndex: number;
  text: string;
};

function safeCompareText(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCompareLookupText(value: unknown): string {
  return safeCompareText(value)
    .toLowerCase()
    .replace(/[，。、“”"'`~!@#$%^&*()_+\-=[\]{};:<>?,./\\|]/g, '');
}

export function buildTableAnchorParagraphMap(
  ooxml: string,
  paragraphs: CompareParagraphLike[]
): Map<number, number> {
  const anchors = new Map<number, number>();
  if (!ooxml.trim()) {
    return anchors;
  }

  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(ooxml, 'application/xml');
    const parserError = xml.getElementsByTagName('parsererror')[0];
    if (parserError) {
      return anchors;
    }

    const body = Array.from(xml.getElementsByTagName('*')).find(
      (node) => node.localName === 'body'
    );
    if (!body) {
      return anchors;
    }

    const normalizedParagraphs = paragraphs
      .filter((paragraph) => safeCompareText(paragraph.text))
      .sort((left, right) => left.index - right.index);
    let paragraphCursor = 0;
    let lastMatchedParagraphIndex: number | undefined;
    let tableIndex = 0;

    Array.from(body.childNodes).forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const element = node as Element;
      if (element.localName === 'p') {
        const paragraphText = safeCompareText(element.textContent || '');
        if (!paragraphText) {
          return;
        }

        const normalizedXmlText = normalizeCompareLookupText(paragraphText);
        if (!normalizedXmlText) {
          return;
        }

        for (let index = paragraphCursor; index < normalizedParagraphs.length; index += 1) {
          const candidate = normalizedParagraphs[index];
          const normalizedCandidate = normalizeCompareLookupText(candidate.text);
          if (!normalizedCandidate) {
            continue;
          }
          if (
            normalizedCandidate === normalizedXmlText ||
            normalizedCandidate.includes(normalizedXmlText) ||
            normalizedXmlText.includes(normalizedCandidate)
          ) {
            lastMatchedParagraphIndex = candidate.index;
            paragraphCursor = index + 1;
            break;
          }
        }
        return;
      }

      if (element.localName === 'tbl') {
        if (lastMatchedParagraphIndex !== undefined) {
          anchors.set(tableIndex, lastMatchedParagraphIndex);
        }
        tableIndex += 1;
      }
    });
  } catch {
    return anchors;
  }

  return anchors;
}

function getFrontendQueryCandidateConfidence(
  sourceType: 'underline' | 'label-only' | 'table-cell',
  underlineType?: string
): number {
  if (sourceType === 'table-cell') {
    if (underlineType === 'table-loop-column') {
      return 0.88;
    }
    if (underlineType === 'table-cell-top-label') {
      return 0.8;
    }
    if (underlineType === 'table-cell-right-label') {
      return 0.72;
    }
    return 0.84;
  }
  if (sourceType === 'label-only' && underlineType === 'label-gap') {
    return 0.82;
  }
  return sourceType === 'underline' ? 0.82 : 0.76;
}

function getFrontendQueryMatchReason(
  sourceType: 'underline' | 'label-only' | 'table-cell',
  underlineType?: string
): string {
  if (sourceType === 'table-cell') {
    if (underlineType === 'table-loop-column') {
      return '前端表格规则: 标准表格列标题';
    }
    if (underlineType === 'table-cell-top-label') {
      return '前端表格规则: 上方标题映射空白单元格';
    }
    if (underlineType === 'table-cell-right-label') {
      return '前端表格规则: 左侧缺失时取右侧标签';
    }
    return '前端表格规则: 空白单元格优先取左侧标签';
  }
  if (sourceType === 'label-only' && underlineType === 'label-gap') {
    return '前端下划线规则: 标签后下划线或空白占位';
  }
  return sourceType === 'underline'
    ? '前端下划线规则: 下划线或空格占位'
    : '前端冒号规则: 冒号后空白占位';
}

function isDetectedHeadingParagraph(
  paragraphIndex: number,
  detectedSections: WordDetectedSection[]
): boolean {
  return detectedSections.some(
    (section) =>
      section.headingParagraphIndices.includes(paragraphIndex) ||
      section.startParagraphIndex === paragraphIndex
  );
}

export function buildFrontendCompareResult(args: {
  templateType: string;
  headingLanguages: WordSectionDisplayLanguage[];
  paragraphs: CompareParagraphLike[];
  underlines: CompareUnderlineRangeLike[];
  tableCells: CompareTableCellInfoLike[];
  sampleText: string;
  tableAnchorParagraphMap: Map<number, number>;
}): TemplateCompareResponse {
  const {
    templateType,
    headingLanguages,
    paragraphs,
    underlines,
    tableCells,
    sampleText,
    tableAnchorParagraphMap,
  } = args;
  void headingLanguages;

  const nonEmptyParagraphs = paragraphs.filter((paragraph) => safeCompareText(paragraph.text));
  const detectedSections = deriveWordSectionsFromParagraphs(
    nonEmptyParagraphs.map((paragraph) => ({
      id: paragraph.id,
      text: paragraph.text,
      paragraphIndex: paragraph.index,
      format: paragraph.format,
    }))
  );

  const detectedParams = detectWordParameterChecks({
    templateType,
    paragraphs: nonEmptyParagraphs.map((paragraph) => ({
      id: paragraph.id,
      index: paragraph.index,
      text: paragraph.text,
      format: paragraph.format,
    })),
    underlines: underlines.map((underline) => ({
      text: underline.text,
      underlineType: underline.underlineType,
      paragraphIndex: underline.paragraphIndex,
      paragraphText: underline.paragraphText,
      position: underline.position,
    })),
    tableCells,
    sampleText,
    includeLabelOnly: true,
  }).filter((param) => {
    if (param.sourceType !== 'label-only') {
      return true;
    }
    if (param.underlineType === 'label-gap') {
      return true;
    }
    return !isDetectedHeadingParagraph(param.paragraphIndex, detectedSections);
  });

  const candidateFields = attachWordCandidateLanguageRelations(
    detectedParams.map((param, index) => {
      const targetParagraphIndex =
        param.sourceType === 'table-cell' && param.tableIndex !== undefined
          ? tableAnchorParagraphMap.get(param.tableIndex)
          : param.paragraphIndex;
      const matchedSection =
        typeof targetParagraphIndex === 'number'
          ? detectedSections.find(
              (section) =>
                targetParagraphIndex >= section.startParagraphIndex &&
                targetParagraphIndex <= section.endParagraphIndex
            )
          : undefined;

      const fallbackSectionId =
        param.sourceType === 'table-cell' && param.tableIndex !== undefined
          ? `table-${param.tableIndex}`
          : targetParagraphIndex !== undefined && targetParagraphIndex >= 0
            ? `paragraph-${targetParagraphIndex}`
            : `ungrouped-${index}`;
      const fallbackSectionTitle =
        param.sourceType === 'table-cell' && param.tableIndex !== undefined
          ? `表格 ${param.tableIndex + 1}`
          : typeof targetParagraphIndex === 'number' && targetParagraphIndex >= 0
            ? `段落 ${targetParagraphIndex + 1}`
            : '未归类章节';
      const matchReason = getFrontendQueryMatchReason(param.sourceType, param.underlineType);
      const candidateHints = inferWordCandidateHints({
        anchorText: param.anchorText,
        sampleValue: param.sampleValue || '',
        segmentText: param.paragraphText || param.anchorText,
        matchReason,
      });

      return {
        candidateId: `frontend-word-query-${index + 1}`,
        sourceBlockId: param.sourceBlockId || fallbackSectionId,
        anchorText: param.anchorText,
        localAnchorText: param.localAnchorText,
        parameterSlot: param.parameterSlot,
        sampleValue: param.sampleValue || '',
        segmentText: param.paragraphText || param.anchorText,
        sectionId: matchedSection?.sectionKey || fallbackSectionId,
        sectionTitle: matchedSection?.sectionTitle || fallbackSectionTitle,
        fieldTypeHint: candidateHints.fieldTypeHint,
        generationPolicyHint: candidateHints.generationPolicyHint,
        confidence: getFrontendQueryCandidateConfidence(param.sourceType, param.underlineType),
        matchText: param.sampleMatchText,
        matchReason,
        compareMode: 'structure_only',
        sectionMatchScore: matchedSection ? 1 : 0,
        fieldIdHint: candidateHints.fieldIdHint,
        location: {
          blockType: param.sourceType === 'table-cell' ? 'cell' : 'paragraph',
          paragraphIndex:
            typeof targetParagraphIndex === 'number' && targetParagraphIndex >= 0
              ? targetParagraphIndex
              : undefined,
          tableIndex: param.tableIndex,
          rowIndex: param.rowIndex,
          cellIndex: param.cellIndex,
          anchorStart: param.sourceType === 'table-cell' ? undefined : param.start,
          anchorEnd: param.sourceType === 'table-cell' ? undefined : param.end,
        },
        languageRelation: param.languageHint
          ? {
              mode: 'single_language' as const,
              currentLanguageHint: param.languageHint,
            }
          : undefined,
      };
    })
  );

  const summarySeed: TemplateCompareResponse['compareSummary'] = {
    candidateCount: candidateFields.length,
    sectionCount: detectedSections.length,
    sections: detectedSections.map((section) => ({
      sectionId: section.sectionKey,
      sectionTitle: section.sectionTitle,
      candidateCount: 0,
      matchedCandidateCount: 0,
      unmatchedCandidateCount: 0,
      highConfidenceCandidateCount: 0,
      compareStatus: 'attention' as const,
      compareMode: 'structure_only' as const,
      looseMatchScore: 0,
      topAnchors: [],
      samplePreview: undefined,
    })),
    warnings: [],
  };

  const warnings: string[] = [];
  if (candidateFields.length === 0) {
    warnings.push('当前模板未检测到参数候补，请检查文档类型、标题语言或模板中的占位写法。');
  }
  if (detectedSections.length === 0) {
    warnings.push('当前未识别到明确章节标题，已按参数自身位置回退分组。');
  }

  return {
    workflowId: `frontend-word-query-${templateType}`,
    compareId: `frontend-${Date.now()}`,
    candidateFields,
    compareSummary: {
      ...rebuildCompareSummary(summarySeed, candidateFields),
      warnings,
    },
    cacheStatus: {
      compareHit: false,
    },
  };
}
