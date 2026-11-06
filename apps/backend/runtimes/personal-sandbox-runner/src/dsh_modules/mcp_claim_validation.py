"""Validate review candidates and keep bounded, safe rejection diagnostics."""
from collections import Counter
from hashlib import sha256
import re
from .semantic_decision import ground_user_quote


def safe_candidate_text(value, limit):
    if not isinstance(value, str):
        return ''
    value = re.sub(r'(?i)Bearer\s+[^\s"\']+', 'Bearer [redacted]', value)
    value = re.sub(r'(?i)((?:password|api[_-]?key|access[_-]?token|secret)\s*[=:]\s*)[^\s,;]+', r'\1[redacted]', value)
    return value[:limit]


def validate_claims(reviewed, sources):
    claims = reviewed.get('claims') if isinstance(reviewed, dict) else None
    diagnostics = {'candidate_count': len(claims) if isinstance(claims, list) else 0,
                   'rejections': [], 'rejection_counts': {}, 'grounded_claims': 0}
    if not isinstance(claims, list) or len(claims) > 6:
        diagnostics['rejection_counts'] = {'invalid_claims_shape': 1}
        return [], diagnostics
    if not claims:
        diagnostics['rejection_counts'] = {'empty_claims': 1}
        return [], diagnostics
    by_id = {s['id']: s for s in sources}
    proof = []
    for index, claim in enumerate(claims):
        reason = None
        source = by_id.get(claim.get('source_id')) if isinstance(claim, dict) and isinstance(claim.get('source_id'), str) else None
        statement = claim.get('statement') if isinstance(claim, dict) else None
        quote = claim.get('quote') if isinstance(claim, dict) else None
        span_id = claim.get('span_id') if isinstance(claim, dict) else None
        matched = None
        if not isinstance(claim, dict):
            reason = 'invalid_candidate'
        elif not source:
            reason = 'unknown_source'
        elif not isinstance(statement, str) or not (1 <= len(statement.strip()) <= 700):
            reason = 'invalid_statement'
        elif source['kind'] == 'community':
            reason = 'community_not_configuration_authority'
        elif span_id is not None:
            for segment in source['segments']:
                span = next((s for s in segment['spans'] if s['id'] == span_id), None)
                if span:
                    matched = (segment, span['text'])
                    break
            if not matched:
                reason = 'unknown_span'
        elif not isinstance(quote, str) or len(quote.strip()) < 15:
            reason = 'quote_too_short'
        else:
            for segment in source['segments']:
                span = ground_user_quote(quote, [segment['excerpt']])
                if span:
                    matched = (segment, span)
                    break
            if not matched:
                reason = 'quote_not_found'
        clean_statement = re.sub(r'https?://\S+', '', statement or '').strip() if isinstance(statement, str) else ''
        if not reason and not clean_statement:
            reason = 'invalid_statement'
        if reason:
            safe_quote = safe_candidate_text(quote, 1000)
            diagnostics['rejections'].append({'index': index, 'reason': reason,
                'source_id': source['id'] if source else None,
                'suggested_source_id': safe_candidate_text(claim.get('source_id'), 128) if isinstance(claim, dict) else '',
                'suggested_span_id': safe_candidate_text(span_id, 128),
                'statement': safe_candidate_text(statement, 700), 'quote': safe_quote,
                'quote_sha256': sha256(safe_quote.encode()).hexdigest()})
            continue
        segment, span = matched
        proof.append({'statement': clean_statement, 'url': source['url'], 'source_id': source['id'],
                      'segment_id': segment['id'], 'span_id': span_id,
                      'invocationId': segment['invocationId'], 'quote': span[:1000]})
    diagnostics['grounded_claims'] = len(proof)
    diagnostics['rejection_counts'] = dict(Counter(r['reason'] for r in diagnostics['rejections']))
    return proof, diagnostics


def render_claims(proof):
    lines = [f"- {p['statement']} [原文]({p['url'].replace('(', '%28').replace(')', '%29')})" for p in proof]
    return ('根据本轮 MCP 返回资料，可核对的配置要点如下：\n\n' + '\n\n'.join(lines)
            + '\n\n这些要点仅覆盖上述资料支持的范围；其他场景和具体参数需继续核对相应教程。')
