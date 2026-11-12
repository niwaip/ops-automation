"""Local PDF page evidence: preserve columns, coordinates and unread visual pages.

Geometry is a reading aid, not semantic verification. Ambiguous layouts retain a
spatial text view and remain eligible for targeted native/visual inspection.
"""
from __future__ import annotations

import re

_PUA = re.compile(r"[\ue000-\uf8ff]+")


def image_coverage(page):
    """Union of clipped image rectangles, without counting overlaps twice."""
    x0, top, x1, bottom = page.bbox
    rects = [(max(x0, im['x0']), max(top, im['top']),
              min(x1, im['x1']), min(bottom, im['bottom'])) for im in page.images]
    rects = [r for r in rects if r[2] > r[0] and r[3] > r[1]]
    xs = sorted({x for r in rects for x in (r[0], r[2])})
    area = 0.0
    for left, right in zip(xs, xs[1:]):
        end = None
        for lo, hi in sorted((r[1], r[3]) for r in rects if r[0] < right and r[2] > left):
            area += (right - left) * max(0, hi - max(lo, end if end is not None else lo))
            end = max(hi, end if end is not None else hi)
    return min(1.0, area / max(1, (x1 - x0) * (bottom - top)))


def _rows(words):
    rows = []
    for word in sorted(words, key=lambda w: (w['top'], w['x0'])):
        if not rows or abs(word['top'] - rows[-1][0]['top']) > 3:
            rows.append([word])
        else:
            rows[-1].append(word)
    return [sorted(row, key=lambda w: w['x0']) for row in rows]


def _text(words):
    return '\n'.join(' '.join(w['text'] for w in row) for row in _rows(words))


def _block(words, name):
    return {'region': name, 'bbox': [round(v, 2) for v in (
        min(w['x0'] for w in words), min(w['top'] for w in words),
        max(w['x1'] for w in words), max(w['bottom'] for w in words))],
        'text': _text(words)}


def _column_cut(words, width):
    """Find repeated wide gutters; do not guess a column from a single gap."""
    rows = _rows(words)
    min_gap = max(18, width * .035)
    candidates = set()
    for row in rows:
        for a, b in zip(row, row[1:]):
            if b['x0'] - a['x1'] >= min_gap:
                candidates.add(round((a['x1'] + b['x0']) / 2, 1))
    best = None
    for cut in sorted(candidates):
        if not width * .2 < cut < width * .8:
            continue
        supported, spanning = [], []
        for row in rows:
            left = [w for w in row if w['x1'] <= cut]
            right = [w for w in row if w['x0'] >= cut]
            crossing = any(w['x0'] < cut < w['x1'] for w in row)
            if crossing or (left and right and right[0]['x0'] - left[-1]['x1'] < min_gap):
                spanning.append(row)
            elif left and right:
                supported.append(row)
        if len(supported) < 3 or len(spanning) > max(2, len(rows) * .25):
            continue
        left_words = [w for w in words if w['x1'] <= cut]
        right_words = [w for w in words if w['x0'] >= cut]
        if min(sum(len(w['text']) for w in group) for group in (left_words, right_words)) < 20:
            continue
        score = len(supported) - len(spanning)
        if best is None or score > best[0]:
            best = (score, cut, spanning)
    return best


def extract_page_evidence(page, page_number):
    """Extract once, retaining physical page identity even for blank/error pages."""
    native = page.extract_text() or ''
    words = []
    for word in page.extract_words():
        text = _PUA.sub('', word['text']).strip()
        if text:
            words.append({**word, 'text': text})
    coverage = image_coverage(page)
    readable_chars = sum(len(w['text']) for w in words)
    needs_visual = coverage >= .65 and readable_chars < 120
    graphics_only = not words and bool(page.images or page.curves or page.lines or page.rects)
    status = ('needs_visual' if needs_visual or graphics_only else
              'text' if words else 'unreadable_text' if native.strip() else 'blank')
    result = {'page': page_number, 'native_text': native, 'text': native,
              'bbox': list(page.bbox),
              'status': status, 'image_coverage': round(coverage, 4),
              'text_chars': readable_chars, 'layout': 'single_column', 'blocks': []}
    if not words:
        return result
    # Vertical/rotated text has no dependable left-to-right column order.
    if any(not w.get('upright', True) for w in words):
        result['layout'] = 'uncertain'
        return result
    candidate = _column_cut(words, page.width)
    if candidate is None:
        return result
    _, cut, spanning_rows = candidate
    spanning_ids = {id(w) for row in spanning_rows for w in row}
    body = [w for w in words if id(w) not in spanning_ids]
    left = [w for w in body if (w['x0'] + w['x1']) / 2 < cut]
    right = [w for w in body if (w['x0'] + w['x1']) / 2 >= cut]
    if not left or not right:
        return result
    first_body = min(w['top'] for w in body)
    last_body = max(w['bottom'] for w in body)
    # A spanning band within the columns makes reading order ambiguous. Keep
    # spatial whitespace instead of inventing associations across that band.
    interior = [row for row in spanning_rows if first_body < row[0]['top'] < last_body]
    pairs = [([w for w in row if w['x1'] <= cut], [w for w in row if w['x0'] >= cut])
             for row in _rows(body)]
    pairs = [(a, b) for a, b in pairs if a and b]
    tabular = bool(pairs) and sum(
        max(sum(len(w['text']) for w in side) for side in pair) <= 24
        for pair in pairs) / len(pairs) >= .7
    # Further gutters can be a table or 3+ columns. Do not collapse those into
    # two synthetic columns and lose row/cell relationships.
    if interior or tabular or _column_cut(left, page.width) or _column_cut(right, page.width):
        result.update(layout='uncertain', text=page.extract_text(layout=True) or native)
        return result
    header = [w for row in spanning_rows for w in row if w['top'] <= first_body]
    footer = [w for row in spanning_rows for w in row if w['top'] > first_body]
    blocks = []
    for group, name in [(header, 'header'), (left, 'left'), (right, 'right'), (footer, 'footer')]:
        if group:
            blocks.append(_block(group, name))
    result.update(layout='columns', blocks=blocks,
                  text='\n\n'.join(f"[区域 {b['region']} bbox={b['bbox']}]\n{b['text']}" for b in blocks))
    return result
