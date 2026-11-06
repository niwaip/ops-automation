"""Bounded, cross-invocation document selection with per-excerpt provenance."""
from hashlib import sha256
import re
from urllib.parse import urlsplit, urlunsplit
from .mcp_runtime import safe_source_url

MAX_SOURCES = 8
MAX_SOURCE_CHARS = 5000
MAX_TOTAL_CHARS = 20000


def canonical_url(url):
    safe = safe_source_url(url)
    if not safe:
        return None
    parsed = urlsplit(safe)
    return urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path, parsed.query, ''))


def source_id(url):
    return 's-' + sha256(canonical_url(url).encode()).hexdigest()[:16]


def anchored_spans(source, segment):
    spans = []
    for line in re.finditer(r'[^\r\n]+', segment['excerpt']):
        # Exact contiguous text; long lines are bounded without synthesizing or joining quotes.
        for start in range(0, len(line[0]), 900):
            text = line[0][start:start+900].strip()
            if len(text) < 15 or len(re.findall(r'[a-zA-Z\u4e00-\u9fff]', text)) < 6:
                continue
            digest = sha256((source['id'] + segment['id'] + str(line.start()+start) + text).encode()).hexdigest()[:16]
            spans.append({'id': 'q-' + digest, 'text': text})
    return spans


def review_payload_sources(sources):
    return [{'id': s['id'], 'url': s['url'], 'title': s['title'], 'kind': s['kind'],
             'spans': [span for segment in s['segments'] for span in segment['spans']]} for s in sources]


def collect_review_sources(evidence, prompt=''):
    grouped = {}
    candidates = 0
    for receipt in evidence:
        provenance = receipt.provenance or {}
        if not receipt.is_success or provenance.get('tool') != 'call_external_tool':
            continue
        result = receipt.data.get('result', {}) if isinstance(receipt.data, dict) else {}
        if not isinstance(result, dict):
            continue
        fetched = bool(result.get('url') and result.get('content'))
        docs = [{'title': result.get('title'), 'contentUrl': result['url'], 'content': result['content']}] if fetched else result.get('results', [])
        for doc in docs if isinstance(docs, list) else []:
            if not isinstance(doc, dict):
                continue
            key = canonical_url(doc.get('contentUrl'))
            content = doc.get('content')
            if not key or not isinstance(content, str) or not content.strip():
                continue
            candidates += 1
            community = '/answers/' in urlsplit(key).path.lower() or 'q&a' in str(doc.get('title', '')).lower()
            item = grouped.setdefault(key, {'id': source_id(key), 'url': key,
                'title': str(doc.get('title') or key)[:240], 'kind': 'community' if community else 'document',
                'segments': [], 'seen': set()})
            fingerprint = sha256(''.join(content.split()).encode()).hexdigest()
            if fingerprint in item['seen']:
                continue
            item['seen'].add(fingerprint)
            item['segments'].append({'id': 'p-' + fingerprint[:16], 'excerpt': content,
                'invocationId': provenance.get('invocation_id'), 'bindingId': provenance.get('binding_id'),
                'skillId': provenance.get('skill_id'), 'kind': 'fetch' if fetched else 'search'})
    terms = re.findall(r'[a-z0-9]{3,}|[\u4e00-\u9fff]{2,}', prompt.lower())
    def rank(item):
        fetched = any(s['kind'] == 'fetch' for s in item['segments'])
        relevance = sum(t in (item['title'] + ' ' + item['url']).lower() for t in terms)
        return (item['kind'] == 'community', not fetched, -relevance, item['url'])
    selected = []
    remaining = MAX_TOTAL_CHARS
    per_source_limit = min(MAX_SOURCE_CHARS, MAX_TOTAL_CHARS // max(1, min(len(grouped), MAX_SOURCES)))
    for item in sorted(grouped.values(), key=rank)[:MAX_SOURCES]:
        used = 0
        segments = []
        # Prefer actual page content, then add distinct fragments with their own invocation IDs.
        for segment in sorted(item['segments'], key=lambda s: s['kind'] != 'fetch'):
            limit = min(per_source_limit - used, remaining)
            if limit < 100:
                break
            excerpt = segment['excerpt'][:limit]
            segments.append({**segment, 'excerpt': excerpt, 'truncated': len(excerpt) < len(segment['excerpt'])})
            used += len(excerpt)
            remaining -= len(excerpt)
        if segments:
            for segment in segments:
                segment['spans'] = anchored_spans(item, segment)
            selected.append({k: v for k, v in item.items() if k not in {'segments', 'seen'}} |
                {'segments': segments, 'excerpt': '\n\n'.join(s['excerpt'] for s in segments),
                 'invocationId': segments[0]['invocationId']})
    summary = {'candidate_chunks': candidates, 'unique_documents': len(grouped), 'selected_documents': len(selected),
               'selected_chars': MAX_TOTAL_CHARS - remaining,
               'sources': [{'id': s['id'], 'url': s['url'], 'kind': s['kind'],
                            'segments': [{'id': p['id'], 'invocationId': p['invocationId'],
                                          'kind': p['kind'], 'chars': len(p['excerpt']), 'truncated': p['truncated']}
                                         for p in s['segments']]} for s in selected]}
    return selected, summary
