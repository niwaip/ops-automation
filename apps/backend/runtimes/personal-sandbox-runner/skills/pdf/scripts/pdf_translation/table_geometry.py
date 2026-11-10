"""Recover ruled tables from native coordinates; never fill cells by list order."""
from collections import defaultdict
from copy import deepcopy
import re


def inside(box, line):
    x0, y0, x1, y1 = line['bbox']
    return box[0] <= (x0 + x1) / 2 <= box[2] and box[1] <= (y0 + y1) / 2 <= box[3]


def _columns(lines, bounds):
    intervals = []
    for line in sorted(lines, key=lambda item: item['bbox'][0]):
        left, _, right, _ = line['bbox']
        if intervals and left <= intervals[-1][1] + 5:
            intervals[-1][1] = max(right, intervals[-1][1])
        else:
            intervals.append([left, right])
    if not 2 <= len(intervals) <= 20:
        return None
    return [bounds[0], *[(a[1] + b[0]) / 2 for a, b in zip(intervals, intervals[1:])], bounds[2]]


def _is_compact_cell_token(text):
    clean = (text or '').strip()
    if not clean:
        return False
    if re.match(r'^[✓✔✗✘×√\d+\-±~<>≤≥$€£¥%]+', clean):
        return True
    words = clean.split()
    return len(words) <= 2 and len(clean) <= 16 and not clean.endswith(('.', ',', ';', ':'))


def discover_tables(pdf_page, lines, bounds):
    """Only claim captioned, ruled regions with unambiguous vertical gutters.

    Supports bordered/rect grid tables directly without paper-style captions,
    as well as captioned ruled paper tables. Horizontal rules delimit wrapped rows.
    Dense matrices additionally expose repeated baselines in at least three columns.
    Other layouts stay on the model path and must pass independent cell geometry validation.
    """
    tables, seen = [], set()

    # Strategy 1: Explicit grid tables from pdf_page.find_tables()
    # (contracts, forms, sheets, lists with rectangular cells)
    try:
        found_tables = pdf_page.find_tables()
    except Exception:
        found_tables = []

    for t in found_tables:
        if len(t.rows) < 2 or len(t.columns) < 2:
            continue
        if t.bbox[2] - t.bbox[0] < 50 or t.bbox[3] - t.bbox[1] < 20:
            continue
        col_edges = [round(t.bbox[0], 2), *[round(c.bbox[2], 2) for c in t.columns[:-1]], round(t.bbox[2], 2)]

        cells = []
        assigned = []
        ambiguous = False

        table_lines = [l for l in lines if not l.get('rotated') and inside(
            [t.bbox[0] - 2, t.bbox[1] - 2, t.bbox[2] + 2, t.bbox[3] + 2], l)]
        line_assigned = set()

        for r_idx, row in enumerate(t.rows):
            for c_idx, cell_box in enumerate(row.cells):
                if not cell_box:
                    cells.append(dict(row=r_idx, col=c_idx, rowspan=1, colspan=1, header=(r_idx == 0), line_ids=[]))
                    continue
                cell_lids = []
                for l in table_lines:
                    cx = (l['bbox'][0] + l['bbox'][2]) / 2
                    cy = (l['bbox'][1] + l['bbox'][3]) / 2
                    if (cell_box[0] - 2 <= cx <= cell_box[2] + 2 and cell_box[1] - 2 <= cy <= cell_box[3] + 2):
                        if l['bbox'][0] < cell_box[0] - 8 or l['bbox'][2] > cell_box[2] + 8:
                            ambiguous = True
                            break
                        cell_lids.append(l['id'])
                        line_assigned.add(l['id'])
                if ambiguous:
                    break
                cells.append(dict(row=r_idx, col=c_idx, rowspan=1, colspan=1, header=(r_idx == 0), line_ids=cell_lids))
                assigned.extend(cell_lids)
            if ambiguous:
                break

        if not ambiguous and len(line_assigned) == len(assigned) and assigned:
            key = tuple(sorted(assigned))
            if key not in seen:
                tables.append(dict(id=f'{pdf_page.page_number}_t{len(tables) + 1}', bbox=list(t.bbox),
                    column_edges=col_edges, row_count=len(t.rows),
                    cells=sorted(cells, key=lambda cell: (cell['row'], cell['col'])),
                    line_ids=assigned))
                seen.add(key)

    # Strategy 2: Captioned ruled tables (academic papers without explicit rect grids)
    has_caption = any(re.match(r'^(?:Table|Tab\.|表)\s*(?:\d+|[IVX]+|[一二三四五六七八九十]+)\s*[:：.\s]', line['text'].strip(), re.I)
                      for line in lines)
    if has_caption:
        all_rules = list(getattr(pdf_page, 'lines', []) or [])
        for r in getattr(pdf_page, 'rects', []) or []:
            if abs(r['bottom'] - r['top']) <= 2:
                all_rules.append({'top': r['top'], 'bottom': r['bottom'], 'x0': r['x0'], 'x1': r['x1']})
        for e in getattr(pdf_page, 'edges', []) or []:
            if e.get('orientation') == 'h' or abs(e['bottom'] - e['top']) <= 1:
                all_rules.append({'top': e['top'], 'bottom': e['bottom'], 'x0': e['x0'], 'x1': e['x1']})

        for box in bounds:
            rules = sorted({round(line['top'], 3) for line in all_rules
                if abs(line['bottom'] - line['top']) <= 2
                and abs(line['x0'] - box[0]) < 6 and abs(line['x1'] - box[2]) < 6
                and box[1] - 2 <= line['top'] <= box[3] + 2})
            if len(rules) < 3:
                continue
            region = [box[0], rules[0], box[2], rules[-1]]
            selected = [line for line in lines if not line.get('rotated') and inside(region, line)]
            key = tuple(sorted(line['id'] for line in selected))
            if not key or key in seen:
                continue
            edges = _columns(selected, region)
            if edges is None:
                continue
            buckets = defaultdict(list)
            for line in selected:
                center = (line['bbox'][0] + line['bbox'][2]) / 2
                col = next((i for i in range(len(edges) - 1) if edges[i] <= center < edges[i + 1]), None)
                if col is None or line['bbox'][0] < edges[col] - 1 or line['bbox'][2] > edges[col + 1] + 1:
                    break
                buckets[col].append(line)
            else:
                cells, row_offset = [], 0
                for band, (top, bottom) in enumerate(zip(rules, rules[1:])):
                    columns = {col: sorted([line for line in group
                        if top <= (line['bbox'][1] + line['bbox'][3]) / 2 < bottom],
                        key=lambda line: line['bbox'][1]) for col, group in buckets.items()}
                    dense = (sum(len(group) >= 2 for group in columns.values()) >= 3
                        and sum(len(group) >= 2 and all(_is_compact_cell_token(line['text'])
                                                       for line in group) for group in columns.values()) >= 2)
                    reference = max(columns.values(), key=len, default=[])
                    centers = [(line['bbox'][1] + line['bbox'][3]) / 2 for line in reference] if dense else []
                    # Multiple fragments on one baseline are ambiguous, not new rows.
                    if centers and any(b - a < 7 for a, b in zip(centers, centers[1:])):
                        break
                    count = len(centers) or 1
                    occupied = set()
                    for col in range(len(edges) - 1):
                        grouped = defaultdict(list)
                        for line in columns.get(col, []):
                            cy = (line['bbox'][1] + line['bbox'][3]) / 2
                            row = min(range(count), key=lambda i: abs(centers[i] - cy)) if centers else 0
                            grouped[row].append(line)
                        single = columns.get(col, [])
                        spanning = (dense and len(single) == 1 and
                            min(abs(c - (single[0]['bbox'][1] + single[0]['bbox'][3]) / 2) for c in centers) > 3.5)
                        if spanning:
                            grouped = {0: single}
                        for row, group in grouped.items():
                            span = count if spanning else 1
                            cells.append(dict(row=row_offset + row, col=col, rowspan=span, colspan=1,
                                header=band == 0, line_ids=[line['id'] for line in group]))
                            occupied.update((r, col) for r in range(row, row + span))
                        for row in range(count):
                            if (row, col) not in occupied:
                                cells.append(dict(row=row_offset + row, col=col, rowspan=1, colspan=1,
                                    header=band == 0, line_ids=[]))
                    row_offset += count
                else:
                    if row_offset < 2:
                        continue
                    tables.append(dict(id=f'{pdf_page.page_number}_t{len(tables) + 1}', bbox=region,
                        column_edges=edges, row_count=row_offset,
                        cells=sorted(cells, key=lambda cell: (cell['row'], cell['col'])),
                        line_ids=[line['id'] for line in selected]))
                    seen.add(key)
    return tables


def layout_candidates(page, candidates):
    """One immutable table anchor replaces dozens of model bookkeeping IDs."""
    tables = page.get('native_tables', [])
    table_lines = {lid for table in tables for lid in table['line_ids']}
    lines_by_id = {l['id']: l for l in page.get('lines', [])}
    result = []
    for candidate in candidates:
        remaining = [lid for lid in candidate['line_ids'] if lid not in table_lines]
        if not remaining:
            continue
        if len(remaining) != len(candidate['line_ids']):
            boxes = [lines_by_id[lid]['bbox'] for lid in remaining if lid in lines_by_id]
            cand_copy = dict(candidate)
            cand_copy['line_ids'] = remaining
            if boxes:
                cand_copy['bbox'] = [min(b[0] for b in boxes), min(b[1] for b in boxes),
                                     max(b[2] for b in boxes), max(b[3] for b in boxes)]
            cand_copy['text'] = ' '.join(lines_by_id[lid]['text'] for lid in remaining if lid in lines_by_id)
            result.append(cand_copy)
        else:
            result.append(candidate)
    result.extend(dict(id=table['id'], bbox=table['bbox'], text='Native table; cells already verified.',
        type_hint='table', column_hint=0, line_ids=table['line_ids']) for table in tables)
    return result


def expand_native_layout(data, candidates, page):
    """Keep immutable table regions out of generic figure/paragraph healing."""
    from .paragraph_candidates import expand_candidates
    tables = page['native_tables']
    owned = {lid for table in tables for lid in table['line_ids']}
    removed = {candidate['id'] for candidate in candidates
               if set(candidate['line_ids']).issubset(owned)}
    data = deepcopy(data)
    valid_blocks = [b for b in data.get('blocks', []) if isinstance(b, dict)]
    for block in valid_blocks:
        block['line_ids'] = [lid for lid in block.get('line_ids', []) if lid not in removed and lid not in owned]
        for cell in block.get('cells', []):
            if isinstance(cell, dict):
                cell['line_ids'] = [lid for lid in cell.get('line_ids', []) if lid not in removed and lid not in owned]
    data['blocks'] = [block for block in valid_blocks if block.get('line_ids')
                      or block.get('type') in ('figure', 'formula')]
    def table_region(box):
        return any(table['bbox'][0] - 4 <= box[0] and box[2] <= table['bbox'][2] + 4
                   and table['bbox'][1] - 4 <= box[1] and box[3] <= table['bbox'][3] + 4
                   for table in tables)
    compact = dict(page, native_tables=[], lines=[line for line in page['lines'] if line['id'] not in owned],
        table_candidates=[box for box in page['table_candidates'] if not table_region(box)],
        visual_bounds=[box for box in page.get('visual_bounds', []) if not table_region(box)])
    result = expand_candidates(data, [candidate for candidate in candidates if candidate['id'] not in removed], compact)
    lines = {line['id']: line for line in page['lines']}
    for table in tables:
        index = next((i for i, block in enumerate(result['blocks']) if min(
            (lines[lid]['bbox'][1] for lid in block.get('line_ids', []) if lid in lines),
            default=block.get('bbox', [0, 0, 0, 0])[1]) > table['bbox'][1]), len(result['blocks']))
        result['blocks'].insert(index, dict(type='table', column=0, bbox=table['bbox'],
            line_ids=list(table['line_ids']), cells=[]))
    return result


def restore_tables(blocks, page):
    """Use source cells even if the model splits, merges, or mislabels the anchor."""
    for table in page.get('native_tables', []):
        owned = set(table['line_ids'])
        positions = [index for index, block in enumerate(blocks) if owned.intersection(block.get('line_ids', []))]
        if not positions:
            index = next((i for i, b in enumerate(blocks) if b.get('bbox', [0, 0, 0, 0])[1] > table['bbox'][1]), len(blocks))
        else:
            index = min(positions)
        for block in blocks:
            block['line_ids'] = [lid for lid in block.get('line_ids', []) if lid not in owned]
            for cell in block.get('cells', []):
                cell['line_ids'] = [lid for lid in cell.get('line_ids', []) if lid not in owned]
        blocks.insert(index, dict(type='table', column=0, bbox=table['bbox'],
            native_table_id=table['id'], column_edges=table['column_edges'],
            line_ids=list(table['line_ids']), cells=deepcopy(table['cells'])))
    return [block for block in blocks if block.get('line_ids') or block['type'] in ('figure', 'formula')]


def validate_table(node, page):
    cells = node.get('cells', [])
    if not cells:
        raise ValueError('table has no cells')
    occupied = set()
    for cell in cells:
        row, col, rs, cs = [cell.get(key) for key in ('row', 'col', 'rowspan', 'colspan')]
        if any(type(value) is not int for value in (row, col, rs, cs)) or not (
                0 <= row < 200 and 0 <= col < 30 and 1 <= rs <= 200 and 1 <= cs <= 30):
            raise ValueError('invalid table cell coordinates')
        positions = {(r, c) for r in range(row, row + rs) for c in range(col, col + cs)}
        if occupied.intersection(positions):
            raise ValueError('overlapping table cells; cannot move text to another column')
        occupied.update(positions)
    width = max(col for _, col in occupied) + 1
    height = max(row for row, _ in occupied) + 1
    if len(occupied) != width * height:
        raise ValueError('table grid has missing cells or invented extra columns')
    headers = [cell for cell in cells if cell.get('header')]
    if headers and max(cell['col'] + cell['colspan'] for cell in headers) != width:
        raise ValueError('table body adds a column absent from the header')
    expected = next((table for table in page.get('native_tables', [])
                     if table['id'] == node.get('native_table_id')), None)
    if expected:
        keys = ('row', 'col', 'rowspan', 'colspan', 'header', 'line_ids')
        actual = [{key: cell[key] for key in keys} for cell in cells]
        if actual != expected['cells'] or node.get('column_edges') != expected['column_edges']:
            raise ValueError('table cell mapping differs from native row/column evidence')
    # Independent fallback checks also reject old corrupt IR without native anchors.
    lines = {line['id']: line for line in page.get('lines', [])}
    boxes = []
    for cell in cells:
        source = [lines[lid]['bbox'] for lid in cell['line_ids'] if lid in lines]
        if source:
            boxes.append((cell, [min(b[0] for b in source), min(b[1] for b in source),
                                 max(b[2] for b in source), max(b[3] for b in source)]))
    for index, (a, ab) in enumerate(boxes):
        for b, bb in boxes[index + 1:]:
            vertical_overlap = min(ab[3], bb[3]) - max(ab[1], bb[1])
            if a['col'] + a['colspan'] <= b['col'] and vertical_overlap > 2 and ab[2] > bb[0] + 4:
                raise ValueError('table columns contradict source geometry')
            if b['col'] + b['colspan'] <= a['col'] and vertical_overlap > 2 and bb[2] > ab[0] + 4:
                raise ValueError('table columns contradict source geometry')
            horizontal_overlap = min(ab[2], bb[2]) - max(ab[0], bb[0])
            if horizontal_overlap > 2:
                if a['row'] + a['rowspan'] <= b['row'] and ab[3] > bb[1] + 4:
                    raise ValueError('table rows contradict source geometry')
                if b['row'] + b['rowspan'] <= a['row'] and bb[3] > ab[1] + 4:
                    raise ValueError('table rows contradict source geometry')
