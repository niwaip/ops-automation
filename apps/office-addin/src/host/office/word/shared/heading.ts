function normalizeParagraphStyleValue(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function extractHeadingLevelFromStyleName(value: string): number | null {
  const normalized = normalizeParagraphStyleValue(value);
  if (!normalized) {
    return null;
  }

  const headingMatch =
    normalized.match(/(?:^|\s)heading\s*([1-9])/i) ||
    normalized.match(/(?:^|\s)title\s*([1-9])/i) ||
    normalized.match(/(?:标题|標題|见出し|見出し)\s*([1-9])/u);
  if (headingMatch?.[1]) {
    return Number(headingMatch[1]);
  }

  if (
    /(?:^|\s)(?:heading|title|subtitle)(?:\s|$)/i.test(normalized) ||
    /(?:标题|標題|见出し|見出し)/u.test(normalized)
  ) {
    return 1;
  }

  return null;
}

export function hasWordHeadingStyle(format?: Record<string, unknown>): boolean {
  const style = String(format?.style || '');
  const styleBuiltIn = String(format?.styleBuiltIn || '');
  if (
    extractHeadingLevelFromStyleName(style) !== null ||
    extractHeadingLevelFromStyleName(styleBuiltIn) !== null
  ) {
    return true;
  }

  const isTitle = Boolean(format?.isTitle);
  const isBold = Boolean(format?.isBold);
  const fontSize = Number(format?.fontSize || 0);
  const alignment = String(format?.alignment || '').toLowerCase();
  return isTitle || isBold || fontSize >= 14 || alignment === 'center';
}
