"""
HTML to Clean Structured Markdown Converter.
Converts raw DOM / HTML from headless browsers or HTTP requests into structured Markdown.
Preserves headings, hyperlinks, lists, code blocks, bold text, and removes scripts/styles.
"""

import html
import re
from typing import Optional

try:
    from markdownify import markdownify as _markdownify
    HAS_MARKDOWNIFY = True
except ImportError:
    HAS_MARKDOWNIFY = False


def html_to_clean_markdown(raw_html: str, fallback_text: Optional[str] = None) -> str:
    """
    Converts raw HTML into clean, readable Markdown.
    1. Strips out script, style, svg, noscript, nav, header, footer, aside, button tags.
    2. Uses markdownify if available.
    3. Falls back to structured regex parser with headers, links, lists, and paragraphs.
    4. Falls back to fallback_text (e.g. inner_text) if HTML parsing yields insufficient text.
    """
    if not raw_html or not raw_html.strip():
        return (fallback_text or "").strip()

    # 1. 优先定位主要正文容器 (<main>, <article>, 或 <body>)
    main_m = re.search(r'<(?:main|article|body)\b[^>]*>(.*?)</(?:main|article|body)>', raw_html, re.DOTALL | re.I)
    content = main_m.group(1) if main_m else raw_html

    # 剔除噪音与干扰标签
    clean = re.sub(
        r'<(?:script|style|svg|noscript|nav|header|footer|aside|iframe|button)[^>]*>.*?</(?:script|style|svg|noscript|nav|header|footer|aside|iframe|button)>',
        '',
        content,
        flags=re.DOTALL | re.I
    )
    clean = re.sub(r'<!--.*?-->', '', clean, flags=re.DOTALL)

    # 2. 优先使用专业的 markdownify 库
    if HAS_MARKDOWNIFY:
        try:
            converted = _markdownify(
                clean,
                heading_style="ATX",
                strip=['img', 'button', 'input', 'form', 'select'],
                sub_symbol='',
                sup_symbol=''
            )
            converted = re.sub(r'\n{3,}', '\n\n', converted).strip()
            if len(converted) > 50:
                return converted
        except Exception:
            pass

    # 3. 稳健的内置语义正则转换器 (Fallback without third-party dependencies)
    clean = re.sub(r'<pre[^>]*><code[^>]*>(.*?)</code></pre>', r'\n\n```\n\1\n```\n', clean, flags=re.DOTALL | re.I)
    clean = re.sub(r'<h1[^>]*>(.*?)</h1>', r'\n\n# \1\n', clean, flags=re.I)
    clean = re.sub(r'<h2[^>]*>(.*?)</h2>', r'\n\n## \1\n', clean, flags=re.I)
    clean = re.sub(r'<h3[^>]*>(.*?)</h3>', r'\n\n### \1\n', clean, flags=re.I)
    clean = re.sub(r'<h[4-6][^>]*>(.*?)</h[4-6]>', r'\n\n#### \1\n', clean, flags=re.I)
    clean = re.sub(r'<a[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', r'[\2](\1)', clean, flags=re.I)
    clean = re.sub(r'<li[^>]*>(.*?)</li>', r'\n- \1', clean, flags=re.I)
    clean = re.sub(r'<(?:strong|b)[^>]*>(.*?)</(?:strong|b)>', r'**\1**', clean, flags=re.I)
    clean = re.sub(r'<(?:em|i)[^>]*>(.*?)</(?:em|i)>', r'*\1*', clean, flags=re.I)
    clean = re.sub(r'<p[^>]*>(.*?)</p>', r'\n\n\1\n', clean, flags=re.I)
    clean = re.sub(r'<br\s*/?>', '\n', clean, flags=re.I)
    clean = re.sub(r'<[^>]+>', ' ', clean)
    clean = html.unescape(clean)

    lines = [line.strip() for line in clean.splitlines() if line.strip()]
    result = "\n".join(lines)
    result = re.sub(r'\n{3,}', '\n\n', result).strip()

    if len(result) > 50:
        return result

    return (fallback_text or result).strip()
