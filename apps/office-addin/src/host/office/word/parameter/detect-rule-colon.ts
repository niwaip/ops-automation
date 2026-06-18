import {
  extractWordParamAnchorText,
  extractWordParamName,
  resolveExactHeaderFieldSpec,
} from './anchor';
import { isParagraphLikelyInsideWordTable } from './collect';
import {
  hasWordOrderedListFormat,
  looksLikeSectionLeadSentence,
  looksLikeWordHeaderTitle,
  looksLikeWordOrderedTitleLine,
} from './heading-filter';
import { buildWordParamPromptParts } from './prompt';
import { findSampleMatchForWordParam } from './sample';
import type {
  WordDetectedParam,
  WordGapParamMatch,
  WordParagraphLike,
  WordTableCellLike,
  WordUnderlineLike,
} from './types';
import { collectWordChapterHeadingParagraphIndexes } from '../chapter';
import { safeWordRuleText, truncateWordRuleText } from '../shared/text';

/**
 * Word 冒号参数识别规则。
 *
 * 当前规则要点：
 * 1. 仅处理非章节、非编号列表、非表格内文本的普通段落。
 * 2. 冒号后如果直接跟值，或只留 0-1 个空白后就跟值，不视为参数。
 * 3. 冒号后若先留出 2 个及以上空白，则视为占位区，可继续识别为参数。
 * 4. 同段内若存在下划线参数且参数名一致，优先保留下划线结果，跳过冒号候选。
 * 5. 对显式头字段（如地址、日期等），允许从下一行补取独立值作为 sampleValue。
 */

const WORD_REPEATED_LABEL_MAX_LENGTH = 16;
const WORD_COLON_ANCHOR_MAX_LENGTH = 80;
const WORD_INLINE_ANCHOR_MAX_LENGTH = 20;
const WORD_TERMINAL_ANCHOR_MAX_LENGTH = 24;
const WORD_TABLE_TEXT_DEDUPE_MAX_LENGTH = 40;
const WORD_PARAM_GAP_MIN_SPACES = 2;
const WORD_STANDALONE_VALUE_MAX_LENGTH = 80;

type WordColonCandidateMatch = {
  anchorText: string;
  start: number;
  end: number;
  lineIndex: number;
};

type WordLineSegment = {
  text: string;
  start: number;
  end: number;
};

export function extractRepeatedWordTrailingLabels(
  text: string
): Array<{ anchorText: string; start: number; end: number }> {
  const sourceText = String(text || '');
  if (
    !new RegExp(
      `^\\s*(?:[^\\s：:，。；;、]{1,${WORD_REPEATED_LABEL_MAX_LENGTH}}[：:]\\s*){2,}$`,
      'u'
    ).test(sourceText)
  ) {
    return [];
  }

  const matches = Array.from(
    sourceText.matchAll(
      new RegExp(`([^\\s：:，。；;、]{1,${WORD_REPEATED_LABEL_MAX_LENGTH}}[：:])`, 'gu')
    )
  );
  if (matches.length < 2) {
    return [];
  }

  return matches.map((match) => ({
    anchorText: safeWordRuleText(match[1]),
    start: match.index ?? 0,
    end: (match.index ?? 0) + String(match[1] || '').length,
  }));
}

function splitWordParagraphLines(text: string): WordLineSegment[] {
  const sourceText = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  if (!sourceText) {
    return [];
  }

  const segments: WordLineSegment[] = [];
  let cursor = 0;

  sourceText.split('\n').forEach((line) => {
    const lineStart = cursor;
    const lineEnd = lineStart + line.length;
    cursor = lineEnd + 1;

    const leadingWhitespace = line.match(/^\s*/u)?.[0].length || 0;
    const trimmedStart = Math.min(lineStart + leadingWhitespace, lineEnd);
    const trimmedText = sourceText.slice(trimmedStart, lineEnd).trim();
    if (!safeWordRuleText(trimmedText)) {
      return;
    }

    segments.push({
      text: sourceText.slice(trimmedStart, lineEnd),
      start: trimmedStart,
      end: lineEnd,
    });
  });

  return segments;
}

export function endsWithWordParamLabel(text: string): boolean {
  const normalized = safeWordRuleText(text);
  if (!normalized || normalized.length > WORD_COLON_ANCHOR_MAX_LENGTH) {
    return false;
  }
  if (!/[：:]$/u.test(normalized)) {
    return false;
  }
  if (looksLikeWordHeaderTitle(normalized)) {
    return false;
  }
  if (looksLikeSectionLeadSentence(normalized)) {
    return false;
  }
  return !new RegExp(
    `^[（(【\\[][^：:\\n]{1,${WORD_COLON_ANCHOR_MAX_LENGTH}}[）)】\\]][：:]$`,
    'u'
  ).test(normalized);
}

export function findWordInlineGapParam(text: string): WordGapParamMatch | null {
  const matched = String(text || '').match(
    new RegExp(
      `^\\s*((?:[^\\s：:()（）]{1,${WORD_INLINE_ANCHOR_MAX_LENGTH}}(?:[（(][^）)]{1,${WORD_INLINE_ANCHOR_MAX_LENGTH}}[）)])?)[：:])([ 　\\t]{${WORD_PARAM_GAP_MIN_SPACES},})(\\S.*)$`,
      'u'
    )
  );
  if (!matched) {
    return null;
  }

  const anchorText = safeWordRuleText(matched[1]);
  const suffixText = safeWordRuleText(matched[3]);
  if (!anchorText || !suffixText || looksLikeWordHeaderTitle(anchorText)) {
    return null;
  }

  const sourceText = String(text || '');
  const start = sourceText.indexOf(matched[2], sourceText.indexOf(matched[1]) + matched[1].length);
  if (start < 0) {
    return null;
  }
  const end = start + matched[2].length;
  return {
    anchorText,
    start,
    end,
  };
}

export function findWordTerminalGapParam(text: string): WordGapParamMatch | null {
  const sourceText = String(text || '');
  const matched = sourceText.match(
    new RegExp(
      `^\\s*((?:.{1,${WORD_TERMINAL_ANCHOR_MAX_LENGTH}})[：:])([ 　\\t]{${WORD_PARAM_GAP_MIN_SPACES},})$`,
      'u'
    )
  );
  if (!matched) {
    return null;
  }

  const anchorText = safeWordRuleText(matched[1]);
  if (!anchorText || looksLikeWordHeaderTitle(anchorText)) {
    return null;
  }

  const start = sourceText.indexOf(matched[2], sourceText.indexOf(matched[1]) + matched[1].length);
  if (start < 0) {
    return null;
  }
  const end = start + matched[2].length;
  return { anchorText, start, end };
}

function findWordColonAnchorStart(text: string, colonIndex: number): number {
  let cursor = colonIndex;
  while (cursor > 0) {
    const previousChar = text[cursor - 1];
    if (/[\n\r：:，。；;、]/u.test(previousChar)) {
      break;
    }
    cursor -= 1;
  }

  while (cursor < colonIndex && /\s/u.test(text[cursor])) {
    cursor += 1;
  }

  return cursor;
}

function findWordColonPlaceholderEnd(text: string, slotStart: number): number {
  let cursor = slotStart;
  while (cursor < text.length) {
    const currentChar = text[cursor];
    if (!/[\s\u00a0\u3000_＿﹍﹎﹏]/u.test(currentChar)) {
      break;
    }
    cursor += 1;
  }
  return cursor;
}

function buildWordColonCandidateMatches(text: string): WordColonCandidateMatch[] {
  const sourceText = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const lines = splitWordParagraphLines(sourceText);
  if (!sourceText || lines.length === 0) {
    return [];
  }

  return Array.from(sourceText.matchAll(/[：:]/gu)).flatMap((match) => {
    const colonIndex = match.index;
    if (typeof colonIndex !== 'number') {
      return [];
    }

    const anchorStart = findWordColonAnchorStart(sourceText, colonIndex);
    const anchorText = sourceText.slice(anchorStart, colonIndex + 1).trim();
    if (!anchorText || anchorText.length > WORD_COLON_ANCHOR_MAX_LENGTH) {
      return [];
    }

    const slotStart = colonIndex + 1;
    const slotEnd = findWordColonPlaceholderEnd(sourceText, slotStart);
    const lineIndex = lines.findIndex((line) => line.start <= colonIndex && colonIndex <= line.end);
    return [
      {
        anchorText,
        start: slotStart,
        end: slotEnd,
        lineIndex,
      },
    ];
  });
}

function extractWordColonStandaloneValue(
  lines: WordLineSegment[],
  lineIndex: number
): string | undefined {
  if (lineIndex < 0) {
    return undefined;
  }
  const nextLine = lines[lineIndex + 1];
  if (!nextLine || resolveExactHeaderFieldSpec(nextLine.text)) {
    return undefined;
  }

  const normalizedValue = String(nextLine.text || '')
    .replace(/^[：:\s　]+/u, '')
    .trim();
  if (!normalizedValue) {
    return undefined;
  }

  return truncateWordRuleText(normalizedValue, WORD_STANDALONE_VALUE_MAX_LENGTH);
}

function hasImmediateWordColonValue(
  paragraphText: string,
  candidate: Pick<WordColonCandidateMatch, 'start' | 'lineIndex'>,
  lines: WordLineSegment[]
): boolean {
  if (candidate.lineIndex < 0) {
    return false;
  }

  const currentLine = lines[candidate.lineIndex];
  if (!currentLine) {
    return false;
  }

  const inlineSlice = paragraphText.slice(candidate.start, currentLine.end);
  const inlineText = safeWordRuleText(inlineSlice);
  if (!inlineText) {
    return false;
  }

  const leadingWhitespaceCount = inlineSlice.match(/^[\s\u00a0\u3000]*/u)?.[0].length || 0;
  return leadingWhitespaceCount < WORD_PARAM_GAP_MIN_SPACES;
}

function buildWordParagraphHeadingIndexSet(paragraphs: WordParagraphLike[]): Set<number> {
  return collectWordChapterHeadingParagraphIndexes(
    paragraphs.map((paragraph) => ({
      id: paragraph.id,
      text: paragraph.text,
      paragraphIndex: paragraph.index,
      format: paragraph.format,
    }))
  );
}

export function detectWordColonParams(
  paragraphs: WordParagraphLike[],
  underlines: WordUnderlineLike[],
  tableCells: WordTableCellLike[],
  options?: {
    sampleText?: string;
    includeLabelOnly?: boolean;
    chapterHeadingParagraphIndexes?: Set<number>;
  }
): WordDetectedParam[] {
  const sampleText = options?.sampleText || '';
  const includeLabelOnly = options?.includeLabelOnly ?? true;
  const chapterHeadingParagraphIndexes =
    options?.chapterHeadingParagraphIndexes || buildWordParagraphHeadingIndexSet(paragraphs);
  const paragraphIdByIndex = new Map(
    paragraphs.map((paragraph) => [
      paragraph.index,
      paragraph.id || `word-paragraph-${paragraph.index}`,
    ])
  );
  const normalizedNonEmptyTableCellTexts = new Set(
    tableCells
      .map((cell) => String(cell.text || '').trim())
      .filter((text) => Boolean(text) && text.length <= WORD_TABLE_TEXT_DEDUPE_MAX_LENGTH)
      .map((text) => text.replace(/\s+/g, '').toLowerCase())
  );
  const hasUnderlineSiblingForParam = (paragraphIndex: number, paramName: string): boolean =>
    underlines.some(
      (underline) =>
        underline.paragraphIndex === paragraphIndex &&
        extractWordParamName(
          extractWordParamAnchorText(
            underline.paragraphText,
            underline.position.start,
            underline.position.end
          )
        ) === paramName
    );

  const params: WordDetectedParam[] = [];
  paragraphs.forEach((paragraph) => {
    if (chapterHeadingParagraphIndexes.has(paragraph.index)) {
      return;
    }
    if (hasWordOrderedListFormat(paragraph.format)) {
      return;
    }
    if (looksLikeWordOrderedTitleLine(paragraph.text)) {
      return;
    }
    if (isParagraphLikelyInsideWordTable(paragraph.text, tableCells)) {
      return;
    }

    const normalizedParagraphText = String(paragraph.text || '')
      .replace(/\s+/g, '')
      .toLowerCase();
    if (normalizedNonEmptyTableCellTexts.has(normalizedParagraphText)) {
      return;
    }

    const lines = splitWordParagraphLines(paragraph.text);
    const colonCandidates = buildWordColonCandidateMatches(paragraph.text);
    colonCandidates.forEach((candidate, candidateIndex) => {
      if (looksLikeWordOrderedTitleLine(candidate.anchorText)) {
        return;
      }
      if (hasImmediateWordColonValue(paragraph.text, candidate, lines)) {
        return;
      }
      const nextCandidate = colonCandidates[candidateIndex + 1];
      const sampleStopAnchorText = nextCandidate?.anchorText;
      const paramName = candidate.anchorText.replace(/[：:]$/u, '').trim() || '未命名参数';
      if (hasUnderlineSiblingForParam(paragraph.index, paramName)) {
        return;
      }

      const hasPlaceholder = candidate.end > candidate.start;
      const standaloneHeaderValue = resolveExactHeaderFieldSpec(candidate.anchorText)
        ? extractWordColonStandaloneValue(lines, candidate.lineIndex)
        : undefined;
      if (!hasPlaceholder && !includeLabelOnly && !standaloneHeaderValue) {
        return;
      }

      const param: WordDetectedParam = {
        id: hasPlaceholder
          ? `label-gap-${paragraph.index}-${candidateIndex}-${candidate.start}-${candidate.end}`
          : `label-only-${paragraph.index}-${candidateIndex}`,
        sourceType: 'label-only',
        paragraphIndex: paragraph.index,
        start: candidate.start,
        end: candidate.end,
        rawText: hasPlaceholder ? paragraph.text.slice(candidate.start, candidate.end) : '',
        underlineType: hasPlaceholder ? 'label-gap' : 'label-only',
        anchorText: candidate.anchorText,
        localAnchorText: candidate.anchorText,
        parameterSlot: hasPlaceholder
          ? buildWordParamPromptParts({
              paragraphText: paragraph.text,
              start: candidate.start,
              end: candidate.end,
              fallbackAnchorText: candidate.anchorText,
            }).parameterSlot
          : undefined,
        paramName,
        paragraphText: standaloneHeaderValue
          ? `${paragraph.text}\n${standaloneHeaderValue}`
          : paragraph.text,
        sourceBlockId: paragraphIdByIndex.get(paragraph.index),
      };
      param.parameterSlot =
        safeWordRuleText(`${candidate.anchorText}[参数]${sampleStopAnchorText || ''}`) ||
        param.parameterSlot ||
        `${candidate.anchorText}[参数]`;
      const sampleMatch = findSampleMatchForWordParam(sampleText, param);
      params.push({
        ...param,
        ...sampleMatch,
        sampleValue: sampleMatch.sampleValue || standaloneHeaderValue,
      });
    });
  });

  return params.filter((param, index, array) => {
    const key = `${param.sourceType}|${param.paragraphIndex}|${param.start}|${param.end}|${param.paramName}`;
    return (
      array.findIndex(
        (item) =>
          `${item.sourceType}|${item.paragraphIndex}|${item.start}|${item.end}|${item.paramName}` ===
          key
      ) === index
    );
  });
}
