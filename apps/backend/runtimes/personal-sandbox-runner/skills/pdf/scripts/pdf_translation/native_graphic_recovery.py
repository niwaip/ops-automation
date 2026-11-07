"""Recover isolated native graphics after model crop adjustments, preserving text ownership."""


def coverage(box, anchor):
    x0, y0, x1, y1 = box
    ax, ay, bx, by = anchor
    area = (bx - ax) * (by - ay)
    return (max(0, min(bx, x1) - max(ax, x0)) *
            max(0, min(by, y1) - max(ay, y0)) / area) if area > 0 else 0


def recover_native_graphics(nodes, page):
    """Only add an extracted graphic with unambiguous, conflict-free ownership.

    Never grow a model box across captions or remove body/table text to pass QA.
    Ambiguous anchors remain unresolved and are rejected by validate_regions.
    """
    lines = {line['id']: line for line in page['lines']}
    for anchor in page.get('visual_bounds', []):
        ax, ay, bx, by = anchor
        if bx - ax < 50 or by - ay < 15:
            continue
        if any(n['type'] in ('figure', 'formula') and coverage(n['bbox'], anchor) >= .95 for n in nodes):
            continue
        interior = {lid for lid, line in lines.items() if coverage(line['bbox'], anchor) > 0}
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
