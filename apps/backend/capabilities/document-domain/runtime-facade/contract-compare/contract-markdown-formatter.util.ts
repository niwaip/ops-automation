/**
 * Formats contract diff HTML by converting Markdown syntax (# headings, **bold**, --- dividers)
 * into clean typography while preserving character-level <ins> and <del> tags intact.
 */

/**
 * Computes legal hierarchy indentation (in em) based on legal numbering patterns:
 * - 3.1, 4.2: 1.5em (退两格)
 * - 3.1.1, 4.1.2: 3.0em (再退两格)
 * - 3.1.1.1: 4.5em (再退两格)
 * - (1), （1）, (一), （一）, 1): 3.0em
 */
export function getLegalHierarchyIndentEm(rawLine: string): number {
  if (!rawLine) return 0;
  // Strip any inline HTML tags (<ins...>, <del...>, <strong...>, <span...>, <mark...>) to inspect bare text prefix
  const plain = rawLine.replace(/<[^>]+>/g, '').trim();

  // Tier 4: e.g. 3.1.1.1 or 1.2.3.4 (4 numbering levels)
  if (/^\d+\.\d+\.\d+\.\d+/.test(plain)) {
    return 4.5;
  }
  // Tier 3: e.g. 3.1.1, 4.1.2, 3.1.4 (3 numbering levels) -> 退两格 (约 3.0em)
  if (/^\d+\.\d+\.\d+/.test(plain)) {
    return 3.0;
  }
  // Tier 2: e.g. 3.1, 4.1, 1.2 (2 numbering levels) -> 基础缩进 1.5em (退两格)
  if (/^\d+\.\d+(?!\.)/.test(plain)) {
    return 1.5;
  }
  // Bracketed or parenthesized list items: (1), （1）, (一), （一）, 1), a) -> 3.0em
  if (
    /^[(（](?:[0-9一二三四五六七八九十a-zA-Z]+)[)）]/.test(plain) ||
    /^[0-9a-zA-Z][)）]/.test(plain)
  ) {
    return 3.0;
  }

  return 0;
}

/**
 * Splits HTML by linebreaks while maintaining balance of <ins> and <del> tags across lines.
 */
function splitHtmlPreservingDiffTags(html: string): string[] {
  const rawSegments = html.split(/(?:<br\s*\/?>|\r?\n)/i);
  const result: string[] = [];
  let openTag: string | null = null;

  for (const seg of rawSegments) {
    let current = seg;
    if (openTag) {
      current = openTag + current;
    }

    // Check if current segment opened <ins> or <del> without closing
    const insOpens = (current.match(/<ins\b[^>]*>/gi) || []).length;
    const insCloses = (current.match(/<\/ins>/gi) || []).length;
    const delOpens = (current.match(/<del\b[^>]*>/gi) || []).length;
    const delCloses = (current.match(/<\/del>/gi) || []).length;

    if (insOpens > insCloses) {
      current += '</ins>';
      openTag = '<ins class="diff-ins">';
    } else if (delOpens > delCloses) {
      current += '</del>';
      openTag = '<del class="diff-del">';
    } else {
      openTag = null;
    }

    result.push(current);
  }

  return result;
}

export function formatContractDiffHtml(html: string): string {
  if (!html || !html.trim()) return '';

  // Split by line breaks preserving diff tags
  const lines = splitHtmlPreservingDiffTags(html);

  const formattedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return '';

    // Check horizontal rule: ---, ***, ___ (possibly wrapped in del/ins)
    const hrPlain = trimmed.replace(/<\/?(?:ins|del)[^>]*>/gi, '').trim();
    if (/^[-*_]{3,}$/.test(hrPlain)) {
      return '<hr class="my-2.5 border-slate-200" />';
    }

    // Check headings #, ##, ### (possibly after del/ins tag or whitespace)
    const headingMatch = trimmed.match(/^((?:<(?:ins|del)[^>]*>)*)(#{1,6})\s+([\s\S]*)$/);
    if (headingMatch) {
      const tagPrefix = headingMatch[1];
      const level = headingMatch[2].length;
      let titleContent = headingMatch[3];
      titleContent = convertInlineMarkdown(titleContent);

      if (level === 1) {
        return `${tagPrefix}<div class="text-[17px] font-bold text-[#243041] my-2 pb-1 border-b border-slate-200">${titleContent}</div>`;
      } else if (level === 2) {
        return `${tagPrefix}<div class="text-[16px] font-bold text-[#243041] my-1.5">${titleContent}</div>`;
      } else {
        return `${tagPrefix}<div class="text-[15px] font-semibold text-[#243041] my-1">${titleContent}</div>`;
      }
    }

    // Normal line: compute hierarchical indentation and format inline markdown
    const indent = getLegalHierarchyIndentEm(trimmed);
    const formatted = convertInlineMarkdown(trimmed);

    if (indent > 0) {
      return `<div class="clause-hierarchical-line" style="padding-left: ${indent}em; margin-bottom: 0.25rem; line-height: 1.7;">${formatted}</div>`;
    }
    return `<div class="clause-hierarchical-line" style="margin-bottom: 0.25rem; line-height: 1.7;">${formatted}</div>`;
  });

  // Filter consecutive empty lines
  const result: string[] = [];
  let prevEmpty = false;
  for (const l of formattedLines) {
    if (!l) {
      if (!prevEmpty && result.length > 0) {
        result.push('');
        prevEmpty = true;
      }
    } else {
      result.push(l);
      prevEmpty = false;
    }
  }

  return result.join('');
}

/**
 * Converts inline markdown syntax: **bold** -> <strong>, preserves tags
 */
export function convertInlineMarkdown(text: string): string {
  if (!text) return '';

  // Convert **bold** while allowing <ins> or <del> within
  let res = text.replace(/\*\*([^*]+?)\*\*/g, '<strong class="font-semibold text-[#243041]">$1</strong>');

  // Convert __italic/underline__ if any
  res = res.replace(/(?<!\w)__([^_]+?)__(?!\w)/g, '<strong class="font-semibold text-[#243041]">$1</strong>');

  return res;
}
