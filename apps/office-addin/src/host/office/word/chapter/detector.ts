import { extractHeadingLevelFromStyleName } from '../shared/heading';

/**
 * Word 章节检测工具。
 * 负责从段落或 Document IR 中识别章节标题，并按章节边界切分正文范围。
 */

export type WordSectionParagraph = {
  id?: string;
  text: string;
  paragraphIndex: number;
  format?: Record<string, unknown>;
};

export type WordDetectedSection = {
  sectionKey: string;
  sectionTitle: string;
  startParagraphIndex: number;
  endParagraphIndex: number;
  headingParagraphIndices: number[];
  headingTexts: string[];
  isAttachment: boolean;
  regionType?: 'body' | 'chapter';
  detectionSource?: 'office_api' | 'special_rule' | 'derived';
};

export type WordSectionDisplayLanguage = 'zh' | 'ja' | 'en';
export type WordSectionLanguageMode = 'zh' | 'ja' | 'bilingual' | 'auto';

export type WordSectionSpecialRule = {
  name: string;
  pattern: RegExp;
  level?: number;
};

export type WordSectionDetectorOptions = {
  specialRules?: WordSectionSpecialRule[];
};

type HeadingCandidate = {
  id: string;
  text: string;
  paragraphIndex: number;
  level: number;
  source: 'office_api' | 'special_rule';
};

function normalizeDisplayTitle(value: string): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[：:]\s*$/u, '')
    .trim();
}

function inferWordHeadingLanguage(text: string): WordSectionDisplayLanguage | 'mixed' | 'other' {
  const normalized = normalizeDisplayTitle(text);
  if (!normalized) {
    return 'other';
  }

  const hasHiraganaOrKatakana = /[\u3040-\u30ff]/u.test(normalized);
  const hasCjk = /[\u3400-\u9fff]/u.test(normalized);
  const hasLatin = /[A-Za-z]/.test(normalized);

  if (hasHiraganaOrKatakana && (hasCjk || hasLatin)) {
    return 'mixed';
  }
  if (hasHiraganaOrKatakana) {
    return 'ja';
  }
  if (hasCjk) {
    return 'zh';
  }
  if (hasLatin) {
    return 'en';
  }

  return 'other';
}

function deriveTextualHeadingLevel(text: string): number | null {
  const normalized = normalizeDisplayTitle(text);
  if (!normalized) {
    return null;
  }

  if (
    /^[【\[]?(?:附件|付属文書)(?:[一二三四五六七八九十百千万零两0-9０-９]+)?[】\]]?(?:[\s　].*)?$/u.test(
      normalized
    )
  ) {
    return 1;
  }
  if (
    /^第[一二三四五六七八九十百千万零两0-9０-９]+[章节編部節款項目](?:[\s　：:].*)?$/u.test(
      normalized
    )
  ) {
    return 1;
  }
  if (/^(?:chapter|section|article)\s+[0-9ivx]+(?:[\s:.-].*)?$/iu.test(normalized)) {
    return 1;
  }
  if (/^[0-9０-９]+(?:\.[0-9０-９]+){1,3}(?:[\s　).）．:：-].*)?$/u.test(normalized)) {
    return Math.min((normalized.match(/\./g) || []).length + 2, 4);
  }
  if (/^(?:[一二三四五六七八九十百千万零两]+|[0-9０-９]+)[、.)）．]\s*\S+/u.test(normalized)) {
    return 2;
  }

  return null;
}

function looksLikeBilingualHeadingCompanion(text: string): boolean {
  const normalized = normalizeDisplayTitle(text);
  if (!normalized || normalized.length > 80) {
    return false;
  }
  if (/[。；;！？!?]/u.test(normalized)) {
    return false;
  }

  return isPotentialSectionHeadingText(normalized);
}

function isPotentialSectionHeadingText(text: string): boolean {
  const compactText = String(text || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!compactText || compactText.length > 60) {
    return false;
  }
  if (/[。；;！？!?]/.test(compactText)) {
    return false;
  }
  if (/[，,]/.test(compactText) && compactText.length > 24) {
    return false;
  }

  return /^(?:[\u3040-\u30ff\u3400-\u9fffA-Za-z0-9][\u3040-\u30ff\u3400-\u9fffA-Za-z0-9\s　、，,:：()（）・\/\-]*)$/u.test(
    compactText
  );
}

function hasVisibleHeadingMarker(text: string): boolean {
  const normalized = normalizeDisplayTitle(text);
  if (!normalized) {
    return false;
  }

  return (
    /^第[一二三四五六七八九十百千万零两0-9０-９]+[章节編部節款項目](?:[\s　：:].*)?$/u.test(
      normalized
    ) ||
    /^(?:chapter|section|article)\s+[0-9ivx]+(?:[\s:.-].*)?$/iu.test(normalized) ||
    /^(?:[一二三四五六七八九十百千万零两]+|[0-9０-９]+)[、.)）．]\s*\S+/u.test(normalized) ||
    /^[0-9０-９]+(?:\.[0-9０-９]+){1,3}(?:[\s　).）．:：-].*)?$/u.test(normalized)
  );
}

function deriveOfficeNumberingHeadingLevel(
  paragraph: WordSectionParagraph,
  styleLevel: number | null
): number | null {
  const format = paragraph.format;
  const isListItem = Boolean(format?.isListItem);
  const listLevel = Number(format?.listLevel);
  const listString = String(format?.listString || '').trim();
  if (!isListItem || !Number.isFinite(listLevel) || listLevel < 0 || !listString) {
    return null;
  }

  if (listLevel > 0 && styleLevel === null && !hasVisibleHeadingMarker(paragraph.text)) {
    return null;
  }

  return Math.min(listLevel + 1, 9);
}

function deriveOfficeHeadingLevel(paragraph: WordSectionParagraph): number | null {
  const text = String(paragraph.text || '').trim();
  if (!isPotentialSectionHeadingText(text)) {
    return null;
  }

  const styleLevel =
    extractHeadingLevelFromStyleName(String(paragraph.format?.styleBuiltIn || '')) ??
    extractHeadingLevelFromStyleName(String(paragraph.format?.style || ''));
  if (styleLevel !== null) {
    return styleLevel;
  }

  const numberingLevel = deriveOfficeNumberingHeadingLevel(paragraph, styleLevel);
  if (numberingLevel !== null) {
    return numberingLevel;
  }

  const textualLevel = deriveTextualHeadingLevel(text);
  if (textualLevel !== null) {
    return textualLevel;
  }

  const fontSize = Number(paragraph.format?.fontSize || 0);
  const isBold = Boolean(paragraph.format?.isBold);
  const isTitle = Boolean(paragraph.format?.isTitle);
  const alignment = String(paragraph.format?.alignment || '').toLowerCase();

  if (isTitle || (alignment === 'center' && fontSize >= 16)) {
    return 1;
  }
  if (fontSize >= 16) {
    return 1;
  }
  if ((fontSize >= 14 && isBold) || (alignment === 'center' && isBold)) {
    return 2;
  }
  if (fontSize >= 14 || isBold) {
    return 3;
  }

  return null;
}

function buildHeadingCandidate(
  paragraph: WordSectionParagraph,
  index: number,
  level: number,
  source: 'office_api' | 'special_rule'
): HeadingCandidate {
  const text = String(paragraph.text || '').trim();
  return {
    id: paragraph.id || `word-section-${index}`,
    text,
    paragraphIndex: paragraph.paragraphIndex,
    level,
    source,
  };
}

export function collectOfficeHeadingCandidates(
  paragraphs: WordSectionParagraph[]
): HeadingCandidate[] {
  return paragraphs
    .map((paragraph, index) => {
      const level = deriveOfficeHeadingLevel(paragraph);
      return level === null ? null : buildHeadingCandidate(paragraph, index, level, 'office_api');
    })
    .filter((item): item is HeadingCandidate => Boolean(item));
}

export function collectSpecialRuleHeadingCandidates(
  paragraphs: WordSectionParagraph[],
  options?: WordSectionDetectorOptions
): HeadingCandidate[] {
  const rules = Array.isArray(options?.specialRules) ? options.specialRules : [];
  return rules.flatMap((rule) =>
    paragraphs.flatMap((paragraph, index) => {
      const text = String(paragraph.text || '').trim();
      if (!text || !rule.pattern.test(text)) {
        return [];
      }
      return [buildHeadingCandidate(paragraph, index, rule.level || 1, 'special_rule')];
    })
  );
}

function dedupeHeadingCandidates(candidates: HeadingCandidate[]): HeadingCandidate[] {
  const sorted = [...candidates].sort((left, right) => left.paragraphIndex - right.paragraphIndex);
  const candidateMap = new Map<number, HeadingCandidate>();
  sorted.forEach((candidate) => {
    const current = candidateMap.get(candidate.paragraphIndex);
    if (!current || (current.source === 'special_rule' && candidate.source === 'office_api')) {
      candidateMap.set(candidate.paragraphIndex, candidate);
    }
  });
  return Array.from(candidateMap.values()).sort(
    (left, right) => left.paragraphIndex - right.paragraphIndex
  );
}

function collectPrimaryHeadingCandidates(
  paragraphs: WordSectionParagraph[],
  options?: WordSectionDetectorOptions
): HeadingCandidate[] {
  const headingCandidates = dedupeHeadingCandidates([
    ...collectOfficeHeadingCandidates(paragraphs),
    ...collectSpecialRuleHeadingCandidates(paragraphs, options),
  ]);
  if (headingCandidates.length === 0) {
    return [];
  }
  const primaryLevel = Math.min(...headingCandidates.map((candidate) => candidate.level));
  return headingCandidates.filter((candidate) => candidate.level === primaryLevel);
}

function collectBilingualCompanionHeadingIndexes(
  paragraphs: WordSectionParagraph[],
  headingCandidates: HeadingCandidate[]
): Set<number> {
  const paragraphByIndex = new Map(
    paragraphs.map((paragraph) => [paragraph.paragraphIndex, paragraph])
  );
  const headingIndexSet = new Set(headingCandidates.map((candidate) => candidate.paragraphIndex));
  const companionIndexes = new Set<number>();

  headingCandidates.forEach((candidate) => {
    const baseLanguage = inferWordHeadingLanguage(candidate.text);
    if (baseLanguage === 'other' || baseLanguage === 'mixed') {
      return;
    }

    [-1, 1].forEach((direction) => {
      const adjacentParagraph = paragraphByIndex.get(candidate.paragraphIndex + direction);
      if (!adjacentParagraph || headingIndexSet.has(adjacentParagraph.paragraphIndex)) {
        return;
      }

      const adjacentText = String(adjacentParagraph.text || '').trim();
      const adjacentLanguage = inferWordHeadingLanguage(adjacentText);
      if (
        adjacentLanguage === 'other' ||
        adjacentLanguage === 'mixed' ||
        adjacentLanguage === baseLanguage ||
        !looksLikeBilingualHeadingCompanion(adjacentText) ||
        deriveTextualHeadingLevel(adjacentText) !== null
      ) {
        return;
      }

      companionIndexes.add(adjacentParagraph.paragraphIndex);
    });
  });

  return companionIndexes;
}

export function collectWordChapterHeadingParagraphIndexes(
  paragraphs: WordSectionParagraph[],
  options?: WordSectionDetectorOptions
): Set<number> {
  const primaryHeadingCandidates = collectPrimaryHeadingCandidates(paragraphs, options);
  const headingIndexes = new Set(
    primaryHeadingCandidates.map((candidate) => candidate.paragraphIndex)
  );
  const companionIndexes = collectBilingualCompanionHeadingIndexes(
    paragraphs,
    primaryHeadingCandidates
  );
  companionIndexes.forEach((paragraphIndex) => headingIndexes.add(paragraphIndex));
  return headingIndexes;
}

function buildRegionSection(args: {
  sectionKey: string;
  sectionTitle: string;
  startParagraphIndex: number;
  endParagraphIndex: number;
  regionType: 'body';
}): WordDetectedSection | null {
  if (args.endParagraphIndex < args.startParagraphIndex) {
    return null;
  }

  return {
    sectionKey: args.sectionKey,
    sectionTitle: args.sectionTitle,
    startParagraphIndex: args.startParagraphIndex,
    endParagraphIndex: args.endParagraphIndex,
    headingParagraphIndices: [],
    headingTexts: [],
    isAttachment: false,
    regionType: args.regionType,
    detectionSource: 'derived',
  };
}

export function deriveWordSectionsFromParagraphs(
  paragraphs: WordSectionParagraph[],
  options?: WordSectionDetectorOptions
): WordDetectedSection[] {
  const normalizedParagraphs = paragraphs
    .filter((paragraph) => String(paragraph.text || '').trim())
    .sort((left, right) => left.paragraphIndex - right.paragraphIndex);

  if (normalizedParagraphs.length === 0) {
    return [];
  }

  const firstParagraphIndex = normalizedParagraphs[0].paragraphIndex;
  const lastParagraphIndex = normalizedParagraphs[normalizedParagraphs.length - 1].paragraphIndex;
  const primaryHeadingCandidates = collectPrimaryHeadingCandidates(normalizedParagraphs, options);

  if (primaryHeadingCandidates.length === 0) {
    const bodySection = buildRegionSection({
      sectionKey: 'word-body',
      sectionTitle: '正文',
      startParagraphIndex: firstParagraphIndex,
      endParagraphIndex: lastParagraphIndex,
      regionType: 'body',
    });
    return bodySection ? [bodySection] : [];
  }

  const sections: WordDetectedSection[] = [];
  const firstHeadingStart = primaryHeadingCandidates[0].paragraphIndex;
  const bodySection = buildRegionSection({
    sectionKey: 'word-body',
    sectionTitle: '正文',
    startParagraphIndex: firstParagraphIndex,
    endParagraphIndex: firstHeadingStart - 1,
    regionType: 'body',
  });
  if (bodySection) {
    sections.push(bodySection);
  }

  primaryHeadingCandidates.forEach((candidate, index) => {
    const nextCandidate = primaryHeadingCandidates[index + 1];
    const startParagraphIndex = candidate.paragraphIndex;
    const endParagraphIndex = nextCandidate ? nextCandidate.paragraphIndex - 1 : lastParagraphIndex;
    if (endParagraphIndex < startParagraphIndex) {
      return;
    }

    sections.push({
      sectionKey: candidate.id || `word-section-${index}`,
      sectionTitle: normalizeDisplayTitle(candidate.text) || '未命名章节',
      startParagraphIndex,
      endParagraphIndex,
      headingParagraphIndices: [candidate.paragraphIndex],
      headingTexts: [candidate.text],
      isAttachment: false,
      regionType: 'chapter',
      detectionSource: candidate.source,
    });
  });

  return sections;
}

export function deriveWordSectionsFromDocumentIr(
  templateDocumentIr: Record<string, any> | null,
  options?: WordSectionDetectorOptions
): WordDetectedSection[] {
  const elements = Array.isArray(templateDocumentIr?.elements) ? templateDocumentIr.elements : [];
  const paragraphs: WordSectionParagraph[] = elements
    .filter((element) => element?.type === 'paragraph')
    .map((element, index) => ({
      id: String(element.id || `word-section-${index}`),
      text: String(element.text || '').trim(),
      paragraphIndex: Number(element.hostData?.index),
      format: element.hostData?.format as Record<string, unknown> | undefined,
    }))
    .filter((paragraph) => Number.isFinite(paragraph.paragraphIndex) && paragraph.text);

  return deriveWordSectionsFromParagraphs(paragraphs, options);
}

function formatWordSectionParagraphText(text: string): string {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

export function collectWordSectionParagraphsFromDocumentIr(
  templateDocumentIr: Record<string, any> | null
): WordSectionParagraph[] {
  const elements = Array.isArray(templateDocumentIr?.elements) ? templateDocumentIr.elements : [];
  return elements
    .filter((element) => element?.type === 'paragraph')
    .map((element, index) => ({
      id: String(element.id || `word-section-${index}`),
      text: formatWordSectionParagraphText(String(element.text || '')),
      paragraphIndex: Number(element.hostData?.index),
      format: element.hostData?.format as Record<string, unknown> | undefined,
    }))
    .filter((paragraph) => Number.isFinite(paragraph.paragraphIndex) && paragraph.text)
    .sort((left, right) => left.paragraphIndex - right.paragraphIndex);
}

export function formatWordHeadingSource(source?: WordDetectedSection['detectionSource']): string {
  return source === 'office_api'
    ? 'office_api'
    : source === 'special_rule'
      ? 'special_rule'
      : 'derived';
}
