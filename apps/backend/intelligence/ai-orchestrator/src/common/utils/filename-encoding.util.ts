/**
 * Utility to fix filename encoding corruption (mojibake)
 * Common when browser sends UTF-8 encoded filenames in multipart/form-data
 * and busboy / multer interprets the byte stream as ISO-8859-1 (Latin-1).
 */
export function fixFilenameEncoding(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return name || '';
  try {
    // Check if name has high ASCII bytes (0x80 - 0xFF)
    const hasHighLatin = /[\u0080-\u00ff]/.test(name);
    // Check if all characters are <= 255 (single byte interpretation)
    const allByteChars = Array.from(name).every((c) => c.charCodeAt(0) <= 255);

    if (hasHighLatin && allByteChars) {
      const candidate = Buffer.from(name, 'latin1').toString('utf8');
      // If conversion produces valid text without replacement chars \ufffd
      if (candidate && !candidate.includes('\ufffd')) {
        const cjkRegex = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g;
        const candCjkCount = (candidate.match(cjkRegex) || []).length;
        const origCjkCount = (name.match(cjkRegex) || []).length;
        // If candidate contains CJK characters that were previously corrupted
        if (candCjkCount > origCjkCount || candCjkCount > 0) {
          return candidate;
        }
      }
    }
  } catch {
    // Keep fallback
  }
  return name;
}
