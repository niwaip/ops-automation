/**
 * Formats contract diff HTML by converting Markdown syntax (# headings, **bold**, --- dividers)
 * into clean typography while preserving character-level <ins> and <del> tags intact.
 */

export function formatContractDiffHtml(html: string): string {
  if (!html || !html.trim()) return '';

  // Split by line breaks (<br>, <br/>, or \n)
  const lines = html.split(/(?:<br\s*\/?>|\r?\n)/i);

  const formattedLines = lines.map((line) => {
    let trimmed = line.trim();
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

    // Normal line: format inline markdown (bold, list item, etc.)
    return convertInlineMarkdown(trimmed);
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

  return result.join('<br>');
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
