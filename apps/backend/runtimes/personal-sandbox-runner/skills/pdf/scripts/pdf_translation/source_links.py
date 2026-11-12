"""Keep source hyperlink targets attached to their text, independently of translation."""
from collections import defaultdict
from html import escape
import re
from urllib.parse import urlsplit

from markupsafe import Markup


def safe_uri(uri):
    return isinstance(uri, str) and urlsplit(uri).scheme.lower() in ('http', 'https', 'mailto')


def extract_links(page):
    result = []
    for link in page.hyperlinks:
        if not safe_uri(link.get('uri')):
            continue
        box = [round(link[k], 2) for k in ('x0', 'top', 'x1', 'bottom')]
        chars = [c for c in page.chars if box[0] - 1 <= (c['x0'] + c['x1']) / 2 <= box[2] + 1
                 and box[1] <= (c['top'] + c['bottom']) / 2 <= box[3]]
        label = ''.join(c['text'] for c in chars).strip()
        result.append(dict(uri=link['uri'], bbox=box, label=label))
    return result


def node_links(ir):
    owners = defaultdict(list)
    for page in ir['pages']:
        nodes = [n for n in ir['nodes'] if n['page_id'] == page['id']]
        lines = {l['id']: l for l in page.get('lines', [])}
        for link in page.get('links', []):
            box = link['bbox']
            lids = {lid for lid, line in lines.items()
                    if min(box[2], line['bbox'][2]) > max(box[0], line['bbox'][0])
                    and min(box[3], line['bbox'][3]) > max(box[1], line['bbox'][1])}
            candidates = [n for n in nodes if n['type'] != 'furniture' and lids.intersection(n.get('line_ids', []))]
            if not candidates:
                candidates = [n for n in ir['nodes'] if n['type'] == 'title'] or nodes[:1]
            if candidates:
                owner = max(candidates, key=lambda n: len(lids.intersection(n.get('line_ids', []))))
                owners[owner['id']].append(link)
    return owners


def linked_text(text, links):
    """Escape all document text. Unmatched translated anchors get a compact link marker."""
    text = str(text)
    ranges, remaining = [], []
    grouped = defaultdict(list)
    for link in links:
        if safe_uri(link['uri']):
            grouped[link['uri']].append(link.get('label', ''))
    for uri, labels in grouped.items():
        labels = [uri.removeprefix('mailto:'), *labels]
        found = False
        for label in sorted(set(labels), key=len, reverse=True):
            if not label:
                continue
            match = re.search(re.escape(label), text)
            if match and not any(match.start() < end and match.end() > start for start, end, _ in ranges):
                ranges.append((match.start(), match.end(), uri))
                found = True
                break
        if not found:
            if len(grouped) == 1 and text:
                ranges = [(0, len(text), uri)]
            else:
                remaining.append(uri)
    parts, offset = [], 0
    for start, end, uri in sorted(ranges):
        parts += [escape(text[offset:start]), f'<a href="{escape(uri, quote=True)}">{escape(text[start:end])}</a>']
        offset = end
    parts.append(escape(text[offset:]))
    parts.extend(f' <a class="source-link" href="{escape(uri, quote=True)}">↗</a>' for uri in remaining)
    return Markup(''.join(parts))


def validate_link_targets(ir, reader):
    expected = {l['uri'] for p in ir['pages'] for l in p.get('links', []) if safe_uri(l['uri'])}
    actual = {str(a.get_object().get('/A', {}).get('/URI', ''))
              for p in reader.pages for a in p.get('/Annots', [])}
    missing = expected - actual
    if missing:
        raise ValueError('render_links_missing: ' + ', '.join(sorted(missing)))
