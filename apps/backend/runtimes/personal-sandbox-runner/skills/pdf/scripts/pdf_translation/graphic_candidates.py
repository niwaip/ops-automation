"""Reconcile native section anchors with graphic ownership before expanding crops."""
import re


def _visual_cluster_above(caption_box, page, min_top=0.0):
    visuals = [
        [min(b[0], b[2]), min(b[1], b[3]), max(b[0], b[2]), max(b[1], b[3])]
        for b in (page or {}).get('visual_bounds', [])
        if abs(b[2] - b[0]) > 40 and abs(b[3] - b[1]) > 12
    ]
    cx = (caption_box[0] + caption_box[2]) / 2
    seeds = [
        b for b in visuals
        if -5 <= caption_box[1] - b[3] <= 60 and b[1] >= min_top - 5
        and b[0] - 40 <= cx <= b[2] + 40
    ]
    if not seeds:
        return None
    seed = min(seeds, key=lambda b: abs(caption_box[1] - b[3]))
    cluster = list(seed)
    changed = True
    while changed:
        changed = False
        for b in visuals:
            if b[3] > caption_box[1] + 5 or b[1] < min_top - 5:
                continue
            horiz = min(cluster[2], b[2]) - max(cluster[0], b[0]) >= -15
            vert = min(cluster[3], b[3]) - max(cluster[1], b[1]) >= -25
            if horiz and vert:
                nxt = [min(cluster[0], b[0]), min(cluster[1], b[1]),
                       max(cluster[2], b[2]), max(cluster[3], b[3])]
                if nxt != cluster:
                    cluster = nxt
                    changed = True
    return cluster


def reconcile_graphic_candidates(blocks, candidates, page=None):
    by_id = {c['id']: c for c in candidates}
    detached = []
    for block in blocks:
        box = block.get('bbox')
        if isinstance(box, list) and len(box) == 4 and all(isinstance(v, (int, float)) for v in box):
            block['bbox'] = [min(box[0], box[2]), min(box[1], box[3]),
                             max(box[0], box[2]), max(box[1], box[3])]
    # Demote false captions that do not start with a Figure/Table caption prefix.
    for block in blocks:
        if block.get('type') == 'caption':
            owned = [by_id[c] for c in block.get('line_ids', []) if c in by_id]
            text = ' '.join(c['text'] for c in owned).strip()
            if owned and not re.match(r'^(?:Figure|Fig\.|Table|Tab\.|图|表)\s*\d+\s*[:.]?', text, re.I):
                block['type'] = 'paragraph'
    # A caption is text evidence, never a substitute for the image above it.
    for block in list(blocks):
        owned = [by_id[c] for c in block.get('line_ids', []) if c in by_id]
        if block.get('type') != 'figure' or not owned or not re.match(
                r'^(?:Figure|Fig\.)\s*\d+\s*[:.]', ' '.join(c['text'] for c in owned), re.I):
            continue
        caption_box = [min(c['bbox'][0] for c in owned), min(c['bbox'][1] for c in owned),
                       max(c['bbox'][2] for c in owned), max(c['bbox'][3] for c in owned)]
        cluster = _visual_cluster_above(caption_box, page)
        if cluster:
            caption = dict(block, type='caption', bbox=caption_box)
            block.update(line_ids=[], bbox=list(cluster))
            blocks.insert(blocks.index(block) + 1, caption)
    # Anchor Figure captions to the native visual cluster directly above them.
    if page and page.get('visual_bounds'):
        has_table_caption = any(
            re.match(r'^(?:Table|Tab\.|表)\s*\d+\s*[:.]', c.get('text', '').strip(), re.I)
            for c in candidates
        )
        fig_captions = sorted(
            [c for c in candidates if re.match(r'^(?:Figure|Fig\.)\s*\d+\s*[:.]', c.get('text', '').strip(), re.I)],
            key=lambda c: c['bbox'][1],
        )
        prev_bottom_by_col = {}
        for cap_cand in fig_captions:
            cid = cap_cand['id']
            col = cap_cand.get('column_hint', 0)
            min_top = prev_bottom_by_col.get(col, 0.0)
            cluster = _visual_cluster_above(cap_cand['bbox'], page, min_top=min_top)
            prev_bottom_by_col[col] = cap_cand['bbox'][3]
            if not cluster:
                continue
            # Ensure cid is in a caption block, not buried in figure/paragraph.
            has_cap_block = any(b.get('type') == 'caption' and cid in b.get('line_ids', []) for b in blocks)
            if not has_cap_block:
                for b in blocks:
                    if cid in b.get('line_ids', []):
                        b['line_ids'].remove(cid)
                blocks.append({'type': 'caption', 'line_ids': [cid],
                               'bbox': list(cap_cand['bbox']), 'column': col})
            # Reclassify false table/title blocks inside the figure visual cluster when page has no Table caption.
            if not has_table_caption:
                for b in blocks:
                    if b.get('type') in ('table', 'title'):
                        bb = b.get('bbox')
                        if bb and len(bb) == 4:
                            cx, cy = (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2
                            if cluster[0] - 10 <= cx <= cluster[2] + 10 and cluster[1] - 10 <= cy <= cluster[3] + 10:
                                b['type'] = 'figure'
                                b.pop('cells', None)
            # Find or merge figure blocks associated with this visual cluster.
            matched_figs = []
            for b in blocks:
                if b.get('type') != 'figure':
                    continue
                bb = b.get('bbox')
                if not bb or len(bb) != 4:
                    continue
                v_overlap = min(cluster[3], bb[3]) - max(cluster[1], bb[1])
                same_lane = (col == 0 or b.get('column', col) in (0, col)
                             or min(cluster[2], bb[2]) - max(cluster[0], bb[0]) > 0)
                if v_overlap > 0 and same_lane:
                    matched_figs.append(b)
            if matched_figs:
                primary = matched_figs[0]
                for extra in matched_figs[1:]:
                    for x in extra.get('line_ids', []):
                        if x not in primary.setdefault('line_ids', []):
                            primary['line_ids'].append(x)
                    if extra in blocks:
                        blocks.remove(extra)
                primary['bbox'] = list(cluster)
    for block in list(blocks):
        if block.get('type') not in ('figure', 'formula'):
            continue
        box = block.get('bbox')
        if not isinstance(box, list) or len(box) != 4:
            continue
        for cid in list(block.get('line_ids', [])):
            candidate = by_id.get(cid)
            if candidate is None:
                block['line_ids'].remove(cid)
                continue
            b = candidate['bbox']
            section = re.match(r'^\d+(?:\.\d+)*\s+[A-Z]', candidate.get('text', ''))
            is_fig_cap = re.match(r'^(?:Figure|Fig\.|Table|Tab\.)\s*\d+\s*[:.]', candidate.get('text', '').strip(), re.I)
            separated = b[1] > box[3] + 12 or b[3] < box[1] - 12
            if is_fig_cap and b[1] >= box[3] - 4:
                block['line_ids'].remove(cid)
                detached.append({'type': 'caption', 'line_ids': [cid], 'bbox': list(b),
                                 'column': candidate.get('column_hint', 0)})
            elif separated:
                block['line_ids'].remove(cid)
                if section:
                    detached.append({'type': 'heading', 'line_ids': [cid], 'bbox': list(b),
                                     'column': candidate.get('column_hint', 0)})
        # Include assigned edge labels before finding all interior labels. The
        # reverse order misses labels just outside an underestimated frame.
        assigned = [by_id[c]['bbox'] for c in block.get('line_ids', []) if c in by_id]
        if assigned:
            block['bbox'] = [min(box[0], min(b[0] for b in assigned)),
                             min(box[1], min(b[1] for b in assigned)),
                             max(box[2], max(b[2] for b in assigned)),
                             max(box[3], max(b[3] for b in assigned))]
        box = block['bbox']
        # Native image/rectangle extents include borders and bars that have no
        # extractable characters. A text-only union would truncate those paths.
        anchors = [b for b in (page or {}).get('visual_bounds', [])
            if box[0] <= (b[0] + b[2]) / 2 <= box[2]
            and box[1] <= (b[1] + b[3]) / 2 <= box[3]]
        if anchors:
            block['bbox'] = [min(box[0], min(b[0] for b in anchors)),
                             min(box[1], min(b[1] for b in anchors)),
                             max(box[2], max(b[2] for b in anchors)),
                             max(box[3], max(b[3] for b in anchors))]
    for item in detached:
        cid = item['line_ids'][0]
        if any(cid in b.get('line_ids', []) for b in blocks):
            continue
        key = (item['column'], item['bbox'][1], item['bbox'][0])
        def position_key(block):
            native = [by_id[c] for c in block.get('line_ids', []) if c in by_id]
            if native and block.get('type') not in ('figure', 'formula'):
                first = min(native, key=lambda c: (c.get('column_hint', 0), c['bbox'][1], c['bbox'][0]))
                return (block.get('column', 0), first['bbox'][1], first['bbox'][0])
            return (block.get('column', 0), block['bbox'][1], block['bbox'][0])
        position = next((i for i, b in enumerate(blocks)
            if isinstance(b.get('bbox'), list) and
            position_key(b) > key), len(blocks))
        blocks.insert(position, item)
    return blocks
