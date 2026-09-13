/**
 * WeChat text formatting, markdown simplification, UTF-16 surrogate sanitization,
 * and line-preserving chunking utilities.
 */

/**
 * Replace unpaired UTF-16 surrogates. iLink `sendmessage` rejects them with
 * `ret=-1 invalid request`. A truncated emoji (e.g. at slice boundaries) is the usual source.
 */
export function sanitizeWeChatText(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate: check if followed by valid low surrogate
      const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += text[i] + text[i + 1];
        i++;
      } else {
        out += '\uFFFD';
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      // Low surrogate without preceding high surrogate
      out += '\uFFFD';
    } else {
      out += text[i];
    }
  }
  return out;
}

/**
 * Clean Markdown syntax for cleaner mobile WeChat display:
 * - Converts markdown links [text](url) -> text (url)
 * - Converts image tags ![alt](url) -> [图片: alt]
 * - Strips heading hashtags (#, ##, ...)
 * - Strips bold/italic markers (*, **, __, _) while preserving the inner text
 * - Normalizes excessive consecutive blank lines
 */
export function formatForWeChat(text: string): string {
  let out = typeof text === 'string' ? text : (text ? String(text) : '');

  // Image tags ![alt](url) -> [图片: alt]
  out = out.replace(/!\[([^\]]*)\]\([^)]+\)/g, (_, alt) => (alt ? `[图片: ${alt}]` : '[图片]'));

  // Links [text](url) -> text (url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

  // Bold / Italic markers
  out = out.replace(/\*\*\*(.+?)\*\*\*/g, '$1');
  out = out.replace(/\*\*(.+?)\*\*/g, '$1');
  out = out.replace(/\*(.+?)\*/g, '$1');
  out = out.replace(/___(.+?)___/g, '$1');
  out = out.replace(/__(.+?)__/g, '$1');
  out = out.replace(/_(.+?)_/g, '$1');

  // Headings #, ##, etc.
  out = out.replace(/^#{1,6}\s+/gm, '');

  // Excessive blank lines
  out = out.replace(/\n{3,}/g, '\n\n');

  return out.trim();
}

/**
 * Split text into chunks up to maxLen, preferring line-break boundaries so
 * messages are split naturally between paragraphs rather than cutting mid-sentence.
 */
export function splitTextPreservingLines(text: string, maxLen = 1800): string[] {
  if (!text || text.length <= maxLen) return [text || ''];

  const segments: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      segments.push(remaining);
      break;
    }

    // Try finding the last newline before maxLen
    let breakAt = remaining.lastIndexOf('\n', maxLen);
    if (breakAt <= 0) {
      // Fallback: search for last space or punctuation before maxLen
      breakAt = maxLen;
    }

    // Avoid cutting high/low surrogate pairs at split boundary
    if (breakAt > 0) {
      const prev = remaining.charCodeAt(breakAt - 1);
      if (prev >= 0xd800 && prev <= 0xdbff) {
        breakAt -= 1;
      }
    }
    if (breakAt <= 0) {
      breakAt = 1;
    }

    segments.push(remaining.substring(0, breakAt));
    remaining = remaining.substring(breakAt).replace(/^\n/, '');
  }

  return segments;
}
