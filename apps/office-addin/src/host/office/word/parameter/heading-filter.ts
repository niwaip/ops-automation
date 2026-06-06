import type {
  WordParagraphLike,
  WordTableCellLike,
  WordUnderlineLike,
} from './types';
import { resolveExactHeaderFieldSpec, resolveHeaderFieldSpec } from './anchor';
import { hasWordHeadingStyle } from '../shared/heading';
import { normalizeWordLookupText, safeWordRuleText } from '../shared/text';

export type WordHeaderContext = {
  paragraphs?: WordParagraphLike[];
  paragraphIndex?: number;
  underlineCount?: number;
  repeatedLabelCount?: number;
  hasInlineGap?: boolean;
  hasTerminalGap?: boolean;
  underlinesByParagraph?: Map<number, WordUnderlineLike[]>;
};

export type WordHeaderTitleInspection = {
  normalizedText: string;
  displayText: string;
  matched: boolean;
  reason: string;
};

export type WordHeadingFilterDependencies = {
  findWordInlineGapParam?: (text: string) => unknown;
  findWordTerminalGapParam?: (text: string) => unknown;
  isParagraphLikelyInsideWordTable?: (paragraphText: string, tableCells: WordTableCellLike[]) => boolean;
  truncateWordRuleText?: (value: string, maxLength: number) => string;
};

export function isAttachmentHeading(text: string): boolean {
  return /^[\s　]*[【\[]?(?:附件|付属文書)(?:[一二三四五六七八九十百千万零两0-9０-９]+)?[】\]]?[\s　：:]*/u
    .test(String(text || '').trim());
}

export function looksLikeWordSemanticSectionTitle(displayText: string): boolean {
  if (!displayText || displayText.length > 40) {
    return false;
  }
  if (/[，。,.;；]/u.test(displayText)) {
    return false;
  }

  return /(?:定义|释义|义务|责任|期限|范围|内容|说明|条件|方式|程序|条款|例外|违约(?:责任)?|解除|通知|适用法律|争议解决|知识产权|保密(?:义务)?|专有信息(?:的定义)?)$/u
    .test(displayText);
}

export function looksLikeSectionLeadSentence(text: string): boolean {
  const normalized = safeWordRuleText(text);
  if (!normalized || normalized.length > 80) {
    return false;
  }

  if (!/[：:]$/u.test(normalized)) {
    return false;
  }

  const displayText = normalized.replace(/[：:]$/u, '').trim();
  if (!displayText) {
    return false;
  }

  const hiraganaMatches = displayText.match(/[\u3040-\u309f]/gu) || [];
  const hasJapaneseSentenceStyle = hiraganaMatches.length >= 2 && displayText.length >= 10;
  const hasChineseLeadCue = /(?:如下|说明如下|约定如下|内容如下|条款如下|方式如下|时间如下|支付如下)$/u.test(displayText);

  return hasJapaneseSentenceStyle || hasChineseLeadCue;
}

function getAdjacentNonEmptyWordParagraph(
  paragraphs: WordParagraphLike[] | undefined,
  paragraphIndex: number | undefined,
  direction: 1 | -1,
): WordParagraphLike | undefined {
  if (!paragraphs || typeof paragraphIndex !== 'number') {
    return undefined;
  }

  const sortedParagraphs = paragraphs
    .filter((paragraph) => safeWordRuleText(paragraph.text))
    .sort((left, right) => left.index - right.index);
  const currentPosition = sortedParagraphs.findIndex((paragraph) => paragraph.index === paragraphIndex);
  if (currentPosition < 0) {
    return undefined;
  }

  return sortedParagraphs[currentPosition + direction];
}

function looksLikeWordBodyParagraph(text: string, underlineCount = 0): boolean {
  const normalized = safeWordRuleText(text);
  if (!normalized) {
    return false;
  }

  if (underlineCount > 0) {
    return true;
  }

  return normalized.length >= 18 || /[，。,.;；！？!?]/u.test(normalized);
}

export function looksLikeContextualWordSectionLead(text: string, context?: WordHeaderContext): boolean {
  const normalized = safeWordRuleText(text);
  if (!normalized || !/[：:]$/u.test(normalized)) {
    return false;
  }

  const displayText = normalized.replace(/[：:]$/u, '').trim();
  if (!displayText || displayText.length < 3 || displayText.length > 40) {
    return false;
  }

  if (resolveHeaderFieldSpec(displayText)) {
    return false;
  }

  if (context?.hasInlineGap || context?.hasTerminalGap) {
    return false;
  }

  if ((context?.repeatedLabelCount || 0) >= 2) {
    return false;
  }

  if ((context?.underlineCount || 0) > 0) {
    return false;
  }

  const colonCount = (normalized.match(/[：:]/gu) || []).length;
  if (colonCount > 1) {
    return false;
  }

  const nextParagraph = getAdjacentNonEmptyWordParagraph(context?.paragraphs, context?.paragraphIndex, 1);
  const nextText = safeWordRuleText(nextParagraph?.text || '');
  if (!nextText) {
    return false;
  }

  const nextUnderlineCount = nextParagraph
    ? (context?.underlinesByParagraph?.get(nextParagraph.index)?.length || 0)
    : 0;
  const nextLooksHeading = looksLikeWordHeaderTitle(nextText, nextParagraph?.format);
  const nextLooksBody = looksLikeWordBodyParagraph(nextText, nextUnderlineCount);
  if (!nextLooksHeading && !nextLooksBody) {
    return false;
  }

  return /^[\u3040-\u30ff\u3400-\u9fffA-Za-z0-9\s　"'“”‘’()（）【】\[\]、，\-]+$/u.test(displayText);
}

function hasOfficeHeadingParagraphStyle(format?: Record<string, unknown>): boolean {
  return hasWordHeadingStyle(format)
    && Boolean(format?.style || format?.styleBuiltIn);
}

export function inspectWordHeaderTitle(
  text: string,
  format?: Record<string, unknown>,
  context?: WordHeaderContext,
): WordHeaderTitleInspection {
  const normalized = safeWordRuleText(text);
  if (!normalized) {
    return {
      normalizedText: '',
      displayText: '',
      matched: false,
      reason: 'empty_text',
    };
  }

  const displayText = normalized.replace(/[：:]$/u, '').trim();
  if (!displayText) {
    return {
      normalizedText: normalized,
      displayText,
      matched: false,
      reason: 'empty_display_text',
    };
  }

  if (hasOfficeHeadingParagraphStyle(format)) {
    return {
      normalizedText: normalized,
      displayText,
      matched: true,
      reason: 'office_heading_style',
    };
  }

  if (resolveHeaderFieldSpec(displayText)) {
    return {
      normalizedText: normalized,
      displayText,
      matched: false,
      reason: 'explicit_param_label',
    };
  }

  if (isAttachmentHeading(displayText)) {
    return {
      normalizedText: normalized,
      displayText,
      matched: true,
      reason: 'attachment_heading',
    };
  }

  if (/^(?:[一二三四五六七八九十百千万零两]+|[0-9０-９]+)[、.)）．]\s*.+$/u.test(displayText)) {
    return {
      normalizedText: normalized,
      displayText,
      matched: true,
      reason: 'ordered_heading',
    };
  }

  if (/^第[一二三四五六七八九十百千万零两0-9０-９]+[章节条編部節款項目](?:[\s　].*)?$/u.test(displayText)) {
    return {
      normalizedText: normalized,
      displayText,
      matched: true,
      reason: 'chapter_heading',
    };
  }

  if (looksLikeWordSemanticSectionTitle(displayText)) {
    return {
      normalizedText: normalized,
      displayText,
      matched: true,
      reason: 'semantic_section_title',
    };
  }

  if (looksLikeContextualWordSectionLead(text, context)) {
    return {
      normalizedText: normalized,
      displayText,
      matched: true,
      reason: 'contextual_section_lead',
    };
  }

  if (
    /(?:合同|协议|契約|契约)$/u.test(displayText)
    && displayText.length <= 40
    && !/[，。,.;；]/u.test(displayText)
  ) {
    return {
      normalizedText: normalized,
      displayText,
      matched: true,
      reason: 'document_title_suffix',
    };
  }

  return {
    normalizedText: normalized,
    displayText,
    matched: false,
    reason: 'no_heading_rule_matched',
  };
}

export function looksLikeWordHeaderTitle(
  text: string,
  format?: Record<string, unknown>,
  context?: WordHeaderContext,
): boolean {
  return inspectWordHeaderTitle(text, format, context).matched;
}

export function looksLikeWordOrderedTitleLine(text: string): boolean {
  const normalized = safeWordRuleText(text);
  if (!normalized) {
    return false;
  }

  const displayText = normalized.replace(/[：:]$/u, '').trim();
  if (!displayText) {
    return false;
  }

  if (/^(?:[一二三四五六七八九十百千万零两]+|[0-9０-９]+)[、.)）．]\s*\S+/u.test(displayText)) {
    return true;
  }

  if (/^第[一二三四五六七八九十百千万零两0-9０-９]+[章节条編部節款項目](?:[\s　].*)?$/u.test(displayText)) {
    return true;
  }

  if (/^[0-9０-９]+(?:\.[0-9０-９]+){0,2}[.)）．]\s*\S+/u.test(displayText)) {
    return true;
  }

  return false;
}

export function hasWordOrderedListFormat(format?: Record<string, unknown>): boolean {
  const isListItem = Boolean(format?.isListItem);
  const listString = String(format?.listString || '').trim();
  if (!isListItem || !listString) {
    return false;
  }

  return /^(?:[0-9０-９]+(?:\.[0-9０-９]+){0,5}|[一二三四五六七八九十百千万零两]+)[.)、．]?$|^第?[一二三四五六七八九十百千万零两0-9０-９]+[章节條条編部節款項目]?$/u
    .test(listString);
}

export function inferWordTitleBlockLanguage(text: string): 'zh' | 'ja' | 'other' {
  const normalized = safeWordRuleText(text);
  if (!normalized) {
    return 'other';
  }
  if (/[\u3040-\u30ff]/u.test(normalized)) {
    return 'ja';
  }
  if (/[\u3400-\u9fff]/u.test(normalized)) {
    return 'zh';
  }
  return 'other';
}

export function looksLikeWordTitleBlockParagraph(
  text: string,
  deps: WordHeadingFilterDependencies = {},
): boolean {
  const normalized = safeWordRuleText(text);
  if (!normalized || !/[：:]$/u.test(normalized)) {
    return false;
  }
  if (deps.findWordInlineGapParam?.(normalized) || deps.findWordTerminalGapParam?.(normalized)) {
    return false;
  }
  return normalized.length <= 120;
}

export function collectWordTitleBlockParagraphIndexes(
  paragraphs: WordParagraphLike[],
  tableCells: WordTableCellLike[],
  deps: WordHeadingFilterDependencies = {},
): Set<number> {
  const normalizedNonEmptyTableCellTexts = new Set(
    tableCells
      .map((cell) => safeWordRuleText(cell.text))
      .filter((text) => Boolean(text) && text.length <= 40)
      .map((text) => normalizeWordLookupText(text))
  );
  const eligibleParagraphs = paragraphs
    .filter((paragraph) => !deps.isParagraphLikelyInsideWordTable?.(paragraph.text, tableCells))
    .filter((paragraph) => !normalizedNonEmptyTableCellTexts.has(normalizeWordLookupText(paragraph.text)))
    .filter((paragraph) => looksLikeWordTitleBlockParagraph(paragraph.text, deps))
    .sort((left, right) => left.index - right.index);
  const skippedIndexes = new Set<number>();

  let blockStart = 0;
  while (blockStart < eligibleParagraphs.length) {
    const block: WordParagraphLike[] = [eligibleParagraphs[blockStart]];
    let cursor = blockStart + 1;
    while (
      cursor < eligibleParagraphs.length
      && eligibleParagraphs[cursor].index - eligibleParagraphs[cursor - 1].index <= 1
    ) {
      block.push(eligibleParagraphs[cursor]);
      cursor += 1;
    }

    const languageSet = new Set(block.map((paragraph) => inferWordTitleBlockLanguage(paragraph.text)));
    const hasBilingual = languageSet.has('zh') && languageSet.has('ja');
    const orderedCount = block.filter((paragraph) => looksLikeWordOrderedTitleLine(paragraph.text)).length;

    if (block.length >= 2 && hasBilingual && orderedCount >= 1) {
      block.forEach((paragraph) => skippedIndexes.add(paragraph.index));
    }

    blockStart = cursor;
  }

  return skippedIndexes;
}

export function extractStandaloneHeaderLineValue(
  segments: Array<{ text: string; start: number; end: number }>,
  currentIndex: number,
  deps: WordHeadingFilterDependencies = {},
): string | undefined {
  const nextSegment = segments[currentIndex + 1];
  if (!nextSegment) {
    return undefined;
  }

  if (resolveExactHeaderFieldSpec(nextSegment.text)) {
    return undefined;
  }

  const normalizedValue = safeWordRuleText(nextSegment.text.replace(/^[：:\s　]+/u, ''));
  if (!normalizedValue) {
    return undefined;
  }

  return deps.truncateWordRuleText
    ? deps.truncateWordRuleText(normalizedValue, 80)
    : normalizedValue;
}

export function shouldSkipOrderedBridgeLabelSegment(
  segments: Array<{ text: string; start: number; end: number }>,
  currentIndex: number,
): boolean {
  const currentText = safeWordRuleText(segments[currentIndex]?.text || '');
  if (!currentText || !/[：:]$/u.test(currentText)) {
    return false;
  }

  const previousText = safeWordRuleText(segments[currentIndex - 1]?.text || '');
  const nextText = safeWordRuleText(segments[currentIndex + 1]?.text || '');
  const previousOrdered = looksLikeWordOrderedTitleLine(previousText);
  const nextOrdered = looksLikeWordOrderedTitleLine(nextText);

  if (previousOrdered && nextOrdered) {
    return true;
  }

  const currentOrdered = looksLikeWordOrderedTitleLine(currentText);
  const previousPrevText = safeWordRuleText(segments[currentIndex - 2]?.text || '');
  const nextNextText = safeWordRuleText(segments[currentIndex + 2]?.text || '');

  if (
    currentOrdered
    && nextText
    && /[：:]$/u.test(nextText)
    && !looksLikeWordOrderedTitleLine(nextText)
    && looksLikeWordOrderedTitleLine(nextNextText)
  ) {
    return true;
  }

  if (
    currentOrdered
    && previousText
    && /[：:]$/u.test(previousText)
    && !looksLikeWordOrderedTitleLine(previousText)
    && looksLikeWordOrderedTitleLine(previousPrevText)
  ) {
    return true;
  }

  return false;
}
