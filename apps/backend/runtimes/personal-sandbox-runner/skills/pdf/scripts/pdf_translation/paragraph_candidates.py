"""Geometric grouping reduces VLM bookkeeping without discarding native evidence."""
from collections import defaultdict
import re


def contains(box, line):
    b = line['bbox']
    return box[0] <= (b[0] + b[2]) / 2 <= box[2] and box[1] <= (b[1] + b[3]) / 2 <= box[3]


def compute_page_bands(page):
    if not page:
        return [0.0, 99999.0]
    w, h = page.get('width_pt', 600), page.get('height_pt', 800)
    mid = w / 2
    spanning_boxes = []
    for box in page.get('visual_bounds', []) + page.get('table_candidates', []) + [t['bbox'] for t in page.get('native_tables', [])]:
        if (box[2] - box[0]) > w * 0.48 or (box[0] < mid - 20 and box[2] > mid + 20):
            spanning_boxes.append((box[1], box[3]))
    for l in page.get('lines', []):
        box = l['bbox']
        if (box[2] - box[0]) > w * 0.48 or (box[0] < mid - 20 and box[2] > mid + 20):
            spanning_boxes.append((box[1], box[3]))
    spanning_boxes.sort()
    merged = []
    for y0, y1 in spanning_boxes:
        if not merged:
            merged.append([y0, y1])
        else:
            if y0 <= merged[-1][1] + 5:
                merged[-1][1] = max(merged[-1][1], y1)
            else:
                merged.append([y0, y1])
    cuts = [0.0]
    for y0, y1 in merged:
        cuts.extend([y0 - 2, y1 + 2])
    cuts.append(h + 10)
    return sorted(list(dict.fromkeys(cuts)))


def band_index(cuts, box):
    if not cuts or len(cuts) <= 1:
        return 0
    cy = (box[1] + box[3]) / 2
    for idx in range(len(cuts) - 1):
        if cuts[idx] <= cy < cuts[idx + 1]:
            return idx
    return len(cuts) - 1


def candidate_lines(page):
    mid = page['width_pt'] / 2
    ordinary = [l for l in page['lines'] if not l.get('rotated')]

    native_table_lids = {lid for t in page.get('native_tables', []) for lid in t.get('line_ids', [])}
    body_ordinary = [l for l in ordinary if l['id'] not in native_table_lids]
    left = [l for l in body_ordinary if page['width_pt'] * .04 < l['bbox'][0] and l['bbox'][2] < mid]
    right = [l for l in body_ordinary if l['bbox'][0] > mid and l['bbox'][2] < page['width_pt'] * .95]
    columns = 2 if len(left) >= 6 and len(right) >= 6 else 1

    lanes = defaultdict(list)
    for line in ordinary:
        box = line['bbox']
        column = (1 if box[2] < mid else 2 if box[0] > mid else 0) if columns == 2 else 1
        lanes[column].append(line)
    groups = []
    for column, lines in sorted(lanes.items()):
        group = []
        for line in sorted(lines, key=lambda l: (l['bbox'][1], l['bbox'][0])):
            b = line['bbox']
            previous = group[-1]['bbox'] if group else None
            grid = any(contains(box, line) for box in page['table_candidates'])
            separate = not group or column == 0 or grid
            if previous:
                height, old_height = b[3] - b[1], previous[3] - previous[1]
                separate |= (b[1] - previous[3] > 5 or b[1] < previous[3] - 3
                             or abs(height - old_height) > 1.5
                             or (b[0] - min(l['bbox'][0] for l in group) > 6 and
                                 group[-1]['text'].rstrip().endswith(('.', ':', ';')))
                             or sum(len(l['text']) for l in group) > 1000)
            if separate and group:
                groups.append((column, group))
                group = []
            group.append(line)
            if grid:
                groups.append((column, group))
                group = []
        if group:
            groups.append((column, group))
    rotated = [l for l in page['lines'] if l.get('rotated')]
    if rotated:
        groups.append((0, rotated))
    result = []
    for index, (column, lines) in enumerate(groups):
        boxes = [l['bbox'] for l in lines]
        result.append({'id': f'{page["id"]}_g{index + 1}',
            'text': '\n'.join(l['text'] for l in lines), 'column_hint': column,
            'type_hint': 'furniture' if all(l.get('rotated') for l in lines) else 'unknown',
            'line_ids': [l['id'] for l in lines],
            'bbox': [min(b[0] for b in boxes), min(b[1] for b in boxes),
                     max(b[2] for b in boxes), max(b[3] for b in boxes)]})
    return result


def expand_candidates(data, candidates, page=None):
    if page and page.get('native_tables'):
        from .table_geometry import expand_native_layout
        return expand_native_layout(data, candidates, page)
    mapping = {g['id']: g['line_ids'] for g in candidates}
    c_by_id = {g['id']: g for g in candidates}
    native_to_cand = {lid: g['id'] for g in candidates for lid in g['line_ids']}
    page_w = page['width_pt'] if page else 600
    page_h = page['height_pt'] if page else 800

    blocks = data.get('blocks', [])

    # 1. 规范化候选 ID：如果模型误填原生 line_id，自动映射回 candidate_id
    for block in blocks:
        norm_ids = []
        for x in block.get('line_ids', []):
            if x in mapping:
                norm_ids.append(x)
            elif x in native_to_cand:
                cid = native_to_cand[x]
                if cid not in norm_ids:
                    norm_ids.append(cid)
        block['line_ids'] = norm_ids

    from .graphic_candidates import reconcile_graphic_candidates
    blocks = reconcile_graphic_candidates(blocks, candidates, page)

    # 2. 图形/公式自愈与边界裁切：
    # 避免图形 crop 错误包含外部标题/说明文字，并将真正处于图形内部的候选文字吸收归属
    for block in blocks:
        if block.get('type') in ('figure', 'formula'):
            fbox = block.get('bbox')
            if not fbox or len(fbox) != 4:
                continue
            # 若 figure 范围与 table、caption 冲突，裁剪边界避免侵入
            for other in blocks:
                if other is block:
                    continue
                other_cids = [c for c in other.get('line_ids', []) if c in c_by_id]
                if not other_cids:
                    continue
                min_y = min(c_by_id[c]['bbox'][1] for c in other_cids)
                max_y = max(c_by_id[c]['bbox'][3] for c in other_cids)
                if other.get('type') == 'caption' and min_y > fbox[1] + (fbox[3] - fbox[1]) * 0.6 and min_y <= fbox[3]:
                    fbox[3] = min_y - 1
                elif other.get('type') == 'table' and min_y <= fbox[3] and max_y >= fbox[1]:
                    if min_y < (fbox[1] + fbox[3]) / 2:
                        fbox[1] = max_y + 1
                    else:
                        fbox[3] = min_y - 1

            # 吸收处于图形内部的所有文字候选（表格/说明文字除外）
            for cand in candidates:
                cb = cand['bbox']
                cx, cy = (cb[0] + cb[2]) / 2, (cb[1] + cb[3]) / 2
                if fbox[0] - 2 <= cx <= fbox[2] + 2 and fbox[1] - 2 <= cy <= fbox[3] + 2:
                    in_table_or_caption = any(cand['id'] in other.get('line_ids', []) for other in blocks if other.get('type') in ('table', 'caption'))
                    if in_table_or_caption:
                        continue
                    if cand['id'] not in block['line_ids']:
                        block['line_ids'].append(cand['id'])
                        for other in blocks:
                            if other is not block and cand['id'] in other.get('line_ids', []):
                                other['line_ids'].remove(cand['id'])

            # 确保图形 bbox 完整包容其归属的所有文字行
            if block['line_ids']:
                line_boxes = [c_by_id[c]['bbox'] for c in block['line_ids'] if c in c_by_id]
                if line_boxes:
                    fbox[0] = min(fbox[0], min(b[0] for b in line_boxes))
                    fbox[1] = min(fbox[1], min(b[1] for b in line_boxes))
                    fbox[2] = max(fbox[2], max(b[2] for b in line_boxes))
                    fbox[3] = max(fbox[3], max(b[3] for b in line_boxes))

    # 2.5 矢量图表与表格检测自愈：对齐 PyMuPDF 真实检测的矢量框
    if page and page.get('table_candidates'):
        for tc in page['table_candidates']:
            tc_cx, tc_cy = (tc[0] + tc[2]) / 2, (tc[1] + tc[3]) / 2
            matched = False
            for b in blocks:
                if b.get('type') in ('figure', 'table'):
                    box = b.get('bbox')
                    if box and box[0] - 5 <= tc_cx <= box[2] + 5 and box[1] - 5 <= tc_cy <= box[3] + 5:
                        matched = True
                        break
            if not matched:
                for b in blocks:
                    if b.get('type') in ('figure', 'table'):
                        b_lines = [c_by_id[c]['bbox'] for c in b.get('line_ids', []) if c in c_by_id]
                        if any(tc[0] - 5 <= (lb[0]+lb[2])/2 <= tc[2] + 5 and tc[1] - 5 <= (lb[1]+lb[3])/2 <= tc[3] + 5 for lb in b_lines):
                            b['bbox'] = [min(b['bbox'][0], tc[0]), min(b['bbox'][1], tc[1]),
                                         max(b['bbox'][2], tc[2]), max(b['bbox'][3], tc[3])]
                            matched = True
                            break
            if not matched:
                blocks.append({'type': 'figure', 'bbox': list(tc), 'line_ids': [],
                               'column': 0 if tc[2] - tc[0] > (page_w / 2) else (1 if tc[2] < (page_w / 2) else 2)})

    # 剔除已被图形完全吸收并变为空的块
    blocks = [b for b in blocks if b.get('line_ids') or b.get('type') in ('figure', 'formula')]
    data['blocks'] = blocks

    # 3. 候选 ID 去重：去除块内重复，跨块重复按几何距离归并到最匹配的块
    for block in blocks:
        block['line_ids'] = list(dict.fromkeys(block.get('line_ids', [])))

    cand_counts = defaultdict(list)
    for b_idx, block in enumerate(blocks):
        for cid in block.get('line_ids', []):
            cand_counts[cid].append(b_idx)
    for cid, b_indices in cand_counts.items():
        if len(b_indices) > 1:
            cand = c_by_id[cid]
            cx, cy = (cand['bbox'][0] + cand['bbox'][2]) / 2, (cand['bbox'][1] + cand['bbox'][3]) / 2
            def dist_score(idx):
                b = blocks[idx]
                box = b.get('bbox')
                if not box or len(box) != 4:
                    return 999999
                if box[0] <= cx <= box[2] and box[1] <= cy <= box[3]:
                    return (box[2] - box[0]) * (box[3] - box[1]) - 1e9
                bx, by = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
                return (cx - bx) ** 2 + (cy - by) ** 2
            best_idx = min(b_indices, key=dist_score)
            for idx in b_indices:
                if idx != best_idx:
                    blocks[idx]['line_ids'] = [x for x in blocks[idx]['line_ids'] if x != cid]

    for block in blocks:
        block['line_ids'] = list(dict.fromkeys(block.get('line_ids', [])))

    # 4. 几何包围自愈：若未分配候选落在某个 block 内，自动归入
    seen = {cid for b in blocks for cid in b.get('line_ids', [])}
    missing = set(mapping) - seen
    if page is None and missing:
        raise ValueError('missing/duplicate candidate IDs: ' + str(sorted(missing)))
    for gid in list(missing):
        cand = c_by_id[gid]
        cb = cand['bbox']
        cx, cy = (cb[0] + cb[2]) / 2, (cb[1] + cb[3]) / 2
        matching = []
        for b in blocks:
            box = b.get('bbox')
            if box and len(box) == 4 and box[0] - 2 <= cx <= box[2] + 2 and box[1] - 2 <= cy <= box[3] + 2:
                matching.append(b)
        if matching:
            target = min(matching, key=lambda b: (b['bbox'][2] - b['bbox'][0]) * (b['bbox'][3] - b['bbox'][1]))
            target.setdefault('line_ids', []).append(gid)
            seen.add(gid)
            missing.remove(gid)

    # 5. 孤立遗漏自愈：为模型偶然遗漏的小标题、孤立段落或边角装饰生成独立 block 并按阅读序插值
    cuts = compute_page_bands(page)

    def get_block_pos(b):
        cids = b.get('line_ids', [])
        valid_cids = [c for c in cids if c in c_by_id]
        if valid_cids:
            c = c_by_id[valid_cids[0]]
            b_idx = band_index(cuts, c['bbox'])
            return (b_idx, c.get('column_hint', 0), c['bbox'][1], c['bbox'][0])
        box = b.get('bbox', [0, 0, 0, 0])
        b_idx = band_index(cuts, box)
        return (b_idx, b.get('column', 0), box[1], box[0])

    for gid in sorted(missing):
        cand = c_by_id[gid]
        cb = cand['bbox']
        text = cand.get('text', '').strip()
        is_single_short = len(cand.get('line_ids', [])) == 1 and len(text) <= 80 and (cb[3] - cb[1]) <= 18
        if cand.get('type_hint') == 'furniture' or (is_single_short and (cb[3] < page_h * 0.075 or cb[1] > page_h * 0.925)):
            btype = 'furniture'
        elif re.fullmatch(r'[\d\s*†‡§¶.,()]+', text):
            btype = 'footnote'
        elif re.match(r'^(?:Table|Tab\.|Figure|Fig\.|表|图)\s*(?:\d+|[IVX]+|[A-Z])\s*[:：.\s]', text, re.I):
            btype = 'caption'
        elif re.match(r'^(?:[0-9]+(?:\.[0-9]+)*\s+[A-Z]|Abstract|Introduction|References?|Conclusion|Related Work)', text):
            btype = 'heading'
        elif len(text) < 80 and not text.endswith(('.', '。', ';', '；')) and not re.match(r'^(?:[\d*†‡§¶]+\s*)?(?:See\b|https?://)', text, re.I):
            btype = 'heading'
        else:
            btype = 'paragraph'
        new_block = {
            'type': btype,
            'line_ids': [gid],
            'bbox': list(cb),
            'column': cand.get('column_hint', 0)
        }
        new_pos = get_block_pos(new_block)
        inserted = False
        for idx, b in enumerate(blocks):
            b_pos = get_block_pos(b)
            if new_pos < b_pos:
                blocks.insert(idx, new_block)
                inserted = True
                break
        if not inserted:
            blocks.append(new_block)

    # 6. 最终候选行映射与表格多单元格补全
    for block in blocks:
        if block.get('type') == 'table':
            native_ids = {table['id'] for table in (page or {}).get('native_tables', [])}
            if native_ids.intersection(block.get('line_ids', [])):
                block['line_ids'] = [lid for cid in block['line_ids'] for lid in mapping.get(cid, [])]
                block['cells'] = []  # materialize_page restores immutable native cells
                continue
            assigned = []
            for cell in block.get('cells', []):
                ids = cell.get('line_ids', [])
                if not isinstance(ids, list):
                    raise ValueError('table cell IDs must be a list')
                normalized = [cid if cid in mapping else native_to_cand.get(cid) for cid in ids]
                if any(cid is None for cid in normalized):
                    raise ValueError('unknown table cell source ID')
                if len(set(normalized)) != len(normalized):
                    raise ValueError('duplicate candidate in table cell')
                assigned.extend(normalized)
                cell['line_ids'] = [lid for cid in normalized for lid in mapping[cid]]
            if len(assigned) != len(set(assigned)) or set(assigned) != set(block.get('line_ids', [])):
                raise ValueError('table cell ownership missing or duplicate; do not fill arbitrary cells')
            block['line_ids'] = [lid for cid in assigned for lid in mapping[cid]]

        else:
            ids = block.get('line_ids', [])
            cols = {c_by_id[x].get('column_hint', 0) for x in ids if x in c_by_id}
            if len(cols) > 1:
                ids.sort(key=lambda x: (c_by_id[x].get('column_hint', 0), c_by_id[x]['bbox'][1], c_by_id[x]['bbox'][0]))
            else:
                ids.sort(key=lambda x: (c_by_id[x]['bbox'][1], c_by_id[x]['bbox'][0]))
            block['line_ids'] = [lid for gid in ids for lid in mapping[gid]]

    # 7. 全局 line_id 强一致性去重保证：确保整页每个 line_id 出现且仅出现一次
    assigned_counts = defaultdict(list)
    for b_idx, block in enumerate(blocks):
        block['line_ids'] = list(dict.fromkeys(block.get('line_ids', [])))
        for lid in block['line_ids']:
            assigned_counts[lid].append(b_idx)
    lines_dict = {l['id']: l for l in page['lines']} if page else {}
    for lid, b_indices in assigned_counts.items():
        if len(b_indices) > 1:
            line = lines_dict.get(lid)
            lx = (line['bbox'][0] + line['bbox'][2]) / 2 if line else 0
            ly = (line['bbox'][1] + line['bbox'][3]) / 2 if line else 0
            def line_dist(idx):
                b = blocks[idx]
                box = b.get('bbox', [0, 0, 0, 0])
                if box[0] <= lx <= box[2] and box[1] <= ly <= box[3]:
                    return (box[2] - box[0]) * (box[3] - box[1]) - 1e9
                bx, by = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
                return (lx - bx) ** 2 + (ly - by) ** 2
            best_idx = min(b_indices, key=line_dist)
            for idx in b_indices:
                if idx != best_idx:
                    blocks[idx]['line_ids'] = [x for x in blocks[idx]['line_ids'] if x != lid]
                    if blocks[idx].get('type') == 'table':
                        for cell in blocks[idx].get('cells', []):
                            cell['line_ids'] = [x for x in cell.get('line_ids', []) if x != lid]

    # 8. 剔除去重后变为空的非图形/非公式文本块
    blocks = [b for b in blocks if b.get('line_ids') or b.get('type') in ('figure', 'formula')]
    data['blocks'] = blocks

    return data
