import {
  safeText,
  escapeRegExp,
  numberOrUndefined,
  hasBlankPlaceholder,
  getElementHostData,
  getElementFormat,
  isBlankTableTemplateCell,
  splitTableCellLines,
  extractPlaceholderMatcher,
  extractPlaceholderSampleValue,
} from './document-xml-parser';

import { WorkflowDocumentElement } from './workflow-assets';

export {
  safeText,
  escapeRegExp,
  numberOrUndefined,
  hasBlankPlaceholder,
  getElementHostData,
  getElementFormat,
  isBlankTableTemplateCell,
  splitTableCellLines,
  extractPlaceholderMatcher,
  extractPlaceholderSampleValue,
};

export function normalizeLookupText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[（）()]/g, '')
    .replace(/\s+/g, '');
}

export function parseAmount(value: unknown): number | undefined {
  const normalized = safeText(value).replace(/[^\d.,-]/g, '');
  if (!normalized) {
    return undefined;
  }
  const numeric = Number(normalized.replace(/,/g, ''));
  return Number.isFinite(numeric) ? numeric : undefined;
}

export function parseDate(value: unknown): string | undefined {
  const normalized = safeText(value)
    .replace(/年/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '')
    .replace(/\//g, '-');
  if (!normalized) {
    return undefined;
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

export function formatCurrency(amount: number, language: string): string {
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (language === 'ja') {
    return `人民元${formatted}元`;
  }
  if (language === 'en') {
    return `CNY ${formatted}`;
  }
  return `人民币${formatted}元`;
}

export function formatDate(isoDate: string, language: string): string {
  const [year, month, day] = isoDate.split('-');
  if (language === 'en') {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
  return `${year}年${month}月${day}日`;
}

export function extractAnchorPrefix(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(.+?[:：])/u);
  if (match?.[1]) {
    return match[1];
  }
  const placeholderMatcher = extractPlaceholderMatcher(normalized);
  if (placeholderMatcher?.prefix) {
    const prefix = placeholderMatcher.prefix.replace(/[：:]$/u, '').trim();
    const suffix = placeholderMatcher.suffix.trim();
    if (prefix && suffix) {
      return `${prefix} ... ${suffix.slice(0, 16)}`.slice(0, 32);
    }
    if (prefix) {
      return prefix.slice(0, 24);
    }
  }
  return normalized.slice(0, 20);
}

export function inferRecognitionBlockTitle(text: string, blockType: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return blockType;
  }
  if (normalized.length <= 24) {
    return normalized;
  }
  return `${normalized.slice(0, 24)}...`;
}

export function hasCompareFieldShape(text: string): boolean {
  return /[:：]|【|】|\(\s*\)|（\s*）/u.test(safeText(text)) || hasBlankPlaceholder(text);
}

export function detectTextLanguageHint(text: string): 'zh' | 'ja' | 'en' | 'mixed' | 'unknown' {
  const normalizedText = safeText(text)
    .replace(/[_＿\-—.·:：|/\\()[\]{}<>\d\s]+/gu, '')
    .trim();
  if (!normalizedText) {
    return 'unknown';
  }

  const hanCount = (normalizedText.match(/\p{Script=Han}/gu) || []).length;
  const hiraganaCount = (normalizedText.match(/\p{Script=Hiragana}/gu) || []).length;
  const katakanaCount = (normalizedText.match(/\p{Script=Katakana}/gu) || []).length;
  const latinCount = (normalizedText.match(/[A-Za-z]/g) || []).length;
  const kanaCount = hiraganaCount + katakanaCount;
  const hasHan = hanCount > 0;
  const hasKana = kanaCount > 0;
  const hasLatin = latinCount > 0;

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

export function isConcreteLanguageHint(
  hint: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown'
): hint is 'zh' | 'ja' | 'en' {
  return hint === 'zh' || hint === 'ja' || hint === 'en';
}
