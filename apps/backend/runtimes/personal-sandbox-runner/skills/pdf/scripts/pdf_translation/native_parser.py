"""Extract immutable positioned text fragments without flattening columns."""
from pathlib import Path
import re
import subprocess

import pdfplumber

from .contracts import IR_SCHEMA, TranslationError, check_time, digest


def ruled_table_bounds(page):
    bands = {}
    lines = getattr(page, 'lines', []) or []
    rect_rules = []
    for r in getattr(page, 'rects', []) or []:
        if abs(r['bottom'] - r['top']) <= 2 and r['x1'] - r['x0'] > float(page.width) * .28:
            rect_rules.append({'x0': r['x0'], 'top': r['top'], 'x1': r['x1'], 'bottom': r['bottom']})
    for line in [*lines, *rect_rules]:
        if abs(line['bottom'] - line['top']) <= 2 and line['x1'] - line['x0'] > float(page.width) * .28:
            key = (round(line['x0'] / 3), round(line['x1'] / 3))
            bands.setdefault(key, []).append(line)
    words = page.extract_words(x_tolerance=2, y_tolerance=2, keep_blank_chars=False) if bands else []
    bounds = []
    for rows in bands.values():
        rows = sorted(rows, key=lambda l: l['top'])
        if len(rows) < 3:
            continue
        x0, x1 = min(l['x0'] for l in rows), max(l['x1'] for l in rows)
        groups = [[rows[0]]]
        for r in rows[1:]:
            prev_y, cur_y = groups[-1][-1]['bottom'], r['top']
            between = [w for w in words if prev_y + 1 <= (w['top'] + w['bottom']) / 2 <= cur_y - 1]
            outside_text = any(w['x0'] < x0 - 6 or w['x1'] > x1 + 6 for w in between)
            has_caption = any(re.match(r'^(?:Table|Tab\.|表|Figure|Fig\.|图)\b', w['text'], re.I) for w in between)
            if len(groups[-1]) >= 3 and (outside_text or has_caption):
                groups.append([r])
            else:
                groups[-1].append(r)
        for g in groups:
            if len(g) >= 3:
                bounds.append([min(l['x0'] for l in g), min(l['top'] for l in g) - 2,
                               max(l['x1'] for l in g), max(l['bottom'] for l in g) + 2])
    return bounds


def table_and_cell_bounds(page):
    tables = ruled_table_bounds(page)
    cells = []
    try:
        found = page.find_tables()
        for t in found:
            if len(t.rows) >= 1 and len(t.columns) >= 2:
                tables.append(list(t.bbox))
                for row in t.rows:
                    for c in row.cells:
                        if c:
                            cells.append(list(c))
    except Exception:
        pass
    return tables, cells


def page_lines(page, page_id):
    words = page.extract_words(x_tolerance=2, y_tolerance=2, keep_blank_chars=False)
    tables, cell_boxes = table_and_cell_bounds(page)
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
            cross_cell = False
            if prev and cell_boxes:
                prev_c = (prev['x0'] + prev['x1']) / 2
                word_c = (word['x0'] + word['x1']) / 2
                mid_y = (word['top'] + word['bottom']) / 2
                p_cell = next((c for c in cell_boxes if c[0] - 1 <= prev_c <= c[2] + 1 and c[1] - 1 <= mid_y <= c[3] + 1), None)
                w_cell = next((c for c in cell_boxes if c[0] - 1 <= word_c <= c[2] + 1 and c[1] - 1 <= mid_y <= c[3] + 1), None)
                if p_cell != w_cell:
                    cross_cell = True
            if prev and (cross_cell or word['x0'] - prev['x1'] > (4.8 if in_table else 14)):
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
            image_bounds = [
                [float(o['x0']), float(o['top']), float(o['x1']), float(o['bottom'])]
                for o in page.images
                if o['x1'] - o['x0'] > 6 and o['bottom'] - o['top'] > 6
            ]
            rect_bounds = []
            page_area = float(page.width * page.height)
            for o in page.rects:
                rw = float(o['x1'] - o['x0'])
                rh = float(o['bottom'] - o['top'])
                area = rw * rh
                if rw > 6 and rh > 6 and area < page_area * 0.95:
                    box = [float(o['x0']), float(o['top']), float(o['x1']), float(o['bottom'])]
                    inter_lines = sum(
                        1 for l in lines
                        if max(0, min(box[2], l['bbox'][2]) - max(box[0], l['bbox'][0])) *
                           max(0, min(box[3], l['bbox'][3]) - max(box[1], l['bbox'][1])) > 0
                    )
                    if inter_lines < 2 or area < page_area * 0.15:
                        rect_bounds.append(box)

            ir['pages'].append({'id': pid, 'number': number, 'width_pt': float(page.width),
                'height_pt': float(page.height), 'rotation': page.rotation, 'lines': lines,
                'visual_bounds': image_bounds + rect_bounds,
                'links': extract_links(page),
                'preview': str(preview), 'table_candidates': ruled_table_bounds(page) + [list(t.bbox) for t in page.find_tables()
                    if len(t.rows) >= 3 and len(t.rows[0].cells) >= 2]})
    from .table_geometry import discover_tables
    with pdfplumber.open(source) as pdf:
        for page, original in zip(ir['pages'], pdf.pages):
            page['native_tables'] = discover_tables(original, page['lines'], page['table_candidates'])
            if page['native_tables']:
                tables = page['native_tables']
                page['visual_bounds'] = [
                    b for b in page.get('visual_bounds', [])
                    if not any(t['bbox'][0] - 4 <= b[0] and b[2] <= t['bbox'][2] + 4
                               and t['bbox'][1] - 4 <= b[1] and b[3] <= t['bbox'][3] + 4
                               for t in tables)
                ]
    return ir
