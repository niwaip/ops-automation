import { getWordHeaderAliasCandidates } from './parameter';

const WORD_BLANK_PATTERNS = [
  /[＿_]{2,}/g,
  /[ 　\t]{2,}/g,
  /：\s{2,}/g,
  /:\s{2,}/g,
  /[\s＿_　]{2,}/g,
];

export function stripWordContextSnippet(contextSnippet: string): string {
  return String(contextSnippet || '')
    .split(/\r?\n/u)
    .map((line) => line.replace(/^[.\u2026]+|[.\u2026]+$/gu, '').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function extractLongestWordBlank(text: string): string {
  let longestBlank = '';
  for (const pattern of WORD_BLANK_PATTERNS) {
    const matches = text.match(pattern);
    if (!matches || matches.length === 0) {
      continue;
    }
    const currentLongest = matches.reduce(
      (left, right) => (left.length >= right.length ? left : right),
      ''
    );
    if (currentLongest.length > longestBlank.length) {
      longestBlank = currentLongest;
    }
  }
  return longestBlank;
}

export function extractWordLabelValueTarget(
  text: string
): { labelText: string; valueText: string } | null {
  const lines = stripWordContextSnippet(text)
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const labelMatch = /(^|[\s(（【[])([^，。；;\n]{1,24}[：:])/u.exec(line);
    if (!labelMatch || typeof labelMatch.index !== 'number') {
      continue;
    }

    const labelText = labelMatch[2].trim();
    const labelCore = labelText.replace(/[：:]$/u, '').trim();
    if (!labelCore) {
      continue;
    }
    if (/[，。；;]/u.test(labelCore)) {
      continue;
    }
    if (
      /(?:如下|如下所示|说明如下|约定如下|内容如下|条款如下|方式如下|时间如下|支付如下)$/u.test(
        labelCore
      )
    ) {
      continue;
    }

    const valueStart = labelMatch.index + labelMatch[0].length;
    const afterLabel = line.slice(valueStart).trim();
    if (!afterLabel) {
      continue;
    }

    const nextLabelMatch = /(^|[\s(（【[])[^，。；;\n]{1,24}[：:]/u.exec(afterLabel);
    let valueText =
      nextLabelMatch && typeof nextLabelMatch.index === 'number' && nextLabelMatch.index > 0
        ? afterLabel.slice(0, nextLabelMatch.index)
        : afterLabel;

    valueText = valueText.replace(/[，。；;]+$/u, '').trim();
    if (!valueText || valueText.length > 120) {
      continue;
    }

    return { labelText, valueText };
  }

  return null;
}

export function extractWordMultilineLabelValueTarget(
  text: string
): { labelText: string; valueText: string } | null {
  const lines = stripWordContextSnippet(text)
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length - 1; index += 1) {
    const labelText = lines[index];
    const valueText = lines[index + 1];
    if (!/[：:]$/u.test(labelText)) {
      continue;
    }

    const labelCore = labelText.replace(/[：:]$/u, '').trim();
    if (!labelCore || /[，。；;]/u.test(labelCore)) {
      continue;
    }
    if (!valueText || /[：:]$/u.test(valueText)) {
      continue;
    }
    if (valueText.length > 120) {
      continue;
    }

    return {
      labelText,
      valueText: valueText.replace(/[，。；;]+$/u, '').trim(),
    };
  }

  return null;
}

export function extractWordStandaloneLabelTarget(text: string): string | null {
  const lines = stripWordContextSnippet(text)
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (!/[：:]$/u.test(line)) {
      continue;
    }
    const labelCore = line.replace(/[：:]$/u, '').trim();
    if (!labelCore || /[，。；;]/u.test(labelCore)) {
      continue;
    }
    return line;
  }

  return null;
}

export function buildWordContextSearchTexts(contextSnippet: string): string[] {
  const normalizedSnippet = stripWordContextSnippet(contextSnippet);
  if (!normalizedSnippet) {
    return [];
  }

  const lines = normalizedSnippet
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter((line) => line.length >= 2);

  const aliasLines = lines.flatMap((line) => {
    const standaloneLabel = extractWordStandaloneLabelTarget(line);
    if (standaloneLabel) {
      return getWordHeaderAliasCandidates(standaloneLabel);
    }

    const labelValueTarget = extractWordLabelValueTarget(line);
    if (labelValueTarget?.labelText) {
      return getWordHeaderAliasCandidates(labelValueTarget.labelText);
    }

    return [];
  });

  const preferredLines = lines.filter(
    (line) => extractLongestWordBlank(line) || extractWordLabelValueTarget(line)
  );
  return Array.from(new Set([...preferredLines, ...aliasLines, ...lines])).slice(0, 10);
}

function countWordTextOccurrencesBefore(
  sourceText: string,
  searchText: string,
  targetStart: number
): number {
  const haystack = String(sourceText || '');
  const needle = String(searchText || '');
  if (!haystack || !needle) {
    return 0;
  }

  const safeTargetStart = Math.max(0, Math.min(targetStart, haystack.length));
  let count = 0;
  let searchFrom = 0;

  while (searchFrom < safeTargetStart) {
    const foundIndex = haystack.indexOf(needle, searchFrom);
    if (foundIndex < 0 || foundIndex >= safeTargetStart) {
      break;
    }
    count += 1;
    searchFrom = foundIndex + Math.max(needle.length, 1);
  }

  return count;
}

export function pickWordSearchResultByPosition<T>(
  items: T[],
  sourceText: string,
  searchText: string,
  targetStart: number
): T | undefined {
  if (!Array.isArray(items) || items.length === 0) {
    return undefined;
  }

  const occurrenceIndex = countWordTextOccurrencesBefore(sourceText, searchText, targetStart);
  return items[Math.min(occurrenceIndex, items.length - 1)] || items[0];
}
