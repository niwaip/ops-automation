export function extractMainTextFromHtml(html: string): string | undefined {
  if (!html || !html.trim()) return undefined;
  const sanitized = html
    .replace(/<!--([\s\S]*?)-->/gu, '')
    .replace(
      /<(script|style|template|noscript|iframe|object|embed|svg|canvas)\b[^>]*>[\s\S]*?<\/\1\s*>/giu,
      ''
    )
    .replace(/<(nav|footer|aside|dialog|select|option)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, '')
    .replace(
      /<[a-z0-9]+\b[^>]*\brole\s*=\s*["']?(?:navigation|banner|contentinfo|complementary|dialog|alertdialog)["']?[^>]*>[\s\S]*?<\/[a-z0-9]+>/giu,
      ''
    )
    .replace(
      /<[a-z0-9]+\b[^>]*(?:class|id)\s*=\s*["'][^"']*\b(?:navbar|nav-menu|sidebar|footer|ad-container|advertisement|cookie-banner|share-buttons|social-links|comments-section|popup-overlay)\b[^"']*["'][^>]*>[\s\S]*?<\/[a-z0-9]+>/giu,
      ''
    )
    .replace(
      /<input\b[^>]*(?:type\s*=\s*["']?hidden|name\s*=\s*["']?(?:token|password|cookie|authorization))[^>]*>/giu,
      ''
    )
    .replace(/\s(?:on\w+|style)\s*=\s*(["']).*?\1/giu, '')
    .replace(/\s(?:hidden|aria-hidden\s*=\s*["']?true["']?)(?:\s|=|>)/giu, ' ');

  const candidate =
    sanitized.match(/<article\b[^>]*>([\s\S]*?)<\/article>/iu)?.[1] ||
    sanitized.match(/<main\b[^>]*>([\s\S]*?)<\/main>/iu)?.[1] ||
    sanitized.match(
      /<([a-z0-9]+)\b[^>]*\brole\s*=\s*["']?main["']?[^>]*>([\s\S]*?)<\/\1>/iu
    )?.[2] ||
    sanitized.match(/<body\b[^>]*>([\s\S]*?)<\/body>/iu)?.[1] ||
    sanitized;

  const text = candidate
    .replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/giu, '\n\n# $1\n\n')
    .replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/giu, '\n\n## $1\n\n')
    .replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/giu, '\n\n### $1\n\n')
    .replace(/<h[4-6]\b[^>]*>([\s\S]*?)<\/h[4-6]>/giu, '\n\n#### $1\n\n')
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/giu, '\n- $1')
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/pre|\/blockquote)>/giu, '\n')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/&#x([0-9a-f]+);/giu, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/giu, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text.length > 0 ? text : undefined;
}
