"""Validate citation provenance and resolve recognizable canonical personal links.

Link provenance is not semantic fact checking: a real URL can still be cited for
an unsupported claim. Keep that limitation explicit in telemetry and docs.
"""
import re
from urllib.parse import urlsplit, urlunsplit

LINK = re.compile(r'\[([^\]\n]+)\]\(([^\s)]+)\)')
URL = re.compile(r'https?://[^\s)\]>"`]+')


def _key(url):
    p = urlsplit(url.rstrip('.,;'))
    return urlunsplit((p.scheme.lower(), p.netloc.lower(), p.path.rstrip('/'), p.query, ''))


def _label(text):
    text = re.sub(r'\.(?:md|pdf|docx|xlsx)$|白皮书|技术文档|原件', '', text, flags=re.I)
    return re.sub(r'[^\w\u4e00-\u9fff]', '', text).casefold()


def assess_citations(text, evidence):
    known = set()
    personal = []
    for receipt in evidence:
        if not receipt.is_success or (receipt.provenance or {}).get('tool') not in {
                'web_search', 'fetch_page', 'scan_knowledge', 'read_file'}:
            continue
        source = receipt.render_text()
        known.update(_key(url) for url in URL.findall(source))
        known.update(_key(url) for _, url in LINK.findall(source) if url.startswith('/workspaces?'))
        if (receipt.provenance or {}).get('tool') in {'scan_knowledge', 'read_file'}:
            personal.extend((label, url) for label, url in LINK.findall(source) if url.startswith('/workspaces?'))
    def repair(match):
        label, url = match.groups()
        if _key(url) in known:
            return match[0]
        normalized = _label(label)
        matches = {target for name, target in personal if len(normalized) >= 6 and normalized in _label(name)}
        return f'[{label}]({next(iter(matches))})' if len(matches) == 1 else match[0]
    text = LINK.sub(repair, text)
    unknown = [(label, url) for label, url in LINK.findall(text)
               if url.startswith(('https://', 'http://', '/workspaces?')) and _key(url) not in known]
    return text, unknown


def omit_unsupported_citations(text, unknown):
    """Remove unsupported table rows/paragraphs, rather than leave fake references."""
    urls = {url for _, url in unknown}
    paragraphs = []
    for paragraph in text.split('\n\n'):
        if not any(url in paragraph for url in urls):
            paragraphs.append(paragraph)
        elif paragraph.lstrip().startswith('|'):
            kept = [line for line in paragraph.splitlines() if not any(url in line for url in urls)]
            paragraphs.append('\n'.join(kept))
    return '\n\n'.join(paragraphs).strip()
