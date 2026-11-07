"""Extract immutable positioned text fragments without flattening columns."""
from pathlib import Path
import subprocess

import pdfplumber

from .contracts import IR_SCHEMA, TranslationError, check_time, digest


def ruled_table_bounds(page):
    bands = {}
    for line in getattr(page, 'lines', []):
        if abs(line['bottom'] - line['top']) < 1 and line['x1'] - line['x0'] > float(page.width) * .5:
            key = (round(line['x0'] / 3), round(line['x1'] / 3))
            bands.setdefault(key, []).append(line)
    return [[min(l['x0'] for l in rows), min(l['top'] for l in rows) - 2,
             max(l['x1'] for l in rows), max(l['bottom'] for l in rows) + 2]
            for rows in bands.values() if len(rows) >= 3]


def page_lines(page, page_id):
    words = page.extract_words(x_tolerance=2, y_tolerance=2, keep_blank_chars=False)
    tables = ruled_table_bounds(page)
    # Shared baselines, rather than rounded tops, keep superscripts attached to
    # names and affiliations. Never merge the rotated margin into body rows.
    rows = []
    for word in sorted(words, key=lambda w: (w.get('upright') is False, w['bottom'], w['x0'])):
        row = next((r for r in reversed(rows) if
            (r[0].get('upright') is False) == (word.get('upright') is False)
            and abs(float(r[0]['bottom']) - float(word['bottom'])) <= 2.5), None)
        if row is None:
            rows.append([word])
        else:
            row.append(word)
    result = []
    for row in sorted(rows, key=lambda r: (min(w['top'] for w in r), min(w['x0'] for w in r))):
        row.sort(key=lambda w: w['x0'])
        groups = [[]]
        for word in row:
            prev = groups[-1][-1] if groups[-1] else None
            in_table = any(b[0] <= word['x0'] <= b[2] and b[1] <= word['top'] <= b[3] for b in tables)
            if prev and word['x0'] - prev['x1'] > (6 if in_table else 14):
                groups.append([])
            groups[-1].append(word)
        for group in groups:
            result.append({'id': f'{page_id}_l{len(result) + 1}',
                'text': ' '.join(w['text'] for w in group),
                'rotated': all(w.get('upright') is False for w in group),
                'bbox': [round(min(w['x0'] for w in group), 2),
                         round(min(w['top'] for w in group), 2),
                         round(max(w['x1'] for w in group), 2),
                         round(max(w['bottom'] for w in group), 2)]})
    return result


def parse_native(source, folder, deadline):
    source, folder = Path(source).resolve(), Path(folder)
    ir = {'schema_version': IR_SCHEMA, 'source': {'path': str(source), 'sha256': digest(source)},
          'pages': [], 'nodes': [], 'reading_order': [], 'translations': {}, 'assets': []}
    with pdfplumber.open(source) as pdf:
        ir['source']['page_count'] = len(pdf.pages)
        for number, page in enumerate(pdf.pages, 1):
            check_time(deadline)
            pid = f'p{number}'
            lines = page_lines(page, pid)
            if sum(len(x['text']) for x in lines) < 20:
                raise TranslationError('layout_unresolved', f'第{number}页缺少可靠原生文字；扫描件尚需OCR复核，未生成替代正文')
            preview = folder / f'source-{number}.png'
            subprocess.run(['pdftoppm', '-f', str(number), '-l', str(number), '-singlefile',
                '-scale-to', '1800', '-png', str(source), str(preview.with_suffix(''))],
                check=True, capture_output=True, timeout=max(.1, min(30, deadline - __import__('time').monotonic())))
            from .source_links import extract_links
            ir['pages'].append({'id': pid, 'number': number, 'width_pt': float(page.width),
                'height_pt': float(page.height), 'rotation': page.rotation, 'lines': lines,
                'visual_bounds': [[float(o['x0']), float(o['top']), float(o['x1']), float(o['bottom'])]
                    for o in [*page.images, *page.rects]
                    if o['x1'] - o['x0'] > 6 and o['bottom'] - o['top'] > 6
                    and (o['x1'] - o['x0']) * (o['bottom'] - o['top']) < float(page.width * page.height) * .95],
                'links': extract_links(page),
                'preview': str(preview), 'table_candidates': ruled_table_bounds(page) + [list(t.bbox) for t in page.find_tables()
                    if len(t.rows) >= 3 and len(t.rows[0].cells) >= 2]})
    from .table_geometry import discover_tables
    with pdfplumber.open(source) as pdf:
        for page, original in zip(ir['pages'], pdf.pages):
            page['native_tables'] = discover_tables(original, page['lines'], page['table_candidates'])
    return ir
