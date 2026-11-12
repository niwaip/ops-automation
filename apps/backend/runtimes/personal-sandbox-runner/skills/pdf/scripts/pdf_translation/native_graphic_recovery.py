"""Recover isolated native graphics after model crop adjustments, preserving text ownership."""


def coverage(box, anchor):
    x0, y0, x1, y1 = box
    ax, ay, bx, by = anchor
    area = (bx - ax) * (by - ay)
    return (max(0, min(bx, x1) - max(ax, x0)) *
            max(0, min(by, y1) - max(ay, y0)) / area) if area > 0 else 0


def recover_native_graphics(nodes, page):
    """Only add an extracted graphic with unambiguous, conflict-free ownership.

    Snap model-predicted figure boxes to true physical native graphic bounds
    when there is substantial intersection, preventing boundary drift into text.
    Never grow a model box across captions or remove body/table text to pass QA.
    Ambiguous anchors remain unresolved and are rejected by validate_regions.
    """
    lines = {line['id']: line for line in page['lines']}
    tables = page.get('native_tables', [])
    for raw_anchor in page.get('visual_bounds', []):
        ax = max(0.0, min(page['width_pt'], raw_anchor[0]))
        ay = max(0.0, min(page['height_pt'], raw_anchor[1]))
        bx = max(0.0, min(page['width_pt'], raw_anchor[2]))
        by = max(0.0, min(page['height_pt'], raw_anchor[3]))
        anchor = [ax, ay, bx, by]
        anchor_area = (bx - ax) * (by - ay)
        if bx - ax < 50 or by - ay < 15:
            continue
        if any(t['bbox'][0] - 4 <= ax and bx <= t['bbox'][2] + 4 and t['bbox'][1] - 4 <= ay and by <= t['bbox'][3] + 4 for t in tables):
            continue
        if any(n['type'] == 'table' and coverage(n['bbox'], anchor) >= .95 for n in nodes):
            continue

        interior = {lid for lid, line in lines.items() if coverage(line['bbox'], anchor) > 0}
        # Background panels enclosing body text are layout containers, not standalone graphics
        if len(interior) >= 2:
            continue

        # Snap model-predicted figure boxes to true physical native graphic bounds
        # when there is substantial intersection, preventing boundary drift into text.
        snapped = False
        for n in nodes:
            if n['type'] in ('figure', 'formula') and 'bbox' in n:
                x0, y0, x1, y1 = n['bbox']
                n_area = (x1 - x0) * (y1 - y0)
                inter_w = max(0.0, min(x1, bx) - max(x0, ax))
                inter_h = max(0.0, min(y1, by) - max(y0, ay))
                if inter_w > 0 and inter_h > 0 and n_area > 0 and anchor_area > 0:
                    inter_area = inter_w * inter_h
                    ratio_n = inter_area / n_area
                    ratio_a = inter_area / anchor_area
                    if (ratio_n >= 0.45 or ratio_a >= 0.45 or (ratio_n >= 0.25 and ratio_a >= 0.25)) and not interior:
                        n['bbox'] = list(anchor)
                        n['column'] = 0 if (bx - ax) > page['width_pt'] / 2 else (1 if bx <= page['width_pt'] / 2 else 2)
                        snapped = True
                        break
        if snapped:
            continue

        if any(n['type'] in ('figure', 'formula') and coverage(n['bbox'], anchor) >= .95 for n in nodes):
            continue
        # Recover only text-free native images. Any intersecting native text
        # (including a partial label) requires explicit layout ownership first.
        if interior:
            continue
        column = 0 if ax < page['width_pt'] / 2 < bx else (1 if bx <= page['width_pt'] / 2 else 2)
        node = {'id': f'{page["id"]}_b{len(nodes) + 1}', 'page_id': page['id'],
                'type': 'figure', 'line_ids': [], 'bbox': list(anchor), 'column': column,
                'text': '', 'continues_previous': False, 'geometry_origin': 'native_graphic'}
        position = next((i for i, n in enumerate(nodes)
                         if (n['column'], n['bbox'][1], n['bbox'][0]) > (column, ay, ax)), len(nodes))
        nodes.insert(position, node)
    return nodes
