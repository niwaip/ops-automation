import * as crypto from 'crypto';

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
 * Generates a signed download JWT token for a given user ID,
 * allowing safe access to workspace deliverables via IM links.
 */
export function generateSignedDeliverableToken(userId: string): string {
  const rawJwtSecret = process.env.JWT_SECRET;
  const jwtSecret = rawJwtSecret || 'ops_local_dev_jwt_secret_2026_06_02_8f4a6c9d7b1e53aa';
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      role: 'employee',
      // Valid for 7 days
      exp: Math.floor(Date.now() / 1000) + 7 * 86400,
    })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', jwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
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

  // 1. Image tags ![alt](url) -> [图片: alt]
  out = out.replace(/!\[([^\]]*)\]\([^)]+\)/g, (_, alt) => (alt ? `[图片: ${alt}]` : '[图片]'));

  // 2. Bold / Italic markers (先于链接处理，避免破坏 URL 中的下划线与签名)
  out = out.replace(/\*\*\*(.+?)\*\*\*/g, '$1');
  out = out.replace(/\*\*(.+?)\*\*/g, '$1');
  out = out.replace(/\*(.+?)\*/g, '$1');
  out = out.replace(/___(.+?)___/g, '$1');
  out = out.replace(/__(.+?)__/g, '$1');
  out = out.replace(/(?:^|\s)_(.+?)_(?=\s|$|[，。！？；])/g, ' $1');

  // 3. Headings #, ##, etc.
  out = out.replace(/^#{1,6}\s+/gm, '');

  // 4. Excessive blank lines
  out = out.replace(/\n{3,}/g, '\n\n');

  // 5. Links [text](url) -> text (url)
  // 如果链接是工作区文件且未带 token，且能解析出 targetUserId，则自动追加安全签名 token，支持在微信中免登直接下载
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    let finalUrl = url;
    if (
      finalUrl.includes('/api/ai/chat/workspace-files/') &&
      !finalUrl.includes('token=') &&
      !finalUrl.includes('access_token=')
    ) {
      const match = finalUrl.match(/\/api\/ai\/chat\/workspace-files\/([^/?#]+)/);
      if (match && match[1]) {
        try {
          const targetUserId = decodeURIComponent(match[1]);
          const token = generateSignedDeliverableToken(targetUserId);
          const sep = finalUrl.includes('?') ? '&' : '?';
          finalUrl = `${finalUrl}${sep}token=${encodeURIComponent(token)}`;
        } catch {
          // keep original URL if signing fails
        }
      }
    }
    return `${label} (${finalUrl})`;
  });

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
