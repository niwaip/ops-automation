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
};

export type WordSectionDisplayLanguage = 'zh' | 'ja' | 'en';
export type WordSectionLanguageMode = 'zh' | 'ja' | 'bilingual' | 'auto';

export type WordSectionDetectorOptions = {
  languageMode?: WordSectionLanguageMode;
  preferredLanguages?: WordSectionDisplayLanguage[];
  mergeAdjacentBilingualHeadings?: boolean;
};

type HeadingCandidate = {
  id: string;
  text: string;
  paragraphIndex: number;
  normalizedText: string;
  language: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';
  level: number;
  isAttachment: boolean;
  hasKana: boolean;
  hasAscii: boolean;
};

function normalizeHeadingText(value: string): string {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/[【】\[\]（）()]/g, '')
    .replace(/[：:]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeDisplayTitle(value: string): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[：:]\s*$/u, '')
    .trim();
}

function stripLeadingSectionMarker(value: string): string {
  return String(value || '')
    .replace(/^\s*第?[一二三四五六七八九十百千万零两0-9０-９]+[章节条編部節款項目]?[\s　、，,.\-．)]*\s*/u, '')
    .trim();
}

function detectLanguage(value: string): 'zh' | 'ja' | 'en' | 'mixed' | 'unknown' {
  const text = String(value || '');
  const hasZh = /[\u4e00-\u9fff]/.test(text);
  const hasJaKana = /[\u3040-\u30ff]/.test(text);
  const hasEn = /[A-Za-z]/.test(text);

  const languageCount = Number(hasZh) + Number(hasJaKana) + Number(hasEn);
  if (languageCount > 1) {
    return 'mixed';
  }
  if (hasJaKana) {
    return 'ja';
  }
  if (hasZh) {
    return 'zh';
  }
  if (hasEn) {
    return 'en';
  }
  return 'unknown';
}

function hasJapaneseKana(value: string): boolean {
  return /[\u3040-\u30ff]/.test(String(value || ''));
}

function hasAsciiLetter(value: string): boolean {
  return /[A-Za-z]/.test(String(value || ''));
}

function hasHeadingStyle(format?: Record<string, unknown>): boolean {
  const isTitle = Boolean(format?.isTitle);
  const isBold = Boolean(format?.isBold);
  const fontSize = Number(format?.fontSize || 0);
  const alignment = String(format?.alignment || '').toLowerCase();
  return isTitle || isBold || fontSize >= 14 || alignment === 'center';
}

function isAttachmentHeading(text: string): boolean {
  return /^[\s　]*[【\[]?附件(?:[一二三四五六七八九十百千万零两0-9０-９]+)?[】\]]?[\s　：:]*/u.test(
    String(text || '').trim()
  );
}

function detectHeadingLevel(text: string): number | null {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  if (isAttachmentHeading(normalized)) {
    return 1;
  }

  if (/^第[一二三四五六七八九十百千万零两0-9０-９]+[章节編部節款項目](?:[\s　:：.、\-].*)?$/u.test(normalized)) {
    return 1;
  }

  if (/^第[一二三四五六七八九十百千万零两0-9０-９]+条(?:[\s　(（].*)?$/u.test(normalized)) {
    return 1;
  }

  if (/^(?:[一二三四五六七八九十百千万零两]+|[0-9０-９]+)[、.)）．]\s*.+$/u.test(normalized)) {
    return 1;
  }

  if (/^(?:article|Article|ARTICLE)\s*[0-9]+(?:[\s.:：-].*)?$/.test(normalized)) {
    return 1;
  }

  return null;
}

function isPotentialSectionHeading(paragraph: WordSectionParagraph): boolean {
  const text = String(paragraph.text || '').trim();
  if (!text) {
    return false;
  }

  const compactText = text.replace(/\s+/g, ' ');
  if (compactText.length > 60) {
    return false;
  }

  if (detectHeadingLevel(text) !== null) {
    return true;
  }

  if (!hasHeadingStyle(paragraph.format)) {
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

function toHeadingCandidate(paragraph: WordSectionParagraph, index: number): HeadingCandidate | null {
  if (!isPotentialSectionHeading(paragraph)) {
    return null;
  }

  const text = String(paragraph.text || '').trim();
  const isAttachment = isAttachmentHeading(text);
  const level = detectHeadingLevel(text) ?? 1;

  return {
    id: paragraph.id || `word-section-${index}`,
    text,
    paragraphIndex: paragraph.paragraphIndex,
    normalizedText: normalizeHeadingText(stripLeadingSectionMarker(text)),
    language: detectLanguage(text),
    level,
    isAttachment,
    hasKana: hasJapaneseKana(text),
    hasAscii: hasAsciiLetter(text),
  };
}

function shouldMergeBilingualHeading(
  current: HeadingCandidate,
  next: HeadingCandidate,
  options?: WordSectionDetectorOptions
): boolean {
  if (current.level !== next.level) {
    return false;
  }

  if (current.isAttachment || next.isAttachment) {
    return false;
  }

  if (next.paragraphIndex - current.paragraphIndex > 1) {
    return false;
  }

  if (options?.mergeAdjacentBilingualHeadings === false) {
    return false;
  }

  if (current.normalizedText === next.normalizedText) {
    return true;
  }

  const languagePair = new Set(
    [current.language, next.language].filter((language): language is 'zh' | 'ja' | 'en' =>
      language === 'zh' || language === 'ja' || language === 'en'
    )
  );
  if (languagePair.size === 2) {
    return true;
  }

  // Some Japanese headings contain only Kanji and get classified as zh.
  // When two short heading lines are adjacent, treat them as a bilingual pair
  // if either line has Kana or both lines look like mirrored heading labels.
  if (current.hasKana || next.hasKana) {
    return true;
  }

  const currentShort = normalizeDisplayTitle(current.text).length <= 28;
  const nextShort = normalizeDisplayTitle(next.text).length <= 28;
  const samePunctuationShape = /[：:]$/.test(current.text) === /[：:]$/.test(next.text);
  const bothNonAscii = !current.hasAscii && !next.hasAscii;
  const mirroredAsciiShape = current.hasAscii !== next.hasAscii;
  return currentShort && nextShort && samePunctuationShape && (bothNonAscii || mirroredAsciiShape);
}

function resolvePreferredLanguages(options?: WordSectionDetectorOptions): WordSectionDisplayLanguage[] {
  const preferredLanguages = Array.isArray(options?.preferredLanguages)
    ? options.preferredLanguages.filter((language): language is WordSectionDisplayLanguage =>
      language === 'zh' || language === 'ja' || language === 'en'
    )
    : [];

  if (preferredLanguages.length > 0) {
    return Array.from(new Set(preferredLanguages));
  }

  switch (options?.languageMode || 'auto') {
    case 'zh':
      return ['zh'];
    case 'ja':
      return ['ja'];
    case 'bilingual':
      return ['zh', 'ja'];
    case 'auto':
    default:
      return ['zh', 'ja', 'en'];
  }
}

function pickHeadingTitleByLanguage(
  group: HeadingCandidate[],
  language: WordSectionDisplayLanguage
): string | null {
  const heading = group.find((item) => {
    if (language === 'zh') {
      return item.language === 'zh' || item.language === 'mixed';
    }
    if (language === 'ja') {
      return item.language === 'ja' || item.hasKana;
    }
    return item.language === 'en' || (item.language === 'mixed' && item.hasAscii);
  });

  const title = normalizeDisplayTitle(heading?.text || '');
  return title || null;
}

function buildSectionTitle(group: HeadingCandidate[], options?: WordSectionDetectorOptions): string {
  const preferredLanguages = resolvePreferredLanguages(options);
  const firstHeading = group[0];
  const matchedTitles = preferredLanguages
    .map((language) => pickHeadingTitleByLanguage(group, language))
    .filter((title): title is string => Boolean(title));

  if (matchedTitles.length === 0) {
    return normalizeDisplayTitle(firstHeading?.text || '未命名章节');
  }

  if (preferredLanguages.length === 1) {
    return matchedTitles[0];
  }

  return Array.from(new Set(matchedTitles)).join(' / ') || normalizeDisplayTitle(firstHeading?.text || '未命名章节');
}

export function deriveWordSectionsFromParagraphs(
  paragraphs: WordSectionParagraph[],
  options?: WordSectionDetectorOptions
): WordDetectedSection[] {
  const normalizedParagraphs = paragraphs
    .filter((paragraph) => String(paragraph.text || '').trim())
    .sort((left, right) => left.paragraphIndex - right.paragraphIndex);

  const headingCandidates = normalizedParagraphs
    .map((paragraph, index) => toHeadingCandidate(paragraph, index))
    .filter((item): item is HeadingCandidate => Boolean(item));

  if (headingCandidates.length === 0) {
    return [];
  }

  const groupedHeadings: HeadingCandidate[][] = [];
  for (const candidate of headingCandidates) {
    const currentGroup = groupedHeadings[groupedHeadings.length - 1];
    if (currentGroup && shouldMergeBilingualHeading(currentGroup[currentGroup.length - 1], candidate, options)) {
      currentGroup.push(candidate);
      continue;
    }
    groupedHeadings.push([candidate]);
  }

  return groupedHeadings.map((group, index) => {
    const nextGroup = groupedHeadings[index + 1];
    const startParagraphIndex = group[0].paragraphIndex;
    const endParagraphIndex = nextGroup
      ? nextGroup[0].paragraphIndex - 1
      : normalizedParagraphs[normalizedParagraphs.length - 1]?.paragraphIndex ?? startParagraphIndex;

    return {
      sectionKey: group[0].id || `word-section-${index}`,
      sectionTitle: buildSectionTitle(group, options),
      startParagraphIndex,
      endParagraphIndex,
      headingParagraphIndices: group.map((item) => item.paragraphIndex),
      headingTexts: group.map((item) => item.text),
      isAttachment: group.some((item) => item.isAttachment),
    };
  });
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
