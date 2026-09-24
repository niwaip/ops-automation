import { createHash } from 'crypto';
import type { AssertBrowserStateDto, BrowserPageStateDto } from '../../../dto/worker.dto';

export function matchPageAssertion(
  dto: AssertBrowserStateDto,
  pageState: BrowserPageStateDto,
  selectorMatched?: boolean,
  textMatched?: boolean
): boolean {
  if (dto.pageUrl && pageState.pageUrl !== dto.pageUrl) {
    return false;
  }
  if (dto.pageUrlIncludes && !String(pageState.pageUrl || '').includes(dto.pageUrlIncludes)) {
    return false;
  }
  if (dto.pageTitle && pageState.pageTitle !== dto.pageTitle) {
    return false;
  }
  if (dto.pageTitleIncludes && !String(pageState.pageTitle || '').includes(dto.pageTitleIncludes)) {
    return false;
  }
  if (dto.pageFingerprint && pageState.pageFingerprint !== dto.pageFingerprint) {
    return false;
  }
  if (dto.readyState && pageState.readyState !== dto.readyState) {
    return false;
  }
  if (dto.selectorExists && !selectorMatched) {
    return false;
  }
  if (dto.textIncludes && !textMatched) {
    return false;
  }

  return Boolean(
    dto.pageUrl ||
    dto.pageUrlIncludes ||
    dto.pageTitle ||
    dto.pageTitleIncludes ||
    dto.pageFingerprint ||
    dto.readyState ||
    dto.selectorExists ||
    dto.textIncludes
  );
}

export function extractSearchResults(snapshotText: string, limit: number) {
  const lines = snapshotText.split('\n');
  const results: Array<{ rank: number; uid: string; text: string; href?: string }> = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const uidMatch =
      line.match(/uid=([^\s]+)/) || line.match(/^\s*([0-9A-Za-z_:-]+)\s+(?:link|heading)/i);
    if (!uidMatch) {
      continue;
    }
    if (!/(link|heading)/i.test(line)) {
      continue;
    }
    const uid = uidMatch[1]!;
    const quotedTexts = [...line.matchAll(/"([^"]+)"/g)]
      .map((match) => match[1]?.trim())
      .filter(Boolean) as string[];
    const fallbackText = line
      .replace(/^\s*[0-9A-Za-z_:-]+\s+/, '')
      .replace(/uid=[^\s]+\s*/, '')
      .replace(/url="[^"]+"/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const text = quotedTexts.join(' ').trim() || fallbackText;
    const hrefMatch = line.match(/url="([^"]+)"/);
    const key = `${uid}:${text}`;
    if (!text || seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push({
      rank: results.length + 1,
      uid,
      text,
      href: hrefMatch?.[1],
    });
    if (results.length >= limit) {
      break;
    }
  }

  return results;
}
export function buildPageFingerprint(url?: string, title?: string): string | undefined {
  const normalizedUrl = typeof url === 'string' ? url.trim() : '';
  const normalizedTitle = typeof title === 'string' ? title.trim() : '';
  if (!normalizedUrl && !normalizedTitle) {
    return undefined;
  }
  return createHash('sha256')
    .update(`${normalizedUrl}::${normalizedTitle}`)
    .digest('hex')
    .slice(0, 24);
}

export function buildScrollScript(direction: string, amount: number): string {
  switch (direction) {
    case 'up':
      return `() => { window.scrollBy(0, -${amount}); return "scrolled-up"; }`;
    case 'top':
      return '() => { window.scrollTo(0, 0); return "scrolled-top"; }';
    case 'bottom':
      return '() => { window.scrollTo(0, document.body.scrollHeight); return "scrolled-bottom"; }';
    default:
      return `() => { window.scrollBy(0, ${amount}); return "scrolled-down"; }`;
  }
}
