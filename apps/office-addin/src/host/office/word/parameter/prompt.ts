import { extractWordParamName } from './anchor';
import {
  extractWordTrailingUnitLabel,
  shouldPreferWordTrailingUnitLabel,
} from './sample';
import { safeWordRuleText } from '../shared/text';

export function isUsefulWordPromptAnchor(text: string): boolean {
  return /[A-Za-z\u3400-\u9FFF\u3040-\u30FF]/u.test(text);
}

export function cleanWordPromptSideText(value: string, side: 'left' | 'right'): string {
  const normalized = safeWordRuleText(value);
  if (!normalized) {
    return '';
  }

  const chunks = normalized
    .split(/[，。；;、：:\n]/u)
    .map((item) => item.trim())
    .filter(Boolean);
  let nextValue = side === 'left'
    ? (chunks[chunks.length - 1] || normalized)
    : (chunks[0] || normalized);

  nextValue = nextValue
    .replace(/^[＋+\-−=,，、.。]+/u, '')
    .replace(/[＋+\-−=,，、.。]+$/u, '')
    .trim();

  return nextValue;
}

export const WORD_PROMPT_LEFT_CONTEXT_LIMIT = 5;
export const WORD_PROMPT_RIGHT_CONTEXT_LIMIT = 3;

export function trimWordPromptContext(value: string, side: 'left' | 'right', maxLength: number): string {
  const normalized = safeWordRuleText(value);
  if (!normalized) {
    return '';
  }

  return side === 'left'
    ? normalized.slice(-maxLength)
    : normalized.slice(0, maxLength);
}

export function isWordPromptTerminalBoundaryChar(char: string | undefined): boolean {
  return Boolean(char) && /[。！？.!?）)】\]]/u.test(String(char));
}

export function findWordPromptBoundaryBefore(text: string, start: number, minStart = 0): number {
  for (let index = start - 1; index >= minStart; index -= 1) {
    if (/[，。；;、：:\n]/u.test(text[index])) {
      return index + 1;
    }
  }
  return minStart;
}

export function findWordPromptBoundaryAfter(text: string, end: number, maxEnd = text.length): number {
  for (let index = end; index < maxEnd; index += 1) {
    if (/[，。；;、：:\n]/u.test(text[index])) {
      return index;
    }
  }
  return maxEnd;
}

export function buildWordParamPromptParts(args: {
  paragraphText: string;
  start: number;
  end: number;
  siblingRanges?: Array<{ start: number; end: number }>;
  fallbackAnchorText?: string;
}): { localAnchorText: string; parameterSlot?: string } {
  const paragraphText = String(args.paragraphText || '');
  const fallbackAnchorText = safeWordRuleText(args.fallbackAnchorText || '') || '未命名参数';
  if (!paragraphText || args.start < 0 || args.end < args.start) {
    return {
      localAnchorText: fallbackAnchorText,
      parameterSlot: fallbackAnchorText === '未命名参数' ? undefined : `[参数] ${fallbackAnchorText}`,
    };
  }

  const normalizedPrefix = safeWordRuleText(paragraphText.slice(0, args.start));
  const directLabelMatch = normalizedPrefix.match(/([^，。；;、\n]{1,40}[：:])\s*$/u);
  if (directLabelMatch?.[1]) {
    const directAnchorText = extractWordParamName(directLabelMatch[1]) || fallbackAnchorText;
    return {
      localAnchorText: directAnchorText,
      parameterSlot: directAnchorText ? `${directAnchorText}[参数]` : '[参数]',
    };
  }

  const siblingRanges = (args.siblingRanges || [])
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end))
    .sort((left, right) => left.start - right.start);
  const previousRange = [...siblingRanges]
    .filter((range) => range.end <= args.start)
    .sort((left, right) => right.end - left.end)[0];
  const nextRange = siblingRanges
    .filter((range) => range.start >= args.end)
    .sort((left, right) => left.start - right.start)[0];

  const hardWindowStart = previousRange?.end ?? 0;
  const hardWindowEnd = nextRange?.start ?? paragraphText.length;
  const localStart = findWordPromptBoundaryBefore(paragraphText, args.start, hardWindowStart);
  const localEnd = findWordPromptBoundaryAfter(paragraphText, args.end, hardWindowEnd);
  const beforeText = trimWordPromptContext(
    cleanWordPromptSideText(paragraphText.slice(localStart, args.start), 'left'),
    'left',
    WORD_PROMPT_LEFT_CONTEXT_LIMIT
  );
  let afterText = trimWordPromptContext(
    cleanWordPromptSideText(paragraphText.slice(args.end, localEnd), 'right'),
    'right',
    WORD_PROMPT_RIGHT_CONTEXT_LIMIT
  );
  if (!afterText && isWordPromptTerminalBoundaryChar(paragraphText[localEnd])) {
    afterText = paragraphText[localEnd];
  }

  const localAnchorText = shouldPreferWordTrailingUnitLabel(beforeText, afterText)
    ? extractWordTrailingUnitLabel(afterText)
    : (
      isUsefulWordPromptAnchor(beforeText)
        ? beforeText
        : (isUsefulWordPromptAnchor(afterText) ? afterText : fallbackAnchorText)
    );
  const parameterSlot = safeWordRuleText(`${beforeText}[参数]${afterText}`) || '[参数]';

  return {
    localAnchorText,
    parameterSlot,
  };
}
